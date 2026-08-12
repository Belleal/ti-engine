declare const _exports: {
    buildArchiveRecords: typeof buildArchiveRecords;
    DEFAULT_LIMIT: number;
};
export = _exports;
/**
 * Builds one `page` record per (language, facet, term) that has an archive path configured.
 *
 * @param {Object} taxonomy  A Taxonomy instance.
 * @param {{ archives: Object, languages?: string[], defaultLanguage?: string, facets?: string[], limit?: number }} config
 * @returns {Object[]}  Archive page records, ready to be indexed alongside the authored ones.
 */
declare function buildArchiveRecords(taxonomy: Object, config: {
    archives: Object;
    languages?: string[];
    defaultLanguage?: string;
    facets?: string[];
    limit?: number;
}): Object[];
