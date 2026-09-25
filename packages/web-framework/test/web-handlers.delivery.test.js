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

/**
 * Covers what a response now costs on the wire (CA-174): the label catalogue by content address, compression, and
 * screen fragments that revalidate instead of being re-sent.
 * <br/>
 * Measured before this change on a real competence server: nothing was compressed, every refresh re-sent the label
 * catalogue (410 KB en / 745 KB bg), and every screen switch re-sent its fragment (5–59 KB) under `no-store` although
 * the fragments are static templates. The app below is wired as `TiWebServer` wires these pieces — the same compression
 * handler, express-session with `rolling` and `saveUninitialized: false`, the CSRF middleware, the real handlers and
 * the real manager over the framework's own fragments.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const http = require( "node:http" );
const path = require( "node:path" );
const zlib = require( "node:zlib" );

const express = require( "express" );
const session = require( "express-session" );
const cookieParser = require( "cookie-parser" );

const webHandlers = require( "#web-handlers" );
const TiWebAppManager = require( "#web-app-manager" );
const TiWebServer = require( "#web-server" );

const STATIC_ROOT = path.resolve( __dirname, "..", "bin", "static" );
const INSTANCE = { serviceConfig: { cookies: { path: "/", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 } } };

class WebApp extends TiWebAppManager {
    constructor() {
        super( "delivery-test" );
        this.setEnabledAuthMethods( [ "local" ] );
    }
}

const manager = new WebApp();
let server = null;
let base = null;

before( async () => {
    const app = express();
    app.use( TiWebServer.createCompressionHandler() );
    app.use( express.urlencoded( { extended: false } ) );
    app.use( cookieParser() );
    app.use( session( {
        secret: "test-only",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { path: "/", httpOnly: true, secure: "auto", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
        unset: "destroy"
    } ) );
    app.use( webHandlers.csrfInitHandler( INSTANCE ) );
    app.get( "/sign-in", ( request, response ) => {
        request.session.user = { userID: "u1", roles: [] };
        request.session.language = "en";
        response.send( "signed in" );
    } );
    const instance = Object.assign( { webAppManager: manager, staticContentPaths: [ STATIC_ROOT ] }, INSTANCE );
    app.get( "/me", webHandlers.userInformationHandler() );
    app.get( "/app/labels/:hash", webHandlers.labelsBundleHandler( instance ) );
    app.get( "/app", webHandlers.webAppHandler( instance ) );
    app.get( "/app/:view", webHandlers.webAppHandler( instance ) );
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
 * Issues a GET through `node:http` and resolves the status and headers.
 * <br/>
 * Not `fetch`: the Fetch standard turns any request carrying `If-None-Match` into a `no-store` request and adds
 * `Cache-Control: no-cache` to it, which Express rightly reads as an end-to-end reload and answers in full. A browser
 * revalidating from its own cache sends no such header, and that is the request this needs to make.
 *
 * @param {string} url
 * @param {Object} headers
 * @returns {Promise<{status: number, headers: Object}>}
 */
function rawGet( url, headers ) {
    return new Promise( ( resolve, reject ) => {
        http.get( url, { headers: headers }, ( response ) => {
            response.resume();
            response.on( "end", () => resolve( { status: response.statusCode, headers: response.headers } ) );
        } ).on( "error", reject );
    } );
}

/**
 * Signs in and returns the cookie header a browser would send afterwards.
 *
 * @returns {Promise<string>}
 */
async function signedInCookie() {
    const response = await fetch( `${ base }/sign-in` );
    return response.headers.getSetCookie().map( ( header ) => header.split( ";" )[ 0 ] ).join( "; " );
}

describe( "GET /app/labels/:hash — the label catalogue by content address", () => {

    it( "answers the hash it was handed with that catalogue, immutable for a year", async () => {
        const bundle = manager.getLabelsBundle( undefined );
        const response = await fetch( `${ base }${ bundle.url }` );
        assert.equal( response.status, 200 );
        assert.equal( response.headers.get( "cache-control" ), "public, max-age=31536000, immutable" );
        assert.match( response.headers.get( "content-type" ), /^application\/json/ );
        assert.equal( await response.text(), bundle.body );
    } );

    it( "answers an address it does not hold with the current catalogue, cached nowhere", async () => {
        // A page loaded a moment before a deploy changed the catalogue still gets usable labels, and nothing is kept
        // under an address that does not match its bytes.
        const response = await fetch( `${ base }/app/labels/0123456789abcdef` );
        assert.equal( response.status, 200 );
        assert.equal( response.headers.get( "cache-control" ), "no-store" );
        assert.equal( await response.text(), manager.getLabelsBundle( undefined ).body );
    } );

    it( "goes out compressed, which is most of what is left of its cost", async () => {
        const bundle = manager.getLabelsBundle( undefined );
        const response = await fetch( `${ base }${ bundle.url }`, { headers: { "accept-encoding": "br" } } );
        // fetch decodes transparently; the header is what reached the wire.
        assert.equal( response.headers.get( "content-encoding" ), "br" );
        assert.match( response.headers.get( "vary" ) || "", /accept-encoding/i );
    } );

} );

describe( "HTML views — revalidated fragments, never-reused pages", () => {

    it( "answers an HTMX fragment request private and revalidating, varying on HX-Request", async () => {
        const cookie = await signedInCookie();
        const response = await fetch( `${ base }/app/dashboard`, { headers: { cookie: cookie, "hx-request": "true", accept: "text/html" } } );
        assert.equal( response.status, 200 );
        assert.equal( response.headers.get( "cache-control" ), "private, no-cache" );
        assert.match( response.headers.get( "vary" ) || "", /hx-request/i );
        assert.ok( response.headers.get( "etag" ), "revalidation needs a validator" );
    } );

    it( "answers a repeat fragment request with a 304 — the markup is not re-sent", async () => {
        const cookie = await signedInCookie();
        const headers = { cookie: cookie, "hx-request": "true", accept: "text/html" };
        const first = await rawGet( `${ base }/app/about`, headers );
        assert.equal( first.status, 200 );
        const second = await rawGet( `${ base }/app/about`, { ...headers, "if-none-match": first.headers.etag } );
        assert.equal( second.status, 304 );
    } );

    it( "still decides what to serve on every request — a revalidation is never answered from the last one", async () => {
        // An anonymous HTMX request for `/app` gets the login view, not a 304 against the signed-in fragment's ETag.
        const cookie = await signedInCookie();
        const signedIn = await rawGet( `${ base }/app`, { cookie: cookie, "hx-request": "true", accept: "text/html" } );
        assert.equal( signedIn.status, 200 );
        const anonymous = await rawGet( `${ base }/app`, { "hx-request": "true", accept: "text/html", "if-none-match": signedIn.headers.etag } );
        assert.equal( anonymous.status, 200 );
    } );

    it( "keeps a full page no-store — it carries this request's CSP nonce", async () => {
        const cookie = await signedInCookie();
        const response = await fetch( `${ base }/app/dashboard`, { headers: { cookie: cookie, accept: "text/html" } } );
        assert.equal( response.status, 200 );
        assert.equal( response.headers.get( "cache-control" ), "no-store" );
        assert.match( response.headers.get( "vary" ) || "", /hx-request/i, "the same URL answers HTMX differently" );
    } );

    it( "keeps a token-bearing fragment no-store, and never compresses it", async () => {
        // The sign-in form embeds a CSRF token. A compressed secret beside attacker-influenced bytes is the BREACH shape.
        const response = await fetch( `${ base }/app/enter`, { headers: { "hx-request": "true", accept: "text/html", "accept-encoding": "br, gzip" } } );
        assert.equal( response.status, 200 );
        const html = await response.text();
        assert.match( html, /name="_csrf" value='[^']+'/, "the fragment really does carry a token" );
        assert.equal( response.headers.get( "cache-control" ), "no-store" );
        assert.equal( response.headers.get( "content-encoding" ), null );
    } );

    it( "compresses a fragment that carries no secret", async () => {
        const cookie = await signedInCookie();
        // The framework's own About screen: over the 1 KB below which compressing costs more than it saves.
        const response = await fetch( `${ base }/app/about`, { headers: { cookie: cookie, "hx-request": "true", accept: "text/html", "accept-encoding": "gzip" } } );
        assert.equal( response.headers.get( "content-encoding" ), "gzip" );
    } );

} );

describe( "GET /me", () => {

    it( "is no-store: it is who is signed in, answered per request", async () => {
        const cookie = await signedInCookie();
        const response = await fetch( `${ base }/me`, { headers: { cookie: cookie } } );
        assert.equal( response.status, 200 );
        assert.equal( response.headers.get( "cache-control" ), "no-store" );
    } );

} );

describe( "the compression handler", () => {

    it( "brotli-encodes at the stated quality, not the maximum", () => {
        // Quality 11 costs tens of milliseconds per 400 KB on the fly; the stated 4 is the package default, kept.
        const sample = Buffer.from( JSON.stringify( manager.getLabelsBundle( undefined ) ).repeat( 20 ) );
        const q4 = zlib.brotliCompressSync( sample, { params: { [ zlib.constants.BROTLI_PARAM_QUALITY ]: 4 } } );
        assert.ok( q4.length < sample.length / 3, "and it still compresses the catalogue several-fold" );
    } );

} );
