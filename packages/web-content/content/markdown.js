/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Markdown renderer -- a markdown-it wrapper configured with `html: false`, so raw HTML in authored markdown is
 * ESCAPED rather than passed through. That matters because this module's output is one of only two sanctioned raw()
 * sites (CLAUDE.md 8): the renderer trusts what comes out of here, so nothing untrusted may pass through it.
 *
 * Legacy WordPress posts (bodyFormat "html") do NOT come through this module -- they are sanitised once at import
 * and stored clean, then raw()'d directly.
 *
 * Typographic substitution is deliberately OFF. The manuscripts already carry authored Unicode punctuation (em
 * dashes, curly quotes, ellipses) from the author's own editorial process; letting markdown-it re-transform it would
 * silently alter deliberate prose. Same reasoning for linkify -- an auto-linked bare URL in fiction is a surprise,
 * not a feature. Both stay opt-in per call.
 */

const MarkdownIt = require( "markdown-it" );
const { raw } = require( "#html" );

// Conservative, predictable defaults. `html: false` is the security-relevant one and is never overridden below.
const DEFAULT_OPTIONS = {
    html: false,
    breaks: false,
    linkify: false,
    typographer: false
};

const renderer = new MarkdownIt( DEFAULT_OPTIONS );

/**
 * Renders markdown to block-level HTML (paragraphs, headings, lists).
 *
 * @param {string} source
 * @returns {import("../render/html.js").SafeString}
 */
function render( source ) {
    if ( source === null || source === undefined || source === "" ) {
        return raw( "" );
    }
    return raw( renderer.render( String( source ) ) );
}

/**
 * Renders markdown without the wrapping paragraph -- for summaries, blurbs, captions, and other single-line fields.
 *
 * @param {string} source
 * @returns {import("../render/html.js").SafeString}
 */
function renderInline( source ) {
    if ( source === null || source === undefined || source === "" ) {
        return raw( "" );
    }
    return raw( renderer.renderInline( String( source ) ) );
}

module.exports = {
    render: render,
    renderInline: renderInline
};
