/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Escaping HTML tagged template. Every interpolated value is HTML-escaped by DEFAULT; raw() is the explicit,
 * auditable opt-out, permitted in exactly two places (CLAUDE.md 8): markdown output from markdown.js, and legacy
 * WordPress HTML sanitised once at import. A value that is already a SafeString (a nested html`` result or a raw())
 * is inserted as-is, so templates compose without double-escaping. Arrays are rendered element-by-element.
 */

/**
 * A string already known to be safe HTML -- the result of {@link html} or {@link raw}. Interpolating one into
 * another template inserts it verbatim (no re-escaping).
 */
class SafeString {

    /**
     * @param {string} value  Pre-escaped/known-safe HTML.
     */
    constructor( value ) {
        this.value = ( value === null || value === undefined ) ? "" : String( value );
    }

    /**
     * @returns {string}
     */
    toString() {
        return this.value;
    }
}

/**
 * HTML-escapes the five significant characters. Ampersand is replaced first so the other replacements are not
 * double-escaped.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeHtml( value ) {
    return String( value )
        .replace( /&/g, "&amp;" )
        .replace( /</g, "&lt;" )
        .replace( />/g, "&gt;" )
        .replace( /"/g, "&quot;" )
        .replace( /'/g, "&#39;" );
}

/**
 * Resolves one interpolated value to a string: null/undefined -> empty; a SafeString -> its verbatim value; an
 * array -> each element resolved and concatenated; anything else -> escaped.
 *
 * @param {*} value
 * @returns {string}
 */
function resolveValue( value ) {
    if ( value === null || value === undefined ) {
        return "";
    }
    if ( value instanceof SafeString ) {
        return value.value;
    }
    if ( Array.isArray( value ) ) {
        let out = "";
        for ( const item of value ) {
            out += resolveValue( item );
        }
        return out;
    }
    return escapeHtml( value );
}

/**
 * Tagged template that escapes every interpolation by default and returns a {@link SafeString}.
 *
 * @param {string[]} strings
 * @param {...*} values
 * @returns {SafeString}
 */
function html( strings, ...values ) {
    let out = "";
    for ( let idx = 0; idx < strings.length; idx++ ) {
        out += strings[ idx ];
        if ( idx < values.length ) {
            out += resolveValue( values[ idx ] );
        }
    }
    return new SafeString( out );
}

/**
 * Marks a string as safe HTML, opting it out of escaping. Use ONLY for markdown output and import-sanitised legacy
 * HTML (CLAUDE.md 8).
 *
 * @param {*} value
 * @returns {SafeString}
 */
function raw( value ) {
    return new SafeString( value );
}

/**
 * A heading with one run of text accented.
 *
 * The accent is placed WHERE IT APPEARS in the title, so any word can carry it -- `title: "Welcome to my Page"` with
 * `titleAccent: "Welcome"` accents the first word, which the old design does and an append-only accent could never
 * express. When the accented text is not part of the title it is appended instead, which is the long-standing
 * behaviour and what `title: "The"` + `titleAccent: "Scarlet"` relies on.
 *
 * Both halves of the split are interpolated, never concatenated as markup, so the title is escaped exactly as any
 * other interpolation is (CLAUDE.md 8). Only the span itself is structural.
 *
 * @param {string} title
 * @param {string} [accentText]
 * @returns {SafeString}
 */
function accentedTitle( title, accentText ) {
    const text = ( title === null || title === undefined ) ? "" : String( title );
    const accent = ( accentText === null || accentText === undefined ) ? "" : String( accentText );
    if ( accent === "" ) {
        return html`${ text }`;
    }
    const at = text.indexOf( accent );
    if ( at === -1 ) {
        return text === ""
            ? html`<span class="accent">${ accent }</span>`
            : html`${ text } <span class="accent">${ accent }</span>`;
    }
    return html`${ text.slice( 0, at ) }<span class="accent">${ accent }</span>${ text.slice( at + accent.length ) }`;
}

module.exports = {
    html: html,
    raw: raw,
    escapeHtml: escapeHtml,
    accentedTitle: accentedTitle,
    SafeString: SafeString
};
