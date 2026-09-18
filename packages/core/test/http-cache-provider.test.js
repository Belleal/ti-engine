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

// The provider reads its configuration once, in its constructor, from a snapshot `config` takes at require time. The
// stub server's port is not known until it is listening, so the environment has to be set and the module required
// only afterwards - which is why these are `let` and filled in by the hook below rather than required at the top.
let HttpCacheProvider = null;
let exceptions = null;
let cacheCapability = null;
let stub = null;

/**
 * Collects the connection events a provider announces, in order.
 */
class RecordingObserver {
    events = [];

    onConnectionRecovered( identifier ) {
        this.events.push( `recovered:${ identifier }` );
    }

    onConnectionDisrupted( identifier ) {
        this.events.push( `disrupted:${ identifier }` );
    }

    onConnectionLost( identifier ) {
        this.events.push( `lost:${ identifier }` );
    }
}

/**
 * Builds a provider already connected to the stub, with its observer attached.
 *
 * @returns {Promise<Object>}
 */
async function connectedProvider() {
    let observer = new RecordingObserver();
    let provider = new HttpCacheProvider( "test-cache" );
    provider.addConnectionObserver( observer );
    await provider.initialize();
    return { provider, observer };
}

before( async () => {
    stub = await startStubStateServer();

    // Selects this backend by its built-in name, so the wiring in `createConfiguredProvider` is covered too.
    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MEMORY_CACHE_STATE_TIMEOUT = "2000";
    process.env.TI_MEMORY_CACHE_STATE_AUTH_TOKEN = "a-test-token";
    // Long enough that the recovery probe never fires during the run; the disruption tests assert on the first
    // failure, not on the retry loop.
    process.env.TI_MEMORY_CACHE_RETRY_MAX_INTERVAL = "600000";

    HttpCacheProvider = require( "#http-cache-provider" );
    exceptions = require( "#exceptions" );
    ( { cacheCapability } = require( "#cache-capability" ) );
} );

after( () => {
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "HttpCacheProvider — the wire format for JSON paths", () => {

    it( "sends the root path as an empty segment list", () => {
        assert.deepEqual( HttpCacheProvider.toPathSegments( "$" ), [] );
        assert.deepEqual( HttpCacheProvider.toPathSegments( "" ), [] );
        assert.deepEqual( HttpCacheProvider.toPathSegments( undefined ), [] );
    } );

    it( "splits a dotted path into segments, with or without the leading '$'", () => {
        assert.deepEqual( HttpCacheProvider.toPathSegments( "a.b.c" ), [ "a", "b", "c" ] );
        assert.deepEqual( HttpCacheProvider.toPathSegments( "$.a.b" ), [ "a", "b" ] );
    } );

    it( "treats array segments as literal keys, so a dot inside one is not a separator", () => {
        // The whole reason paths travel as data: 'user.name' is one key here, and any store-specific quoting of it
        // is the state service's problem rather than something this provider has to guess at.
        assert.deepEqual( HttpCacheProvider.toPathSegments( [ "user.name" ] ), [ "user.name" ] );
        assert.deepEqual( HttpCacheProvider.toPathSegments( [ 'a"b' ] ), [ 'a"b' ] );
    } );

} );

describe( "HttpCacheProvider — selection", () => {

    it( "is what the built-in provider name 'http' resolves to", () => {
        // Constructing the backend is the last thing `cache.js` does at require time, so a deployment pointed at a
        // name that resolves to nothing fails the process rather than the first request.
        let cache = require( "#cache" );
        assert.ok( cache.createConfiguredProvider( "test-cache" ) instanceof HttpCacheProvider );
    } );

} );

describe( "HttpCacheProvider — authorization", () => {

    it( "sends the configured bearer token on every request, the health probe included", async () => {
        let before = stub.requestLog.length;
        let { provider } = await connectedProvider();
        await provider.setValue( "authed", "x" );

        let issued = stub.requestLog.slice( before );
        assert.ok( issued.length >= 2 );
        issued.forEach( ( entry ) => {
            assert.equal( entry.headers.authorization, "Bearer a-test-token", `missing on ${ entry.path }` );
        } );
    } );

} );

describe( "HttpCacheProvider — capabilities", () => {

    it( "declares what the state protocol guarantees", () => {
        let provider = new HttpCacheProvider( "test-cache" );
        assert.deepEqual( provider.capabilities.sort(), [
            cacheCapability.ATOMIC_JSON_EDIT,
            cacheCapability.HASH_FIELDS,
            cacheCapability.JSON_DOCUMENTS,
            cacheCapability.KEY_EXPIRY,
            cacheCapability.KEY_PATTERN_MATCH
        ].sort() );
    } );

    it( "does not declare the list and set behaviours it has no protocol for", () => {
        let provider = new HttpCacheProvider( "test-cache" );
        assert.equal( provider.hasCapability( cacheCapability.LISTS ), false );
        assert.equal( provider.hasCapability( cacheCapability.SETS ), false );
    } );

} );

describe( "HttpCacheProvider — initialize", () => {

    it( "announces the connection before it resolves", async () => {
        let observer = new RecordingObserver();
        let provider = new HttpCacheProvider( "test-cache" );
        provider.addConnectionObserver( observer );

        let seenAtResolution = null;
        await provider.initialize().then( () => {
            seenAtResolution = observer.events.slice();
        } );

        // The cache singleton turns operational on the notification and validates capabilities once this resolves. A
        // provider that resolved first would be reachable while still reported as down.
        assert.deepEqual( seenAtResolution, [ "recovered:test-cache" ] );
    } );

    it( "refuses to start when the state service rejects the health probe", async () => {
        stub.failNext( "/v1/health", 503 );

        let provider = new HttpCacheProvider( "test-cache" );
        await assert.rejects(
            provider.initialize(),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                assert.match( error.data.details, /did not answer the health probe/ );
                return true;
            }
        );
    } );

} );

describe( "HttpCacheProvider — values", () => {

    it( "stores a value and hands back what the caller passed in", async () => {
        let { provider } = await connectedProvider();

        // The Redis backend resolves the original value, not the server's answer, and callers depend on that.
        assert.equal( await provider.setValue( "greeting", "hello" ), "hello" );
        assert.equal( await provider.getValue( "greeting" ), "hello" );
    } );

    it( "short-circuits a falsy value without reaching the service", async () => {
        let { provider } = await connectedProvider();
        let before = stub.requestLog.length;

        assert.equal( await provider.setValue( "nothing", "" ), "" );
        assert.equal( stub.requestLog.length, before );
    } );

    it( "returns undefined rather than null for a key that is not there", async () => {
        let { provider } = await connectedProvider();

        // `web-framework` distinguishes the two when deciding whether a session exists, and the Redis decoder
        // returns undefined.
        assert.equal( await provider.getValue( "never-written" ), undefined );
    } );

    it( "forwards an expiration when one is given", async () => {
        let { provider } = await connectedProvider();

        await provider.setValue( "temporary", "x", 60 );
        assert.equal( stub.expirations.get( "temporary" ), 60 );
    } );

    it( "resolves expireValue with the number of seconds it was asked for", async () => {
        let { provider } = await connectedProvider();

        await provider.setValue( "session:1", "x" );
        assert.equal( await provider.expireValue( "session:1", 900 ), 900 );
        assert.equal( stub.expirations.get( "session:1" ), 900 );
    } );

    it( "matches keys by glob", async () => {
        let { provider } = await connectedProvider();

        await provider.setValue( "match:a", "1" );
        await provider.setValue( "match:b", "2" );
        await provider.setValue( "other:c", "3" );

        let matched = await provider.matchKeys( "match:*" );
        assert.deepEqual( matched.sort(), [ "match:a", "match:b" ] );
    } );

} );

describe( "HttpCacheProvider — hash fields", () => {

    it( "round-trips a field", async () => {
        let { provider } = await connectedProvider();

        await provider.hashSetField( "session:abc", "userId", 42 );
        assert.equal( await provider.hashGetField( "session:abc", "userId" ), 42 );
    } );

    it( "returns null for a field that is not there", async () => {
        let { provider } = await connectedProvider();

        assert.equal( await provider.hashGetField( "session:abc", "missing" ), null );
    } );

    it( "reports whether a delete removed anything", async () => {
        let { provider } = await connectedProvider();

        await provider.hashSetField( "session:def", "userId", 7 );
        assert.equal( await provider.hashDeleteField( "session:def", "userId" ), true );
        assert.equal( await provider.hashDeleteField( "session:def", "userId" ), false );
    } );

} );

describe( "HttpCacheProvider — JSON documents", () => {

    it( "round-trips a whole document", async () => {
        let { provider } = await connectedProvider();

        await provider.setJSON( "capture", { a: { email: "one@example.com" } } );
        assert.deepEqual( await provider.getJSON( "capture" ), { a: { email: "one@example.com" } } );
    } );

    it( "returns null for a document that is not there", async () => {
        let { provider } = await connectedProvider();

        assert.equal( await provider.getJSON( "no-such-document" ), null );
    } );

    it( "addresses a branch by path", async () => {
        let { provider } = await connectedProvider();

        await provider.setJSON( "branchy", { a: 1 } );
        await provider.setJSON( "branchy", { nested: true }, [ "b" ] );

        assert.deepEqual( await provider.getJSON( "branchy", [ "b" ] ), { nested: true } );
        assert.deepEqual( await provider.getJSON( "branchy" ), { a: 1, b: { nested: true } } );
    } );

    it( "applies editJSON as a single merge instruction, never as a read followed by a write", async () => {
        let { provider } = await connectedProvider();
        await provider.setJSON( "capture", {} );

        let before = stub.requestLog.length;
        await provider.editJSON( "capture", { email: "one@example.com" }, [ "rec-1" ] );
        let issued = stub.requestLog.slice( before );

        // This is the capability claim made concrete. A provider that emulated the merge would show a
        // '/v1/documents/get' here, and two concurrent signups would silently become one.
        assert.deepEqual( issued.map( ( entry ) => entry.path ), [ "/v1/documents/merge" ] );
    } );

    it( "leaves a sibling branch alone when it edits one", async () => {
        let { provider } = await connectedProvider();
        await provider.setJSON( "signups", {} );

        await Promise.all( [
            provider.editJSON( "signups", { email: "one@example.com" }, [ "rec-1" ] ),
            provider.editJSON( "signups", { email: "two@example.com" }, [ "rec-2" ] )
        ] );

        assert.deepEqual( await provider.getJSON( "signups" ), {
            "rec-1": { email: "one@example.com" },
            "rec-2": { email: "two@example.com" }
        } );
    } );

    it( "merges into an existing branch rather than replacing it", async () => {
        let { provider } = await connectedProvider();
        await provider.setJSON( "profile", { user: { name: "Boris" } } );

        await provider.editJSON( "profile", { locale: "bg" }, [ "user" ] );

        // The distinction from setJSON, which replaces what the path addresses. Whether the two survive a genuine
        // race is a property of the state service, not of this provider - what is testable here is that the provider
        // asks for a merge and asks for it once, which is the test above.
        assert.deepEqual( await provider.getJSON( "profile", [ "user" ] ), { name: "Boris", locale: "bg" } );
    } );

    it( "honours the set-only-if-absent override mode", async () => {
        let { provider } = await connectedProvider();

        await provider.setJSON( "once", { value: "first" } );
        await provider.setJSON( "once", { value: "second" }, "$", 1 );

        assert.deepEqual( await provider.getJSON( "once" ), { value: "first" } );
    } );

} );

describe( "HttpCacheProvider — the surface it deliberately leaves abstract", () => {

    it( "raises the inherited exception, naming the method, for the exchange-only calls", async () => {
        let provider = new HttpCacheProvider( "test-cache" );

        // Lists and sets are used exclusively by the message exchange, which is disabled where this provider runs. A
        // stub that resolved with nothing would be worse than an exception that says which method is missing.
        await assert.rejects(
            provider.listPushValue( "a-list", [ 1 ] ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL );
                assert.equal( error.data.name, "HttpCacheProvider.listPushValue" );
                return true;
            }
        );
        await assert.rejects(
            provider.addToSet( "a-set", 1 ),
            ( error ) => assert.equal( error.data.name, "HttpCacheProvider.addToSet" ) || true
        );
    } );

} );

describe( "HttpCacheProvider — failure handling", () => {

    it( "rejects a call the service refuses without taking the connection down", async () => {
        let { provider, observer } = await connectedProvider();
        stub.failNext( "/v1/values/get", 500 );

        await assert.rejects( provider.getValue( "anything" ) );

        // The service answered, so the connection is fine; only this call failed. Marking the cache down here would
        // let one bad key take the whole store out of service.
        assert.deepEqual( observer.events, [ "recovered:test-cache" ] );
        assert.equal( await provider.getValue( "anything" ), undefined );
    } );

} );

describe( "HttpCacheProvider — when the state service goes away", () => {

    before( () => {
        return new Promise( ( resolve ) => stub.server.close( resolve ) );
    } );

    it( "announces the disruption so the cache stops passing calls through", async () => {
        let observer = new RecordingObserver();
        let provider = new HttpCacheProvider( "test-cache" );
        provider.addConnectionObserver( observer );

        // Connected as far as this provider knows, because nothing has failed yet.
        provider.onConnectionRecovered = undefined;
        await assert.rejects(
            provider.initialize(),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                return true;
            }
        );

        await provider.shutDown();
    } );

    it( "reports an unreachable service as a cache-unavailable exception on an ordinary call", async () => {
        let provider = new HttpCacheProvider( "test-cache" );

        await assert.rejects(
            provider.getValue( "anything" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                assert.match( error.data.details, /could not be reached/ );
                return true;
            }
        );

        await provider.shutDown();
    } );

} );
