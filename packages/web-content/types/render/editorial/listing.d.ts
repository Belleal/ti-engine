declare const _exports: {
    renderFeatured: typeof renderFeatured;
    renderPostList: typeof renderPostList;
    renderPostCard: typeof renderPostCard;
    renderPagination: typeof renderPagination;
};
export = _exports;
/**
 * Renders one post card. `featured` promotes the same component with a modifier rather than introducing a second
 * one, so a pinned listing item and a featured section share the markup.
 *
 * @param {{ record: Object, verdict: string }} item
 * @param {Object} context
 * @param {boolean} [featured]
 * @returns {import("../html.js").SafeString}
 */
declare function renderPostCard(item: {
    record: Object;
    verdict: string;
}, context: Object, featured?: boolean): import("../html.js").SafeString;
/**
 * `featured` -- either a static announcement card, or a curated row of records referenced by id. The curated form
 * resolves every id through the repository, so it inherits visibility filtering like any other surface.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
declare function renderFeatured(section: Object, context: Object): import("../html.js").SafeString;
/**
 * `postList` -- an inline repository query. Pagination is by `?page=N` (self-canonical), so no index entry is needed
 * per page.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
declare function renderPostList(section: Object, context: Object): import("../html.js").SafeString;
/**
 * Query-param pagination. The current page is a span with aria-current rather than a link, so the control never
 * points at the page the reader is already on.
 *
 * @param {number} page
 * @param {number} pages
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
declare function renderPagination(page: number, pages: number, context: Object): import("../html.js").SafeString;
