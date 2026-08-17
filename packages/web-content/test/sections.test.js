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
 * Tests for the section registry and dispatch (Site/docs/markup-contract.md).
 *
 * The type -> class map is pinned here for all 15 types. The contract states the mapping is mechanical so a renderer
 * never needs a lookup table; pinning it means a future CSS rule written against a class the renderer does not emit
 * (a silent no-op) fails a test instead.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SECTION_TYPES } = require( "#schema" );
const { sectionClassFor, renderSection, hasRenderer, SECTION_RENDERERS } = require( "#sections" );

describe( "sections — type to class derivation", () => {

    it( "derives the class mechanically for every SECTION_TYPES value", () => {
        assert.deepEqual( SECTION_TYPES.map( sectionClassFor ), [
            "section-hero", "section-prose", "section-verse", "section-character-cards", "section-audio",
            "section-language-example", "section-age-panels", "section-time-strip", "section-timeline",
            "section-gallery", "section-capture", "section-featured", "section-post-list", "section-closing",
            "section-dictionary"
        ] );
    } );

    it( "splits camelCase on every boundary", () => {
        assert.equal( sectionClassFor( "characterCards" ), "section-character-cards" );
        assert.equal( sectionClassFor( "postList" ), "section-post-list" );
        assert.equal( sectionClassFor( "timeStrip" ), "section-time-strip" );
    } );

    it( "returns null for an unknown or empty type rather than inventing a class", () => {
        assert.equal( sectionClassFor( "" ), null );
        assert.equal( sectionClassFor( null ), null );
    } );

} );

describe( "sections — registry coverage", () => {

    it( "registers a renderer for every declared section type", () => {
        const missing = SECTION_TYPES.filter( ( type ) => !hasRenderer( type ) );
        assert.deepEqual( missing, [], `unregistered section types: ${ missing.join( ", " ) }` );
    } );

    it( "registers no renderer for a type the schema does not declare", () => {
        const extra = Object.keys( SECTION_RENDERERS ).filter( ( type ) => !SECTION_TYPES.includes( type ) );
        assert.deepEqual( extra, [], `renderers for undeclared types: ${ extra.join( ", " ) }` );
    } );

} );

describe( "sections — the common wrapper", () => {

    it( "emits section + type class + background layer", () => {
        const out = renderSection( { type: "prose", background: "deep", body: "Text." }, {} ).toString();
        assert.match( out, /^<section class="section section-prose bg-deep"/ );
        assert.match( out, /<\/section>$/ );
    } );

    it( "omits the bg class when the record declares no background", () => {
        const out = renderSection( { type: "prose", body: "Text." }, {} ).toString();
        assert.match( out, /^<section class="section section-prose">/ );
    } );

    it( "adds section-tight when the record asks for it", () => {
        const out = renderSection( { type: "prose", tight: true, body: "x" }, {} ).toString();
        assert.ok( out.includes( "section section-prose section-tight" ) );
    } );

    it( "wraps the body in the per-type default wrap, overridable per record", () => {
        assert.ok( renderSection( { type: "prose", body: "x" }, {} ).toString().includes( "<div class=\"wrap-wide\">" ) );
        assert.ok( renderSection( { type: "gallery", images: [] }, {} ).toString().includes( "<div class=\"wrap-page\">" ) );
        assert.ok( renderSection( { type: "prose", wrap: "wrap-prose", body: "x" }, {} ).toString().includes( "<div class=\"wrap-prose\">" ) );
    } );

    it( "renders the optional chrome — eyebrow, header with accent span, subtitle, divider", () => {
        const out = renderSection( {
            type: "prose", eyebrow: "Eyebrow", title: "Plain", titleAccent: "Accented",
            subtitle: "Sub", divider: true, body: "x"
        }, {} ).toString();
        assert.ok( out.includes( "<p class=\"section-eyebrow\">Eyebrow</p>" ) );
        assert.ok( out.includes( "<h2 class=\"section-header\">Plain <span class=\"accent\">Accented</span></h2>" ) );
        assert.ok( out.includes( "<p class=\"section-subtitle\">Sub</p>" ) );
        assert.ok( out.includes( "<hr class=\"divider-gold divider-short\">" ) );
    } );

    it( "omits every chrome element that is absent", () => {
        const out = renderSection( { type: "prose", body: "x" }, {} ).toString();
        for ( const fragment of [ "section-eyebrow", "section-header", "section-subtitle", "divider-gold" ] ) {
            assert.ok( !out.includes( fragment ), `${ fragment } should be omitted` );
        }
    } );

    it( "escapes chrome text", () => {
        const out = renderSection( { type: "prose", title: "<script>x</script>", body: "y" }, {} ).toString();
        assert.ok( out.includes( "&lt;script&gt;" ) );
        assert.ok( !out.includes( "<script>" ) );
    } );

    it( "emits data-screen-label when supplied", () => {
        const out = renderSection( { type: "prose", screenLabel: "Intro", body: "x" }, {} ).toString();
        assert.ok( out.includes( "data-screen-label=\"Intro\"" ) );
    } );

    it( "renders nothing for an unknown section type rather than throwing", () => {
        assert.equal( renderSection( { type: "nope" }, {} ).toString(), "" );
        assert.equal( renderSection( null, {} ).toString(), "" );
    } );

    it( "never emits a style attribute (the contract's hardest rule)", () => {
        for ( const type of SECTION_TYPES ) {
            const out = renderSection( { type: type, background: "deep", title: "T" }, {} ).toString();
            assert.ok( !/\sstyle=/.test( out ), `${ type } emitted a style attribute` );
        }
    } );

} );

describe( "sections — reveal choreography", () => {

    it( "adds the reveal class when the record opts in, with an optional delay", () => {
        assert.ok( renderSection( { type: "prose", reveal: true, body: "x" }, {} ).toString().includes( "section-prose reveal" ) );
        assert.ok( renderSection( { type: "prose", reveal: true, revealDelay: 2, body: "x" }, {} ).toString().includes( "reveal reveal-delay-2" ) );
    } );

    it( "ignores an out-of-range reveal delay", () => {
        const out = renderSection( { type: "prose", reveal: true, revealDelay: 9, body: "x" }, {} ).toString();
        assert.ok( out.includes( "reveal" ) );
        assert.ok( !out.includes( "reveal-delay" ) );
    } );

} );

/*
 * The authoring guide cannot fall behind the code.
 *
 * A reference that silently omits a section type is worse than none: the author reads the list, concludes the type
 * does not exist, and works around something that was there all along. So the guide has to account for EVERY type
 * the schema accepts — either with its own section, or by name in the not-yet-documented list.
 */
describe( "the authoring guide accounts for every section type", () => {

    const fs = require( "node:fs" );
    const path = require( "node:path" );
    const { SECTION_TYPES } = require( "#schema" );
    const GUIDE = path.join( __dirname, "..", "design", "authoring-guide.md" );

    const DEFERRED_HEADING = "### Types not yet documented here";

    const read = () => fs.readFileSync( GUIDE, "utf8" );
    const documentedIn = ( guide ) => [ ...guide.matchAll( /^### `([a-zA-Z]+)`$/gm ) ].map( ( m ) => m[ 1 ] );

    /*
     * ONLY the deferred list, bounded at the next heading or rule -- not everything after its heading.
     *
     * A slice to the end of the file sweeps in every later section, so a type named in passing anywhere below would
     * count as deferred: it would satisfy the coverage test without appearing in the list, and it would fail the
     * stale test for a type that IS documented and IS absent from the list, sending the author to delete something
     * that is not there.
     */
    const deferredTypesIn = ( guide ) => {
        const start = guide.indexOf( DEFERRED_HEADING );
        if ( start < 0 ) {
            return new Set();
        }
        const rest = guide.slice( start + DEFERRED_HEADING.length );
        const end = rest.search( /^(?:#{1,6} |---\s*$)/m );
        const block = ( end < 0 ) ? rest : rest.slice( 0, end );
        return new Set( [ ...block.matchAll( /`([a-zA-Z]+)`/g ) ].map( ( m ) => m[ 1 ] ) );
    };

    it( "documents or explicitly defers each one", () => {
        const guide = read();
        const documented = new Set( documentedIn( guide ) );
        const deferred = deferredTypesIn( guide );
        const unaccounted = SECTION_TYPES.filter( ( type ) => !documented.has( type ) && !deferred.has( type ) );
        assert.deepEqual( unaccounted, [], "section types the authoring guide never mentions" );
    } );

    it( "does not still defer a type it has since documented", () => {
        const guide = read();
        const deferred = deferredTypesIn( guide );
        const stale = documentedIn( guide ).filter( ( type ) => deferred.has( type ) );
        assert.deepEqual( stale, [], "types listed as pending that already have a section — remove them from the list" );
    } );

    it( "reads the deferred list itself, not the sections that follow it", () => {
        const synthetic = [
            "### `verse`", "", "Documented.", "",
            DEFERRED_HEADING, "", "`prose` · `audio`", "",
            "---", "", "## 5. When a record does not appear", "",
            "A `gallery` mentioned in passing here is not a deferred type."
        ].join( "\n" );
        assert.deepEqual( [ ...deferredTypesIn( synthetic ) ].sort(), [ "audio", "prose" ] );
    } );

} );
