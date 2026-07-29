/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Media-bearing section bodies: hero, gallery, audio.
 *
 * The audio player emits static, accessible markup only -- a real <button> with an aria-label and a rail whose
 * progress element the site script drives. It carries no inline width: a progress percentage cannot be a style
 * attribute under the contract, so the script sets a CSS custom property on the rail instead.
 */

const { html, raw } = require( "#html" );

/**
 * `hero` -- the page opener. `title` may carry an accented fragment, which the theme colours; the accent is a span
 * rather than a second heading so the title remains one string for assistive technology.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderHero( section ) {
    const media = section.background
        ? html`<div class="hero-media"><img src="${ section.background }" alt="${ section.backgroundAlt || "" }"></div>`
        : raw( "" );

    const accent = section.titleAccent ? html` <span class="accent">${ section.titleAccent }</span>` : raw( "" );
    const parts = [];
    if ( section.pretitle ) {
        parts.push( html`<p class="hero-pretitle">${ section.pretitle }</p>` );
    }
    if ( section.title || section.titleAccent ) {
        // h1 when the hero opens the document, h2 when it is one section among several.
        parts.push( section.primary === true
            ? html`<h1 class="hero-title">${ section.title || "" }${ accent }</h1>`
            : html`<h2 class="hero-title">${ section.title || "" }${ accent }</h2>` );
    }
    if ( section.subtitle ) {
        parts.push( html`<p class="hero-subtitle">${ section.subtitle }</p>` );
    }
    if ( section.tagline ) {
        parts.push( html`<p class="hero-tagline">${ section.tagline }</p>` );
    }
    if ( section.intro ) {
        parts.push( html`<p class="hero-intro">${ section.intro }</p>` );
    }

    const foot = section.scrollHint
        ? html`<div class="hero-foot"><p class="scroll-hint">${ section.scrollHint }</p></div>`
        : raw( "" );

    return html`${ media }<div class="hero-content">${ parts }</div>${ foot }`;
}

/**
 * `gallery` -- figures with captions. `alt` is required per image for the picture to mean anything without sight of
 * it; an empty string is accepted (decorative) but the attribute is always present.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderGallery( section ) {
    const images = Array.isArray( section.images ) ? section.images : [];
    if ( images.length === 0 ) {
        return raw( "" );
    }
    const items = images.filter( ( image ) => image && image.src ).map( ( image ) => {
        const caption = image.caption ? html`<figcaption class="gallery-caption">${ image.caption }</figcaption>` : raw( "" );
        return html`<figure class="gallery-item"><img src="${ image.src }" alt="${ image.alt || "" }">${ caption }</figure>`;
    } );
    return html`<div class="gallery">${ items }</div>`;
}

/**
 * `audio` -- a preview player. The rail is inert markup; the site script wires playback and sets the progress width
 * through a custom property, never an inline style.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
function renderAudio( section ) {
    const title = section.title ? html`<p class="audio-title">${ section.title }</p>` : raw( "" );
    const subtitle = section.subtitle ? html`<p class="audio-subtitle">${ section.subtitle }</p>` : raw( "" );
    const source = section.src ? html` data-src="${ section.src }"` : raw( "" );
    const label = section.playLabel || "Play preview";
    return html`${ title }${ subtitle }<div class="audio-player"${ source }><button class="audio-play" type="button" aria-label="${ label }">▶</button><div class="audio-rail"><div class="audio-rail-progress"></div></div><span class="audio-time">${ section.duration || "0:00" }</span></div>`;
}

module.exports = {
    renderHero: renderHero,
    renderGallery: renderGallery,
    renderAudio: renderAudio
};
