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
 * The transports a notice is sent through (CA-486): the log transport, which sends nothing, and the relay, which posts
 * the message to the Worker in front of the container. The relay's answers are faked with an injected `fetch`.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const logger = require( "@ti-engine/core/logger" );
const transports = require( "#notification-transports" );

const MESSAGE = Object.freeze( { from: "no-reply@example.com", to: "anna@example.com", subject: "Нова задача", text: "Текст", html: "<p>Текст</p>" } );
const RELAY = "http://11.0.0.1/v1/mail/send";

const answering = ( status, body ) => () => Promise.resolve( new Response( typeof body === "string" ? body : JSON.stringify( body ), { status: status } ) );

describe( "transportError", () => {

    it( "decides transience from the code unless told", () => {
        assert.equal( transports.transportError( "E_RATE_LIMIT_EXCEEDED" ).transient, true );
        assert.equal( transports.transportError( "E_RECIPIENT_SUPPRESSED" ).transient, false );
        assert.equal( transports.transportError( "E_RECIPIENT_SUPPRESSED", true ).transient, true );
        assert.equal( transports.transportError( "E_DELIVERY_FAILED", false ).transient, false );
    } );

} );

describe( "the log transport", () => {

    it( "sends nothing, answers a message ID, and logs neither the address nor the text", async () => {
        const lines = [];
        const original = logger.log;
        logger.log = ( message ) => lines.push( String( message ) );
        try {
            const result = await transports.createLogTransport().send( MESSAGE );
            assert.match( result.messageId, /^log-/ );
        } finally {
            logger.log = original;
        }
        assert.equal( lines.length, 1 );
        assert.equal( lines[ 0 ].includes( "@" ), false );
        assert.equal( lines[ 0 ].includes( "Текст" ), false );
    } );

} );

describe( "the relay transport", () => {

    it( "refuses a URL that is not http(s)", () => {
        for ( const url of [ "", "11.0.0.1/v1/mail/send", "ftp://11.0.0.1/", undefined ] ) {
            assert.throws( () => transports.createRelayTransport( url ), TypeError );
        }
    } );

    it( "posts the message as JSON and answers the relay's message ID", async () => {
        let request;
        const relay = transports.createRelayTransport( RELAY, { fetch: ( url, init ) => {
            request = { url: url, init: init };
            return answering( 200, { messageId: "cf-1" } )();
        } } );
        assert.deepEqual( await relay.send( MESSAGE ), { messageId: "cf-1" } );
        assert.equal( request.url, RELAY );
        assert.equal( request.init.method, "POST" );
        assert.equal( request.init.headers[ "content-type" ], "application/json" );
        assert.deepEqual( JSON.parse( request.init.body ), MESSAGE );
        assert.ok( request.init.signal instanceof AbortSignal );
    } );

    it( "rejects with the relay's code and transience", async () => {
        const relay = transports.createRelayTransport( RELAY, { fetch: answering( 429, { code: "E_RATE_LIMIT_EXCEEDED", transient: true } ) } );
        await assert.rejects( relay.send( MESSAGE ), ( error ) => error.code === "E_RATE_LIMIT_EXCEEDED" && error.transient === true );
        const suppressed = transports.createRelayTransport( RELAY, { fetch: answering( 422, { code: "E_RECIPIENT_SUPPRESSED", transient: false } ) } );
        await assert.rejects( suppressed.send( MESSAGE ), ( error ) => error.code === "E_RECIPIENT_SUPPRESSED" && error.transient === false );
    } );

    it( "treats any other answer, and no answer, as a relay that is not there, to be tried again", async () => {
        for ( const fetchImpl of [
            answering( 404, "no handler" ),
            answering( 200, "not json" ),
            answering( 200, { ok: true } ),
            () => Promise.reject( new TypeError( "fetch failed" ) ),
            () => Promise.reject( new DOMException( "timed out", "TimeoutError" ) )
        ] ) {
            const relay = transports.createRelayTransport( RELAY, { fetch: fetchImpl } );
            await assert.rejects( relay.send( MESSAGE ), ( error ) => error.code === "E_RELAY_UNAVAILABLE" && error.transient === true );
        }
    } );

} );
