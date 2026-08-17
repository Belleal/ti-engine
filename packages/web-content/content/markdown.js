/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * Markdown renderer -- markdown-it configured `html: false`, so raw HTML in authored markdown is ESCAPED rather than
 * passed through. That matters because this module's output is a sanctioned raw() site: the renderer trusts what
 * comes out of here, so nothing untrusted may pass through it.
 *
 * Typographic substitution is deliberately OFF. The manuscripts already carry authored Unicode punctuation (em
 * dashes, curly quotes) from the editorial process; letting markdown-it re-transform it would silently alter
 * deliberate prose. Same reasoning for linkify -- an auto-linked bare URL in fiction is a surprise, not a feature.
 *
 * EDITORIAL EXTENSIONS. Every page is authored in this framework rather than imported as legacy HTML, so there is no
 * markup escape hatch: a prose primitive an author cannot express in markdown is a primitive nobody can use. Three
 * plugins close that gap against Site/docs/markup-contract.md:
 *
 *   markdown-it-attrs      `{.prose-drop-cap}` -- classes on any block or inline element
 *   markdown-it-container  `::: pull-quote` -- the wrapper elements markdown has no syntax for
 *   markdown-it-footnote   `[^1]` -- remapped onto the contract's footnote classes and id scheme
 *
 * THE ATTRIBUTE ALLOWLIST IS A SECURITY BOUNDARY, not a convenience. Unrestricted, `markdown-it-attrs` would let
 * authored content write `{style="…"}` or `{onclick="…"}` straight into the page -- breaching the contract's
 * no-inline-style rule from inside content, and handing an XSS vector to anything that ever renders untrusted
 * markdown. Only `class` and `id` are permitted.
 */

const MarkdownIt = require( "markdown-it" );
const attrs = require( "markdown-it-attrs" );
const bracketedSpans = require( "markdown-it-bracketed-spans" );
const container = require( "markdown-it-container" );
const footnote = require( "markdown-it-footnote" );
const { raw } = require( "#html" );

// Conservative, predictable defaults. `html: false` is the security-relevant one and is never overridden.
const DEFAULT_OPTIONS = {
    html: false,
    breaks: false,
    linkify: false,
    typographer: false
};

// The only attributes authored content may set. Everything else -- style, event handlers, href, data-* -- is dropped.
const ALLOWED_ATTRIBUTES = [ "class", "id" ];

/*
 * The block containers. `parts` auto-classes the container's direct block children by position when the author has
 * not set a class explicitly, so the common case needs no annotation at all. A null part means "leave unclassed";
 * `unwrapImage` drops the paragraph markdown wraps a lone image in, so the img becomes a direct child of the figure.
 */
const CONTAINERS = {
    "pull-quote": { tag: "figure", className: "pull-quote", parts: [ "pull-quote-text", "pull-quote-attribution" ] },
    "chapter-opener": { tag: "div", className: "chapter-opener", parts: [ "chapter-number", "chapter-title", "chapter-epigraph" ] },
    "language-example": { tag: "div", className: "language-example", parts: [ "anarandian-text", "translation-text", "language-note" ] },
    "figure": { tag: "figure", className: "prose-figure", parts: [ null, "prose-figcaption" ], unwrapImage: true }
};

const BLOCK_OPENS = new Set( [ "paragraph_open", "heading_open" ] );

/**
 * Assigns the positional part classes inside every known container, and unwraps a lone image where the container
 * asks for it. Runs after inline parsing so an explicitly authored class is already on the token and wins.
 *
 * @param {Object} state
 */
function applyContainerParts( state ) {
    const tokens = state.tokens;
    for ( let index = 0; index < tokens.length; index++ ) {
        const open = tokens[ index ];
        if ( open.type.indexOf( "container_" ) !== 0 || open.nesting !== 1 ) {
            continue;
        }
        const name = open.type.slice( "container_".length, open.type.lastIndexOf( "_open" ) );
        const definition = CONTAINERS[ name ];
        if ( !definition ) {
            continue;
        }

        let part = 0;
        let depth = 0;
        for ( let cursor = index + 1; cursor < tokens.length; cursor++ ) {
            const token = tokens[ cursor ];
            if ( token.type === open.type ) {
                depth++;
            }
            if ( token.nesting === -1 && token.type === open.type.replace( "_open", "_close" ) ) {
                if ( depth === 0 ) {
                    break;
                }
                depth--;
            }
            if ( depth !== 0 || token.level !== open.level + 1 || BLOCK_OPENS.has( token.type ) === false ) {
                continue;
            }

            const inline = tokens[ cursor + 1 ];
            if ( definition.unwrapImage && part === 0 && isLoneImage( inline ) ) {
                // Hide the paragraph wrapper so the image sits directly inside the figure.
                token.hidden = true;
                tokens[ cursor + 2 ].hidden = true;
                part++;
                continue;
            }

            const className = definition.parts[ part ];
            if ( className && !token.attrGet( "class" ) ) {
                token.attrJoin( "class", className );
            }
            part++;
        }
    }
}

/**
 * True when an inline token holds exactly one image and nothing else.
 *
 * @param {Object} inline
 * @returns {boolean}
 */
function isLoneImage( inline ) {
    if ( !inline || inline.type !== "inline" || !Array.isArray( inline.children ) ) {
        return false;
    }
    const meaningful = inline.children.filter( ( child ) => !( child.type === "text" && child.content.trim() === "" ) );
    return meaningful.length === 1 && meaningful[ 0 ].type === "image";
}

/**
 * Hides the paragraph wrapper markdown-it-footnote puts inside each footnote item. The contract's footnote row is a
 * flex pair (marker + text), which a block-level <p> would break.
 *
 * @param {Object} state
 */
function unwrapFootnoteParagraphs( state ) {
    const tokens = state.tokens;
    let inside = false;
    for ( const token of tokens ) {
        if ( token.type === "footnote_open" ) {
            inside = true;
        } else if ( token.type === "footnote_close" ) {
            inside = false;
        } else if ( inside && ( token.type === "paragraph_open" || token.type === "paragraph_close" ) ) {
            token.hidden = true;
        }
    }
}

/**
 * Overrides markdown-it-footnote's markup so it emits the contract's classes and `fn-N` / `fnref-N` id scheme
 * instead of the plugin's own defaults.
 *
 * @param {Object} md
 */
function applyFootnoteMarkup( md ) {
    md.renderer.rules.footnote_ref = ( tokens, idx ) => {
        const number = String( tokens[ idx ].meta.id + 1 );
        return `<a class="footnote-ref" href="#fn-${ number }" id="fnref-${ number }">${ number }</a>`;
    };
    md.renderer.rules.footnote_block_open = () => "<ol class=\"footnote-list\">\n";
    md.renderer.rules.footnote_block_close = () => "</ol>\n";
    md.renderer.rules.footnote_open = ( tokens, idx ) => {
        const number = String( tokens[ idx ].meta.id + 1 );
        return `<li class="footnote-item" id="fn-${ number }"><span class="footnote-marker">${ number }</span><span>`;
    };
    md.renderer.rules.footnote_close = () => "</span></li>\n";
    md.renderer.rules.footnote_anchor = ( tokens, idx ) => {
        const number = String( tokens[ idx ].meta.id + 1 );
        // Up arrow rather than the conventional U+21A9: no self-hosted face carries that codepoint, and it has an
        // emoji presentation variant, so some platforms render it as a coloured glyph in the middle of a footnote.
        // U+2191 is present in every face the site ships.
        return ` <a class="footnote-backref" href="#fnref-${ number }">↑</a>`;
    };
    // The plugin's separator rule has no place in the contract's markup.
    md.renderer.rules.footnote_anchor_name = () => "";
    md.renderer.rules.footnote_caption = () => "";
};

/**
 * Builds the configured renderer.
 *
 * @returns {Object}
 */
function createRenderer() {
    const md = new MarkdownIt( DEFAULT_OPTIONS );

    // Bracketed spans must load BEFORE attrs: it turns `[text]{…}` into a span token for attrs to annotate, which is
    // how inline Anarandian (`[Anarand'aris]{.anarandian-inline}`) is written without a container.
    md.use( bracketedSpans );
    md.use( attrs, { allowedAttributes: ALLOWED_ATTRIBUTES } );
    for ( const name of Object.keys( CONTAINERS ) ) {
        const definition = CONTAINERS[ name ];
        md.use( container, name, {
            render: ( tokens, idx ) => ( tokens[ idx ].nesting === 1 )
                ? `<${ definition.tag } class="${ definition.className }">\n`
                : `</${ definition.tag }>\n`
        } );
    }
    md.use( footnote );

    applyFootnoteMarkup( md );
    md.core.ruler.push( "ti_container_parts", applyContainerParts );
    md.core.ruler.push( "ti_footnote_unwrap", unwrapFootnoteParagraphs );

    return md;
}

const renderer = createRenderer();

/**
 * Renders markdown to block-level HTML (paragraphs, headings, lists, and the editorial primitives).
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
    renderInline: renderInline,
    CONTAINERS: CONTAINERS,
    ALLOWED_ATTRIBUTES: ALLOWED_ATTRIBUTES
};
