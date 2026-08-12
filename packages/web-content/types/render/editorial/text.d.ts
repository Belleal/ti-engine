declare const _exports: {
    renderProse: typeof renderProse;
    renderVerse: typeof renderVerse;
    renderClosing: typeof renderClosing;
    renderLanguageExample: typeof renderLanguageExample;
};
export = _exports;
/**
 * `prose` -- a markdown (or pre-sanitised legacy HTML) body in the reading measure. `.prose-excerpt` is the
 * scarlet-ruled variant used for an excerpt pulled from a longer work.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderProse(section: Object): import("../html.js").SafeString;
/**
 * `verse` -- one paragraph, hard line breaks, the closing line marked so the theme can give it the turn it needs.
 * Attribution follows as a `cite`.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderVerse(section: Object): import("../html.js").SafeString;
/**
 * `closing` -- the send-off at the foot of a composed page: text, title, ornament.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderClosing(section: Object): import("../html.js").SafeString;
/**
 * `languageExample` -- an Anarandian phrase with its translation. Renders one block per example so a section can
 * carry several, matching the specimen.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderLanguageExample(section: Object): import("../html.js").SafeString;
