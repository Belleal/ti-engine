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
        // The key lives in this package's web-server-labels.json, and a consuming application configures exactly one
        // labels path — its own — so the key does not resolve there. `x-text-label` then falls back to the element's
        // own text content. With the element empty, the red alert box rendered with nothing in it: visibly broken,
        // saying nothing to the person who just failed to sign in.
        const match = fragment.match( /id="ti-error"[\s\S]*?x-text-label="[^"]+">([\s\S]*?)<\/div>/ );

        assert.ok( match, "the error element must be found" );
        assert.ok( match[ 1 ].trim().length > 0,
            "the element needs fallback text — an empty one renders an empty alert box wherever the framework's own labels are not loaded" );
    } );

    it( "drops the error parameter from the URL once it has been shown", () => {
        // `?error=` is a one-time message, not state. Left in place, a refresh replays a failure that already
        // happened and the login screen cannot be returned to its blank state without editing the URL by hand.
        assert.match( script, /clearUrlParam\s*\(\s*name\s*\)\s*\{/, "the toolbox must expose clearUrlParam" );
        assert.match( script, /replaceState/, "clearing must not add a history entry the visitor never navigated to" );

        const component = script.match( /const configureLoginError = \(\) => \{[\s\S]*?\n\};/ );
        assert.ok( component, "the tiLoginError component must be found" );
        assert.match( component[ 0 ], /clearUrlParam\(\s*"error"\s*\)/,
            "the component must consume the parameter it read" );
    } );

    it( "uses no inline styles, which the Alpine CSP build forbids", () => {
        assert.doesNotMatch( fragment, /\sstyle="/, "inline style attributes are forbidden under the CSP build" );
    } );

} );
