export { html };
export { raw };
export { escapeHtml };
export { accentedTitle };
export { SafeString };
/**
 * A string already known to be safe HTML -- the result of {@link html} or {@link raw}. Interpolating one into
 * another template inserts it verbatim (no re-escaping).
 */
declare class SafeString {
    value: string;
    /**
     * @param {string} value  Pre-escaped/known-safe HTML.
     */
    constructor(value: string);
    /**
     * @returns {string}
     */
    toString(): string;
}
/**
 * HTML-escapes the five significant characters. Ampersand is replaced first so the other replacements are not
 * double-escaped.
 *
 * @param {*} value
 * @returns {string}
 */
declare function escapeHtml(value: any): string;
/**
 * Tagged template that escapes every interpolation by default and returns a {@link SafeString}.
 *
 * @param {string[]} strings
 * @param {...*} values
 * @returns {SafeString}
 */
declare function html(strings: string[], ...values: any[]): SafeString;
/**
 * Marks a string as safe HTML, opting it out of escaping. Use ONLY for markdown output and import-sanitised legacy
 * HTML (CLAUDE.md 8).
 *
 * @param {*} value
 * @returns {SafeString}
 */
declare function raw(value: any): SafeString;
/**
 * A heading with one run of text accented.
 *
 * The accent is placed WHERE IT APPEARS in the title, so any word can carry it -- `title: "Welcome to my Page"` with
 * `titleAccent: "Welcome"` accents the first word, which the old design does and an append-only accent could never
 * express. When the accented text is not part of the title it is appended instead, which is the long-standing
 * behaviour and what `title: "The"` + `titleAccent: "Scarlet"` relies on.
 *
 * Both halves of the split are interpolated, never concatenated as markup, so the title is escaped exactly as any
 * other interpolation is (CLAUDE.md 8). Only the span itself is structural.
 *
 * @param {string} title
 * @param {string} [accentText]
 * @returns {SafeString}
 */
declare function accentedTitle(title: string, accentText?: string): SafeString;
