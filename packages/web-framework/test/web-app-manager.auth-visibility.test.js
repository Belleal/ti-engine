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

// A minimal login fragment carrying the same markers frame-login.html uses: a local form, an "or continue with"
// divider, an SSO group with two provider buttons, and a "no method configured" fallback.
const LOGIN_HTML = [
    `<!--ti-auth-method:local-->`,
    `<form action="/login/local"><button>Sign In</button></form>`,
    `<!--/ti-auth-method-->`,
    `<!--ti-auth-divider-->`,
    `<div class="ti-login-divider">or continue with</div>`,
    `<!--/ti-auth-divider-->`,
    `<!--ti-auth-social-->`,
    `<div class="ti-login-social">`,
    `<!--ti-auth-method:openid-google-->`,
    `<a href="/login/openid-google">Sign in with Google</a>`,
    `<!--/ti-auth-method-->`,
    `<!--ti-auth-method:openid-azure-->`,
    `<a href="/login/openid-azure">Sign in with Azure</a>`,
    `<!--/ti-auth-method-->`,
    `</div>`,
    `<!--/ti-auth-social-->`,
    `<!--ti-auth-none-->`,
    `<div class="ti-login-empty">No sign-in method is configured.</div>`,
    `<!--/ti-auth-none-->`
].join( "\n" );

const hasLocal = ( html ) => html.includes( "/login/local" );
const hasGoogle = ( html ) => html.includes( "/login/openid-google" );
const hasAzure = ( html ) => html.includes( "/login/openid-azure" );
const hasDivider = ( html ) => html.includes( "or continue with" );
const hasNone = ( html ) => html.includes( "No sign-in method is configured" );
const hasMarkers = ( html ) => html.includes( "ti-auth-" );

describe( "applyAuthMethodVisibility", () => {

    it( "shows everything (local form, divider, both buttons) when all methods are enabled", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local", "openid-google", "openid-azure" ] );
        assert.ok( hasLocal( out ) );
        assert.ok( hasGoogle( out ) );
        assert.ok( hasAzure( out ) );
        assert.ok( hasDivider( out ) );
        assert.ok( !hasNone( out ) );
        assert.ok( !hasMarkers( out ), "all marker comments should be stripped" );
    } );

    it( "removes only the disabled SSO provider (local + Google, Azure not)", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local", "openid-google" ] );
        assert.ok( hasLocal( out ) );
        assert.ok( hasGoogle( out ) );
        assert.ok( !hasAzure( out ), "Azure button should be removed" );
        assert.ok( hasDivider( out ), "divider stays while both a local form and an SSO provider are present" );
        assert.ok( !hasMarkers( out ) );
    } );

    it( "local only: keeps the form, drops the divider and the whole SSO group", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "local" ] );
        assert.ok( hasLocal( out ) );
        assert.ok( !hasGoogle( out ) );
        assert.ok( !hasAzure( out ) );
        assert.ok( !hasDivider( out ), "divider should be gone without any SSO provider" );
        assert.ok( !hasNone( out ) );
        assert.ok( !hasMarkers( out ) );
    } );

    it( "SSO only (local disabled): hides the local form and the divider, keeps the SSO button", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [ "openid-azure" ] );
        assert.ok( !hasLocal( out ), "local credentials form should be removed when local auth is disabled" );
        assert.ok( hasAzure( out ) );
        assert.ok( !hasGoogle( out ) );
        assert.ok( !hasDivider( out ), "divider should be gone without a local form to separate from" );
        assert.ok( !hasNone( out ) );
        assert.ok( !hasMarkers( out ) );
    } );

    it( "shows the fallback and nothing else when no method is enabled", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, [] );
        assert.ok( !hasLocal( out ) );
        assert.ok( !hasGoogle( out ) );
        assert.ok( !hasAzure( out ) );
        assert.ok( !hasDivider( out ) );
        assert.ok( hasNone( out ), "the 'no method configured' fallback should be shown" );
        assert.ok( !hasMarkers( out ) );
    } );

    it( "treats a missing/invalid methods list as nothing enabled (shows the fallback)", () => {
        const out = applyAuthMethodVisibility( LOGIN_HTML, undefined );
        assert.ok( !hasLocal( out ) );
        assert.ok( !hasGoogle( out ) );
        assert.ok( hasNone( out ) );
    } );

    it( "leaves fragments without markers unchanged", () => {
        const plain = `<div class="frame-dashboard">no auth markers here</div>`;
        assert.equal( applyAuthMethodVisibility( plain, [ "local" ] ), plain );
    } );

    it( "strips an unterminated marker span in linear time (ReDoS guard)", () => {
        // CodeQL js/polynomial-redos: a lazy `open[\s\S]*?close` under a /g replace rescanned to end-of-string at
        // every opening marker (O(n^2)) when the closing marker was absent. The indexOf-based stripMarkerSpans is
        // linear. Pathological input: many opening markers, no closing marker.
        const hostile = "<!--ti-auth-social-->".repeat( 50000 );
        const start = process.hrtime.bigint();
        const out = applyAuthMethodVisibility( hostile, [ "local" ] );
        const elapsedMs = Number( process.hrtime.bigint() - start ) / 1e6;
        assert.ok( !hasMarkers( out ), "stray markers should still be stripped" );
        assert.ok( elapsedMs < 500, `expected linear-time handling, took ${ elapsedMs.toFixed( 1 ) }ms` );
    } );

} );
