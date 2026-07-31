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
const { buildPageContext, adjacentPosts, wordCount, archiveHref, ARCHIVE_FACETS, formatDate, localeFor } = require( "#context" );
const { buildArchiveRecords } = require( "#archives" );
const { termArchivePath, termLabel } = require( "#terms" );
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
    // A REGION has to be configured to get one. Without this the engine formats with the bare language tag, which
    // for English means the American order -- correct for "en", just not what a British-English site wants.
    locales: { en: "en-GB", bg: "bg-BG" },
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

/*
 * A mistyped locale must not take the page down.
 *
 * `Intl` answers a malformed tag by throwing -- "en-G" is a RangeError, not a fallback -- and these tags come from
 * site configuration, where a typo in a region subtag is one keystroke away. Unguarded it is not a cosmetic problem:
 * every page and every post card in that language renders as a 500.
 */
describe( "locale resolution — a malformed configured locale never reaches Intl", () => {

    const MALFORMED = [ "en-G", "en_GB", "en-GB-x", "", " ", 42, {}, [ "en-GB" ] ];

    it( "honours a valid configured locale, region and all", () => {
        assert.equal( localeFor( "en", SITE ), "en-GB" );
        assert.equal( localeFor( "bg", SITE ), "bg-BG" );
    } );

    it( "falls back to the bare language tag rather than demoting the language to English", () => {
        // A typo in the REGION is not a reason to start formatting Bulgarian dates in English: `bg` alone is correct.
        assert.equal( localeFor( "bg", { locales: { bg: "bg-B" } } ), "bg" );
        assert.equal( formatDate( "2026-03-01T00:00:00Z", localeFor( "bg", { locales: { bg: "bg-B" } } ) ), "1 март 2026 г." );
    } );

    it( "reaches English only when the language tag is unusable too", () => {
        assert.equal( localeFor( "q", { locales: { q: "q-QQ" } } ), "en" );
        assert.equal( localeFor( "", {} ), "en" );
        assert.equal( localeFor( undefined, undefined ), "en" );
    } );

    it( "always answers with something Intl accepts, whatever the configuration says", () => {
        for ( const hostile of MALFORMED ) {
            const resolved = localeFor( "en", { locales: { en: hostile } } );
            assert.doesNotThrow( () => new Date().toLocaleDateString( resolved ), `date: ${ JSON.stringify( hostile ) }` );
            assert.doesNotThrow( () => ( 250 ).toLocaleString( resolved ), `number: ${ JSON.stringify( hostile ) }` );
        }
    } );

    it( "formats a date in English rather than throwing when handed an unusable locale directly", () => {
        for ( const hostile of MALFORMED ) {
            assert.equal( formatDate( "2026-03-01T00:00:00Z", hostile ), "March 1, 2026", JSON.stringify( hostile ) );
        }
        assert.equal( formatDate( "not-a-date", "en-G" ), "" );
    } );

    it( "renders the whole page context — date and word count both — on a mistyped configuration", () => {
        const broken = Object.assign( {}, SITE, { locales: { en: "en-G", bg: "bg_BG" } } );
        const record = post( "a", { publishedAt: "2026-03-01T00:00:00Z", body: "word ".repeat( 250 ) } );
        const context = buildPageContext( record, { taxonomy: taxonomy, site: broken } );
        assert.equal( context.meta[ 0 ], "March 1, 2026" );
        assert.match( context.meta[ 2 ], /^250 words$/ );
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

/*
 * One term-resolution helper, consumed by generation and by rendering.
 *
 * A generated archive record's `path` IS the URL a reader lands on; a rendered pill's `href` has to be that same
 * string or the link 404s. Two private copies of "which slug, in which language, falling back to what" is a
 * broken-link generator with a delay fuse -- and it had already gone off: the per-facet `termPath` form was
 * understood only by the generator, so rendering emitted `[object Object]` for every pill on a site using it.
 *
 * These assert the agreement itself rather than either side's output, which is the only assertion that keeps holding
 * when the fallback chain is next changed.
 */
describe( "term resolution — a generated archive path and a rendered href are the same string", () => {

    // The escape hatch for two vocabularies that share a slug: a namespace per facet rather than one flat one.
    const FACETED = {
        defaultLanguage: "en",
        archives: {
            en: { root: "/writings/", termPath: { world: "/writings/worlds/{slug}/", form: "/writings/forms/{slug}/" } }
        }
    };

    function generatedPaths( site, lang ) {
        const records = buildArchiveRecords( taxonomy, {
            archives: site.archives, languages: [ lang ], defaultLanguage: site.defaultLanguage
        } );
        return new Map( records.map( ( record ) => [ record.id, record.path ] ) );
    }

    it( "agrees on every term of every facet in every language, for a shared namespace", () => {
        for ( const lang of [ "en", "bg" ] ) {
            const paths = generatedPaths( SITE, lang );
            for ( const facet of ARCHIVE_FACETS ) {
                for ( const term of taxonomy.terms( facet ) ) {
                    const generated = paths.get( "archive-" + lang + "-" + facet + "-" + term.id );
                    assert.equal( archiveHref( term, lang, SITE, facet ), generated, `${ facet }/${ term.id } (${ lang })` );
                }
            }
        }
    } );

    it( "agrees when the namespace is per facet — the form only the generator used to understand", () => {
        const paths = generatedPaths( FACETED, "en" );
        assert.ok( paths.size, "the faceted fixture must generate something to compare against" );
        for ( const facet of ARCHIVE_FACETS ) {
            for ( const term of taxonomy.terms( facet ) ) {
                const href = archiveHref( term, "en", FACETED, facet );
                assert.equal( href, paths.get( "archive-en-" + facet + "-" + term.id ), `${ facet }/${ term.id }` );
                assert.doesNotMatch( String( href ), /\[object/, "a stringified config object is not a URL" );
            }
        }
    } );

    it( "yields no href rather than a link to the wrong archive when the facet is unknown", () => {
        assert.equal( archiveHref( { id: "x" }, "en", FACETED ), null );
        assert.equal( archiveHref( { id: "x" }, "en", FACETED, "genre" ), null );
    } );

    it( "falls back to the default-language slug, then to the raw id, so a term stays reachable", () => {
        const partial = { id: "untranslated", slug: { en: "untranslated" }, label: { en: "Untranslated" } };
        assert.equal( termArchivePath( "/writings/{slug}/", partial, "bg", "en" ), "/writings/untranslated/" );
        assert.equal( termArchivePath( "/writings/{slug}/", { id: "bare" }, "bg", "en" ), "/writings/bare/" );
        assert.equal( archiveHref( partial, "bg", SITE ), "/bg/writings/untranslated/" );
    } );

    it( "labels a term the same way on both sides, down to the id fallback", () => {
        const records = buildArchiveRecords( taxonomy, { archives: SITE.archives, languages: [ "bg" ], defaultLanguage: "en" } );
        const archive = records.find( ( record ) => record.id === "archive-bg-world-alexander-dark" );
        const term = taxonomy.resolve( "world", "alexander-dark" );
        assert.equal( archive.title, termLabel( term, "bg" ) );
        assert.equal( termLabel( { id: "unlabelled" }, "bg" ), "unlabelled" );
        assert.equal( termLabel( null, "bg" ), "" );
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

/*
 * The engine must not know which regions a site uses. It used to: `lang === "bg" ? "bg-BG" : "en-GB"` encoded one
 * site's two languages as a fact about the package, and quietly gave British formatting to every other language it
 * was ever handed.
 */
describe( "page context — the locale comes from configuration, not from the engine", () => {

    const dated = ( lang, site ) => buildPageContext(
        Object.assign( post( "d" ), { lang: lang, publishedAt: "2026-03-01T09:00:00.000Z" } ),
        { site: site }
    ).meta[ 0 ];

    it( "uses a configured region", () => {
        assert.equal( dated( "en", { locales: { en: "en-GB" } } ), "1 March 2026" );
        assert.equal( dated( "en", { locales: { en: "en-US" } } ), "March 1, 2026" );
    } );

    it( "falls back to the language itself rather than to somebody else's region", () => {
        // A bare tag is a valid locale and formats that language correctly. Defaulting to en-GB instead would give
        // a French page British date order -- wrong in a way that looks deliberate.
        assert.equal( dated( "fr", {} ), "1 mars 2026" );
        assert.equal( dated( "bg", {} ), "1 март 2026 г." );
    } );

    it( "formats the date and the word count in the same locale", () => {
        // 25 000 rather than 2 500 on purpose: bg-BG does not group a four-digit number, so the smaller value is
        // identical in both locales and would prove nothing.
        const count = ( locale ) => buildPageContext(
            Object.assign( post( "d" ), { lang: "bg", publishedAt: "2026-03-01T09:00:00.000Z", body: "дума ".repeat( 25000 ) } ),
            { site: { locales: { bg: locale } } }
        ).meta.slice( -1 )[ 0 ];
        // Resolved once, so a line cannot carry a Bulgarian date beside an English-grouped number.
        // The separator is written as an escape: bg-BG groups with U+00A0, and a literal one here is invisible in
        // a diff and indistinguishable from a plain space to anyone reading the test.
        assert.match( count( "bg-BG" ), /25\u00a0000/, "the configured locale must reach the word count too" );
        assert.match( count( "en-GB" ), /25,000/ );
    } );

} );
