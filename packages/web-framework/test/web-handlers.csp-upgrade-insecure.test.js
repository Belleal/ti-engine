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
 * `cspHeaderHandler` and `upgrade-insecure-requests`.
 *
 * The directive was never declared in the handler's own `directives` object — it arrived with Helmet's `useDefaults`
 * set and went out on every response, including on a `TI_WEB_USE_TLS=false` deployment that has no TLS listener to
 * answer the https:// URLs it tells the browser to rewrite to.
 *
 * What it broke was sign-out, and only sign-out, which is why it survived this long. Chrome exempts a
 * potentially-trustworthy host such as `localhost` when it issues the FIRST request, so every ordinary XHR on an
 * HTTP deployment works — but it applies the upgrade when it resolves a REDIRECT, and `logoutHandler` is the one
 * response in the framework that redirects. Verified against real Chromium: with the directive, a `303` to `/`
 * from `http://localhost:3000/logout` is followed to `https://localhost:3000/` and fails
 * `net::ERR_SSL_PROTOCOL_ERROR`; without it, the same redirect is followed to `http://localhost:3000/` and answers
 * `200`.
 *
 * The decision is per REQUEST rather than per deployment, because what the directive should follow is the scheme the
 * browser is on — not the one the Node server happens to be listening with. A reverse proxy terminating TLS in
 * front of an HTTP server must keep the directive, and `X-Forwarded-Proto` is what reports that.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const webHandlers = require( "#web-handlers" );

// Minimal Express request double: case-insensitive header lookup via get().
function mockRequest( { headers = {}, secure = false } = {} ) {
    const lower = {};
    for ( const key of Object.keys( headers ) ) {
        lower[ key.toLowerCase() ] = headers[ key ];
    }
    return { secure, get: ( name ) => lower[ String( name ).toLowerCase() ] };
}

/**
 * Runs the handler and returns the Content-Security-Policy it set, as a directive-name set plus the raw value.
 */
function runCsp( request, { nonce = "test-nonce" } = {} ) {
    const headers = {};
    const response = {
        locals: { cspNonce: nonce },
        setHeader: ( name, value ) => {
            headers[ name ] = value;
        },
        getHeader: () => undefined,
        removeHeader: () => {}
    };
    let nextCalled = false;
    webHandlers.cspHeaderHandler()( request, response, () => {
        nextCalled = true;
    } );
    const raw = headers[ "Content-Security-Policy" ] || "";
    return {
        raw: raw,
        nextCalled: nextCalled,
        names: new Set( raw.split( ";" ).map( ( directive ) => directive.trim().split( /\s+/ )[ 0 ] ).filter( Boolean ) )
    };
}

describe( "cspHeaderHandler — upgrade-insecure-requests follows the visitor's scheme", () => {

    it( "omits it on a plain-HTTP request", () => {
        // The TI_WEB_USE_TLS=false deployment whose sign-out this broke.
        const csp = runCsp( mockRequest( { secure: false } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), false );
    } );

    it( "keeps it on a direct HTTPS request", () => {
        // Nothing is given up where the directive is correct: an HTTPS deployment keeps the hardening.
        const csp = runCsp( mockRequest( { secure: true } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), true );
    } );

    it( "keeps it behind a TLS-terminating proxy, where the server itself is not secure", () => {
        // Cloud Run / IAP: the Node server speaks HTTP, the BROWSER is on HTTPS, and that is what the directive
        // should follow. Judging by the server's own listener instead would silently drop it there.
        const csp = runCsp( mockRequest( { secure: false, headers: { "X-Forwarded-Proto": "https" } } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), true );
    } );

    it( "omits it when a proxy reports the visitor is on http", () => {
        const csp = runCsp( mockRequest( { secure: false, headers: { "X-Forwarded-Proto": "http" } } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), false );
    } );

    it( "matches the forwarded scheme case-insensitively", () => {
        const csp = runCsp( mockRequest( { secure: false, headers: { "X-Forwarded-Proto": "HTTPS" } } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), true );
    } );

    it( "does not read a comma-separated forwarded list as https on the header fallback", () => {
        // In the real pipeline this case never reaches the header comparison: the server sets `trust proxy`, so
        // `request.secure` has already resolved a proxy chain and is authoritative. The header is only consulted
        // when a consumer turns that setting off, and there "https, http" is a list rather than the string "https".
        // Pinned as-is because it matches what `getBaseUrl` has always done with the same header — one scheme
        // decision for both, not two that can drift.
        const csp = runCsp( mockRequest( { secure: false, headers: { "X-Forwarded-Proto": "https, http" } } ) );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), false );
    } );

} );

describe( "cspHeaderHandler — everything else is unchanged by the scheme", () => {

    const EXPECTED = [ "default-src", "script-src", "script-src-attr", "style-src", "style-src-elem", "img-src", "connect-src", "font-src", "object-src", "frame-ancestors", "base-uri", "form-action" ];

    it( "emits the same directive set over HTTP and HTTPS, bar the one", () => {
        const insecure = runCsp( mockRequest( { secure: false } ) );
        const secure = runCsp( mockRequest( { secure: true } ) );
        for ( const name of EXPECTED ) {
            assert.equal( insecure.names.has( name ), true, `${ name } missing over HTTP` );
            assert.equal( secure.names.has( name ), true, `${ name } missing over HTTPS` );
        }
        // The only difference between the two responses.
        const difference = [ ...secure.names ].filter( ( name ) => !insecure.names.has( name ) );
        assert.deepEqual( difference, [ "upgrade-insecure-requests" ] );
    } );

    it( "still carries the per-response nonce over HTTP", () => {
        // The nonce is the reason Helmet's static CSP is disabled in favour of this handler; dropping a directive
        // must not disturb it.
        const csp = runCsp( mockRequest( { secure: false } ), { nonce: "abc123" } );
        assert.equal( csp.raw.includes( "'nonce-abc123'" ), true );
        assert.equal( csp.nextCalled, true );
    } );

    it( "tolerates a request double with no header accessor", () => {
        // Defensive: a caller outside the Express pipeline must not crash the response.
        const csp = runCsp( {} );
        assert.equal( csp.names.has( "upgrade-insecure-requests" ), false );
        assert.equal( csp.names.has( "default-src" ), true );
    } );

} );
