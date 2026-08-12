declare const _exports: {
    mountContentRoutes: typeof mountContentRoutes;
    notFoundHandler: typeof notFoundHandler;
    mountHomeRoute: typeof mountHomeRoute;
    mountRedirects: typeof mountRedirects;
    mountSessionRoute: typeof mountSessionRoute;
    decodePath: (requestPath: string) => string;
    defineContentUnprotectedRoutes: typeof defineContentUnprotectedRoutes;
    PUBLIC_EXCEPT_ADMIN: RegExp;
};
export = _exports;
/**
 * Inverts the framework's protect-by-default stance for a public content site.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ pattern?: RegExp }} [options]
 * @returns {Object} The server, for chaining.
 */
declare function defineContentUnprotectedRoutes(server: Object, options?: {
    pattern?: RegExp;
}): Object;
/**
 * The terminal 404 for a content site.
 *
 * Without this, an unknown URL reaches the framework's `invalidRouteHandler`, which redirects to `/not-found` — and
 * that page answers **200**. For an authenticated app behind a login that is harmless; for a public site it is a
 * SOFT 404: a crawler records a successful response for a URL that does not exist, which pollutes the index and
 * hides broken links from every report that would otherwise surface them.
 *
 * Registered for GET only, deliberately. The framework mounts its service-proxy route (`POST /service/:version/:name`)
 * *after* `defineWebApplicationRoutes()` returns, so a catch-all covering every method would shadow it.
 *
 * The copy must not distinguish hidden, unpublished and unknown — the resolver falls through identically for all
 * three, and saying which one it was would leak exactly what deny-by-default exists to hide.
 *
 * @param {Object} context  The render context (site, labels, assets…).
 * @param {Object} [config]  Optional copy overrides: { title, body, mark, actions }.
 * @returns {function(Object, Object): void}
 */
declare function notFoundHandler(context: Object, config?: Object): Function;
/**
 * Registers the configured redirects.
 *
 * An ALIAS points at a record's own path, which is what lets the visibility gate apply to it -- the target is a
 * record, so it can be checked. That is deliberately narrow, and it cannot express three things a migration needs:
 * a target carrying a query string, a target that is a route rather than a record (`/rss.xml`), or any destination
 * outside the content index.
 *
 * This is the escape hatch for exactly those, kept separate so `alias` keeps its meaning instead of decaying into a
 * general redirect table. Targets must be site-relative: an absolute one would make this an open redirect, which is
 * the primitive a phishing link wants.
 *
 * @param {Object} server
 * @param {Array<{ from: string, to: string, status?: number }>} redirects
 * @returns {Object} The server, for chaining.
 */
declare function mountRedirects(server: Object, redirects: Array<{
    from: string;
    to: string;
    status?: number;
}>): Object;
/**
 * Claims `/` for the content resolver.
 *
 * MUST be called BEFORE `super.defineWebApplicationRoutes()`. The framework binds `/` to its own SPA-shell handler,
 * and Express matches in registration order — so on a content site, where the home page is an ordinary record, the
 * shell would otherwise win and the home record would be unreachable.
 *
 * A MISS TERMINATES HERE. This used to call `next()`, on the reasoning that a site with no home record should still
 * get the framework's handler -- but the effect on a content site is that the moment the home record is missing or
 * left unpublished, the site root answers **200 with the application's login shell**. To a reader that is a foreign
 * screen where their home page should be; to a crawler it is a soft 404 on the single most important URL of the
 * site. Calling this function is the declaration that `/` belongs to content, so a miss is the site's own 404,
 * exactly as it is for every other unknown path.
 *
 * Pass `notFound: false` for a genuine hybrid, where the application really does own `/` when no record claims it.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {Object} options  Same shape as {@link mountContentRoutes}.
 * @returns {Object} The server, for chaining.
 */
declare function mountHomeRoute(server: Object, options: Object): Object;
/**
 * Mounts the feed routes and, LAST, the catch-all content resolver.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ repository: Object, baseUrl?: string, renderPage?: Function, feed?: Object, allowIndexing?: boolean,
 *           site?: Object, labels?: Object, assets?: Object, taxonomy?: Object, serveSiteScript?: boolean,
 *           notFound?: (Object|false), media?: { root: string, prefixes: string[], maxAge?: string },
 *           redirects?: Array<{ from: string, to: string, status?: number }> }} options
 * @returns {Object} The server, for chaining.
 */
/**
 * `GET /session` -- who the current viewer is, for the topbar account menu.
 *
 * This exists so that NOTHING ELSE has to vary by viewer. Every page can then be rendered identically for everyone
 * and left shared-cacheable, with this one small response carrying the only per-viewer fact. It is therefore the one
 * response that must never be stored: `no-store` plus `Vary: Cookie`, or a CDN would answer it for the wrong person.
 *
 * Deliberately minimal. It reports whether you are signed in, the name to greet you by, and whether you hold the
 * preview capability -- not the role list, and nothing about what exists that you cannot see.
 *
 * @param {Object} server
 * @returns {Object} The server, for chaining.
 */
declare function mountSessionRoute(server: Object): Object;
declare function mountContentRoutes(server: any, options: any): any;
