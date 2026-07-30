/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The document shell -- noise layer, skip link, topbar, footer. Everything here is driven by `context.site`, never by
 * a hard-coded name, link or palette: this package is generic and must contain nothing site-specific.
 *
 * The noise layer is a real element and the FIRST child of <body>, so it never traps a stacking context it should
 * not. The skip link follows it, before any navigation, so a keyboard user reaches the content without walking the
 * topbar.
 *
 * The language control is a SELECTOR, not a toggle. `translationOf` may be null, and the choice matters: omitting the
 * other language makes a bilingual site look monolingual, and linking it to a path that does not exist produces a
 * 404. So an unavailable counterpart renders as an inert option that says why.
 */

const { html, raw } = require( "#html" );

const DEFAULT_LANGUAGE_NAMES = { en: "English", bg: "Български" };

/**
 * The fixed noise overlay. Purely decorative, so it is hidden from assistive technology.
 *
 * @returns {import("./html.js").SafeString}
 */
function renderNoiseLayer() {
    return html`<div class="noise-layer" aria-hidden="true"></div>`;
}

/**
 * The skip link. Targets the same id the document's <main> carries.
 *
 * @param {Object} labels
 * @returns {import("./html.js").SafeString}
 */
function renderSkipLink( labels ) {
    return html`<a class="skip-link" href="#content">${ ( labels && labels.skipToContent ) || "Skip to content" }</a>`;
}

/**
 * The language selector. Emits one option per configured language: a link when that language has a counterpart (or
 * is the current page), an inert span with a note when it does not.
 *
 * @param {Object} context  Uses `site.languages`, `lang`, `counterpart`, `labels`.
 * @returns {import("./html.js").SafeString}
 */
function renderLangSelect( context ) {
    const site = context.site || {};
    const languages = Array.isArray( site.languages ) ? site.languages : [];
    if ( languages.length < 2 ) {
        return raw( "" );
    }

    const labels = context.labels || {};
    const names = Object.assign( {}, DEFAULT_LANGUAGE_NAMES, site.languageNames || {} );
    const current = context.lang;
    const counterpart = context.counterpart;

    const options = languages.map( ( language ) => {
        const name = names[ language ] || language;
        if ( language === current ) {
            return html`<a class="lang-select-option lang-select-option-current" href="${ context.path || "#" }">${ name }</a>`;
        }
        if ( counterpart && counterpart.lang === language ) {
            return html`<a class="lang-select-option" href="${ counterpart.path }">${ name }</a>`;
        }
        // No counterpart record: say so rather than hiding the language or linking to a 404.
        return html`<span class="lang-select-option lang-select-option-unavailable">${ name } <span class="lang-select-note">${ labels.notOnThisPage || "not on this page" }</span></span>`;
    } );

    return html`<div class="lang-select"><button class="lang-select-trigger" type="button" aria-expanded="false">${ String( current || "" ).toUpperCase() } <span class="lang-select-caret">▾</span></button><div class="lang-select-menu">${ options }</div></div>`;
}

/**
 * The topbar: brand, primary navigation, the mobile toggle, and the language selector. A nav entry matching the
 * current path is marked current and carries aria-current.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderTopbar( context ) {
    const site = context.site || {};
    const labels = context.labels || {};

    const logo = site.logo ? html`<img class="topbar-logo" src="${ site.logo }" alt="">` : raw( "" );
    const title = site.title ? html`<p class="topbar-title">${ site.title }</p>` : raw( "" );

    const entries = Array.isArray( site.nav ) ? site.nav : [];
    const links = entries.filter( ( entry ) => entry && entry.href ).map( ( entry ) => {
        const isCurrent = isCurrentPath( entry.href, context.path );
        return isCurrent
            ? html`<a class="topbar-link topbar-link-current" href="${ entry.href }" aria-current="page">${ entry.label }</a>`
            : html`<a class="topbar-link" href="${ entry.href }">${ entry.label }</a>`;
    } );

    const nav = links.length
        ? html`<nav class="topbar-nav" aria-label="${ labels.primaryNav || "Primary" }">${ links }</nav><button class="topbar-toggle" type="button">${ labels.menu || "Menu" }</button>`
        : raw( "" );

    return html`<header class="topbar"><div class="topbar-inner"><div class="topbar-brand">${ logo }${ title }</div>${ nav }${ renderLangSelect( context ) }</div></header>`;
}

/**
 * True when a nav href addresses the page currently being rendered. An exact match, plus a section match for a
 * non-root href, so `/writings/` stays marked while reading `/writings/some-post/`.
 *
 * @param {string} href
 * @param {string} [path]
 * @returns {boolean}
 */
function isCurrentPath( href, path ) {
    if ( !path || !href ) {
        return false;
    }
    if ( href === path ) {
        return true;
    }
    return href !== "/" && path.indexOf( href ) === 0;
}

/**
 * The site footer: link columns, tagline, social links, legal line -- all configured, none hard-coded.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderFooter( context ) {
    const site = context.site || {};
    const footer = site.footer || {};

    const columns = ( Array.isArray( footer.columns ) ? footer.columns : [] ).map( ( column ) => {
        const heading = column.heading ? html`<p class="footer-heading">${ column.heading }</p>` : raw( "" );
        const links = ( Array.isArray( column.links ) ? column.links : [] )
            .filter( ( link ) => link && link.href )
            .map( ( link ) => html`<a href="${ link.href }">${ link.label }</a>` );
        return html`<div>${ heading }<nav class="footer-nav">${ links }</nav></div>`;
    } );

    const social = ( Array.isArray( footer.social ) ? footer.social : [] )
        .filter( ( link ) => link && link.href )
        .map( ( link ) => html`<a href="${ link.href }">${ link.label }</a>` );

    const asideParts = [];
    if ( footer.tagline ) {
        asideParts.push( html`<p class="footer-tagline">${ footer.tagline }</p>` );
    }
    if ( social.length ) {
        asideParts.push( html`<div class="footer-social">${ social }</div>` );
    }
    const aside = asideParts.length ? html`<div>${ asideParts }</div>` : raw( "" );
    const legal = footer.legal ? html`<p class="footer-legal">${ footer.legal }</p>` : raw( "" );

    return html`<footer class="site-footer"><div class="footer-inner">${ columns }${ aside }${ legal }</div></footer>`;
}

module.exports = {
    renderNoiseLayer: renderNoiseLayer,
    renderSkipLink: renderSkipLink,
    renderLangSelect: renderLangSelect,
    renderTopbar: renderTopbar,
    renderFooter: renderFooter,
    isCurrentPath: isCurrentPath
};
