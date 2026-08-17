/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
 *
 * The version stamp is a placeholder substituted at serve time, never a literal — the build output depends only on
 * the markdown, so a version bump cannot make the committed fragments stale. Two guards hold that: the output must
 * carry the placeholder and no baked-in version, and the app must substitute the same token the build emits.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const {
    parseChapterSource,
    convertMarkdown,
    buildGuideScreens,
    GUIDE_SOURCE_DIR,
    OUTPUT_DIR,
    VERSION_PLACEHOLDER
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

    it( "rejects block-level raw HTML too", () => {
        assert.throws( () => convertMarkdown( "<div>block</div>", "01-overview.md" ), /Raw HTML is not allowed/ );
    } );

    it( "rejects relative .md links", () => {
        assert.throws( () => convertMarkdown( "See [the manager chapter](05-manager.md).", "01-overview.md" ), /Relative \.md links are not allowed/ );
    } );

    it( "allows absolute external links to .md files", () => {
        const html = convertMarkdown( "See [the readme](https://github.com/Belleal/ti-engine/blob/master/README.md).", "01-overview.md" );
        assert.match( html, /<a href="https:\/\/github\.com\/Belleal\/ti-engine\/blob\/master\/README\.md" target="_blank" rel="noopener noreferrer">/ );
    } );

    it( "rejects images (text-only guide in v1)", () => {
        assert.throws( () => convertMarkdown( "![a diagram](https://example.com/diagram.png)", "01-overview.md" ), /Images are not supported/ );
    } );

    it( "rejects non-http(s) link schemes", () => {
        for ( const badHref of [ "javascript:alert(1)", "data:text/plain,hello", "vbscript:msgbox(1)" ] ) {
            assert.throws( () => convertMarkdown( `[click](${ badHref })`, "01-overview.md" ), /Only absolute http\(s\) links are allowed/, badHref );
        }
    } );

    it( "rejects relative non-.md links too", () => {
        assert.throws( () => convertMarkdown( "[a picture](../images/example.png)", "01-overview.md" ), /Only absolute http\(s\) links are allowed/ );
    } );

    it( "deduplicates repeated heading ids within a chapter and drops entities from ids", () => {
        const html = convertMarkdown( "## Overview\n\nA.\n\n## Overview\n\nB.\n\n## You can't skip this\n\nC.", "01-overview.md" );
        assert.match( html, /<h2 id="overview">/ );
        assert.match( html, /<h2 id="overview-2">/ );
        assert.match( html, /<h2 id="you-cant-skip-this">/ );
    } );

    it( "opens external links in a new tab", () => {
        const html = convertMarkdown( "Visit [the repo](https://github.com/Belleal/ti-engine).", "01-overview.md" );
        assert.match( html, /<a href="https:\/\/github\.com\/Belleal\/ti-engine" target="_blank" rel="noopener noreferrer">/ );
    } );

    it( "opens titled external links in a new tab too", () => {
        const html = convertMarkdown( "Visit [the repo](https://github.com/Belleal/ti-engine \"ti-engine repo\").", "01-overview.md" );
        assert.match( html, /<a href="https:\/\/github\.com\/Belleal\/ti-engine" target="_blank" rel="noopener noreferrer" title="ti-engine repo">/ );
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
        const screens = buildGuideScreens( sources );
        assert.deepEqual( screens.map( ( s ) => s.fileName ), [ "frame-help-overview.html", "frame-help-getting-started.html", "frame-help-employee.html" ] );
        assert.deepEqual( screens.map( ( s ) => s.fragmentName ), [ "help-overview", "help-getting-started", "help-employee" ] );
        for ( const screen of screens ) {
            assert.match( screen.html, /^<!-- GENERATED FILE — do not edit\./ );
        }
    } );

    it( "renders the chapter nav on every screen with the current chapter marked", () => {
        const screens = buildGuideScreens( sources );
        const overview = screens[ 0 ].html;
        assert.match( overview, /hx-get="\/app\/help-getting-started"/ );
        assert.match( overview, /hx-get="\/app\/help-employee"/ );
        assert.match( overview, /aria-current="page"[^>]*>Overview &amp; Key Concepts</ );
        assert.equal( ( overview.match( /aria-current="page"/g ) || [] ).length, 1 );
    } );

    it( "renders prev/next footer links and the version stamp as a placeholder, not a literal version", () => {
        const screens = buildGuideScreens( sources );
        const middle = screens[ 1 ].html;
        assert.match( middle, /competence-guide-prev/ );
        assert.match( middle, /competence-guide-next/ );
        assert.match( middle, /Guide for competence v\{competence-version-placeholder}/ );
        assert.doesNotMatch( screens[ 0 ].html, /competence-guide-prev/ );
        assert.doesNotMatch( screens[ 2 ].html, /competence-guide-next/ );
    } );

    it( "builds identical output regardless of the package version — the build takes no version input", () => {
        // The regression guard for the coupling that broke CI: bumping package.json used to re-stamp all nine
        // screens, so a version-only commit failed the freshness check below with no chapter having changed.
        assert.equal( buildGuideScreens.length, 1, "buildGuideScreens must take only `sources`" );
        assert.equal( buildGuideScreens( sources )[ 0 ].html, buildGuideScreens( sources )[ 0 ].html );
    } );

    it( "rejects duplicate chapter orders or slugs", () => {
        assert.throws( () => buildGuideScreens( [ ...sources, { fileName: "01-intro.md", raw: "# Intro\n\nX." } ] ), /Duplicate chapter order/ );
    } );

    it( "rejects duplicate chapter slugs, even with different orders", () => {
        const duplicateSlugSources = [
            { fileName: "01-overview.md", raw: "# Overview\n\nOne." },
            { fileName: "02-overview.md", raw: "# Overview Two\n\nTwo." }
        ];
        assert.throws( () => buildGuideScreens( duplicateSlugSources ), /Duplicate chapter slug/ );
    } );

} );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const WEB_APPLICATION_FILE = path.join( PACKAGE_ROOT, "bin", "competence-web-application.js" );
const LABELS_FILE = path.join( PACKAGE_ROOT, "bin", "localization", "competence-labels.json" );

// Task 8 appends "process-guide" here (hand-authored screen — registered/mapped/titled but not generated):
const GUIDE_FRAGMENT_NAMES = [
    "help-overview", "help-getting-started", "help-employee", "help-team-member", "help-manager",
    "help-supervisor", "help-administrator", "help-appraisal-process", "help-faq-glossary",
    "process-guide"
];

const normalizeLineEndings = ( text ) => text.replace( /\r\n/g, "\n" );

describe( "User guide — repo state", () => {

    it( "committed screens are exactly reproducible from docs/user-guide (run npm run build:guide after editing)", () => {
        const sources = fs.readdirSync( GUIDE_SOURCE_DIR ).filter( ( name ) => name.endsWith( ".md" ) )
            .map( ( fileName ) => ( { fileName: fileName, raw: fs.readFileSync( path.join( GUIDE_SOURCE_DIR, fileName ), "utf8" ) } ) );
        const screens = buildGuideScreens( sources );
        const committed = fs.readdirSync( OUTPUT_DIR ).filter( ( name ) => name.endsWith( ".html" ) );
        assert.deepEqual( committed.sort(), screens.map( ( screen ) => screen.fileName ).sort(), "generated file set differs from committed set" );
        for ( const screen of screens ) {
            const onDisk = normalizeLineEndings( fs.readFileSync( path.join( OUTPUT_DIR, screen.fileName ), "utf8" ) );
            assert.equal( onDisk, normalizeLineEndings( screen.html ), `${ screen.fileName } is stale — run 'npm run build:guide -w @ti-engine/competence' and commit the result` );
        }
    } );

    it( "every guide screen is registered, sidebar-mapped, and topbar-titled", () => {
        const webApplicationSource = fs.readFileSync( WEB_APPLICATION_FILE, "utf8" );
        const labels = JSON.parse( fs.readFileSync( LABELS_FILE, "utf8" ) );
        const missing = [];
        for ( const fragmentName of GUIDE_FRAGMENT_NAMES ) {
            if ( !webApplicationSource.includes( `addFragment( "${ fragmentName }"` ) ) {
                missing.push( `${ fragmentName }: addFragment registration` );
            }
            if ( !webApplicationSource.includes( `"${ fragmentName }": "` ) ) {
                missing.push( `${ fragmentName }: sidebarNavMapping entry` );
            }
            const topbarLabel = labels.interface && labels.interface.topbar && labels.interface.topbar[ fragmentName ];
            if ( !topbarLabel || !topbarLabel.en || !topbarLabel.bg ) {
                missing.push( `${ fragmentName }: interface.topbar label (en + bg)` );
            }
        }
        assert.deepEqual( missing, [], `Guide screens missing wiring:\n  ${ missing.join( "\n  " ) }` );
    } );

    it( "every registered guide screen path resolves to an existing fragment file", () => {
        const webApplicationSource = fs.readFileSync( WEB_APPLICATION_FILE, "utf8" );
        const broken = [];
        for ( const fragmentName of GUIDE_FRAGMENT_NAMES ) {
            const registration = new RegExp( `addFragment\\( "${ fragmentName }", \\{[^}]*?path: "([^"]+)"`, "s" ).exec( webApplicationSource );
            if ( !registration ) {
                broken.push( `${ fragmentName }: no addFragment registration with a path` );
                continue;
            }
            if ( !fs.existsSync( path.join( PACKAGE_ROOT, "bin", "static", registration[ 1 ] ) ) ) {
                broken.push( `${ fragmentName }: registered path '${ registration[ 1 ] }' does not exist under bin/static/` );
            }
        }
        assert.deepEqual( broken, [], `Registered guide screen paths that do not resolve to files:\n  ${ broken.join( "\n  " ) }` );
    } );

    it( "guide screens stay CSP-clean (generated + hand-authored)", () => {
        const offenders = [];
        const filesToScan = fs.readdirSync( OUTPUT_DIR ).filter( ( name ) => name.endsWith( ".html" ) )
            .map( ( fileName ) => path.join( OUTPUT_DIR, fileName ) );
        filesToScan.push( path.join( PACKAGE_ROOT, "bin", "static", "fragments", "frame-process-guide.html" ) );
        for ( const filePath of filesToScan ) {
            const html = fs.readFileSync( filePath, "utf8" );
            if ( /\s(?:style|on[a-z]+)\s*=\s*"/i.test( html ) || /<script/i.test( html ) ) {
                offenders.push( path.relative( PACKAGE_ROOT, filePath ) );
            }
        }
        assert.deepEqual( offenders, [], `Guide screens with CSP violations: ${ offenders.join( ", " ) }` );
    } );

    it( "committed screens carry the version placeholder and never a baked-in package version", () => {
        // Without this, the freshness check above turns every version bump into a build break: the generated HTML
        // would carry the version literal, so package.json and the committed fragments could disagree.
        const packageVersion = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "package.json" ), "utf8" ) ).version;
        const offenders = [];
        for ( const fileName of fs.readdirSync( OUTPUT_DIR ).filter( ( name ) => name.endsWith( ".html" ) ) ) {
            const html = fs.readFileSync( path.join( OUTPUT_DIR, fileName ), "utf8" );
            if ( !html.includes( VERSION_PLACEHOLDER ) ) {
                offenders.push( `${ fileName }: missing the ${ VERSION_PLACEHOLDER } stamp` );
            }
            if ( html.includes( `v${ packageVersion }` ) ) {
                offenders.push( `${ fileName }: has the literal version v${ packageVersion } baked in` );
            }
        }
        assert.deepEqual( offenders, [], `Version-stamp problems:\n  ${ offenders.join( "\n  " ) }` );
    } );

    it( "the web application substitutes exactly the placeholder the build emits", () => {
        // The app cannot import the build script (it pulls in `marked`, a build-time devDependency absent from the
        // runtime image), so it re-declares the token. This pins the two copies equal.
        const webApplicationSource = fs.readFileSync( WEB_APPLICATION_FILE, "utf8" );
        assert.ok( webApplicationSource.includes( `"${ VERSION_PLACEHOLDER }"` ),
            `bin/competence-web-application.js must declare the token ${ VERSION_PLACEHOLDER } that build-user-guide.js emits` );
        assert.match( webApplicationSource, /replaceAll\( GUIDE_VERSION_PLACEHOLDER, PACKAGE_VERSION \)/,
            "transformHtml must substitute the guide version placeholder with the running package version" );
    } );

} );
