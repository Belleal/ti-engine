/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const exceptions = require( "@ti-engine/core/exceptions" );
const TiWebAppManager = require( "../bin/web-app-manager.js" );

// The default verifyAccess gate is role-data only — it depends solely on its arguments (the fragment descriptor +
// the session roles) and the authorization helper, not on instance state. Build a bare instance via Object.create
// so the abstract-class constructor guard is bypassed.
const app = Object.create( TiWebAppManager.prototype );

describe( "TiWebAppManager.verifyAccess — default fragment-role gate", () => {

    it( "resolves for a public fragment (no roles) even when the user holds none", async () => {
        await app.verifyAccess( { user: { roles: [] } }, { path: "fragments/frame-dashboard.html" } );
    } );

    it( "resolves for a gated fragment when the user holds a required role", async () => {
        await app.verifyAccess( { user: { roles: [ 1, 2, 3 ] } }, { path: "x", roles: [ 3 ] } );
    } );

    it( "rejects (403) a gated fragment when the user lacks every required role", async () => {
        await assert.rejects(
            app.verifyAccess( { user: { roles: [ 1 ] } }, { path: "x", roles: [ 3 ] } ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                assert.equal( error.httpCode, exceptions.httpCode.C_403 );
                return true;
            }
        );
    } );

    it( "rejects (403) an admin-gated fragment for a non-admin with high numeric roles", async () => {
        await assert.rejects(
            app.verifyAccess( { user: { roles: [ 1, 2, 3 ] } }, { path: "x", roles: [ "admin" ] } ),
            ( error ) => error.httpCode === exceptions.httpCode.C_403
        );
    } );

    it( "rejects (403) a gated fragment when the session carries no user", async () => {
        await assert.rejects(
            app.verifyAccess( {}, { path: "x", roles: [ "admin" ] } ),
            ( error ) => error.httpCode === exceptions.httpCode.C_403
        );
    } );

} );
