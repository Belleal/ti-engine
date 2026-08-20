/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Operator CLI for the employee importer. Dry-run by default: writing requires an explicit `--apply`.
 *
 * Usage:
 *   node bin/build/import-organization.js --file employees.csv               # dry run, prints the plan
 *   node bin/build/import-organization.js --file employees.csv --apply       # writes
 *   node bin/build/import-organization.js --template > employees.csv         # emit the header row
 *   node bin/build/import-organization.js --file e.csv --delimiter ";"       # override detection
 *
 * Connects to the same Redis-backed cache the running application uses (the TI_MEMORY_CACHE_* variables — see
 * `printCacheUnavailable` below) and loads the store's current configuration the same way the app does at boot,
 * before reading or writing a single employee record. Without that connection, `DataManager` silently falls back to
 * its development-only seed data and every referential check would run against the shipped file-default
 * organization tree instead of this deployment's real one — a plan built that way is fiction, dry run or not. When
 * the cache never comes up, this tool refuses that fallback and fails closed instead (exit 2), bounded by a connect
 * timeout that defaults to 5000ms and can be raised with `TI_IMPORT_CACHE_CONNECT_TIMEOUT_MS` for an operator on a
 * slow link or a cold container.
 *
 * Output names rows by employee_id and line number only — never a name, email, date of birth or grading. This runs
 * against real HR data, and a terminal or CI log is not a place for it.
 *
 * Exits non-zero when any row is rejected, so a run is scriptable.
 */

const fs = require( "node:fs" );

const cache = require( "@ti-engine/core/cache" );
const exceptions = require( "@ti-engine/core/exceptions" );
const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const organizationImport = require( "#organization-import" );

// The same connection variables the running application reads (packages/core/utils/cache.js, by way of
// packages/core/utils/config.js). Listed here only to name them in the operator-facing message below — their
// values are read straight out of process.env by the framework itself, not by this file.
const CACHE_ENV_VARS = [
    "TI_MEMORY_CACHE_REDIS_HOST", "TI_MEMORY_CACHE_REDIS_PORT", "TI_MEMORY_CACHE_REDIS_DB",
    "TI_MEMORY_CACHE_AUTH_KEY", "TI_MEMORY_CACHE_USER"
];

// cache.instance.initialize() resolves only once Redis reports itself ready (see RedisClient#initialize), and —
// with no TI_MEMORY_CACHE_RETRY_MAX_ATTEMPTS set — ioredis's default retry strategy backs off but never gives up
// against a host it cannot reach at all. Left unbounded, that would turn a genuinely unreachable Redis into a CLI
// that hangs forever instead of failing closed. This is the bound that makes "unreachable" a reportable, bounded
// failure instead of a hang.
const DEFAULT_CACHE_CONNECT_TIMEOUT_MS = 5000;

// Overridable — an operator on a slow link or a cold container could otherwise false-fail on the default above with
// no recourse but editing this file. Named in the TI_-prefixed style the rest of this file's env-var references use
// (see CACHE_ENV_VARS above), scoped to this CLI rather than TI_MEMORY_CACHE_* since it bounds this tool's own
// connect wait, not anything core's cache module itself reads. printCacheUnavailable() below names it too.
const CACHE_CONNECT_TIMEOUT_ENV_VAR = "TI_IMPORT_CACHE_CONNECT_TIMEOUT_MS";

/**
 * Resolves the fail-closed cache-connect bound from the environment. Falls back to the default on anything that is
 * not a positive finite number — unset, empty, non-numeric, zero, or negative — rather than letting a typo turn
 * into a NaN or a zero/negative `setTimeout` delay, which would fire immediately and fail the CLI closed before
 * Redis ever had a chance to report ready. Pure.
 *
 * @method
 * @param {Object} env
 * @returns {number}
 * @private
 */
function resolveCacheConnectTimeoutMs( env ) {
    const raw = ( env || {} )[ CACHE_CONNECT_TIMEOUT_ENV_VAR ];
    const parsed = Number( raw );
    return ( raw !== undefined && raw !== "" && Number.isFinite( parsed ) && parsed > 0 ) ? parsed : DEFAULT_CACHE_CONNECT_TIMEOUT_MS;
}

const CACHE_CONNECT_TIMEOUT_MS = resolveCacheConnectTimeoutMs( process.env );

function parseArguments( argv ) {
    const args = { file: null, apply: false, template: false, delimiter: null };
    for ( let i = 0; i < argv.length; i++ ) {
        if ( argv[ i ] === "--file" ) args.file = argv[ ++i ];
        else if ( argv[ i ] === "--apply" ) args.apply = true;
        else if ( argv[ i ] === "--template" ) args.template = true;
        else if ( argv[ i ] === "--delimiter" ) args.delimiter = argv[ ++i ];
    }
    return args;
}

/**
 * Validates a `--delimiter` override before it ever reaches `parseDelimited`, which compares single characters —
 * so a multi-character value (e.g. an operator pasting the two-character text `;;`) would silently make every row
 * parse as a single column, and every row would then fail the `required` check with no clue as to why. This
 * rejects the bad input at the CLI boundary instead, where a clear message is possible; `parseDelimited` itself is
 * unchanged. `null`/`undefined` (no override given, including a trailing `--delimiter` with no value following it)
 * both mean "nothing to validate" — auto-detection still applies. Pure.
 *
 * @method
 * @param {string|null|undefined} delimiter
 * @returns {string|null} An error message, or `null` when the value is acceptable.
 * @private
 */
function validateDelimiter( delimiter ) {
    if ( delimiter == null ) {
        return null;
    }
    if ( delimiter.length !== 1 ) {
        return `--delimiter must be exactly one character; got '${ delimiter }' (${ delimiter.length } characters).`;
    }
    return null;
}

function printTemplate() {
    const columns = organizationImport.instance.COLUMNS;
    process.stdout.write( columns.required.concat( columns.optional ).join( "," ) + "\n" );
}

function printPlan( plan, applied ) {
    process.stdout.write( `\n${ applied ? "APPLIED" : "DRY RUN — nothing was written" }\n` );
    process.stdout.write( `  create    ${ plan.create.length }\n` );
    process.stdout.write( `  update    ${ plan.update.length }\n` );
    process.stdout.write( `  unchanged ${ plan.unchanged.length }\n` );
    process.stdout.write( `  rejected  ${ plan.rejected.length }\n` );
    process.stdout.write( `  in store but absent from the file: ${ plan.absent.length } (left untouched)\n` );

    if ( plan.rejected.length > 0 ) {
        process.stdout.write( "\nRejections:\n" );
        for ( const rejection of plan.rejected ) {
            const where = rejection.row ? `line ${ rejection.row }` : "unknown line";
            process.stdout.write( `  ${ where }, employee_id '${ rejection.employeeID }': ${ rejection.code } — ${ rejection.message }\n` );
        }
    }
    if ( plan.absent.length > 0 ) {
        process.stdout.write( `\nAbsent from the file (employee_id): ${ plan.absent.join( ", " ) }\n` );
        process.stdout.write( "A departure is never inferred from an omission — mark a leaver with employment_status=terminated.\n" );
    }
}

/**
 * Prints the fail-closed message for a cache that never became operational, naming the variables an operator needs
 * to set. This is the guard that keeps `DataManager`'s development-only seed fallback (see
 * `DataManager#fetchEmployees`) from ever being read silently by a tool that claims to operate on the real store.
 *
 * @method
 * @private
 */
function printCacheUnavailable() {
    process.stderr.write( `Unable to reach the Redis cache within ${ CACHE_CONNECT_TIMEOUT_MS }ms.\n` );
    process.stderr.write( `Set ${ CACHE_ENV_VARS.join( ", " ) } to the same values the running application uses, then retry.\n` );
    process.stderr.write( `On a slow link or a cold container, raise the bound with ${ CACHE_CONNECT_TIMEOUT_ENV_VAR } (currently ${ CACHE_CONNECT_TIMEOUT_MS }ms; default ${ DEFAULT_CACHE_CONNECT_TIMEOUT_MS }ms).\n` );
    process.stderr.write( "Refusing to continue: without a real connection this tool would silently plan against seed/demo data instead of the actual employee store.\n" );
}

/**
 * Connects to the same cache the running application uses, bounded so a genuinely unreachable Redis fails closed
 * instead of hanging this CLI forever — see the `CACHE_CONNECT_TIMEOUT_MS` comment above for why that bound exists.
 *
 * @method
 * @returns {Promise<boolean>} Whether the cache is operational once this settles.
 * @private
 */
function connectCache() {
    return new Promise( ( resolve ) => {
        let settled = false;
        let timer;
        const finish = () => {
            if ( !settled ) {
                settled = true;
                clearTimeout( timer );
                resolve( cache.instance.isOperational );
            }
        };
        timer = setTimeout( finish, CACHE_CONNECT_TIMEOUT_MS );
        // Neither branch needs its own value — finish() always reads the live isOperational getter instead — so the
        // same callback covers both settlement paths, including the one where initialize() itself rejects.
        cache.instance.initialize().then( finish, finish );
    } );
}

/**
 * Applies a reconciled plan through the real store, tracking how many records were actually written so a mid-apply
 * failure still leaves the operator with a number — and the specific record — to work from. There is no rollback
 * (INSTALL.md §11), so this is the only recovery handle they get.
 *
 * @method
 * @param {Object} plan - From {@link OrganizationImport#reconcile}.
 * @returns {Promise<number>} The process exit code.
 * @private
 */
function applyWithProgress( plan ) {
    // Mirrors the order applyPlan itself writes in (creates, then updates, each in array order) so `written` can be
    // used as a direct index into this list to name the record whose write did not complete.
    const ordered = plan.create.concat( plan.update.map( ( change ) => change.employee ) );
    let written = 0;

    const writer = {
        save: ( employee ) => dataManager.instance.saveEmployee( employee ).then( ( saved ) => {
            written++;
            return saved;
        } ),
        audit: ( entry ) => dataManager.instance.appendAuditEntry( Object.assign( { changedBy: "import-cli" }, entry ) )
    };

    return organizationImport.instance.applyPlan( plan, writer ).then( () => {
        printPlan( plan, true );
        return plan.rejected.length > 0 ? 1 : 0;
    } ).catch( ( error ) => {
        const failedRecord = ordered[ written ];
        process.stderr.write( `\nApply stopped after writing ${ written } of ${ ordered.length } planned record(s).\n` );
        if ( failedRecord ) {
            process.stderr.write( `The write for employee_id '${ failedRecord.employeeID }' is the one that did not complete.\n` );
        }
        process.stderr.write( "There is no rollback. Re-running the same file is safe: an already-written record now reconciles as unchanged and is skipped, so only the remaining records are attempted again.\n" );
        throw error;
    } );
}

/**
 * Builds a `row number → raw employee_id` lookup from the parsed records, so a mapping-stage rejection — whose
 * error object carries only the row number and column (see {@link OrganizationImport#mapRow}) — can still be
 * labeled by the id the operator actually put in that row, and so that same id can be reconciled against
 * `plan.absent` (see {@link excludeMappingErrorsFromAbsent} below). Pure.
 *
 * @method
 * @param {Array<Object>} records - From {@link OrganizationImport#toRecords}.
 * @returns {Map<number, string>} Row number → trimmed `employee_id` (empty string when the cell itself was blank).
 * @private
 */
function mapRowsToEmployeeIDs( records ) {
    const byRow = new Map();
    for ( const record of ( Array.isArray( records ) ? records : [] ) ) {
        byRow.set( record.__row, String( record.employee_id == null ? "" : record.employee_id ).trim() );
    }
    return byRow;
}

/**
 * Turns one mapping-stage error into the same rejection shape {@link OrganizationImport#reconcile} produces,
 * labeled by the row's real `employee_id` whenever the row provided one. `mapRow` rejects before ever building an
 * `Employee`, so its error carries only the row number, not the id — even though the raw CSV cell is sitting right
 * there in the source record. Falls back to `'(unmapped)'` only when the id is genuinely absent (e.g. the row
 * failed on the empty `employee_id` column itself), never for any other reason. The raw value is printed verbatim:
 * it is an identifier the operator supplied, not personal data, and no other cell is ever surfaced. Pure.
 *
 * @method
 * @param {Object} error - One entry from {@link OrganizationImport#mapRows}'s `errors`.
 * @param {Map<number, string>} rowEmployeeIDs - From {@link mapRowsToEmployeeIDs}.
 * @returns {Object}
 * @private
 */
function toMappingRejection( error, rowEmployeeIDs ) {
    const rawID = rowEmployeeIDs.get( error.row );
    return {
        employeeID: rawID ? rawID : "(unmapped)",
        row: error.row,
        code: error.code,
        message: `${ error.column }: ${ error.message }`
    };
}

/**
 * Removes from `absent` every id a mapping-stage rejection already accounts for. A row that fails mapping never
 * becomes an `Employee`, so it never reaches {@link OrganizationImport#reconcile} and its id is never added to
 * reconcile's own seenIDs; when that same id also belongs to a currently-stored employee, reconcile reports it as
 * "absent from the file" even though the row is right there, just rejected at an earlier stage. Left alone, the
 * plan would tell the operator to terminate a leaver right next to a rejection naming that same employee_id. This
 * lives here rather than inside reconcile() because reconcile() is a verified pure function that correctly knows
 * nothing about rows that never reached it — the two lists only disagree once the CLI merges the mapping errors
 * in, so this is where the disagreement must be resolved too. Pure.
 *
 * @method
 * @param {Array<string>} absent - `plan.absent`, from {@link OrganizationImport#reconcile}.
 * @param {Array<Object>} mappingRejections - From {@link toMappingRejection}.
 * @returns {Array<string>}
 * @private
 */
function excludeMappingErrorsFromAbsent( absent, mappingRejections ) {
    const mappingErrorIDs = new Set(
        ( Array.isArray( mappingRejections ) ? mappingRejections : [] )
            .map( ( rejection ) => rejection.employeeID )
            .filter( ( id ) => id !== "(unmapped)" )
    );
    return ( Array.isArray( absent ) ? absent : [] ).filter( ( id ) => !mappingErrorIDs.has( id ) );
}

/**
 * The part of a run that needs the real store: connect the cache (failing closed if it never comes up), load the
 * store's current configuration the same way the application does at boot, reconcile against the actual employee
 * store, and — for `--apply` — write. Shuts the cache down before returning on every outcome (success, a rejected
 * plan, or a thrown failure), so the process never hangs on an open Redis handle.
 *
 * @method
 * @param {Object} args
 * @param {Array<Object>} records - From {@link OrganizationImport#toRecords}; carried through only so a mapping
 *   error (which knows just its row number) can still be labeled by that row's real employee_id — see
 *   {@link mapRowsToEmployeeIDs}.
 * @param {Array<Object>} employees
 * @param {Array<Object>} errors
 * @returns {Promise<number>} The process exit code.
 * @private
 */
function runAgainstStore( args, records, employees, errors ) {
    return connectCache().then( ( operational ) => {
        if ( !operational ) {
            printCacheUnavailable();
            return 2;
        }

        // configurationLoader.initialize() must run before reconcile() below, for the same reason it must run
        // before the server's own buildOrganizationChart() (CA-107, bin/competence-web-server.js): reconcile()'s
        // referential checks are only meaningful against the STORED organization structure and role families, not
        // the shipped file defaults.
        return configurationLoader.initialize().then( () => dataManager.instance.fetchEmployees() ).then( ( existing ) => {
            const plan = organizationImport.instance.reconcile( employees, existing, {
                roleFamilies: configurationLoader.configRoleFamilies,
                organizationStructure: configurationLoader.configOrganizationStructure
            } );

            // Mapping errors are rejections too — merge them so one list is the whole truth, each labeled by the
            // row's real employee_id wherever the row provided one (see toMappingRejection).
            const rowEmployeeIDs = mapRowsToEmployeeIDs( records );
            const mappingRejections = errors.map( ( error ) => toMappingRejection( error, rowEmployeeIDs ) );
            plan.rejected = mappingRejections.concat( plan.rejected );
            // A row that failed mapping never reached reconcile(), so it must not ALSO be reported as absent from
            // the file — see excludeMappingErrorsFromAbsent for why the two lists would otherwise disagree.
            plan.absent = excludeMappingErrorsFromAbsent( plan.absent, mappingRejections );

            if ( !args.apply ) {
                printPlan( plan, false );
                return plan.rejected.length > 0 ? 1 : 0;
            }

            return applyWithProgress( plan );
        } );
    } ).finally( () => cache.instance.shutDown() );
}

/**
 * Formats an error for stderr. `TiException` (raised anywhere in the framework) is not a JS `Error` and carries no
 * `.message` — printing `error.message` on one prints the literal string "undefined". This reads the shape that IS
 * present instead (the exception's numeric code, its own id for cross-referencing a log line, and its
 * non-localized description), and deliberately never prints `.data`: a raised exception's data can carry the very
 * employee record that triggered it, and this output may land in a terminal or a CI log.
 *
 * @method
 * @param {*} error
 * @returns {string}
 * @private
 */
function formatError( error ) {
    if ( exceptions.isException( error ) ) {
        return `${ error.description || "unrecognized error" } (code ${ error.code }, ref ${ error.id })`;
    }
    if ( error instanceof Error && error.message ) {
        return error.message;
    }
    return String( error );
}

function run() {
    const args = parseArguments( process.argv.slice( 2 ) );

    const delimiterError = validateDelimiter( args.delimiter );
    if ( delimiterError ) {
        process.stderr.write( `${ delimiterError }\n` );
        return Promise.resolve( 2 );
    }

    if ( args.template ) {
        printTemplate();
        return Promise.resolve( 0 );
    }
    if ( !args.file ) {
        process.stderr.write( "Missing --file. Use --template to emit the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    let text;
    try {
        // 'utf8' replaces an undecodable byte with U+FFFD rather than throwing, so check for it explicitly: a
        // CP1251 export of Cyrillic names would otherwise be written to the store as mojibake.
        text = fs.readFileSync( args.file, "utf8" );
    } catch ( error ) {
        process.stderr.write( `Unable to read '${ args.file }': ${ error.message }\n` );
        return Promise.resolve( 2 );
    }
    if ( text.includes( "�" ) ) {
        process.stderr.write( "The file is not valid UTF-8. Re-export it as UTF-8 — a Windows-1251 export would store names as mojibake.\n" );
        return Promise.resolve( 2 );
    }

    const rows = organizationImport.instance.parseDelimited( text, args.delimiter ? { delimiter: args.delimiter } : undefined );
    const { header, records } = organizationImport.instance.toRecords( rows );

    const missing = organizationImport.instance.COLUMNS.required.filter( ( column ) => !header.includes( column ) );
    if ( missing.length > 0 ) {
        process.stderr.write( `The header is missing required column(s): ${ missing.join( ", " ) }\n` );
        process.stderr.write( "Run with --template to see the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    // A duplicate header cell is whole-file fatal, not a per-row rejection. `toRecords` keys records by header
    // cell, so two columns normalizing to the same key silently overwrite — the earlier column's data vanishes
    // with no error anywhere. Detect it here rather than in `toRecords`, which has no channel to report it.
    const duplicated = header.filter( ( column, index ) => column.length > 0 && header.indexOf( column ) !== index );
    if ( duplicated.length > 0 ) {
        process.stderr.write( `The header repeats column(s): ${ Array.from( new Set( duplicated ) ).join( ", " ) }\n` );
        process.stderr.write( "Header names are matched case-insensitively after trimming, so 'Note' and 'NOTE' collide.\n" );
        return Promise.resolve( 2 );
    }

    const { employees, errors } = organizationImport.instance.mapRows( records );

    return runAgainstStore( args, records, employees, errors );
}

if ( require.main === module ) {
    run().then( ( code ) => process.exit( code ) ).catch( ( error ) => {
        process.stderr.write( `Import failed: ${ formatError( error ) }\n` );
        process.exit( 2 );
    } );
}

module.exports = {
    run, parseArguments, formatError, validateDelimiter,
    resolveCacheConnectTimeoutMs, mapRowsToEmployeeIDs, toMappingRejection, excludeMappingErrorsFromAbsent,
    CACHE_CONNECT_TIMEOUT_ENV_VAR, DEFAULT_CACHE_CONNECT_TIMEOUT_MS
};
