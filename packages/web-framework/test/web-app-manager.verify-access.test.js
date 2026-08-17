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
