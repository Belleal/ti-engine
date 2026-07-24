/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Build step: generate the in-app User Guide screens from the markdown source in `docs/user-guide/`.
 *
 * The markdown chapters are the source of truth (docs/user-guide/en/NN-<slug>.md; the numeric prefix fixes the
 * order, the slug fixes the fragment name `help-<slug>`, the first line must be the `# H1` chapter title). This
 * script converts each chapter into a complete, static HTML screen fragment at
 * `bin/static/fragments/guide/frame-help-<slug>.html` — page head, chapter navigation (current chapter marked),
 * the converted content wrapped in `.ti-doc`, prev/next footer links, and a version stamp from package.json.
 * The generated files are committed; the app serves them like any other registered fragment
 * (bin/competence-web-application.js). `test/user-guide-build.test.js` regenerates the guide in-memory and fails
 * when the committed output is stale — after editing any chapter run:  npm run build:guide
 * OVERWRITES everything under bin/static/fragments/guide/.
 *
 * CSP discipline (enforced by tests): no raw HTML in the markdown (build error), no inline styles, no scripts,
 * no event-handler attributes in the output. Relative *.md links are rejected — cross-reference chapters as plain
 * text (the chapter navigation is the navigation); external http(s) links open in a new tab.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { marked } = require( "marked" );

const PACKAGE_ROOT = path.resolve( __dirname, "..", ".." );
const GUIDE_SOURCE_DIR = path.join( PACKAGE_ROOT, "docs", "user-guide", "en" );
const OUTPUT_DIR = path.join( PACKAGE_ROOT, "bin", "static", "fragments", "guide" );

const CHAPTER_FILE_PATTERN = /^(\d{2})-([a-z0-9-]+)\.md$/;
const GENERATED_BANNER = ( sourceFile ) => `<!-- GENERATED FILE — do not edit. Source: docs/user-guide/en/${ sourceFile }. Regenerate: npm run build:guide -->`;

/**
 * Converts heading/title text to a URL- and id-safe slug.
 *
 * @method
 * @param {string} text
 * @returns {string}
 * @public
 */
function slugify( text ) {
    return String( text ).toLowerCase().replace( /[^a-z0-9]+/g, "-" ).replace( /^-+|-+$/g, "" );
}

/**
 * Escapes a string for safe use in HTML text or attribute content.
 *
 * @method
 * @param {string} text
 * @returns {string}
 * @public
 */
function escapeHtml( text ) {
    return String( text ).replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" );
}

/**
 * Parses one chapter source file into its metadata and markdown body.
 *
 * @method
 * @param {string} fileName E.g. "03-employee.md" — the NN prefix fixes the order, the slug fixes the fragment name.
 * @param {string} raw The file content; the first non-empty line must be the `# H1` chapter title.
 * @returns {{ order: number, slug: string, fragmentName: string, title: string, bodyMd: string }}
 * @public
 */
function parseChapterSource( fileName, raw ) {
    const match = CHAPTER_FILE_PATTERN.exec( fileName );
    if ( !match ) {
        throw new Error( `Guide chapter file name '${ fileName }' must match NN-<slug>.md (e.g. 03-employee.md)` );
    }
    const lines = String( raw ).replace( /^\uFEFF/, "" ).split( /\r?\n/ );
    let titleLineIndex = -1;
    for ( let i = 0; i < lines.length; i++ ) {
        if ( lines[ i ].trim() !== "" ) {
            titleLineIndex = i;
            break;
        }
    }
    if ( titleLineIndex < 0 || !lines[ titleLineIndex ].startsWith( "# " ) ) {
        throw new Error( `Guide chapter '${ fileName }' must start with a '# <title>' H1 line` );
    }
    return {
        order: Number( match[ 1 ] ),
        slug: match[ 2 ],
        fragmentName: `help-${ match[ 2 ] }`,
        title: lines[ titleLineIndex ].slice( 2 ).trim(),
        bodyMd: lines.slice( titleLineIndex + 1 ).join( "\n" ).trim()
    };
}

/**
 * Converts chapter markdown to HTML under the guide's content rules.
 *
 * @method
 * @param {string} md
 * @param {string} fileName Used in error messages.
 * @returns {string}
 * @public
 */
function convertMarkdown( md, fileName ) {
    let rawHtmlSample = null;
    let html = marked.parse( md, {
        gfm: true,
        async: false,
        walkTokens: ( token ) => {
            if ( token.type === "html" && rawHtmlSample === null ) {
                rawHtmlSample = token.raw.trim().split( "\n" )[ 0 ];
            }
        }
    } );
    if ( rawHtmlSample !== null ) {
        throw new Error( `Raw HTML is not allowed in guide markdown (${ fileName }): '${ rawHtmlSample }' — use plain markdown; callouts are '> **Note:** …' blockquotes` );
    }
    if ( /href="[^"]*\.md(?:#[^"]*)?"/.test( html ) ) {
        throw new Error( `Relative .md links are not allowed in guide markdown (${ fileName }) — cross-reference chapters as plain text; the chapter navigation is the navigation` );
    }
    // Stable ids on h2/h3 (future deep-link anchors), scroll wrapper on tables, new-tab external links:
    html = html.replace( /<h([23])>([\s\S]*?)<\/h\1>/g, ( full, level, inner ) => {
        return `<h${ level } id="${ slugify( inner.replace( /<[^>]+>/g, "" ) ) }">${ inner }</h${ level }>`;
    } );
    html = html.replace( /<table>/g, "<div class=\"ti-doc-table\">\n<table>" ).replace( /<\/table>/g, "</table>\n</div>" );
    html = html.replace( /<a href="(https?:\/\/[^"]+)"/g, "<a href=\"$1\" target=\"_blank\" rel=\"noopener noreferrer\"" );
    return html;
}

/**
 * Assembles the complete screen fragment for one chapter: page head, chapter nav, content, prev/next footer.
 *
 * @method
 * @param {Object} chapter One element of `chapters`.
 * @param {Object[]} chapters All parsed chapters, sorted by order.
 * @param {string} sourceFile The chapter's source file name (for the banner).
 * @param {string} packageVersion Stamped into the footer.
 * @returns {string}
 * @public
 */
function assembleScreen( chapter, chapters, sourceFile, packageVersion ) {
    const index = chapters.indexOf( chapter );
    const navItems = chapters.map( ( entry ) => {
        const isCurrent = entry === chapter;
        return `            <button class="competence-guide-nav-item${ isCurrent ? " active" : "" }" type="button"${ isCurrent ? " aria-current=\"page\"" : "" } hx-get="/app/${ entry.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">${ escapeHtml( entry.title ) }</button>`;
    } ).join( "\n" );
    const previous = index > 0 ? chapters[ index - 1 ] : null;
    const next = index < chapters.length - 1 ? chapters[ index + 1 ] : null;
    const previousButton = previous
        ? `            <button class="ti-button ghost competence-guide-prev" type="button" hx-get="/app/${ previous.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">← ${ escapeHtml( previous.title ) }</button>`
        : "            <span></span>";
    const nextButton = next
        ? `            <button class="ti-button ghost competence-guide-next" type="button" hx-get="/app/${ next.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">${ escapeHtml( next.title ) } →</button>`
        : "            <span></span>";
    return `${ GENERATED_BANNER( sourceFile ) }
<div class="ti-page competence-guide-page">
    <div class="ti-page-head">
        <div class="ti-page-eyebrow">User Guide</div>
        <h1 class="ti-page-title">${ escapeHtml( chapter.title ) }</h1>
    </div>
    <div class="competence-guide-layout">
        <nav class="ti-panel competence-guide-nav" aria-label="Guide chapters">
${ navItems }
        </nav>
        <article class="ti-panel competence-guide-content">
            <div class="ti-doc">
${ convertMarkdown( chapter.bodyMd, sourceFile ) }
            </div>
            <footer class="competence-guide-footer">
${ previousButton }
                <span class="competence-guide-version">Guide for competence v${ escapeHtml( packageVersion ) }</span>
${ nextButton }
            </footer>
        </article>
    </div>
</div>
`;
}

/**
 * Builds every guide screen from the chapter sources.
 *
 * @method
 * @param {Array<{ fileName: string, raw: string }>} sources
 * @param {string} packageVersion
 * @returns {Array<{ fileName: string, fragmentName: string, html: string }>} Sorted by chapter order.
 * @public
 */
function buildGuideScreens( sources, packageVersion ) {
    const chapters = sources.map( ( source ) => Object.assign( parseChapterSource( source.fileName, source.raw ), { sourceFile: source.fileName } ) );
    chapters.sort( ( a, b ) => a.order - b.order );
    const seenOrders = new Set();
    const seenSlugs = new Set();
    for ( const chapter of chapters ) {
        if ( seenOrders.has( chapter.order ) ) {
            throw new Error( `Duplicate chapter order ${ chapter.order } (${ chapter.sourceFile })` );
        }
        if ( seenSlugs.has( chapter.slug ) ) {
            throw new Error( `Duplicate chapter slug '${ chapter.slug }' (${ chapter.sourceFile })` );
        }
        seenOrders.add( chapter.order );
        seenSlugs.add( chapter.slug );
    }
    return chapters.map( ( chapter ) => {
        return {
            fileName: `frame-${ chapter.fragmentName }.html`,
            fragmentName: chapter.fragmentName,
            html: assembleScreen( chapter, chapters, chapter.sourceFile, packageVersion )
        };
    } );
}

/**
 * CLI entry: reads docs/user-guide/en, wipes and rewrites bin/static/fragments/guide.
 *
 * @method
 * @private
 */
function main() {
    const packageVersion = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "package.json" ), "utf8" ) ).version;
    const fileNames = fs.readdirSync( GUIDE_SOURCE_DIR ).filter( ( name ) => name.endsWith( ".md" ) );
    if ( fileNames.length === 0 ) {
        throw new Error( `No guide chapters found in ${ GUIDE_SOURCE_DIR }` );
    }
    const sources = fileNames.map( ( fileName ) => {
        return { fileName: fileName, raw: fs.readFileSync( path.join( GUIDE_SOURCE_DIR, fileName ), "utf8" ) };
    } );
    const screens = buildGuideScreens( sources, packageVersion );
    fs.rmSync( OUTPUT_DIR, { recursive: true, force: true } );
    fs.mkdirSync( OUTPUT_DIR, { recursive: true } );
    for ( const screen of screens ) {
        fs.writeFileSync( path.join( OUTPUT_DIR, screen.fileName ), screen.html, "utf8" );
    }
    console.log( `build-user-guide: generated ${ screens.length } screen(s) into ${ path.relative( PACKAGE_ROOT, OUTPUT_DIR ) }` );
}

module.exports = { parseChapterSource, convertMarkdown, assembleScreen, buildGuideScreens, slugify, GUIDE_SOURCE_DIR, OUTPUT_DIR };

if ( require.main === module ) {
    main();
}
