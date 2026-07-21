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

// Minimal Express response double capturing status + sent body.
function mockResponse() {
    const response = { statusCode: undefined, body: undefined };
    response.status = ( code ) => {
        response.statusCode = code;
        return response;
    };
    response.send = ( payload ) => {
        response.body = payload;
        return response;
    };
    return response;
}

describe( "healthHandler", () => {

    it( "responds 200 with a status/broker/uptime body (no session or auth required)", () => {
        const response = mockResponse();
        webHandlers.healthHandler()( {}, response );

        assert.equal( response.statusCode, 200 );
        assert.equal( response.body.isSuccessful, true );
        assert.equal( response.body.data.status, "ok" );
        assert.ok( [ "connected", "disconnected", "unknown" ].includes( response.body.data.broker ), "broker is a known state" );
        assert.equal( typeof response.body.data.uptime, "number" );
    } );

} );
