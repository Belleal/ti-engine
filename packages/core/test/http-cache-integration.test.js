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

const assert = require( "node:assert" );
const { after, before, describe, it } = require( "node:test" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// Same reason as in `http-cache-provider.test.js`: the stub's port is not known until it is listening, and `config`
// snapshots the environment when it is first required.
let cache = null;
let exceptions = null;
let stub = null;

/**
 * Polls until a condition holds, so a test can wait on a timer it does not own.
 *
 * @method
 * @param {Function} predicate
 * @param {string} description What the caller was waiting for, used in the failure message.
 * @param {number} [timeout=3000]
 * @returns {Promise}
 */
function waitFor( predicate, description, timeout = 3000 ) {
    let deadline = Date.now() + timeout;
    let attempt = ( resolve, reject ) => {
        if ( predicate() === true ) {
            resolve();
        } else if ( Date.now() > deadline ) {
            reject( new Error( `Timed out after ${ timeout }ms waiting for: ${ description }` ) );
        } else {
            setTimeout( () => attempt( resolve, reject ), 10 );
        }
    };
    return new Promise( attempt );
}

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    // No timeout override. A short one is a trap here: the FIRST fetch in a fresh process pays undici's
    // initialization - about 50ms idle, and far more on a loaded runner with test files in parallel - against
    // roughly 2ms for every one after it. The health probe in this hook is always that first fetch, so an
    // aggressive timeout races the runtime rather than the service. Nothing in this file tests timeout behaviour.
    // What this deployment declares it cannot run without; see the site's 'deployment-architecture.md' §4.2.
    process.env.TI_MEMORY_CACHE_REQUIRED_CAPABILITIES = "json-documents,atomic-json-edit";
    // Short, because the recovery probe is the subject of this file rather than something to be configured out of it.
    process.env.TI_MEMORY_CACHE_RETRY_MAX_INTERVAL = "40";

    cache = require( "#cache" );
    exceptions = require( "#exceptions" );

    await cache.instance.initialize();
} );

after( async () => {
    await cache.instance.shutDown();
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "The cache singleton over HTTP", () => {

    it( "starts operational, with the declared capabilities reconciled", () => {
        // The provider declares atomic-json-edit and the environment above requires it. Had it not, `initialize`
        // would have rejected and rolled the cache back, and this would be false.
        assert.equal( cache.instance.isOperational, true );
    } );

    it( "round-trips a capture document through the facade", async () => {
        await cache.instance.setJSON( "capture", {} );
        await cache.instance.editJSON( "capture", { email: "one@example.com" }, [ "rec-1" ] );
        await cache.instance.editJSON( "capture", { email: "two@example.com" }, [ "rec-2" ] );

        assert.deepEqual( await cache.instance.getJSON( "capture" ), {
            "rec-1": { email: "one@example.com" },
            "rec-2": { email: "two@example.com" }
        } );
    } );

    it( "round-trips a session field and deletes it", async () => {
        await cache.instance.hashSetField( "sessions", "abc", { userId: 42 } );
        assert.deepEqual( await cache.instance.hashGetField( "sessions", "abc" ), { userId: 42 } );

        assert.equal( await cache.instance.hashDeleteField( "sessions", "abc" ), true );
        assert.equal( await cache.instance.hashGetField( "sessions", "abc" ), null );
    } );

    it( "deletes a value", async () => {
        await cache.instance.setValue( "doomed", "x" );
        assert.equal( await cache.instance.deleteValue( "doomed" ), true );
        assert.equal( await cache.instance.getValue( "doomed" ), undefined );
        assert.equal( await cache.instance.deleteValue( "doomed" ), false );
    } );

} );

describe( "The cache singleton when the state service stops answering", () => {

    it( "goes out of service on the first transport failure", async () => {
        stub.breakTransport( true );

        await assert.rejects(
            cache.instance.getJSON( "capture" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                // Raised by the provider, which names what it could not reach.
                assert.match( error.data.details, /could not be reached/ );
                return true;
            }
        );

        assert.equal( cache.instance.isOperational, false );
    } );

    it( "then refuses further calls at the guard, before the backend is asked at all", async () => {
        await assert.rejects(
            cache.instance.getJSON( "capture" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                // The guard raises the same code with no details. That absence is the proof it never reached the
                // provider - which is exactly why the provider cannot learn of recovery from a request, and why it
                // has to run a probe of its own.
                assert.equal( error.data && error.data.details, undefined );
                return true;
            }
        );
    } );

    it( "comes back on its own when the service answers again", async () => {
        let requestsWhileDown = stub.requestLog.length;

        stub.breakTransport( false );
        await waitFor( () => cache.instance.isOperational === true, "the cache to return to service" );

        // Nothing in this test called the cache, so the only thing that could have found the service is the
        // provider's own recovery probe. Without it the cache stays down until the instance restarts, and nothing
        // anywhere throws to say so.
        assert.ok( stub.requestLog.length > requestsWhileDown );
        assert.equal( stub.requestLog[ stub.requestLog.length - 1 ].path, "/v1/health" );

        assert.deepEqual( await cache.instance.getJSON( "capture", [ "rec-1" ] ), { email: "one@example.com" } );
    } );

} );
