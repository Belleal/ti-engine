/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Unit + repo-state guards for the User Guide build pipeline (bin/build/build-user-guide.js).
 *
 * Part 1 (this suite): pure-function behavior — chapter parsing, markdown conversion rules (raw HTML and relative
 * .md links are build errors; tables get a scroll wrapper; h2/h3 get stable ids; external links open in a new tab),
 * and screen assembly (banner, chapter nav, prev/next, version stamp).
 *
 * Part 2 (added when the screens are registered): the committed generated output under
 * bin/static/fragments/guide/ must be exactly reproducible from docs/user-guide/en (freshness), every screen must
 * be registered/mapped/titled, and the output must stay CSP-clean.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const {
    parseChapterSource,
    convertMarkdown,
    buildGuideScreens
} = require( "../bin/build/build-user-guide.js" );

describe( "User guide build — chapter parsing", () => {

    it( "derives order, slug, fragment name, title, and body from the file", () => {
        const chapter = parseChapterSource( "03-employee.md", "# For Employees\n\nIntro paragraph." );
        assert.equal( chapter.order, 3 );
        assert.equal( chapter.slug, "employee" );
        assert.equal( chapter.fragmentName, "help-employee" );
        assert.equal( chapter.title, "For Employees" );
        assert.equal( chapter.bodyMd, "Intro paragraph." );
    } );

    it( "rejects a file name that does not match NN-<slug>.md", () => {
        assert.throws( () => parseChapterSource( "employee.md", "# X" ), /must match NN-<slug>\.md/ );
    } );

    it( "rejects a chapter that does not start with an H1 title", () => {
        assert.throws( () => parseChapterSource( "01-overview.md", "No title here." ), /must start with a '# <title>' H1/ );
    } );

} );

describe( "User guide build — markdown conversion", () => {

    it( "renders headings with stable ids and paragraphs", () => {
        const html = convertMarkdown( "## Your First Steps\n\nHello.", "01-overview.md" );
        assert.match( html, /<h2 id="your-first-steps">Your First Steps<\/h2>/ );
        assert.match( html, /<p>Hello\.<\/p>/ );
    } );

    it( "wraps tables in a scroll container", () => {
        const md = "| A | B |\n|---|---|\n| 1 | 2 |";
        const html = convertMarkdown( md, "01-overview.md" );
        assert.match( html, /<div class="ti-doc-table">\s*<table>/ );
        assert.match( html, /<\/table>\s*<\/div>/ );
    } );

    it( "rejects raw HTML in the markdown", () => {
        assert.throws( () => convertMarkdown( "Hello <span>world</span>.", "01-overview.md" ), /Raw HTML is not allowed/ );
    } );

    it( "rejects relative .md links", () => {
        assert.throws( () => convertMarkdown( "See [the manager chapter](05-manager.md).", "01-overview.md" ), /Relative \.md links are not allowed/ );
    } );

    it( "opens external links in a new tab", () => {
        const html = convertMarkdown( "Visit [the repo](https://github.com/Belleal/ti-engine).", "01-overview.md" );
        assert.match( html, /<a href="https:\/\/github\.com\/Belleal\/ti-engine" target="_blank" rel="noopener noreferrer">/ );
    } );

    it( "emits no inline styles, scripts, or event-handler attributes", () => {
        const md = "## Section\n\nText with **bold** and `code`.\n\n> **Note:** a callout.\n\n- one\n- two";
        const html = convertMarkdown( md, "01-overview.md" );
        assert.doesNotMatch( html, /\s(?:style|on[a-z]+)\s*=\s*"/i );
        assert.doesNotMatch( html, /<script/i );
    } );

} );

describe( "User guide build — screen assembly", () => {

    const sources = [
        { fileName: "01-overview.md", raw: "# Overview & Key Concepts\n\nWelcome." },
        { fileName: "02-getting-started.md", raw: "# Getting Started\n\nSign in." },
        { fileName: "03-employee.md", raw: "# For Employees\n\nYour evaluation." }
    ];

    it( "builds one screen per chapter, sorted by order, with the generated banner", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        assert.deepEqual( screens.map( ( s ) => s.fileName ), [ "frame-help-overview.html", "frame-help-getting-started.html", "frame-help-employee.html" ] );
        assert.deepEqual( screens.map( ( s ) => s.fragmentName ), [ "help-overview", "help-getting-started", "help-employee" ] );
        for ( const screen of screens ) {
            assert.match( screen.html, /^<!-- GENERATED FILE — do not edit\./ );
        }
    } );

    it( "renders the chapter nav on every screen with the current chapter marked", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        const overview = screens[ 0 ].html;
        assert.match( overview, /hx-get="\/app\/help-getting-started"/ );
        assert.match( overview, /hx-get="\/app\/help-employee"/ );
        assert.match( overview, /aria-current="page"[^>]*>Overview &amp; Key Concepts</ );
        assert.equal( ( overview.match( /aria-current="page"/g ) || [] ).length, 1 );
    } );

    it( "renders prev/next footer links and the version stamp", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        const middle = screens[ 1 ].html;
        assert.match( middle, /competence-guide-prev/ );
        assert.match( middle, /competence-guide-next/ );
        assert.match( middle, /Guide for competence v3\.14\.0/ );
        assert.doesNotMatch( screens[ 0 ].html, /competence-guide-prev/ );
        assert.doesNotMatch( screens[ 2 ].html, /competence-guide-next/ );
    } );

    it( "rejects duplicate chapter orders or slugs", () => {
        assert.throws( () => buildGuideScreens( [ ...sources, { fileName: "01-intro.md", raw: "# Intro\n\nX." } ], "3.14.0" ), /Duplicate chapter order/ );
    } );

} );
