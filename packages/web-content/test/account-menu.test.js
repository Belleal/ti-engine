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
 * The topbar account menu, and the cache rule it exists to respect.
 *
 * Every test here is really the same test: NOTHING ABOUT WHO IS ASKING MAY REACH A SHARED-CACHED PAGE. The topbar
 * rides on every response, including the public ones a CDN keeps for `s-maxage`, so a single viewer-dependent byte
 * in it would be stored from whoever missed the cache first and then served to everyone else. That failure is
 * invisible from the server -- the page renders perfectly, the wrong person just sees it.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { renderAccountMenu, renderTopbar } = require( "#shell" );
const { renderCapture } = require( "#editorial" );
const { mountSessionRoute } = require( "#routes" );

const AUTH = { methods: [ "local" ] };

describe( "account menu — the markup cannot depend on the viewer", () => {

    it( "renders identically for an anonymous visitor and a signed-in administrator", () => {
        const anonymous = renderTopbar( { site: {}, auth: AUTH, viewer: { authenticated: false, roles: [] } } ).toString();
        const admin = renderTopbar( { site: {}, auth: AUTH, viewer: { authenticated: true, roles: [ "admin" ], preview: true } } ).toString();
        assert.equal( anonymous, admin );
    } );

    it( "always ships the signed-in panel, hidden — so revealing it needs no re-render", () => {
        const out = renderAccountMenu( { auth: AUTH } ).toString();
        assert.match( out, /class="account-signed-in" hidden/ );
        assert.match( out, /class="account-signed-out"/ );
    } );

    it( "never carries a CSRF token, which is per-session and would be cached for everyone", () => {
        const out = renderAccountMenu( { auth: AUTH, csrfToken: "SECRET-PER-SESSION-VALUE" } ).toString();
        assert.equal( out.indexOf( "SECRET-PER-SESSION-VALUE" ), -1 );
        assert.match( out, /name="csrfToken" value=""/, "the field exists for the client to fill from the cookie" );
    } );

    it( "names no user, because there is no viewer to name at render time", () => {
        const out = renderAccountMenu( { auth: AUTH, viewer: { authenticated: true, roles: [ "admin" ], name: "boris" } } ).toString();
        assert.equal( out.indexOf( "boris" ), -1 );
    } );

} );

describe( "account menu — it offers what the server actually accepts", () => {

    it( "renders nothing at all when no method is enabled", () => {
        // A control that cannot work is worse than no control: it invites a password into a form that will refuse it.
        assert.equal( renderAccountMenu( { auth: { methods: [] } } ).toString(), "" );
        assert.equal( renderAccountMenu( {} ).toString(), "" );
    } );

    it( "renders the credential form only for `local`", () => {
        assert.match( renderAccountMenu( { auth: AUTH } ).toString(), /type="password"/ );
        assert.doesNotMatch( renderAccountMenu( { auth: { methods: [ "openid-google" ] } } ).toString(), /type="password"/ );
    } );

    it( "renders an OpenID method as a plain link, so it survives without scripting", () => {
        const out = renderAccountMenu( { auth: { methods: [ "openid-google" ] }, labels: { "openid-google": "Google" } } ).toString();
        assert.match( out, /<a class="account-federated" href="\/login\/openid-google"/ );
        assert.match( out, /Google/ );
    } );

} );

describe( "/session — the one response that carries viewer state", () => {

    function call( request ) {
        let captured = null;
        const headers = {};
        const server = {
            registerRoute( method, path, handler ) {
                handler( request, {
                    set( name, value ) { headers[ name ] = value; return this; },
                    json( body ) { captured = body; return this; }
                } );
                return this;
            }
        };
        mountSessionRoute( server );
        return { body: captured, headers: headers };
    }

    it( "is never stored, and varies on the cookie", () => {
        // Without this a CDN would answer it for the wrong person, which is the whole leak in one response.
        const { headers } = call( { session: {} } );
        assert.equal( headers[ "Cache-Control" ], "private, no-store" );
        assert.equal( headers.Vary, "Cookie" );
    } );

    it( "reports an anonymous viewer as nobody", () => {
        assert.deepEqual( call( { session: {} } ).body, { authenticated: false, name: null, preview: false } );
    } );

    it( "reports the signed-in identity and the preview capability", () => {
        const { body } = call( { session: { user: { username: "admin", roles: [ "admin" ] } } } );
        assert.deepEqual( body, { authenticated: true, name: "admin", preview: true } );
    } );

    it( "does not disclose the role list", () => {
        const { body } = call( { session: { user: { username: "kim", roles: [ "beta", "editor" ] } } } );
        assert.equal( Object.prototype.hasOwnProperty.call( body, "roles" ), false );
        assert.equal( body.preview, false );
    } );

} );

describe( "a rendered CSRF token makes the response per-session", () => {

    it( "tells the caller when it embeds one", () => {
        let marked = false;
        renderCapture( {}, { csrfToken: "abc", markPerSession: () => { marked = true; } } );
        assert.equal( marked, true );
    } );

    it( "says nothing when there is no token to embed", () => {
        let marked = false;
        renderCapture( {}, { markPerSession: () => { marked = true; } } );
        assert.equal( marked, false );
    } );

    it( "still renders when the caller offers no way to be told", () => {
        // The signal is advisory to the renderer; a consumer that ignores it must not crash the page.
        assert.doesNotThrow( () => renderCapture( {}, { csrfToken: "abc" } ) );
    } );

    it( "still renders when the caller passes no context at all", () => {
        // `renderCapture` is exported, so it has callers beyond `renderSection` -- which passes `context || {}` and
        // was therefore hiding this. Every other context read here is guarded; the no-token branch was not, so a
        // direct call with no context threw a TypeError while reaching for the callback that reports the missing token.
        assert.doesNotThrow( () => renderCapture( {} ) );
        assert.doesNotThrow( () => renderCapture( {}, null ) );
    } );

} );
