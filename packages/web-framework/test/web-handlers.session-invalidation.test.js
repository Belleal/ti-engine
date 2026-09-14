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
 * `resourceProtectionHandler` — what happens to a session the application judges invalid.
 *
 * `verifySession` was a seam with a `TODO: Implement this!` and no consumer: the default returns true for any session
 * carrying a user, so the "carries a user but fails verification" branch could never be reached. An application that
 * overrides it (competence, to end a terminated employee's session) needs the refusal to STICK — otherwise the same
 * verdict is re-decided on every request while the shell, which reads `auth.isAuthenticated`, goes on believing the
 * visitor is signed in, and the redirect to "/" lands back on the application rather than on a login.
 *
 * Nothing here changes for a consumer using the default `verifySession`; those cases are pinned too.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const webHandlers = require( "#web-handlers" );

function mockSession( user ) {
    const session = {
        destroyed: 0,
        destroy( callback ) {
            session.destroyed += 1;
            callback( null );
        }
    };
    if ( user ) {
        session.user = user;
    }
    return session;
}

function mockResponse() {
    return {
        statusCode: null,
        redirectedTo: null,
        headers: {},
        ended: false,
        set( name, value ) { this.headers[ name ] = value; return this; },
        status( code ) { this.statusCode = code; return this; },
        end() { this.ended = true; return this; },
        redirect( code, target ) { this.statusCode = code; this.redirectedTo = target; return this; }
    };
}

/**
 * @param {Object} options
 * @param {boolean} options.verified What the application's verifySession returns.
 * @param {Object} [options.session]
 * @param {Object} [options.headers] Request headers — `accept` and `hx-request` steer the refusal shape.
 * @param {boolean} [options.unprotected]
 */
function run( { verified, session, headers = { accept: "text/html" }, unprotected = false } ) {
    const lower = {};
    for ( const key of Object.keys( headers ) ) {
        lower[ key.toLowerCase() ] = headers[ key ];
    }
    const instance = {
        isUnprotectedRoute: () => unprotected,
        verifySession: () => verified
    };
    const request = {
        url: "/app/dashboard",
        method: "GET",
        session: session,
        get: ( name ) => lower[ String( name ).toLowerCase() ],
        // Express content negotiation: answer the requested type only when the Accept header actually names it.
        accepts: ( type ) => String( lower.accept || "" ).includes( type === "html" ? "text/html" : "application/json" ) ? type : false
    };
    const response = mockResponse();
    let nextCalls = 0;

    webHandlers.resourceProtectionHandler( instance )( request, response, () => { nextCalls += 1; } );

    return { response, nextCalls, session };
}

describe( "resourceProtectionHandler — a verified session", () => {

    it( "passes a verified session through untouched", () => {
        const session = mockSession( { userID: "u1" } );
        const result = run( { verified: true, session: session } );

        assert.equal( result.nextCalls, 1 );
        assert.equal( session.destroyed, 0 );
    } );

    it( "passes an unprotected route through without consulting the session at all", () => {
        const session = mockSession( { userID: "u1" } );
        const result = run( { verified: false, session: session, unprotected: true } );

        assert.equal( result.nextCalls, 1 );
        assert.equal( session.destroyed, 0, "a static asset must not pay for the check, let alone be logged out by it" );
    } );

} );

describe( "resourceProtectionHandler — a session the application rejects", () => {

    it( "destroys a session that carries a user and fails verification", () => {
        const session = mockSession( { userID: "u1", employeeID: "20" } );
        const result = run( { verified: false, session: session } );

        assert.equal( session.destroyed, 1, "the refusal must stick, or it is re-decided on every request" );
        assert.equal( result.nextCalls, 0 );
        assert.equal( result.response.redirectedTo, "/" );
    } );

    it( "answers a JSON request with 401 after destroying the session", () => {
        const session = mockSession( { userID: "u1" } );
        const result = run( { verified: false, session: session, headers: { accept: "application/json" } } );

        assert.equal( session.destroyed, 1 );
        assert.equal( result.response.statusCode, 401 );
    } );

    it( "answers an HTMX request with HX-Redirect after destroying the session", () => {
        const session = mockSession( { userID: "u1" } );
        const result = run( { verified: false, session: session, headers: { accept: "text/html", "hx-request": "true" } } );

        assert.equal( session.destroyed, 1 );
        assert.equal( result.response.headers[ "HX-Redirect" ], "/" );
        assert.equal( result.response.statusCode, 204 );
    } );

    it( "still refuses when the destroy itself fails", () => {
        const session = {
            user: { userID: "u1" },
            destroy( callback ) { callback( new Error( "store unavailable" ) ); }
        };
        const result = run( { verified: false, session: session } );

        assert.equal( result.nextCalls, 0, "a store that cannot forget the session is no reason to honour it" );
        assert.equal( result.response.redirectedTo, "/" );
    } );

    it( "refuses an anonymous request without trying to destroy anything", () => {
        const session = mockSession( null );
        const result = run( { verified: false, session: session } );

        assert.equal( session.destroyed, 0, "there is no signed-in session to end" );
        assert.equal( result.nextCalls, 0 );
        assert.equal( result.response.redirectedTo, "/" );
    } );

    it( "tolerates a request with no session object at all", () => {
        const result = run( { verified: false, session: undefined } );

        assert.equal( result.nextCalls, 0 );
        assert.equal( result.response.redirectedTo, "/" );
    } );

} );
