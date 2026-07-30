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
 *         super.defineWebApplicationRoutes();
 *         mountContentRoutes( this, { repository, baseUrl } );
 *     }
 *
 * Route-level access is NOT the content gate. It merely opens the door to the resolver; the repository applies
 * per-record visibility. Two independent layers, and the content one is authoritative.
 */

const feeds = require( "#feeds" );
const { contentHandler } = require( "#content-routes" );

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
 * Mounts the feed routes and, LAST, the catch-all content resolver.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ repository: Object, baseUrl?: string, renderPage?: Function, feed?: Object, allowIndexing?: boolean }} options
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

    // Registered last: every other content URL resolves through the path index. Still ahead of the framework's own
    // `*splat` 404 handler, which is installed after defineWebApplicationRoutes() returns.
    server.registerRoute( "get", /.*/, contentHandler( repository, { baseUrl: baseUrl, renderPage: opts.renderPage } ) );

    return server;
}

module.exports = {
    mountContentRoutes: mountContentRoutes,
    defineContentUnprotectedRoutes: defineContentUnprotectedRoutes,
    PUBLIC_EXCEPT_ADMIN: PUBLIC_EXCEPT_ADMIN
};
