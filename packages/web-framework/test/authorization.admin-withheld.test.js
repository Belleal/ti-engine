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
 * `TiWebServer#withholdsAdminRole` — an application running a session without the `admin` role its identity holds.
 *
 * The allowlist role is applied after `augmentSession` at sign-in and after `refreshSession` on every request, and it
 * is authoritative in both directions, so an application that removed it saw it come straight back: there was no way
 * to show an administrator the application as everyone else sees it. The hook gives an application that one power and
 * no other — it can withhold the role, never grant it — and the framework asks it wherever the role is applied.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const authorization = require( "#authorization" );
const webHandlers = require( "#web-handlers" );
const TiWebServer = require( "#web-server" );

const ADMIN_EMAIL = "admin@example.com";
const STATE = "issued-state";

describe( "applyAdminRole( session, admins, withheld )", () => {

    it( "removes the role from an allowlisted identity when withheld", () => {
        const session = authorization.applyAdminRole( { user: { email: ADMIN_EMAIL, roles: [ 1, "admin" ] } }, [ ADMIN_EMAIL ], true );

        assert.deepEqual( session.user.roles, [ 1 ] );
    } );

    it( "never grants: withholding nothing leaves an identity off the allowlist without the role", () => {
        const session = authorization.applyAdminRole( { user: { email: "someone@example.com", roles: [ 1 ] } }, [ ADMIN_EMAIL ], false );

        assert.deepEqual( session.user.roles, [ 1 ] );
    } );

    it( "restores the role once it is no longer withheld", () => {
        const session = authorization.applyAdminRole( { user: { email: ADMIN_EMAIL, roles: [ 1 ] } }, [ ADMIN_EMAIL ], true );
        authorization.applyAdminRole( session, [ ADMIN_EMAIL ], false );

        assert.deepEqual( session.user.roles, [ 1, "admin" ] );
    } );

    it( "withholds only on a strict true", () => {
        for ( const value of [ "true", 1, {}, undefined, null ] ) {
            const session = authorization.applyAdminRole( { user: { email: ADMIN_EMAIL, roles: [] } }, [ ADMIN_EMAIL ], value );
            assert.deepEqual( session.user.roles, [ "admin" ], `withheld = ${ JSON.stringify( value ) } must leave the allowlist's answer standing` );
        }
    } );

} );

describe( "TiWebServer#withholdsAdminRole", () => {

    it( "withholds nothing by default", () => {
        assert.equal( TiWebServer.prototype.withholdsAdminRole( { user: { email: ADMIN_EMAIL, roles: [ "admin" ] } }, {} ), false );
    } );

} );

describe( "the per-request refresh asks the hook", () => {

    function refresh( instance, session ) {
        const request = { session: session, method: "GET", originalUrl: "/app/dashboard" };
        let nextError = "not called";
        webHandlers.sessionRefreshHandler( instance )( request, {}, ( error ) => {
            nextError = error;
        } );
        return { session: session, nextError: nextError, request: request };
    }

    function adminInstance( withholdsAdminRole, refreshSession = () => {} ) {
        return { refreshSession: refreshSession, withholdsAdminRole: withholdsAdminRole, serviceConfig: { auth: { admins: [ ADMIN_EMAIL ] } } };
    }

    it( "withholds the role from an allowlisted administrator while the hook says so, and restores it after", () => {
        let withholding = true;
        const instance = adminInstance( () => withholding );
        const session = { user: { userID: "u1", email: ADMIN_EMAIL, employeeID: "20", roles: [ 1, "admin" ] } };

        refresh( instance, session );
        assert.deepEqual( session.user.roles, [ 1 ], "withheld on this request" );

        withholding = false;
        refresh( instance, session );
        assert.deepEqual( session.user.roles, [ 1, "admin" ], "returning false gives the role back on the next request" );
    } );

    it( "asks with the session refreshSession left, and the request", () => {
        const seen = [];
        const instance = adminInstance( ( session, request ) => {
            seen.push( { marker: session.user.marker, url: request.originalUrl } );
            return false;
        }, ( session ) => {
            session.user.marker = "refreshed";
        } );

        refresh( instance, { user: { userID: "u1", email: ADMIN_EMAIL, roles: [] } } );

        assert.deepEqual( seen, [ { marker: "refreshed", url: "/app/dashboard" } ] );
    } );

    it( "keeps the allowlist's answer when the hook throws, and still serves the request", () => {
        const instance = adminInstance( () => {
            throw new Error( "the hook is broken" );
        } );
        const result = refresh( instance, { user: { userID: "u1", email: ADMIN_EMAIL, employeeID: null, roles: [ "admin" ] } } );

        assert.deepEqual( result.session.user.roles, [ "admin" ], "a broken hook must not lock an administrator out" );
        assert.equal( result.nextError, undefined );
    } );

    it( "keeps the role for an answer that is not strictly true", () => {
        const result = refresh( adminInstance( () => "yes" ), { user: { userID: "u1", email: ADMIN_EMAIL, roles: [] } } );

        assert.deepEqual( result.session.user.roles, [ "admin" ] );
    } );

    it( "grants nothing to an identity off the allowlist, whatever the hook answers", () => {
        for ( const answer of [ true, false ] ) {
            const result = refresh( adminInstance( () => answer ), { user: { userID: "u2", email: "someone@example.com", roles: [ 1 ] } } );
            assert.deepEqual( result.session.user.roles, [ 1 ] );
        }
    } );

    it( "applies the allowlist as before for an instance without the hook", () => {
        const result = refresh( { refreshSession: () => {}, serviceConfig: { auth: { admins: [ ADMIN_EMAIL ] } } }, { user: { userID: "u1", email: ADMIN_EMAIL, roles: [] } } );

        assert.deepEqual( result.session.user.roles, [ "admin" ] );
    } );

} );

describe( "both sign-in paths ask the hook, after augmentSession", () => {

    function mockSession( initial = {} ) {
        const session = Object.assign( {}, initial );
        Object.defineProperties( session, {
            regenerate: { value: ( done ) => done() },
            save: { value: ( done ) => done() },
            destroy: { value: ( done ) => done() }
        } );
        return session;
    }

    function mockRequest( { query = {}, body = {}, params = {}, session = mockSession() } = {} ) {
        const headers = { host: "app.example.com", accept: "text/html" };
        return {
            method: "GET",
            originalUrl: "/login/callback",
            query: query,
            body: body,
            params: params,
            session: session,
            cookies: {},
            get: ( name ) => headers[ String( name ).toLowerCase() ]
        };
    }

    // `augmentSession` marks the session, and the hook withholds only from a session carrying the mark: the hook has
    // to be asked about the session the application returned, or an application deciding at sign-in could not use it.
    function instance( withholds ) {
        return {
            serviceConfig: { auth: { admins: [ ADMIN_EMAIL ] } },
            authenticate: () => Promise.resolve(),
            authorize: () => Promise.resolve( { asJSON: () => ( { userID: "oauth2:1", username: ADMIN_EMAIL, email: ADMIN_EMAIL, roles: [] } ) } ),
            augmentSession: ( session ) => {
                session.user.declinedAdmin = withholds;
                return session;
            },
            withholdsAdminRole: ( session ) => session.user.declinedAdmin === true
        };
    }

    function signIn( handler, request ) {
        return new Promise( ( resolve, reject ) => {
            handler( request, { redirect: () => resolve( request.session ) }, ( error ) => reject( error || new Error( "next() without an error" ) ) );
        } );
    }

    const PATHS = [
        [ "an OpenID sign-in", ( target ) => signIn( webHandlers.authorizedOAuth2CallbackHandler( target, "openid-google" ), mockRequest( {
            query: { code: "code", state: STATE },
            session: mockSession( { oidc: { codeVerifier: "verifier", state: STATE, nonce: "nonce" } } )
        } ) ) ],
        [ "a local sign-in", ( target ) => signIn( webHandlers.authenticationHandler( target ), mockRequest( {
            params: { method: "local" },
            body: { username: ADMIN_EMAIL, password: "password" }
        } ) ) ]
    ];

    for ( const [ name, run ] of PATHS ) {

        it( `${ name } signs an allowlisted administrator in without the role when the hook withholds it`, async () => {
            const session = await run( instance( true ) );

            assert.deepEqual( session.user.roles, [] );
        } );

        it( `${ name } gives the role as before when the hook withholds nothing`, async () => {
            const session = await run( instance( false ) );

            assert.deepEqual( session.user.roles, [ "admin" ] );
        } );

    }

} );
