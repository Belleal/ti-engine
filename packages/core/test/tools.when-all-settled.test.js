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
 * `tools.whenAllSettled` — every promise settles before the outcome is reported.
 *
 * `Promise.all` rejects at the first failure while the other promises are still pending. Inside a `KeyedLock` task that
 * releases the keys with writes still in flight, and the next task reads a document that one of them is about to
 * replace. web-framework's config store found this in review (CA-192) and kept the fix as a private method. It moves
 * here beside the lock, because competence's interview bookings write a slot and an evaluation together.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const tools = require( "@ti-engine/core/tools" );

// A promise the test settles when it chooses.
function held() {
    let settle;
    const promise = new Promise( ( resolve, reject ) => {
        settle = { resolve: resolve, reject: reject };
    } );
    return { promise: promise, settle: settle };
}

// Every step below is a microtask, so once this resolves, whatever could run has run.
const nothingLeftToRun = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "tools.whenAllSettled", () => {

    it( "resolves with every value, in the order given", async () => {
        const later = held();
        const outcome = tools.whenAllSettled( [ Promise.resolve( "first" ), "second", later.promise ] );
        later.settle.resolve( "third" );
        assert.deepEqual( await outcome, [ "first", "second", "third" ] );
    } );

    it( "reports a failure only once every promise has settled", async () => {
        const inFlight = held();
        let reported = null;
        const outcome = tools.whenAllSettled( [ Promise.reject( new Error( "refused at once" ) ), inFlight.promise ] ).catch( ( error ) => {
            reported = error.message;
        } );

        await nothingLeftToRun();
        assert.equal( reported, null, "the failure was reported while another write was still in flight" );
        inFlight.settle.resolve( "landed" );
        await outcome;
        assert.equal( reported, "refused at once" );
    } );

    it( "rejects with the first failure in the order given, not the first in time", async () => {
        const slower = held();
        const outcome = tools.whenAllSettled( [ slower.promise, Promise.reject( new Error( "second in order, first in time" ) ) ] );
        await nothingLeftToRun();
        slower.settle.reject( new Error( "first in order" ) );
        await assert.rejects( outcome, /first in order/ );
    } );

} );
