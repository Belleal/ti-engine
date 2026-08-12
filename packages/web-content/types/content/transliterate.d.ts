declare const _exports: {
    transliterate: typeof transliterate;
    slugify: typeof slugify;
};
export = _exports;
/**
 * Romanises Cyrillic text via the Streamlined System, preserving case (an upper-case letter capitalises its
 * romanisation, e.g. `Ж` -> `Zh`). Non-Cyrillic characters pass through unchanged.
 *
 * @param {string} text
 * @returns {string}
 */
declare function transliterate(text: string): string;
/**
 * Generates a URL slug: transliterate, lower-case, strip apostrophes, then collapse every run of non-alphanumerics
 * to a single hyphen and trim hyphens from the ends.
 *
 * @param {string} text
 * @returns {string}
 */
declare function slugify(text: string): string;
