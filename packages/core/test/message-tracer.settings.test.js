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
 * The settings that govern the message trace's store, as an application can set them: from the environment (CA-589).
 *
 * Both lived only in core's own settings file, which no application can override, so a deployment that must not keep
 * traces, or must keep them for less than an hour, had no way to say so. And an expiration that is not a whole number
 * of seconds - a typo, an empty value - fails `expiration > 0`, which meant the trace was kept for good: the tracer now
 * refuses to start with one.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const { execFileSync } = require( "node:child_process" );
const exceptions = require( "@ti-engine/core/exceptions" );

const SCRIPT = path.resolve( __dirname, "fixtures", "trace-one-entry.js" );
const SETTINGS = [ "TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME", "TI_MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED", "TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED" ];

/**
 * Used to trace one message in a fresh process with the given settings.
 *
 * @param {Object.<string, string>} settings
 * @returns {{ refusal: Object|null, writes: Object[] }}
 */
function traceWith( settings ) {
    const env = { ...process.env };
    SETTINGS.forEach( ( name ) => delete env[ name ] );
    return JSON.parse( execFileSync( process.execPath, [ SCRIPT, "--report" ], { env: { ...env, ...settings }, encoding: "utf8" } ) );
}

describe( "the trace store's settings from the environment", () => {

    it( "keeps a chain's trace for an hour by default", () => {
        assert.deepEqual( traceWith( {} ), {
            refusal: null,
            writes: [
                { method: "listPushValue", key: "ti:messages:trace:chain-1", expiration: 3600 },
                { method: "expireValue", key: "ti:messages:trace:chain-1", expiration: 3600 }
            ]
        } );
    } );

    it( "takes the expiration from TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME", () => {
        assert.deepEqual( traceWith( { TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: "120" } ).writes, [
            { method: "listPushValue", key: "ti:messages:trace:chain-1", expiration: 120 },
            { method: "expireValue", key: "ti:messages:trace:chain-1", expiration: 120 }
        ] );
    } );

    it( "sets no expiry when it is 0, as documented", () => {
        // JSON drops the undefined expiration: the push was asked for with none.
        assert.deepEqual( traceWith( { TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: "0" } ).writes, [
            { method: "listPushValue", key: "ti:messages:trace:chain-1" }
        ] );
    } );

    for ( const value of [ "", " ", "an hour", "-5", "1.5", "Infinity" ] ) {
        it( `refuses to start with an expiration of '${ value }', and stores nothing`, () => {
            const result = traceWith( { TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: value } );
            assert.equal( result.refusal.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
            assert.match( result.refusal.details, /traceExpirationTime. \(TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME\) must be a whole number of seconds/ );
            assert.match( result.refusal.details, /TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME/ );
            assert.deepEqual( result.writes, [] );
        } );
    }

    it( "stores nothing with TI_MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED=false", () => {
        assert.deepEqual( traceWith( { TI_MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED: "false" } ), { refusal: null, writes: [] } );
    } );

    it( "checks no expiration with the store off: there is nothing it would govern", () => {
        assert.deepEqual( traceWith( { TI_MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED: "false", TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: "an hour" } ),
            { refusal: null, writes: [] } );
    } );

    it( "stores nothing with the store off even when the trace is logged", () => {
        assert.deepEqual( traceWith( { TI_MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED: "false", TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED: "true" } ).writes, [] );
    } );

} );
