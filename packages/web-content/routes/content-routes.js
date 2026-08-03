/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The catch-all content resolver -- one route for every content URL. Registered LAST (see routes/index.js) so the
 * framework's own routes keep priority; a miss calls next() and falls through to the framework's 404 handler.
 *
 * Resolution is a path-index lookup, never a route pattern: hit on `path` -> render, hit on `aliases` -> 301 to the
 * canonical path, miss -> next(). Every URL shape (current, legacy, Bulgarian, transliterated) is just an index
 * entry, so there is no route-ordering bug to have.
 *
 * CACHE POLICY IS KEYED ON THE RECORD'S VISIBILITY, not on what was rendered. A public record is edge-cacheable;
 * everything else -- including the public-looking teaser of a gated record -- is `private, no-store` + `Vary: Cookie`.
 * The response for a gated path differs by who is asking, so it must never be shared by a CDN: an authenticated body
 * served to an anonymous visitor is the single most likely way gated content leaks (CLAUDE.md 9).
 */

const { renderDocument } = require( "#page" );
const { buildPageContext } = require( "#context" );
const logger = require( "@ti-engine/core/logger" );

// Matches the framework's own admin role name.
const ADMIN_ROLE = "admin";

const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";
const PRIVATE_CACHE_CONTROL = "private, no-store";

/**
 * The cache headers a record's response must carry. Only `public` visibility is edge-cacheable.
 *
 * @param {Object} record
 * @returns {Object<string, string>}
 */
function cacheHeadersFor( record ) {
    // A draft is never edge-cacheable, however public its `visibility` says it is. Without this a previewed
    // draft with `visibility: public` would be handed to the CDN and served to anyone -- which is exactly how
    // an unfinished page reaches the world.
    const published = !!record && record.status === "published";
    if ( published && record.visibility === "public" ) {
        return { "Cache-Control": PUBLIC_CACHE_CONTROL };
    }
    return { "Cache-Control": PRIVATE_CACHE_CONTROL, "Vary": "Cookie" };
}

/**
 * Maps an Express request's session to the viewer shape the repository expects.
 *
 * @param {Object} request
 * @returns {{ authenticated: boolean, roles: Array<string|number> }}
 */
function viewerFromRequest( request ) {
    const user = ( request && request.session ) ? request.session.user : null;
    if ( !user ) {
        return { authenticated: false, roles: [] };
    }
    const roles = Array.isArray( user.roles ) ? user.roles : [];
    // Preview is a capability the application grants, not something the repository works out. An administrator
    // may open an unpublished record by its path; nobody else can, and it appears in no listing regardless.
    return { authenticated: true, roles: roles, preview: roles.indexOf( ADMIN_ROLE ) !== -1 };
}

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
function decodePath( requestPath ) {
    try {
        return decodeURI( requestPath );
    } catch {
        return requestPath;
    }
}

/**
 * Reads the `?page=N` parameter. Anything that is not a positive integer is page one -- a listing must not be
 * blanked by a malformed or hostile value, and pagination is by query parameter precisely so no index entry is
 * needed per page.
 *
 * @param {*} value
 * @returns {number}
 */
function parsePageParam( value ) {
    const page = Number.parseInt( value, 10 );
    return ( Number.isInteger( page ) && page > 0 && page <= 10000 ) ? page : 1;
}

/**
 * Builds the catch-all Express handler that resolves a request path against the content index.
 *
 * @param {import("../content/repository.js")} repository
 * @param {{ baseUrl?: string, renderPage?: function(Object, Object): (string|Object), site?: Object, labels?: Object, assets?: Object }} [options]
 * @returns {function(Object, Object, Function): void}
 */
function contentHandler( repository, options ) {
    const opts = options || {};
    const renderPage = ( typeof opts.renderPage === "function" ) ? opts.renderPage : renderDocument;

    return function ( request, response, next ) {
        const viewer = viewerFromRequest( request );
        // Decoded once, and used everywhere the path is compared against authored data. The nav's current-page test
        // and the capture form's `returnTo` both match against literal characters, so handing them the encoded form
        // would leave a Cyrillic page unhighlighted and its form returning to a path the index does not know.
        const requestPath = decodePath( request.path );
        const result = repository.resolve( requestPath, viewer );

        if ( result.outcome === "alias" ) {
            response.redirect( 301, result.redirectTo );
            return;
        }
        if ( result.outcome === "miss" ) {
            // Hidden, unpublished, or unknown -- indistinguishable from the outside, by design.
            next();
            return;
        }

        const record = result.record;
        const mode = ( result.outcome === "gated" ) ? "teaser" : "full";
        const preview = result.preview === true;
        const counterpart = record.translationOf ? repository.getById( record.translationOf, viewer ) : null;
        const context = {
            mode: mode,
            viewer: viewer,
            repository: repository,
            baseUrl: opts.baseUrl || "",
            lang: record.lang,
            counterpart: counterpart ? counterpart.record : null,
            nonce: response.locals ? response.locals.nonce : undefined,
            csrfToken: request.session ? request.session.csrfToken : undefined,
            path: requestPath,
            // Set by the capture endpoint's POST-Redirect-GET, so the outcome survives without JavaScript.
            captureStatus: ( request.query || {} ).capture,
            page: parsePageParam( ( request.query || {} ).page ),
            site: opts.site,
            labels: opts.labels,
            assets: opts.assets,
            taxonomy: opts.taxonomy,
            // Which sign-in methods exist is site configuration, not viewer state -- safe to render into a
            // shared-cached page, unlike anything about WHO is asking.
            auth: opts.auth,
            preview: preview
        };

        // Everything the templates need beyond the record itself: eyebrow, meta, terms, breadcrumb, prev/next.
        // Built for THIS viewer, so adjacent-post links can never point at a record the repository would withhold.
        Object.assign( context, buildPageContext( record, {
            repository: repository,
            taxonomy: opts.taxonomy,
            site: opts.site,
            labels: opts.labels,
            viewer: viewer
        } ) );

        // Render BEFORE the headers are chosen. Whether a page is shareable is not knowable from the record alone:
        // a section may embed the session's CSRF token, and a response carrying one is per-session however public
        // the record is. Rendering first lets the renderer say so.
        let perSession = false;
        context.markPerSession = function () {
            perSession = true;
        };
        // The render layer stays free of infrastructure: it reports, this layer logs.
        context.reportProblem = function ( message ) {
            logger.log( `${ message } (while rendering '${ record.path }')`, logger.logSeverity.ERROR );
        };
        const body = String( renderPage( record, context ) );

        const headers = perSession
            ? { "Cache-Control": PRIVATE_CACHE_CONTROL, "Vary": "Cookie" }
            : cacheHeadersFor( record );
        for ( const name of Object.keys( headers ) ) {
            response.set( name, headers[ name ] );
        }

        response.status( 200 ).type( "html" ).send( body );
    };
}

module.exports = {
    cacheHeadersFor: cacheHeadersFor,
    viewerFromRequest: viewerFromRequest,
    parsePageParam: parsePageParam,
    decodePath: decodePath,
    contentHandler: contentHandler
};
