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
 * Send Feedback alone takes a body larger than 1 MB (1.58.0, CA-544): a picture of the screen rides on it in base64, up
 * to 1,333,336 characters. Every other request keeps the 1 MB limit, and Send Feedback has a limit of its own.
 *
 * A real server with no broker, the requests anonymous: one the body parser let through is then refused for having no
 * session, one it stopped is answered 413 before anything else looks at it. That difference is what is measured.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );

// A body of about this many bytes, as JSON with the text a picture's base64 would be.
const bodyOf = ( bytes ) => JSON.stringify( { kind: "problem", text: "Broken.", picture: "data:image/webp;base64," + "A".repeat( bytes ) } );

describe( "the body a request may carry", () => {

    const server = new TiWebServer( "ti-feedback-body-limit-test", {} );
    let url;

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    const post = ( route, body ) => fetch( `${ url }${ route }`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body, redirect: "manual" } );

    it( "lets Send Feedback carry the largest picture, which every other request would refuse", async () => {
        const largest = bodyOf( 1333336 );
        assert.ok( Buffer.byteLength( largest ) > 1024 * 1024, "over the 1 MB every other request keeps" );
        const feedback = await post( "/app/send-feedback", largest );
        assert.notEqual( feedback.status, 413, "past the body parser, and refused only for having no session" );
        assert.ok( feedback.status === 401 || feedback.status === 403 || feedback.status === 303, `refused as anonymous, not ${ feedback.status }` );

        const other = await post( "/app/save-something", largest );
        assert.equal( other.status, 413 );
    } );

    it( "gives Send Feedback a limit of its own", async () => {
        const response = await post( "/app/send-feedback", bodyOf( 1600 * 1024 ) );
        assert.equal( response.status, 413 );
    } );

} );
