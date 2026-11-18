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


"use strict";

/*
 * What the message tracer keeps of a message, and where (CA-589).
 *
 * Every bus call is traced six times. Each entry's snapshot used to be the whole message less its payload and the keys
 * that looked like a password, so it kept the bearer token and every parameter value. All of it went into one key whose
 * expiry every write pushed back - under steady traffic it never expired - or, without RedisJSON, into a set with no
 * expiry at all. A server that ran for two days held 2,424 entries, 2,124 of them with a token.
 *
 * The backend here records every write instead of making it; message-tracer.redis.test.js makes them for real.
 */

const path = require( "node:path" );

// Read once, when the framework is first required, so these go in before it is. The trace's own settings are taken out
// of the environment, so that a developer's shell cannot change what is measured.
process.env.TI_MEMORY_CACHE_PROVIDER = path.resolve( __dirname, "fixtures", "recording-cache-provider.js" );
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";
Object.keys( process.env ).filter( ( name ) => name.startsWith( "TI_MESSAGE_EXCHANGE_TRACE_" ) ).forEach( ( name ) => delete process.env[ name ] );

const { before, beforeEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const RecordingCacheProvider = require( "./fixtures/recording-cache-provider.js" );
const cache = require( "@ti-engine/core/cache" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { cacheCapability } = require( "#cache-capability" );
const messageTracer = require( "#message-tracer" );

const OBSCURED = "OBSCURED_BY_SYSTEM";
const TOKEN = "bearer-7f3c9e1d-never-in-a-trace";
const EMAIL = "someone@example.invalid";
const RESET_CODE = "482913";
const LOG_LINE = "a line of an uploaded log that names a person";

let warnings = [];

/**
 * A service call as the caller builds it, with values no trace may hold.
 *
 * @param {Object} [overrides]
 * @returns {Object}
 */
function serviceCall( overrides = {} ) {
    return {
        authToken: TOKEN,
        chainID: "chain-" + Math.random().toString( 16 ).slice( 2 ),
        chainLevel: 1,
        createdOn: 1763460000000,
        destination: { instanceID: undefined, route: "accounts" },
        executionTime: 0,
        exception: undefined,
        finishedOn: undefined,
        hash: "a-message-hash",
        isCompleted: false,
        isSuccessful: undefined,
        messageID: "message-" + Math.random().toString( 16 ).slice( 2 ),
        payload: { result: "a payload" },
        predecessor: "message-before",
        serviceAddress: { serviceAlias: "request-reset", serviceDomainName: "accounts", serviceVersion: 1, onBehalfOf: EMAIL },
        serviceParams: { email: EMAIL, code: RESET_CODE, upload: { lines: [ LOG_LINE ] }, [ EMAIL ]: true },
        source: { instanceID: "ti-instance-1", route: "gateway", note: EMAIL },
        successors: undefined,
        ...overrides
    };
}

/**
 * Used to record one entry and hand back the writes it asked for.
 *
 * @param {Object} message
 * @param {number} [type]
 * @returns {Promise<Object[]>} The writes, as `{ method, args }`, once the tracer's promise chain has run.
 */
async function trace( message, type = messageTracer.messageType.MESSAGE_REQUEST ) {
    RecordingCacheProvider.writes = [];
    messageTracer.instance.recordTraceEntry( message, type, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PENDING );
    // The expiry is set again once the push has resolved, a turn of the promise chain later.
    await new Promise( ( resolve ) => setImmediate( resolve ) );
    return RecordingCacheProvider.writes;
}

before( async () => {
    const log = logger.log;
    logger.log = ( message, level, ...rest ) => {
        if ( level === logger.logSeverity.WARNING ) {
            warnings.push( message );
        }
        return log( message, level, ...rest );
    };
    await cache.instance.initialize();
} );

beforeEach( async () => {
    RecordingCacheProvider.declaredCapabilities = [ cacheCapability.KEY_EXPIRY, cacheCapability.LISTS ];
    await messageTracer.instance.initialize();
    warnings = [];
} );

describe( "where a trace entry is stored", () => {

    it( "goes to its chain's own list, with the expiry set in the same push, and nowhere else", async () => {
        const message = serviceCall();
        const writes = await trace( message );

        // The old tracer appended to one shared key and pushed its expiry back, or added to a set and set none.
        assert.deepEqual( writes.map( ( write ) => write.method ), [ "listPushValue", "expireValue" ] );
        const [ listName, values, expiration ] = writes[ 0 ].args;
        assert.equal( listName, "ti:messages:trace:" + message.chainID );
        assert.equal( values.length, 1 );
        assert.equal( values[ 0 ].chainID, message.chainID );
        assert.equal( expiration, 3600 );
    } );

    it( "sets the expiry again on its own, for a backend that ignores the push's", async () => {
        // A backend written to the 1.22.0 contract implements listPushValue( listName, values ) and drops the third
        // argument; with only the push's expiry, every chain's list would be kept for good.
        const message = serviceCall();
        const writes = await trace( message );
        assert.equal( writes[ 1 ].method, "expireValue" );
        assert.deepEqual( writes[ 1 ].args.slice( 0, 2 ), [ "ti:messages:trace:" + message.chainID, 3600 ] );
    } );

    it( "files a message without a chain under its own ID", async () => {
        const message = serviceCall( { chainID: undefined } );
        const [ write ] = await trace( message );
        assert.equal( write.args[ 0 ], "ti:messages:trace:" + message.messageID );
    } );

    it( "writes nothing to initialize", async () => {
        RecordingCacheProvider.writes = [];
        await messageTracer.instance.initialize();
        assert.deepEqual( RecordingCacheProvider.writes, [] );
    } );

} );

describe( "what a trace entry keeps of the message", () => {

    it( "keeps no auth token, parameter, payload or hash, and nothing a caller added to its objects", async () => {
        const [ write ] = await trace( serviceCall() );
        const stored = JSON.stringify( write.args[ 1 ] );

        for ( const secret of [ TOKEN, EMAIL, RESET_CODE, LOG_LINE, "a payload", "a-message-hash" ] ) {
            assert.equal( stored.includes( secret ), false, `the entry holds '${ secret }'` );
        }
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;
        assert.equal( "payload" in snapshot, false );
        assert.equal( "hash" in snapshot, false );
    } );

    it( "says that a token and parameters were there, not even the parameters' names", async () => {
        // A gateway that passes a client's request body on as the parameters lets the client choose the names, so a
        // name can be an address, as one is here.
        const [ write ] = await trace( serviceCall() );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.equal( snapshot.authToken, OBSCURED );
        assert.equal( snapshot.serviceParams, OBSCURED );
    } );

    it( "keeps where the message went and when", async () => {
        const message = serviceCall();
        const [ write ] = await trace( message );
        const entry = write.args[ 1 ][ 0 ];

        assert.deepEqual( entry.messageSnapshot, {
            authToken: OBSCURED,
            chainLevel: 1,
            createdOn: 1763460000000,
            destination: { route: "accounts" },
            executionTime: 0,
            isCompleted: false,
            predecessor: "message-before",
            serviceAddress: { serviceAlias: "request-reset", serviceDomainName: "accounts", serviceVersion: 1 },
            serviceParams: OBSCURED,
            source: { instanceID: "ti-instance-1", route: "gateway" }
        } );
        assert.equal( entry.messageID, message.messageID );
        assert.equal( entry.fromAddress, "gateway.ti-instance-1" );
        assert.equal( entry.toAddress, "accounts" );
        assert.equal( entry.messageType, "REQUEST" );
        assert.equal( entry.dispatchEvent, "SENT" );
    } );

    it( "has neither token nor parameters when the message carried none", async () => {
        const [ write ] = await trace( serviceCall( { authToken: undefined, serviceParams: undefined } ) );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.equal( "authToken" in snapshot, false );
        assert.equal( "serviceParams" in snapshot, false );
    } );

    it( "obscures parameters that are not a plain object as well", async () => {
        const [ write ] = await trace( serviceCall( { serviceParams: [ EMAIL ] } ) );
        assert.equal( write.args[ 1 ][ 0 ].messageSnapshot.serviceParams, OBSCURED );
    } );

    it( "keeps which exception a call ended with, never its description or data", async () => {
        const exception = exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { email: EMAIL } ).asJSON();
        const response = serviceCall( {
            exception: { ...exception, description: "no account for " + EMAIL },
            executionTime: 12,
            finishedOn: 1763460000012,
            isCompleted: true,
            isSuccessful: false,
            payload: undefined
        } );
        const [ write ] = await trace( response, messageTracer.messageType.MESSAGE_RESPONSE );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.deepEqual( snapshot.exception, { code: exception.code, id: exception.id, label: exception.label } );
        assert.equal( JSON.stringify( write.args[ 1 ] ).includes( EMAIL ), false );
        assert.equal( snapshot.isSuccessful, false );
        assert.equal( snapshot.executionTime, 12 );
    } );

    it( "keeps an exception's ID only when the framework made it", async () => {
        // A service that rejects with a plain object supplies the ID itself (exceptions.raise takes `source.id`).
        const exception = exceptions.raise( { id: EMAIL, code: exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE } ).asJSON();
        assert.equal( exception.id, EMAIL );
        const [ write ] = await trace( serviceCall( { exception: exception, isSuccessful: false } ), messageTracer.messageType.MESSAGE_RESPONSE );

        assert.deepEqual( write.args[ 1 ][ 0 ].messageSnapshot.exception, { code: exception.code, label: exception.label } );
    } );

    it( "is a copy: a later change to the message does not reach it", async () => {
        const message = serviceCall();
        const [ write ] = await trace( message );
        message.destination.instanceID = "ti-instance-2";
        message.serviceAddress.serviceAlias = "changed";

        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;
        assert.equal( "instanceID" in snapshot.destination, false );
        assert.equal( snapshot.serviceAddress.serviceAlias, "request-reset" );
    } );

} );

describe( "a backend that could not expire the trace", () => {

    for ( const [ name, capabilities, missing ] of [
        [ "no key expiry", [ cacheCapability.LISTS ], "key-expiry" ],
        [ "no lists", [ cacheCapability.KEY_EXPIRY, cacheCapability.SETS ], "lists" ]
    ] ) {
        it( `stores nothing, and says so once, with ${ name }`, async () => {
            RecordingCacheProvider.declaredCapabilities = capabilities;
            await messageTracer.instance.initialize();

            assert.deepEqual( await trace( serviceCall() ), [] );
            assert.deepEqual( await trace( serviceCall() ), [] );
            assert.equal( warnings.length, 1 );
            assert.match( warnings[ 0 ], new RegExp( `does not provide ${ missing }` ) );
        } );
    }

} );
