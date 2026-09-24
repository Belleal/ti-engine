/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
/*
 * When a CSRF token is minted, and what that costs a page that could otherwise be shared by a cache.
 *
 * `csrfInitHandler` used to write a token into the session on every GET that found none. That write is what makes
 * express-session save a brand-new session and cookie it (`saveUninitialized: false` only holds while nothing writes),
 * and the handler then set the `ti-xsrf-token` cookie on every GET as well. So every response to a first-time visitor
 * - a stylesheet included - carried two `Set-Cookie` headers, was private, and could not be shared by a CDN.
 *
 * Tokens are now minted on demand: eagerly only for a session that already exists, through `request.csrfToken()` for
 * a page that renders one, and through `GET /csrf-token` for a script about to submit. What must NOT change is below
 * too: a state-changing request still needs the session's own token.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const express = require( "express" );
const session = require( "express-session" );
const cookieParser = require( "cookie-parser" );

const webHandlers = require( "#web-handlers" );

const webServerSource = fs.readFileSync( path.resolve( __dirname, "..", "bin", "web-server.js" ), "utf8" );

// Only what csrfInitHandler reads from the server.
const INSTANCE = { serviceConfig: { cookies: { path: "/", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 } } };

let server = null;
let base = null;

before( async () => {
    const app = express();
    app.use( express.urlencoded( { extended: false } ) );
    app.use( cookieParser() );
    // Wired as TiWebServer wires it: saveUninitialized off and rolling on are the two options this depends on.
    app.use( session( {
        secret: "test-only",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { path: "/", httpOnly: true, secure: "auto", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
        unset: "destroy"
    } ) );
    app.use( webHandlers.csrfInitHandler( INSTANCE ) );
    app.use( webHandlers.csrfProtectionHandler() );

    // Touches nothing: the shape of a public page, a stylesheet, a sitemap.
    app.get( "/page", ( request, response ) => response.send( "public" ) );
    // Renders a token into its markup, as a sign-in form or a capture form does.
    app.get( "/form", ( request, response ) => response.send( `<input name="csrfToken" value="${ request.csrfToken() }">` ) );
    // What a sign-in leaves behind: a session carrying a user, and no token yet.
    app.get( "/sign-in", ( request, response ) => {
        request.session.user = { userID: "u1" };
        response.send( "signed in" );
    } );
    app.get( "/csrf-token", webHandlers.csrfTokenHandler() );
    app.post( "/submit", ( request, response ) => response.send( "accepted" ) );
    // Four parameters, or Express does not treat it as an error handler.
    app.use( ( error, request, response, next ) => {
        if ( response.headersSent ) {
            next( error );
        } else {
            response.status( Number( error.httpCode ) || 500 ).send( "rejected" );
        }
    } );

    await new Promise( ( resolve ) => {
        server = app.listen( 0, "127.0.0.1", resolve );
    } );
    base = `http://127.0.0.1:${ server.address().port }`;
} );

after( () => server && server.close() );

/**
 * Every `Set-Cookie` a response carried, by cookie name.
 *
 * @param {Response} response
 * @returns {Object<string, string[]>}
 */
function cookiesSet( response ) {
    const byName = {};
    for ( const header of response.headers.getSetCookie() ) {
        const pair = header.split( ";" )[ 0 ];
        const name = pair.slice( 0, pair.indexOf( "=" ) );
        ( byName[ name ] = byName[ name ] || [] ).push( decodeURIComponent( pair.slice( pair.indexOf( "=" ) + 1 ) ) );
    }
    return byName;
}

/**
 * The `Cookie` header a browser would send back after this response.
 *
 * @param {Response} response
 * @returns {string}
 */
function cookieJar( response ) {
    return response.headers.getSetCookie().map( ( header ) => header.split( ";" )[ 0 ] ).join( "; " );
}

describe( "CSRF tokens — minted only where one is needed", () => {

    it( "sets no cookie at all on an anonymous page view", async () => {
        // The regression. This response used to carry `connect.sid` and `ti-xsrf-token`, which made it private and
        // uncacheable for a visitor who had asked for nothing.
        const response = await fetch( `${ base }/page` );
        assert.equal( response.status, 200 );
        assert.deepEqual( response.headers.getSetCookie(), [] );
    } );

    it( "mints a token, and the session to hold it, for a page that renders one", async () => {
        const response = await fetch( `${ base }/form` );
        const cookies = cookiesSet( response );
        const rendered = /value="([^"]+)"/.exec( await response.text() )[ 1 ];

        assert.ok( cookies[ "connect.sid" ], "the session holding the token must be saved and cookied" );
        assert.deepEqual( cookies[ "ti-xsrf-token" ], [ rendered ], "the cookie and the markup must carry the same token" );
    } );

    it( "hands a script its token through GET /csrf-token: no body, never cacheable", async () => {
        const response = await fetch( `${ base }/csrf-token` );
        assert.equal( response.status, 204 );
        assert.equal( response.headers.get( "cache-control" ), "no-store" );
        assert.equal( ( await response.text() ).length, 0 );

        const cookies = cookiesSet( response );
        assert.ok( cookies[ "connect.sid" ] );
        assert.equal( cookies[ "ti-xsrf-token" ].length, 1 );
    } );

    it( "keeps an existing session's token exposed, refreshed but unchanged", async () => {
        const minted = await fetch( `${ base }/csrf-token` );
        const token = cookiesSet( minted )[ "ti-xsrf-token" ][ 0 ];

        const later = await fetch( `${ base }/page`, { headers: { cookie: cookieJar( minted ) } } );
        assert.deepEqual( cookiesSet( later )[ "ti-xsrf-token" ], [ token ] );
    } );

    it( "gives a signed-in session a token on its next page view, as before", async () => {
        // The htmx and fetch clients read the token from the cookie, and a signed-in user's pages are private
        // anyway; minting here is what keeps every signed-in request working.
        const signIn = await fetch( `${ base }/sign-in` );
        assert.equal( cookiesSet( signIn )[ "ti-xsrf-token" ], undefined, "the sign-in response itself mints nothing" );

        const next = await fetch( `${ base }/page`, { headers: { cookie: cookieJar( signIn ) } } );
        assert.equal( cookiesSet( next )[ "ti-xsrf-token" ].length, 1 );
    } );

    it( "sets the cookie once when a page both refreshes a session's token and renders it", async () => {
        const minted = await fetch( `${ base }/csrf-token` );
        const response = await fetch( `${ base }/form`, { headers: { cookie: cookieJar( minted ) } } );
        assert.equal( cookiesSet( response )[ "ti-xsrf-token" ].length, 1 );
    } );

} );

describe( "CSRF tokens — what did not change", () => {

    it( "accepts a state-changing request carrying the session's token", async () => {
        const minted = await fetch( `${ base }/csrf-token` );
        const token = cookiesSet( minted )[ "ti-xsrf-token" ][ 0 ];
        const response = await fetch( `${ base }/submit`, {
            method: "POST",
            headers: { "cookie": cookieJar( minted ), "x-xsrf-token": token, "content-type": "application/x-www-form-urlencoded" },
            body: "field=value"
        } );
        assert.equal( response.status, 200 );
    } );

    it( "refuses one carrying a different token, or none", async () => {
        const minted = await fetch( `${ base }/csrf-token` );
        for ( const headers of [ { "x-xsrf-token": "not-the-token" }, {} ] ) {
            const response = await fetch( `${ base }/submit`, { method: "POST", headers: Object.assign( { cookie: cookieJar( minted ) }, headers ) } );
            assert.equal( response.status, 403 );
        }
    } );

    it( "refuses one from a visitor who never had a session", async () => {
        const response = await fetch( `${ base }/submit`, { method: "POST", headers: { "x-xsrf-token": "anything" } } );
        assert.equal( response.status, 403 );
    } );

} );

describe( "CSRF tokens — the server mounts the endpoint for everyone", () => {

    it( "registers GET /csrf-token", () => {
        assert.match( webServerSource, /get\( "\/csrf-token", webHandlers\.csrfTokenHandler\(\) \)/ );
    } );

    it( "leaves it unprotected, because the sign-in form needs a token before anyone is signed in", () => {
        assert.match( webServerSource, /#unprotectedRoutes\.push\( "\/csrf-token" \)/ );
    } );

} );
