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
const { contentHandler, viewerFromRequest, decodePath } = require( "#content-routes" );
const { renderStateDocument } = require( "#page" );
const { mountMediaRoutes } = require( "#media" );
const logger = require( "@ti-engine/core/logger" );

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
        taxonomy: opts.taxonomy,
        auth: opts.auth
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
 * @returns {(request: Object, response: Object) => void}
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

// An origin no real deployment can hold, used only to resolve a candidate target against.
const PROBE_ORIGIN = "https://ti-engine.invalid";

/**
 * Whether a redirect target stays on this site.
 *
 * Decided by RESOLVING the target and checking the origin did not move, rather than by pattern-matching for the
 * shapes that escape. Enumerating those is a losing game: the obvious `//host` was covered, but `/\host` was not --
 * browsers fold a backslash into a slash while a `indexOf( "//" )` test does not, so `/\evil.example` reads as
 * site-relative here and resolves to `https://evil.example/` in the address bar. Percent-encoded and mixed variants
 * behave the same way. Handing the question to the URL parser answers all of them at once, and keeps answering them
 * when a new one is discovered.
 *
 * @param {string} to
 * @returns {boolean}
 */
function isSiteRelative( to ) {
    if ( typeof to !== "string" || to.indexOf( "/" ) !== 0 ) {
        return false;
    }
    try {
        return new URL( to, PROBE_ORIGIN ).origin === PROBE_ORIGIN;
    } catch {
        return false;
    }
}

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
function mountRedirects( server, redirects ) {
    const table = new Map();
    for ( const rule of ( Array.isArray( redirects ) ? redirects : [] ) ) {
        if ( !rule || typeof rule.from !== "string" || typeof rule.to !== "string" ) {
            continue;
        }
        const from = rule.from;
        const to = rule.to;
        if ( from.indexOf( "/" ) !== 0 || isSiteRelative( to ) === false ) {
            logger.log( `Ignored redirect '${ from }' -> '${ to }': both must be rooted, site-relative paths.`, logger.logSeverity.ERROR );
            continue;
        }
        table.set( from, { to: to, status: ( rule.status === 302 || rule.status === 307 || rule.status === 308 ) ? rule.status : 301 } );
    }
    if ( table.size === 0 ) {
        return server;
    }

    /*
     * ONE route with a table lookup, rather than one Express route per rule.
     *
     * Registering `/category/блог-blog/` as a route path cannot work: Express matches routes against the raw request
     * path, which arrives percent-encoded, so a literal non-ASCII route never fires. Storing the encoded form instead
     * only moves the problem, because the hex case is the client's choice. Decoding the request once and looking it
     * up is the same fix `contentHandler` applies, for the same reason -- and it makes the redirect table O(1)
     * instead of N routes deep.
     */
    server.registerRoute( "get", /.*/, ( request, response, next ) => {
        const rule = table.get( decodePath( request.path ) );
        if ( !rule ) {
            next();
            return;
        }
        response.redirect( rule.status, rule.to );
    } );
    return server;
}

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
function mountHomeRoute( server, options ) {
    const opts = options || {};
    const resolve = contentHandler( opts.repository, handlerOptions( opts ) );
    const terminal = ( opts.notFound === false )
        ? null
        : notFoundHandler( handlerOptions( opts ), opts.notFound );

    return server.registerRoute( "get", "/", ( request, response, next ) => {
        resolve( request, response, () => {
            if ( terminal ) {
                logger.log( "No published record claims '/'; the home page is missing or still a draft. Serving the content 404 rather than falling through to the application shell.", logger.logSeverity.WARNING );
                terminal( request, response );
                return;
            }
            next();
        } );
    } );
}

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
function mountSessionRoute( server ) {
    return server.registerRoute( "get", "/session", ( request, response ) => {
        const viewer = viewerFromRequest( request );
        const user = ( request && request.session ) ? request.session.user : null;
        response.set( "Cache-Control", "private, no-store" );
        response.set( "Vary", "Cookie" );
        response.json( {
            authenticated: viewer.authenticated === true,
            name: ( user && ( user.username || user.email || user.userID ) ) || null,
            preview: viewer.preview === true
        } );
    } );
}

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
            // NOT `immutable`. This URL is stable across releases, so `immutable` would promise something untrue --
            // and browsers keep that promise through a manual reload, so a shipped fix would never reach anyone who
            // had already loaded the old script. Express attaches an ETag to send(), making revalidation a 304.
            response.set( "Cache-Control", "public, max-age=0, must-revalidate" );
            response.type( "application/javascript" ).send( script );
        } );
    }

    mountSessionRoute( server );

    // Both of these must precede the content catch-all, or it claims the paths first.
    mountRedirects( server, opts.redirects );

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
    mountRedirects: mountRedirects,
    mountSessionRoute: mountSessionRoute,
    // Re-exported because a consumer testing its own URLs has to model the request pipeline exactly as the handler
    // runs it -- checking an undecoded path would exercise a layer the request never meets.
    decodePath: decodePath,
    defineContentUnprotectedRoutes: defineContentUnprotectedRoutes,
    PUBLIC_EXCEPT_ADMIN: PUBLIC_EXCEPT_ADMIN
};
