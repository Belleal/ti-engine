/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Text-bearing section bodies: prose, verse, closing, languageExample.
 *
 * `prose` is the only component that runs markdown, and it is one of the two sanctioned raw() sites -- markdown.js
 * escapes embedded HTML, so its output is trustworthy. A legacy record carrying imported WordPress HTML
 * (bodyFormat "html") was sanitised once at import and is emitted as-is; it is never re-sanitised per request.
 */

const { html, raw } = require( "#html" );
const markdown = require( "#markdown" );

/**
 * `prose` -- a markdown (or pre-sanitised legacy HTML) body in the reading measure. `.prose-excerpt` is the
 * scarlet-ruled variant used for an excerpt pulled from a longer work.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderProse( section ) {
    const classes = section.variant === "excerpt" ? "prose prose-excerpt" : "prose";
    return html`<div class="${ classes }">${ renderBody( section ) }</div>`;
}

/**
 * Renders a prose body, or withholds it.
 *
 * `bodyFormat: "html"` is DORMANT and deliberately not rendered. The field is kept as an escape hatch should a page
 * ever resist the section vocabulary, but its safety rests on being sanitised once at import -- and no importer
 * exists, since every page is authored in this framework rather than imported. Emitting it would put unsanitised
 * markup on the page, so it is withheld here exactly as `routes/content-routes.js` withholds it: a dormant path has
 * to be dormant on every route, not merely on the one that was written first.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderBody( section ) {
    if ( !section.body || section.bodyFormat === "html" ) {
        return raw( "" );
    }
    return markdown.render( section.body );
}

/**
 * `verse` -- one paragraph, hard line breaks, the closing line marked so the theme can give it the turn it needs.
 * Attribution follows as a `cite`.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderVerse( section ) {
    const lines = Array.isArray( section.lines ) ? section.lines : [];
    if ( lines.length === 0 ) {
        return raw( "" );
    }
    const lastIndex = lines.length - 1;
    const body = lines.map( ( line, index ) => {
        if ( index === lastIndex ) {
            return html`<span class="verse-last-line">${ line }</span>`;
        }
        return html`${ line }<br>`;
    } );
    const attribution = section.attribution ? html`<cite class="verse-attribution">${ section.attribution }</cite>` : raw( "" );
    return html`<p class="verse">${ body }</p>${ attribution }`;
}

/**
 * `closing` -- the send-off at the foot of a composed page: text, title, ornament.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderClosing( section ) {
    const text = section.text ? html`<p class="closing-text">${ section.text }</p>` : raw( "" );
    const title = section.closingTitle ? html`<h4 class="closing-title">${ section.closingTitle }</h4>` : raw( "" );
    const ornament = ( section.ornament === false ) ? raw( "" ) : html`<div class="ornament">${ section.ornament || "◆" }</div>`;
    return html`${ text }${ title }${ ornament }`;
}

/**
 * `languageExample` -- an Anarandian phrase with its translation. Renders one block per example so a section can
 * carry several, matching the specimen.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderLanguageExample( section ) {
    const examples = Array.isArray( section.examples )
        ? section.examples
        : [ { anarandian: section.anarandian, translation: section.translation, note: section.note } ];

    return html`${ examples.filter( ( example ) => example && example.anarandian ).map( ( example ) => html`<div class="language-example"><p class="anarandian-text">${ example.anarandian }</p><p class="translation-text">${ example.translation || "" }</p>${ example.note ? html`<p class="language-note">${ example.note }</p>` : raw( "" ) }</div>` ) }`;
}

module.exports = {
    renderProse: renderProse,
    renderVerse: renderVerse,
    renderClosing: renderClosing,
    renderLanguageExample: renderLanguageExample
};
