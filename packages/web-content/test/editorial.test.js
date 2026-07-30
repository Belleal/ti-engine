/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the editorial components against Site/docs/markup-contract.md.
 *
 * The load-bearing group is "curated and queried lists are visibility-filtered": a `featured` section holding
 * hand-picked post ids must resolve them through the repository, so a gated item shows its TEASER (never a summary
 * derived from the withheld body) and an unpublished one disappears. An explicit id list looks like it has already
 * cleared the check; it has not.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const Taxonomy = require( "#taxonomy" );
const editorial = require( "#editorial" );
const { renderSection } = require( "#sections" );

const ANON = { authenticated: false, roles: [] };

function post( id, extra ) {
    return Object.assign( {
        id: id, type: "post", path: "/" + id + "/", lang: "en", title: "Title " + id,
        visibility: "public", status: "published", world: "anarandaris", form: "song",
        publishedAt: "2026-03-20T00:00:00Z", summary: "Summary of " + id
    }, extra || {} );
}

function repoWith( records ) {
    return new ContentRepository( buildIndex( records ) );
}

describe( "editorial — prose and verse", () => {

    it( "renders markdown into .prose and escapes embedded HTML", () => {
        const out = editorial.renderProse( { body: "A *word* and <script>x</script>" } ).toString();
        assert.ok( out.startsWith( "<div class=\"prose\">" ) );
        assert.ok( out.includes( "<em>word</em>" ) );
        assert.ok( out.includes( "&lt;script&gt;" ) );
        assert.ok( !out.includes( "<script>" ) );
    } );

    it( "adds .prose-excerpt for the scarlet-ruled variant", () => {
        assert.ok( editorial.renderProse( { body: "x", variant: "excerpt" } ).toString().startsWith( "<div class=\"prose prose-excerpt\">" ) );
    } );

    it( "withholds a dormant html body rather than emitting unsanitised markup", () => {
        // bodyFormat "html" is kept as an escape hatch but never rendered: no importer sanitises it, and a dormant
        // path must be dormant on every route -- content-routes.js withholds it identically.
        const out = editorial.renderProse( { body: "<p onclick=\"evil()\">legacy</p>", bodyFormat: "html" } ).toString();
        assert.equal( out, "<div class=\"prose\"></div>" );
        assert.ok( !out.includes( "onclick" ) );
    } );

    it( "marks the last verse line and breaks the rest", () => {
        const out = editorial.renderVerse( { lines: [ "one", "two", "three" ] } ).toString();
        assert.equal( out, "<p class=\"verse\">one<br>two<br><span class=\"verse-last-line\">three</span></p>" );
    } );

    it( "renders nothing for a verse with no lines", () => {
        assert.equal( editorial.renderVerse( {} ).toString(), "" );
    } );

} );

describe( "editorial — closing and language example", () => {

    it( "renders text, title and the default ornament", () => {
        const out = editorial.renderClosing( { text: "T", closingTitle: "H" } ).toString();
        assert.ok( out.includes( "<p class=\"closing-text\">T</p>" ) );
        assert.ok( out.includes( "<h4 class=\"closing-title\">H</h4>" ) );
        assert.ok( out.includes( "<div class=\"ornament\">◆</div>" ) );
    } );

    it( "renders one block per language example", () => {
        const out = editorial.renderLanguageExample( { examples: [
            { anarandian: "Erod'Sarahoos", translation: "the throne-hall" },
            { anarandian: "Anarand'aris", translation: "the heart of Anarand" }
        ] } ).toString();
        assert.equal( ( out.match( /class="language-example"/g ) || [] ).length, 2 );
        assert.ok( out.includes( "<p class=\"anarandian-text\">Erod&#39;Sarahoos</p>" ) );
        assert.ok( out.includes( "<p class=\"translation-text\">the throne-hall</p>" ) );
    } );

} );

describe( "editorial — lore components carry hue on structure, not on text", () => {

    it( "puts the era hue on the panel and leaves the label untinted", () => {
        const out = editorial.renderAgePanels( { panels: [ { era: "faithless", label: "FA", name: "The Faithless Age" } ] } ).toString();
        assert.ok( out.includes( "<div class=\"age-panel age-faithless\">" ) );
        assert.ok( out.includes( "<p class=\"age-era-label\">FA</p>" ) );
    } );

    it( "rejects an unrecognised era or phase rather than injecting a class", () => {
        assert.ok( editorial.renderAgePanels( { panels: [ { era: "evil\" onload=x", label: "L" } ] } ).toString().includes( "class=\"age-panel\"" ) );
        assert.ok( editorial.renderTimeStrip( { partitions: [ "bogus" ] } ).toString().includes( "class=\"time-strip-partition\"" ) );
    } );

    it( "renders the time strip track and legend", () => {
        const out = editorial.renderTimeStrip( { label: "Sixteen partitions", partitions: [ "daylight", "blood" ], phaseLabels: [ "Daylight", "Blood" ] } ).toString();
        assert.ok( out.includes( "<div class=\"time-strip-partition phase-daylight\"></div>" ) );
        assert.ok( out.includes( "<span class=\"time-strip-phase\">Daylight</span>" ) );
    } );

    it( "renders the timeline as an ordered list with a major modifier", () => {
        const out = editorial.renderTimeline( { events: [ { date: "FA 1", title: "The breach", major: true }, { date: "ALA 402", title: "Abandoned" } ] } ).toString();
        assert.ok( out.startsWith( "<ol class=\"timeline\">" ) );
        assert.ok( out.includes( "<li class=\"timeline-entry timeline-entry-major\">" ) );
        assert.ok( out.includes( "<li class=\"timeline-entry\">" ) );
        assert.ok( out.includes( "<h4 class=\"timeline-event-title\">The breach</h4>" ) );
    } );

    it( "renders character cards with a validated accent", () => {
        const out = editorial.renderCharacterCards( { cards: [ { name: "Ra'maen", accent: "scarlet", quote: "Q" }, { name: "X", accent: "bogus" } ] } ).toString();
        assert.ok( out.includes( "<article class=\"character-card card-accent-scarlet\">" ) );
        assert.ok( out.includes( "<article class=\"character-card card-accent-neutral\">" ) );
        assert.ok( out.includes( "<p class=\"character-quote\">Q</p>" ) );
    } );

} );

describe( "editorial — media", () => {

    it( "renders the hero with an accent span and h1 only when it opens the document", () => {
        const asPrimary = editorial.renderHero( { title: "The", titleAccent: "Scarlet", primary: true } ).toString();
        assert.ok( asPrimary.includes( "<h1 class=\"hero-title\">The <span class=\"accent\">Scarlet</span></h1>" ) );
        const asSection = editorial.renderHero( { title: "The", titleAccent: "Scarlet" } ).toString();
        assert.ok( asSection.includes( "<h2 class=\"hero-title\">" ) );
    } );

    it( "renders gallery figures with a caption and always an alt attribute", () => {
        const out = editorial.renderGallery( { images: [ { src: "/a.webp", caption: "Movement I" }, { src: "/b.webp", alt: "B" } ] } ).toString();
        assert.ok( out.includes( "<figure class=\"gallery-item\"><img src=\"/a.webp\" alt=\"\"><figcaption class=\"gallery-caption\">Movement I</figcaption></figure>" ) );
        assert.ok( out.includes( "alt=\"B\"" ) );
    } );

    it( "renders an accessible audio player with no inline width", () => {
        const out = editorial.renderAudio( { title: "Preview", src: "/p.mp3", duration: "0:30" } ).toString();
        assert.ok( out.includes( "<button class=\"audio-play\" type=\"button\" aria-label=\"Play preview\">▶</button>" ) );
        assert.ok( out.includes( "<div class=\"audio-rail\"><div class=\"audio-rail-progress\"></div></div>" ) );
        assert.ok( out.includes( "data-src=\"/p.mp3\"" ) );
        assert.ok( !/\sstyle=/.test( out ) );
    } );

} );

describe( "editorial — curated and queried lists are visibility-filtered", () => {

    const repository = repoWith( [
        post( "pub" ),
        post( "gated", { visibility: "authenticated", teaser: "A glimpse behind the veil.", summary: "LEAKED SUMMARY" } ),
        post( "deny", { visibility: "role:__none__" } ),
        post( "draft", { status: "draft" } )
    ] );
    const context = { repository: repository, viewer: ANON };

    it( "drops hidden, draft and unknown ids from a curated featured list", () => {
        const out = editorial.renderFeatured( { items: [ "pub", "deny", "draft", "missing" ] }, context ).toString();
        assert.ok( out.includes( "Title pub" ) );
        for ( const absent of [ "Title deny", "Title draft" ] ) {
            assert.ok( !out.includes( absent ), `${ absent } must not appear` );
        }
    } );

    it( "shows a gated item's teaser and NEVER its summary", () => {
        const out = editorial.renderFeatured( { items: [ "gated" ] }, context ).toString();
        assert.ok( out.includes( "A glimpse behind the veil." ) );
        assert.ok( !out.includes( "LEAKED SUMMARY" ), "a summary may be derived from the withheld body" );
    } );

    it( "renders the curated row variant as highlight cards", () => {
        const out = editorial.renderFeatured( { items: [ "pub" ], variant: "cards" }, context ).toString();
        assert.ok( out.startsWith( "<div class=\"highlight-cards\">" ) );
        assert.ok( out.includes( "<h4 class=\"highlight-title\"><a href=\"/pub/\">Title pub</a></h4>" ) );
    } );

    it( "renders a static announcement card when no ids are given", () => {
        const out = editorial.renderFeatured( { cardTitle: "T", body: "B" }, {} ).toString();
        assert.equal( out, "<div class=\"featured-card\"><h4 class=\"featured-card-title\">T</h4><p class=\"featured-card-body\">B</p></div>" );
    } );

    it( "postList lists only what the viewer may see", () => {
        const out = editorial.renderPostList( { limit: 10 }, context ).toString();
        assert.ok( out.includes( "Title pub" ) );
        assert.ok( out.includes( "Title gated" ), "gated records stay listable as teasers" );
        assert.ok( !out.includes( "Title deny" ) );
        assert.ok( !out.includes( "Title draft" ) );
        assert.ok( !out.includes( "LEAKED SUMMARY" ) );
    } );

    it( "renders nothing rather than an empty grid when a query matches nothing", () => {
        assert.equal( editorial.renderPostList( { world: "nonexistent" }, context ).toString(), "" );
    } );

    it( "resolves taxonomy labels for the card term line when a vocabulary is available", () => {
        const taxonomy = new Taxonomy( { world: [ { id: "anarandaris", label: { en: "Anarand'aris" } } ], form: [ { id: "song", label: { en: "Song" } } ] } );
        const out = editorial.renderPostList( {}, { repository: repository, viewer: ANON, taxonomy: taxonomy } ).toString();
        assert.ok( out.includes( "Anarand&#39;aris · Song" ) );
    } );

} );

describe( "editorial — pagination", () => {

    it( "marks the current page with aria-current and never links it", () => {
        const out = editorial.renderPagination( 2, 4, {} ).toString();
        assert.ok( out.includes( "<span class=\"pagination-link pagination-current\" aria-current=\"page\">2</span>" ) );
        assert.ok( out.includes( "href=\"?page=1\"" ) );
        assert.ok( out.includes( "href=\"?page=3\"" ) );
    } );

    it( "disables prev on the first page and next on the last", () => {
        assert.ok( editorial.renderPagination( 1, 3, {} ).toString().includes( "pagination-link pagination-disabled" ) );
        assert.ok( editorial.renderPagination( 3, 3, {} ).toString().includes( "pagination-link pagination-disabled" ) );
    } );

    it( "renders nothing for a single page", () => {
        assert.equal( editorial.renderPagination( 1, 1, {} ).toString(), "" );
    } );

} );

describe( "editorial — capture form", () => {

    it( "includes the CSRF token, without which the framework rejects the post", () => {
        const out = editorial.renderCapture( { purpose: "newsletter" }, { csrfToken: "tok123" } ).toString();
        assert.ok( out.includes( "<input type=\"hidden\" name=\"csrfToken\" value=\"tok123\">" ) );
    } );

    it( "carries the capture schema's hidden fields and an unticked consent box", () => {
        const out = editorial.renderCapture( { purpose: "preorder:x", edition: "hardcover" }, { lang: "bg", source: "itp-fpf" } ).toString();
        assert.ok( out.includes( "name=\"purpose\" value=\"preorder:x\"" ) );
        assert.ok( out.includes( "name=\"edition\" value=\"hardcover\"" ) );
        assert.ok( out.includes( "name=\"source\" value=\"itp-fpf\"" ) );
        assert.ok( out.includes( "name=\"locale\" value=\"bg\"" ) );
        assert.ok( out.includes( "type=\"checkbox\" name=\"consent\"" ) );
        assert.ok( !out.includes( "checked" ), "consent is never pre-ticked" );
    } );

    it( "puts field-invalid on the field and wires aria-describedby to the error", () => {
        const out = editorial.renderCapture( { invalid: true, errorMessage: "Bad address" }, {} ).toString();
        assert.ok( out.includes( "class=\"field field-invalid\"" ) );
        assert.ok( out.includes( "aria-invalid=\"true\"" ) );
        // Asserted as a RELATIONSHIP, not a literal id: what matters is that the input points at the error element
        // that actually exists, whatever it ends up being called.
        const described = out.match( /aria-describedby="([^"]+)"/ );
        assert.ok( described, "the invalid input must reference its error" );
        assert.ok( out.includes( `<span class="field-error" id="${ described[ 1 ] }">` ), "aria-describedby must name a real element" );
    } );

    it( "gives two unnamed capture forms on one page distinct ids", () => {
        // Sharing an id makes every label and aria-describedby point at the first form, so clicking the second
        // form's label focuses the first form's input.
        const context = {};
        const first = editorial.renderCapture( {}, context ).toString();
        const second = editorial.renderCapture( {}, context ).toString();
        const idOf = ( out ) => ( out.match( /id="(capture[^"]*-email)"/ ) || [] )[ 1 ];
        assert.ok( idOf( first ) );
        assert.notEqual( idOf( first ), idOf( second ) );
    } );

    it( "restarts the numbering for each page, so the same page renders identically twice", () => {
        // A module-level counter would make two renders of one page differ, which is what breaks a shared cache.
        const render = () => editorial.renderCapture( {}, {} ).toString();
        assert.equal( render(), render() );
    } );

    it( "renders a duplicate status distinctly from an error", () => {
        assert.ok( editorial.renderFormStatus( "duplicate", "Already signed up", "x" ).toString().includes( "form-status form-status-duplicate" ) );
        assert.ok( editorial.renderFormStatus( "error", "T", "x" ).toString().includes( "form-status form-status-error" ) );
        assert.equal( editorial.renderFormStatus( "bogus", "T", "x" ).toString(), "" );
    } );

} );

describe( "editorial — dictionary", () => {

    const entries = [
        { headword: "Adai", transliteration: "адаи", role: "pronoun, relative", gloss: "Which; Who; That", pronunciation: "a.ˈdai",
          forms: { caption: "Pronouns", columns: [ "Singular", "Plural" ], rows: [ { header: "Nominative", cells: [ "adai", "adain" ] } ] } },
        { headword: "Belor", role: "noun", gloss: "Stone" }
    ];

    const out = editorial.renderDictionary( { entries: entries }, {} ).toString();

    it( "makes the header bar a real button with aria-expanded and aria-controls", () => {
        assert.ok( out.includes( "<button class=\"dictionary-entry-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"entry-adai\">" ) );
        assert.ok( out.includes( "<div class=\"dictionary-entry-detail\" id=\"entry-adai\" hidden>" ) );
    } );

    it( "marks an entry carrying a declension table as rich, with the diamond marker", () => {
        assert.ok( out.includes( "class=\"dictionary-entry dictionary-entry-rich\" data-role=\"pronoun, relative\"" ) );
        assert.ok( out.includes( "<span class=\"dictionary-marker\" aria-hidden=\"true\">◇</span>" ) );
        assert.ok( out.includes( "class=\"dictionary-entry\" data-role=\"noun\"" ), "a plain entry is not marked rich" );
    } );

    it( "gives every form cell a data-label so the mobile stack needs no duplicated text", () => {
        assert.ok( out.includes( "<td data-label=\"Singular\">adai</td>" ) );
        assert.ok( out.includes( "<td data-label=\"Plural\">adain</td>" ) );
    } );

    it( "groups by letter with data-letter, and marks index letters with no entries", () => {
        assert.ok( out.includes( "<div class=\"dictionary-group\" data-letter=\"A\">" ) );
        assert.ok( out.includes( "<div class=\"dictionary-group\" data-letter=\"B\">" ) );
        assert.ok( out.includes( "data-letter=\"C\"" ) );
        assert.ok( out.includes( "dictionary-index-link-empty\" data-letter=\"C\"" ) );
    } );

    it( "reports the whole lexicon in the count, not the rows in view", () => {
        assert.ok( out.includes( "<p class=\"dictionary-count\">2 entries</p>" ) );
    } );

    it( "labels the unlabelled controls with aria-label only", () => {
        assert.ok( out.includes( "<input class=\"dictionary-search\" type=\"search\" aria-label=" ) );
        assert.ok( out.includes( "<select class=\"dictionary-select\" aria-label=" ) );
    } );

} );

describe( "editorial — no component emits a style attribute", () => {

    it( "holds across every section type rendered with representative data", () => {
        const samples = [
            { type: "hero", title: "T", titleAccent: "A", background: "abyss", scrollHint: "Descend ↓" },
            { type: "prose", body: "x" },
            { type: "verse", lines: [ "a", "b" ] },
            { type: "characterCards", cards: [ { name: "N", accent: "gold", image: "/i.webp" } ] },
            { type: "audio", title: "T", src: "/a.mp3" },
            { type: "languageExample", anarandian: "A", translation: "T" },
            { type: "agePanels", panels: [ { era: "lasthope", label: "L" } ] },
            { type: "timeStrip", partitions: [ "dark" ], phaseLabels: [ "Dark" ] },
            { type: "timeline", events: [ { date: "D", title: "T" } ] },
            { type: "gallery", images: [ { src: "/i.webp", caption: "C" } ] },
            { type: "capture", purpose: "newsletter" },
            { type: "featured", cardTitle: "T", body: "B" },
            { type: "closing", text: "T", closingTitle: "H" },
            { type: "dictionary", entries: [ { headword: "A", gloss: "g" } ] }
        ];
        for ( const sample of samples ) {
            const rendered = renderSection( sample, { csrfToken: "t" } ).toString();
            assert.ok( !/\sstyle=/.test( rendered ), `${ sample.type } emitted a style attribute` );
            assert.ok( rendered.length > 0, `${ sample.type } rendered nothing` );
        }
    } );

} );
