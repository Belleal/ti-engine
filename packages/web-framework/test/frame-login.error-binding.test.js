/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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

    it( "uses no inline styles, which the Alpine CSP build forbids", () => {
        assert.doesNotMatch( fragment, /\sstyle="/, "inline style attributes are forbidden under the CSP build" );
    } );

} );
