/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
