/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for sitemap / RSS / robots generation. The §8 invariant pinned here: gated BODIES are excluded from
 * sitemap.xml while their public teasers are included -- a gated record with a teaser has a public, indexable page
 * and belongs in the sitemap; one without has nothing public to index and must stay out. Hidden records and drafts
 * appear in neither feed, for any viewer.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const { sitemapEntries, renderSitemap, rssItems, renderRss, renderRobots } = require( "#feeds" );

const BASE = "https://anarandaris.com";

function post( id, path, extra ) {
    return Object.assign( {
        id: id, type: "post", path: path, lang: "en", title: "T",
        visibility: "public", status: "published", world: "anarandaris", form: "song",
        publishedAt: "2026-03-20T00:00:00Z", seo: { description: "D" }
    }, extra || {} );
}

function repo() {
    return new ContentRepository( buildIndex( [
        post( "pub", "/pub/" ),
        post( "gated-teased", "/gated-teased/", { visibility: "authenticated", teaser: "A glimpse." } ),
        post( "gated-bare", "/gated-bare/", { visibility: "authenticated" } ),
        post( "deny", "/deny/", { visibility: "role:__none__" } ),
        post( "draft", "/draft/", { status: "draft" } )
    ] ) );
}

describe( "feeds — sitemap membership (the §8 invariant)", () => {

    it( "includes public records and gated records that have a public teaser", () => {
        const ids = sitemapEntries( repo() ).map( ( e ) => e.record.id ).sort();
        assert.deepEqual( ids, [ "gated-teased", "pub" ] );
    } );

    it( "excludes a gated record with no teaser -- nothing public to index", () => {
        assert.ok( !sitemapEntries( repo() ).some( ( e ) => e.record.id === "gated-bare" ) );
    } );

    it( "excludes hidden records and drafts", () => {
        const ids = sitemapEntries( repo() ).map( ( e ) => e.record.id );
        assert.ok( !ids.includes( "deny" ) );
        assert.ok( !ids.includes( "draft" ) );
    } );

} );

describe( "feeds — sitemap rendering", () => {

    it( "emits absolute canonical URLs inside a urlset", () => {
        const xml = renderSitemap( sitemapEntries( repo() ), BASE );
        assert.ok( xml.startsWith( "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" ) );
        assert.ok( xml.includes( "<urlset" ) );
        assert.ok( xml.includes( "<loc>https://anarandaris.com/pub/</loc>" ) );
        assert.ok( !xml.includes( "/deny/" ) );
    } );

    it( "escapes XML-significant characters in a URL", () => {
        const index = buildIndex( [ post( "amp", "/a&b/" ) ] );
        const xml = renderSitemap( sitemapEntries( new ContentRepository( index ) ), BASE );
        assert.ok( xml.includes( "/a&amp;b/" ) );
        assert.ok( !/\/a&b\//.test( xml ) );
    } );

} );

describe( "feeds — RSS", () => {

    it( "carries only public records -- never a gated teaser or a hidden record", () => {
        const ids = rssItems( repo() ).map( ( i ) => i.record.id );
        assert.deepEqual( ids, [ "pub" ] );
    } );

    it( "renders a channel with escaped item titles and absolute links", () => {
        const index = buildIndex( [ post( "x", "/x/", { title: "A & B <c>" } ) ] );
        const xml = renderRss( rssItems( new ContentRepository( index ) ), { baseUrl: BASE, title: "Site", description: "D" } );
        assert.ok( xml.includes( "<rss" ) && xml.includes( "<channel>" ) );
        assert.ok( xml.includes( "A &amp; B &lt;c&gt;" ) );
        assert.ok( xml.includes( "<link>https://anarandaris.com/x/</link>" ) );
    } );

    it( "limits the item count when asked", () => {
        const index = buildIndex( [ post( "a", "/a/" ), post( "b", "/b/" ), post( "c", "/c/" ) ] );
        assert.equal( rssItems( new ContentRepository( index ), { limit: 2 } ).length, 2 );
    } );

} );

describe( "feeds — robots.txt", () => {

    it( "points at the sitemap and allows crawling by default", () => {
        const txt = renderRobots( { baseUrl: BASE } );
        assert.ok( txt.includes( "User-agent: *" ) );
        assert.ok( txt.includes( "Sitemap: https://anarandaris.com/sitemap.xml" ) );
        assert.ok( txt.includes( "Disallow: /admin/" ) );
    } );

    it( "disallows everything when the site is marked non-indexable (staging)", () => {
        const txt = renderRobots( { baseUrl: BASE, allowIndexing: false } );
        assert.ok( /Disallow: \/\s*$/m.test( txt ) );
        assert.ok( !txt.includes( "Sitemap:" ), "a non-indexable site advertises no sitemap" );
    } );

} );
