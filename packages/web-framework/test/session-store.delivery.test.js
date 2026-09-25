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
 * Covers what a request costs the session store (CA-174).
 * <br/>
 * Counted at the store on a real competence server before this change: one refresh issued 15 session reads, each with
 * a TTL write that express-session awaits before ending the response — because `/static` was mounted after the session
 * middleware, every stylesheet and script paid both. On Redis that is invisible; through the HTTP state provider it is a
 * round trip per asset, before the first byte.
 */

const { beforeEach, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const SessionStore = require( "#session-store" );

const webServerSource = fs.readFileSync( path.resolve( __dirname, "..", "bin", "web-server.js" ), "utf8" );

/**
 * Installs a cache stub recording the session operations the store issues.
 *
 * @returns {{calls: Array<Array<*>>}}
 */
function installRecordingCache() {
    const cache = require( "@ti-engine/core/cache" );
    const recorder = {
        calls: [],
        hashSetField( ...args ) {
            recorder.calls.push( [ "hashSetField", ...args ] );
            return Promise.resolve();
        },
        hashGetField( ...args ) {
            recorder.calls.push( [ "hashGetField", ...args ] );
            return Promise.resolve( null );
        },
        hashDeleteField( ...args ) {
            recorder.calls.push( [ "hashDeleteField", ...args ] );
            return Promise.resolve();
        },
        expireValue( ...args ) {
            recorder.calls.push( [ "expireValue", ...args ] );
            return Promise.resolve();
        }
    };
    Object.defineProperty( cache, "instance", { value: recorder, configurable: true, writable: true, enumerable: true } );
    return recorder;
}

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const sessionData = () => ( { cookie: { maxAge: EIGHT_HOURS_MS } } );
const promisify = ( fn ) => new Promise( ( resolve, reject ) => fn( ( error ) => ( error ? reject( error ) : resolve() ) ) );

describe( "SessionStore — TTL writes", () => {

    let recorder;

    beforeEach( () => {
        recorder = installRecordingCache();
        mock.timers.reset();
    } );

    it( "writes the cookie's lifetime plus the touch interval, so the store never expires a session first", async () => {
        const store = new SessionStore();
        await promisify( ( done ) => store.set( "s1", sessionData(), done ) );
        const expire = recorder.calls.find( ( call ) => call[ 0 ] === "expireValue" );
        assert.deepEqual( expire, [ "expireValue", "s1", EIGHT_HOURS_MS / 1000 + SessionStore.TOUCH_INTERVAL_SECONDS, "ti:web:sessions" ] );
    } );

    it( "skips a touch inside the interval: the expiry just written still outlasts the cookie", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const store = new SessionStore();
        await promisify( ( done ) => store.set( "s1", sessionData(), done ) );
        recorder.calls.length = 0;

        mock.timers.tick( ( SessionStore.TOUCH_INTERVAL_SECONDS - 1 ) * 1000 );
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        assert.deepEqual( recorder.calls, [], "no store round trip before the response can end" );
    } );

    it( "writes again once the interval has passed", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const store = new SessionStore();
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        mock.timers.tick( SessionStore.TOUCH_INTERVAL_SECONDS * 1000 );
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        assert.equal( recorder.calls.filter( ( call ) => call[ 0 ] === "expireValue" ).length, 2 );
    } );

    it( "forgets a destroyed session, so a new one under the same ID is written at once", async () => {
        const store = new SessionStore();
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        await promisify( ( done ) => store.destroy( "s1", done ) );
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        assert.equal( recorder.calls.filter( ( call ) => call[ 0 ] === "expireValue" ).length, 2 );
    } );

    it( "throttles per session, not per store", async () => {
        const store = new SessionStore();
        await promisify( ( done ) => store.touch( "s1", sessionData(), done ) );
        await promisify( ( done ) => store.touch( "s2", sessionData(), done ) );
        assert.deepEqual( recorder.calls.map( ( call ) => call[ 1 ] ), [ "s1", "s2" ] );
    } );

} );

describe( "TiWebServer middleware order", () => {

    const at = ( snippet ) => {
        const index = webServerSource.indexOf( snippet );
        assert.notEqual( index, -1, `web-server.js mounts ${ snippet }` );
        return index;
    };

    it( "compresses first, so every response below it is covered", () => {
        assert.ok( at( "TiWebServer.createCompressionHandler()" ) < at( "webHandlers.nonceGenerationHandler()" ) );
    } );

    it( "serves /static and /.well-known after the security headers and before the session", () => {
        const staticMount = at( "this.#webServer.use( \"/static\", express.static(" );
        const wellKnown = at( "this.#webServer.use( \"/.well-known\", express.static(" );
        const helmetMount = at( "helmet( { contentSecurityPolicy: false } )" );
        const cspMount = at( "webHandlers.cspHeaderHandler()" );
        const cookies = at( "cookieParser()" );
        const sessions = at( "this.#webServer.use( session( {" );
        assert.ok( helmetMount < wellKnown && cspMount < wellKnown, "an asset still carries every security header" );
        assert.ok( wellKnown < cookies && staticMount < cookies, "an asset request never parses cookies" );
        assert.ok( staticMount < sessions, "an asset request never reads or writes a session" );
    } );

} );
