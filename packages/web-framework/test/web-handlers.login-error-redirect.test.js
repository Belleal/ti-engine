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
const webHandlers = require( "#web-handlers" );

function mockRequest( { method = "POST", accept = "text/html", htmx = false } = {} ) {
    const headers = { accept: accept };
    if ( htmx ) {
        headers[ "hx-request" ] = "true";
    }
    return {
        method: method,
        session: { language: "en" },
        originalUrl: "/login/local",
        get: ( name ) => headers[ String( name ).toLowerCase() ],
        accepts: ( type ) => ( accept.includes( type ) || accept.includes( "*/*" ) ) ? type : false
    };
}

function mockResponse() {
    const captured = { redirectedTo: null, status: null, body: undefined, headers: null };
    return {
        captured: captured,
        redirect: ( code, target ) => {
            captured.status = code;
            captured.redirectedTo = target;
        },
        status: ( code ) => {
            captured.status = code;
            return { send: ( body ) => { captured.body = body; } };
        },
        set: ( headers ) => { captured.headers = headers; }
    };
}

function runErrorHandler( error, request ) {
    const response = mockResponse();
    webHandlers.defaultErrorHandler()( error, request, response, () => {} );
    return response.captured;
}

describe( "login failures redirect to the login page regardless of HTTP method", () => {

    it( "redirects an HTML-accepting POST that produced a 401", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST" } ) );

        assert.equal( captured.status, 303 );
        assert.ok( captured.redirectedTo.startsWith( "/?error=" ), `expected a login redirect, got "${ captured.redirectedTo }"` );
    } );

    it( "still redirects an HTML-accepting GET (the OAuth callback path)", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "GET" } ) );

        assert.equal( captured.status, 303 );
        assert.ok( captured.redirectedTo.startsWith( "/?error=" ) );
    } );

    it( "leaves a non-401 HTML POST on the payload response", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, null, exceptions.httpCode.C_422 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST" } ) );

        assert.equal( captured.redirectedTo, null, "widening the rule must not swallow ordinary form errors" );
        assert.equal( captured.status, 422 );
        assert.ok( captured.body );
    } );

    it( "leaves an HTMX request on the HX-Trigger branch", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST", htmx: true } ) );

        assert.equal( captured.redirectedTo, null );
        assert.ok( captured.headers && captured.headers[ "HX-Trigger" ], "an HTMX caller must keep receiving HX-Trigger" );
    } );

} );
