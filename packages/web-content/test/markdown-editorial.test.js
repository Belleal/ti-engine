/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the editorial markdown extensions -- the syntax that lets an author reach the prose primitives in
 * Site/docs/markup-contract.md from markdown. This became load-bearing when the decision was taken to re-author
 * every page in the framework rather than import legacy HTML: with no HTML escape hatch, a drop cap or pull quote
 * that markdown cannot express is a primitive nobody can use.
 *
 * Note on escaping: markdown-it escapes & < > and " but leaves the apostrophe literal, unlike render/html.js
 * which also escapes it. Expectations below match markdown-it's real output.
 *
 * The security invariant leads: attribute annotation must NOT become a way to smuggle `style` or an event handler
 * into the page, which would breach the contract's hardest rule from inside authored content.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { render, renderInline } = require( "#markdown" );

describe( "markdown attrs — the allowlist is the security boundary", () => {

    it( "refuses a style attribute, however it is written", () => {
        for ( const source of [
            "Text {style=\"color:red\"}",
            "Text {style='color:red'}",
            "Text {.prose-lead style=\"color:red\"}"
        ] ) {
            const out = render( source ).toString();
            assert.ok( !/\sstyle=/.test( out ), `style leaked from: ${ source }` );
        }
    } );

    it( "refuses event handlers and arbitrary attributes", () => {
        const out = render( "Text {onclick=\"evil()\" onload=\"x\" data-evil=\"1\" href=\"javascript:x\"}" ).toString();
        assert.ok( !/onclick|onload|data-evil|javascript:/i.test( out ) );
    } );

    it( "allows class and id, which is what the primitives need", () => {
        assert.ok( render( "Lead. {.prose-lead}" ).toString().includes( "class=\"prose-lead\"" ) );
        assert.ok( render( "Text {#anchor}" ).toString().includes( "id=\"anchor\"" ) );
    } );

} );

describe( "markdown attrs — prose primitives reachable from markdown", () => {

    it( "marks a lead paragraph and a drop cap", () => {
        assert.ok( render( "First. {.prose-lead}" ).toString().includes( "<p class=\"prose-lead\">First.</p>" ) );
        assert.ok( render( "Ash fell. {.prose-drop-cap}" ).toString().includes( "<p class=\"prose-drop-cap\">Ash fell.</p>" ) );
    } );

    it( "marks a section break, plain or ornamented", () => {
        assert.ok( render( "◆ ◇ ◆ {.prose-break}" ).toString().includes( "<p class=\"prose-break\">◆ ◇ ◆</p>" ) );
        assert.ok( render( "· · · {.prose-break .prose-break-plain}" ).toString().includes( "class=\"prose-break prose-break-plain\"" ) );
    } );

    it( "marks a blockquote and its cite", () => {
        const out = render( "> A crown of iron thorns.\n{.prose-quote}" ).toString();
        assert.ok( out.includes( "<blockquote class=\"prose-quote\">" ) );
    } );

    it( "marks inline Anarandian without a container", () => {
        const out = render( "The word [Anarand'aris]{.anarandian-inline} means the heart." ).toString();
        assert.ok( out.includes( "<span class=\"anarandian-inline\">Anarand'aris</span>" ) );
    } );

} );

describe( "markdown containers — wrappers markdown cannot produce", () => {

    it( "builds a pull quote, auto-classing text and attribution by position", () => {
        const out = render( "::: pull-quote\nAn immortal queen does not mourn.\n\nRa'máen\n:::" ).toString();
        assert.ok( out.includes( "<figure class=\"pull-quote\">" ) );
        assert.ok( out.includes( "<p class=\"pull-quote-text\">An immortal queen does not mourn.</p>" ) );
        assert.ok( out.includes( "class=\"pull-quote-attribution\">Ra'máen</p>" ) );
        assert.ok( out.includes( "</figure>" ) );
    } );

    it( "lets an explicit class override the positional default", () => {
        const out = render( "::: pull-quote\nOnly an attribution. {.pull-quote-attribution}\n:::" ).toString();
        assert.ok( out.includes( "class=\"pull-quote-attribution\"" ) );
        assert.ok( !out.includes( "pull-quote-text" ) );
    } );

    it( "builds a chapter opener across paragraph and heading", () => {
        const out = render( "::: chapter-opener\nChapter Four\n\n# A Deal You Can't Refuse\n\nEvery drop you spill.\n:::" ).toString();
        assert.ok( out.includes( "<div class=\"chapter-opener\">" ) );
        assert.ok( out.includes( "<p class=\"chapter-number\">Chapter Four</p>" ) );
        assert.ok( out.includes( "class=\"chapter-title\">A Deal You Can't Refuse</h1>" ) );
        assert.ok( out.includes( "<p class=\"chapter-epigraph\">Every drop you spill.</p>" ) );
    } );

    it( "builds a language example", () => {
        const out = render( "::: language-example\nErod'Sarahoos\n\nthe throne-hall\n:::" ).toString();
        assert.ok( out.includes( "<div class=\"language-example\">" ) );
        assert.ok( out.includes( "class=\"anarandian-text\">Erod'Sarahoos</p>" ) );
        assert.ok( out.includes( "class=\"translation-text\">the throne-hall</p>" ) );
    } );

    it( "builds a prose figure, unwrapping the image from its paragraph", () => {
        const out = render( "::: figure\n![Ra'maen leaving](/i.webp)\n\nThe throne stands empty\n:::" ).toString();
        assert.ok( out.includes( "<figure class=\"prose-figure\">" ) );
        assert.ok( out.includes( "<img src=\"/i.webp\" alt=\"Ra'maen leaving\">" ) );
        assert.ok( !/<p>\s*<img/.test( out ), "the image must not stay wrapped in a paragraph" );
        assert.ok( out.includes( "class=\"prose-figcaption\">The throne stands empty</p>" ) );
    } );

    it( "ignores an unknown container name rather than emitting a stray wrapper", () => {
        const out = render( "::: bogus\nText.\n:::" ).toString();
        assert.ok( !out.includes( "class=\"bogus\"" ) );
    } );

    it( "never lets a container emit a style attribute", () => {
        const out = render( "::: pull-quote\nText {style=\"color:red\"}\n:::" ).toString();
        assert.ok( !/\sstyle=/.test( out ) );
    } );

} );

describe( "markdown footnotes — mapped onto the contract's classes", () => {

    const out = render( "Kaelor rose.[^1]\n\n[^1]: The lesser of the two suns." ).toString();

    it( "renders the call as an anchor carrying the contract's ids", () => {
        assert.ok( out.includes( "<a class=\"footnote-ref\" href=\"#fn-1\" id=\"fnref-1\">1</a>" ) );
    } );

    it( "renders the list with marker and text as flex children, not a paragraph", () => {
        assert.ok( out.includes( "<ol class=\"footnote-list\">" ) );
        assert.ok( out.includes( "<li class=\"footnote-item\" id=\"fn-1\">" ) );
        assert.ok( out.includes( "<span class=\"footnote-marker\">1</span>" ) );
        assert.ok( !/<li class="footnote-item"[^>]*>\s*<p>/.test( out ), "a <p> would break the flex row" );
    } );

    it( "renders the back-reference", () => {
        assert.ok( out.includes( "class=\"footnote-backref\" href=\"#fnref-1\"" ) );
    } );

} );

describe( "markdown — the base contract still holds", () => {

    it( "still escapes raw HTML in authored markdown", () => {
        const out = render( "Text <script>alert(1)</script>" ).toString();
        assert.ok( out.includes( "&lt;script&gt;" ) );
        assert.ok( !out.includes( "<script>" ) );
    } );

    it( "still preserves authored Unicode punctuation", () => {
        const out = render( "She paused — then spoke. “Quiet,” he said." ).toString();
        assert.ok( out.includes( "—" ) && out.includes( "“" ) );
    } );

    it( "renderInline still omits the paragraph wrapper", () => {
        assert.ok( !renderInline( "a *b*" ).toString().includes( "<p>" ) );
    } );

} );
