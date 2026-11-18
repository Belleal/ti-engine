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

// Read once, when the framework is first required, so these go in before it is.
process.env.TI_MEMORY_CACHE_PROVIDER = path.resolve( __dirname, "fixtures", "recording-cache-provider.js" );
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";

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
        serviceAddress: { serviceAlias: "request-reset", serviceDomainName: "accounts", serviceVersion: 1 },
        serviceParams: { email: EMAIL, code: RESET_CODE, upload: { lines: [ LOG_LINE ] } },
        source: { instanceID: "ti-instance-1", route: "gateway" },
        successors: undefined,
        ...overrides
    };
}

/**
 * Used to record one entry and hand back the pushes it made.
 *
 * @param {Object} message
 * @param {number} [type]
 * @returns {Object[]} The `listPushValue` writes, as `{ listName, entry, expiration }`.
 */
function trace( message, type = messageTracer.messageType.MESSAGE_REQUEST ) {
    RecordingCacheProvider.writes = [];
    messageTracer.instance.recordTraceEntry( message, type, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PENDING );
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

    it( "goes to its chain's own list, with the expiry set in the same push, and nowhere else", () => {
        const message = serviceCall();
        const writes = trace( message );

        // One write: the old tracer appended to one shared key and then set its expiry in a second call, or added to a
        // set and set none.
        assert.equal( writes.length, 1 );
        assert.equal( writes[ 0 ].method, "listPushValue" );
        const [ listName, values, expiration ] = writes[ 0 ].args;
        assert.equal( listName, "ti:messages:trace:" + message.chainID );
        assert.equal( values.length, 1 );
        assert.equal( values[ 0 ].chainID, message.chainID );
        assert.equal( expiration, 3600 );
    } );

    it( "files a message without a chain under its own ID", () => {
        const message = serviceCall( { chainID: undefined } );
        const [ write ] = trace( message );
        assert.equal( write.args[ 0 ], "ti:messages:trace:" + message.messageID );
    } );

    it( "writes nothing to initialize", async () => {
        RecordingCacheProvider.writes = [];
        await messageTracer.instance.initialize();
        assert.deepEqual( RecordingCacheProvider.writes, [] );
    } );

} );

describe( "what a trace entry keeps of the message", () => {

    it( "keeps no auth token, parameter value, payload or hash", () => {
        const [ write ] = trace( serviceCall() );
        const stored = JSON.stringify( write.args[ 1 ] );

        for ( const secret of [ TOKEN, EMAIL, RESET_CODE, LOG_LINE, "a payload", "a-message-hash" ] ) {
            assert.equal( stored.includes( secret ), false, `the entry holds '${ secret }'` );
        }
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;
        assert.equal( "payload" in snapshot, false );
        assert.equal( "hash" in snapshot, false );
    } );

    it( "says that a token was there and which parameters were passed", () => {
        const [ write ] = trace( serviceCall() );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.equal( snapshot.authToken, OBSCURED );
        assert.deepEqual( snapshot.serviceParams, { email: OBSCURED, code: OBSCURED, upload: OBSCURED } );
    } );

    it( "keeps where the message went and when", () => {
        const message = serviceCall();
        const [ write ] = trace( message );
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
            serviceParams: { email: OBSCURED, code: OBSCURED, upload: OBSCURED },
            source: { instanceID: "ti-instance-1", route: "gateway" }
        } );
        assert.equal( entry.messageID, message.messageID );
        assert.equal( entry.fromAddress, "gateway.ti-instance-1" );
        assert.equal( entry.toAddress, "accounts" );
        assert.equal( entry.messageType, "REQUEST" );
        assert.equal( entry.dispatchEvent, "SENT" );
    } );

    it( "has neither token nor parameters when the message carried none", () => {
        const [ write ] = trace( serviceCall( { authToken: undefined, serviceParams: undefined } ) );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.equal( "authToken" in snapshot, false );
        assert.equal( "serviceParams" in snapshot, false );
    } );

    it( "obscures parameters that are not a plain object as a whole", () => {
        const [ write ] = trace( serviceCall( { serviceParams: [ EMAIL ] } ) );
        assert.equal( write.args[ 1 ][ 0 ].messageSnapshot.serviceParams, OBSCURED );
    } );

    it( "keeps which exception a call ended with, never its description or data", () => {
        const exception = exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { email: EMAIL } ).asJSON();
        const response = serviceCall( {
            exception: { ...exception, description: "no account for " + EMAIL },
            executionTime: 12,
            finishedOn: 1763460000012,
            isCompleted: true,
            isSuccessful: false,
            payload: undefined
        } );
        const [ write ] = trace( response, messageTracer.messageType.MESSAGE_RESPONSE );
        const snapshot = write.args[ 1 ][ 0 ].messageSnapshot;

        assert.deepEqual( snapshot.exception, { code: exception.code, id: exception.id, label: exception.label } );
        assert.equal( JSON.stringify( write.args[ 1 ] ).includes( EMAIL ), false );
        assert.equal( snapshot.isSuccessful, false );
        assert.equal( snapshot.executionTime, 12 );
    } );

    it( "is a copy: a later change to the message does not reach it", () => {
        const message = serviceCall();
        const [ write ] = trace( message );
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

            assert.deepEqual( trace( serviceCall() ), [] );
            assert.deepEqual( trace( serviceCall() ), [] );
            assert.equal( warnings.length, 1 );
            assert.match( warnings[ 0 ], new RegExp( `does not provide ${ missing }` ) );
        } );
    }

} );
