declare const _exports: {
    renderDocument: typeof renderDocument;
    renderStateDocument: typeof renderStateDocument;
};
export = _exports;
/**
 * Renders the complete HTML document for a record.
 *
 * @param {Object} record
 * @param {Object} context  mode, viewer, repository, baseUrl, lang, counterpart, nonce, site, labels, assets…
 * @returns {string}
 */
declare function renderDocument(record: Object, context: Object): string;
/**
 * Renders a standalone state document -- 404, or any other page with no record behind it.
 *
 * The 404 copy must not distinguish hidden, unpublished and unknown: the resolver falls through to the same place
 * for all three deliberately, and naming which one it was would leak what deny-by-default exists to hide.
 *
 * @param {{ title: string, body?: string, mark?: string, actions?: Array<Object>, status?: number }} state
 * @param {Object} context
 * @returns {string}
 */
declare function renderStateDocument(state: {
    title: string;
    body?: string;
    mark?: string;
    actions?: Array<Object>;
    status?: number;
}, context: Object): string;
