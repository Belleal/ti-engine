/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { applyAuthMethodVisibility } = require( "#web-app-manager" );

// A minimal login fragment carrying the same markers frame-login.html uses.
const LOGIN_HTML = [
    `<form action="/login/local"><button>Sign In</button></form>`,
    `<!--ti-auth-oauth-section-->`,
    `<div class="ti-login-divider">or continue with</div>`,
    `<div class="ti-login-social">`,
    `<!--ti-auth-method:openid-google-->`,
    `<a href="/login/openid-google">Sign in with Google</a>`,
    `<!--/ti-auth-method-->`,
    `<!--ti-auth-method:openid-azure-->`,
    `<a href="/login/openid-azure">Sign in with Azure</a>`,
    `<!--/ti-auth-method-->`,
    `</div>`,
    `<!--/ti-auth-oauth-section-->`
].join( "\n" );

describe( "applyAuthMethodVisibility", () => {

    it( "keeps both provider buttons when both are enabled, and strips all markers", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local", "openid-google", "openid-azure" ] );
        assert.ok( out.includes( "/login/openid-google" ) );
        assert.ok( out.includes( "/login/openid-azure" ) );
        assert.ok( out.includes( "or continue with" ) );
        assert.ok( !out.includes( "ti-auth-" ), "all marker comments should be stripped" );
    } );

    it( "removes only the unconfigured provider (Google enabled, Azure not)", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local", "openid-google" ] );
        assert.ok( out.includes( "/login/openid-google" ) );
        assert.ok( !out.includes( "/login/openid-azure" ), "Azure button should be removed" );
        assert.ok( out.includes( "or continue with" ), "section stays while any provider is enabled" );
        assert.ok( !out.includes( "ti-auth-" ) );
    } );

    it( "removes the whole OAuth section when no provider is enabled (local only)", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local" ] );
        assert.ok( !out.includes( "/login/openid-google" ) );
        assert.ok( !out.includes( "/login/openid-azure" ) );
        assert.ok( !out.includes( "or continue with" ), "divider/section should be gone" );
        assert.ok( out.includes( "/login/local" ), "local form is untouched" );
        assert.ok( !out.includes( "ti-auth-" ) );
    } );

    it( "leaves fragments without markers unchanged", () => {
        const plain = `<div class="frame-dashboard">no auth markers here</div>`;
        assert.equal( applyAuthMethodVisibility( plain, [ "local" ] ), plain );
    } );

    it( "treats a missing/invalid methods list as no OAuth enabled", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, undefined );
        assert.ok( !out.includes( "/login/openid-google" ) );
        assert.ok( !out.includes( "or continue with" ) );
    } );

    it( "strips an unterminated OAuth section in linear time (ReDoS guard)", () => {
        // CodeQL js/polynomial-redos (alert #7): the old lazy `[\s\S]*?` under a /g replace rescanned to
        // end-of-string at every opening marker (O(n^2)) when the closing marker was absent. The tempered-token
        // rewrite is linear. Pathological input: many opening markers, no closing marker — sized so the vulnerable
        // pattern is clearly intractable while the fixed one is instant.
        const hostile = "<!--ti-auth-oauth-section-->".repeat( 50000 );
        const start = process.hrtime.bigint();
        const out = applyAuthMethodVisibility( hostile, [ "local" ] );
        const elapsedMs = Number( process.hrtime.bigint() - start ) / 1e6;
        assert.ok( !out.includes( "ti-auth-" ), "stray markers should still be stripped" );
        assert.ok( elapsedMs < 500, `expected linear-time handling, took ${ elapsedMs.toFixed( 1 ) }ms` );
    } );

} );
