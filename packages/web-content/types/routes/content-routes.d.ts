declare const _exports: {
    cacheHeadersFor: typeof cacheHeadersFor;
    viewerFromRequest: typeof viewerFromRequest;
    parsePageParam: typeof parsePageParam;
    decodePath: typeof decodePath;
    contentHandler: typeof contentHandler;
};
export = _exports;
/**
 * The cache headers a record's response must carry. Only `public` visibility is edge-cacheable.
 *
 * @param {Object} record
 * @returns {Object<string, string>}
 */
declare function cacheHeadersFor(record: Object): Record<string, string>;
/**
 * Maps an Express request's session to the viewer shape the repository expects.
 *
 * @param {Object} request
 * @returns {{ authenticated: boolean, roles: Array<string|number> }}
 */
declare function viewerFromRequest(request: Object): {
    authenticated: boolean;
    roles: Array<string | number>;
};
/**
 * The request path in the form content records are authored in.
 *
 * Express does NOT percent-decode `req.path`, so a browser asking for `/bg/начало/` arrives here as
 * `/bg/%D0%BD%D0%B0%D1%87%D0%B0%D0%BB%D0%BE/`. The path index is an exact `Map.get`, and records store their paths
 * and aliases as literal characters -- so without this, no non-ASCII URL can ever resolve. Nothing throws; the alias
 * is present, spelled correctly, and reads as handled in every review of the content file. The only signal is a 404
 * in an access log after the old site is gone.
 *
 * Storing the encoded form instead is not a fix: the case of the hex digits is chosen by whoever generated the link
 * (Yoast emitted lowercase, browsers send uppercase), so a stored encoding matches only half the traffic.
 *
 * `decodeURI`, not `decodeURIComponent`: it leaves `%2F` encoded, so a slash smuggled into a slug cannot change
 * which record the path addresses. A malformed sequence throws `URIError` -- caught here, because a hostile request
 * must produce a 404 rather than a 500.
 *
 * @param {string} requestPath
 * @returns {string}
 */
declare function decodePath(requestPath: string): string;
/**
 * Reads the `?page=N` parameter. Anything that is not a positive integer is page one -- a listing must not be
 * blanked by a malformed or hostile value, and pagination is by query parameter precisely so no index entry is
 * needed per page.
 *
 * @param {*} value
 * @returns {number}
 */
declare function parsePageParam(value: any): number;
/**
 * Builds the catch-all Express handler that resolves a request path against the content index.
 *
 * @param {import("../content/repository.js")} repository
 * @param {{ baseUrl?: string, renderPage?: function(Object, Object): (string|Object), site?: Object, labels?: Object, assets?: Object }} [options]
 * @returns {function(Object, Object, Function): void}
 */
declare function contentHandler(repository: import("../content/repository.js"), options?: {
    baseUrl?: string;
    renderPage?: Function;
    (Object: any, Object: any): (string | Object);
    site?: Object;
    labels?: Object;
    assets?: Object;
}): Function;
