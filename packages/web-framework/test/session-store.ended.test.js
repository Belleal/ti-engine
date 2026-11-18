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
 * A session that has been destroyed stays destroyed (CA-587).
 *
 * A request that loaded a session before a sign-out destroyed it still holds its copy, and express-session writes that
 * copy back at the response's end if the request changed it: a role refreshed, a token minted, a language chosen. The
 * store's `set` recreated the record with no check, so the sign-out was undone and the browser, whose cookie the response
 * re-stamped, was signed in again. An asynchronous `refreshSession` (CA-585) widens the window by its lookup.
 * <br/>
 * The store has no compare-and-set, so the fix is two orderings that meet: `destroy` writes an "ended" mark for the ID
 * before it deletes the session, and `set` reads the mark after its own write lands and deletes the session again if it
 * is there. Whichever of the two writes lands last, no session is left. The real-server half is in
 * `web-server.sign-out-race.test.js`.
 */

const { beforeEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const SessionStore = require( "#session-store" );

const HOUR_MS = 60 * 60 * 1000;
const sessionData = ( fields = {} ) => ( { cookie: { originalMaxAge: HOUR_MS, maxAge: HOUR_MS }, ...fields } );
const promisify = ( fn ) => new Promise( ( resolve, reject ) => fn( ( error, value ) => ( error ? reject( error ) : resolve( value ) ) ) );

function deferred() {
    let resolve;
    const promise = new Promise( ( settle ) => {
        resolve = settle;
    } );
    return { promise: promise, resolve: resolve };
}

/**
 * Installs a cache keeping session fields and values as the state service does. `holdNext( name )` makes the next call of
 * that name wait for `release()` before it applies; `failNext( name )` makes it reject without applying.
 *
 * @returns {Object}
 */
function installStore() {
    const cache = require( "@ti-engine/core/cache" );
    const fields = new Map();
    const values = new Map();
    const holds = [];
    const failures = new Set();
    const store = {
        calls: [],
        fields: fields,
        values: values,
        holdNext( name ) {
            const hold = { name: name, reached: deferred(), released: deferred() };
            holds.push( hold );
            return { reached: hold.reached.promise, release: () => hold.released.resolve() };
        },
        failNext( name ) {
            failures.add( name );
        }
    };
    const run = ( name, apply ) => {
        store.calls.push( name );
        if ( failures.delete( name ) ) {
            return Promise.reject( new Error( `${ name } failed` ) );
        }
        const index = holds.findIndex( ( hold ) => hold.name === name );
        if ( index === -1 ) {
            return Promise.resolve().then( apply );
        }
        const [ hold ] = holds.splice( index, 1 );
        hold.reached.resolve();
        return hold.released.promise.then( apply );
    };
    const recorder = {
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
        expireValue: () => run( "expireValue", () => undefined ),
        setValue: ( key, value, expiration ) => run( "setValue", () => {
            values.set( key, { value: value, expiration: expiration } );
            return value;
        } ),
        getValue: ( key ) => run( "getValue", () => ( values.has( key ) ? values.get( key ).value : null ) )
    };
    Object.defineProperty( cache, "instance", { value: recorder, configurable: true, writable: true, enumerable: true } );
    return store;
}

for ( const held of [ false, true ] ) {

    describe( `SessionStore — a destroyed session stays destroyed${ held ? ", held" : "" } (CA-587)`, () => {

        let store;
        let sessions;

        beforeEach( () => {
            store = installStore();
            sessions = new SessionStore( { held: held } );
        } );

        it( "does not write back a session a request loaded before it was destroyed", async () => {
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            await promisify( ( done ) => sessions.destroy( "s1", done ) );

            // The in-flight request's write at its response's end, with the role its refresh changed.
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );

            assert.equal( store.fields.has( "s1" ), false, "the store holds no session for the ID" );
            assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null, "and none is answered, from the store or a held copy" );
        } );

        it( "removes a write that lands after the sign-out's delete, by its own check", async () => {
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            const late = store.holdNext( "hashSetField" );
            const writing = promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );
            await late.reached;
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            late.release();
            await writing;

            assert.equal( store.fields.has( "s1" ), false );
            assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null );
        } );

        it( "keeps a new session's writes, as a sign-in's regenerate makes one", async () => {
            await promisify( ( done ) => sessions.set( "old", sessionData( { user: { roles: [] } } ), done ) );
            await promisify( ( done ) => sessions.destroy( "old", done ) );
            await promisify( ( done ) => sessions.set( "new", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            await promisify( ( done ) => sessions.set( "new", sessionData( { user: { roles: [ "approver" ] } } ), done ) );

            assert.deepEqual( ( await promisify( ( done ) => sessions.get( "new", done ) ) ).user.roles, [ "approver" ] );
        } );

        it( "marks a destroyed ID for a quarter of an hour, longer than any request runs", async () => {
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            const mark = store.values.get( "ti:web:sessions:ended:s1" );
            assert.ok( mark, "the mark is written under the store's own prefix" );
            assert.equal( mark.expiration, SessionStore.ENDED_SECONDS );
            assert.equal( SessionStore.ENDED_SECONDS, 15 * 60 );
            assert.ok( store.calls.indexOf( "setValue" ) < store.calls.indexOf( "hashDeleteField" ), "marked before it is deleted" );
        } );

        it( "still ends the session when the mark cannot be written", async ( t ) => {
            t.mock.method( logger, "log", () => {} );
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: {} } ), done ) );
            store.failNext( "setValue" );
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            assert.equal( store.fields.has( "s1" ), false, "a sign-out does not hang on the mark" );
        } );

        // CodeRabbit on #226: a write whose mark could not be read was kept, which reopened the race whenever the store
        // faltered. It is undone and reported instead: a session that cannot be shown not to have ended is not accepted.
        it( "undoes a write whose ended mark cannot be read, and reports it", async ( t ) => {
            const logged = [];
            t.mock.method( logger, "log", ( message, severity ) => logged.push( { message: String( message ), severity: severity } ) );
            store.failNext( "getValue" );
            await assert.rejects( promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) ) );
            assert.equal( store.fields.has( "s1" ), false, "the write is undone" );
            assert.ok( logged.some( ( entry ) => entry.severity === logger.logSeverity.ERROR && /ended/.test( entry.message ) ) );
        } );

        // CodeRabbit on #226: between a late write landing and its own undo, a read could still be answered with the ended
        // session. The process remembers what it destroyed, and answers no session for it without asking the store.
        it( "answers no session for an ID it destroyed while a late write is still being undone", async () => {
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            const late = store.holdNext( "hashSetField" );
            const writing = promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );
            await late.reached;
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            const undo = store.holdNext( "hashDeleteField" );
            late.release();
            await undo.reached;

            assert.equal( store.fields.has( "s1" ), true, "the late write has landed and is not yet undone" );
            assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null, "and is not answered meanwhile" );

            undo.release();
            await writing;
            assert.equal( store.fields.has( "s1" ), false );
        } );

        it( "refuses a write to an ID it destroyed before making it", async () => {
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            const before = store.calls.length;
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );
            assert.deepEqual( store.calls.slice( before ), [], "nothing reaches the store, so nothing is there to be read in between" );
        } );

        it( "keeps an ID it destroyed ended in the process when the store's mark cannot be written", async ( t ) => {
            t.mock.method( logger, "log", () => {} );
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: {} } ), done ) );
            store.failNext( "setValue" );
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );
            assert.equal( store.fields.has( "s1" ), false );
            assert.equal( await promisify( ( done ) => sessions.get( "s1", done ) ), null );
        } );

        it( "undoes another process's late write through the store's mark", async () => {
            // Two stores on one cache, as two processes serving one session store are.
            const other = new SessionStore( { held: held } );
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            await promisify( ( done ) => sessions.destroy( "s1", done ) );
            await promisify( ( done ) => other.set( "s1", sessionData( { user: { roles: [ "approver" ] } } ), done ) );
            assert.equal( store.fields.has( "s1" ), false );
            assert.equal( await promisify( ( done ) => other.get( "s1", done ) ), null );
        } );

        // CodeRabbit on #227: a read that began before a sign-out, and answers after it, delivered the ended session. The
        // held copy is answered on a later turn and a store read on its reply, so the check is made again at delivery.
        it( "answers no session to a read that began before the sign-out and answers after it", async () => {
            await promisify( ( done ) => sessions.set( "s1", sessionData( { user: { roles: [ "editor" ] } } ), done ) );
            const reading = promisify( ( done ) => sessions.get( "s1", done ) );
            sessions.destroy( "s1", () => {} );
            assert.equal( await reading, null );
        } );

        // CodeRabbit on #227: at the limit, the oldest entry went first even when its store mark had failed, though this
        // memory was then the only thing keeping that session ended here. Entries with a mark go first.
        it( "keeps an ID whose store mark failed when the limit evicts, for its whole time", async ( t ) => {
            t.mock.method( logger, "log", () => {} );
            store.failNext( "setValue" );
            await promisify( ( done ) => sessions.destroy( "unmarked", done ) );
            for ( let index = 0; index < SessionStore.HELD_SESSIONS_LIMIT; index++ ) {
                await promisify( ( done ) => sessions.destroy( `s${ index }`, done ) );
            }
            const before = store.calls.length;
            await promisify( ( done ) => sessions.set( "unmarked", sessionData( { user: {} } ), done ) );
            assert.deepEqual( store.calls.slice( before ), [], "still refused here, with nothing written" );
            assert.equal( store.fields.has( "unmarked" ), false );
        } );

        it( `remembers no more than ${ SessionStore.HELD_SESSIONS_LIMIT } ended IDs, and the store's mark covers one it forgot`, async () => {
            await promisify( ( done ) => sessions.destroy( "first", done ) );
            for ( let index = 0; index < SessionStore.HELD_SESSIONS_LIMIT; index++ ) {
                await promisify( ( done ) => sessions.destroy( `s${ index }`, done ) );
            }
            const before = store.calls.length;
            await promisify( ( done ) => sessions.set( "first", sessionData( { user: {} } ), done ) );
            assert.ok( store.calls.slice( before ).includes( "hashSetField" ), "the oldest is no longer remembered, so the write is made" );
            assert.equal( store.fields.has( "first" ), false, "and undone by the mark" );
        } );

    } );
}
