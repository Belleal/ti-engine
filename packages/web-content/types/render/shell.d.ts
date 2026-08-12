declare const _exports: {
    renderNoiseLayer: typeof renderNoiseLayer;
    renderSkipLink: typeof renderSkipLink;
    renderLangSelect: typeof renderLangSelect;
    renderTopbar: typeof renderTopbar;
    renderAccountMenu: typeof renderAccountMenu;
    renderFooter: typeof renderFooter;
    isCurrentPath: typeof isCurrentPath;
};
export = _exports;
/**
 * The fixed noise overlay. Purely decorative, so it is hidden from assistive technology.
 *
 * @returns {import("./html.js").SafeString}
 */
declare function renderNoiseLayer(): import("./html.js").SafeString;
/**
 * The skip link. Targets the same id the document's <main> carries.
 *
 * @param {Object} labels
 * @returns {import("./html.js").SafeString}
 */
declare function renderSkipLink(labels: Object): import("./html.js").SafeString;
/**
 * The account menu -- a profile trigger in the topbar that opens a sign-in dropdown.
 *
 * THE MARKUP IS DELIBERATELY IDENTICAL FOR EVERY VIEWER, signed in or not. The topbar renders on every page,
 * including the public ones a CDN keeps for `s-maxage`, so anything viewer-dependent here would be cached from
 * whoever happened to miss first and served to everyone after them. The signed-in panel is therefore always present
 * and always `hidden`; the client swaps the panels after asking `/session`, which is the one uncacheable request.
 *
 * Which METHODS exist is site configuration, not viewer state, so it is safe to render server-side.
 *
 * There is no CSRF token in this form for the same reason -- a per-session value baked into a shared-cached page is
 * both a leak and a guaranteed 403 for every other visitor. The client reads it from the `ti-xsrf-token` cookie at
 * submit time. That makes the local form JS-only: a no-JS submit posts an empty token and is refused, which is a
 * visible failure rather than a silent one. Acceptable here because this is an operator's control, not site content.
 *
 * @param {Object} context  Uses `auth.methods` and `labels`.
 * @returns {import("./html.js").SafeString}
 */
declare function renderAccountMenu(context: Object): import("./html.js").SafeString;
/**
 * The language selector. Emits one option per configured language: a link when that language has a counterpart (or
 * is the current page), an inert span with a note when it does not.
 *
 * @param {Object} context  Uses `site.languages`, `lang`, `counterpart`, `labels`.
 * @returns {import("./html.js").SafeString}
 */
declare function renderLangSelect(context: Object): import("./html.js").SafeString;
/**
 * The topbar: brand, primary navigation, the mobile toggle, and the language selector. A nav entry matching the
 * current path is marked current and carries aria-current.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderTopbar(context: Object): import("./html.js").SafeString;
/**
 * True when a nav href addresses the page currently being rendered. An exact match, plus a section match for a
 * non-root href, so `/writings/` stays marked while reading `/writings/some-post/`.
 *
 * @param {string} href
 * @param {string} [path]
 * @returns {boolean}
 */
declare function isCurrentPath(href: string, path?: string): boolean;
/**
 * The site footer: link columns, tagline, social links, legal line -- all configured, none hard-coded.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
declare function renderFooter(context: Object): import("./html.js").SafeString;
