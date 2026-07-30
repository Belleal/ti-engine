/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for document-head composition. §8 invariants pinned here: canonical always points at the record's path, and
 * hreflang pairs are reciprocal (EN points at BG, BG points back, x-default at the English side). Plus: gated bodies
 * are noindex while their teasers are not, JSON-LD is generated per type, and the title is escaped in the head too.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { canonicalUrl, hreflangLinks, shouldNoindex, jsonLd, composeHead } = require( "#document" );

const BASE = "https://anarandaris.com";

function post( overrides ) {
    return Object.assign( {
        id: "p", type: "post", path: "/2026/03/20/slug/", lang: "en", title: "T",
        visibility: "public", status: "published", seo: { description: "D" }, publishedAt: "2026-03-20T00:00:00Z"
    }, overrides || {} );
}

describe( "document — canonical", () => {

    it( "always points at the record's path, joined to the base once", () => {
        assert.equal( canonicalUrl( post(), BASE ), "https://anarandaris.com/2026/03/20/slug/" );
        assert.equal( canonicalUrl( post(), BASE + "/" ), "https://anarandaris.com/2026/03/20/slug/" );
        assert.equal( canonicalUrl( post( { path: "no-leading-slash/" } ), BASE ), "https://anarandaris.com/no-leading-slash/" );
    } );

} );

describe( "document — hreflang reciprocity", () => {

    const en = post( { id: "en", lang: "en", path: "/p/", translationOf: "bg" } );
    const bg = post( { id: "bg", lang: "bg", path: "/bg/p/", translationOf: "en" } );

    function asMap( links ) {
        const map = {};
        links.forEach( ( link ) => { map[ link.lang ] = link.href; } );
        return map;
    }

    it( "emits reciprocal pairs from either side, with x-default on the English side", () => {
        const fromEn = asMap( hreflangLinks( en, bg, BASE ) );
        const fromBg = asMap( hreflangLinks( bg, en, BASE ) );
        const expected = {
            en: "https://anarandaris.com/p/",
            bg: "https://anarandaris.com/bg/p/",
            "x-default": "https://anarandaris.com/p/"
        };
        assert.deepEqual( fromEn, expected );
        assert.deepEqual( fromBg, expected );
    } );

    it( "emits no alternates for a single-language record", () => {
        assert.deepEqual( hreflangLinks( post(), null, BASE ), [] );
    } );

} );

describe( "document — noindex", () => {

    it( "leaves a public body indexable but forces noindex on a non-public body", () => {
        assert.equal( shouldNoindex( post(), "full" ), false );
        assert.equal( shouldNoindex( post( { visibility: "authenticated" } ), "full" ), true );
        assert.equal( shouldNoindex( post( { visibility: "role:__none__" } ), "full" ), true );
    } );

    it( "keeps a gated teaser indexable", () => {
        assert.equal( shouldNoindex( post( { visibility: "authenticated" } ), "teaser" ), false );
    } );

    it( "honors an explicit seo.noindex on a public record", () => {
        assert.equal( shouldNoindex( post( { seo: { description: "D", noindex: true } } ), "full" ), true );
    } );

} );

describe( "document — JSON-LD by type", () => {

    it( "maps each content type to its schema.org type and title field", () => {
        assert.equal( jsonLd( post(), { baseUrl: BASE } )[ "@type" ], "Article" );
        assert.equal( jsonLd( post(), { baseUrl: BASE } ).headline, "T" );
        assert.equal( jsonLd( post( { type: "book" } ), { baseUrl: BASE } )[ "@type" ], "Book" );
        assert.equal( jsonLd( post( { type: "release" } ), { baseUrl: BASE } )[ "@type" ], "MusicAlbum" );
        assert.equal( jsonLd( post( { type: "book" } ), { baseUrl: BASE } ).name, "T" );
        assert.equal( jsonLd( post(), { baseUrl: BASE } ).url, "https://anarandaris.com/2026/03/20/slug/" );
    } );

} );

describe( "document — composeHead assembly", () => {

    it( "includes the canonical link and escapes the title", () => {
        const head = composeHead( post( { title: "<x> & \"y\"" } ), { baseUrl: BASE } ).toString();
        assert.ok( head.includes( "<link rel=\"canonical\" href=\"https://anarandaris.com/2026/03/20/slug/\">" ) );
        assert.ok( head.includes( "&lt;x&gt; &amp; &quot;y&quot;" ) );
        assert.ok( !head.includes( "<x>" ) );
    } );

    it( "emits the robots noindex tag only for a non-public body", () => {
        assert.ok( !composeHead( post(), { baseUrl: BASE } ).toString().includes( "noindex" ) );
        assert.ok( composeHead( post( { visibility: "authenticated" } ), { baseUrl: BASE, mode: "full" } ).toString().includes( "noindex" ) );
    } );

    it( "embeds a JSON-LD script with the right type and no </script> breakout", () => {
        const head = composeHead( post( { title: "</script><script>x" } ), { baseUrl: BASE } ).toString();
        assert.ok( head.includes( "application/ld+json" ) );
        assert.ok( head.includes( "\"Article\"" ) );
        assert.ok( !head.includes( "</script><script>x" ), "the raw closing tag must be neutralised" );
    } );

    it( "emits hreflang alternates when a counterpart is supplied", () => {
        const en = post( { id: "en", lang: "en", path: "/p/", translationOf: "bg" } );
        const bg = post( { id: "bg", lang: "bg", path: "/bg/p/", translationOf: "en" } );
        const head = composeHead( en, { baseUrl: BASE, counterpart: bg } ).toString();
        assert.ok( head.includes( "hreflang=\"bg\"" ) );
        assert.ok( head.includes( "hreflang=\"x-default\"" ) );
    } );

} );
