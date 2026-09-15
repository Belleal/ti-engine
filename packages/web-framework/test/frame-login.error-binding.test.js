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
const fs = require( "node:fs" );
const path = require( "node:path" );

const LABEL_KEY = "interface.default.login.error-sign-in-failed";

const fragment = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "fragments", "frame-login.html" ), "utf8" );
const script = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.js" ), "utf8" );
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );
const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

function labelAt( keyPath ) {
    return keyPath.split( "." ).reduce( ( node, key ) => ( node && node[ key ] !== undefined ) ? node[ key ] : undefined, labels );
}

describe( "login error surface", () => {

    it( "binds #ti-error to the tiLoginError component", () => {
        assert.match( fragment, /id="ti-error"[^>]*x-data="tiLoginError"/, "#ti-error must carry x-data=\"tiLoginError\"" );
    } );

    it( "shows the error conditionally and renders it through the label directive", () => {
        // Deliberately x-bind:class, not x-show: `.ti-login-error` is `display: none` in the stylesheet, and x-show
        // reveals an element by clearing its inline display — which would fall straight back to that `none`.
        assert.match( fragment, /id="ti-error"[^>]*x-bind:class="\{ visible: hasError \}"/, "#ti-error must toggle the visible class from hasError" );
        assert.ok( fragment.includes( `x-text-label="${ LABEL_KEY }"` ), `the message must render via x-text-label="${ LABEL_KEY }"` );
    } );

    it( "has a stylesheet rule that actually reveals the element", () => {
        const styles = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" );
        assert.match( styles, /\.ti-login-error\.visible\s*\{[^}]*display:\s*block/, "a .ti-login-error.visible rule must exist, or the message can never appear" );
    } );

    it( "registers the component with Alpine", () => {
        assert.ok( script.includes( `Alpine.data( "tiLoginError", configureLoginError )` ), "tiLoginError must be registered in the alpine:init block" );
    } );

    it( "carries the label in both supported languages", () => {
        const label = labelAt( LABEL_KEY );
        assert.ok( label, `missing label ${ LABEL_KEY }` );
        assert.ok( label.en && label.en.length > 0, "English copy is required" );
        assert.ok( label.bg && label.bg.length > 0, "Bulgarian copy is required" );
    } );

    it( "carries fallback text, so it can never render as an empty box", () => {
        const match = fragment.match( /id="ti-error"[\s\S]*?x-text-label="[^"]+">([\s\S]*?)<\/div>/ );

        assert.ok( match, "the error element must be found" );
        assert.ok( match[ 1 ].trim().length > 0,
            "the element needs fallback text — an empty one renders an empty alert box wherever the framework's own labels are not loaded" );
    } );

    it( "uses no inline styles, which the Alpine CSP build forbids", () => {
        assert.doesNotMatch( fragment, /\sstyle="/, "inline style attributes are forbidden under the CSP build" );
    } );

} );

/**
 * The two behaviours above are only worth anything if the runtime actually delivers them, and the assertions so far
 * read source text: a rename breaks them without breaking the page, and a change inside `getLabel` or
 * `configureDirectiveTextLabel` breaks the page without breaking them. These drive the real directive and the real
 * component through the framework sandbox instead.
 */
describe( "login error surface — behaviour", () => {

    /**
     * Runs the registered `text-label` directive over an element, against a given labels catalogue.
     *
     * @method
     * @param {Object} labels
     * @param {string} key
     * @param {string} fallbackText The element's own text, which is what the directive falls back to.
     * @returns {string} The element's text after the directive has run.
     * @private
     */
    function renderLabel( labels, key, fallbackText ) {
        const { stores, directives } = loadTiFramework();
        stores.tiApplication.configuration = { labels: labels };

        const element = { textContent: fallbackText, getAttribute: () => null, setAttribute: () => {} };
        directives[ "text-label" ]( element, { value: undefined, expression: key }, { effect: ( fn ) => fn() } );

        return element.textContent;
    }

    it( "renders the fragment's own fallback when the key is absent, which is every consuming application", () => {
        // Not a made-up element: the fallback is read out of the real fragment, and the catalogue is empty the way a
        // consumer's is — it loads its own labels, never this package's. This is the exact path that rendered an
        // empty red box.
        const fallback = fragment.match( /id="ti-error"[\s\S]*?x-text-label="[^"]+">([\s\S]*?)<\/div>/ )[ 1 ].trim();

        // Guard the guard: with an empty fragment this comparison is "" === "" and proves nothing, which is exactly
        // the broken state it exists to catch.
        assert.ok( fallback.length > 0, "the fragment must supply fallback text for this to test anything" );
        assert.equal( renderLabel( {}, LABEL_KEY, fallback ), fallback );
    } );

    it( "still prefers the catalogue where the key IS loaded", () => {
        const labels = { interface: { default: { login: { "error-sign-in-failed": "Localized copy" } } } };

        assert.equal( renderLabel( labels, LABEL_KEY, "Fallback" ), "Localized copy" );
    } );

    /**
     * Initializes `tiLoginError` against a stubbed address bar and reports what it did.
     *
     * @method
     * @param {string} href
     * @returns {{hasError: boolean, replacedWith: string|null, replaceCalls: number}}
     * @private
     */
    function initLoginError( href ) {
        const { components, sandbox } = loadTiFramework();
        const url = new URL( href );
        let replacedWith = null;
        let replaceCalls = 0;

        // The sandbox is its own `window`, and the script reads these at call time.
        sandbox.URL = URL;
        sandbox.URLSearchParams = URLSearchParams;
        sandbox.location = { href: href, pathname: url.pathname, search: url.search, hash: url.hash };
        sandbox.history = {
            replaceState: ( state, title, next ) => {
                replaceCalls++;
                replacedWith = next;
            }
        };

        const component = components.tiLoginError();
        component.init();

        return { hasError: component.hasError, replacedWith: replacedWith, replaceCalls: replaceCalls };
    }

    it( "shows the message and removes only the error parameter, keeping the rest of the URL", () => {
        const result = initLoginError( "https://app.example.com/?error=2002&keep=1#section" );

        assert.equal( result.hasError, true );
        assert.equal( result.replaceCalls, 1 );
        assert.ok( !result.replacedWith.includes( "error=" ), `error should be gone, got "${ result.replacedWith }"` );
        assert.ok( result.replacedWith.includes( "keep=1" ), "an unrelated parameter must survive" );
        assert.ok( result.replacedWith.includes( "#section" ), "the fragment must survive" );
        assert.ok( result.replacedWith.startsWith( "/" ), "the path must survive" );
    } );

    it( "leaves a clean URL untouched and shows nothing", () => {
        // Without this, a component that never read the parameter at all would pass the test above.
        const result = initLoginError( "https://app.example.com/?keep=1" );

        assert.equal( result.hasError, false );
        assert.equal( result.replaceCalls, 0, "nothing to consume means nothing to rewrite" );
    } );

    it( "drops the '?' entirely when the error was the only parameter", () => {
        const result = initLoginError( "https://app.example.com/?error=2002" );

        assert.equal( result.replacedWith, "/", `expected a bare path, got "${ result.replacedWith }"` );
    } );

} );
