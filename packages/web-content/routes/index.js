/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The integration seam between web-content and web-framework. Both helpers use only the public route-registration
 * seams added in web-framework 1.17.0 (registerRoute / addUnprotectedRoute) -- never Express internals.
 *
 * Call them from a TiWebServer subclass, after super(), so the framework's own routes keep priority:
 *
 *     defineUnprotectedRoutes() {
 *         super.defineUnprotectedRoutes();
 *         defineContentUnprotectedRoutes( this );
 *     }
 *
 *     defineWebApplicationRoutes() {
 *         mountHomeRoute( this, contentOptions );        // before super: "/" is a content record
 *         super.defineWebApplicationRoutes();
 *         mountContentRoutes( this, contentOptions );    // after super: framework routes keep priority
 *     }
 *
 * Route-level access is NOT the content gate. It merely opens the door to the resolver; the repository applies
 * per-record visibility. Two independent layers, and the content one is authoritative.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const feeds = require( "#feeds" );
const { contentHandler } = require( "#content-routes" );
const { renderStateDocument } = require( "#page" );
const { mountMediaRoutes } = require( "#media" );

// The site behaviour script ships with the package. It is read once at mount rather than per request, and served
// under /static/ so it sits alongside the theme's own assets. The framework's express.static for /static runs first,
// so a consumer that drops its own file at this path overrides the packaged one.
const SITE_SCRIPT_PATH = "/static/web-content.js";
const SITE_SCRIPT_FILE = path.join( __dirname, "..", "static", "web-content.js" );

// Public-by-default: everything except the admin area bypasses the framework's authentication gate.
// The lookahead must accept BOTH `/admin/...` and the bare `/admin` — matching only `admin/` would leave
// `/admin` itself declared unprotected, since the negative lookahead succeeds when the slash is absent.
const PUBLIC_EXCEPT_ADMIN = /^\/(?!admin(?:\/|$)).*$/;

/**
 * Inverts the framework's protect-by-default stance for a public content site.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ pattern?: RegExp }} [options]
 * @returns {Object} The server, for chaining.
 */
function defineContentUnprotectedRoutes( server, options ) {
    const opts = options || {};
    return server.addUnprotectedRoute( opts.pattern || PUBLIC_EXCEPT_ADMIN );
}

/**
 * Builds the options the content handler needs from the mount options.
 *
 * @param {Object} opts
 * @returns {Object}
 */
function handlerOptions( opts ) {
    return {
        baseUrl: opts.baseUrl || "",
        renderPage: opts.renderPage,
        site: opts.site,
        labels: opts.labels,
        assets: opts.assets,
        taxonomy: opts.taxonomy
    };
}

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
function notFoundHandler( context, config ) {
    const copy = ( config && typeof config === "object" ) ? config : {};
    return function ( request, response ) {
        const labels = context.labels || {};
        const state = {
            mark: copy.mark || "◆",
            title: copy.title || labels.notFoundTitle || "Not found",
            body: copy.body || labels.notFoundBody || "",
            actions: copy.actions || [ { href: "/", label: labels.notFoundAction || "Back to the beginning" } ]
        };
        const ctx = Object.assign( {}, context, {
            nonce: response.locals ? response.locals.nonce : undefined,
            path: request.path
        } );
        response.set( "Cache-Control", "private, no-store" );
        response.status( 404 ).type( "html" ).send( String( renderStateDocument( state, ctx ) ) );
    };
}

/**
 * Claims `/` for the content resolver.
 *
 * MUST be called BEFORE `super.defineWebApplicationRoutes()`. The framework binds `/` to its own SPA-shell handler,
 * and Express matches in registration order — so on a content site, where the home page is an ordinary record, the
 * shell would otherwise win and the home record would be unreachable. Registering first is safe in both directions:
 * the resolver calls `next()` when no record owns `/`, so a site without a home record still gets the framework's
 * handler.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {Object} options  Same shape as {@link mountContentRoutes}.
 * @returns {Object} The server, for chaining.
 */
function mountHomeRoute( server, options ) {
    const opts = options || {};
    return server.registerRoute( "get", "/", contentHandler( opts.repository, handlerOptions( opts ) ) );
}

/**
 * Mounts the feed routes and, LAST, the catch-all content resolver.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ repository: Object, baseUrl?: string, renderPage?: Function, feed?: Object, allowIndexing?: boolean,
 *           site?: Object, labels?: Object, assets?: Object, taxonomy?: Object, serveSiteScript?: boolean,
 *           notFound?: (Object|false), media?: { root: string, prefixes: string[], maxAge?: string } }} options
 * @returns {Object} The server, for chaining.
 */
function mountContentRoutes( server, options ) {
    const opts = options || {};
    const repository = opts.repository;
    const baseUrl = opts.baseUrl || "";
    const feedOptions = opts.feed || {};

    server.registerRoute( "get", "/sitemap.xml", ( request, response ) => {
        response.set( "Cache-Control", "public, max-age=0, s-maxage=3600" );
        response.type( "application/xml" ).send( feeds.renderSitemap( feeds.sitemapEntries( repository ), baseUrl ) );
    } );

    server.registerRoute( "get", "/rss.xml", ( request, response ) => {
        response.set( "Cache-Control", "public, max-age=0, s-maxage=3600" );
        // `??` not `||`, so a configured `limit: 0` means zero items rather than falling back to 20:
        response.type( "application/rss+xml" ).send( feeds.renderRss( feeds.rssItems( repository, { type: "post", limit: feedOptions.limit ?? 20 } ), {
            baseUrl: baseUrl,
            title: feedOptions.title,
            description: feedOptions.description,
            language: feedOptions.language
        } ) );
    } );

    server.registerRoute( "get", "/robots.txt", ( request, response ) => {
        response.type( "text/plain" ).send( feeds.renderRobots( { baseUrl: baseUrl, allowIndexing: opts.allowIndexing } ) );
    } );

    if ( opts.serveSiteScript !== false ) {
        const script = fs.readFileSync( SITE_SCRIPT_FILE, "utf8" );
        server.registerRoute( "get", SITE_SCRIPT_PATH, ( request, response ) => {
            response.set( "Cache-Control", "public, max-age=31536000, immutable" );
            response.type( "application/javascript" ).send( script );
        } );
    }

    // Legacy media keeps its original URLs, so these must be reachable before the content catch-all claims them.
    if ( opts.media ) {
        mountMediaRoutes( server, opts.media );
    }

    // Registered last: every other content URL resolves through the path index. Still ahead of the framework's own
    // `*splat` 404 handler, which is installed after defineWebApplicationRoutes() returns.
    server.registerRoute( "get", /.*/, contentHandler( repository, handlerOptions( opts ) ) );

    if ( opts.notFound !== false ) {
        server.registerRoute( "get", "*splat", notFoundHandler( handlerOptions( opts ), opts.notFound ) );
    }

    return server;
}

module.exports = {
    mountContentRoutes: mountContentRoutes,
    notFoundHandler: notFoundHandler,
    mountHomeRoute: mountHomeRoute,
    defineContentUnprotectedRoutes: defineContentUnprotectedRoutes,
    PUBLIC_EXCEPT_ADMIN: PUBLIC_EXCEPT_ADMIN
};
