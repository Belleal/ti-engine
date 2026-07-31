/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The `dictionary` section -- a lexicon rendered as a section on a page, not a content type of its own.
 *
 * Two contract rules shape this markup, and both exist so the visual state cannot drift from the announced state:
 *
 * 1. The header bar IS the toggle: a real <button> carrying aria-expanded and aria-controls. The caret rotation is
 *    driven by [aria-expanded="true"], so there is no separate open class to forget to keep in sync.
 * 2. `data-role` and `data-letter` are the filter's contract. The client reads them and toggles the `hidden`
 *    attribute (never a style), so a server-side filtered render produces the same DOM minus the hidden nodes.
 *
 * `.dictionary-count` reports the WHOLE lexicon when no filter is active -- not the number of rows currently in the
 * DOM -- so a filtered view never misrepresents how much the lexicon holds.
 */

const { html, raw } = require( "#html" );

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split( "" );

/**
 * `dictionary` -- toolbar, jump index, count, and the grouped collapsible entries.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
function renderDictionary( section, context ) {
    const entries = Array.isArray( section.entries ) ? section.entries : [];
    const labels = ( context && context.labels ) || {};

    const groups = groupEntries( entries );
    const present = new Set( groups.map( ( group ) => group.letter ) );

    const roles = [ ...new Set( entries.map( ( entry ) => entry && entry.role ).filter( Boolean ) ) ].sort();
    const roleOptions = roles.map( ( role ) => html`<option value="${ role }">${ role }</option>` );

    // Both controls are unlabelled by design and carry aria-label only.
    const toolbar = html`<div class="dictionary-toolbar"><div class="dictionary-controls"><input class="dictionary-search" type="search" aria-label="${ labels.dictionarySearch || "Search the lexicon" }" placeholder="${ labels.dictionarySearchPlaceholder || "Search…" }"><select class="dictionary-select" aria-label="${ labels.dictionaryFilterRole || "Filter by role" }"><option value="">${ labels.dictionaryAllRoles || "All roles" }</option>${ roleOptions }</select></div><nav class="dictionary-jump" aria-label="${ labels.dictionaryJump || "Jump to letter" }"><span class="dictionary-jump-label">${ labels.dictionaryJumpLabel || "Jump to" }</span><ul class="dictionary-index">${ LETTERS.map( ( letter ) => {
        const empty = present.has( letter ) ? "" : " dictionary-index-link-empty";
        return html`<li><a class="dictionary-index-link${ raw( empty ) }" data-letter="${ letter }" href="#letter-${ letter }">${ letter }</a></li>`;
    } ) }</ul></nav></div>`;

    const count = html`<p class="dictionary-count">${ formatCount( entries.length, labels ) }</p>`;

    const rendered = groups.map( ( group ) => html`<div class="dictionary-group" data-letter="${ group.letter }"><h3 class="dictionary-group-letter" id="letter-${ group.letter }">${ group.letter }</h3><div class="dictionary-entries">${ group.entries.map( renderEntry ) }</div></div>` );

    return html`${ toolbar }${ count }<div class="dictionary-groups">${ rendered }</div>`;
}

/**
 * Groups entries by their first letter, preserving alphabetical order within each group.
 *
 * @param {Object[]} entries
 * @returns {Array<{ letter: string, entries: Object[] }>}
 */
function groupEntries( entries ) {
    const buckets = new Map();
    for ( const entry of entries ) {
        if ( !entry || !entry.headword ) {
            continue;
        }
        const letter = String( entry.headword ).charAt( 0 ).toUpperCase();
        if ( buckets.has( letter ) === false ) {
            buckets.set( letter, [] );
        }
        buckets.get( letter ).push( entry );
    }
    return [ ...buckets.keys() ].sort().map( ( letter ) => ( {
        letter: letter,
        entries: buckets.get( letter ).slice().sort( ( a, b ) => String( a.headword ).localeCompare( String( b.headword ) ) )
    } ) );
}

/**
 * The lexicon size line. Reports the full lexicon, independent of any active filter.
 *
 * @param {number} total
 * @param {Object} labels
 * @returns {string}
 */
function formatCount( total, labels ) {
    if ( labels.dictionaryCount ) {
        return String( labels.dictionaryCount ).replace( "{count}", String( total ) );
    }
    return total === 1 ? "1 entry" : total + " entries";
}

/**
 * One collapsible entry. `.dictionary-entry-rich` plus the `◇` marker signal that a declension table sits behind the
 * row, so a reader can see there is more before opening anything.
 *
 * @param {Object} entry
 * @param {number} index
 * @returns {import("../html.js").SafeString}
 */
function renderEntry( entry, index ) {
    const slug = entrySlug( entry, index );
    const detailId = "entry-" + slug;
    const rich = hasForms( entry );
    const classes = rich ? "dictionary-entry dictionary-entry-rich" : "dictionary-entry";

    const translit = entry.transliteration ? html`<span class="dictionary-translit">${ entry.transliteration }</span>` : raw( "" );
    const marker = rich ? html`<span class="dictionary-marker" aria-hidden="true">◇</span>` : raw( "" );
    const role = entry.role ? html`<span class="dictionary-entry-role">${ entry.role }</span>` : raw( "" );
    const gloss = entry.gloss ? html`<span class="dictionary-entry-gloss">${ entry.gloss }</span>` : raw( "" );

    const detailParts = [];
    if ( entry.pronunciation ) {
        detailParts.push( html`<p class="dictionary-pronunciation-row"><span class="dictionary-pronunciation-label">Pronunciation</span><span class="dictionary-pronunciation">${ entry.pronunciation }</span></p>` );
    }
    if ( rich ) {
        detailParts.push( renderForms( entry.forms ) );
    }
    if ( entry.note ) {
        detailParts.push( html`<p class="dictionary-note">${ entry.note }</p>` );
    }

    return html`<article class="${ classes }" data-role="${ entry.role || "" }"><button class="dictionary-entry-toggle" type="button" aria-expanded="false" aria-controls="${ detailId }"><span class="dictionary-entry-word"><span class="dictionary-headword">${ entry.headword }</span>${ translit }${ marker }</span>${ role }${ gloss }<span class="dictionary-entry-caret" aria-hidden="true">▲</span></button><div class="dictionary-entry-detail" id="${ detailId }" hidden>${ detailParts }</div></article>`;
}

/**
 * @param {Object} entry
 * @returns {boolean}
 */
function hasForms( entry ) {
    return !!( entry.forms && Array.isArray( entry.forms.rows ) && entry.forms.rows.length > 0 );
}

/**
 * A declension table. Every cell carries `data-label` so the mobile stack can label each form through `td::before`
 * without duplicating the text in the markup.
 *
 * @param {{ caption?: string, columns?: string[], rows: Array<{ header?: string, cells: string[] }> }} forms
 * @returns {import("../html.js").SafeString}
 */
function renderForms( forms ) {
    const columns = Array.isArray( forms.columns ) ? forms.columns : [];
    const caption = forms.caption ? html`<p class="dictionary-forms-caption">${ forms.caption }</p>` : raw( "" );
    const head = columns.length
        ? html`<thead><tr>${ [ html`<th></th>` ].concat( columns.map( ( column ) => html`<th>${ column }</th>` ) ) }</tr></thead>`
        : raw( "" );

    const body = forms.rows.map( ( row ) => {
        const header = row.header ? html`<th scope="row">${ row.header }</th>` : raw( "" );
        // `data-label` is what the stacked mobile layout shows in place of the column header, so an empty one leaves
        // a value with nothing saying which form it is. With no configured columns the position is at least a
        // truthful label -- less useful than a name, but not a mystery.
        const cells = ( Array.isArray( row.cells ) ? row.cells : [] ).map( ( cell, index ) =>
            html`<td data-label="${ columns[ index ] || String( index + 1 ) }">${ cell }</td>` );
        return html`<tr>${ header }${ cells }</tr>`;
    } );

    return html`<div class="dictionary-forms">${ caption }<table class="dictionary-forms-table">${ head }<tbody>${ body }</tbody></table></div>`;
}

/**
 * A DOM-safe id fragment for an entry. Falls back to the index so two entries can never share an id even if their
 * headwords normalise identically.
 *
 * @param {Object} entry
 * @param {number} index
 * @returns {string}
 */
function entrySlug( entry, index ) {
    const base = String( entry.id || entry.headword || "" ).toLowerCase().replace( /[^a-z0-9]+/g, "-" ).replace( /^-+|-+$/g, "" );
    return base || "n" + index;
}

module.exports = {
    renderDictionary: renderDictionary,
    groupEntries: groupEntries,
    renderEntry: renderEntry
};
