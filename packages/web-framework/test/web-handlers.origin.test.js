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
        assert.equal( r.error, undefined );
    } );

    it( "allows a POST whose Origin is not reconstructable but is in trustedOrigins (the Codespaces case)", () => {
        const r = runHandler( {
            request: mockRequest( { headers: { host: "localhost:3000", origin: "https://demo-3000.app.github.dev" } } ),
            trustedOrigins: [ "https://demo-3000.app.github.dev" ]
        } );
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
        assert.equal( r.error, undefined );
    } );

} );
