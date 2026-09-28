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
 * `defaultErrorHandler` — what a failed request tells the client, and what it tells the log.
 *
 * Three defects, found together in competence's pre-launch review (CA-215):
 *
 * - **Stack traces reached the client.** The payload carried `exception.asJSON()`, data included, and a plain
 *   `Error` is raised with every own property copied into that data — `stack`, and body-parser's `body`. Nothing
 *   checked for production. A malformed JSON body, which needs no session at all, was enough to get the server's file
 *   paths and the echoed body back — as a 500, when it is the client's error.
 * - **Server errors were never logged.** Every one was logged at DEBUG, and a production deployment filters below
 *   INFO, so an operator had no record of any request that failed on the server.
 * - **Nothing tied a user's report to the log.** The exception's ID is now the correlation ID: it is in the response
 *   and in the ERROR line.
 *
 * A real Express application, with the real body parser in front, so the errors are the ones a deployment produces.
 */

const { describe, it, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const express = require( "express" );
const exceptions = require( "@ti-engine/core/exceptions" );
const logger = require( "@ti-engine/core/logger" );
const webHandlers = require( "#web-handlers" );

let logged;
let originalLog;

beforeEach( () => {
    logged = [];
    originalLog = logger.log;
    logger.log = ( message, severity, data ) => {
        logged.push( { message: String( message ), severity: severity, data: data } );
    };
} );

afterEach( () => {
    logger.log = originalLog;
} );

// Serves one request through `express.json()`, the given route and the default error handler.
function serve( route, request ) {
    const app = express();
    app.use( express.json( { limit: "1mb" } ) );
    app.all( "/target", route );
    app.use( webHandlers.defaultErrorHandler() );
    return new Promise( ( resolve, reject ) => {
        const server = app.listen( 0, "127.0.0.1", async () => {
            try {
                const response = await fetch( `http://127.0.0.1:${ server.address().port }/target?token=QUERY-SECRET`, Object.assign( { redirect: "manual" }, request ) );
                const text = await response.text();
                resolve( { status: response.status, headers: response.headers, text: text } );
            } catch ( error ) {
                reject( error );
            } finally {
                server.close();
            }
        } );
    } );
}

const JSON_POST = { method: "POST", headers: { "content-type": "application/json", accept: "application/json" } };

describe( "defaultErrorHandler", () => {

    describe( "a malformed JSON body", () => {

        it( "is the client's error: 400, not 500", async () => {
            const { status, text } = await serve( ( request, response ) => response.send( "unreachable" ), Object.assign( { body: "{bad" }, JSON_POST ) );
            assert.equal( status, 400 );
            assert.equal( JSON.parse( text ).exception.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_BODY );
        } );

        it( "echoes neither the body nor a stack trace", async () => {
            const { text } = await serve( ( request, response ) => response.send( "unreachable" ), Object.assign( { body: "{bad-BODY-SECRET" }, JSON_POST ) );
            assert.doesNotMatch( text, /BODY-SECRET/ );
            assert.doesNotMatch( text, /node_modules|at [\w.]+ \(/ );
        } );

        it( "is not logged as a server error", async () => {
            await serve( ( request, response ) => response.send( "unreachable" ), Object.assign( { body: "{bad" }, JSON_POST ) );
            assert.equal( logged.filter( ( entry ) => entry.severity >= logger.logSeverity.ERROR ).length, 0 );
        } );

    } );

    describe( "an application handler that throws", () => {

        const failing = () => {
            throw new TypeError( "Cannot read properties of undefined (reading 'INTERNAL-DETAIL')" );
        };

        it( "answers 500 with the code, the message and a reference — and no stack or internal detail", async () => {
            const { status, text } = await serve( failing, JSON_POST );
            assert.equal( status, 500 );
            const payload = JSON.parse( text );
            assert.equal( payload.isSuccessful, false );
            assert.equal( payload.exception.code, exceptions.exceptionCode.E_GEN_JS_INTERNAL_ERROR );
            assert.match( payload.exception.id, /\S/ );
            assert.equal( typeof payload.message, "string" );
            assert.equal( payload.exception.data, undefined );
            assert.doesNotMatch( text, /INTERNAL-DETAIL|node_modules|\.js:\d+/ );
        } );

        it( "is logged at ERROR under the reference the client was given, without the query string", async () => {
            const { text } = await serve( failing, JSON_POST );
            const reference = JSON.parse( text ).exception.id;
            const errors = logged.filter( ( entry ) => entry.severity === logger.logSeverity.ERROR );
            assert.equal( errors.length, 1 );
            assert.match( errors[ 0 ].message, new RegExp( reference ) );
            assert.match( errors[ 0 ].message, /POST \/target/ );
            assert.doesNotMatch( errors[ 0 ].message, /QUERY-SECRET/ );
            // The detail the client no longer sees is what the log is for.
            assert.equal( exceptions.isException( errors[ 0 ].data ), true );
            assert.match( JSON.stringify( errors[ 0 ].data ), /INTERNAL-DETAIL/ );
        } );

        it( "keeps the stack out of the HTMX notification too", async () => {
            const { status, headers } = await serve( failing, { method: "POST", headers: { "HX-Request": "true", accept: "text/html" } } );
            assert.equal( status, 500 );
            const trigger = headers.get( "hx-trigger" );
            assert.ok( trigger );
            assert.doesNotMatch( trigger, /INTERNAL-DETAIL|node_modules/ );
        } );

    } );

    describe( "a client error", () => {

        it( "still carries its data, which is how a form learns what was wrong", async () => {
            const refuse = ( request, response, next ) => next( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: "error.validation.name-required" }, exceptions.httpCode.C_422 ) );
            const { status, text } = await serve( refuse, JSON_POST );
            assert.equal( status, 422 );
            assert.equal( JSON.parse( text ).exception.data.details, "error.validation.name-required" );
            assert.equal( logged.filter( ( entry ) => entry.severity >= logger.logSeverity.WARNING ).length, 0 );
        } );

    } );

    describe( "a 503", () => {

        it( "is logged as a condition, not as a failure", async () => {
            const unavailable = ( request, response, next ) => next( exceptions.raise( exceptions.exceptionCode.E_GEN_SERVICE_STARTING, null, exceptions.httpCode.C_503 ) );
            const { status } = await serve( unavailable, JSON_POST );
            assert.equal( status, 503 );
            assert.equal( logged.filter( ( entry ) => entry.severity >= logger.logSeverity.ERROR ).length, 0 );
            assert.equal( logged.filter( ( entry ) => entry.severity === logger.logSeverity.WARNING ).length, 1 );
        } );

    } );

    describe( "a server error that explains itself to the user", () => {

        // Any entry of the loaded catalogue will do; an application's own details labels sit in its catalogue the same way.
        const CATALOGUE_LABEL = "system.exceptions.1004";
        const raising = ( code, data, httpCode ) => ( request, response, next ) => next( exceptions.raise( code, data, httpCode ) );
        const inLanguage = ( language, route ) => ( request, response, next ) => {
            request.session = { language: language };
            return route( request, response, next );
        };

        it( "keeps a details label on a 503, and nothing else of its data", async () => {
            const { status, text } = await serve( raising( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE, { details: CATALOGUE_LABEL, internal: "INTERNAL-DETAIL" }, exceptions.httpCode.C_503 ), JSON_POST );
            assert.equal( status, 503 );
            assert.deepEqual( JSON.parse( text ).exception.data, { details: CATALOGUE_LABEL }, "the notification lost the explanation the application wrote for the user" );
            assert.doesNotMatch( text, /INTERNAL-DETAIL/ );
        } );

        it( "keeps a details label on a 500", async () => {
            const { status, text } = await serve( raising( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: CATALOGUE_LABEL }, exceptions.httpCode.C_500 ), JSON_POST );
            assert.equal( status, 500 );
            assert.deepEqual( JSON.parse( text ).exception.data, { details: CATALOGUE_LABEL } );
        } );

        it( "withholds details that are not a label: raw text can name records and internals", async () => {
            const { text } = await serve( raising( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "Refusing to write employee 'EMP-SECRET' under the identity 'x'." }, exceptions.httpCode.C_500 ), JSON_POST );
            assert.equal( JSON.parse( text ).exception.data, undefined );
            assert.doesNotMatch( text, /EMP-SECRET/ );
        } );

        it( "withholds a label the session's language has no text for, which the client could only show as its key", async () => {
            const { text } = await serve( inLanguage( "xx", raising( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE, { details: CATALOGUE_LABEL }, exceptions.httpCode.C_503 ) ), JSON_POST );
            assert.equal( JSON.parse( text ).exception.data, undefined );
        } );

    } );

} );
