/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the page context, generated archives, taxonomy-expanded queries, and pagination parsing.
 *
 * The heaviest invariant here is the one that was proven at the graph level but false at the query level until now:
 * querying a PARENT term must return records tagged with its children. An archive that silently under-reports looks
 * exactly like an archive with nothing in it.
 *
 * The second is that adjacent-post links are resolved for the SAME viewer as the page: computing them from the raw
 * index would let a navigation control point at a record the repository would have withheld, which is the one way
 * prev/next can disclose gated or unpublished work.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const Taxonomy = require( "#taxonomy" );
const { validateRecord } = require( "#schema" );
const { buildPageContext, adjacentPosts, wordCount, archiveHref } = require( "#context" );
const { buildArchiveRecords } = require( "#archives" );
const { parsePageParam } = require( "#content-routes" );

const ANON = { authenticated: false, roles: [] };

const VOCABULARY = {
    world: [
        { id: "anarandaris", slug: { en: "anarandaris", bg: "anarandaris" }, label: { en: "Anarand'aris", bg: "Анаранд'арис" } },
        { id: "dark-intent", slug: { en: "dark-intent", bg: "tamni-namereniya" }, label: { en: "Dark Intent", bg: "Тъмни намерения" } },
        { id: "alexander-dark", parent: "dark-intent", slug: { en: "alexander-dark", bg: "aleksandar-dark" }, label: { en: "Alexander Dark", bg: "Александър Дарк" } }
    ],
    form: [ { id: "short-story", slug: { en: "short-story", bg: "kratka-istoriya" }, label: { en: "Short Story", bg: "Кратка история" } } ]
};

const SITE = {
    defaultLanguage: "en",
    languages: [ "en", "bg" ],
    archives: {
        en: { homePath: "/", homeLabel: "Home", root: "/writings/", label: "Writings", termPath: "/writings/{slug}/" },
        bg: { homePath: "/bg/", homeLabel: "Начало", root: "/bg/writings/", label: "Писания", termPath: "/bg/writings/{slug}/" }
    }
};

function post( id, extra ) {
    return Object.assign( {
        id: id, type: "post", path: "/" + id + "/", lang: "en", title: "Title " + id,
        visibility: "public", status: "published", world: "anarandaris", form: "short-story",
        publishedAt: "2026-03-0" + ( id.length % 9 + 1 ) + "T00:00:00Z"
    }, extra || {} );
}

const taxonomy = new Taxonomy( VOCABULARY );

describe( "queries expand parent terms — the §8 invariant, at the query level", () => {

    const index = buildIndex( [
        post( "child", { world: "alexander-dark" } ),
        post( "parent", { world: "dark-intent" } ),
        post( "sibling", { world: "anarandaris" } )
    ] );

    it( "returns records tagged with a child when the parent is queried", () => {
        const repository = new ContentRepository( index, { taxonomy: taxonomy } );
        const ids = repository.list( { world: "dark-intent" }, ANON ).map( ( item ) => item.record.id ).sort();
        assert.deepEqual( ids, [ "child", "parent" ] );
    } );

    it( "keeps a leaf query exact, and leaves a sibling branch alone", () => {
        const repository = new ContentRepository( index, { taxonomy: taxonomy } );
        assert.deepEqual( repository.list( { world: "alexander-dark" }, ANON ).map( ( i ) => i.record.id ), [ "child" ] );
        assert.deepEqual( repository.list( { world: "anarandaris" }, ANON ).map( ( i ) => i.record.id ), [ "sibling" ] );
    } );

    it( "makes count agree with list, so an archive never miscounts what it shows", () => {
        const repository = new ContentRepository( index, { taxonomy: taxonomy } );
        assert.equal( repository.count( { world: "dark-intent" }, ANON ), 2 );
    } );

    it( "stays exact-match without a taxonomy, so the old behaviour is unchanged", () => {
        const repository = new ContentRepository( index );
        assert.deepEqual( repository.list( { world: "dark-intent" }, ANON ).map( ( i ) => i.record.id ), [ "parent" ] );
    } );

    it( "still matches a term the vocabulary does not know, rather than hiding the record", () => {
        const orphanIndex = buildIndex( [ post( "orphan", { world: "not-in-vocabulary" } ) ] );
        const repository = new ContentRepository( orphanIndex, { taxonomy: taxonomy } );
        assert.equal( repository.list( { world: "not-in-vocabulary" }, ANON ).length, 1 );
    } );

} );

describe( "adjacent posts respect the viewer", () => {

    const index = buildIndex( [
        post( "oldest", { publishedAt: "2026-01-01T00:00:00Z" } ),
        post( "middle", { publishedAt: "2026-02-01T00:00:00Z" } ),
        post( "newest", { publishedAt: "2026-03-01T00:00:00Z" } )
    ] );
    const repository = new ContentRepository( index, { taxonomy: taxonomy } );

    it( "points previous at the older post and next at the newer", () => {
        const middle = repository.getById( "middle", ANON ).record;
        const adjacent = adjacentPosts( middle, repository, ANON );
        assert.equal( adjacent.previous.title, "Title oldest" );
        assert.equal( adjacent.next.title, "Title newest" );
    } );

    it( "omits the side that does not exist rather than linking nowhere", () => {
        const newest = repository.getById( "newest", ANON ).record;
        const adjacent = adjacentPosts( newest, repository, ANON );
        assert.equal( adjacent.next, null );
        assert.ok( adjacent.previous );
    } );

    it( "never links to a record the repository would withhold from this viewer", () => {
        const guarded = buildIndex( [
            post( "visible-older", { publishedAt: "2026-01-01T00:00:00Z" } ),
            post( "hidden-mid", { publishedAt: "2026-02-01T00:00:00Z", visibility: "role:__none__" } ),
            post( "current", { publishedAt: "2026-03-01T00:00:00Z" } )
        ] );
        const guardedRepository = new ContentRepository( guarded, { taxonomy: taxonomy } );
        const current = guardedRepository.getById( "current", ANON ).record;
        const adjacent = adjacentPosts( current, guardedRepository, ANON );
        assert.equal( adjacent.previous.title, "Title visible-older", "the hidden record must be skipped, not linked" );
    } );

} );

describe( "page context", () => {

    // An explicit date here rather than the helper's computed one, so the expectation reads as a fact.
    const index = buildIndex( [ post( "a", { world: "alexander-dark", publishedAt: "2026-03-01T00:00:00Z", body: "word ".repeat( 250 ) } ) ] );
    const repository = new ContentRepository( index, { taxonomy: taxonomy } );
    const record = repository.getById( "a", ANON ).record;
    const context = buildPageContext( record, { repository: repository, taxonomy: taxonomy, site: SITE, viewer: ANON } );

    it( "names the world in the page's own language, not a two-language composite", () => {
        assert.equal( context.eyebrow, "Alexander Dark" );
    } );

    it( "builds the meta line from date, form and a reading length", () => {
        assert.equal( context.meta[ 0 ], "1 March 2026" );
        assert.equal( context.meta[ 1 ], "Short Story" );
        assert.match( context.meta[ 2 ], /^250 words$/ );
    } );

    it( "omits a word count too small to mean anything", () => {
        const brief = buildPageContext( Object.assign( {}, record, { body: "Only a few words here." } ), { taxonomy: taxonomy, site: SITE } );
        assert.equal( brief.meta.length, 2 );
    } );

    it( "links term pills at the archive paths for the record's language", () => {
        assert.deepEqual( context.terms, [
            { label: "Alexander Dark", href: "/writings/alexander-dark/" },
            { label: "Short Story", href: "/writings/short-story/" }
        ] );
    } );

    it( "builds the breadcrumb down to the most specific term", () => {
        assert.deepEqual( context.breadcrumb.map( ( item ) => item.label ), [ "Home", "Writings", "Alexander Dark" ] );
    } );

    it( "uses the Bulgarian archive scheme for a Bulgarian record", () => {
        const bulgarian = Object.assign( {}, record, { lang: "bg" } );
        const bgContext = buildPageContext( bulgarian, { taxonomy: taxonomy, site: SITE } );
        assert.equal( bgContext.eyebrow, "Александър Дарк" );
        assert.equal( bgContext.terms[ 0 ].href, "/bg/writings/aleksandar-dark/" );
        assert.equal( bgContext.breadcrumb[ 0 ].href, "/bg/" );
    } );

    it( "returns nothing for a non-post, which has no article chrome", () => {
        assert.deepEqual( buildPageContext( { type: "page", lang: "en" }, { site: SITE } ), {} );
    } );

    it( "omits what it cannot compute rather than inventing it", () => {
        const bare = buildPageContext( { type: "post", lang: "en", id: "x", title: "T" }, {} );
        assert.equal( bare.terms, undefined );
        assert.equal( bare.breadcrumb, undefined );
        assert.equal( bare.meta, undefined );
    } );

    it( "counts words without counting markdown syntax", () => {
        assert.equal( wordCount( "# Heading\n\nTwo words. {.prose-lead}" ), 3 );
        assert.equal( wordCount( "![alt text](/img.webp)" ), 2 );
        assert.equal( wordCount( "" ), 0 );
    } );

    it( "yields no archive href when the language has no scheme", () => {
        assert.equal( archiveHref( { id: "x" }, "fr", { archives: {} } ), null );
    } );

} );

describe( "generated archive records", () => {

    const records = buildArchiveRecords( taxonomy, {
        archives: SITE.archives, languages: [ "en", "bg" ], defaultLanguage: "en"
    } );

    it( "produces one archive per term per language", () => {
        assert.equal( records.length, ( 3 + 1 ) * 2 );
    } );

    it( "every generated record passes schema validation like any authored one", () => {
        for ( const record of records ) {
            const result = validateRecord( record );
            assert.equal( result.valid, true, `${ record.path }: ${ result.errors.join( "; " ) }` );
        }
    } );

    it( "uses the per-language slug and archive path", () => {
        const paths = records.map( ( record ) => record.path );
        assert.ok( paths.includes( "/writings/alexander-dark/" ) );
        assert.ok( paths.includes( "/bg/writings/aleksandar-dark/" ) );
    } );

    it( "queries the facet it was generated for, paginated", () => {
        const archive = records.find( ( record ) => record.path === "/writings/alexander-dark/" );
        const section = archive.sections[ 0 ];
        assert.equal( section.type, "postList" );
        assert.equal( section.world, "alexander-dark" );
        assert.equal( section.paginated, true );
        assert.equal( section.lang, "en" );
    } );

    it( "generates ids and paths that never collide", () => {
        assert.equal( new Set( records.map( ( r ) => r.id ) ).size, records.length );
        assert.equal( new Set( records.map( ( r ) => r.path ) ).size, records.length );
    } );

    it( "indexes cleanly alongside authored records", () => {
        const index = buildIndex( [ post( "a" ) ].concat( records ) );
        assert.equal( index.invalid.length, 0 );
        assert.equal( index.conflicts.length, 0 );
    } );

    it( "generates nothing without an archive scheme", () => {
        assert.deepEqual( buildArchiveRecords( taxonomy, { archives: {} } ), [] );
        assert.deepEqual( buildArchiveRecords( null, { archives: SITE.archives } ), [] );
    } );

} );

describe( "pagination parameter", () => {

    it( "reads a positive integer", () => {
        assert.equal( parsePageParam( "3" ), 3 );
        assert.equal( parsePageParam( "1" ), 1 );
    } );

    it( "falls back to page one rather than blanking a listing", () => {
        for ( const hostile of [ undefined, "", "0", "-4", "abc", "1e9", "999999999", {}, [] ] ) {
            assert.equal( parsePageParam( hostile ), 1, `${ JSON.stringify( hostile ) } should fall back` );
        }
    } );

} );
