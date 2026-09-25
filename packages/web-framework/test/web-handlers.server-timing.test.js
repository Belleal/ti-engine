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
 * Covers the opt-in `Server-Timing` header (CA-183).
 * <br/>
 * On competence's hosted deployment, a revisited screen took 0.6-0.9 s while the process spent 4-7 ms on it, and
 * nothing in the response said which part was which. The app below is wired as `TiWebServer` wires these pieces when
 * `serverTiming` is on: the timing handler first, then compression and `/static`, then the session behind
 * `timedHandler`, then the real handlers and the real manager. The session store answers after a known delay, so the
 * `session` metric can be held to it.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const http = require( "node:http" );
const path = require( "node:path" );

const express = require( "express" );
const session = require( "express-session" );
const cookieParser = require( "cookie-parser" );

const webHandlers = require( "#web-handlers" );
const TiWebAppManager = require( "#web-app-manager" );
const TiWebServer = require( "#web-server" );

const STATIC_ROOT = path.resolve( __dirname, "..", "bin", "static" );
const INSTANCE = { serviceConfig: { cookies: { path: "/", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 } } };
const STORE_DELAY_MS = 40;

class WebApp extends TiWebAppManager {
    constructor() {
        super( "server-timing-test" );
        this.setEnabledAuthMethods( [ "local" ] );
    }
}

/**
 * The in-memory store, answering every read after a fixed delay, as a store across a network does.
 */
class SlowStore extends session.MemoryStore {
    get( sessionID, callback ) {
        setTimeout( () => super.get( sessionID, callback ), STORE_DELAY_MS );
    }
}

const WRITEHEAD_ROUTES = [ "/writehead-object", "/writehead-message", "/writehead-array" ];

/**
 * Routes that hand their own Server-Timing to `writeHead`, in each of the three forms Node accepts. Node applies
 * headers passed that way over those set with `setHeader` before it.
 *
 * @param {express.Express} app
 */
function mountWriteHeadRoutes( app ) {
    app.get( "/writehead-object", ( request, response ) => {
        response.writeHead( 200, { "Server-Timing": "db;dur=5", "content-type": "text/plain" } );
        response.end( "ok" );
    } );
    app.get( "/writehead-message", ( request, response ) => {
        response.writeHead( 200, "Fine", { "server-timing": "db;dur=5", "content-type": "text/plain" } );
        response.end( "ok" );
    } );
    app.get( "/writehead-array", ( request, response ) => {
        response.writeHead( 200, [ "Server-Timing", "db;dur=5", "content-type", "text/plain" ] );
        response.end( "ok" );
    } );
}

/**
 * Asserts that each writeHead route answered with its own metric, the timing handler's, and its other headers.
 *
 * @param {string} base
 * @param {Object} headers
 * @param {string[]} expected The timing handler's metric names.
 */
async function assertWriteHeadRoutesKeepEveryMetric( base, headers, expected ) {
    for ( const route of WRITEHEAD_ROUTES ) {
        const response = await rawGet( `${ base }${ route }`, headers );
        const metrics = metricsOf( [].concat( response.headers[ "server-timing" ] ).join( ", " ) );
        assert.equal( metrics.db && metrics.db.dur, 5, `${ route }: the handler's own metric` );
        for ( const name of expected ) {
            assert.ok( metrics[ name ], `${ route }: no ${ name } in ${ response.headers[ "server-timing" ] }` );
        }
        assert.equal( response.headers[ "content-type" ], "text/plain", `${ route }: the handler's other headers` );
    }
}

/**
 * Starts an app wired as `TiWebServer` wires it with `serverTiming` on.
 *
 * @param {Object} instance What the timing handler reads: `describeInstance`.
 * @returns {Promise<{server: http.Server, base: string}>}
 */
async function startApp( instance ) {
    const app = express();
    app.use( webHandlers.serverTimingHandler( instance ) );
    app.use( TiWebServer.createCompressionHandler() );
    app.use( "/static", express.static( STATIC_ROOT ) );
    app.use( cookieParser() );
    app.use( webHandlers.timedHandler( "session", session( {
        secret: "test-only",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { path: "/", httpOnly: true, secure: "auto", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
        unset: "destroy",
        store: new SlowStore()
    } ) ) );
    app.use( webHandlers.csrfInitHandler( INSTANCE ) );
    app.get( "/sign-in", ( request, response ) => {
        request.session.user = { userID: "u1", roles: [] };
        response.send( "signed in" );
    } );
    app.get( "/measured-downstream", ( request, response ) => {
        // As a handler that measured something of its own would.
        response.setHeader( "Server-Timing", "db;dur=5" );
        response.send( "ok" );
    } );
    mountWriteHeadRoutes( app );
    const manager = new WebApp();
    app.get( "/app/:view", webHandlers.webAppHandler( Object.assign( { webAppManager: manager, staticContentPaths: [ STATIC_ROOT ] }, INSTANCE ) ) );
    const server = await new Promise( ( resolve ) => {
        const listening = app.listen( 0, "127.0.0.1", () => resolve( listening ) );
    } );
    return { server: server, base: `http://127.0.0.1:${ server.address().port }` };
}

/**
 * A GET through `node:http`, which, unlike `fetch`, sends `If-None-Match` without adding `Cache-Control: no-cache`.
 *
 * @param {string} url
 * @param {Object} [headers]
 * @returns {Promise<{status: number, headers: Object}>}
 */
function rawGet( url, headers ) {
    return new Promise( ( resolve, reject ) => {
        http.get( url, { headers: headers || {} }, ( response ) => {
            response.resume();
            response.on( "end", () => resolve( { status: response.statusCode, headers: response.headers } ) );
        } ).on( "error", reject );
    } );
}

/**
 * Parses a `Server-Timing` header into { name: { dur, desc } }.
 *
 * @param {string} header
 * @returns {Object<string, {dur: number, desc: (string|undefined)}>}
 */
function metricsOf( header ) {
    const metrics = {};
    for ( const entry of String( header || "" ).split( /,(?=\s*[a-z]+;)/ ) ) {
        const [ name, ...parameters ] = entry.trim().split( ";" );
        const metric = {};
        for ( const parameter of parameters ) {
            const at = parameter.indexOf( "=" );
            const key = parameter.slice( 0, at );
            const value = parameter.slice( at + 1 );
            metric[ key ] = ( key === "dur" ) ? Number( value ) : value;
        }
        metrics[ name ] = metric;
    }
    return metrics;
}

describe( "Server-Timing, when it is on", () => {

    let server = null;
    let base = null;
    let cookie = null;

    before( async () => {
        ( { server, base } = await startApp( { describeInstance: () => "Frankfurt am Main (WEUR)" } ) );
        const signIn = await fetch( `${ base }/sign-in` );
        cookie = signIn.headers.getSetCookie().map( ( header ) => header.split( ";" )[ 0 ] ).join( "; " );
    } );

    after( () => server && server.close() );

    it( "times a screen: the whole of the process as `app`, with where it runs, and the session lookup as `session`", async () => {
        const response = await rawGet( `${ base }/app/dashboard`, { cookie: cookie, accept: "text/html", "HX-Request": "true" } );
        assert.equal( response.status, 200 );
        const metrics = metricsOf( response.headers[ "server-timing" ] );
        assert.equal( metrics.app.desc, "\"Frankfurt am Main (WEUR)\"" );
        assert.ok( metrics.session.dur >= STORE_DELAY_MS - 1, `session ${ metrics.session.dur } ms, the store takes ${ STORE_DELAY_MS }` );
        assert.ok( metrics.app.dur >= metrics.session.dur, "the session lookup happens inside the process's time" );
    } );

    it( "times a 304 as well: a revalidation still costs the session lookup", async () => {
        const first = await rawGet( `${ base }/app/dashboard`, { cookie: cookie, accept: "text/html", "HX-Request": "true" } );
        const again = await rawGet( `${ base }/app/dashboard`, { cookie: cookie, accept: "text/html", "HX-Request": "true", "If-None-Match": first.headers.etag } );
        assert.equal( again.status, 304 );
        const metrics = metricsOf( again.headers[ "server-timing" ] );
        assert.ok( metrics.app && metrics.session, again.headers[ "server-timing" ] );
    } );

    it( "times a static file without a session metric, because /static is served before the session", async () => {
        const response = await rawGet( `${ base }/static/scripts/ti-framework.css`, { cookie: cookie } );
        assert.equal( response.status, 200 );
        const metrics = metricsOf( response.headers[ "server-timing" ] );
        assert.ok( metrics.app );
        assert.equal( metrics.session, undefined );
    } );

    it( "adds to a Server-Timing header a handler set, rather than replacing it", async () => {
        const response = await rawGet( `${ base }/measured-downstream`, { cookie: cookie } );
        const metrics = metricsOf( response.headers[ "server-timing" ] );
        assert.equal( metrics.db.dur, 5 );
        assert.ok( metrics.app && metrics.session );
    } );

    it( "adds to a Server-Timing a handler passes to writeHead, in every form Node accepts, and keeps its other headers", async () => {
        await assertWriteHeadRoutesKeepEveryMetric( base, { cookie: cookie }, [ "app", "session" ] );
    } );

} );

describe( "Server-Timing, with nothing between it and the handler", () => {

    it( "still adds to a Server-Timing the handler passes to writeHead", async () => {
        // In the server, compression and express-session sit between the two and turn writeHead's headers into
        // setHeader calls first, which hid this. On its own, the timing handler's metrics were replaced by the
        // handler's: Node lets headers passed to writeHead win over those set before it (CodeRabbit on #167).
        const app = express();
        app.use( webHandlers.serverTimingHandler( { describeInstance: () => "here" } ) );
        mountWriteHeadRoutes( app );
        const server = await new Promise( ( resolve ) => {
            const listening = app.listen( 0, "127.0.0.1", () => resolve( listening ) );
        } );
        try {
            await assertWriteHeadRoutesKeepEveryMetric( `http://127.0.0.1:${ server.address().port }`, {}, [ "app" ] );
        } finally {
            server.close();
        }
    } );

} );

describe( "Server-Timing descriptions", () => {

    it( "folds accents, drops what is not printable ASCII, and escapes quotes", async () => {
        // A header value outside Latin-1 throws in setHeader: a place name must not be able to fail the response.
        const { server, base } = await startApp( { describeInstance: () => "Zürich \"HQ\" 東京" } );
        try {
            const response = await rawGet( `${ base }/static/scripts/ti-framework.css` );
            assert.equal( response.status, 200 );
            assert.match( response.headers[ "server-timing" ], /^app;dur=[\d.]+;desc="Zurich \\"HQ\\""$/ );
        } finally {
            server.close();
        }
    } );

    it( "leaves `desc` out when the instance describes nothing", async () => {
        const { server, base } = await startApp( { describeInstance: () => undefined } );
        try {
            const response = await rawGet( `${ base }/static/scripts/ti-framework.css` );
            assert.match( response.headers[ "server-timing" ], /^app;dur=[\d.]+$/ );
        } finally {
            server.close();
        }
    } );

} );

describe( "Server-Timing is off unless a deployment turns it on", () => {

    const source = fs.readFileSync( path.resolve( __dirname, "..", "bin", "web-server.js" ), "utf8" );
    const defaults = JSON.parse( fs.readFileSync( path.resolve( __dirname, "..", "bin", "web-server.json" ), "utf8" ) );

    it( "ships switched off", () => {
        assert.equal( defaults.serverTiming, false );
    } );

    it( "mounts the timing handler only when `serverTiming` is on, ahead of compression and /static", () => {
        const timing = source.indexOf( "webHandlers.serverTimingHandler( this )" );
        assert.ok( timing > 0 );
        assert.match( source.slice( source.lastIndexOf( "if (", timing ), timing ), /isServerTimingEnabled/ );
        assert.ok( timing < source.indexOf( "TiWebServer.createCompressionHandler()" ), "after compression, `app` would miss the time compression's wrapper adds" );
        assert.ok( timing < source.indexOf( "express.static( staticContentPath" ) );
    } );

    it( "times the session only when `serverTiming` is on", () => {
        assert.match( source, /isServerTimingEnabled \? webHandlers\.timedHandler\( "session", sessionHandler \) : sessionHandler/ );
    } );

    it( "has no description by default", () => {
        assert.equal( TiWebServer.prototype.describeInstance.call( {} ), undefined );
    } );

} );
