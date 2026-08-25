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
const OPTIONAL_COLUMNS = Object.freeze( [ "employment_status", "birth_date", "gender", "specialization", "starting_date", "work_site", "position_name" ] );

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const GENDERS = Object.freeze( [ "M", "F" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Cyrillic letters whose uppercase glyph is indistinguishable from a Latin one in every common font. Used ONLY to
// explain a failed match (see foldConfusables) — never to resolve one.
const CONFUSABLE_TO_LATIN = Object.freeze( {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X"
} );

// `mapRow` OMITS these three fields entirely — it never writes an explicit `null` — when their CSV cell is blank.
// That is deliberate: `employee.schema.json` types `personal.birthDate` and `career.startingDate` as
// `format: "date"` strings (and `personal.gender` as a plain string), none of them with `"null"` in their `type`,
// so writing an explicit `null` would fail schema validation. `DataManager#saveEmployee` persists through
// `cache.editJSON`, which issues a Redis `JSON.MERGE` — RFC 7386 merge-patch semantics, where an omitted key is
// left untouched and only an explicit `null` deletes it. So a blank cell for one of these three can never change
// the stored value; the merge just leaves it exactly as it was. `#isSameRecord` has to agree with that, or a row
// whose stored record already carries one of these keeps reclassifying as `update` on every single run forever,
// re-auditing a write that changes nothing.
// <br/>
// `career.specialization` is deliberately NOT in this list: `mapRow` sets it to an explicit `null` on a blank
// cell (its schema type permits `null`), and under merge-patch an explicit `null` DELETES the key — so
// specialization genuinely converges to `null` in storage and must keep being compared like every other field.
// Adding it here would make specialization changes silently un-importable.
// <br/>
// `personal.workSite` and `career.positionName` (CA-109) join them for the same mechanical reason and one
// deliberate one: an HR export that omits a column's values must not wipe every office assignment in a single
// irreversible apply. The cost is that neither field can be CLEARED by re-importing a blank cell — that is
// Employee Management's job, exactly as it already is for birthDate and gender.
const LEAVE_UNCHANGED_WHEN_OMITTED = Object.freeze( [
    { group: "personal", field: "birthDate" },
    { group: "personal", field: "gender" },
    { group: "career", field: "startingDate" },
    { group: "personal", field: "workSite" },
    { group: "career", field: "positionName" }
] );

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
     * <br/>
     * `options.withLines` is additive and opt-in, and changes the return shape (see `@returns`) only when set. The
     * default (omitted or falsy) is byte-identical to every prior release — the 22 tests in
     * `organization-import.parse.test.js` pin exactly that. When set, the return also carries the 1-based physical
     * line in `text` on which each returned row STARTS. A row is one physical line only when it contains no quoted
     * embedded newline; blank lines are skipped exactly as in the default mode, so two rows that are adjacent in
     * the returned array are not necessarily on adjacent physical lines. This is what lets a caller (`toRecords`,
     * and the CLI beyond it) name a rejection by its true source line rather than by its position in this array.
     *
     * @method
     * @param {string} text
     * @param {Object} [options]
     * @param {string} [options.delimiter] - Overrides auto-detection.
     * @param {boolean} [options.withLines] - When true, returns `{ rows, lines }` instead of `rows` alone.
     * @returns {Array<Array<string>>|{rows: Array<Array<string>>, lines: Array<number>}}
     * @public
     */
    parseDelimited( text, options ) {
        const opts = options || {};
        const source = this.#stripBOM( String( text == null ? "" : text ) );
        const delimiter = opts.delimiter || this.detectDelimiter( source );
        const withLines = !!opts.withLines;

        const rows = [];
        const lines = [];
        let record = [];
        let field = "";
        let inQuotes = false;
        let dirty = false;
        // 1-based, mirroring how every editor and error message counts lines. `currentLine` advances on every
        // literal "\n" consumed, whether inside a quoted field or not — a physical newline is a physical newline
        // either way. `recordStartLine` is only ever set once per record: at the moment the PREVIOUS record ended
        // (or at the very start of the text), so a newline swallowed by a quoted field mid-record advances
        // `currentLine` without moving the start line already captured for that record.
        let currentLine = 1;
        let recordStartLine = 1;

        const endField = () => {
            record.push( field );
            field = "";
        };
        const endRecord = () => {
            endField();
            if ( dirty ) {
                rows.push( record );
                if ( withLines ) {
                    lines.push( recordStartLine );
                }
            }
            record = [];
            dirty = false;
            recordStartLine = currentLine;
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
                    if ( character === "\n" ) {
                        currentLine++;
                    }
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
                currentLine++;
                endRecord();
            } else if ( character !== "\r" ) {
                field += character;
                if ( character.trim().length > 0 ) {
                    dirty = true;
                }
            }
        }
        endRecord();

        return withLines ? { rows: rows, lines: lines } : rows;
    }

    /**
     * Turns parsed rows into objects keyed by the trimmed, lower-cased header cells. Field values pass through
     * verbatim — no trimming or case-folding — the same as `parseDelimited` returns them; that asymmetry between
     * header and value handling is deliberate, e.g. a leading zero in an employee ID must survive. A short row is
     * padded rather than dropped, so it still reports its own missing fields. Pure.
     * <br/>
     * Each record carries a `__row` property so a rejection can name its row without echoing any of its contents.
     * Without `lines`, `__row` is this record's 1-based position within `rows` — which, because `parseDelimited`
     * skips blank lines and collapses a quoted embedded newline into the one row it belongs to, is generally NOT
     * the same as the physical line in the source file. Pass `lines` — the parallel array from
     * `parseDelimited( text, { withLines: true } ).lines` — to get the true physical line instead: `__row` then
     * holds `lines[ i ]` for the row at index `i` (falling back to the row's position wherever `lines` is absent
     * or short, so this stays defensive rather than throwing on a mismatched array). A caller that needs the true
     * source line for operator-facing output — the import CLI is the reason this exists — must parse with
     * `withLines: true` and pass the resulting `lines` through here; omitting it keeps the original, row-position
     * behaviour byte-identical.
     *
     * @method
     * @param {Array<Array<string>>} rows
     * @param {Array<number>} [lines] - Physical start line per row, from `parseDelimited`'s `withLines` mode.
     *   Aligned by index with `rows`, header included. Omit to keep `__row` as the record's position within `rows`.
     * @returns {{header: Array<string>, records: Array<Object>}}
     * @public
     */
    toRecords( rows, lines ) {
        const list = Array.isArray( rows ) ? rows : [];
        if ( list.length === 0 ) {
            return { header: [], records: [] };
        }
        const header = ( list[ 0 ] || [] ).map( ( cell ) => String( cell == null ? "" : cell ).trim().toLowerCase() );
        const lineStarts = Array.isArray( lines ) ? lines : [];
        const records = [];
        for ( let i = 1; i < list.length; i++ ) {
            const row = list[ i ] || [];
            const record = { __row: ( lineStarts[ i ] !== undefined ) ? lineStarts[ i ] : i + 1 };
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

        const rawGender = read( "gender" );
        const gender = rawGender.length === 0 ? "" : this.#matchEnum( rawGender, GENDERS );
        if ( rawGender.length > 0 && !gender ) {
            return fail( "gender", "not-a-permitted-value", `'gender' must be one of: ${ GENDERS.join( ", " ) }` );
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
        const startingDate = read( "starting_date" );
        const workSite = read( "work_site" );
        const positionName = read( "position_name" );

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
                ...( gender ? { gender: gender } : {} ),
                ...( workSite ? { workSite: workSite } : {} )
            },
            career: {
                organizationUnitID: read( "organization_unit_id" ),
                roleFamily: read( "role_family" ).toUpperCase(),
                specialization: specialization.length > 0 ? specialization.toUpperCase() : null,
                level: read( "level" ).toUpperCase(),
                stage: stage,
                ...( startingDate ? { startingDate: startingDate } : {} ),
                ...( positionName ? { positionName: positionName } : {} )
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
     * Replaces every Cyrillic character that is glyph-identical to a Latin one with that Latin letter. Pure.
     * <br/>
     * **This exists to phrase an error, never to accept a value.** The real HR data contains a Stara Zagora site
     * coded `О5` with a Cyrillic О while every sibling uses a Latin O; the two render identically and compare
     * unequal, so an unknown-code rejection would list `O5` as permitted, pixel-identical to what the operator
     * typed. Folding lets {@link OrganizationImport#describeWorkSiteMiss} say which character is wrong. Folding to
     * *match* would be the synonym table this module refuses everywhere else, and would file a person under a site
     * they were never assigned to.
     *
     * @method
     * @param {string} [text]
     * @returns {string}
     * @public
     */
    foldConfusables( text ) {
        return String( text == null ? "" : text ).replace( /[Ѐ-ӿ]/g, ( character ) => CONFUSABLE_TO_LATIN[ character ] || character );
    }

    /**
     * Explains why a work-site code matched nothing, or returns `null` when it in fact matched. Pure.
     * <br/>
     * Returns `{ code: "confusable-character", match }` when the code folds onto a real site — the operator typed a
     * lookalike letter — and `{ code: "unknown-work-site", match: null }` otherwise. A non-null return always means
     * the value is **rejected**; the distinction only changes what the operator is told.
     *
     * @method
     * @param {string} rawCode - The code as supplied.
     * @param {Object<string, WorkSite>} sites - The work-sites nomenclature.
     * @returns {{code: string, match: string|null}|null}
     * @public
     */
    describeWorkSiteMiss( rawCode, sites ) {
        const known = sites || {};
        const code = String( rawCode == null ? "" : rawCode );
        if ( known[ code ] ) {
            return null;
        }
        const folded = this.foldConfusables( code );
        if ( folded !== code && known[ folded ] ) {
            return { code: "confusable-character", match: folded };
        }
        return { code: "unknown-work-site", match: null };
    }

    /**
     * Builds a `row number → raw employee_id` lookup from the parsed records, so a mapping-stage rejection — whose
     * error object carries only the row number and column (see {@link OrganizationImport#mapRow}) — can still be
     * labeled by the id the operator actually put in that row, and so that same id can be reconciled against
     * `plan.absent` (see {@link OrganizationImport#excludeMappingErrorsFromAbsent} below). Shared by every driver
     * (the CLI and the employee-import screen) so the row→id lookup is defined exactly once. Pure.
     *
     * @method
     * @param {Array<Object>} records - From {@link OrganizationImport#toRecords}.
     * @returns {Map<number, string>} Row number → trimmed `employee_id` (empty string when the cell itself was blank).
     * @public
     */
    mapRowsToEmployeeIDs( records ) {
        const byRow = new Map();
        for ( const record of ( Array.isArray( records ) ? records : [] ) ) {
            byRow.set( record.__row, String( record.employee_id == null ? "" : record.employee_id ).trim() );
        }
        return byRow;
    }

    /**
     * Turns one mapping-stage error into the same rejection shape {@link OrganizationImport#reconcile} produces,
     * labeled by the row's real `employee_id` whenever the row provided one. `mapRow` rejects before ever building
     * an `Employee`, so its error carries only the row number, not the id — even though the raw CSV cell is sitting
     * right there in the source record. Falls back to the display placeholder `'(unmapped)'` only when the id is
     * genuinely absent (e.g. the row failed on the empty `employee_id` column itself), never for any other reason.
     * The raw value is printed verbatim and no other cell is ever surfaced. That is data minimisation, not an
     * exemption: an `employee_id` is an identification number, and GDPR Art. 4(1) names exactly that as an
     * identifier of an identifiable person, so a rejection list is pseudonymised personal data and is handled as
     * such. What minimisation buys is that it carries no name, email, birth date or grade — nothing that
     * identifies anyone without the HR key. Pure.
     * <br/>
     * `unmapped` carries the same fact as the placeholder, out of band. The placeholder is a *display* string and
     * nothing may branch on it: the import contract requires only that `employee_id` be non-empty, so a real
     * employee could legitimately hold the literal id `(unmapped)`, and a consumer comparing the string would then
     * mistake that person's row for a row that had no id at all.
     *
     * @method
     * @param {Object} error - One entry from {@link OrganizationImport#mapRows}'s `errors`.
     * @param {Map<number, string>} rowEmployeeIDs - From {@link OrganizationImport#mapRowsToEmployeeIDs}.
     * @returns {{employeeID: string, unmapped: boolean, row: number, code: string, message: string}}
     * @public
     */
    toMappingRejection( error, rowEmployeeIDs ) {
        const rawID = rowEmployeeIDs.get( error.row );
        return {
            employeeID: rawID ? rawID : "(unmapped)",
            unmapped: !rawID,
            row: error.row,
            code: error.code,
            message: `${ error.column }: ${ error.message }`
        };
    }

    /**
     * Removes from `absent` every id a mapping-stage rejection already accounts for. A row that fails mapping never
     * becomes an `Employee`, so it never reaches {@link OrganizationImport#reconcile} and its id is never added to
     * reconcile's own seenIDs; when that same id also belongs to a currently-stored employee, reconcile reports it
     * as "absent from the file" even though the row is right there, just rejected at an earlier stage. Left alone,
     * the plan would tell the operator to terminate a leaver right next to a rejection naming that same
     * employee_id. This lives here rather than inside reconcile() because reconcile() is a verified pure function
     * that correctly knows nothing about rows that never reached it — the two lists only disagree once a driver
     * merges the mapping errors in, so this is where the disagreement must be resolved too. Pure.
     * <br/>
     * A rejection whose row carried no id at all names nobody, so it can subtract nobody. That is read from the
     * `unmapped` flag rather than by comparing `employeeID` to the `(unmapped)` placeholder: `employee_id` need
     * only be non-empty, so an employee may legitimately hold that literal id, and a string comparison would then
     * refuse to subtract the one person it was meant to — reporting them absent while their rejected row sits in
     * the list directly above.
     *
     * @method
     * @param {Array<string>} absent - `plan.absent`, from {@link OrganizationImport#reconcile}.
     * @param {Array<Object>} mappingRejections - From {@link OrganizationImport#toMappingRejection}.
     * @returns {Array<string>}
     * @public
     */
    excludeMappingErrorsFromAbsent( absent, mappingRejections ) {
        const mappingErrorIDs = new Set(
            ( Array.isArray( mappingRejections ) ? mappingRejections : [] )
                .filter( ( rejection ) => rejection && !rejection.unmapped )
                .map( ( rejection ) => rejection.employeeID )
        );
        return ( Array.isArray( absent ) ? absent : [] ).filter( ( id ) => !mappingErrorIDs.has( id ) );
    }

    /**
     * Whether the file's text shows evidence of a decoding failure. Node's `'utf8'` decoding substitutes U+FFFD for
     * an undecodable byte instead of throwing, so a CP1251 export of Cyrillic names arrives as a string full of
     * replacement characters rather than as an error — and would otherwise be written to the store as mojibake.
     * Returns a code, not prose: each driver phrases it for its own audience. Pure.
     *
     * @method
     * @param {string} [text]
     * @returns {{code: string}|null}
     * @public
     */
    findEncodingFailure( text ) {
        return String( text == null ? "" : text ).includes( "�" ) ? { code: "not-utf8" } : null;
    }

    /**
     * Whether the parsed header is unusable as a whole, as opposed to a row being invalid. Two conditions qualify,
     * checked in this order:
     *  - a required column is absent, so no row could ever be mapped;
     *  - a column is repeated, which is fatal rather than per-row because {@link OrganizationImport#toRecords} keys
     *    each record by header cell — two columns normalizing to the same key silently overwrite, and the earlier
     *    column's data vanishes with no error anywhere.
     * Empty header cells are ignored: a trailing delimiter produces them and they name nothing. Pure.
     *
     * @method
     * @param {Array<string>} [header]
     * @returns {{code: string, columns: Array<string>}|null}
     * @public
     */
    findHeaderFailure( header ) {
        const cells = Array.isArray( header ) ? header : [];
        const missing = REQUIRED_COLUMNS.filter( ( column ) => !cells.includes( column ) );
        if ( missing.length > 0 ) {
            return { code: "missing-columns", columns: missing };
        }
        const duplicated = cells.filter( ( column, index ) => column.length > 0 && cells.indexOf( column ) !== index );
        if ( duplicated.length > 0 ) {
            return { code: "duplicate-columns", columns: Array.from( new Set( duplicated ) ) };
        }
        return null;
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
        const rejectedIDs = new Set();
        // Rejected rows are tracked by object identity, not by employeeID: when employeeIDs collide the id no
        // longer identifies a single row, and every row must yield exactly one rejection entry so the plan's
        // counts reconcile against the file the operator supplied.
        const rejectedRows = new Set();

        const reject = ( employee, code, message ) => {
            if ( rejectedRows.has( employee ) ) {
                return;
            }
            rejectedRows.add( employee );
            plan.rejected.push( { employeeID: String( employee.employeeID ), row: employee.__row, code: code, message: message } );
            rejectedIDs.add( String( employee.employeeID ) );
        };

        // Pass 1 — collisions within the batch itself. Group by key first, then reject whole groups: treating the
        // first occurrence as special both LOST a row (a duplicate employeeID's first row was skipped by pass 2 via
        // rejectedIDs without ever being rejected) and DOUBLE-COUNTED one (three rows sharing an email produced four
        // rejection entries, because the first was re-rejected against each later duplicate).
        const groupsByID = new Map();
        const groupsByEmail = new Map();
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( !groupsByID.has( id ) ) {
                groupsByID.set( id, [] );
            }
            groupsByID.get( id ).push( candidate );

            const email = String( candidate.email == null ? "" : candidate.email ).trim().toLowerCase();
            if ( email ) {
                if ( !groupsByEmail.has( email ) ) {
                    groupsByEmail.set( email, [] );
                }
                groupsByEmail.get( email ).push( candidate );
            }
        }

        for ( const [ id, group ] of groupsByID ) {
            if ( group.length < 2 ) {
                continue;
            }
            for ( const candidate of group ) {
                reject( candidate, "duplicate-employee-id", `employee_id '${ id }' appears ${ group.length } times in this file` );
            }
        }

        for ( const group of groupsByEmail.values() ) {
            if ( group.length < 2 ) {
                continue;
            }
            for ( const candidate of group ) {
                // Every participant is named: any one of them could be the wrong record, and the operator needs the set.
                const others = group.filter( ( other ) => other !== candidate ).map( ( other ) => `'${ String( other.employeeID ) }'` );
                reject( candidate, "duplicate-email", `this email is also used by employee_id ${ others.join( ", " ) } in this file` );
            }
        }

        const seenIDs = new Set( groupsByID.keys() );

        // Pass 2 — validity and classification.
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( rejectedIDs.has( id ) ) {
                continue;
            }

            const violation = employeeRules.instance.validateEmployee( candidate, context );
            if ( violation ) {
                // A confusable work-site code (CA-109) gets its own message naming the offending character, with a
                // rejection `code` that deliberately does NOT start with "error." — `rejectionLabel` on the import
                // screen resolves any "error."-prefixed code through the label table, which would silently discard
                // this prose (and does today the moment `error.employee.invalid-work-site` gains a label of its
                // own). The value is still rejected exactly like any other violation; only the wording changes.
                if ( violation === "error.employee.invalid-work-site" ) {
                    const miss = this.describeWorkSiteMiss( candidate.personal && candidate.personal.workSite, context.workSites );
                    if ( miss && miss.code === "confusable-character" ) {
                        reject( candidate, miss.code, `work_site '${ candidate.personal.workSite }' uses a Cyrillic character; the permitted code '${ miss.match }' is spelled with Latin letters` );
                        continue;
                    }
                }
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

    /**
     * Applies a plan through the injected writer, sequentially so a partial failure leaves a comprehensible store.
     * Only `create` and `update` are written; `unchanged`, `rejected` and `absent` are never touched — which is what
     * makes a re-run of the same file a no-op.
     *
     * @method
     * @param {Object} plan - From {@link OrganizationImport#reconcile}.
     * @param {{save: function(Employee): Promise, audit: function(Object): Promise}} writer
     * @returns {Promise<{created: number, updated: number, skipped: number}>}
     * @public
     */
    applyPlan( plan, writer ) {
        const safe = plan || {};
        const creates = Array.isArray( safe.create ) ? safe.create : [];
        const updates = Array.isArray( safe.update ) ? safe.update : [];
        const skipped = Array.isArray( safe.unchanged ) ? safe.unchanged.length : 0;

        const steps = creates.map( ( employee ) => () => {
            return writer.save( employee ).then( ( saved ) => writer.audit( {
                subjectType: "employee",
                subjectID: String( employee.employeeID ),
                field: "__created__",
                oldValue: null,
                newValue: saved || employee
            } ) );
        } ).concat( updates.map( ( change ) => () => {
            return writer.save( change.employee ).then( ( saved ) => writer.audit( {
                subjectType: "employee",
                subjectID: String( change.employee.employeeID ),
                field: "__imported__",
                oldValue: change.previous,
                newValue: saved || change.employee
            } ) );
        } ) );

        return steps.reduce( ( chain, step ) => chain.then( step ), Promise.resolve() )
            .then( () => ( { created: creates.length, updated: updates.length, skipped: skipped } ) );
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
     * <br/>
     * Mirrors the writer's merge-patch semantics for the fields named in {@link LEAVE_UNCHANGED_WHEN_OMITTED}
     * (module-level, top of this file): when `candidate` omits one of them, it compares as equal to whatever
     * `previous` holds on that field alone — a write of `candidate` can never change it, so a diff there would be
     * fictitious. When `candidate` does carry a value for one of those fields, it compares normally, same as every
     * other field.
     *
     * @method
     * @param {Employee} previous
     * @param {Employee} candidate
     * @returns {boolean}
     * @private
     */
    #isSameRecord( previous, candidate ) {
        const normalize = ( employee ) => ( {
            employeeID: String( employee.employeeID ),
            email: String( employee.email == null ? "" : employee.email ).trim().toLowerCase(),
            employmentStatus: employee.employmentStatus || "active",
            personal: {
                firstName: employee.personal && employee.personal.firstName,
                lastName: employee.personal && employee.personal.lastName,
                workMode: employee.personal && employee.personal.workMode,
                workLocation: employee.personal && employee.personal.workLocation,
                birthDate: ( employee.personal && employee.personal.birthDate ) || null,
                gender: ( employee.personal && employee.personal.gender ) || null,
                workSite: ( employee.personal && employee.personal.workSite ) || null
            },
            career: {
                organizationUnitID: employee.career && employee.career.organizationUnitID,
                roleFamily: employee.career && employee.career.roleFamily,
                specialization: ( employee.career && employee.career.specialization ) || null,
                level: employee.career && employee.career.level,
                stage: employee.career && employee.career.stage,
                startingDate: ( employee.career && employee.career.startingDate ) || null,
                positionName: ( employee.career && employee.career.positionName ) || null
            }
        } );

        const previousNormalized = normalize( previous );
        const candidateNormalized = normalize( candidate );

        // An omitted field on the incoming candidate can never be written — the merge leaves whatever is stored
        // in place — so force that one field to compare equal regardless of what `previous` holds. Every other
        // field (and these three, when `candidate` does carry a value) still compares normally below.
        for ( const { group, field } of LEAVE_UNCHANGED_WHEN_OMITTED ) {
            const candidateGroup = ( candidate && candidate[ group ] ) || {};
            if ( !Object.prototype.hasOwnProperty.call( candidateGroup, field ) ) {
                previousNormalized[ group ][ field ] = candidateNormalized[ group ][ field ];
            }
        }

        return JSON.stringify( previousNormalized ) === JSON.stringify( candidateNormalized );
    }

}

const instance = new OrganizationImport();
module.exports.instance = Object.freeze( instance );
