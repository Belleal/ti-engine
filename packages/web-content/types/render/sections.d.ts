declare const _exports: {
    SECTION_RENDERERS: Readonly<{
        hero: (section: Object) => import("#html").SafeString;
        prose: (section: Object) => import("#html").SafeString;
        verse: (section: Object) => import("#html").SafeString;
        characterCards: (section: Object) => import("#html").SafeString;
        audio: (section: Object) => import("#html").SafeString;
        languageExample: (section: Object) => import("#html").SafeString;
        agePanels: (section: Object) => import("#html").SafeString;
        timeStrip: (section: Object) => import("#html").SafeString;
        timeline: (section: Object) => import("#html").SafeString;
        gallery: (section: Object) => import("#html").SafeString;
        capture: (section: Object, context: Object) => import("#html").SafeString;
        featured: (section: Object, context: Object) => import("#html").SafeString;
        postList: (section: Object, context: Object) => import("#html").SafeString;
        closing: (section: Object) => import("#html").SafeString;
        dictionary: (section: Object, context: Object) => import("#html").SafeString;
    }>;
    sectionClassFor: typeof sectionClassFor;
    hasRenderer: typeof hasRenderer;
    renderSection: typeof renderSection;
    renderChrome: typeof renderChrome;
};
export = _exports;
/**
 * Derives a section's wrapper class from its type: camelCase -> kebab-case, prefixed `section-`.
 *
 * @param {string} type
 * @returns {string|null} null for an empty or non-string type.
 */
declare function sectionClassFor(type: string): string | null;
/**
 * Whether a body renderer is registered for a section type.
 *
 * @param {string} type
 * @returns {boolean}
 */
declare function hasRenderer(type: string): boolean;
/**
 * Renders one section: the common wrapper and chrome, plus the type's body.
 *
 * @param {Object} section  The section record.
 * @param {Object} context  Render context ( repository, viewer, baseUrl, labels… ) passed through to the body.
 * @returns {import("./html.js").SafeString}  Empty for an unknown type -- an unrecognised section is skipped, never fatal.
 */
declare function renderSection(section: Object, context: Object): import("./html.js").SafeString;
/**
 * The optional eyebrow / header / subtitle / divider block above a section body. Each element is emitted only when
 * the record carries it, so an absent field leaves no empty node behind.
 *
 * @param {Object} section
 * @returns {import("./html.js").SafeString}
 */
declare function renderChrome(section: Object): import("./html.js").SafeString;
