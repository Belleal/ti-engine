/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the shell, the page templates, and full document assembly.
 *
 * Three things here would fail silently in production:
 *   - a script tag emitted without the nonce simply never executes under `'strict-dynamic'`;
 *   - a gated record whose template reads `visibility` itself would drift from the repository's verdict;
 *   - a 404 that says *why* it is a 404 leaks precisely what deny-by-default exists to hide.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const shell = require( "#shell" );
const templates = require( "#templates" );
const { renderDocument, renderStateDocument } = require( "#page" );

const SITE = {
    title: "Boris Khan Writes",
    logo: "/static/logo.png",
    languages: [ "en", "bg" ],
    defaultLanguage: "en",
    signInPath: "/login/local",
    registerPath: "/register",
    nav: [ { label: "Story World", href: "/story-world/" }, { label: "Writings", href: "/writings/" } ],
    footer: {
        columns: [ { heading: "Content", links: [ { label: "Writings", href: "/writings/" } ] } ],
        tagline: "Personal site of fantasy author Boris Khan",
        social: [ { label: "Goodreads", href: "https://example.com" } ],
        legal: "All rights reserved © 2026"
    }
};

function post( extra ) {
    return Object.assign( {
        id: "p", type: "post", path: "/2026/03/20/slug/", lang: "en", title: "A Deal You Can't Refuse",
        visibility: "public", status: "published", world: "dark-intent", form: "short-story",
        seo: { description: "D" }, body: "The coffee repaid the wait."
    }, extra || {} );
}

const BASE_CONTEXT = { site: SITE, baseUrl: "https://boriskhan.com", mode: "full", lang: "en", path: "/2026/03/20/slug/" };

describe( "shell — language selector", () => {

    it( "links the counterpart when a translation exists", () => {
        const out = shell.renderLangSelect( Object.assign( {}, BASE_CONTEXT, {
            counterpart: { lang: "bg", path: "/bg/2026/03/20/slug/" }
        } ) ).toString();
        assert.ok( out.includes( "<a class=\"lang-select-option\" href=\"/bg/2026/03/20/slug/\">Български</a>" ) );
        assert.ok( out.includes( "lang-select-option-current" ) );
    } );

    it( "renders an inert option that says why, when there is no counterpart", () => {
        const out = shell.renderLangSelect( BASE_CONTEXT ).toString();
        assert.ok( out.includes( "lang-select-option-unavailable" ) );
        assert.ok( out.includes( "not on this page" ) );
        // The absent language must be neither hidden nor linked to a path that would 404.
        assert.ok( out.includes( "Български" ) );
        assert.ok( !out.includes( "href=\"/bg/" ) );
    } );

    it( "renders nothing for a single-language site", () => {
        const single = Object.assign( {}, BASE_CONTEXT, { site: Object.assign( {}, SITE, { languages: [ "en" ] } ) } );
        assert.equal( shell.renderLangSelect( single ).toString(), "" );
    } );

} );

describe( "shell — topbar and footer are configured, never hard-coded", () => {

    it( "renders the configured brand and nav, marking the current entry", () => {
        const out = shell.renderTopbar( Object.assign( {}, BASE_CONTEXT, { path: "/writings/" } ) ).toString();
        assert.ok( out.includes( "<p class=\"topbar-title\">Boris Khan Writes</p>" ) );
        assert.ok( out.includes( "<a class=\"topbar-link topbar-link-current\" href=\"/writings/\" aria-current=\"page\">Writings</a>" ) );
        assert.ok( out.includes( "<a class=\"topbar-link\" href=\"/story-world/\">Story World</a>" ) );
    } );

    it( "keeps a section marked while reading a page beneath it", () => {
        assert.equal( shell.isCurrentPath( "/writings/", "/writings/some-post/" ), true );
        assert.equal( shell.isCurrentPath( "/", "/writings/" ), false, "root must not match everything" );
    } );

    it( "renders an empty shell for an unconfigured site rather than inventing content", () => {
        const out = shell.renderTopbar( {} ).toString() + shell.renderFooter( {} ).toString();
        assert.ok( !out.includes( "Boris" ) );
        assert.ok( out.includes( "<header class=\"topbar\">" ) );
    } );

    it( "renders the footer columns, tagline, social and legal line", () => {
        const out = shell.renderFooter( BASE_CONTEXT ).toString();
        assert.ok( out.includes( "<p class=\"footer-heading\">Content</p>" ) );
        assert.ok( out.includes( "<p class=\"footer-tagline\">Personal site of fantasy author Boris Khan</p>" ) );
        assert.ok( out.includes( "<div class=\"footer-social\">" ) );
        assert.ok( out.includes( "<p class=\"footer-legal\">All rights reserved © 2026</p>" ) );
    } );

} );

describe( "templates — the article", () => {

    it( "renders header, prose body and the article wrapper", () => {
        const out = templates.renderPost( post(), BASE_CONTEXT ).toString();
        assert.ok( out.includes( "<article class=\"section bg-abyss\">" ) );
        assert.ok( out.includes( "<h1 class=\"post-title\">A Deal You Can&#39;t Refuse</h1>" ) );
        assert.ok( out.includes( "<div class=\"prose\">" ) );
        assert.ok( out.includes( "The coffee repaid the wait." ) );
    } );

    it( "renders the breadcrumb only when something precedes the record", () => {
        assert.ok( !templates.renderPost( post(), BASE_CONTEXT ).toString().includes( "breadcrumb" ) );
        const withTrail = Object.assign( {}, BASE_CONTEXT, { breadcrumb: [ { label: "Home", href: "/" }, { label: "Writings", href: "/writings/" } ] } );
        const out = templates.renderPost( post(), withTrail ).toString();
        assert.ok( out.includes( "<li class=\"breadcrumb-item\"><a href=\"/\">Home</a></li>" ) );
        assert.ok( out.includes( "breadcrumb-current\" aria-current=\"page\">A Deal You Can&#39;t Refuse</li>" ) );
    } );

    it( "renders the meta line dot-separated, with separators hidden from assistive tech", () => {
        const out = templates.renderPostHeader( post(), Object.assign( {}, BASE_CONTEXT, { meta: [ "23 July 2026", "Short story" ] } ) ).toString();
        assert.ok( out.includes( "<span>23 July 2026</span><span class=\"post-meta-sep\" aria-hidden=\"true\">·</span><span>Short story</span>" ) );
    } );

    it( "renders only the side of post-nav that exists", () => {
        const out = templates.renderPostNav( { previous: { path: "/a/", title: "Earlier" } } ).toString();
        assert.ok( out.includes( "post-nav-prev" ) );
        assert.ok( !out.includes( "post-nav-next" ) );
        assert.equal( templates.renderPostNav( {} ).toString(), "" );
    } );

    it( "renders term pills with an optional count", () => {
        const out = templates.renderTermPills( post(), Object.assign( {}, BASE_CONTEXT, {
            terms: [ { label: "Alexander Dark", href: "/writings/alexander-dark/", count: 14 } ]
        } ) ).toString();
        assert.ok( out.includes( "<a class=\"term-pill\" href=\"/writings/alexander-dark/\">Alexander Dark <span class=\"term-pill-count\">14</span></a>" ) );
    } );

} );

describe( "templates — the gate", () => {

    const gatedContext = Object.assign( {}, BASE_CONTEXT, {
        mode: "teaser",
        labels: { gateTitle: "The rest of the chapter is yours", gateBody: "Sign in and it opens in full." }
    } );

    it( "shows the teaser with its fade, and both doors", () => {
        const out = templates.renderPost( post( { teaser: "A glimpse behind the veil." } ), gatedContext ).toString();
        assert.ok( out.includes( "<div class=\"gate-teaser\">" ) );
        assert.ok( out.includes( "A glimpse behind the veil." ) );
        assert.ok( out.includes( "<div class=\"gate-cut\" aria-hidden=\"true\"></div>" ) );
        assert.ok( out.includes( "<h2 class=\"gate-title\">The rest of the chapter is yours</h2>" ) );
        assert.ok( out.includes( "btn btn-accept" ) && out.includes( "btn btn-deny" ) );
    } );

    it( "never renders the withheld body in teaser mode", () => {
        const out = templates.renderPost( post( { body: "THE WITHHELD BODY", teaser: "A glimpse." } ), gatedContext ).toString();
        assert.ok( !out.includes( "THE WITHHELD BODY" ) );
    } );

    it( "renders the gate for a composed record too", () => {
        const record = { id: "b", type: "book", path: "/b/", lang: "en", title: "B", visibility: "authenticated", status: "published", sections: [ { type: "prose", body: "SECRET" } ], teaser: "Peek." };
        const out = templates.renderComposed( record, gatedContext ).toString();
        assert.ok( out.includes( "gate-panel" ) );
        assert.ok( !out.includes( "SECRET" ) );
    } );

} );

describe( "templates — composed records", () => {

    it( "dispatches sections and scopes a per-release palette on the article", () => {
        const record = { id: "r", type: "release", path: "/r/", lang: "en", title: "R", visibility: "public", status: "published",
            theme: "scarlet-requiem", releaseState: "prerelease",
            sections: [ { type: "prose", body: "Body." }, { type: "closing", text: "End." } ] };
        const out = templates.renderComposed( record, BASE_CONTEXT ).toString();
        assert.ok( out.includes( "<article class=\"theme-scarlet-requiem\" data-release-state=\"prerelease\">" ) );
        assert.ok( out.includes( "section section-prose" ) );
        assert.ok( out.includes( "section section-closing" ) );
    } );

} );

describe( "page — document assembly", () => {

    const context = Object.assign( {}, BASE_CONTEXT, {
        nonce: "NONCE123",
        assets: { stylesheets: [ "/static/anarand.css" ], scripts: [ "/static/web-content.js" ], preloadFonts: [ "/static/fonts/spectral-500.woff2" ] }
    } );

    const out = renderDocument( post(), context );

    it( "emits a complete document in shell order", () => {
        assert.ok( out.startsWith( "<!DOCTYPE html>\n<html lang=\"en\">" ) );
        const body = out.indexOf( "<body" );
        assert.ok( out.indexOf( "noise-layer" ) > body );
        assert.ok( out.indexOf( "noise-layer" ) < out.indexOf( "skip-link" ) );
        assert.ok( out.indexOf( "skip-link" ) < out.indexOf( "<header class=\"topbar\">" ) );
        assert.ok( out.indexOf( "<main id=\"content\">" ) < out.indexOf( "<footer class=\"site-footer\">" ) );
        assert.ok( out.trimEnd().endsWith( "</html>" ) );
    } );

    it( "gives every script and stylesheet the nonce — without it, strict-dynamic silently blocks them", () => {
        assert.ok( out.includes( "<script src=\"/static/web-content.js\" nonce=\"NONCE123\" defer></script>" ) );
        assert.ok( out.includes( "<link rel=\"stylesheet\" href=\"/static/anarand.css\" nonce=\"NONCE123\">" ) );
    } );

    it( "nonces the JSON-LD block too — a data block CSP might otherwise drop silently", () => {
        const scripts = out.match( /<script[^>]*>/g ) || [];
        assert.ok( scripts.length >= 2, "expected the site script and the JSON-LD block" );
        assert.ok( scripts.every( ( tag ) => tag.includes( "nonce=\"NONCE123\"" ) ), "every script tag must carry the nonce" );
    } );

    it( "preloads the declared fonts with crossorigin", () => {
        assert.ok( out.includes( "<link rel=\"preload\" href=\"/static/fonts/spectral-500.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>" ) );
    } );

    it( "includes the composed head — canonical and title", () => {
        assert.ok( out.includes( "<link rel=\"canonical\" href=\"https://boriskhan.com/2026/03/20/slug/\">" ) );
        assert.ok( out.includes( "<title>A Deal You Can&#39;t Refuse</title>" ) );
    } );

    it( "scopes a per-release palette on the body when the record declares one", () => {
        const themed = renderDocument( post( { theme: "scarlet-requiem" } ), context );
        assert.ok( themed.includes( "<body class=\"theme-scarlet-requiem\">" ) );
    } );

    it( "emits no style attribute anywhere in the document", () => {
        assert.ok( !/\sstyle=/.test( out ) );
    } );

} );

describe( "page — the state document", () => {

    it( "renders a 404 that does not reveal which kind of miss it was", () => {
        const out = renderStateDocument( {
            title: "Not found",
            body: "That path does not lead anywhere on this site.",
            actions: [ { href: "/", label: "Back to the beginning" } ]
        }, { site: SITE, nonce: "N" } );
        assert.ok( out.includes( "<h1 class=\"state-title\">Not found</h1>" ) );
        assert.ok( out.includes( "<meta name=\"robots\" content=\"noindex,follow\">" ) );
        // Check the visible copy, not the markup: `aria-hidden` is an attribute, not a disclosure.
        const copy = out.replace( /<[^>]+>/g, " " ).toLowerCase();
        for ( const leak of [ "draft", "unpublished", "hidden", "private", "gated", "exists" ] ) {
            assert.ok( !copy.includes( leak ), `404 copy must not mention "${ leak }"` );
        }
    } );

    it( "still renders the full shell so a 404 is a real page", () => {
        const out = renderStateDocument( { title: "Not found" }, { site: SITE } );
        assert.ok( out.includes( "<header class=\"topbar\">" ) );
        assert.ok( out.includes( "<footer class=\"site-footer\">" ) );
    } );

} );
