export = Taxonomy;
declare class Taxonomy {
    #private;
    /**
     * @param {Object<string, Array<Object>>} [vocabulary]  { world: [term], form: [term], ... }; each term is
     *        { id, parent?, slug: { <lang>: string }, label: { <lang>: string } }.
     */
    constructor(vocabulary?: Record<string, Object[]>);
    /**
     * All terms of a facet, in vocabulary order.
     *
     * @param {string} facet
     * @returns {Object[]}
     */
    terms(facet: string): Object[];
    /**
     * Resolves a term by id or by any of its per-language slugs.
     *
     * @param {string} facet
     * @param {string} key  A term id or slug.
     * @returns {Object|null}
     */
    resolve(facet: string, key: string): Object | null;
    /**
     * The direct children of a term.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {Object[]}
     */
    children(facet: string, id: string): Object[];
    /**
     * The direct parent of a term as a one-element array, or empty for a root (or a dangling parent reference).
     * One level deep, so there is never more than one ancestor.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {Object[]}
     */
    ancestors(facet: string, id: string): Object[];
    /**
     * Expands a term id to the set of ids a query for it should match: the term itself plus its direct children. A
     * query for a parent therefore matches posts tagged with any of its children; an unknown term expands to nothing.
     *
     * @param {string} facet
     * @param {string} id
     * @returns {string[]}
     */
    expand(facet: string, id: string): string[];
    /**
     * The slug of a term in a given language, or null.
     *
     * @param {string} facet
     * @param {string} id
     * @param {string} lang
     * @returns {string|null}
     */
    slugFor(facet: string, id: string, lang: string): string | null;
}
