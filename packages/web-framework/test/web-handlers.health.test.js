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
