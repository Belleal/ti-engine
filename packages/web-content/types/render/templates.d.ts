declare const _exports: {
    renderMain: typeof renderMain;
    renderPost: typeof renderPost;
    renderComposed: typeof renderComposed;
    renderBreadcrumb: typeof renderBreadcrumb;
    renderPostHeader: typeof renderPostHeader;
    renderTermPills: typeof renderTermPills;
    renderPostNav: typeof renderPostNav;
    renderGate: typeof renderGate;
    renderStatePanel: typeof renderStatePanel;
};
export = _exports;
/**
 * Renders a record's <main> content for its type.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderMain(record: Object, context: Object): import("./html.js").SafeString;
/**
 * `post` -- the article: breadcrumb, header, body (or gate), footnotes, terms, adjacent-post navigation.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderPost(record: Object, context: Object): import("./html.js").SafeString;
/**
 * `page`, `book`, `release` -- composed records: a list of sections, each dispatched through the section registry.
 * A gated composed record shows its gate in place of the sections.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderComposed(record: Object, context: Object): import("./html.js").SafeString;
/**
 * The breadcrumb trail. Built from configured ancestors plus the current record; omitted when nothing precedes it,
 * because a breadcrumb of one item is noise.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderBreadcrumb(record: Object, context: Object): import("./html.js").SafeString;
/**
 * The article header: eyebrow, title, subtitle, and the dot-separated meta line.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderPostHeader(record: Object, context: Object): import("./html.js").SafeString;
/**
 * The taxonomy pills in the article footer.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderTermPills(record: Object, context: Object): import("./html.js").SafeString;
/**
 * Previous / next navigation. Each side is emitted only when it exists, so the last post shows one control rather
 * than a dead one.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderPostNav(context: Object): import("./html.js").SafeString;
/**
 * The gate: the teaser with its fade, then the panel offering both doors.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderGate(record: Object, context: Object): import("./html.js").SafeString;
/**
 * The state panel -- used by 404 and by an empty archive.
 *
 * NOTE for the 404 caller: the copy must NOT distinguish hidden, unpublished and unknown. `content-routes.js` falls
 * through to the same place for all three deliberately, and saying which one it was would leak exactly what the
 * deny-by-default rule exists to hide.
 *
 * @param {{ mark?: string, title: string, body?: string, actions?: Array<{href: string, label: string, tone?: string}> }} options
 * @returns {import("./html.js").SafeString}
 */
declare function renderStatePanel(options: {
    mark?: string;
    title: string;
    body?: string;
    actions?: Array<{
        href: string;
        label: string;
        tone?: string;
    }>;
}): import("./html.js").SafeString;
