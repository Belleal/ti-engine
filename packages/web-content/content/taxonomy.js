/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Taxonomy term graph -- pure logic over a facet vocabulary (world / form). Parents are derived at query time rather
 * than stored on records: querying a parent term expands to its direct children too, so a post tagged with the most
 * specific term (e.g. `alexander-dark`) surfaces under its parent archive (`dark-intent`) automatically, and nothing
 * needs retagging if the hierarchy is later rearranged (Site/docs/content-schemas.md §7).
 *
 * Hierarchy is ONE level deep only: expansion and ancestry each look a single hop. Reading the vocabulary from
 * `taxonomies.yml` is a separate input stage layered on later; here the vocabulary is passed in already parsed, so
 * the graph logic is filesystem-free and fully unit-tested.
 */

class Taxonomy {

    // Map<facet, { byId: Map<id, term>, bySlug: Map<slug, term>, childrenOf: Map<parentId, id[]>, order: id[] }>
    #facets;

    /**
     * @param {Object<string, Array<Object>>} [vocabulary]  { world: [term], form: [term], ... }; each term is
     *        { id, parent?, slug: { <lang>: string }, label: { <lang>: string } }.
     */
    constructor( vocabulary ) {
        this.#facets = new Map();
        const source = ( vocabulary && typeof vocabulary === "object" ) ? vocabulary : {};

        for ( const facet of Object.keys( source ) ) {
            const terms = Array.isArray( source[ facet ] ) ? source[ facet ] : [];
            const byId = new Map();
            const bySlug = new Map();
            const childrenOf = new Map();
            const order = [];

            for ( const term of terms ) {
                if ( !term || typeof term.id !== "string" ) {
                    continue;
                }
                byId.set( term.id, term );
                order.push( term.id );
                const slug = ( term.slug && typeof term.slug === "object" ) ? term.slug : {};
                for ( const lang of Object.keys( slug ) ) {
                    if ( typeof slug[ lang ] === "string" ) {
                        bySlug.set( slug[ lang ], term );
                    }
                }
            }

            // One-level children map -- a parent reference is honored only if the parent actually exists.
            for ( const term of terms ) {
                if ( !term || typeof term.id !== "string" ) {
                    continue;
                }
                if ( typeof term.parent === "string" && byId.has( term.parent ) ) {
                    if ( childrenOf.has( term.parent ) === false ) {
                        childrenOf.set( term.parent, [] );
                    }
                    childrenOf.get( term.parent ).push( term.id );
                }
            }

            this.#facets.set( facet, { byId: byId, bySlug: bySlug, childrenOf: childrenOf, order: order } );
        }
    }

    /**
     * All terms of a facet, in vocabulary order.
     *
     * @param {string} facet
     * @returns {Object[]}
     */
    terms( facet ) {
        const entry = this.#facets.get( facet );
        return entry ? entry.order.map( ( id ) => entry.byId.get( id ) ) : [];
    }

    /**
     * Resolves a term by id or by any of its per-language slugs.
     *
     * @param {string} facet
     * @param {string} key  A term id or slug.
     * @returns {Object|null}
     */
    resolve( facet, key ) {
        const entry = this.#facets.get( facet );
        if ( !entry ) {
            return null;
        }
        return entry.byId.get( key ) || entry.bySlug.get( key ) || null;
    }

    /**
     * The direct children of a term.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {Object[]}
     */
    children( facet, id ) {
        const entry = this.#facets.get( facet );
        if ( !entry ) {
            return [];
        }
        return ( entry.childrenOf.get( id ) || [] ).map( ( childId ) => entry.byId.get( childId ) );
    }

    /**
     * The direct parent of a term as a one-element array, or empty for a root (or a dangling parent reference).
     * One level deep, so there is never more than one ancestor.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {Object[]}
     */
    ancestors( facet, id ) {
        const entry = this.#facets.get( facet );
        if ( !entry ) {
            return [];
        }
        const term = entry.byId.get( id );
        if ( !term || typeof term.parent !== "string" ) {
            return [];
        }
        const parent = entry.byId.get( term.parent );
        return parent ? [ parent ] : [];
    }

    /**
     * Expands a term id to the set of ids a query for it should match: the term itself plus its direct children. A
     * query for a parent therefore matches posts tagged with any of its children; an unknown term expands to nothing.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {string[]}
     */
    expand( facet, id ) {
        const entry = this.#facets.get( facet );
        if ( !entry || entry.byId.has( id ) === false ) {
            return [];
        }
        return [ id ].concat( entry.childrenOf.get( id ) || [] );
    }

    /**
     * The slug of a term in a given language, or null.
     *
     * @param {string} facet
     * @param {string} id
     * @param {string} lang
     * @returns {string|null}
     */
    slugFor( facet, id, lang ) {
        const entry = this.#facets.get( facet );
        if ( !entry ) {
            return null;
        }
        const term = entry.byId.get( id );
        if ( !term || !term.slug ) {
            return null;
        }
        return term.slug[ lang ] || null;
    }
}

module.exports = Taxonomy;
