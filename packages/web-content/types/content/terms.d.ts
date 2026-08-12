declare const _exports: {
    termSlug: typeof termSlug;
    termLabel: typeof termLabel;
    termPathPattern: typeof termPathPattern;
    termArchivePath: typeof termArchivePath;
    DEFAULT_LANGUAGE: string;
};
export = _exports;
/**
 * The slug to address a term by in a given language.
 *
 * Falls back to the default language and then to the raw id, because a term with no slug in the language being
 * rendered still has to be reachable -- an addressable ugly URL beats no archive at all.
 *
 * @param {Object} term
 * @param {string} lang
 * @param {string} [defaultLanguage="en"]
 * @returns {string|null}  Null only when there is no term, or one with neither slug nor id.
 */
declare function termSlug(term: Object, lang: string, defaultLanguage?: string): string | null;
/**
 * The display label for a term in a language, falling back to English and then to the raw id so an unlabelled term is
 * still legible rather than blank.
 *
 * @param {Object} term
 * @param {string} lang
 * @returns {string}  Empty only when there is no term at all.
 */
declare function termLabel(term: Object, lang: string): string;
/**
 * The archive path pattern for one facet.
 *
 * `termPath` is a single string when every facet shares a URL namespace -- which is a deliberate choice, not an
 * oversight: a flat `/writings/{slug}/` reads better than `/writings/world/{slug}/` and is usually what a migration
 * has to preserve. The cost is that a world term and a form term sharing a slug produce the SAME path, and the loader
 * then reports a conflict and drops one archive to a 404.
 *
 * So the pattern may also be given per facet, `{ world: "...", form: "..." }`, which is the escape hatch when two
 * vocabularies do collide -- without forcing every site to namespace URLs it does not need to.
 *
 * @param {string|Object} termPath
 * @param {string} [facet]  Required to resolve the per-facet form; a caller that does not know the facet gets null
 *        rather than a guess, since guessing here means emitting a link to the wrong archive.
 * @returns {string|null}
 */
declare function termPathPattern(termPath: string | Object, facet?: string): string | null;
/**
 * A term's archive path -- the single place `{slug}` is substituted, so a generated `path` and a rendered `href` are
 * the same string by construction.
 *
 * @param {string} pattern  A resolved pattern from {@link termPathPattern}.
 * @param {Object} term
 * @param {string} lang
 * @param {string} [defaultLanguage="en"]
 * @returns {string|null}  Null when there is no pattern or the term cannot be addressed.
 */
declare function termArchivePath(pattern: string, term: Object, lang: string, defaultLanguage?: string): string | null;
