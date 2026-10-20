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

/**
 * `POST /login/email-link` (1.57.0, CA-537): one route, two forms. An address asks for a link and is answered with the
 * sign-in page AuthManager names; a token spends a link and signs its person in exactly as the other methods do —
 * a regenerated session, the application's `augmentSession`, the `admin` allowlist, a `303` to `/` — and every refusal
 * is a `401`, which the error handler turns into `/?error=<code>`.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const webHandlers = require( "#web-handlers" );

const TOKEN = "A".repeat( 43 );

function mockSession( initial = {}, events = [] ) {
    const session = Object.assign( {}, initial );
    Object.defineProperties( session, {
        regenerate: { value: ( done ) => {
            events.push( "regenerate" );
            done();
        } },
        save: { value: ( done ) => {
            events.push( "save" );
            done();
        } },
        destroy: { value: ( done ) => {
            events.push( "destroy" );
            done();
        } }
    } );
    return session;
}

function mockRequest( { method = "POST", body = {}, session, cookies = {} } = {} ) {
    const headers = { host: "app.example.com", accept: "text/html" };
    return {
        method: method,
        originalUrl: "/login/email-link",
        params: { method: "email-link" },
        query: {},
        body: body,
        ip: "203.0.113.7",
        session: session || mockSession(),
        cookies: cookies,
        get: ( name ) => headers[ String( name ).toLowerCase() ]
    };
}

function instance( overrides = {} ) {
    const calls = { authenticate: [], authorize: [], augmented: [] };
    const target = {
        calls: calls,
        serviceConfig: { auth: { admins: [ "parent@example.com" ] } },
        offeredLanguages: [ "en", "bg" ],
        authenticate: ( method, details ) => {
            calls.authenticate.push( { method, details } );
            return Promise.resolve( { redirectTo: "/?email-link=sent", outcome: "sent" } );
        },
        authorize: ( method, url, details ) => {
            calls.authorize.push( { method, details } );
            return Promise.resolve( {
                language: "bg",
                asJSON: () => ( { userID: "email:0123456789abcdef0123456789abcdef", username: "parent@example.com", email: "parent@example.com", roles: [] } )
            } );
        },
        augmentSession: ( session, request ) => {
            calls.augmented.push( request );
            return session;
        }
    };
    return Object.assign( target, overrides );
}

// Runs the handler to its answer: a redirect, or what it passed to `next`.
function post( server, request ) {
    return new Promise( ( resolve ) => {
        webHandlers.authenticationHandler( server )( request, {
            redirect: ( status, location ) => resolve( { status, location } )
        }, ( error ) => resolve( { next: error } ) );
    } );
}

describe( "POST /login/email-link — asking for a link", () => {

    it( "passes the address, the client's network address and the request's language, and redirects where AuthManager says", async () => {
        const server = instance();
        const answer = await post( server, mockRequest( { body: { email: "Parent@Example.com" }, cookies: { "ti-language": "bg" } } ) );
        assert.deepEqual( answer, { status: 303, location: "/?email-link=sent" } );
        assert.deepEqual( server.calls.authenticate, [ { method: "email-link", details: { email: "Parent@Example.com", client: "203.0.113.7", language: "bg" } } ] );
        assert.equal( server.calls.authorize.length, 0 );
    } );

    it( "asks for a link when the token is not one string, as a repeated form field is not", async () => {
        const server = instance();
        await post( server, mockRequest( { body: { email: "parent@example.com", token: [ TOKEN, TOKEN ] } } ) );
        assert.equal( server.calls.authenticate.length, 1 );
        assert.equal( server.calls.authorize.length, 0 );
    } );

    it( "refuses with a 401 when the method is not enabled, and the error handler does the rest", async () => {
        const refusal = Object.assign( new Error( "disabled" ), { code: 2004 } );
        const server = instance( { authenticate: () => Promise.reject( refusal ) } );
        const answer = await post( server, mockRequest( { body: { email: "parent@example.com" } } ) );
        assert.equal( answer.next.httpCode, 401 );
    } );

    it( "turns a synchronous throw into the same refusal", async () => {
        const server = instance( { authenticate: () => {
            throw new Error( "not initialized" );
        } } );
        const answer = await post( server, mockRequest( { body: { email: "parent@example.com" } } ) );
        assert.equal( answer.next.httpCode, 401 );
    } );

    it( "leaves a GET to the routes after it, so it ends as any unknown page does", async () => {
        const answer = await post( instance(), mockRequest( { method: "GET" } ) );
        assert.equal( answer.next, undefined );
    } );

} );

describe( "POST /login/email-link — spending a link", () => {

    it( "signs the person in as every method does: a new session, the application's hook, the allowlist, then home", async () => {
        const events = [];
        const server = instance();
        const request = mockRequest( { body: { token: TOKEN, email: "ignored@example.com" }, session: mockSession( {}, events ) } );
        const answer = await post( server, request );

        assert.deepEqual( answer, { status: 303, location: "/" } );
        assert.deepEqual( server.calls.authorize, [ { method: "email-link", details: { token: TOKEN } } ], "a token wins over an address" );
        assert.equal( server.calls.authenticate.length, 0 );
        assert.deepEqual( events, [ "regenerate", "save" ] );
        assert.equal( request.session.user.email, "parent@example.com" );
        assert.equal( request.session.language, "bg" );
        assert.deepEqual( server.calls.augmented, [ request ], "augmentSession is asked, with the request" );
        assert.ok( request.session.user.roles.includes( "admin" ), "the allowlist applies to an e-mail sign-in too" );
    } );

    it( "refuses a link that cannot be used with its own code, which the sign-in page explains", async () => {
        const exceptions = require( "@ti-engine/core/exceptions" );
        const server = instance( { authorize: () => Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_INVALID_AUTH_TOKEN, null, exceptions.httpCode.C_401 ) ) } );
        const answer = await post( server, mockRequest( { body: { token: TOKEN } } ) );
        assert.equal( answer.next.code, 2000 );
        assert.equal( answer.next.httpCode, 401 );
    } );

    it( "destroys the new session when the application refuses the person", async () => {
        const events = [];
        const server = instance( { augmentSession: () => {
            throw new Error( "not a parent we know" );
        } } );
        const request = mockRequest( { body: { token: TOKEN }, session: mockSession( {}, events ) } );
        const answer = await post( server, request );
        assert.equal( answer.next.httpCode, 401 );
        assert.deepEqual( events, [ "regenerate", "destroy" ], "nothing usable survives the refusal" );
    } );

} );
