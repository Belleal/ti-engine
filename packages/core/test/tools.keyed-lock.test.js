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
 * `tools.KeyedLock` — tasks that touch the same keys run one at a time, in the order they arrived.
 *
 * It exists for a read-check-write that takes more than one round trip to a store: without it, two requests both read
 * version N, both pass the check, and the second write erases the first. web-framework's config store had the only
 * copy, as a private method (CA-192), and competence needs the same thing for its evaluations, cycles and interview
 * slots (CA-188 to CA-191).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const tools = require( "@ti-engine/core/tools" );

// A promise the test resolves when it chooses, so an ordering is decided by the test rather than by timers.
function gate() {
    let open;
    const opened = new Promise( ( resolve ) => {
        open = resolve;
    } );
    return { opened: opened, open: open };
}

// Every step of a task below is a microtask, so once this resolves, whatever could run has run.
const nothingLeftToRun = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "tools.KeyedLock", () => {

    it( "runs tasks on one key one at a time, in the order they arrived", async () => {
        const lock = new tools.KeyedLock();
        const events = [];
        const task = ( name ) => async () => {
            events.push( name + " starts" );
            await nothingLeftToRun();
            events.push( name + " ends" );
            return name;
        };

        const results = await Promise.all( [ "first", "second", "third" ].map( ( name ) => lock.exclusively( "document", task( name ) ) ) );

        assert.deepEqual( results, [ "first", "second", "third" ] );
        assert.deepEqual( events, [ "first starts", "first ends", "second starts", "second ends", "third starts", "third ends" ] );
    } );

    it( "runs tasks on different keys side by side", async () => {
        const lock = new tools.KeyedLock();
        const other = gate();
        // The first task finishes only once the second has started, which it can only do if nothing holds it back.
        const first = lock.exclusively( "one", () => other.opened );
        const second = lock.exclusively( "two", () => other.open( "two ran" ) );
        await Promise.all( [ first, second ] );
    } );

    it( "holds a task that needs two keys until the earlier tasks on both have settled", async () => {
        const lock = new tools.KeyedLock();
        const left = gate();
        const right = gate();
        const events = [];
        lock.exclusively( "left", () => left.opened.then( () => events.push( "left settled" ) ) );
        lock.exclusively( "right", () => right.opened.then( () => events.push( "right settled" ) ) );
        const both = lock.exclusively( [ "left", "right" ], () => events.push( "both ran" ) );

        left.open();
        await nothingLeftToRun();
        assert.deepEqual( events, [ "left settled" ], "the task ran while an earlier task still held one of its keys" );
        right.open();
        await both;
        assert.deepEqual( events, [ "left settled", "right settled", "both ran" ] );
    } );

    it( "completes two tasks that name the same keys in opposite orders, in the order they arrived", async () => {
        const lock = new tools.KeyedLock();
        const order = [];
        await Promise.all( [
            lock.exclusively( [ "a", "b" ], async () => {
                await nothingLeftToRun();
                order.push( "a then b" );
            } ),
            lock.exclusively( [ "b", "a" ], () => order.push( "b then a" ) )
        ] );
        assert.deepEqual( order, [ "a then b", "b then a" ] );
    } );

    it( "gives the caller a failed task's rejection, and releases its keys for the next task", async () => {
        const lock = new tools.KeyedLock();
        const refusal = new Error( "version-conflict" );
        const failed = lock.exclusively( "document", () => Promise.reject( refusal ) );
        const next = lock.exclusively( "document", () => "the next task ran" );

        await assert.rejects( failed, ( error ) => error === refusal );
        assert.equal( await next, "the next task ran" );
    } );

    it( "treats a task that throws synchronously as a rejection, and releases its keys", async () => {
        const lock = new tools.KeyedLock();
        const failed = lock.exclusively( "document", () => {
            throw new RangeError( "thrown before any await" );
        } );
        const next = lock.exclusively( "document", () => "the next task ran" );

        await assert.rejects( failed, RangeError );
        assert.equal( await next, "the next task ran" );
    } );

    it( "holds a key named twice once", async () => {
        const lock = new tools.KeyedLock();
        assert.equal( await lock.exclusively( [ "document", "document" ], () => "ran" ), "ran" );
        assert.equal( await lock.exclusively( "document", () => "ran again" ), "ran again" );
    } );

    it( "refuses keys it cannot hold and a task it cannot run", () => {
        const lock = new tools.KeyedLock();
        assert.throws( () => lock.exclusively( [], () => undefined ), TypeError );
        assert.throws( () => lock.exclusively( "", () => undefined ), TypeError );
        assert.throws( () => lock.exclusively( [ "document", 7 ], () => undefined ), TypeError );
        assert.throws( () => lock.exclusively( undefined, () => undefined ), TypeError );
        assert.throws( () => lock.exclusively( "document", "not a function" ), TypeError );
    } );

} );
