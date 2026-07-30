/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Capture reporting: totals, per-purpose and per-edition counts, and CSV export. Pure functions over a record array,
 * so the aggregation is testable without a store, a request or a role.
 *
 * CSV EXPORT IS A SECURITY BOUNDARY, not just a formatting job. A spreadsheet treats a cell beginning `=`, `+`, `-`
 * or `@` as a formula, so a value that arrived from a query string (`source`) or a form field can execute when the
 * export is opened -- the classic CSV-injection path. Every field is escaped for CSV *and* neutralised against
 * formula interpretation before it is written.
 */

// Excel/Sheets treat these leading characters as the start of a formula.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const EXPORT_COLUMNS = [ "email", "purpose", "edition", "source", "locale", "consentAt", "createdAt" ];

/**
 * Totals and breakdowns for the admin view.
 *
 * @param {Object[]} records
 * @returns {{ total: number, byPurpose: Object<string, number>, byEdition: Object<string, number>, uniqueEmails: number }}
 */
function summarise( records ) {
    const list = Array.isArray( records ) ? records : [];
    const byPurpose = {};
    const byEdition = {};
    const emails = new Set();

    for ( const record of list ) {
        if ( !record ) {
            continue;
        }
        const purpose = record.purpose || "(none)";
        byPurpose[ purpose ] = ( byPurpose[ purpose ] || 0 ) + 1;
        if ( record.edition ) {
            byEdition[ record.edition ] = ( byEdition[ record.edition ] || 0 ) + 1;
        }
        if ( record.email ) {
            emails.add( String( record.email ).toLowerCase() );
        }
    }

    return { total: list.length, byPurpose: byPurpose, byEdition: byEdition, uniqueEmails: emails.size };
}

/**
 * Neutralises a value against spreadsheet formula interpretation, then escapes it for CSV.
 *
 * @param {*} value
 * @returns {string}
 */
function csvCell( value ) {
    let text = ( value === null || value === undefined ) ? "" : String( value );
    if ( FORMULA_LEAD.test( text ) ) {
        // A leading apostrophe is what spreadsheets read as "this is text"; the cell still shows the original value.
        text = "'" + text;
    }
    if ( /["\n\r,]/.test( text ) ) {
        text = "\"" + text.replace( /"/g, "\"\"" ) + "\"";
    }
    return text;
}

/**
 * Renders the records as CSV.
 *
 * @param {Object[]} records
 * @param {{ columns?: string[] }} [options]
 * @returns {string}
 */
function toCsv( records, options ) {
    const columns = ( options && Array.isArray( options.columns ) ) ? options.columns : EXPORT_COLUMNS;
    const list = Array.isArray( records ) ? records : [];
    const lines = [ columns.map( csvCell ).join( "," ) ];
    for ( const record of list ) {
        lines.push( columns.map( ( column ) => csvCell( record ? record[ column ] : "" ) ).join( "," ) );
    }
    // CRLF, because that is what the CSV RFC specifies and what spreadsheets import most predictably.
    return lines.join( "\r\n" ) + "\r\n";
}

module.exports = {
    summarise: summarise,
    toCsv: toCsv,
    csvCell: csvCell,
    EXPORT_COLUMNS: EXPORT_COLUMNS
};
