/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const auth = require( "#authorization" );

describe( "authorization — admin allowlist", () => {

    it( "matches an allowlist entry by email (case-insensitive), username, or userID", () => {
        assert.equal( auth.isAdminIdentity( { email: "Boss@Example.com" }, [ "boss@example.com" ] ), true );
        assert.equal( auth.isAdminIdentity( { username: "root" }, [ "root" ] ), true );
        assert.equal( auth.isAdminIdentity( { userID: "oauth2:sub-1" }, [ "oauth2:sub-1" ] ), true );
        assert.equal( auth.isAdminIdentity( { email: "a@x.com" }, [ "b@x.com" ] ), false );
        assert.equal( auth.isAdminIdentity( { email: "a@x.com" }, [] ), false );
        assert.equal( auth.isAdminIdentity( null, [ "a@x.com" ] ), false );
    } );

    it( "applyAdminRole adds 'admin' additively and idempotently, only when allowlisted", () => {
        const s1 = auth.applyAdminRole( { user: { email: "a@x.com", roles: [ 1, 2 ] } }, [ "a@x.com" ] );
        assert.deepEqual( s1.user.roles, [ 1, 2, "admin" ], "additive — keeps existing domain roles" );

        auth.applyAdminRole( s1, [ "a@x.com" ] );
        assert.equal( s1.user.roles.filter( ( r ) => r === "admin" ).length, 1, "idempotent — no duplicate" );

        const s3 = auth.applyAdminRole( { user: { email: "b@x.com", roles: [ 1 ] } }, [ "a@x.com" ] );
        assert.deepEqual( s3.user.roles, [ 1 ], "not allowlisted — unchanged" );

        assert.doesNotThrow( () => auth.applyAdminRole( {}, [ "a@x.com" ] ), "no session user — no-op" );
        assert.doesNotThrow( () => auth.applyAdminRole( { user: { roles: [] } }, [] ), "no allowlist — no-op" );
    } );

} );

describe( "authorization — guards", () => {

    function mockRes() {
        return { statusCode: null, ended: false, status( code ) { this.statusCode = code; return this; }, end() { this.ended = true; return this; } };
    }

    function run( middleware, session ) {
        const response = mockRes();
        let nexted = false;
        middleware( { session: session }, response, () => { nexted = true; } );
        return { response, nexted };
    }

    it( "responds 401 when unauthenticated", () => {
        const { response, nexted } = run( auth.requireAdmin, {} );
        assert.equal( response.statusCode, 401 );
        assert.equal( nexted, false );
    } );

    it( "responds 403 when authenticated but missing the role", () => {
        const { response, nexted } = run( auth.requireAdmin, { user: { roles: [ 1, 2 ] } } );
        assert.equal( response.statusCode, 403 );
        assert.equal( nexted, false );
    } );

    it( "calls next() when the required role is present", () => {
        const { response, nexted } = run( auth.requireAdmin, { user: { roles: [ "admin" ] } } );
        assert.equal( nexted, true );
        assert.equal( response.statusCode, null );
    } );

    it( "requireRole admits a user holding any one of several roles", () => {
        const middleware = auth.requireRole( 3, "admin" );
        assert.equal( run( middleware, { user: { roles: [ 3 ] } } ).nexted, true );
        assert.equal( run( middleware, { user: { roles: [ 1 ] } } ).response.statusCode, 403 );
    } );

} );
