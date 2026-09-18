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
 * The most recent request the stub received.
 *
 * @returns {Object}
 */
function lastRequest() {
    return stub.requestLog[ stub.requestLog.length - 1 ];
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
        // Asserted from the request rather than the store: what the provider sends is its job, what the store then
        // does with it is the protocol's.
        assert.equal( lastRequest().payload.expiration, 60 );
    } );

    it( "resolves expireValue with the number of seconds it was asked for", async () => {
        let { provider } = await connectedProvider();

        await provider.setValue( "session:1", "x" );
        assert.equal( await provider.expireValue( "session:1", 900 ), 900 );
        assert.equal( lastRequest().payload.seconds, 900 );
    } );

    it( "stops reading and matching a key once its expiry has passed", async () => {
        let { provider } = await connectedProvider();

        await provider.setValue( "fleeting:1", "x", 60 );
        assert.equal( await provider.getValue( "fleeting:1" ), "x" );
        assert.deepEqual( await provider.matchKeys( "fleeting:*" ), [ "fleeting:1" ] );

        stub.advanceClock( 61 * 1000 );

        // The protocol requires expired rows to be filtered on read. A store that only recorded the duration would
        // pass an assertion on the forwarded number and still serve the value forever.
        assert.equal( await provider.getValue( "fleeting:1" ), undefined );
        assert.deepEqual( await provider.matchKeys( "fleeting:*" ), [] );
    } );

    it( "expires one hash field without touching its siblings", async () => {
        let { provider } = await connectedProvider();

        await provider.hashSetField( "expiring-sessions", "short", 1 );
        await provider.hashSetField( "expiring-sessions", "long", 2 );
        // The argument order reads backwards: "short" is the field, "expiring-sessions" the hash holding it.
        await provider.expireValue( "short", 30, "expiring-sessions" );

        stub.advanceClock( 31 * 1000 );

        assert.equal( await provider.hashGetField( "expiring-sessions", "short" ), null );
        assert.equal( await provider.hashGetField( "expiring-sessions", "long" ), 2 );
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

describe( "HttpCacheProvider — losing the connection", () => {

    it( "announces the disruption once, on the transition rather than per failed call", async () => {
        let { provider, observer } = await connectedProvider();

        stub.breakTransport( true );
        await assert.rejects( provider.getValue( "anything" ) );
        await assert.rejects( provider.getValue( "anything" ) );
        stub.breakTransport( false );

        // The cache is either in service or it is not; a second failure while already down is not news.
        assert.deepEqual( observer.events, [ "recovered:test-cache", "disrupted:test-cache" ] );

        await provider.shutDown();
    } );

    it( "treats a body that dies part-way through as a transport failure, not a good response", async () => {
        let { provider, observer } = await connectedProvider();
        let before = observer.events.length;

        // Headers arrive, then the socket dies before the body does. The response object exists and looks fine;
        // only reading it fails. Concluding "the service answered" from the headers alone would announce recovery
        // over a connection that had already gone.
        stub.breakTransportAfterHeaders( "/v1/values/get" );
        await assert.rejects(
            provider.getValue( "anything" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
                assert.match( error.data.details, /could not be reached/ );
                return true;
            }
        );

        assert.deepEqual( observer.events.slice( before ), [ "disrupted:test-cache" ] );

        await provider.shutDown();
    } );

} );

describe( "HttpCacheProvider — the shape of what it sends", () => {

    it( "uses the method each path answers, probing with GET and writing with POST", async () => {
        let before = stub.requestLog.length;
        let { provider } = await connectedProvider();

        await provider.setValue( "verbs", "x" );
        await provider.getJSON( "verbs" );

        let issued = stub.requestLog.slice( before );
        // The stub answers 405 on a mismatch, so a wrong verb would already have failed the calls above; this pins
        // the intent so neither side drifts.
        assert.deepEqual( issued.map( ( entry ) => `${ entry.method } ${ entry.path }` ), [
            "GET /v1/health",
            "POST /v1/values/set",
            "POST /v1/documents/get"
        ] );
    } );

    it( "refuses a redirect instead of resending the body to wherever it points", async () => {
        let { provider } = await connectedProvider();
        // A second, perfectly reachable service. Redirecting somewhere that fails to resolve would prove nothing:
        // the call would reject either way. This one answers, so following the redirect leaves a trace.
        let elsewhere = await startStubStateServer();

        try {
            stub.redirectNext( "/v1/values/set", `${ elsewhere.baseUrl }/v1/values/set` );

            // A 307 preserves method and body, so following one would hand this value - and the bearer token with
            // it - to a host no configuration ever named.
            await assert.rejects( provider.setValue( "should-not-travel", "secret" ) );

            assert.deepEqual( elsewhere.requestLog, [] );
            assert.equal( elsewhere.values.has( "should-not-travel" ), false );
            assert.equal( stub.values.has( "should-not-travel" ), false );
        } finally {
            elsewhere.server.close();
        }
    } );

} );

describe( "HttpCacheProvider — when the state service goes away", () => {

    before( () => {
        return new Promise( ( resolve ) => stub.server.close( resolve ) );
    } );

    it( "refuses to start against a service that is not listening", async () => {
        let provider = new HttpCacheProvider( "test-cache" );

        // Only initialization is under test here. A provider that has never connected announces no disruption,
        // because there is no transition to announce - that case is covered while the server is still up.
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
