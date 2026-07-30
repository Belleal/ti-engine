/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the escaping tagged template. The §8 invariant: a title containing <script> renders escaped. Escaping is
 * the DEFAULT; raw() is the explicit, auditable opt-out (permitted only for markdown output and import-sanitised
 * legacy HTML). Nested html`` composes without double-escaping so templates can be built from parts safely.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { html, raw, SafeString, escapeHtml } = require( "#html" );

describe( "html — escaping by default", () => {

    it( "escapes an interpolated <script> in a title (the §8 invariant)", () => {
        assert.equal(
            html`<h1>${ "<script>alert(1)</script>" }</h1>`.toString(),
            "<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>"
        );
    } );

    it( "escapes the five HTML-significant characters, ampersand first", () => {
        assert.equal( escapeHtml( "&<>\"'" ), "&amp;&lt;&gt;&quot;&#39;" );
    } );

    it( "prevents attribute-value breakout", () => {
        assert.equal( html`<a href="${ "\"><b>x</b>" }">`.toString(), "<a href=\"&quot;&gt;&lt;b&gt;x&lt;/b&gt;\">" );
    } );

    it( "renders null and undefined as empty", () => {
        assert.equal( html`x${ null }y${ undefined }z`.toString(), "xyz" );
    } );

} );

describe( "html — raw() and composition", () => {

    it( "raw() opts a value out of escaping", () => {
        assert.equal( html`<div>${ raw( "<b>ok</b>" ) }</div>`.toString(), "<div><b>ok</b></div>" );
    } );

    it( "composes nested html`` without double-escaping", () => {
        assert.equal( html`<ul>${ html`<li>${ "a&b" }</li>` }</ul>`.toString(), "<ul><li>a&amp;b</li></ul>" );
    } );

    it( "renders an array of values by concatenation", () => {
        const items = [ "a", "b&c" ].map( ( x ) => html`<li>${ x }</li>` );
        assert.equal( html`<ul>${ items }</ul>`.toString(), "<ul><li>a</li><li>b&amp;c</li></ul>" );
    } );

    it( "returns a SafeString from both html`` and raw()", () => {
        assert.ok( html`x` instanceof SafeString );
        assert.ok( raw( "x" ) instanceof SafeString );
    } );

} );
