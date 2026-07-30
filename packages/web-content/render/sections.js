/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Section registry and dispatch. Emits the DOM specified by Site/docs/markup-contract.md:
 *
 *   <section class="section section-<type> bg-<layer>" data-screen-label="…">
 *     <div class="wrap-page|wrap-wide|wrap-prose">
 *       <p class="section-eyebrow">  <h2 class="section-header">  <p class="section-subtitle">  <hr class="divider-…">
 *       …section body (one of the editorial components)…
 *
 * The type -> class mapping is MECHANICAL (camelCase -> kebab-case, prefixed `section-`), as both the contract and
 * the specimen state, so no lookup table is needed and a new type needs no registration here beyond its renderer.
 * The full map is pinned in test/sections.test.js: a CSS rule written against a class the renderer does not emit is
 * a silent no-op, so the mapping is asserted rather than assumed.
 *
 * `bg-*` is a property of the section RECORD, not of the type -- the background rhythm alternates per page, and two
 * layers per page is the design ceiling. No component ever emits a style attribute.
 */

const { html, raw } = require( "#html" );
const editorial = require( "#editorial" );

// Body renderers keyed by section type. Each takes ( section, context ) and returns the section BODY only; the
// wrapper and chrome below are common to every type.
const SECTION_RENDERERS = Object.freeze( {
    hero: editorial.renderHero,
    prose: editorial.renderProse,
    verse: editorial.renderVerse,
    characterCards: editorial.renderCharacterCards,
    audio: editorial.renderAudio,
    languageExample: editorial.renderLanguageExample,
    agePanels: editorial.renderAgePanels,
    timeStrip: editorial.renderTimeStrip,
    timeline: editorial.renderTimeline,
    gallery: editorial.renderGallery,
    capture: editorial.renderCapture,
    featured: editorial.renderFeatured,
    postList: editorial.renderPostList,
    closing: editorial.renderClosing,
    dictionary: editorial.renderDictionary
} );

// Per-type default measure. Grids and wide compositions get the page measure; text sections get the wide measure and
// rely on `.prose` for the 34rem reading column (it carries its own max-width), so the two are independent.
const WRAP_BY_TYPE = Object.freeze( {
    hero: "wrap-page",
    characterCards: "wrap-page",
    gallery: "wrap-page",
    timeline: "wrap-page",
    postList: "wrap-page",
    dictionary: "wrap-page",
    timeStrip: "wrap-page",
    agePanels: "wrap-page"
} );

const DEFAULT_WRAP = "wrap-wide";
const ALLOWED_WRAPS = new Set( [ "wrap-page", "wrap-wide", "wrap-prose" ] );
const ALLOWED_BACKGROUNDS = new Set( [ "abyss", "deep", "mid", "surface", "elevated" ] );
const MAX_REVEAL_DELAY = 3;

// A section may belong to one release state only. The theme hides the non-matching ones, so a
// pre-order call to action cannot survive into the released page.
// Taken from the schema rather than restated: these values are also a CSS contract (`state-*` / `on-*`), so a
// copy that drifted would silently stop matching the stylesheet and sections would quietly never show.
const RELEASE_STATES = new Set( require( "#schema" ).RELEASE_STATES );

/**
 * Derives a section's wrapper class from its type: camelCase -> kebab-case, prefixed `section-`.
 *
 * @param {string} type
 * @returns {string|null} null for an empty or non-string type.
 */
function sectionClassFor( type ) {
    if ( !type || typeof type !== "string" ) {
        return null;
    }
    return "section-" + type.replace( /([a-z0-9])([A-Z])/g, "$1-$2" ).toLowerCase();
}

/**
 * Whether a body renderer is registered for a section type.
 *
 * @param {string} type
 * @returns {boolean}
 */
function hasRenderer( type ) {
    return typeof SECTION_RENDERERS[ type ] === "function";
}

/**
 * Renders one section: the common wrapper and chrome, plus the type's body.
 *
 * @param {Object} section  The section record.
 * @param {Object} context  Render context ( repository, viewer, baseUrl, labels… ) passed through to the body.
 * @returns {import("./html.js").SafeString}  Empty for an unknown type -- an unrecognised section is skipped, never fatal.
 */
function renderSection( section, context ) {
    if ( !section || !hasRenderer( section.type ) ) {
        return raw( "" );
    }

    const classes = [ "section", sectionClassFor( section.type ) ];
    if ( section.tight === true ) {
        classes.push( "section-tight" );
    }
    if ( section.background && ALLOWED_BACKGROUNDS.has( section.background ) ) {
        classes.push( "bg-" + section.background );
    }
    if ( RELEASE_STATES.has( section.showWhen ) ) {
        classes.push( "on-" + section.showWhen );
    }
    if ( section.reveal === true ) {
        classes.push( "reveal" );
        if ( Number.isInteger( section.revealDelay ) && section.revealDelay >= 1 && section.revealDelay <= MAX_REVEAL_DELAY ) {
            classes.push( "reveal-delay-" + section.revealDelay );
        }
    }

    const wrap = ( section.wrap && ALLOWED_WRAPS.has( section.wrap ) )
        ? section.wrap
        : ( WRAP_BY_TYPE[ section.type ] || DEFAULT_WRAP );

    const body = SECTION_RENDERERS[ section.type ]( section, context || {} );

    return html`<section class="${ classes.join( " " ) }"${ section.screenLabel ? html` data-screen-label="${ section.screenLabel }"` : raw( "" ) }><div class="${ wrap }">${ renderChrome( section ) }${ body }</div></section>`;
}

/**
 * The optional eyebrow / header / subtitle / divider block above a section body. Each element is emitted only when
 * the record carries it, so an absent field leaves no empty node behind.
 *
 * @param {Object} section
 * @returns {import("./html.js").SafeString}
 */
function renderChrome( section ) {
    const parts = [];
    if ( section.eyebrow ) {
        parts.push( html`<p class="section-eyebrow">${ section.eyebrow }</p>` );
    }
    if ( section.title || section.titleAccent ) {
        const accent = section.titleAccent ? html` <span class="accent">${ section.titleAccent }</span>` : raw( "" );
        parts.push( html`<h2 class="section-header">${ section.title || "" }${ accent }</h2>` );
    }
    if ( section.subtitle ) {
        parts.push( html`<p class="section-subtitle">${ section.subtitle }</p>` );
    }
    if ( section.divider ) {
        // The scarlet rule is reserved for drama; gold is the default editorial divider.
        const tone = ( section.divider === "scarlet" ) ? "divider-scarlet" : "divider-gold";
        parts.push( html`<hr class="${ tone } divider-short">` );
    }
    return html`${ parts }`;
}

module.exports = {
    SECTION_RENDERERS: SECTION_RENDERERS,
    sectionClassFor: sectionClassFor,
    hasRenderer: hasRenderer,
    renderSection: renderSection,
    renderChrome: renderChrome
};
