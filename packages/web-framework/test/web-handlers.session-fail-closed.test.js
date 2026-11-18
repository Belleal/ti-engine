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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const webHandlers = require( "#web-handlers" );

// Minimal express-session double recording which lifecycle calls were made.
function mockSession( initial = {} ) {
    const session = Object.assign( {
        calls: { regenerate: 0, save: 0, destroy: 0 },
        regenerate( callback ) {
            session.calls.regenerate++;
            callback( null );
        },
        save( callback ) {
            session.calls.save++;
            callback( null );
        },
        destroy( callback ) {
            session.calls.destroy++;
            callback( null );
        }
    }, initial );
    return session;
}

function mockRequest( session ) {
    const headers = { host: "app.example", accept: "text/html" };
    return {
        method: "GET",
        secure: true,
        originalUrl: "/login/openid-azure/callback?code=abc&state=xyz",
        query: { code: "abc", state: "xyz" },
        session: session,
        get: ( name ) => headers[ String( name ).toLowerCase() ],
        accepts: ( type ) => type
    };
}

// A user double shaped like the framework User's asJSON() output.
const AUTHENTICATED_USER = {
    asJSON: () => ( { userID: "u-1", username: "someone", email: "someone@example.com", roles: [], permissions: [], details: {} } ),
    language: "en"
};

describe( "a refused augmentSession must not leave a usable session", () => {

    it( "destroys the session and never saves it when the augment hook throws", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: () => {
                throw new Error( "no employee record" );
            }
        };

        let forwarded;
        const next = ( error ) => {
            forwarded = error;
        };

        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, {}, next );
        await new Promise( ( resolve ) => setImmediate( resolve ) );

        assert.equal( session.calls.destroy, 1, "the session must be destroyed when the hook refuses" );
        assert.equal( session.calls.save, 0, "a refused login must never persist the session" );
        assert.ok( forwarded, "the error must be forwarded to the error handler" );
    } );

    it( "saves the session normally when the augment hook succeeds", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: ( session ) => session
        };

        const response = { redirect: () => {} };
        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, response, () => {} );
        await new Promise( ( resolve ) => setImmediate( resolve ) );

        assert.equal( session.calls.save, 1, "a successful login must save the session" );
        assert.equal( session.calls.destroy, 0, "a successful login must not destroy the session" );
    } );

} );

// An augment hook may be asynchronous (CA-585): an application that keeps its principals in a database records a first
// sign-in, or reads its roles, before the session is written.
describe( "an asynchronous augmentSession", () => {

    const settle = async () => {
        for ( let turn = 0; turn < 5; turn++ ) {
            await new Promise( ( resolve ) => setImmediate( resolve ) );
        }
    };

    it( "waits for the hook, and saves the session it resolves with", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        let saveSawRoles = null;
        session.save = ( callback ) => {
            session.calls.save++;
            saveSawRoles = request.session.user.roles.slice();
            callback( null );
        };
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: async ( augmented ) => {
                await new Promise( ( resolve ) => setImmediate( resolve ) );
                augmented.user.roles = [ "editor" ];
                return augmented;
            }
        };

        let redirected = null;
        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, { redirect: ( status, to ) => { redirected = to || status; } }, () => {} );
        await settle();

        assert.equal( session.calls.save, 1 );
        assert.deepEqual( saveSawRoles, [ "editor" ], "the session is saved with what the hook resolved, not before it" );
        assert.equal( session.calls.destroy, 0 );
        assert.ok( redirected, "the sign-in completes" );
    } );

    it( "refuses the sign-in when the hook rejects: destroyed, never saved, the error forwarded", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: async () => {
                await new Promise( ( resolve ) => setImmediate( resolve ) );
                throw new Error( "no staff record" );
            }
        };

        let forwarded;
        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, {}, ( error ) => {
            forwarded = error;
        } );
        await settle();

        assert.equal( session.calls.destroy, 1 );
        assert.equal( session.calls.save, 0 );
        assert.ok( forwarded );
    } );

    // The review pass: an `async` hook that changes the session in place and returns nothing resolved `undefined`, which
    // became `request.session`; its save threw inside a promise nobody handled, and the sign-in was never answered.
    const signIn = async ( augmentSession ) => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        let saved = null;
        session.save = ( callback ) => {
            session.calls.save++;
            saved = request.session.user.roles.slice();
            callback( null );
        };
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: augmentSession
        };
        const outcome = { redirected: null, forwarded: null, saved: () => saved, session: session };
        const unhandled = ( reason ) => {
            outcome.unhandled = reason;
        };
        process.on( "unhandledRejection", unhandled );
        try {
            webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, { redirect: ( status, to ) => { outcome.redirected = to || status; } }, ( error ) => {
                outcome.forwarded = error;
            } );
            await settle();
        } finally {
            process.off( "unhandledRejection", unhandled );
        }
        return outcome;
    };

    it( "accepts an asynchronous hook that changes the session in place and resolves nothing", async () => {
        const outcome = await signIn( async ( augmented ) => {
            await new Promise( ( resolve ) => setImmediate( resolve ) );
            augmented.user.roles = [ "editor" ];
        } );
        assert.equal( outcome.unhandled, undefined );
        assert.deepEqual( outcome.saved(), [ "editor" ], "the session it was given, as it changed it" );
        assert.ok( outcome.redirected, "the sign-in completes" );
    } );

    it( "accepts a synchronous hook that returns nothing, which used to throw out of the session callback", async () => {
        const outcome = await signIn( ( augmented ) => {
            augmented.user.roles = [ "reader" ];
        } );
        assert.deepEqual( outcome.saved(), [ "reader" ] );
        assert.ok( outcome.redirected );
    } );

    it( "refuses, rather than hangs, when the hook resolves something that is not a session", async () => {
        const outcome = await signIn( async () => 42 );
        assert.equal( outcome.unhandled, undefined );
        assert.equal( outcome.session.calls.save, 0 );
        assert.equal( outcome.session.calls.destroy, 1 );
        assert.ok( outcome.forwarded, "the refusal reaches the error handler" );
    } );

} );
