declare const _exports: {
    joinUrl: typeof joinUrl;
    canonicalUrl: typeof canonicalUrl;
    shouldNoindex: typeof shouldNoindex;
    hreflangLinks: typeof hreflangLinks;
    jsonLd: typeof jsonLd;
    composeHead: typeof composeHead;
};
export = _exports;
/**
 * Joins a base URL and a record path with exactly one slash between them.
 *
 * @param {string} baseUrl
 * @param {string} path
 * @returns {string}
 */
declare function joinUrl(baseUrl: string, path: string): string;
/**
 * The canonical URL of a record: the site base joined to the record's explicit `path`.
 *
 * @param {Object} record
 * @param {string} baseUrl
 * @returns {string}
 */
declare function canonicalUrl(record: Object, baseUrl: string): string;
/**
 * Whether the response should carry a `noindex` robots directive. The public teaser of a gated record stays
 * indexable; the full body of any non-public record is noindex, as is any record with an explicit `seo.noindex`.
 *
 * @param {Object} record
 * @param {string} [mode]  "full" (default) or "teaser".
 * @returns {boolean}
 */
declare function shouldNoindex(record: Object, mode?: string): boolean;
/**
 * Reciprocal hreflang alternates for a translated pair, with `x-default` pointing at the English side. Empty for a
 * single-language record (no counterpart).
 *
 * @param {Object} record
 * @param {Object} counterpart  The translation counterpart (resolved from `translationOf`), or null.
 * @param {string} baseUrl
 * @returns {Array<{ lang: string, href: string }>}
 */
declare function hreflangLinks(record: Object, counterpart: Object, baseUrl: string): Array<{
    lang: string;
    href: string;
}>;
/**
 * Builds the schema.org JSON-LD object for a record: Article (post), Book (book), MusicAlbum (release), else
 * CreativeWork. Undefined fields are dropped by JSON.stringify.
 *
 * @param {Object} record
 * @param {{ baseUrl?: string, author?: string }} [context]
 * @returns {Object}
 */
declare function jsonLd(record: Object, context?: {
    baseUrl?: string;
    author?: string;
}): Object;
/**
 * Composes the inner HTML of the document `<head>` for a record: title, description, canonical, robots (when
 * noindex), hreflang alternates, Open Graph, Twitter card, and the JSON-LD block. All interpolations are escaped by
 * the html`` template; the JSON-LD `<` characters are neutralised so a title cannot break out of the script tag.
 *
 * @param {Object} record
 * The JSON-LD block carries the nonce when one is available. It is a data block rather than executable script, but
 * whether a strict CSP treats it that way is implementation-dependent, and a structured-data block silently dropped
 * by CSP is exactly the kind of failure nobody notices -- the page looks fine and the rich result quietly stops.
 *
 * @param {{ baseUrl?: string, mode?: string, counterpart?: Object, author?: string, nonce?: string }} [context]
 * @returns {import("./html.js").SafeString}
 */
declare function composeHead(record: Object, context?: {
    baseUrl?: string;
    mode?: string;
    counterpart?: Object;
    author?: string;
    nonce?: string;
}): import("./html.js").SafeString;
