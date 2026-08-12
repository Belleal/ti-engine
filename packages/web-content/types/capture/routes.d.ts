declare const _exports: {
    mountCaptureRoutes: typeof mountCaptureRoutes;
    defaultRequireAdmin: typeof defaultRequireAdmin;
    captureHandler: typeof captureHandler;
    safeReturnPath: typeof safeReturnPath;
    CAPTURE_PATH: string;
    ADMIN_BASE: string;
};
export = _exports;
/**
 * The default guard for the capture admin routes.
 *
 * These endpoints list, export and erase every captured email address, so they FAIL CLOSED: a request without an
 * authenticated session holding the admin role is refused. The framework's `authorization` module is not exported
 * from its package, so the check is reimplemented here against the same session shape and the same role name rather
 * than reaching into another package's internals.
 *
 * @param {Object} request
 * @param {Object} response
 * @param {Function} next
 */
declare function defaultRequireAdmin(request: Object, response: Object, next: Function): void;
/**
 * Resolves the post-submit redirect target, refusing anything that is not a known content path.
 *
 * @param {string} returnTo
 * @param {Object} repository
 * @returns {string}  A safe same-site path.
 */
declare function safeReturnPath(returnTo: string, repository: Object): string;
/**
 * The public capture endpoint.
 *
 * @param {Object} store
 * @param {Object} repository
 * @returns {(request: Object, response: Object) => void}
 */
declare function captureHandler(store: Object, repository: Object): (request: Object, response: Object) => void;
/**
 * Registers the capture routes: a public POST for the form, and the admin reporting endpoints behind a guard.
 *
 * `requireAdmin` overrides the guard for a consumer with its own role model. Omitting it selects
 * {@link defaultRequireAdmin}, never "no guard" -- these endpoints expose every stored address, so a forgotten
 * option must fail closed.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ store: Object, repository?: Object, requireAdmin?: Function }} options
 * @returns {Object} The server, for chaining.
 */
declare function mountCaptureRoutes(server: Object, options: {
    store: Object;
    repository?: Object;
    requireAdmin?: Function;
}): Object;
