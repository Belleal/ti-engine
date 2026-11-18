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
const logger = require( "@ti-engine/core/logger" );
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

// The hook may be asynchronous (CA-585): an application whose roles are in a database reads them on every request.
describe( "sessionRefreshHandler with an asynchronous hook", () => {

    // Runs the handler and resolves when it has called next, with the roles the route would see at that moment: copied
    // there, so nothing the handler did after `next` can pass for what the route saw (CodeRabbit on #226).
    const runAsync = ( instance, session ) => new Promise( ( resolve ) => {
        const request = { session: session, method: "GET", originalUrl: "/app/dashboard" };
        webHandlers.sessionRefreshHandler( instance )( request, {}, ( error ) => resolve( {
            error: error,
            session: { user: { roles: request.session.user.roles.slice() } }
        } ) );
    } );
    const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

    it( "waits for the hook, so the request sees the roles it read", async () => {
        const instance = mockInstance( async ( session ) => {
            await tick();
            session.user.roles = [ "approver" ];
        } );
        const result = await runAsync( instance, { user: { userID: "u1", roles: [ "editor", "approver" ] } } );
        assert.deepEqual( result.session.user.roles, [ "approver" ], "a role the database no longer grants is gone before any route runs" );
        assert.equal( result.error, undefined );
    } );

    it( "applies the admin allowlist after the hook settles, not before", async () => {
        const instance = mockInstance( async ( session ) => {
            await tick();
            session.user.roles = [ "reader" ];
        }, [ ADMIN_EMAIL ] );
        const result = await runAsync( instance, { user: { userID: "u1", email: ADMIN_EMAIL, roles: [ "admin" ] } } );
        assert.deepEqual( result.session.user.roles, [ "reader", "admin" ] );
    } );

    it( "fails closed when the hook rejects: roles stripped, request still served", async () => {
        const instance = mockInstance( async () => {
            await tick();
            throw new Error( "database unavailable" );
        } );
        const result = await runAsync( instance, { user: { userID: "u1", roles: [ "editor" ] } } );
        assert.deepEqual( result.session.user.roles, [] );
        assert.equal( result.error, undefined, "one failed lookup must not take the whole application down" );
    } );

    it( "keeps an administrator's access when the hook rejects", async () => {
        // Starting with an application role and no `admin`, so the outcome tells the recovery from doing nothing
        // (CodeRabbit on #226): the application's role dropped, the allowlist's applied, the request served.
        const instance = mockInstance( async () => {
            throw new Error( "database unavailable" );
        }, [ ADMIN_EMAIL ] );
        const result = await runAsync( instance, { user: { userID: "u1", email: ADMIN_EMAIL, roles: [ "editor" ] } } );
        assert.deepEqual( result.session.user.roles, [ "admin" ] );
        assert.equal( result.error, undefined );
    } );

    it( "logs a failed refresh's stack alone, never the error's own properties", async ( t ) => {
        // The logger writes an error's own properties out, and a database client's error can carry its connection
        // string there (CodeRabbit on #226), as `applyAdminRoleFor` already guards against.
        const logged = [];
        t.mock.method( logger, "log", ( message, severity, data ) => logged.push( data ) );
        const failure = Object.assign( new Error( "database unavailable" ), { connectionString: "postgres://user:SECRET@db/x" } );
        for ( const hook of [ () => {
            throw failure;
        }, async () => {
            throw failure;
        } ] ) {
            await runAsync( mockInstance( hook ), { user: { userID: "u1", roles: [ "editor" ] } } );
        }
        assert.equal( logged.length, 2 );
        logged.forEach( ( data ) => {
            assert.doesNotMatch( JSON.stringify( data ), /SECRET/ );
            assert.equal( data.stack, failure.stack, "where it failed is still in the log" );
        } );
    } );

    it( "does not hold one request on another's hook", async () => {
        let release;
        const slow = new Promise( ( resolve ) => {
            release = resolve;
        } );
        const order = [];
        const instance = mockInstance( async ( session ) => {
            if ( session.user.userID === "slow" ) {
                await slow;
            }
        } );
        const first = runAsync( instance, { user: { userID: "slow", roles: [] } } ).then( () => order.push( "slow" ) );
        const second = runAsync( instance, { user: { userID: "fast", roles: [] } } ).then( () => order.push( "fast" ) );
        await second;
        release();
        await first;
        assert.deepEqual( order, [ "fast", "slow" ] );
    } );

    it( "keeps a synchronous hook synchronous: next is called before the handler returns", () => {
        const result = run( mockInstance( ( session ) => {
            session.user.roles = [ 1 ];
        } ), { user: { userID: "u1", roles: [ 1, 2 ] } } );
        assert.equal( result.nextCalls, 1 );
    } );

} );
