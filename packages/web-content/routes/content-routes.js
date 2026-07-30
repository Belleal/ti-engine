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

const { composeHead } = require( "#document" );
const { html, raw } = require( "#html" );
const markdown = require( "#markdown" );

const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";
const PRIVATE_CACHE_CONTROL = "private, no-store";

/**
 * The cache headers a record's response must carry. Only `public` visibility is edge-cacheable.
 *
 * @param {Object} record
 * @returns {Object<string, string>}
 */
function cacheHeadersFor( record ) {
    if ( record && record.visibility === "public" ) {
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
    return { authenticated: true, roles: Array.isArray( user.roles ) ? user.roles : [] };
}

/**
 * The body of a fully-visible record, for the fallback page only.
 *
 * Markdown goes through the markdown renderer, which is configured `html: false` (so raw HTML in authored markdown is
 * escaped) and is a sanctioned `raw()` source. `bodyFormat: "html"` is deliberately NOT rendered here: that path is
 * legacy imported content whose safety rests on being sanitised once at import, and the importer (`capture/`) does not
 * exist yet — emitting it now would put unsanitised markup on the page. Such a record renders as its title alone until
 * either the importer or the editorial templates land.
 *
 * @param {Object} record
 * @returns {import("../render/html.js").SafeString}
 */
function renderBody( record ) {
    if ( !record.body || record.bodyFormat === "html" ) {
        return raw( "" );
    }
    return markdown.render( record.body );
}

/**
 * A minimal fallback document -- enough to serve and verify a resolved record before the editorial templates land
 * (P5). The real templates are injected via `options.renderPage`.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {string}
 */
function renderFallbackPage( record, context ) {
    const head = composeHead( record, { baseUrl: context.baseUrl, mode: context.mode, counterpart: context.counterpart } );
    const body = ( context.mode === "teaser" )
        ? html`<article><h1>${ record.title }</h1><p>${ record.teaser || "" }</p><p><a href="/login/local">Sign in to read</a></p></article>`
        : html`<article><h1>${ record.title }</h1>${ renderBody( record ) }</article>`;
    return `<!DOCTYPE html>\n<html lang="${ record.lang || "en" }">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${ head.toString() }\n</head>\n<body>\n${ body.toString() }\n</body>\n</html>\n`;
}

/**
 * Builds the catch-all Express handler that resolves a request path against the content index.
 *
 * @param {import("../content/repository.js")} repository
 * @param {{ baseUrl?: string, renderPage?: function(Object, Object): (string|Object) }} [options]
 * @returns {function(Object, Object, Function): void}
 */
function contentHandler( repository, options ) {
    const opts = options || {};
    const renderPage = ( typeof opts.renderPage === "function" ) ? opts.renderPage : renderFallbackPage;

    return function ( request, response, next ) {
        const viewer = viewerFromRequest( request );
        const result = repository.resolve( request.path, viewer );

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
        const counterpart = record.translationOf ? repository.getById( record.translationOf, viewer ) : null;
        const context = {
            mode: mode,
            viewer: viewer,
            repository: repository,
            baseUrl: opts.baseUrl || "",
            lang: record.lang,
            counterpart: counterpart ? counterpart.record : null,
            nonce: response.locals ? response.locals.nonce : undefined
        };

        const headers = cacheHeadersFor( record );
        for ( const name of Object.keys( headers ) ) {
            response.set( name, headers[ name ] );
        }

        response.status( 200 ).type( "html" ).send( String( renderPage( record, context ) ) );
    };
}

module.exports = {
    cacheHeadersFor: cacheHeadersFor,
    viewerFromRequest: viewerFromRequest,
    renderFallbackPage: renderFallbackPage,
    contentHandler: contentHandler
};
