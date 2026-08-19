/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const employeeRules = require( "#employee-rules" );

// The CSV column contract. Documented in INSTALL.md; `--template` emits exactly this header.
const REQUIRED_COLUMNS = Object.freeze( [
    "employee_id", "email", "first_name", "last_name", "work_mode", "work_location",
    "organization_unit_id", "role_family", "level", "stage"
] );
const OPTIONAL_COLUMNS = Object.freeze( [ "employment_status", "birth_date", "gender", "specialization", "starting_date" ] );

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

    /**
     * The CSV column contract.
     *
     * @property
     * @returns {{required: Array<string>, optional: Array<string>}}
     * @public
     */
    get COLUMNS() {
        return Object.freeze( { required: REQUIRED_COLUMNS, optional: OPTIONAL_COLUMNS } );
    }

    /**
     * Maps one CSV record onto the nested employee shape, coercing types and normalizing the fixed enums. Returns
     * either an employee or the first error found — never both. Pure.
     * <br/>
     * Enum normalization is mechanical (trim, lower-case, collapse spaces/underscores/hyphens), never a synonym
     * table: guessing what `FT` meant is how a person is silently graded wrong. An unmatched value is rejected with
     * the permitted values named.
     * <br/>
     * No error message ever contains a personal field — only the column, a code, and the permitted values.
     *
     * @method
     * @param {Object} record
     * @returns {{employee: Employee|null, error: Object|null}}
     * @public
     */
    mapRow( record ) {
        const source = record || {};
        const rowNumber = source.__row;
        const fail = ( column, code, message ) => ( { employee: null, error: { row: rowNumber, column: column, code: code, message: message } } );
        const read = ( column ) => String( source[ column ] == null ? "" : source[ column ] ).trim();

        for ( const column of REQUIRED_COLUMNS ) {
            if ( read( column ).length === 0 ) {
                return fail( column, "required", `'${ column }' is required and was empty` );
            }
        }

        const workMode = this.#matchEnum( read( "work_mode" ), WORK_MODES );
        if ( !workMode ) {
            return fail( "work_mode", "not-a-permitted-value", `'work_mode' must be one of: ${ WORK_MODES.join( ", " ) }` );
        }
        const workLocation = this.#matchEnum( read( "work_location" ), WORK_LOCATIONS );
        if ( !workLocation ) {
            return fail( "work_location", "not-a-permitted-value", `'work_location' must be one of: ${ WORK_LOCATIONS.join( ", " ) }` );
        }

        const rawStatus = read( "employment_status" );
        const employmentStatus = rawStatus.length === 0 ? "active" : this.#matchEnum( rawStatus, EMPLOYMENT_STATUSES );
        if ( !employmentStatus ) {
            return fail( "employment_status", "not-a-permitted-value", `'employment_status' must be one of: ${ EMPLOYMENT_STATUSES.join( ", " ) }` );
        }

        const rawStage = read( "stage" );
        if ( !/^\d+$/.test( rawStage ) ) {
            return fail( "stage", "not-an-integer", "'stage' must contain only digits" );
        }
        const stage = Number( rawStage );

        for ( const column of [ "birth_date", "starting_date" ] ) {
            const value = read( column );
            if ( value.length > 0 && !ISO_DATE.test( value ) ) {
                return fail( column, "not-a-date", `'${ column }' must be an ISO-8601 date, formatted YYYY-MM-DD` );
            }
        }

        const specialization = read( "specialization" );
        const birthDate = read( "birth_date" );
        const gender = read( "gender" );
        const startingDate = read( "starting_date" );

        const employee = {
            // The source line number travels with the record so `reconcile` can name the offending line without
            // echoing any of its contents. `reconcile` strips it before the record reaches the plan, so it is never
            // persisted.
            __row: rowNumber,
            employeeID: read( "employee_id" ),
            email: read( "email" ).toLowerCase(),
            employmentStatus: employmentStatus,
            personal: {
                firstName: read( "first_name" ),
                lastName: read( "last_name" ),
                workMode: workMode,
                workLocation: workLocation,
                ...( birthDate ? { birthDate: birthDate } : {} ),
                ...( gender ? { gender: gender } : {} )
            },
            career: {
                organizationUnitID: read( "organization_unit_id" ),
                roleFamily: read( "role_family" ).toUpperCase(),
                specialization: specialization.length > 0 ? specialization.toUpperCase() : null,
                level: read( "level" ).toUpperCase(),
                stage: stage,
                ...( startingDate ? { startingDate: startingDate } : {} )
            }
        };
        return { employee: employee, error: null };
    }

    /**
     * Maps every record, collecting mapped employees and per-row errors separately. A bad row never stops the ones
     * around it. Pure.
     *
     * @method
     * @param {Array<Object>} records
     * @returns {{employees: Array<Employee>, errors: Array<Object>}}
     * @public
     */
    mapRows( records ) {
        const employees = [];
        const errors = [];
        for ( const record of ( Array.isArray( records ) ? records : [] ) ) {
            const { employee, error } = this.mapRow( record );
            if ( error ) {
                errors.push( error );
            } else {
                employees.push( employee );
            }
        }
        return { employees: employees, errors: errors };
    }

    /**
     * Classifies every mapped employee against the current store, returning a plan rather than performing any write.
     * The plan is what makes dry-run free: the preview and the applied change come from this one function, so a
     * dry-run cannot diverge from what apply does. Pure.
     * <br/>
     * Reconciliation is keyed on `employeeID`, never email — a person who changes their name or address must keep
     * the same record, and with it their evaluation history. A shared email is a rejection rather than a warning,
     * because it makes the login index ambiguous and locks out **both** employees.
     * <br/>
     * An employee present in the store but absent from the file is reported and left untouched. A departure is never
     * inferred from an omission: a partial export would otherwise terminate half the organization.
     *
     * @method
     * @param {Array<Employee>} employees - Mapped candidates, from {@link OrganizationImport#mapRows}.
     * @param {Array<Employee>} existing - Every employee currently stored.
     * @param {EmployeeRulesContext} context
     * @returns {{create: Array, update: Array, unchanged: Array, rejected: Array, absent: Array}}
     * @public
     */
    reconcile( employees, existing, context ) {
        const candidates = Array.isArray( employees ) ? employees : [];
        const stored = Array.isArray( existing ) ? existing : [];
        const plan = { create: [], update: [], unchanged: [], rejected: [], absent: [] };

        const storedByID = new Map( stored.filter( ( e ) => e && e.employeeID ).map( ( e ) => [ String( e.employeeID ), e ] ) );
        const seenIDs = new Set();
        const seenEmails = new Map();
        const rejectedIDs = new Set();

        const reject = ( employee, code, message ) => {
            plan.rejected.push( { employeeID: String( employee.employeeID ), row: employee.__row, code: code, message: message } );
            rejectedIDs.add( String( employee.employeeID ) );
        };

        // Pass 1 — collisions within the batch itself.
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( seenIDs.has( id ) ) {
                reject( candidate, "duplicate-employee-id", `employee_id '${ id }' appears more than once in this file` );
            }
            seenIDs.add( id );

            const email = String( candidate.email == null ? "" : candidate.email ).trim().toLowerCase();
            if ( email ) {
                const previous = seenEmails.get( email );
                if ( previous ) {
                    // Both participants are named: either could be the wrong one, and the operator needs the pair.
                    reject( previous, "duplicate-email", `this email is also used by employee_id '${ id }' in this file` );
                    reject( candidate, "duplicate-email", `this email is also used by employee_id '${ String( previous.employeeID ) }' in this file` );
                } else {
                    seenEmails.set( email, candidate );
                }
            }
        }

        // Pass 2 — validity and classification.
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( rejectedIDs.has( id ) ) {
                continue;
            }

            const violation = employeeRules.instance.validateEmployee( candidate, context );
            if ( violation ) {
                reject( candidate, violation, `record is not valid: ${ violation }` );
                continue;
            }

            const collision = employeeRules.instance.findEmailCollision( candidate.email, id, stored );
            if ( collision ) {
                reject( candidate, "duplicate-email", `this email is already held by stored employee_id '${ collision }'` );
                continue;
            }

            // Strip the row marker here: it exists only to name a line in a rejection, and must never be persisted.
            const record = this.#withoutRowMarker( candidate );
            const previous = storedByID.get( id );
            if ( !previous ) {
                plan.create.push( record );
            } else if ( this.#isSameRecord( previous, record ) ) {
                plan.unchanged.push( record );
            } else {
                plan.update.push( { employee: record, previous: previous } );
            }
        }

        for ( const id of storedByID.keys() ) {
            if ( !seenIDs.has( id ) ) {
                plan.absent.push( id );
            }
        }

        return plan;
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

    /**
     * Matches a raw cell against a fixed enum, normalizing case and separators only. Returns the canonical value, or
     * `null` when nothing matches. Pure.
     *
     * @method
     * @param {string} raw
     * @param {Array<string>} allowed
     * @returns {string|null}
     * @private
     */
    #matchEnum( raw, allowed ) {
        const normalize = ( value ) => String( value == null ? "" : value ).trim().toLowerCase().replace( /[\s_-]+/g, "-" );
        const target = normalize( raw );
        if ( !target ) {
            return null;
        }
        for ( const candidate of allowed ) {
            if ( normalize( candidate ) === target ) {
                return candidate;
            }
        }
        return null;
    }

    /**
     * Returns the record without the `__row` marker that {@link OrganizationImport#mapRow} attaches. The marker
     * exists only so a rejection can name its source line; it must never reach the store. Pure.
     *
     * @method
     * @param {Employee} employee
     * @returns {Employee}
     * @private
     */
    #withoutRowMarker( employee ) {
        const { __row, ...record } = employee || {};
        return record;
    }

    /**
     * Whether a stored record and a candidate are identical for import purposes. Compares the fields the importer
     * writes, ignoring key order and any property the importer never sets. Pure.
     *
     * @method
     * @param {Employee} previous
     * @param {Employee} candidate
     * @returns {boolean}
     * @private
     */
    #isSameRecord( previous, candidate ) {
        const normalize = ( employee ) => JSON.stringify( {
            employeeID: String( employee.employeeID ),
            email: String( employee.email == null ? "" : employee.email ).trim().toLowerCase(),
            employmentStatus: employee.employmentStatus || "active",
            personal: {
                firstName: employee.personal && employee.personal.firstName,
                lastName: employee.personal && employee.personal.lastName,
                workMode: employee.personal && employee.personal.workMode,
                workLocation: employee.personal && employee.personal.workLocation,
                birthDate: ( employee.personal && employee.personal.birthDate ) || null,
                gender: ( employee.personal && employee.personal.gender ) || null
            },
            career: {
                organizationUnitID: employee.career && employee.career.organizationUnitID,
                roleFamily: employee.career && employee.career.roleFamily,
                specialization: ( employee.career && employee.career.specialization ) || null,
                level: employee.career && employee.career.level,
                stage: employee.career && employee.career.stage,
                startingDate: ( employee.career && employee.career.startingDate ) || null
            }
        } );
        return normalize( previous ) === normalize( candidate );
    }

}

const instance = new OrganizationImport();
module.exports.instance = Object.freeze( instance );
