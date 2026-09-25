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
 * Covers fragments an application declares `immutable` (CA-183), end to end through the real manager and handler.
 * <br/>
 * Two guide chapters link to each other; an ordinary screen links to the first. The questions are the ones that
 * decide whether keeping a screen for good is safe:
 * - does every reference carry the current address?
 * - is only a request for that address answered `immutable`?
 * - does a fragment whose output depends on the request never qualify, whatever it declares?
 * - does the address move when, and only when, a member changes?
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const http = require( "node:http" );
const os = require( "node:os" );
const path = require( "node:path" );

const express = require( "express" );
const session = require( "express-session" );
const cookieParser = require( "cookie-parser" );

const webHandlers = require( "#web-handlers" );
const TiWebAppManager = require( "#web-app-manager" );

const FRAMEWORK_STATIC = path.resolve( __dirname, "..", "bin", "static" );
const INSTANCE = { serviceConfig: { cookies: { path: "/", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 } } };
const KEPT = "private, max-age=31536000, immutable";
const REVALIDATE = "private, no-cache";
const PAGE_NONCE = "cGFnZS1ub25jZS0xMjM0NTY=";
const WORK = fs.mkdtempSync( path.join( os.tmpdir(), "ti-immutable-fragments-" ) );

const CHAPTERS = {
    "fragments/frame-guide-a.html": `<section><h1>A</h1><a hx-get="/app/guide-b" hx-target="#ti-content" hx-push-url="true">Next</a></section>`,
    "fragments/frame-guide-b.html": `<section><h1>B</h1><a hx-get="/app/guide-a" hx-target="#ti-content" hx-push-url="true">Back</a></section>`,
    "fragments/frame-screen.html": `<section><button hx-get="/app/guide-a" hx-push-url="true">Guide</button><div x-data="screen"></div></section>`,
    // Declared immutable, but carries the nonce placeholder, so its output depends on the page it is loaded into.
    "fragments/frame-with-nonce.html": `<section><style nonce="{ti-nonce-placeholder}">h1 { color: red; }</style></section>`
};

/**
 * Writes a static tree of fragments, with overrides, and returns its directory.
 *
 * @param {string} name
 * @param {Object<string, string>} [overrides]
 * @returns {string}
 */
function writeTree( name, overrides ) {
    const root = path.join( WORK, name );
    for ( const [ relative, content ] of Object.entries( { ...CHAPTERS, ...( overrides || {} ) } ) ) {
        fs.mkdirSync( path.dirname( path.join( root, relative ) ), { recursive: true } );
        fs.writeFileSync( path.join( root, relative ), content );
    }
    return root;
}

class GuideApp extends TiWebAppManager {
    constructor() {
        super( "immutable-fragments-test" );
        this.setEnabledAuthMethods( [ "local" ] );
        this.addFragment( "guide-a", { title: "A", path: "fragments/frame-guide-a.html", immutable: true } );
        this.addFragment( "guide-b", { title: "B", path: "fragments/frame-guide-b.html", immutable: true } );
        this.addFragment( "screen", { title: "Screen", path: "fragments/frame-screen.html" } );
        this.addFragment( "with-nonce", { title: "Nonce", path: "fragments/frame-with-nonce.html", immutable: true } );
    }
}

/**
 * Renders a fragment as HTMX asks for it, straight through the manager.
 *
 * @param {TiWebAppManager} manager
 * @param {string[]} staticPaths
 * @param {string} view
 * @returns {Promise<string>}
 */
function renderPartial( manager, staticPaths, view ) {
    return manager.assembleHtmlView( { user: { roles: [] } }, staticPaths, `/app/${ view }`, { view: view, isPartial: true } );
}

/**
 * The version the references in a rendered fragment carry.
 *
 * @param {string} html
 * @returns {string|null}
 */
const versionIn = ( html ) => ( /\?v=([0-9a-f]{12})"/.exec( html ) || [] )[ 1 ] || null;

after( () => fs.rmSync( WORK, { recursive: true, force: true } ) );

describe( "declaring a fragment immutable", () => {

    it( "is refused for a fragment restricted to roles", () => {
        // The browser keeps the copy, not the session: it would be served to the next person, with no role check.
        const manager = new GuideApp();
        assert.throws(
            () => manager.addFragment( "admin-guide", { path: "fragments/frame-guide-a.html", immutable: true, roles: [ "admin" ] } ),
            ( error ) => error.code === 1006
        );
    } );

} );

describe( "serving immutable fragments", () => {

    const STATIC_PATHS = [ FRAMEWORK_STATIC, writeTree( "served" ) ];
    const manager = new GuideApp();
    let server = null;
    let base = null;
    let cookie = null;
    let version = null;

    /**
     * A GET through `node:http`, as a browser sends it: with the session cookie, and as HTMX when asked.
     *
     * @param {string} target
     * @param {boolean} [asHtmx=true]
     * @returns {Promise<{status: number, headers: Object, body: string}>}
     */
    const get = ( target, asHtmx = true ) => new Promise( ( resolve, reject ) => {
        const headers = { cookie: cookie, accept: "text/html" };
        if ( asHtmx ) {
            headers[ "HX-Request" ] = "true";
            headers[ "x-csp-nonce" ] = PAGE_NONCE;
        }
        http.get( `${ base }${ target }`, { headers: headers }, ( response ) => {
            let body = "";
            response.setEncoding( "utf8" );
            response.on( "data", ( chunk ) => {
                body += chunk;
            } );
            response.on( "end", () => resolve( { status: response.statusCode, headers: response.headers, body: body } ) );
        } ).on( "error", reject );
    } );

    before( async () => {
        const app = express();
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
            response.send( "signed in" );
        } );
        app.get( "/app/:view", webHandlers.webAppHandler( Object.assign( { webAppManager: manager, staticContentPaths: STATIC_PATHS }, INSTANCE ) ) );
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
        const signIn = await fetch( `${ base }/sign-in` );
        cookie = signIn.headers.getSetCookie().map( ( header ) => header.split( ";" )[ 0 ] ).join( "; " );
        version = versionIn( ( await get( "/app/screen" ) ).body );
    } );

    after( () => server && server.close() );

    it( "addresses a reference from an ordinary screen, and keeps the pushed URL plain", async () => {
        const screen = await get( "/app/screen" );
        assert.match( version, /^[0-9a-f]{12}$/ );
        assert.match( screen.body, new RegExp( `<button hx-get="/app/guide-a\\?v=${ version }" hx-push-url="/app/guide-a">` ) );
        assert.equal( screen.headers[ "cache-control" ], REVALIDATE, "the ordinary screen itself still revalidates" );
    } );

    it( "answers a request for the current address immutable, and its links carry the same address", async () => {
        const chapter = await get( `/app/guide-a?v=${ version }` );
        assert.equal( chapter.status, 200 );
        assert.equal( chapter.headers[ "cache-control" ], KEPT );
        assert.match( chapter.headers.vary, /HX-Request/ );
        assert.match( chapter.body, new RegExp( `hx-get="/app/guide-b\\?v=${ version }" hx-target="#ti-content" hx-push-url="/app/guide-b"` ) );
    } );

    it( "revalidates a request for a stale address, or for none", async () => {
        // A page loaded before a deployment still links to the old address: it gets the current bytes, not a promise.
        assert.equal( ( await get( "/app/guide-a?v=000000000000" ) ).headers[ "cache-control" ], REVALIDATE );
        assert.equal( ( await get( "/app/guide-a" ) ).headers[ "cache-control" ], REVALIDATE );
    } );

    it( "never keeps a fragment whose output depends on the request, whatever it declares", async () => {
        const withNonce = await get( `/app/with-nonce?v=${ version }` );
        assert.equal( withNonce.status, 200 );
        assert.match( withNonce.body, new RegExp( `nonce="${ PAGE_NONCE }"` ), "the page's nonce was rendered in" );
        assert.equal( withNonce.headers[ "cache-control" ], REVALIDATE );
    } );

    it( "never keeps a full page, which carries its own nonce", async () => {
        const page = await get( `/app/guide-a?v=${ version }`, false );
        assert.equal( page.status, 200 );
        assert.equal( page.headers[ "cache-control" ], "no-store" );
    } );

} );

describe( "the address", () => {

    it( "moves when a member changes, and stays when only an ordinary screen does", async () => {
        const original = [ FRAMEWORK_STATIC, writeTree( "original" ) ];
        const memberEdited = [ FRAMEWORK_STATIC, writeTree( "member-edited", { "fragments/frame-guide-b.html": `<section><h1>B, edited</h1></section>` } ) ];
        const screenEdited = [ FRAMEWORK_STATIC, writeTree( "screen-edited", { "fragments/frame-screen.html": `<section><button hx-get="/app/guide-a" hx-push-url="true">The guide</button></section>` } ) ];

        const originalVersion = versionIn( await renderPartial( new GuideApp(), original, "screen" ) );
        assert.notEqual( versionIn( await renderPartial( new GuideApp(), memberEdited, "screen" ) ), originalVersion );
        assert.equal( versionIn( await renderPartial( new GuideApp(), screenEdited, "screen" ) ), originalVersion );
    } );

    it( "is not given while the fragment file cache is off, as in development", async () => {
        // An edit under a running process would change the bytes but not the address, and the browser would keep the
        // stale copy for good.
        const previous = process.env.TI_WEB_APP_STATIC_CACHE_DISABLED;
        process.env.TI_WEB_APP_STATIC_CACHE_DISABLED = "true";
        try {
            const html = await renderPartial( new GuideApp(), [ FRAMEWORK_STATIC, writeTree( "uncached" ) ], "screen" );
            assert.match( html, /<button hx-get="\/app\/guide-a" hx-push-url="true">/ );
        } finally {
            if ( previous === undefined ) {
                delete process.env.TI_WEB_APP_STATIC_CACHE_DISABLED;
            } else {
                process.env.TI_WEB_APP_STATIC_CACHE_DISABLED = previous;
            }
        }
    } );

} );
