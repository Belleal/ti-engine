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
 * `startupGateHandler` — what the request gate does in each start-up state, and how its refusal is answered.
 *
 * `web-server.startup-gate.test.js` drives a real server through the case that matters (CA-187). This pins the rest:
 * a start that outlasts the hold, a start that failed, the liveness probe, an instance never started through
 * `start()`, and the refusal's rendering — which must not be the redirect every other error on a navigation gets,
 * because a redirect to `/` sends the browser straight back into the request that is being held.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "@ti-engine/core/exceptions" );
const webHandlers = require( "#web-handlers" );

function stubInstance( state ) {
    let settle;
    const settled = new Promise( ( resolve ) => {
        settle = resolve;
    } );
    const instance = { startup: { state: state, settled: settled } };
    instance.finish = ( outcome ) => {
        instance.startup = { state: outcome, settled: settled };
        settle();
    };
    return instance;
}

function mockRequest( path = "/app/config", headers = {} ) {
    const lower = Object.fromEntries( Object.entries( headers ).map( ( [ key, value ] ) => [ key.toLowerCase(), value ] ) );
    const accept = String( lower.accept || "" );
    return {
        path: path,
        method: "GET",
        originalUrl: path,
        get: ( name ) => lower[ String( name ).toLowerCase() ],
        accepts: ( type ) => ( accept.includes( type ) || accept.includes( "*/*" ) ) ? type : false
    };
}

function mockResponse() {
    const response = { headers: {}, statusCode: undefined, body: undefined, contentType: undefined };
    response.set = ( name, value ) => {
        if ( typeof name === "object" ) {
            Object.assign( response.headers, name );
        } else {
            response.headers[ name ] = value;
        }
        return response;
    };
    response.status = ( code ) => {
        response.statusCode = code;
        return response;
    };
    response.type = ( type ) => {
        response.contentType = type;
        return response;
    };
    response.send = ( body ) => {
        response.body = body;
        return response;
    };
    response.redirect = ( code, location ) => {
        response.statusCode = code;
        response.location = location;
    };
    return response;
}

// Runs the gate and reports how it let the request go: admitted, or refused with the error it passed on.
function pass( gate, request = mockRequest(), response = mockResponse() ) {
    return new Promise( ( resolve ) => {
        gate( request, response, ( error ) => resolve( { error: error, response: response } ) );
    } );
}

describe( "startupGateHandler", () => {

    it( "lets everything through for an instance not started through start()", async () => {
        const { error } = await pass( webHandlers.startupGateHandler( stubInstance( undefined ) ) );
        assert.equal( error, undefined );
    } );

    it( "lets everything through once the instance has started", async () => {
        const { error } = await pass( webHandlers.startupGateHandler( stubInstance( "started" ) ) );
        assert.equal( error, undefined );
    } );

    it( "holds a request while the instance starts, and admits it when the start finishes", async () => {
        const instance = stubInstance( "starting" );
        let released = false;
        const outcome = pass( webHandlers.startupGateHandler( instance, 5000 ) ).then( ( result ) => {
            released = true;
            return result;
        } );
        await new Promise( ( resolve ) => setTimeout( resolve, 50 ) );
        assert.equal( released, false );

        instance.finish( "started" );
        const { error } = await outcome;
        assert.equal( error, undefined );
    } );

    it( "refuses a held request with 503 and Retry-After when the start outlasts the hold", async () => {
        const { error, response } = await pass( webHandlers.startupGateHandler( stubInstance( "starting" ), 20 ) );
        assert.equal( error.code, exceptions.exceptionCode.E_GEN_SERVICE_STARTING );
        assert.equal( error.httpCode, exceptions.httpCode.C_503 );
        assert.equal( response.headers[ "Retry-After" ], "5" );
    } );

    it( "refuses a held request when the start fails, rather than serving it", async () => {
        const instance = stubInstance( "starting" );
        const outcome = pass( webHandlers.startupGateHandler( instance, 5000 ) );
        instance.finish( "failed" );
        const { error } = await outcome;
        assert.equal( error.httpCode, exceptions.httpCode.C_503 );
    } );

    it( "never holds the liveness probe", async () => {
        const { error } = await pass( webHandlers.startupGateHandler( stubInstance( "starting" ), 5000 ), mockRequest( "/health" ) );
        assert.equal( error, undefined );
    } );

} );

describe( "defaultErrorHandler — a 503", () => {

    const refusal = () => exceptions.raise( exceptions.exceptionCode.E_GEN_SERVICE_STARTING, null, exceptions.httpCode.C_503 );

    it( "answers a navigation where it was asked, instead of redirecting it into the held request", () => {
        const response = mockResponse();
        webHandlers.defaultErrorHandler()( refusal(), mockRequest( "/", { accept: "text/html" } ), response, () => {} );
        assert.equal( response.statusCode, exceptions.httpCode.C_503 );
        assert.equal( response.location, undefined );
        assert.equal( response.contentType, "text/plain" );
        assert.match( response.body, /starting/i );
    } );

    it( "still notifies an HTMX request the usual way", () => {
        const response = mockResponse();
        webHandlers.defaultErrorHandler()( refusal(), mockRequest( "/app/view", { accept: "text/html", "HX-Request": "true" } ), response, () => {} );
        assert.equal( response.statusCode, exceptions.httpCode.C_503 );
        assert.ok( response.headers[ "HX-Trigger" ] );
    } );

} );
