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
 * Covers the held session store (CA-557): `sessions.held` answers a request's session from the process.
 * <br/>
 * express-session reads the session on every request that reaches it. Measured on competence over the D1 state service,
 * a Supervisor clicking through all 29 screens made 95 requests and 99 session-store calls, 90 of them that read; the
 * expiry touch was already down to once a minute (1.39.0). Production's export of 2026-10-23 had the same share, 141 of
 * its 269 D1 calls. Held, the read is made once per session and process.
 * <br/>
 * The store below keeps what it is given, as the state service does, and can hold any call until a test releases it,
 * which is how a read overtaken by a write, and a write overtaken by another, are reproduced.
 */

const { afterEach, beforeEach, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const http = require( "node:http" );

const express = require( "express" );
const session = require( "express-session" );

const tools = require( "@ti-engine/core/tools" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );
const SessionStore = require( "#session-store" );

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const sessionData = ( fields = {} ) => ( { cookie: { originalMaxAge: EIGHT_HOURS_MS, maxAge: EIGHT_HOURS_MS }, ...fields } );
const promisify = ( fn ) => new Promise( ( resolve, reject ) => fn( ( error, value ) => ( error ? reject( error ) : resolve( value ) ) ) );

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise( ( settle, fail ) => {
        resolve = settle;
        reject = fail;
    } );
    return { promise: promise, resolve: resolve, reject: reject };
}

/**
 * Installs a cache that keeps session fields as text, as the state service does, counting each call. `holdNext( name )`
 * makes the next call of that name wait for `release()`, applied or not as `fail` says.
 *
 * @returns {Object}
 */
function installStore() {
    const cache = require( "@ti-engine/core/cache" );
    const fields = new Map();
    const holds = [];
    const store = {
        calls: [],
        fields: fields,
        holdNext( name, { fail = false } = {} ) {
            const hold = { name: name, fail: fail, reached: deferred(), released: deferred() };
            holds.push( hold );
            return { reached: hold.reached.promise, release: () => hold.released.resolve() };
        },
        count( name ) {
            return store.calls.filter( ( call ) => call === name ).length;
        }
    };
    const run = ( name, apply ) => {
        store.calls.push( name );
        const index = holds.findIndex( ( hold ) => hold.name === name );
        if ( index === -1 ) {
            return Promise.resolve().then( apply );
        }
        const [ hold ] = holds.splice( index, 1 );
        hold.reached.resolve();
        // A held read answers what the store held when it was made, as a read that took a while does.
        const answer = ( name === "hashGetField" ) ? apply() : undefined;
        return hold.released.promise.then( () => {
            if ( hold.fail ) {
                throw new Error( `${ name } failed` );
            }
            return ( name === "hashGetField" ) ? answer : apply();
        } );
    };
    const recorder = {
        // Serialized when called, as the provider does, not when the write lands.
        hashSetField: ( key, field, value ) => {
            const text = String( tools.stringifyJSON( value ) );
            return run( "hashSetField", () => {
                fields.set( field, text );
            } );
        },
        hashGetField: ( key, field ) => run( "hashGetField", () => ( fields.has( field ) ? tools.parseJSON( fields.get( field ) ) : null ) ),
        hashDeleteField: ( key, field ) => run( "hashDeleteField", () => {
            fields.delete( field );
        } ),
        expireValue: () => run( "expireValue", () => undefined )
    };
    Object.defineProperty( cache, "instance", { value: recorder, configurable: true, writable: true, enumerable: true } );
    return store;
}

describe( "SessionStore — held (sessions.held, CA-557)", () => {

    let store;

    beforeEach( () => {
        store = installStore();
    } );

    afterEach( () => {
        mock.timers.reset();
    } );

    it( "unheld, which is the default, reads the store on every get", async () => {
        const sessions = new SessionStore();
        assert.equal( sessions.isHeld, false );
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "a" } ), done ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 2 );
    } );

    it( "answers a session it wrote without reading the store", async () => {
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "a" } ), done ) );
        const read = await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( read.user, "a" );
        assert.equal( store.count( "hashGetField" ), 0 );
    } );

    it( "reads a session it never wrote once, then answers it from the copy", async () => {
        store.fields.set( "s1", JSON.stringify( sessionData( { user: "a" } ) ) );
        const sessions = new SessionStore( { held: true } );
        for ( let request = 0; request < 5; request++ ) {
            assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "a" );
        }
        assert.equal( store.count( "hashGetField" ), 1 );
    } );

    it( "hands every caller a copy of its own: a change made in place reaches no later request", async () => {
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "a" ] } } ), done ) );
        const first = await promisify( ( done ) => sessions.get( "s1", done ) );
        first.user.roles.push( "admin" );
        const second = await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.deepEqual( second.user.roles, [ "a" ] );
    } );

    it( "answers a held session on a later turn, as a store read does", async () => {
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.set( "s1", sessionData(), done ) );
        let answered = false;
        sessions.get( "s1", () => {
            answered = true;
        } );
        assert.equal( answered, false );
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        assert.equal( answered, true );
    } );

    it( "keeps nothing of a destroyed session: the next get reads the store and finds none", async () => {
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.set( "s1", sessionData(), done ) );
        await promisify( ( done ) => sessions.destroy( "s1", done ) );
        assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null );
        assert.equal( store.count( "hashGetField" ), 1 );
    } );

    it( "does not hold what a read got when a write to that session started while it was in flight", async () => {
        store.fields.set( "s1", JSON.stringify( sessionData( { user: "before" } ) ) );
        const sessions = new SessionStore( { held: true } );
        const read = store.holdNext( "hashGetField" );
        const reading = promisify( ( done ) => sessions.get( "s1", done ) );
        await read.reached;
        await promisify( ( done ) => sessions.destroy( "s1", done ) );
        read.release();
        assert.equal( ( await reading ).user, "before", "the read answers what it read" );
        assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null, "but nobody else is answered it" );
    } );

    it( "does not hold what a read got while a write to that session was in flight", async () => {
        store.fields.set( "s1", JSON.stringify( sessionData( { user: "before" } ) ) );
        const sessions = new SessionStore( { held: true } );
        const write = store.holdNext( "hashSetField", { fail: true } );
        const writing = promisify( ( done ) => sessions.set( "s1", sessionData( { user: "after" } ), done ) );
        await write.reached;
        await promisify( ( done ) => sessions.get( "s1", done ) );
        write.release();
        await assert.rejects( writing );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 2 );
    } );

    it( "does not hold an earlier write that a later one overtook", async () => {
        const sessions = new SessionStore( { held: true } );
        const first = store.holdNext( "hashSetField" );
        const writingFirst = promisify( ( done ) => sessions.set( "s1", sessionData( { user: "first" } ), done ) );
        await first.reached;
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "second" } ), done ) );
        first.release();
        await writingFirst;
        // The store keeps the first, which landed last, and so does the next read: the copy did not keep the second.
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "first" );
        assert.equal( store.count( "hashGetField" ), 1 );
    } );

    it( "after a failed write, reads the store for two minutes and holds nothing, then holds again", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const sessions = new SessionStore( { held: true } );
        store.holdNext( "hashDeleteField", { fail: true } ).release();
        await assert.rejects( promisify( ( done ) => sessions.destroy( "s1", done ) ) );
        // A sign-out that timed out may still land: until it must have, every request asks the store.
        store.fields.set( "s1", JSON.stringify( sessionData( { user: "a" } ) ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 2 );

        mock.timers.tick( SessionStore.HELD_IN_DOUBT_MILLISECONDS );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 3 );
    } );

    it( "does not hold what a read got that was answered before a write landed, if it returns after", async () => {
        store.fields.set( "s1", JSON.stringify( sessionData( { user: "before" } ) ) );
        const sessions = new SessionStore( { held: true } );
        const write = store.holdNext( "hashSetField" );
        const writing = promisify( ( done ) => sessions.set( "s1", sessionData( { user: "after" } ), done ) );
        await write.reached;
        // Begun while the write is in flight, answered with what the store held then, and slow to arrive.
        const read = store.holdNext( "hashGetField" );
        const reading = promisify( ( done ) => sessions.get( "s1", done ) );
        await read.reached;
        write.release();
        await writing;
        read.release();
        assert.equal( ( await reading ).user, "before", "the read answers what it read" );
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "after", "but the copy is the write's, or the store's" );
    } );

    it( "holds the session as it was sent to the store, not as it is when the write lands", async () => {
        const sessions = new SessionStore( { held: true } );
        const write = store.holdNext( "hashSetField" );
        const data = sessionData( { user: "sent" } );
        const writing = promisify( ( done ) => sessions.set( "s1", data, done ) );
        await write.reached;
        // express-session hands over its live session, which the request goes on changing.
        data.user = "changed afterwards";
        write.release();
        await writing;
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "sent" );
        assert.equal( JSON.parse( store.fields.get( "s1" ) ).user, "sent" );
    } );

    it( "ends a write once, however often it is ended: a callback that throws leaves no unhandled rejection", async () => {
        const sessions = new SessionStore( { held: true } );
        const rejected = [];
        const onRejection = ( reason ) => rejected.push( reason );
        process.on( "unhandledRejection", onRejection );
        try {
            let calls = 0;
            sessions.set( "s1", sessionData(), () => {
                if ( calls++ === 0 ) {
                    throw new Error( "the response had already ended" );
                }
            } );
            await new Promise( ( resolve ) => setTimeout( resolve, 50 ) );
        } finally {
            process.off( "unhandledRejection", onRejection );
        }
        assert.deepEqual( rejected.map( ( reason ) => reason && reason.message ), [] );
    } );

    it( "reports a session that cannot be serialized to the callback, as unheld does, and starts no write", async () => {
        const sessions = new SessionStore( { held: true } );
        const data = sessionData( { count: 1n } );
        // The call itself is made outside a promise executor: one would turn a throw out of `set` into the rejection the
        // callback's error also produces, and this case would pass with the defect in.
        let thrown = null;
        const reported = new Promise( ( resolve ) => {
            try {
                sessions.set( "s1", data, resolve );
            } catch ( error ) {
                thrown = error;
                resolve();
            }
        } );
        const failure = await reported;
        assert.equal( thrown, null, "set does not throw to express-session" );
        assert.ok( failure, "the callback is given the failure" );
        assert.equal( store.count( "hashSetField" ), 0, "nothing was sent" );
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "a" } ), done ) );
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "a", "and no write is left counted as in flight" );
        assert.equal( store.count( "hashGetField" ), 0 );
    } );

    it( "counts a write whose call throws before it returns as failed, and holds again once the doubt is over", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const sessions = new SessionStore( { held: true } );
        const cache = require( "@ti-engine/core/cache" );
        const working = cache.instance.hashSetField;
        cache.instance.hashSetField = () => {
            throw new Error( "the provider is not ready" );
        };
        await assert.rejects( promisify( ( done ) => sessions.set( "s1", sessionData(), done ) ) );
        cache.instance.hashSetField = working;
        mock.timers.tick( SessionStore.HELD_IN_DOUBT_MILLISECONDS );
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "a" } ), done ) );
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "a" );
        assert.equal( store.count( "hashGetField" ), 0, "no write is left counted as in flight" );
    } );

    it( "leaves a newer copy's expiry alone when a touch that began before it lands after", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const sessions = new SessionStore( { held: true } );
        const ONE_HOUR_MS = 60 * 60 * 1000;
        await promisify( ( done ) => sessions.set( "s1", sessionData(), done ) );
        mock.timers.tick( SessionStore.TOUCH_INTERVAL_SECONDS * 1000 );
        // A touch under a short cookie begins, and is slow to land.
        const touch = store.holdNext( "expireValue" );
        const touching = promisify( ( done ) => sessions.touch( "s1", { cookie: { maxAge: ONE_HOUR_MS } }, done ) );
        await touch.reached;
        // A write with the usual cookie lands meanwhile and holds a copy of its own.
        await promisify( ( done ) => sessions.set( "s1", sessionData( { user: "newer" } ), done ) );
        touch.release();
        await touching;
        mock.timers.tick( 2 * ONE_HOUR_MS );
        assert.equal( ( await promisify( ( done ) => sessions.get( "s1", done ) ) ).user, "newer" );
        assert.equal( store.count( "hashGetField" ), 0, "the newer copy still stands for its own eight hours" );
    } );

    it( "holds a session read from the store for one touch interval, and for its whole expiry once a touch writes one", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        store.fields.set( "s1", JSON.stringify( sessionData() ) );
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        mock.timers.tick( SessionStore.TOUCH_INTERVAL_SECONDS * 1000 );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 2, "the read could not say when the store expires it" );

        await promisify( ( done ) => sessions.touch( "s1", sessionData(), done ) );
        mock.timers.tick( EIGHT_HOURS_MS );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 2, "the touch wrote eight hours and one interval" );
        mock.timers.tick( SessionStore.TOUCH_INTERVAL_SECONDS * 1000 );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 3, "past the expiry the store wrote, the copy is not answered" );
    } );

    it( "never outlives the store's expiry of a session it wrote", async () => {
        mock.timers.enable( { apis: [ "Date" ], now: 1_000_000 } );
        const sessions = new SessionStore( { held: true } );
        await promisify( ( done ) => sessions.set( "s1", sessionData(), done ) );
        mock.timers.tick( EIGHT_HOURS_MS + SessionStore.TOUCH_INTERVAL_SECONDS * 1000 - 1 );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 0 );
        mock.timers.tick( 1 );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 1 );
    } );

    it( `holds no more than ${ SessionStore.HELD_SESSIONS_LIMIT } sessions, dropping the one held longest ago`, async () => {
        const sessions = new SessionStore( { held: true } );
        for ( let index = 0; index <= SessionStore.HELD_SESSIONS_LIMIT; index++ ) {
            await promisify( ( done ) => sessions.set( `s${ index }`, sessionData(), done ) );
        }
        await promisify( ( done ) => sessions.get( `s${ SessionStore.HELD_SESSIONS_LIMIT }`, done ) );
        await promisify( ( done ) => sessions.get( "s1", done ) );
        assert.equal( store.count( "hashGetField" ), 0 );
        await promisify( ( done ) => sessions.get( "s0", done ) );
        assert.equal( store.count( "hashGetField" ), 1 );
    } );

} );

describe( "SessionStore — held, under express-session over HTTP", () => {

    /**
     * Serves an express-session app wired as `TiWebServer` wires it, over the store under test.
     *
     * @param {SessionStore} sessions
     * @returns {Promise<{request: function(string, string=): Promise<{status: number, body: string, cookie: string|null}>, close: function(): void}>}
     */
    async function serve( sessions ) {
        const app = express();
        app.use( session( {
            secret: "test-only",
            resave: false,
            saveUninitialized: false,
            rolling: true,
            cookie: { path: "/", httpOnly: true, secure: "auto", sameSite: "lax", maxAge: EIGHT_HOURS_MS },
            unset: "destroy",
            store: sessions
        } ) );
        app.get( "/sign-in", ( request, response ) => {
            request.session.regenerate( () => {
                request.session.user = { employeeID: "1" };
                response.send( "signed in" );
            } );
        } );
        app.get( "/sign-out", ( request, response ) => {
            request.session.destroy( () => response.send( "signed out" ) );
        } );
        app.get( "/me", ( request, response ) => {
            response.send( request.session.user ? request.session.user.employeeID : "nobody" );
        } );
        const server = await new Promise( ( resolve ) => {
            const listening = http.createServer( app ).listen( 0, "127.0.0.1", () => resolve( listening ) );
        } );
        const base = `http://127.0.0.1:${ server.address().port }`;
        return {
            request: async ( path, cookie ) => {
                const response = await fetch( base + path, { headers: cookie ? { cookie: cookie } : {} } );
                const setCookie = response.headers.get( "set-cookie" );
                return { status: response.status, body: await response.text(), cookie: setCookie ? setCookie.split( ";" )[ 0 ] : null };
            },
            close: () => server.close()
        };
    }

    it( "reads the store for no request after sign-in, and a sign-out ends the session", async ( t ) => {
        const store = installStore();
        const app = await serve( new SessionStore( { held: true } ) );
        t.after( () => app.close() );

        const { cookie } = await app.request( "/sign-in" );
        for ( let request = 0; request < 10; request++ ) {
            assert.equal( ( await app.request( "/me", cookie ) ).body, "1" );
        }
        assert.equal( store.count( "hashGetField" ), 0, "ten requests, no session read" );

        await app.request( "/sign-out", cookie );
        assert.equal( ( await app.request( "/me", cookie ) ).body, "nobody" );
    } );

    it( "unheld, makes one session read per request, as before", async ( t ) => {
        const store = installStore();
        const app = await serve( new SessionStore() );
        t.after( () => app.close() );

        const { cookie } = await app.request( "/sign-in" );
        for ( let request = 0; request < 10; request++ ) {
            await app.request( "/me", cookie );
        }
        assert.equal( store.count( "hashGetField" ), 10 );
    } );

} );

describe( "TI_WEB_SESSIONS_HELD", () => {

    it( "turns the held sessions on and off, as a bool", () => {
        assert.equal( applyWebConfigEnvOverrides( { sessions: { held: false } }, { TI_WEB_SESSIONS_HELD: "true" } ).sessions.held, true );
        assert.equal( applyWebConfigEnvOverrides( { sessions: { held: true } }, { TI_WEB_SESSIONS_HELD: "false" } ).sessions.held, false );
        assert.equal( applyWebConfigEnvOverrides( {}, { TI_WEB_SESSIONS_HELD: "true" } ).sessions.held, true );
    } );

    it( "leaves the configured value untouched when the variable is absent", () => {
        assert.equal( applyWebConfigEnvOverrides( { sessions: { held: true } }, {} ).sessions.held, true );
    } );

    it( "ships off: a deployment says it serves its sessions from one process before they are held", () => {
        const shipped = require( "../bin/web-server.json" );
        assert.equal( shipped.sessions.held, false );
    } );

    it( "holds only for a true: a string, a number or an object is not a switch", () => {
        for ( const value of [ "true", 1, {}, [], "yes" ] ) {
            assert.equal( new SessionStore( { held: value } ).isHeld, false, `${ JSON.stringify( value ) } holds` );
        }
        assert.equal( new SessionStore( { held: true } ).isHeld, true );
        assert.equal( new SessionStore( {} ).isHeld, false );
    } );

} );
