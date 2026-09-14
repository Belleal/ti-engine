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
 * `sessionRefreshHandler` — the per-request companion to `augmentSession`.
 *
 * Roles derived once at sign-in are roles that cannot be taken away: `augmentSession` runs inside
 * `regenerateAndSaveSession` and nothing re-ran it, so an authority the application withdrew stayed live in every
 * session already holding it, and a `rolling` cookie means an active session need never expire. This middleware gives
 * an application a hook that runs on every request instead.
 *
 * Two properties matter beyond "it calls the hook": the additive `admin` allowlist role must survive a hook that
 * replaces `session.user.roles` wholesale, and a hook that throws must fail closed without taking the request down.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const webHandlers = require( "#web-handlers" );

const ADMIN_EMAIL = "admin@example.com";

function mockInstance( refreshSession, admins = [] ) {
    return {
        refreshSession: refreshSession,
        serviceConfig: { auth: { admins: admins } }
    };
}

function run( instance, session ) {
    const request = { session: session, method: "GET", originalUrl: "/app/dashboard" };
    let nextCalls = 0;
    let nextError;
    webHandlers.sessionRefreshHandler( instance )( request, {}, ( error ) => {
        nextCalls += 1;
        nextError = error;
    } );
    return { nextCalls: nextCalls, nextError: nextError, session: session };
}

describe( "sessionRefreshHandler", () => {

    it( "does not call the hook when there is no session at all", () => {
        let called = 0;
        const result = run( mockInstance( () => { called += 1; } ), undefined );

        assert.equal( called, 0 );
        assert.equal( result.nextCalls, 1 );
        assert.equal( result.nextError, undefined );
    } );

    it( "does not call the hook for an anonymous session", () => {
        let called = 0;
        const result = run( mockInstance( () => { called += 1; } ), { csrfToken: "t" } );

        assert.equal( called, 0, "a session-less visitor has no roles to re-derive" );
        assert.equal( result.nextCalls, 1 );
    } );

    it( "calls the hook with the session and the request, then continues", () => {
        const seen = [];
        const instance = mockInstance( ( session, request ) => {
            seen.push( { employeeID: session.user.employeeID, url: request.originalUrl } );
        } );

        const result = run( instance, { user: { userID: "u1", employeeID: "20", roles: [ 1 ] } } );

        assert.deepEqual( seen, [ { employeeID: "20", url: "/app/dashboard" } ] );
        assert.equal( result.nextCalls, 1 );
        assert.equal( result.nextError, undefined );
    } );

    it( "lets the hook withdraw a role that the application no longer grants", () => {
        const instance = mockInstance( ( session ) => { session.user.roles = [ 1 ]; } );

        const result = run( instance, { user: { userID: "u1", employeeID: "20", roles: [ 1, 3 ] } } );

        assert.deepEqual( result.session.user.roles, [ 1 ], "role 3 was revoked and must not survive the request" );
    } );

    it( "re-applies the admin allowlist role after a hook that replaced the role array", () => {
        // The ordering that matters: an application hook owns its own roles and may legitimately return a set without
        // `admin`. Applying the allowlist afterwards is what keeps an allowlisted administrator out of a lockout.
        const instance = mockInstance( ( session ) => { session.user.roles = [ 1 ]; }, [ ADMIN_EMAIL ] );

        const result = run( instance, { user: { userID: "u1", email: ADMIN_EMAIL, employeeID: "20", roles: [ 1, "admin" ] } } );

        assert.deepEqual( result.session.user.roles, [ 1, "admin" ] );
    } );

    it( "does not invent an admin role for an identity that is not on the allowlist", () => {
        const instance = mockInstance( ( session ) => { session.user.roles = [ 1 ]; }, [ ADMIN_EMAIL ] );

        const result = run( instance, { user: { userID: "u1", email: "someone@example.com", employeeID: "20", roles: [ 1 ] } } );

        assert.deepEqual( result.session.user.roles, [ 1 ] );
    } );

    it( "fails closed when the hook throws: roles stripped, request still served", () => {
        const instance = mockInstance( () => { throw new Error( "org chart unavailable" ); } );

        const result = run( instance, { user: { userID: "u1", employeeID: "20", roles: [ 1, 2, 3 ] } } );

        assert.deepEqual( result.session.user.roles, [], "an authority that cannot be established is no authority" );
        assert.equal( result.nextCalls, 1 );
        assert.equal( result.nextError, undefined, "one failed lookup must not take the whole application down" );
    } );

    it( "keeps an administrator's access when the hook throws, so broken data stays repairable", () => {
        const instance = mockInstance( () => { throw new Error( "org chart unavailable" ); }, [ ADMIN_EMAIL ] );

        const result = run( instance, { user: { userID: "u1", email: ADMIN_EMAIL, employeeID: null, roles: [ "admin" ] } } );

        assert.deepEqual( result.session.user.roles, [ "admin" ] );
    } );

} );

describe( "sessionRefreshHandler — mounting", () => {

    const source = fs.readFileSync( path.join( __dirname, "..", "bin", "web-server.js" ), "utf8" );

    it( "is mounted after the static handlers and before the application routes", () => {
        const refreshAt = source.indexOf( "webHandlers.sessionRefreshHandler( this )" );
        const staticAt = source.lastIndexOf( "express.static( staticContentPath" );
        const routesAt = source.indexOf( "this.defineWebApplicationRoutes();" );

        assert.ok( refreshAt > 0, "the refresh middleware must be mounted" );
        assert.ok( staticAt > 0 && routesAt > 0 );
        assert.ok( refreshAt > staticAt, "an asset request carries the same cookie; re-deriving roles to serve a stylesheet is waste" );
        assert.ok( refreshAt < routesAt, "every route that can consult roles must have passed through the refresh first" );
    } );

} );
