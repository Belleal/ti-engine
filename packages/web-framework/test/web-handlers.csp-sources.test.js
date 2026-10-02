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
 * `cspHeaderHandler` and the sources an application adds to it (CA-352).
 *
 * The handler's directive set was fixed, with no `frame-src`, so a frame from anywhere but this origin fell to
 * `default-src 'self'` and was refused. That is exactly what a Cloudflare Turnstile widget is: an iframe from
 * `https://challenges.cloudflare.com`. Its script loads under `strict-dynamic` by carrying the nonce, but the widget
 * never draws, and nothing an application could configure changed that.
 *
 * `contentSecurityPolicy.additionalSources` lets it name a host. What these tests hold is the other half: that naming
 * a host is ALL it can do. A keyword, a wildcard, a scheme source or a `;` smuggled into a value would each widen the
 * policy past what the setting is for, and a policy that quietly allows `'unsafe-inline'` is not a visible failure.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const webHandlers = require( "#web-handlers" );

// Minimal Express request double, on HTTPS: the case every deployment behind a TLS-terminating proxy is.
function mockRequest() {
    return { secure: true, get: () => undefined };
}

/**
 * Runs a handler built from the given configuration section, and returns its policy by directive name.
 */
function runCsp( contentSecurityPolicy ) {
    const headers = {};
    const response = {
        locals: { cspNonce: "test-nonce" },
        setHeader: ( name, value ) => {
            headers[ name ] = value;
        },
        getHeader: () => undefined,
        removeHeader: () => {}
    };
    webHandlers.cspHeaderHandler( contentSecurityPolicy )( mockRequest(), response, () => {} );
    const raw = headers[ "Content-Security-Policy" ] || "";
    const directives = {};
    for ( const part of raw.split( ";" ).map( ( directive ) => directive.trim() ).filter( Boolean ) ) {
        const [ name, ...sources ] = part.split( /\s+/ );
        directives[ name ] = sources;
    }
    return { raw: raw, directives: directives };
}

const TURNSTILE = "https://challenges.cloudflare.com";

describe( "cspHeaderHandler — sources an application adds (CA-352)", () => {

    it( "changes nothing when nothing is configured", () => {
        const unconfigured = runCsp( undefined );
        assert.equal( runCsp( {} ).raw, unconfigured.raw );
        assert.equal( runCsp( { additionalSources: {} } ).raw, unconfigured.raw );
        // The base policy declares no frame-src: frames fall to default-src 'self'. That is what refused the widget.
        assert.equal( unconfigured.directives[ "frame-src" ], undefined );
        assert.deepEqual( unconfigured.directives[ "default-src" ], [ "'self'" ] );
    } );

    it( "admits a Turnstile widget's frame, keeping the same-origin frames default-src allowed", () => {
        const csp = runCsp( { additionalSources: { frameSrc: [ TURNSTILE ] } } );
        assert.deepEqual( csp.directives[ "frame-src" ], [ "'self'", TURNSTILE ] );
        // Nothing else moves: the script is admitted by its nonce, under strict-dynamic, not by a host.
        assert.deepEqual( csp.directives[ "script-src" ], [ "'strict-dynamic'", "'self'", "https:", "'nonce-test-nonce'" ] );
        assert.deepEqual( csp.directives[ "default-src" ], [ "'self'" ] );
    } );

    it( "appends to a directive the base policy already declares", () => {
        const csp = runCsp( { additionalSources: { imgSrc: [ "https://images.example.com" ], connectSrc: "https://api.example.com" } } );
        assert.deepEqual( csp.directives[ "img-src" ], [ "'self'", "data:", "https:", "https://images.example.com" ] );
        assert.deepEqual( csp.directives[ "connect-src" ], [ "'self'", "https:", "ws:", "wss:", "https://api.example.com" ] );
    } );

    it( "accepts an https host with a wildcard subdomain, a port or a path", () => {
        const accepted = [ "https://*.example.com", "https://example.com:8443", "https://example.com/embed/" ];
        assert.deepEqual( webHandlers.resolveCspAdditions( { additionalSources: { frameSrc: accepted } } ), { frameSrc: accepted } );
    } );

    it( "refuses every source that would widen the policy beyond naming an https host", () => {
        const refused = [
            "'unsafe-inline'", "'unsafe-eval'", "'self'", "'nonce-abc'", "*", "https:", "data:", "blob:",
            "http://example.com", "example.com", "https://", "https://example.com; script-src *",
            "https://example.com 'unsafe-inline'", "https://a.example.com,https://b.example.com", "", null, 42
        ];
        assert.deepEqual( webHandlers.resolveCspAdditions( { additionalSources: { frameSrc: refused } } ), {} );
        // And so the header carries none of them: a refused directive adds nothing, not even its 'self' base.
        const csp = runCsp( { additionalSources: { frameSrc: refused } } );
        assert.equal( csp.directives[ "frame-src" ], undefined );
        assert.doesNotMatch( csp.raw, /unsafe-inline|unsafe-eval|blob:/ );
    } );

    it( "keeps the valid sources of a list and drops the rest", () => {
        assert.deepEqual( webHandlers.resolveCspAdditions( { additionalSources: { frameSrc: [ "*", TURNSTILE, "'unsafe-inline'" ] } } ), { frameSrc: [ TURNSTILE ] } );
    } );

    it( "refuses directives an application cannot extend, script-src among them", () => {
        // A host in script-src is ignored under strict-dynamic: it would read as permission and grant none.
        const additions = webHandlers.resolveCspAdditions( { additionalSources: {
            scriptSrc: [ TURNSTILE ], styleSrc: [ TURNSTILE ], defaultSrc: [ TURNSTILE ], frameAncestors: [ TURNSTILE ], objectSrc: [ TURNSTILE ]
        } } );
        assert.deepEqual( additions, {} );
        assert.deepEqual( runCsp( { additionalSources: { scriptSrc: [ TURNSTILE ] } } ).directives[ "script-src" ], [ "'strict-dynamic'", "'self'", "https:", "'nonce-test-nonce'" ] );
    } );

    it( "takes the configuration once, when the handler is built", () => {
        const section = { additionalSources: { frameSrc: [ TURNSTILE ] } };
        const headers = {};
        const response = { locals: { cspNonce: "n" }, setHeader: ( name, value ) => { headers[ name ] = value; }, getHeader: () => undefined, removeHeader: () => {} };
        const handler = webHandlers.cspHeaderHandler( section );
        section.additionalSources.frameSrc.push( "*" );
        handler( mockRequest(), response, () => {} );
        assert.match( headers[ "Content-Security-Policy" ], /frame-src 'self' https:\/\/challenges\.cloudflare\.com(;|$)/ );
        assert.doesNotMatch( headers[ "Content-Security-Policy" ], /frame-src[^;]*\*/ );
        assert.ok( Object.isFrozen( webHandlers.resolveCspAdditions( section ) ) );
    } );

    it( "is handed the server's own configuration section when the server starts", () => {
        // The handler is built once, in TiWebServer#onStart. Built there without the section, the setting would do
        // nothing on every deployment, and every test above would still pass.
        const source = fs.readFileSync( path.join( __dirname, "..", "bin", "web-server.js" ), "utf8" );
        assert.match( source, /this\.#webServer\.use\( webHandlers\.cspHeaderHandler\( this\.serviceConfig\.contentSecurityPolicy \) \);/ );
    } );

    it( "ships with no additions in the framework's own configuration", () => {
        const shipped = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "web-server.json" ), "utf8" ) );
        assert.deepEqual( shipped.contentSecurityPolicy, { additionalSources: {} } );
        assert.deepEqual( webHandlers.resolveCspAdditions( shipped.contentSecurityPolicy ), {} );
    } );

} );
