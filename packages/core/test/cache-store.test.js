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

// Set before anything pulls in the configuration, which reads the environment once. The configured cache is a stub
// that counts its constructions, so this file can prove a store never touches it; and the configured state service is
// a port nothing listens on, so a store that reaches its service at all has taken the address from its own settings.
const path = require( "path" );

process.env.TI_MEMORY_CACHE_PROVIDER = path.resolve( __dirname, "fixtures", "stub-cache-provider.js" );
process.env.TI_MEMORY_CACHE_STATE_URL = "http://127.0.0.1:1";
// The configured service's credential and its transport exemption, which no store naming another address may carry.
process.env.TI_MEMORY_CACHE_STATE_AUTH_TOKEN = "configured-secret";
process.env.TI_MEMORY_CACHE_STATE_ALLOW_INSECURE_AUTH = "true";
// Long enough that no recovery probe fires during the run.
process.env.TI_MEMORY_CACHE_RETRY_MAX_INTERVAL = "600000";

const assert = require( "node:assert/strict" );
const { after, before, describe, it } = require( "node:test" );
const StubCacheProvider = require( "./fixtures/stub-cache-provider.js" );
const RedisCacheProvider = require( "#redis-cache-provider" );
const cache = require( "@ti-engine/core/cache" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );
const { competencePartitions, createD1Database, serveOverHttp, sqliteUnavailable } = require( "./fixtures/d1-sqlite.js" );
const { createD1StateService } = require( "@ti-engine/core/state-service" );

const servers = [];
let first = null;
let second = null;

before( async () => {
    first = await startStubStateServer();
    second = await startStubStateServer();
    servers.push( first.server, second.server );
} );

after( () => {
    servers.filter( ( server ) => server.listening === true ).forEach( ( server ) => server.close() );
} );

describe( "createCacheStore", () => {

    it( "opens a store of its own, and never touches the configured cache", async () => {
        const constructions = StubCacheProvider.constructions;
        const store = cache.createCacheStore( "application-records", { settings: { stateUrl: first.baseUrl } } );
        assert.equal( StubCacheProvider.constructions, constructions, "no second configured backend was built" );
        assert.notEqual( store, cache.instance );
        assert.ok( Object.isFrozen( store ) );
        assert.equal( store.connectionIdentifier, "application-records" );
        assert.equal( cache.instance.connectionIdentifier, "system-cache" );

        await store.initialize();
        assert.equal( store.isOperational, true );
        assert.equal( cache.instance.isOperational, false, "bringing a store up must not bring the configured cache up" );
        await store.setValue( "k", "v" );
        assert.equal( first.values.get( "k" ), "v", "the write reached the store's own service" );
        await store.shutDown();
    } );

    it( "takes its service from its own settings, not the configured one", async () => {
        const configured = cache.createCacheStore( "configured-address" );
        await assert.rejects( configured.initialize(), ( error ) => error.code === exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
        assert.equal( configured.isOperational, false );
        await configured.shutDown();
    } );

    it( "sends the configured token to the configured service only, never to an address a store names", async () => {
        // A bearer token belongs to the service it was issued for. Inherited, the configured one went to whatever
        // address a store named.
        let mark = first.requestLog.length;
        const anonymous = cache.createCacheStore( "own-address", { settings: { stateUrl: first.baseUrl } } );
        await anonymous.initialize();
        await anonymous.setValue( "k", "v" );
        const unauthenticated = first.requestLog.slice( mark );
        assert.ok( unauthenticated.length > 0 );
        assert.deepEqual( unauthenticated.map( ( entry ) => entry.headers.authorization ).filter( Boolean ), [], "the configured token stayed home" );
        await anonymous.shutDown();

        mark = first.requestLog.length;
        const authenticated = cache.createCacheStore( "own-credential", { settings: { stateUrl: first.baseUrl, stateAuthToken: "its-own" } } );
        await authenticated.initialize();
        await authenticated.setValue( "k", "v" );
        assert.deepEqual( [ ...new Set( first.requestLog.slice( mark ).map( ( entry ) => entry.headers.authorization ) ) ], [ "Bearer its-own" ] );
        await authenticated.shutDown();
    } );

    it( "takes the plain-HTTP exemption for a token from the store's own settings, not the configured service's", () => {
        // The configured exemption vouches for the configured service's transport, and for no other.
        const settings = { stateUrl: "http://state.example.com", stateAuthToken: "its-own" };
        assert.throws( () => cache.createCacheStore( "exposed", { settings: settings } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        assert.doesNotThrow( () => cache.createCacheStore( "vouched", { settings: { ...settings, stateAllowInsecureAuth: true } } ) );
    } );

    it( "keeps two stores' operational state apart", async () => {
        const records = cache.createCacheStore( "records", { settings: { stateUrl: first.baseUrl } } );
        const sessions = cache.createCacheStore( "sessions", { settings: { stateUrl: second.baseUrl } } );
        await records.initialize();
        await sessions.initialize();

        second.breakTransport( true );
        await assert.rejects( sessions.getValue( "k" ) );
        assert.equal( sessions.isOperational, false );
        assert.equal( records.isOperational, true, "one service going away takes down only the store over it" );
        await records.setValue( "still", "here" );
        second.breakTransport( false );

        await records.shutDown();
        await sessions.shutDown();
    } );

    it( "checks the capabilities it was opened with, not the configured ones", async () => {
        const store = cache.createCacheStore( "needs-sets", { settings: { stateUrl: first.baseUrl }, requiredCapabilities: [ cache.cacheCapability.SETS ] } );
        await assert.rejects( store.initialize(), ( error ) => error.code === exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED );
        assert.equal( store.isOperational, false, "a refused store is rolled back, not left half up" );
    } );

    it( "refuses a backend the engine does not ship", () => {
        assert.throws( () => cache.createCacheStore( "x", { provider: "memcached" } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        assert.throws( () => cache.createCacheStore( "x", { provider: "constructor" } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
    } );

} );

describe( "getJSONValue — one shape from either backend", () => {

    /**
     * A Redis backend answering `getJSON` with whatever RedisJSON would have: the pure half of `getJSONValue`, tested
     * without a server.
     */
    class AnsweringRedis extends RedisCacheProvider {
        constructor( answer ) {
            super( "answering-redis" );
            this.answer = answer;
        }

        getJSON() {
            return Promise.resolve( this.answer );
        }
    }

    const baseline = [ "E1-1", "E1-2", "E1-3" ];

    it( "unwraps RedisJSON's list of matches, and keeps a stored array whole", async () => {
        assert.deepEqual( await new AnsweringRedis( [ baseline ] ).getJSONValue( "sets", "$.SE" ), baseline );
        assert.deepEqual( await new AnsweringRedis( [ { a: 1 } ] ).getJSONValue( "k", "$.x" ), { a: 1 } );
        assert.equal( await new AnsweringRedis( [ "first", "second" ] ).getJSONValue( "k", "$.*.id" ), "first", "a wildcard answers its first match" );
        assert.equal( await new AnsweringRedis( [] ).getJSONValue( "k", "$.missing" ), null );
        assert.equal( await new AnsweringRedis( [ null ] ).getJSONValue( "k", "$.stored-null" ), null );
        assert.equal( await new AnsweringRedis( null ).getJSONValue( "missing-key" ), null );
    } );

    it( "answers the stored array whole over HTTP, where the old unwrap kept only its first code (CA-178)", async () => {
        const store = cache.createCacheStore( "sets", { settings: { stateUrl: first.baseUrl } } );
        await store.initialize();
        await store.setJSON( "sets", { SE: { baseline: { c1: baseline } } } );

        const read = await store.getJSON( "sets", [ "SE", "baseline", "c1" ] );
        assert.equal( ( read instanceof Array ) ? read[ 0 ] : read, "E1-1", "the unwrap every caller used truncates it here" );
        assert.deepEqual( await store.getJSONValue( "sets", [ "SE", "baseline", "c1" ] ), baseline );
        assert.equal( await store.getJSONValue( "sets", [ "SE", "missing" ] ), null );
        assert.equal( await store.getJSONValue( "no-such-key" ), null );
        await store.shutDown();
    } );

} );

describe( "A store over the D1 state service, end to end", { skip: sqliteUnavailable }, () => {

    const EVALUATIONS = "ti:competence:data:evaluations";
    const PEER_REVIEWS = "ti:competence:data:peer-review-assignments";
    let database = null;
    let store = null;

    before( async () => {
        if ( sqliteUnavailable ) {
            return;
        }
        database = createD1Database();
        const served = await serveOverHttp( createD1StateService( database, { partitions: competencePartitions } ) );
        servers.push( served.server );
        store = cache.createCacheStore( "competence-records", {
            settings: { stateUrl: served.baseUrl },
            requiredCapabilities: [ cache.cacheCapability.JSON_DOCUMENTS, cache.cacheCapability.ATOMIC_JSON_EDIT ]
        } );
        await store.initialize();
    } );

    after( async () => {
        if ( store !== null ) {
            await store.shutDown();
        }
    } );

    it( "carries DataManager's own calls through the provider to one row per entity", async () => {
        await store.setJSON( EVALUATIONS, {}, "$", 1 );
        await store.editJSON( EVALUATIONS, { e1: { v1: { status: "open", goals: [ "lead", "mentor" ] } } } );
        await store.editJSON( EVALUATIONS, { e2: { v2: { status: "closed" } } } );

        // The dotted wildcard `DataManager#fetchEvaluation` reads by, and the forms it reads everything else with.
        assert.deepEqual( await store.getJSONValue( EVALUATIONS, "*.v1" ), { status: "open", goals: [ "lead", "mentor" ] } );
        assert.equal( await store.getJSONValue( EVALUATIONS, "*.v9" ), null );
        assert.deepEqual( await store.getJSONValue( EVALUATIONS, "e2" ), { v2: { status: "closed" } } );
        assert.deepEqual( await store.getJSONValue( EVALUATIONS, [ "e1", "v1", "goals" ] ), [ "lead", "mentor" ] );
        assert.deepEqual( Object.keys( await store.getJSONValue( EVALUATIONS ) ).sort(), [ "e1", "e2" ] );
        assert.deepEqual( database.rows( EVALUATIONS ).map( ( row ) => row.path ), [ "[\"e1\",\"v1\"]", "[\"e2\",\"v2\"]", "[]" ] );
    } );

    it( "stores a peer-review marker's count as the number it is", async () => {
        await store.setJSON( PEER_REVIEWS, {}, "$", 1 );
        await store.setJSON( PEER_REVIEWS, 1, [ "c1", "e2", "m1" ], 1 );
        await store.setJSON( PEER_REVIEWS, -1, [ "c1", "e2", "m2" ], 1 );
        assert.deepEqual( await store.getJSONValue( PEER_REVIEWS, [ "c1" ] ), { e2: { m1: 1, m2: -1 } } );
    } );

    it( "rejects the one call the service refuses, and stays operational", async () => {
        await assert.rejects( store.getJSONValue( EVALUATIONS, "*" ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_JS_INTERNAL_ERROR
            && /HTTP 400: .*wildcard/.test( error.data.details ) );
        assert.equal( store.isOperational, true );
    } );

} );
