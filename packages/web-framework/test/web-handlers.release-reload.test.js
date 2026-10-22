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
 * Covers how a page left open across a release learns of it, on the server's side (CA-553), end to end through the
 * real manager and handlers:
 * - the release identity, and when it moves;
 * - `X-Ti-Release` on every answer, `/health` and static files included;
 * - `<meta name="ti-release">` in the shell page, the framework's and an application's own;
 * - a screen change from a page of another release, or of none, answered with the page itself, and nothing else so.
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
const WORK = fs.mkdtempSync( path.join( os.tmpdir(), "ti-release-reload-" ) );
const RE_RELEASE = /^[0-9a-f]{16}$/;

/**
 * Writes a static tree of files and returns its directory.
 *
 * @param {string} name
 * @param {Object<string, string>} files
 * @returns {string}
 */
function writeTree( name, files ) {
    const root = path.join( WORK, name );
    for ( const [ relative, content ] of Object.entries( files ) ) {
        fs.mkdirSync( path.dirname( path.join( root, relative ) ), { recursive: true } );
        fs.writeFileSync( path.join( root, relative ), content );
    }
    return root;
}

class ReleaseApp extends TiWebAppManager {
    constructor() {
        super( "release-reload-test" );
        this.setEnabledAuthMethods( [ "local" ] );
        this.addFragment( "screen", { title: "Screen", path: "fragments/frame-screen.html" } );
        this.addFragment( "guide", { title: "Guide", path: "fragments/frame-guide.html", immutable: true } );
    }

    processServiceRequest() {
        return Promise.resolve( { saved: true } );
    }
}

/**
 * Runs a task with the given `TI_WEB_APP_VERSION`, restoring the one before it.
 *
 * @param {string|undefined} version
 * @param {function(): *} task
 * @returns {*}
 */
function withVersion( version, task ) {
    const previous = process.env.TI_WEB_APP_VERSION;
    if ( version === undefined ) {
        delete process.env.TI_WEB_APP_VERSION;
    } else {
        process.env.TI_WEB_APP_VERSION = version;
    }
    try {
        return task();
    } finally {
        if ( previous === undefined ) {
            delete process.env.TI_WEB_APP_VERSION;
        } else {
            process.env.TI_WEB_APP_VERSION = previous;
        }
    }
}

after( () => fs.rmSync( WORK, { recursive: true, force: true } ) );

describe( "the release identity", () => {

    it( "is 16 hexadecimal digits, and the same for the same release", () => {
        const first = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
        const second = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
        assert.match( first, RE_RELEASE );
        assert.equal( second, first, "two processes of one release must agree, or a rollout would reload pages for nothing" );
    } );

    it( "moves with the application's version", () => {
        const before = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
        const after = withVersion( "3.1.1", () => new ReleaseApp().releaseId );
        assert.notEqual( after, before );
    } );

    it( "moves with a framework component's version, the application's unchanged", () => {
        // A framework release adopted without an application version bump still changes what the page runs.
        const original = TiWebAppManager.resolveFrameworkComponents;
        try {
            TiWebAppManager.resolveFrameworkComponents = () => [ { name: "@ti-engine/web-framework", version: "1.60.0" } ];
            const before = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
            TiWebAppManager.resolveFrameworkComponents = () => [ { name: "@ti-engine/web-framework", version: "1.60.1" } ];
            const after = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
            assert.notEqual( after, before );
        } finally {
            TiWebAppManager.resolveFrameworkComponents = original;
        }
    } );

    it( "moves with the manifest's version, where TI_WEB_APP_VERSION pins the one the About screen reports", () => {
        // A deployment that pinned the reported version would otherwise keep one release for good.
        const previous = process.cwd();
        const directory = fs.mkdtempSync( path.join( WORK, "manifest-" ) );
        try {
            process.chdir( directory );
            fs.writeFileSync( "package.json", JSON.stringify( { name: "pinned-app", version: "3.1.0" } ) );
            const before = withVersion( "pinned", () => new ReleaseApp().releaseId );
            fs.writeFileSync( "package.json", JSON.stringify( { name: "pinned-app", version: "3.1.1" } ) );
            const after = withVersion( "pinned", () => new ReleaseApp().releaseId );
            assert.notEqual( after, before );
        } finally {
            process.chdir( previous );
        }
    } );

    it( "names no version", () => {
        // It goes to visitors who have not signed in: the framework's exact versions are nothing to hand them.
        const original = TiWebAppManager.resolveFrameworkComponents;
        try {
            TiWebAppManager.resolveFrameworkComponents = () => [ { name: "@ti-engine/web-framework", version: "1.60.0" } ];
            const releaseId = withVersion( "3.1.0", () => new ReleaseApp().releaseId );
            assert.doesNotMatch( releaseId, /1\.60\.0|3\.1\.0|ti-engine/ );
        } finally {
            TiWebAppManager.resolveFrameworkComponents = original;
        }
    } );

} );

describe( "the shell page", () => {

    const SCREENS = { "fragments/frame-screen.html": "<section>Screen</section>", "fragments/frame-guide.html": "<section>Guide</section>" };

    it( "carries the release right after its opening head tag", async () => {
        const manager = new ReleaseApp();
        const html = await manager.assembleHtmlView( null, [ FRAMEWORK_STATIC, writeTree( "framework-index", SCREENS ) ], "/", {} );
        assert.ok( html.includes( `<head>\n    <meta name="ti-release" content="${ manager.releaseId }"/>` ), "the tag follows <head>" );
        assert.equal( html.match( /name="ti-release"/g ).length, 1 );
    } );

    it( "carries it in an application's own index.html, which has no placeholder for it", async () => {
        const manager = new ReleaseApp();
        const ownIndex = `<!DOCTYPE html>\n<html lang="en">\n<HEAD data-app="own">\n<title>Own</title>\n</HEAD>\n<body>own shell</body>\n</html>`;
        const html = await manager.assembleHtmlView( null, [ FRAMEWORK_STATIC, writeTree( "own-index", { ...SCREENS, "index.html": ownIndex } ) ], "/", {} );
        assert.match( html, /own shell/, "the application's own shell page was rendered" );
        assert.ok( html.includes( `<HEAD data-app="own">\n    <meta name="ti-release" content="${ manager.releaseId }"/>` ) );
    } );

    it( "carries it in a shell page with no head tag, or with neither head nor html tag", async () => {
        // HTML lets both tags be left out. A page without the tag names no release, and the server would answer every
        // screen change it makes with the whole page.
        const shells = {
            "no-head": `<!DOCTYPE html>\n<html lang="en">\n<title>Own</title>\n<body>own shell</body>\n</html>`,
            "doctype-only": `<!DOCTYPE html>\n<title>Own</title>\n<body>own shell</body>`,
            "bare": `<title>Own</title><body>own shell</body>`
        };
        const expected = {
            "no-head": /<html lang="en">\n {4}<meta name="ti-release" content="[0-9a-f]{16}"\/>/,
            "doctype-only": /^<!DOCTYPE html>\n {4}<meta name="ti-release" content="[0-9a-f]{16}"\/>/,
            "bare": /^<meta name="ti-release" content="[0-9a-f]{16}"\/>\n<title>/
        };
        for ( const [ name, index ] of Object.entries( shells ) ) {
            const html = await new ReleaseApp().assembleHtmlView( null, [ FRAMEWORK_STATIC, writeTree( name, { ...SCREENS, "index.html": index } ) ], "/", {} );
            assert.match( html, expected[ name ], name );
            assert.equal( html.match( /name="ti-release"/g ).length, 1, name );
        }
    } );

    it( "carries it in the shell of an application whose transformHtml never calls the base", async () => {
        // `transformHtml` is the application's to override: the tag must not depend on it.
        class OwnTransform extends ReleaseApp {
            transformHtml( html ) {
                return Promise.resolve( String( html ).replace( "own shell", "own shell, transformed" ) );
            }
        }
        const manager = new OwnTransform();
        const ownIndex = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>Own</title>\n</head>\n<body>own shell</body>\n</html>`;
        const html = await manager.assembleHtmlView( null, [ FRAMEWORK_STATIC, writeTree( "own-transform", { ...SCREENS, "index.html": ownIndex } ) ], "/", {} );
        assert.match( html, /own shell, transformed/ );
        assert.ok( html.includes( `<head>\n    <meta name="ti-release" content="${ manager.releaseId }"/>` ) );
    } );

    it( "carries it on a screen loaded as a page, and never in a screen swapped into one", async () => {
        const manager = new ReleaseApp();
        const paths = [ FRAMEWORK_STATIC, writeTree( "screen-page", SCREENS ) ];
        const session = { user: { userID: "u1", roles: [] } };
        const page = await manager.assembleHtmlView( session, paths, "/app/screen", { view: "screen" } );
        const partial = await manager.assembleHtmlView( session, paths, "/app/screen", { view: "screen", isPartial: true } );
        assert.equal( page.match( /name="ti-release"/g ).length, 1 );
        assert.doesNotMatch( partial, /ti-release/ );
    } );

} );

describe( "answering a page of another release", () => {

    const STATIC_PATHS = [ FRAMEWORK_STATIC, writeTree( "served", {
        "fragments/frame-screen.html": "<section>Screen<a hx-get=\"/app/guide\" hx-target=\"#ti-content\" hx-push-url=\"true\">Guide</a></section>",
        "fragments/frame-guide.html": "<section>Guide</section>",
        "scripts/app.css": "body { margin: 0; }"
    } ) ];
    const manager = new ReleaseApp();
    const OLDER = "0123456789abcdef";
    let server = null;
    let base = null;
    let cookie = null;

    /**
     * A request through `node:http`, with the session cookie, as HTMX sends one when `htmx` names its target.
     *
     * @param {string} method
     * @param {string} target
     * @param {{htmx?: string, release?: string, accept?: string, body?: Object}} [options]
     * @returns {Promise<{status: number, headers: Object, body: string}>}
     */
    const send = ( method, target, options = {} ) => new Promise( ( resolve, reject ) => {
        const headers = { cookie: cookie, accept: options.accept || "text/html" };
        if ( options.htmx !== undefined ) {
            headers[ "HX-Request" ] = "true";
            if ( options.htmx !== "" ) {
                headers[ "HX-Target" ] = options.htmx;
            }
        }
        if ( options.release !== undefined ) {
            headers[ "X-Ti-Release" ] = options.release;
        }
        const payload = options.body ? JSON.stringify( options.body ) : null;
        if ( payload ) {
            headers[ "content-type" ] = "application/json";
        }
        const request = http.request( `${ base }${ target }`, { method: method, headers: headers }, ( response ) => {
            let body = "";
            response.setEncoding( "utf8" );
            response.on( "data", ( chunk ) => {
                body += chunk;
            } );
            response.on( "end", () => resolve( { status: response.statusCode, headers: response.headers, body: body } ) );
        } );
        request.on( "error", reject );
        request.end( payload );
    } );

    before( async () => {
        const instance = Object.assign( { webAppManager: manager, staticContentPaths: STATIC_PATHS }, INSTANCE );
        const app = express();
        app.use( webHandlers.releaseHeaderHandler( instance ) );
        app.use( "/static", express.static( STATIC_PATHS[ 1 ] ) );
        app.get( "/health", webHandlers.healthHandler() );
        app.use( express.json() );
        app.use( cookieParser() );
        app.use( session( {
            secret: "test-only",
            resave: false,
            saveUninitialized: false,
            cookie: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
        } ) );
        app.use( webHandlers.csrfInitHandler( INSTANCE ) );
        app.get( "/sign-in", ( request, response ) => {
            request.session.user = { userID: "u1", roles: [] };
            response.send( "signed in" );
        } );
        app.get( "/", webHandlers.webAppHandler( instance ) );
        app.get( "/app/:view", webHandlers.webAppHandler( instance ) );
        app.post( "/app/:service", webHandlers.webAppHandler( instance ) );
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
    } );

    after( () => server && server.close() );

    it( "names the release on every answer: a health probe, a static file, a page, a screen and data", async () => {
        const answers = [
            await send( "GET", "/health", { accept: "application/json" } ),
            await send( "HEAD", "/health" ),
            await send( "GET", "/static/scripts/app.css", { accept: "text/css" } ),
            await send( "GET", "/" ),
            await send( "GET", "/app/screen", { htmx: "ti-content", release: manager.releaseId } ),
            await send( "GET", "/app/config", { accept: "application/json", release: OLDER } ),
            await send( "GET", "/app/missing", { htmx: "ti-content", release: manager.releaseId } )
        ];
        assert.deepEqual( answers.map( ( answer ) => answer.status ), [ 200, 200, 200, 200, 200, 200, 404 ] );
        answers.forEach( ( answer ) => assert.equal( answer.headers[ "x-ti-release" ], manager.releaseId ) );
    } );

    it( "loads a screen whole for a page of an older release", async () => {
        const answer = await send( "GET", "/app/screen", { htmx: "ti-content", release: OLDER } );
        assert.equal( answer.status, 200 );
        assert.equal( answer.headers[ "hx-redirect" ], "/app/screen" );
        assert.equal( answer.headers[ "cache-control" ], "no-store" );
        assert.match( answer.headers.vary, /HX-Request/ );
        assert.match( answer.headers.vary, /X-Ti-Release/ );
        assert.equal( answer.body, "", "nothing to swap: HTMX follows HX-Redirect before it swaps anything" );
    } );

    it( "loads a screen whole for a page from before releases were named", async () => {
        const answer = await send( "GET", "/app/screen?cycle=7", { htmx: "ti-content" } );
        assert.equal( answer.headers[ "hx-redirect" ], "/app/screen?cycle=7", "the query is kept: it is part of the screen" );
    } );

    it( "drops the content address of an immutable fragment from the address it loads", async () => {
        // The screen's own link pushes the plain address (CA-183); a page loaded at `?v=` would show it for no reason.
        const answer = await send( "GET", "/app/guide?v=000000000000&section=2", { htmx: "ti-content", release: OLDER } );
        assert.equal( answer.headers[ "hx-redirect" ], "/app/guide?section=2" );
    } );

    it( "answers a screen change from the current release with the screen", async () => {
        const answer = await send( "GET", "/app/screen", { htmx: "ti-content", release: manager.releaseId } );
        assert.equal( answer.status, 200 );
        assert.equal( answer.headers[ "hx-redirect" ], undefined );
        assert.match( answer.body, /<section>Screen/ );
    } );

    it( "varies every screen it answers on the page's release, the ones the browser keeps above all", async () => {
        // A fragment kept from an earlier release answered a page of the current one from the browser's cache, with the
        // release that served it, and told that page a newer one was live (measured in Chromium).
        const screen = await send( "GET", "/app/screen", { htmx: "ti-content", release: manager.releaseId } );
        const version = ( /hx-get="\/app\/guide\?v=([0-9a-f]{12})"/.exec( screen.body ) || [] )[ 1 ];
        assert.ok( version, "the screen addresses the immutable guide" );
        const kept = await send( "GET", `/app/guide?v=${ version }`, { htmx: "ti-content", release: manager.releaseId } );
        assert.equal( kept.headers[ "cache-control" ], "private, max-age=31536000, immutable" );
        for ( const answer of [ screen, kept ] ) {
            assert.match( answer.headers.vary, /X-Ti-Release/ );
            assert.match( answer.headers.vary, /HX-Request/ );
        }
    } );

    it( "never lets a page of another release keep a fragment for good", async () => {
        // An outgoing instance in a rollout, asked by a page of the new release: kept, its header would tell that page
        // another release was live, from the cache, for a year.
        const screen = await send( "GET", "/app/screen", { htmx: "ti-content", release: manager.releaseId } );
        const version = /hx-get="\/app\/guide\?v=([0-9a-f]{12})"/.exec( screen.body )[ 1 ];
        for ( const release of [ OLDER, undefined ] ) {
            const answer = await send( "GET", `/app/guide?v=${ version }`, { htmx: "ti-panel", release: release } );
            assert.equal( answer.status, 200 );
            assert.equal( answer.headers[ "cache-control" ], "private, no-cache", String( release ) );
        }
    } );

    it( "answers as before 1.60.0 for a manager that names no release", async () => {
        // It has nothing to compare with: a redirect would reload every page that names one, a tag would read
        // "undefined", and an immutable fragment would never be kept again.
        const screen = await send( "GET", "/app/screen", { htmx: "ti-content", release: manager.releaseId } );
        const version = /hx-get="\/app\/guide\?v=([0-9a-f]{12})"/.exec( screen.body )[ 1 ];
        Object.defineProperty( manager, "releaseId", { configurable: true, get: () => undefined } );
        try {
            const changed = await send( "GET", "/app/screen", { htmx: "ti-content", release: OLDER } );
            assert.equal( changed.headers[ "hx-redirect" ], undefined );
            assert.match( changed.body, /<section>Screen/ );
            assert.equal( changed.headers[ "x-ti-release" ], undefined );
            const page = await send( "GET", "/" );
            assert.doesNotMatch( page.body, /ti-release/ );
            const kept = await send( "GET", `/app/guide?v=${ version }`, { htmx: "ti-panel" } );
            assert.equal( kept.headers[ "cache-control" ], "private, max-age=31536000, immutable" );
        } finally {
            delete manager.releaseId;
        }
    } );

    it( "answers everything else from an older page as before", async () => {
        // A write, a fragment aimed anywhere else and a page's own load are never a screen change: a reload there could
        // land in the middle of a save, or swap a whole page into a part of one.
        const write = await send( "POST", "/app/save", { htmx: "ti-content", release: OLDER, accept: "application/json", body: { value: 1 } } );
        const elsewhere = await send( "GET", "/app/screen", { htmx: "ti-sidebar", release: OLDER } );
        const untargeted = await send( "GET", "/app/screen", { htmx: "", release: OLDER } );
        const page = await send( "GET", "/app/screen", { release: OLDER } );
        const data = await send( "GET", "/app/config", { htmx: "ti-content", release: OLDER, accept: "application/json" } );

        assert.equal( write.status, 200 );
        assert.deepEqual( JSON.parse( write.body ), { isSuccessful: true, data: { saved: true } } );
        assert.match( elsewhere.body, /<section>Screen/ );
        assert.match( untargeted.body, /<section>Screen/ );
        assert.match( page.body, /name="ti-release"/ );
        assert.equal( data.status, 200 );
        [ write, elsewhere, untargeted, page, data ].forEach( ( answer ) => assert.equal( answer.headers[ "hx-redirect" ], undefined ) );
    } );

} );
