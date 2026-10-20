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

/**
 * The sign-in page's e-mail link block (1.57.0, CA-537): what the shipped fragment holds, and what `tiLoginEmailLink`
 * and `tiLoginError` do with the address bar, driven through the real script in the framework sandbox.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const fragment = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "fragments", "frame-login.html" ), "utf8" );
const styles = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" );
const TOKEN = "Ab0_-".repeat( 8 ) + "xyz";

const block = () => {
    const start = fragment.indexOf( "<!--ti-auth-method:email-link-->" );
    const end = fragment.indexOf( "<!--/ti-auth-method-->", start );
    assert.ok( start >= 0 && end > start, "the e-mail link block must be in the fragment" );
    return fragment.slice( start, end );
};

describe( "the e-mail link block on the sign-in page", () => {

    it( "posts both of its forms to /login/email-link with the page's CSRF token", () => {
        const forms = block().match( /<form[^>]*>[\s\S]*?<\/form>/g );
        assert.equal( forms.length, 2 );
        forms.forEach( ( form ) => {
            assert.match( form, /action="\/login\/email-link" method="post"/ );
            assert.ok( form.includes( "name=\"_csrf\" value='{ti-csrf-placeholder}'" ) );
        } );
        assert.ok( forms.some( ( form ) => /name="token" x-bind:value="token"/.test( form ) ), "one form carries the token" );
        assert.ok( forms.some( ( form ) => /<p class="ti-login-address" x-text="email"><\/p>/.test( form ) && /x-bind:disabled="checking"/.test( form ) ), "and shows the address it signs in" );
        assert.ok( forms.some( ( form ) => /name="email"[\s\S]*type="email"[\s\S]*required/.test( form ) ), "one asks for the address" );
    } );

    it( "shows the address form before the script runs, and hides the other steps until it does", () => {
        const ask = block().match( /<form x-show="step === 'ask'"[^>]*>/ );
        assert.ok( ask, "the address form is the ask step" );
        assert.ok( !ask[ 0 ].includes( "x-cloak" ), "with no script, the address form still works" );
        assert.match( block(), /<form x-show="step === 'confirm'" x-cloak/ );
        assert.match( block(), /<div x-show="step === 'sent'" x-cloak/ );
        assert.match( styles, /\.ti-login-email-link \[x-cloak\]\s*\{\s*display:\s*none !important;/, "x-cloak needs a rule, or it hides nothing" );
    } );

    it( "registers its component with Alpine", () => {
        const { components } = loadTiFramework();
        assert.equal( typeof components.tiLoginEmailLink, "function" );
    } );

} );

/**
 * Initializes a sign-in page component against a stubbed address bar and reports what it did.
 *
 * @method
 * @param {string} name The component's registered name.
 * @param {string} href
 * @returns {{component: Object, replaced: string[]}}
 * @private
 */
function start( name, href, peek = () => Promise.resolve( { isSuccessful: true, data: { email: "parent@example.com" } } ) ) {
    const { components, sandbox, stores } = loadTiFramework();
    const asked = [];
    stores.tiApplication.sendRequest = ( url, method, data ) => {
        asked.push( { url, method, data } );
        return peek();
    };
    const url = new URL( href );
    const replaced = [];
    const location = { href: href, pathname: url.pathname, search: url.search, hash: url.hash };
    sandbox.URL = URL;
    sandbox.URLSearchParams = URLSearchParams;
    sandbox.location = location;
    sandbox.history = {
        replaceState: ( state, title, next ) => {
            replaced.push( next );
            // As a browser does, so a second rewrite sees the first.
            const now = new URL( next, href );
            location.href = now.href;
            location.pathname = now.pathname;
            location.search = now.search;
            location.hash = now.hash;
        }
    };
    const component = components[ name ]();
    const settled = component.init();
    return { component: component, replaced: replaced, asked: asked, settled: Promise.resolve( settled ).then( () => new Promise( ( resolve ) => setImmediate( resolve ) ) ) };
}

describe( "tiLoginEmailLink", () => {

    it( "opens on the address form when the address bar says nothing", () => {
        const { component, replaced } = start( "tiLoginEmailLink", "https://app.example.com/" );
        assert.equal( component.step, "ask" );
        assert.equal( component.message, "" );
        assert.deepEqual( replaced, [] );
    } );

    it( "takes a link's token out of the address bar at once and asks the person to continue", () => {
        const { component, replaced } = start( "tiLoginEmailLink", `https://app.example.com/app?keep=1#email-link=${ TOKEN }` );
        assert.equal( component.step, "confirm" );
        assert.equal( component.token, TOKEN );
        assert.equal( replaced[ replaced.length - 1 ], "/app?keep=1", "the path and the query survive, the fragment goes" );
    } );

    it( "asks which address the link signs in, without spending it, and shows it before Continue", async () => {
        const { component, asked, settled } = start( "tiLoginEmailLink", `https://app.example.com/#email-link=${ TOKEN }` );
        assert.equal( component.checking, true, "Continue waits for the answer" );
        // Through JSON, because the data was built inside the sandbox, whose objects have its own prototypes.
        assert.deepEqual( JSON.parse( JSON.stringify( asked ) ), [ { url: "/login/email-link", method: "POST", data: { token: TOKEN, peek: true } } ] );
        await settled;
        assert.equal( component.checking, false );
        assert.equal( component.email, "parent@example.com" );
        assert.equal( component.step, "confirm" );
        component.askAgain();
        assert.equal( component.step, "ask" );
        assert.equal( component.token, "", "Not you? drops the link" );
    } );

    it( "sends a link that can sign nobody in back to the address form, saying so", async () => {
        const { component, settled } = start( "tiLoginEmailLink", `https://app.example.com/#email-link=${ TOKEN }`, () => Promise.resolve( { isSuccessful: true, data: { email: null } } ) );
        await settled;
        assert.equal( component.step, "ask" );
        assert.equal( component.message, "expired" );
        assert.equal( component.token, "" );
    } );

    it( "still lets the person continue when the question fails, without the address", async () => {
        const { component, settled } = start( "tiLoginEmailLink", `https://app.example.com/#email-link=${ TOKEN }`, () => Promise.reject( new Error( "offline" ) ) );
        await settled;
        assert.equal( component.step, "confirm" );
        assert.equal( component.checking, false );
        assert.equal( component.email, "" );
    } );

    it( "says the link is on its way, and lets the person use another address", () => {
        const { component, replaced } = start( "tiLoginEmailLink", "https://app.example.com/?email-link=sent" );
        assert.equal( component.step, "sent" );
        assert.deepEqual( replaced, [ "/" ], "read once, like ?error=" );
        component.askAgain();
        assert.equal( component.step, "ask" );
    } );

    it( "explains a request that did not send, on the address form", () => {
        for ( const outcome of [ "limited", "unavailable", "invalid-address" ] ) {
            const { component } = start( "tiLoginEmailLink", `https://app.example.com/?email-link=${ outcome }` );
            assert.equal( component.step, "ask" );
            assert.equal( component.message, outcome );
            component.askAgain();
            assert.equal( component.message, "", "asking again clears it" );
        }
    } );

    it( "ignores an outcome it does not know, which nothing it answers can carry", () => {
        const { component } = start( "tiLoginEmailLink", "https://app.example.com/?email-link=%3Cscript%3E" );
        assert.equal( component.step, "ask" );
        assert.equal( component.message, "" );
    } );

    it( "has a block for every message the address form shows", () => {
        for ( const outcome of [ "limited", "unavailable", "invalid-address", "expired" ] ) {
            assert.ok( block().includes( `x-show="message === '${ outcome }'"` ), outcome );
        }
    } );

} );

describe( "tiLoginError and a sign-in link that cannot be used", () => {

    it( "explains 2000 as an expired link, not as a failed sign-in", () => {
        const { component } = start( "tiLoginError", "https://app.example.com/?error=2000" );
        assert.equal( component.hasError, true );
        assert.equal( component.isExpiredLink, true );
    } );

    it( "keeps every other code the failed sign-in it was", () => {
        const { component } = start( "tiLoginError", "https://app.example.com/?error=2002" );
        assert.equal( component.hasError, true );
        assert.equal( component.isExpiredLink, false );
    } );

    it( "has a message for each, with its own English fallback", () => {
        assert.match( fragment, /x-show="!isExpiredLink" x-text-label="interface\.default\.login\.error-sign-in-failed">[^<]+</ );
        assert.match( fragment, /x-show="isExpiredLink" x-text-label="interface\.default\.login\.error-sign-in-link-expired">[^<]+</ );
    } );

} );
