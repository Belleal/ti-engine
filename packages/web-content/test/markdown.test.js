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
 * Tests for the markdown renderer. The security-critical invariant is `html: false` -- raw HTML embedded in markdown
 * source is ESCAPED, not passed through, so authored content can never inject markup. markdown.js is one of only two
 * sanctioned raw() sites (CLAUDE.md 8), which is exactly why its output must be trustworthy.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { render, renderInline } = require( "#markdown" );
const { SafeString } = require( "#html" );

describe( "markdown — html:false is enforced", () => {

    it( "escapes raw HTML embedded in markdown source", () => {
        const out = render( "Hello <script>alert(1)</script>" ).toString();
        assert.ok( out.includes( "&lt;script&gt;" ) );
        assert.ok( !out.includes( "<script>" ) );
    } );

    it( "escapes a raw HTML block", () => {
        const out = render( "<div onclick=\"evil()\">x</div>" ).toString();
        assert.ok( !out.includes( "<div" ) );
        assert.ok( out.includes( "&lt;div" ) );
    } );

    it( "does not emit a javascript: link target", () => {
        const out = render( "[click](javascript:alert(1))" ).toString();
        assert.ok( !out.includes( "href=\"javascript:" ) );
    } );

} );

describe( "markdown — rendering", () => {

    it( "renders standard prose constructs", () => {
        assert.ok( render( "# Title" ).toString().includes( "<h1>Title</h1>" ) );
        assert.ok( render( "*thought*" ).toString().includes( "<em>thought</em>" ) );
        assert.ok( render( "**loud**" ).toString().includes( "<strong>loud</strong>" ) );
        assert.ok( render( "- a\n- b" ).toString().includes( "<li>a</li>" ) );
        assert.ok( render( "[x](/p/)" ).toString().includes( "href=\"/p/\"" ) );
    } );

    it( "preserves authored Unicode punctuation verbatim (no typographic substitution)", () => {
        const out = render( "She paused — then spoke. “Quiet,” he said." ).toString();
        assert.ok( out.includes( "—" ), "em dash preserved" );
        assert.ok( out.includes( "“" ) && out.includes( "”" ), "curly quotes preserved" );
        // A straight quote must stay straight -- the manuscripts carry deliberate punctuation.
        assert.ok( render( "\"straight\"" ).toString().includes( "&quot;" ) || render( "\"straight\"" ).toString().includes( "\"straight\"" ) );
    } );

    it( "returns a SafeString so it composes with the html template", () => {
        assert.ok( render( "x" ) instanceof SafeString );
        assert.ok( renderInline( "x" ) instanceof SafeString );
    } );

    it( "renderInline omits the paragraph wrapper (for summaries and blurbs)", () => {
        const inline = renderInline( "a *b*" ).toString();
        assert.ok( !inline.includes( "<p>" ) );
        assert.ok( inline.includes( "<em>b</em>" ) );
        assert.ok( render( "a *b*" ).toString().includes( "<p>" ) );
    } );

    it( "tolerates empty, null, and undefined input", () => {
        for ( const input of [ "", null, undefined ] ) {
            assert.equal( render( input ).toString(), "" );
            assert.equal( renderInline( input ).toString(), "" );
        }
    } );

} );
