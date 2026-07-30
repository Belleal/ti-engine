/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Content repository -- THE query layer. Every content surface (path resolution, listings, archives, feeds, counts,
 * prev/next, featured-by-id) goes through here so visibility filtering is applied exactly once and no call site can
 * forget it (CLAUDE.md 2). Wraps the loader's index; holds no state of its own beyond the viewer passed per call.
 *
 * Visibility resolves to one of three outcomes for a (record, viewer):
 *   - visible : `public`, or the viewer holds the required access.
 *   - gated   : a recognised restriction the viewer lacks -- the record stays listable as a teaser, its body is
 *               served only behind sign-in (and rendered noindex / kept out of the sitemap by the render layer).
 *   - hidden  : missing, unrecognised, or `role:__none__` visibility -- deny-all, nobody (admins included). Appears
 *               in no surface; a direct path 404s. Enforced here as defense-in-depth even though schema + loader
 *               already exclude a no-visibility record.
 *
 * Drafts (`status !== "published"`) are excluded from every public surface; editorial preview is deferred.
 */

// The reserved role name that encodes deny-all (Site/docs/content-schemas.md §1 uses `role:__none__`).
const DENY_ROLE = "__none__";

const EMPTY_INDEX = { byId: new Map(), byPath: new Map(), byAlias: new Map(), byType: new Map(), all: [] };

/**
 * @typedef {{ authenticated: boolean, roles: string[] }} Viewer  A null/undefined viewer is treated as anonymous.
 * @typedef {{ record: Object, verdict: string }} ServedItem  verdict is "visible" or "gated".
 */

class ContentRepository {

    #index;

    /**
     * @param {import("./loader.js").ContentIndex} index  The index built by the loader; defaults to empty.
     */
    constructor( index ) {
        this.#index = index || EMPTY_INDEX;
    }

    /* Public interface */

    /**
     * Resolves a request path for a viewer.
     *
     * @param {string} path
     * @param {Viewer} [viewer]
     * @returns {{ outcome: string, record?: Object, redirectTo?: string }} outcome is
     *          "visible" | "gated" (a hit, with `record`), "alias" (with `redirectTo`), or "miss".
     */
    resolve( path, viewer ) {
        const record = this.#index.byPath.get( path );
        if ( record ) {
            if ( ContentRepository.#isPublished( record ) === false ) {
                return { outcome: "miss" };
            }
            const verdict = ContentRepository.resolveVisibility( record, viewer );
            return verdict === "hidden" ? { outcome: "miss" } : { outcome: verdict, record: record };
        }
        // An alias must clear the same gate as a direct hit. Redirecting to an unpublished or hidden record would
        // confirm it exists and disclose its canonical path -- the leak this class exists to prevent. A *gated*
        // target still redirects, because the target then renders its own gate.
        const aliased = this.#index.byAlias.get( path );
        if ( aliased && ContentRepository.#servedItem( aliased, viewer ) ) {
            return { outcome: "alias", redirectTo: aliased.path };
        }
        return { outcome: "miss" };
    }

    /**
     * Lists the records a viewer may see for the given criteria, as `{ record, verdict }` items (visible or gated),
     * excluding hidden and unpublished records.
     *
     * @param {{ type?: string, world?: string, form?: string, lang?: string, sort?: string, offset?: number, limit?: number }} [criteria]
     * @param {Viewer} [viewer]
     * @returns {ServedItem[]}
     */
    list( criteria, viewer ) {
        const c = criteria || {};

        let records;
        if ( c.type ) {
            records = this.#index.byType.has( c.type ) ? this.#index.byType.get( c.type ).slice() : [];
        } else {
            records = this.#index.all.slice();
        }
        records = records.filter( ( record ) => {
            if ( c.world && record.world !== c.world ) {
                return false;
            }
            if ( c.form && record.form !== c.form ) {
                return false;
            }
            if ( c.lang && record.lang !== c.lang ) {
                return false;
            }
            return true;
        } );

        const items = [];
        for ( const record of records ) {
            const item = ContentRepository.#servedItem( record, viewer );
            if ( item ) {
                items.push( item );
            }
        }

        ContentRepository.#sortItems( items, c.sort );

        const offset = ( Number.isInteger( c.offset ) && c.offset > 0 ) ? c.offset : 0;
        const fromOffset = offset > 0 ? items.slice( offset ) : items;
        return ( Number.isInteger( c.limit ) && c.limit >= 0 ) ? fromOffset.slice( 0, c.limit ) : fromOffset;
    }

    /**
     * Counts the records a viewer may see for the given criteria (same filter as {@link ContentRepository#list},
     * ignoring offset/limit).
     *
     * @param {Object} [criteria]
     * @param {Viewer} [viewer]
     * @returns {number}
     */
    count( criteria, viewer ) {
        const c = Object.assign( {}, criteria );
        delete c.offset;
        delete c.limit;
        return this.list( c, viewer ).length;
    }

    /**
     * Resolves a single record by id, or null if it is hidden, unpublished, or unknown to this viewer.
     *
     * @param {string} id
     * @param {Viewer} [viewer]
     * @returns {ServedItem|null}
     */
    getById( id, viewer ) {
        const record = this.#index.byId.get( id );
        return record ? ContentRepository.#servedItem( record, viewer ) : null;
    }

    /**
     * Resolves a curated list of ids (e.g. a `featured` section) for a viewer, in the given order, dropping any that
     * are hidden/unpublished/unknown and keeping gated ones (rendered as teasers). This is why a hand-picked id list
     * cannot leak a gated or unpublished record -- it resolves through the same filter as everything else.
     *
     * @param {string[]} ids
     * @param {Viewer} [viewer]
     * @returns {ServedItem[]}
     */
    resolveIds( ids, viewer ) {
        const items = [];
        for ( const id of ( Array.isArray( ids ) ? ids : [] ) ) {
            const item = this.getById( id, viewer );
            if ( item ) {
                items.push( item );
            }
        }
        return items;
    }

    /* Static interface */

    /**
     * Resolves a record's visibility for a viewer based solely on the `visibility` field: "visible" | "gated" |
     * "hidden". Pure and static; exposed for unit testing. Deny-by-default: a missing, unrecognised, empty, or
     * `role:__none__` visibility is "hidden" -- nobody, admins included (there is no implicit role hierarchy).
     *
     * @method
     * @static
     * @param {Object} record
     * @param {Viewer} [viewer]
     * @returns {string}
     * @public
     */
    static resolveVisibility( record, viewer ) {
        const visibility = record ? record.visibility : undefined;
        if ( visibility === "public" ) {
            return "visible";
        }
        if ( visibility === "authenticated" ) {
            return ( viewer && viewer.authenticated ) ? "visible" : "gated";
        }
        if ( typeof visibility === "string" && visibility.indexOf( "role:" ) === 0 ) {
            const role = visibility.slice( "role:".length );
            if ( role === "" || role === DENY_ROLE ) {
                return "hidden";
            }
            const roles = ( viewer && Array.isArray( viewer.roles ) ) ? viewer.roles : [];
            return roles.indexOf( role ) !== -1 ? "visible" : "gated";
        }
        return "hidden";
    }

    /* Private static interface */

    /**
     * @param {Object} record
     * @returns {boolean}
     */
    static #isPublished( record ) {
        return !!record && record.status === "published";
    }

    /**
     * A record served on a listing surface: published AND not hidden. Returns a {@link ServedItem} or null.
     *
     * @param {Object} record
     * @param {Viewer} [viewer]
     * @returns {ServedItem|null}
     */
    static #servedItem( record, viewer ) {
        if ( ContentRepository.#isPublished( record ) === false ) {
            return null;
        }
        const verdict = ContentRepository.resolveVisibility( record, viewer );
        return verdict === "hidden" ? null : { record: record, verdict: verdict };
    }

    /**
     * Sorts items in place. Only `recent` is defined for now (most recent first by `publishedAt`, an ISO-8601 string
     * that sorts lexicographically); any other value leaves registration order untouched.
     *
     * @param {ServedItem[]} items
     * @param {string} [sort]
     */
    static #sortItems( items, sort ) {
        if ( sort === "recent" ) {
            items.sort( ( a, b ) => {
                const pa = a.record.publishedAt || "";
                const pb = b.record.publishedAt || "";
                if ( pa === pb ) {
                    return 0;
                }
                return pa < pb ? 1 : -1;
            } );
        }
    }
}

module.exports = ContentRepository;
