declare const _exports: {
    buildPageContext: typeof buildPageContext;
    adjacentPosts: typeof adjacentPosts;
    archiveHref: typeof archiveHref;
    termLabel: (term: Object, lang: string) => string;
    formatDate: typeof formatDate;
    localeFor: typeof localeFor;
    wordCount: typeof wordCount;
    ARCHIVE_FACETS: string[];
};
export = _exports;
/**
 * Formats an ISO date for display in the record's own language.
 *
 * Takes a resolved BCP-47 LOCALE, not a language tag -- see {@link localeFor}. A bare tag still works, so a caller
 * that has no site config is not broken by it, but it then bypasses any configured region. An unusable one formats in
 * English rather than throwing: a date in the wrong language is a blemish, a thrown RangeError is a blank page.
 *
 * @param {string} iso
 * @param {string} [locale]
 * @returns {string}
 */
declare function formatDate(iso: string, locale?: string): string;
/**
 * The BCP-47 locale to format dates and numbers in for a language.
 *
 * Taken from `site.locales`, because this package is generic and must contain nothing site-specific: a hard-coded
 * `lang === "bg" ? "bg-BG" : "en-GB"` encodes one site's two languages as a fact about the engine, and every other
 * language it is ever given then silently formats as British English -- a wrong date order that looks deliberate.
 *
 * The fallback is the language tag itself rather than a default region. `toLocaleDateString( "bg" )` already
 * formats Bulgarian correctly; a configured entry is only needed to pin a particular REGION.
 *
 * A configured value that `Intl` would reject falls through that same chain, so a mistyped `bg-B` still formats
 * Bulgarian by its bare tag instead of demoting the whole language to English. Only when the tag itself is unusable
 * too is English reached -- see {@link isUsableLocale} for why an unchecked value cannot be passed on.
 *
 * @param {string} lang
 * @param {Object} site
 * @returns {string}  Always a locale `Intl` accepts.
 */
declare function localeFor(lang: string, site: Object): string;
/**
 * A rough word count for the meta line. Markdown syntax is stripped only enough that the number reads true; it is a
 * reading-length signal, not an accounting figure.
 *
 * @param {string} body
 * @returns {number}
 */
declare function wordCount(body: string): number;
/**
 * The archive URL for a term, or null when the language has no archive scheme or the term has no slug.
 *
 * Resolved through the same helper the archive records are GENERATED with, so this href and that record's `path` are
 * the same string by construction rather than by two implementations agreeing. They did not agree: the per-facet
 * `termPath` form was understood only by the generator, and this produced `[object Object]` for every term pill on a
 * site that used it.
 *
 * @param {Object} term
 * @param {string} lang
 * @param {Object} site
 * @param {string} [facet]  Needed only for a per-facet `termPath`; omitting it there yields null rather than a link to
 *        whichever archive happened to be listed first.
 * @returns {string|null}
 */
declare function archiveHref(term: Object, lang: string, site: Object, facet?: string): string | null;
/**
 * The posts immediately older and newer than this one, for the same viewer.
 *
 * `previous` is the older post and `next` the newer, matching the reading direction the controls imply.
 *
 * @param {Object} record
 * @param {Object} repository
 * @param {Object} viewer
 * @returns {{ previous: (Object|null), next: (Object|null) }}
 */
declare function adjacentPosts(record: Object, repository: Object, viewer: Object): {
    previous: (Object | null);
    next: (Object | null);
};
/**
 * Builds the render context a page template needs beyond the record itself.
 *
 * @param {Object} record
 * @param {{ repository?: Object, taxonomy?: Object, site?: Object, labels?: Object, viewer?: Object }} options
 * @returns {Object}  eyebrow, meta, terms, breadcrumb, previous, next -- each omitted when there is nothing to show.
 */
declare function buildPageContext(record: Object, options: {
    repository?: Object;
    taxonomy?: Object;
    site?: Object;
    labels?: Object;
    viewer?: Object;
}): Object;
