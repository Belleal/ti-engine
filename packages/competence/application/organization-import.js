/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Pure employee-import pipeline: `parseDelimited` → `mapRows` → `reconcile` → `applyPlan`. Performs no I/O — the
 * caller supplies the file contents and injects the store lookups and the writer, mirroring the {@link RoleResolver}
 * pattern. That is what lets the same rules serve the CLI today and an HRIS sync later without change.
 * <br/>
 * The CSV parser is hand-written rather than a dependency because the module must be reachable at runtime: a future
 * admin upload screen and a sync driver both call it, so a build-time devDependency (the `marked` pattern) would be
 * the wrong shape.
 *
 * @class OrganizationImport
 * @singleton
 * @public
 */
class OrganizationImport {

    static #instance = null;

    /**
     * @constructor
     * @returns {OrganizationImport}
     */
    constructor() {
        if ( !OrganizationImport.#instance ) {
            OrganizationImport.#instance = this;
        }
        return OrganizationImport.#instance;
    }

    /* Public interface */

    /**
     * Picks the delimiter from the header line by counting `,` and `;` occurrences that fall outside quoted
     * spans, so a human-titled column such as `"Last, First"` cannot masquerade as an extra delimiter. Excel
     * exports semicolon-delimited files in a European locale, which would otherwise parse as a single unnamed
     * column. Ties favour the comma. Pure.
     * <br/>
     * Known limitation: the header line is taken by splitting the whole text on `\r?\n`, so a header cell that
     * itself contains a quoted newline would truncate the line mid-quote and could still miscount. That input is
     * pathological for a header row and is intentionally not handled here.
     *
     * @method
     * @param {string} text
     * @returns {string}
     * @public
     */
    detectDelimiter( text ) {
        const source = this.#stripBOM( String( text == null ? "" : text ) );
        const headerLine = source.split( /\r?\n/ )[ 0 ] || "";
        const semicolons = this.#countOutsideQuotes( headerLine, ";" );
        const commas = this.#countOutsideQuotes( headerLine, "," );
        return ( semicolons > commas ) ? ";" : ",";
    }

    /**
     * RFC 4180-style parser: quoted fields, embedded delimiters and newlines, doubled quotes, CRLF, and a leading
     * UTF-8 BOM. Blank lines are skipped. This is lenient rather than strict about one thing: an unterminated
     * quote at end of input is treated as implicitly closed rather than rejected, so a malformed trailing quote
     * does not raise an error — it simply ends the field (and record) where the input does. Values are returned
     * verbatim — no trimming — so a leading zero in an ID survives. Pure.
     *
     * @method
     * @param {string} text
     * @param {Object} [options]
     * @param {string} [options.delimiter] - Overrides auto-detection.
     * @returns {Array<Array<string>>}
     * @public
     */
    parseDelimited( text, options ) {
        const opts = options || {};
        const source = this.#stripBOM( String( text == null ? "" : text ) );
        const delimiter = opts.delimiter || this.detectDelimiter( source );

        const rows = [];
        let record = [];
        let field = "";
        let inQuotes = false;
        let dirty = false;

        const endField = () => {
            record.push( field );
            field = "";
        };
        const endRecord = () => {
            endField();
            if ( dirty ) {
                rows.push( record );
            }
            record = [];
            dirty = false;
        };

        for ( let i = 0; i < source.length; i++ ) {
            const character = source[ i ];
            if ( inQuotes ) {
                if ( character === "\"" ) {
                    if ( source[ i + 1 ] === "\"" ) {
                        field += "\"";
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += character;
                }
                dirty = true;
                continue;
            }
            if ( character === "\"" ) {
                inQuotes = true;
                dirty = true;
            } else if ( character === delimiter ) {
                endField();
                dirty = true;
            } else if ( character === "\n" ) {
                endRecord();
            } else if ( character !== "\r" ) {
                field += character;
                if ( character.trim().length > 0 ) {
                    dirty = true;
                }
            }
        }
        endRecord();

        return rows;
    }

    /**
     * Turns parsed rows into objects keyed by the trimmed, lower-cased header cells. Field values pass through
     * verbatim — no trimming or case-folding — the same as `parseDelimited` returns them; that asymmetry between
     * header and value handling is deliberate, e.g. a leading zero in an employee ID must survive. Each
     * record carries a `__row` property holding its 1-based line number in the source file, so a rejection can
     * name the row without echoing any of its contents. A short row is padded rather than dropped, so it still
     * reports its own missing fields. Pure.
     *
     * @method
     * @param {Array<Array<string>>} rows
     * @returns {{header: Array<string>, records: Array<Object>}}
     * @public
     */
    toRecords( rows ) {
        const list = Array.isArray( rows ) ? rows : [];
        if ( list.length === 0 ) {
            return { header: [], records: [] };
        }
        const header = ( list[ 0 ] || [] ).map( ( cell ) => String( cell == null ? "" : cell ).trim().toLowerCase() );
        const records = [];
        for ( let i = 1; i < list.length; i++ ) {
            const row = list[ i ] || [];
            const record = { __row: i + 1 };
            header.forEach( ( key, index ) => {
                record[ key ] = String( row[ index ] == null ? "" : row[ index ] );
            } );
            records.push( record );
        }
        return { header: header, records: records };
    }

    /* Private interface */

    /**
     * Counts occurrences of `delimiter` in `line` that fall outside a quoted span, mirroring the quote state
     * machine in `parseDelimited`: a doubled quote (`""`) is treated as an escaped quote rather than a state
     * toggle.
     *
     * @method
     * @param {string} line
     * @param {string} delimiter
     * @returns {number}
     * @private
     */
    #countOutsideQuotes( line, delimiter ) {
        let count = 0;
        let inQuotes = false;
        for ( let i = 0; i < line.length; i++ ) {
            const character = line[ i ];
            if ( character === "\"" ) {
                if ( inQuotes && line[ i + 1 ] === "\"" ) {
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if ( character === delimiter && !inQuotes ) {
                count++;
            }
        }
        return count;
    }

    /**
     * @method
     * @param {string} text
     * @returns {string}
     * @private
     */
    #stripBOM( text ) {
        return ( text.charCodeAt( 0 ) === 0xFEFF ) ? text.slice( 1 ) : text;
    }

}

const instance = new OrganizationImport();
module.exports.instance = Object.freeze( instance );
