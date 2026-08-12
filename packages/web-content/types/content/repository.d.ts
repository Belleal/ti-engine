export = ContentRepository;
export type Viewer = {
    authenticated: boolean;
    roles: string[];
};
export type ServedItem = {
    record: Object;
    verdict: string;
};
/**
 * @typedef {{ authenticated: boolean, roles: string[] }} Viewer  A null/undefined viewer is treated as anonymous.
 * @typedef {{ record: Object, verdict: string }} ServedItem  verdict is "visible" or "gated".
 */
declare class ContentRepository {
    #private;
    /**
     * @param {import("./loader.js").ContentIndex} index  The index built by the loader; defaults to empty.
     * @param {{ taxonomy?: Object }} [options]  `taxonomy` lets a facet criterion expand to a term's children, so
     *        querying a parent term matches records tagged with any of its descendants. Without it a facet matches
     *        only itself, which makes a parent-term archive silently under-report rather than fail.
     */
    constructor(index: import("./loader.js").ContentIndex, options?: {
        taxonomy?: Object;
    });
    /**
     * Resolves a request path for a viewer.
     *
     * @param {string} path
     * @param {Viewer} [viewer]
     * @returns {{ outcome: string, record?: Object, redirectTo?: string, preview?: boolean }} outcome is
     *          "visible" | "gated" (a hit, with `record`), "alias" (with `redirectTo`), or "miss".
     *          `preview: true` marks a hit on an UNPUBLISHED record, opened because the viewer holds the preview
     *          capability. The caller MUST honour it: such a response has to be `no-store` and `noindex`, or a
     *          draft reaches a CDN or a search index and outlives the preview.
     */
    resolve(path: string, viewer?: Viewer): {
        outcome: string;
        record?: Object;
        redirectTo?: string;
        preview?: boolean;
    };
    /**
     * Lists the records a viewer may see for the given criteria, as `{ record, verdict }` items (visible or gated),
     * excluding hidden and unpublished records.
     *
     * @param {{ type?: string, world?: string, form?: string, lang?: string, sort?: string, offset?: number, limit?: number }} [criteria]
     * @param {Viewer} [viewer]
     * @returns {ServedItem[]}
     */
    list(criteria?: {
        type?: string;
        world?: string;
        form?: string;
        lang?: string;
        sort?: string;
        offset?: number;
        limit?: number;
    }, viewer?: Viewer): ServedItem[];
    /**
     * Counts the records a viewer may see for the given criteria (same filter as {@link ContentRepository#list},
     * ignoring offset/limit).
     *
     * @param {Object} [criteria]
     * @param {Viewer} [viewer]
     * @returns {number}
     */
    count(criteria?: Object, viewer?: Viewer): number;
    /**
     * Resolves a single record by id, or null if it is hidden, unpublished, or unknown to this viewer.
     *
     * @param {string} id
     * @param {Viewer} [viewer]
     * @returns {ServedItem|null}
     */
    getById(id: string, viewer?: Viewer): ServedItem | null;
    /**
     * Resolves a curated list of ids (e.g. a `featured` section) for a viewer, in the given order, dropping any that
     * are hidden/unpublished/unknown and keeping gated ones (rendered as teasers). This is why a hand-picked id list
     * cannot leak a gated or unpublished record -- it resolves through the same filter as everything else.
     *
     * @param {string[]} ids
     * @param {Viewer} [viewer]
     * @returns {ServedItem[]}
     */
    resolveIds(ids: string[], viewer?: Viewer): ServedItem[];
    /**
     * Whether this viewer may open an unpublished record by its path. A capability the application grants; the
     * repository never works out who deserves it.
     *
     * @method
     * @static
     * @param {Viewer} [viewer]
     * @returns {boolean}
     * @public
     */
    static canPreview(viewer?: Viewer): boolean;
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
    static resolveVisibility(record: Object, viewer?: Viewer): string;
}
