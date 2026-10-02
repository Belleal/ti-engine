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
 * Cloudflare Turnstile on the capture form (CA-352).
 *
 * The capture endpoint stored whatever passed the CSRF check, and a CSRF token stops a forged cross-site post, not a
 * script that loads the page first. What these tests hold is the set of failures that would not show:
 * - a token that is not checked, or a failed check that still stores;
 * - an unreachable Cloudflare read as a pass;
 * - a key configured without its secret, which accepts every sign-up unchecked while the widget looks like protection;
 * - the secret reaching a rendered page.
 *
 * Cloudflare is never called here: `siteverify` is a fake that records what it was sent.
 */

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { publicTurnstile, resolveTurnstile, verifyTurnstileToken, TURNSTILE_SCRIPT_URL } = require( "#capture-turnstile" );
const { captureHandler, mountCaptureRoutes } = require( "#capture-routes" );
const { renderCapture } = require( "#editorial" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const { contentHandler } = require( "#content-routes" );

const SITE_KEY = "0x4AAAAAAAtestsitekey";
const SECRET = "0x4AAAAAAAtestsecretvalue";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * A `siteverify` stand-in: answers with the given outcome, and remembers each call.
 */
function fakeSiteverify( outcome ) {
    const calls = [];
    const fetch = ( url, init ) => {
        calls.push( { url: url, body: new URLSearchParams( init.body ), method: init.method, signal: init.signal } );
        if ( outcome instanceof Error ) {
            return Promise.reject( outcome );
        }
        return Promise.resolve( { json: () => Promise.resolve( outcome ) } );
    };
    return { fetch: fetch, calls: calls };
}

function fakeStore() {
    const submitted = [];
    return {
        submitted: submitted,
        submit( record ) {
            submitted.push( record );
            return Promise.resolve( { status: "success" } );
        }
    };
}

const repository = { resolve: ( path ) => ( path === "/newsletter/" ? { outcome: "visible", record: {} } : { outcome: "miss" } ) };

async function submit( handler, body ) {
    let redirect = null;
    const response = { redirect( code, url ) { redirect = { code: code, url: url }; } };
    handler( { body: Object.assign( { email: "reader@example.com", purpose: "newsletter", consent: "1", returnTo: "/newsletter/" }, body ) }, response );
    for ( let i = 0; i < 5 && redirect === null; i++ ) {
        await new Promise( ( resolve ) => setImmediate( resolve ) );
    }
    return redirect;
}

describe( "turnstile — the widget's public half", () => {

    it( "is nothing without a site key", () => {
        assert.equal( publicTurnstile( undefined ), null );
        assert.equal( publicTurnstile( {} ), null );
        assert.equal( publicTurnstile( { siteKey: "  " } ), null );
        assert.equal( publicTurnstile( { secret: SECRET } ), null );
    } );

    it( "carries the site key and a theme, and never the secret configured beside them", () => {
        const half = publicTurnstile( { siteKey: SITE_KEY, secret: SECRET, theme: "dark" } );
        assert.deepEqual( half, { siteKey: SITE_KEY, theme: "dark" } );
        assert.ok( Object.isFrozen( half ) );
        assert.doesNotMatch( JSON.stringify( half ), new RegExp( SECRET ) );
    } );

    it( "draws in the visitor's colour scheme unless a known theme is configured", () => {
        assert.equal( publicTurnstile( { siteKey: SITE_KEY } ).theme, "auto" );
        assert.equal( publicTurnstile( { siteKey: SITE_KEY, theme: "neon" } ).theme, "auto" );
        assert.equal( publicTurnstile( { siteKey: SITE_KEY, theme: "light" } ).theme, "light" );
    } );

} );

describe( "turnstile — what the endpoint does with a challenge", () => {

    it( "checks nothing when neither half is configured, as before", () => {
        assert.deepEqual( resolveTurnstile( undefined ), { mode: "off" } );
        assert.deepEqual( resolveTurnstile( { siteKey: "", secret: "" } ), { mode: "off" } );
    } );

    it( "verifies every submission when both halves are configured", () => {
        assert.deepEqual( resolveTurnstile( { siteKey: SITE_KEY, secret: SECRET } ), { mode: "on", secret: SECRET } );
    } );

    it( "calls one half without the other a misconfiguration, and says which", () => {
        const keyOnly = resolveTurnstile( { siteKey: SITE_KEY } );
        assert.equal( keyOnly.mode, "misconfigured" );
        assert.match( keyOnly.problem, /site key is configured without its secret/ );
        const secretOnly = resolveTurnstile( { secret: SECRET } );
        assert.equal( secretOnly.mode, "misconfigured" );
        assert.match( secretOnly.problem, /secret is configured without a site key/ );
    } );

} );

describe( "turnstile — verifying a token with Cloudflare", () => {

    it( "sends the secret and the token, and nothing about the visitor", async () => {
        const siteverify = fakeSiteverify( { success: true, action: "capture" } );
        const verdict = await verifyTurnstileToken( "token-1", { secret: SECRET, fetch: siteverify.fetch } );
        assert.deepEqual( verdict, { ok: true, codes: [] } );
        assert.equal( siteverify.calls.length, 1 );
        assert.equal( siteverify.calls[ 0 ].url, SITEVERIFY );
        assert.equal( siteverify.calls[ 0 ].method, "POST" );
        assert.deepEqual( [ ...siteverify.calls[ 0 ].body.keys() ].sort(), [ "response", "secret" ] );
        assert.equal( siteverify.calls[ 0 ].body.get( "secret" ), SECRET );
        assert.equal( siteverify.calls[ 0 ].body.get( "response" ), "token-1" );
        // The capture store's rule is that no IP is ever read: none is sent on either.
        assert.equal( siteverify.calls[ 0 ].body.get( "remoteip" ), null );
        assert.ok( siteverify.calls[ 0 ].signal, "a slow siteverify must not hold the submission open" );
    } );

    it( "refuses a token Cloudflare does not vouch for, passing on its reasons", async () => {
        const siteverify = fakeSiteverify( { success: false, "error-codes": [ "timeout-or-duplicate" ] } );
        assert.deepEqual( await verifyTurnstileToken( "used-token", { secret: SECRET, fetch: siteverify.fetch } ), { ok: false, codes: [ "timeout-or-duplicate" ] } );
        const silent = fakeSiteverify( { success: false } );
        assert.deepEqual( await verifyTurnstileToken( "t", { secret: SECRET, fetch: silent.fetch } ), { ok: false, codes: [ "verification-failed" ] } );
    } );

    it( "refuses a genuine token issued for another action, and accepts one that names none", async () => {
        const elsewhere = fakeSiteverify( { success: true, action: "login" } );
        assert.deepEqual( await verifyTurnstileToken( "t", { secret: SECRET, fetch: elsewhere.fetch } ), { ok: false, codes: [ "action-mismatch" ] } );
        const unnamed = fakeSiteverify( { success: true, action: "" } );
        assert.equal( ( await verifyTurnstileToken( "t", { secret: SECRET, fetch: unnamed.fetch } ) ).ok, true );
    } );

    it( "refuses a missing or overlong token without asking Cloudflare", async () => {
        const siteverify = fakeSiteverify( { success: true } );
        for ( const token of [ undefined, "", 42, [ "a" ], "x".repeat( 2049 ) ] ) {
            assert.equal( ( await verifyTurnstileToken( token, { secret: SECRET, fetch: siteverify.fetch } ) ).ok, false, String( token ).slice( 0, 20 ) );
        }
        assert.equal( siteverify.calls.length, 0 );
        assert.equal( ( await verifyTurnstileToken( "x".repeat( 2048 ), { secret: SECRET, fetch: siteverify.fetch } ) ).ok, true );
    } );

    it( "refuses when Cloudflare cannot be reached, answers with something else, or takes too long", async () => {
        const down = fakeSiteverify( new TypeError( "fetch failed" ) );
        assert.deepEqual( await verifyTurnstileToken( "t", { secret: SECRET, fetch: down.fetch } ), { ok: false, codes: [ "siteverify-unreachable" ] } );
        const garbled = { fetch: () => Promise.resolve( { json: () => Promise.reject( new SyntaxError( "Unexpected token <" ) ) } ) };
        assert.deepEqual( await verifyTurnstileToken( "t", { secret: SECRET, fetch: garbled.fetch } ), { ok: false, codes: [ "siteverify-unreachable" ] } );
        const hanging = { fetch: ( url, init ) => new Promise( ( resolve, reject ) => init.signal.addEventListener( "abort", () => reject( init.signal.reason ) ) ) };
        // AbortSignal.timeout's timer is unreferenced: a running server keeps the event loop alive, a test does not.
        const keepAlive = setTimeout( () => {}, 1000 );
        try {
            assert.deepEqual( await verifyTurnstileToken( "t", { secret: SECRET, fetch: hanging.fetch, timeoutMs: 20 } ), { ok: false, codes: [ "siteverify-timeout" ] } );
        } finally {
            clearTimeout( keepAlive );
        }
    } );

} );

describe( "turnstile — the capture endpoint stores only what passed", () => {

    let store;
    beforeEach( () => {
        store = fakeStore();
    } );

    it( "stores a submission whose token Cloudflare vouches for", async () => {
        const siteverify = fakeSiteverify( { success: true, action: "capture" } );
        const handler = captureHandler( store, repository, { turnstile: { siteKey: SITE_KEY, secret: SECRET, fetch: siteverify.fetch } } );
        const redirect = await submit( handler, { "cf-turnstile-response": "good-token" } );
        assert.deepEqual( redirect, { code: 303, url: "/newsletter/?capture=success" } );
        assert.equal( store.submitted.length, 1 );
        assert.equal( siteverify.calls[ 0 ].body.get( "response" ), "good-token" );
        // The token is the endpoint's business, not the record's.
        assert.equal( Object.prototype.hasOwnProperty.call( store.submitted[ 0 ], "cf-turnstile-response" ), false );
    } );

    it( "never hands a failed or missing challenge to the store", async () => {
        const failing = fakeSiteverify( { success: false, "error-codes": [ "invalid-input-response" ] } );
        const handler = captureHandler( store, repository, { turnstile: { siteKey: SITE_KEY, secret: SECRET, fetch: failing.fetch } } );
        assert.deepEqual( await submit( handler, { "cf-turnstile-response": "forged" } ), { code: 303, url: "/newsletter/?capture=error" } );
        assert.deepEqual( await submit( handler, {} ), { code: 303, url: "/newsletter/?capture=error" } );
        assert.equal( store.submitted.length, 0 );
        assert.equal( failing.calls.length, 1, "a submission with no token is refused without asking Cloudflare" );
    } );

    it( "refuses rather than stores when Cloudflare cannot answer", async () => {
        const down = fakeSiteverify( new TypeError( "fetch failed" ) );
        const handler = captureHandler( store, repository, { turnstile: { siteKey: SITE_KEY, secret: SECRET, fetch: down.fetch } } );
        assert.deepEqual( await submit( handler, { "cf-turnstile-response": "t" } ), { code: 303, url: "/newsletter/?capture=error" } );
        assert.equal( store.submitted.length, 0 );
    } );

    it( "refuses every submission when the key is configured without its secret", async () => {
        // The widget would draw and look like protection while nothing checked its token.
        const siteverify = fakeSiteverify( { success: true } );
        const handler = captureHandler( store, repository, { turnstile: { siteKey: SITE_KEY, fetch: siteverify.fetch } } );
        assert.deepEqual( await submit( handler, { "cf-turnstile-response": "t" } ), { code: 303, url: "/newsletter/?capture=error" } );
        assert.equal( store.submitted.length, 0 );
        assert.equal( siteverify.calls.length, 0 );
    } );

    it( "stores as before when Turnstile is not configured at all", async () => {
        assert.deepEqual( await submit( captureHandler( store, repository ), {} ), { code: 303, url: "/newsletter/?capture=success" } );
        assert.equal( store.submitted.length, 1 );
    } );

    it( "is configured through mountCaptureRoutes, which keeps the site up when only one half is set", async () => {
        const routes = {};
        const server = { registerRoute( method, path, ...handlers ) { routes[ method + " " + path ] = handlers[ handlers.length - 1 ]; return this; } };
        assert.doesNotThrow( () => mountCaptureRoutes( server, { store: store, repository: repository, turnstile: { siteKey: SITE_KEY } } ) );
        assert.deepEqual( await submit( routes[ "post /capture" ], { "cf-turnstile-response": "t" } ), { code: 303, url: "/newsletter/?capture=error" } );
        assert.equal( store.submitted.length, 0 );
    } );

} );

describe( "turnstile — the capture form draws the challenge", () => {

    const section = { type: "capture", purpose: "newsletter" };
    const contextWith = ( extra ) => Object.assign( { path: "/newsletter/", lang: "en", csrfToken: "csrf", nonce: "n0nce" }, extra );

    it( "draws nothing when no site key is configured", () => {
        const markup = String( renderCapture( section, contextWith( {} ) ) );
        assert.doesNotMatch( markup, /cf-turnstile|challenges\.cloudflare\.com/ );
    } );

    it( "puts the widget inside the form, before the button, and the script after it with the nonce", () => {
        const markup = String( renderCapture( section, contextWith( { turnstile: publicTurnstile( { siteKey: SITE_KEY, theme: "dark" } ) } ) ) );
        const form = markup.slice( markup.indexOf( "<form" ), markup.indexOf( "</form>" ) );
        assert.match( form, new RegExp( `<div class="cf-turnstile capture-challenge" data-sitekey="${ SITE_KEY }" data-action="capture" data-theme="dark"></div><button` ) );
        const after = markup.slice( markup.indexOf( "</form>" ) );
        assert.equal( after, `</form><script src="${ TURNSTILE_SCRIPT_URL }" async defer nonce="n0nce"></script>` );
    } );

    it( "loads the script once, however many forms the page has", () => {
        const context = contextWith( { turnstile: publicTurnstile( { siteKey: SITE_KEY } ) } );
        const page = String( renderCapture( section, context ) ) + String( renderCapture( Object.assign( {}, section, { purpose: "preorder" } ), context ) );
        assert.equal( ( page.match( /cf-turnstile capture-challenge/g ) || [] ).length, 2 );
        assert.equal( ( page.match( /<script /g ) || [] ).length, 1 );
    } );

    it( "says so when there is no nonce, since strict-dynamic drops the script without a word", () => {
        const problems = [];
        renderCapture( section, contextWith( { nonce: undefined, turnstile: publicTurnstile( { siteKey: SITE_KEY } ), reportProblem: ( message ) => problems.push( message ) } ) );
        assert.equal( problems.length, 1 );
        assert.match( problems[ 0 ], /without a CSP nonce/ );
    } );

} );

describe( "turnstile — the content route hands a page the public half alone", () => {

    const page = {
        id: "newsletter", type: "page", path: "/newsletter/", lang: "en", title: "Newsletter", visibility: "public",
        status: "published", seo: { description: "D" }, sections: [ { type: "capture", purpose: "newsletter" } ]
    };
    const contentRepository = new ContentRepository( buildIndex( [ page ] ) );
    const fakeResponse = () => ( {
        locals: { nonce: "page-nonce" }, headers: {}, body: null,
        set( name, value ) { this.headers[ name ] = value; return this; },
        status() { return this; },
        type() { return this; },
        send( body ) { this.body = body; return this; },
        redirect() { return this; }
    } );

    it( "copies the site key and theme into the render context, and not the secret configured with them", () => {
        let seen = null;
        const handler = contentHandler( contentRepository, {
            turnstile: { siteKey: SITE_KEY, secret: SECRET },
            renderPage: ( record, context ) => { seen = context.turnstile; return "x"; }
        } );
        handler( { path: "/newsletter/", session: {}, csrfToken: () => "csrf" }, fakeResponse(), () => assert.fail( "should not fall through" ) );
        assert.deepEqual( seen, { siteKey: SITE_KEY, theme: "auto" } );
    } );

    it( "renders the widget into the real page, with the response's nonce, and the secret nowhere in it", () => {
        const response = fakeResponse();
        contentHandler( contentRepository, { turnstile: { siteKey: SITE_KEY, secret: SECRET } } )( { path: "/newsletter/", session: {}, csrfToken: () => "csrf" }, response, () => assert.fail( "should not fall through" ) );
        const body = String( response.body );
        assert.match( body, new RegExp( `data-sitekey="${ SITE_KEY }"` ) );
        assert.ok( body.includes( `<script src="${ TURNSTILE_SCRIPT_URL }" async defer nonce="page-nonce"></script>` ) );
        assert.equal( body.includes( SECRET ), false );
    } );

} );
