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
 * <br/>
 * With `turnstile` configured, the submission's challenge is verified first, and a submission that fails it is never
 * handed to the store. The refusal redirects like any failed capture (`?capture=error`), and the log names Cloudflare's
 * reason.
 *
 * @param {Object} store
 * @param {Object} repository
 * @param {{ turnstile?: { siteKey?: string, secret?: string, fetch?: Function, timeoutMs?: number } }} [options]
 * @returns {(request: Object, response: Object) => void}
 */
declare function captureHandler(store: Object, repository: Object, options?: {
    turnstile?: {
        siteKey?: string;
        secret?: string;
        fetch?: Function;
        timeoutMs?: number;
    };
}): (request: Object, response: Object) => void;
/**
 * Registers the capture routes: a public POST for the form, and the admin reporting endpoints behind a guard.
 *
 * `requireAdmin` overrides the guard for a consumer with its own role model. Omitting it selects
 * {@link defaultRequireAdmin}, never "no guard" -- these endpoints expose every stored address, so a forgotten
 * option must fail closed.
 *
 * `turnstile` takes the site key and the secret together (CA-352). With one and not the other, every submission is
 * refused and the cause is logged here, once, at ERROR. The site keeps serving: a missing secret is a reason to stop
 * accepting sign-ups unchecked, not a reason to take the site down.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ store: Object, repository?: Object, requireAdmin?: Function, turnstile?: { siteKey?: string, secret?: string } }} options
 * @returns {Object} The server, for chaining.
 */
declare function mountCaptureRoutes(server: Object, options: {
    store: Object;
    repository?: Object;
    requireAdmin?: Function;
    turnstile?: {
        siteKey?: string;
        secret?: string;
    };
}): Object;
