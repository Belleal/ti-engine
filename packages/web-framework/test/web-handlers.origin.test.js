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

// Minimal Express request double: case-insensitive header lookup via get().
function mockRequest( { method = "POST", headers = {}, secure = false } = {} ) {
    const lower = {};
    for ( const key of Object.keys( headers ) ) {
        lower[ key.toLowerCase() ] = headers[ key ];
    }
    return { method, secure, get: ( name ) => lower[ String( name ).toLowerCase() ] };
}

function runHandler( { request, trustedOrigins = [] } ) {
    const instance = { serviceConfig: { trustedOrigins } };
    let captured = { called: false, error: undefined };
    const next = ( error ) => {
        captured.called = true;
        captured.error = error;
    };
    webHandlers.originRefererValidationHandler( instance )( request, {}, next );
    return captured;
}

describe( "originRefererValidationHandler", () => {

    it( "passes GET requests through without checking origin", () => {
        const r = runHandler( { request: mockRequest( { method: "GET", headers: { origin: "https://evil.example" } } ) } );
        assert.equal( r.called, true );
        assert.equal( r.error, undefined );
    } );

    it( "allows a POST whose Origin matches the reconstructed base URL", () => {
        const r = runHandler( {
            request: mockRequest( { headers: { host: "localhost:3000", "x-forwarded-proto": "https", origin: "https://localhost:3000" } } )
        } );
        assert.equal( r.called, true );
        assert.equal( r.error, undefined );
    } );

    it( "allows a POST whose Origin is not reconstructable but is in trustedOrigins (the Codespaces case)", () => {
        const r = runHandler( {
            request: mockRequest( { headers: { host: "localhost:3000", origin: "https://demo-3000.app.github.dev" } } ),
            trustedOrigins: [ "https://demo-3000.app.github.dev" ]
        } );
        assert.equal( r.called, true );
        assert.equal( r.error, undefined, "a configured trusted origin should be accepted" );
    } );

    it( "rejects a POST whose Origin matches neither the base URL nor a trusted origin", () => {
        const r = runHandler( {
            request: mockRequest( { headers: { host: "localhost:3000", "x-forwarded-proto": "https", origin: "https://evil.example" } } ),
            trustedOrigins: [ "https://demo-3000.app.github.dev" ]
        } );
        assert.ok( r.error, "a mismatching origin should be rejected" );
        assert.equal( r.error.code, 4005 );
        assert.equal( r.error.httpCode, 403 );
    } );

    it( "passes through when the browser sent no Origin/Referer (CSRF token handles protection)", () => {
        const r = runHandler( { request: mockRequest( { headers: { host: "localhost:3000" } } ) } );
        assert.equal( r.called, true );
        assert.equal( r.error, undefined );
    } );

} );
