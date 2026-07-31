/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * World-building section bodies: characterCards, agePanels, timeStrip, timeline.
 *
 * These are where the colour-coding rule bites (markup-contract.md): "the structure carries the colour; the words
 * carry the contrast." An era's hue lives on the panel border, a phase's hue on the strip partition -- never on the
 * label text, which stays a legible token. Each component therefore emits a modifier class for the hue and leaves
 * the text classes untinted; a renderer needs no knowledge of contrast ratios.
 */

const { html, raw } = require( "#html" );

// Accepted modifier values, so an unexpected record value cannot inject a class name.
const CARD_ACCENTS = new Set( [ "scarlet", "gold", "neutral" ] );
const ERA_KEYS = new Set( [ "faithless", "liranarand", "lasthope" ] );
const PHASE_KEYS = new Set( [ "daylight", "blood", "moonlight", "dark" ] );

/**
 * `characterCards` -- portrait, name, title, description, and an optional pulled line of dialogue.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderCharacterCards( section ) {
    const cards = Array.isArray( section.cards ) ? section.cards : [];
    if ( cards.length === 0 ) {
        return raw( "" );
    }
    const rendered = cards.filter( Boolean ).map( ( card ) => {
        const accent = CARD_ACCENTS.has( card.accent ) ? card.accent : "neutral";
        const image = card.image
            ? html`<div class="character-image"><img src="${ card.image }" alt="${ card.imageAlt || "" }"></div>`
            : raw( "" );
        const parts = [];
        if ( card.name ) {
            parts.push( html`<h4 class="character-name">${ card.name }</h4>` );
        }
        if ( card.title ) {
            parts.push( html`<p class="character-title">${ card.title }</p>` );
        }
        if ( card.text ) {
            parts.push( html`<p class="character-desc">${ card.text }</p>` );
        }
        if ( card.quote ) {
            parts.push( html`<p class="character-quote">${ card.quote }</p>` );
        }
        return html`<article class="character-card card-accent-${ accent }">${ image }<div class="character-text">${ parts }</div></article>`;
    } );
    return html`<div class="character-cards">${ rendered }</div>`;
}

/**
 * `agePanels` -- the eras, each with its abbreviation, name, gloss, and dating notation. The era hue is carried by
 * the panel modifier; the label text stays a contrast-safe token.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderAgePanels( section ) {
    const panels = Array.isArray( section.panels ) ? section.panels : [];
    if ( panels.length === 0 ) {
        return raw( "" );
    }
    const rendered = panels.filter( Boolean ).map( ( panel ) => {
        const eraClass = ERA_KEYS.has( panel.era ) ? html` age-${ panel.era }` : raw( "" );
        const parts = [];
        if ( panel.label ) {
            parts.push( html`<p class="age-era-label">${ panel.label }</p>` );
        }
        if ( panel.name ) {
            parts.push( html`<h4 class="age-era-name">${ panel.name }</h4>` );
        }
        if ( panel.body ) {
            parts.push( html`<p class="age-era-desc">${ panel.body }</p>` );
        }
        if ( panel.notation ) {
            parts.push( html`<p class="age-era-notation">${ panel.notation }</p>` );
        }
        return html`<div class="age-panel${ eraClass }">${ parts }</div>`;
    } );
    return html`<div class="age-panels">${ rendered }</div>`;
}

/**
 * `timeStrip` -- the partitioned day. Each partition is an empty div whose phase class carries the hue; the legend
 * names the phases in legible text. (Generic name for what the site calls the day cycle -- the phase vocabulary
 * stays site-specific, the component does not.)
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderTimeStrip( section ) {
    const partitions = Array.isArray( section.partitions ) ? section.partitions : [];
    if ( partitions.length === 0 ) {
        return raw( "" );
    }
    const track = partitions.map( ( phase ) => {
        const phaseClass = PHASE_KEYS.has( phase ) ? html` phase-${ phase }` : raw( "" );
        return html`<div class="time-strip-partition${ phaseClass }"></div>`;
    } );
    const label = section.label ? html`<p class="time-strip-label">${ section.label }</p>` : raw( "" );
    const phases = Array.isArray( section.phaseLabels ) ? section.phaseLabels : [];
    const legend = phases.length
        ? html`<div class="time-strip-legend">${ phases.map( ( phase ) => html`<span class="time-strip-phase">${ phase }</span>` ) }</div>`
        : raw( "" );
    return html`<div class="time-strip">${ label }<div class="time-strip-track">${ track }</div>${ legend }</div>`;
}

/**
 * `timeline` -- an ordered list of dated events; `major` promotes an entry typographically.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderTimeline( section ) {
    const events = Array.isArray( section.events ) ? section.events : [];
    if ( events.length === 0 ) {
        return raw( "" );
    }
    const entries = events.filter( Boolean ).map( ( event ) => {
        const classes = event.major === true ? "timeline-entry timeline-entry-major" : "timeline-entry";
        const parts = [];
        if ( event.date ) {
            parts.push( html`<p class="timeline-year">${ event.date }</p>` );
        }
        if ( event.title ) {
            parts.push( html`<h4 class="timeline-event-title">${ event.title }</h4>` );
        }
        if ( event.body ) {
            parts.push( html`<p class="timeline-desc">${ event.body }</p>` );
        }
        return html`<li class="${ classes }">${ parts }</li>`;
    } );
    return html`<ol class="timeline">${ entries }</ol>`;
}

module.exports = {
    renderCharacterCards: renderCharacterCards,
    renderAgePanels: renderAgePanels,
    renderTimeStrip: renderTimeStrip,
    renderTimeline: renderTimeline
};
