/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Unit tests for the pure, unit-testable seams of the employee-importer CLI (bin/build/import-organization.js) --
 * everything it exports besides `run` itself, which orchestrates real I/O (a file read, a Redis-backed cache
 * connection, process.exit) and is exercised manually instead (see the whole-branch review's "Verify" section).
 * Four review findings live here:
 *   - finding 2: a mapping-stage rejection must be labeled by the row's real employee_id, not the literal string
 *     '(unmapped)', whenever the row provided one;
 *   - finding 3: a row that failed mapping must not ALSO be reported as "absent from the file" just because it
 *     never reached reconcile() (which correctly knows nothing about a row that never reached it);
 *   - finding 5: a --delimiter override must be exactly one character, or parseDelimited (unit-tested separately
 *     in organization-import.parse.test.js, and not changed here) would silently collapse the whole file into one
 *     column with no clue as to why;
 *   - finding 6: the fail-closed Redis-connect bound must be overridable, not hard-coded.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const cli = require( "../bin/build/import-organization" );

describe( "validateDelimiter (finding 5) -- a --delimiter override must be exactly one character", () => {

    it( "accepts a single-character delimiter", () => {
        assert.equal( cli.validateDelimiter( ";" ), null );
        assert.equal( cli.validateDelimiter( "," ), null );
        assert.equal( cli.validateDelimiter( "\t" ), null );
    } );

    it( "accepts the absence of an override (null, or undefined from a trailing flag with no value)", () => {
        assert.equal( cli.validateDelimiter( null ), null );
        assert.equal( cli.validateDelimiter( undefined ), null );
    } );

    it( "rejects a multi-character delimiter with a clear, actionable message", () => {
        const message = cli.validateDelimiter( ";;" );
        assert.ok( message, "a two-character delimiter must be rejected" );
        assert.match( message, /--delimiter/ );
        assert.match( message, /exactly one character/ );
        assert.match( message, /;;/, "the offending value itself should be echoed back" );
    } );

    it( "rejects an empty-string delimiter too -- zero characters is not exactly one either", () => {
        assert.ok( cli.validateDelimiter( "" ) );
    } );

} );

describe( "resolveCacheConnectTimeoutMs (finding 6) -- the fail-closed cache-connect bound is overridable", () => {

    it( "defaults to 5000ms when the env var is unset", () => {
        assert.equal( cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS, 5000 );
        assert.equal( cli.resolveCacheConnectTimeoutMs( {} ), cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS );
    } );

    it( "honors a positive override", () => {
        const env = { [ cli.CACHE_CONNECT_TIMEOUT_ENV_VAR ]: "15000" };
        assert.equal( cli.resolveCacheConnectTimeoutMs( env ), 15000 );
    } );

    it( "falls back to the default for a non-numeric value", () => {
        const env = { [ cli.CACHE_CONNECT_TIMEOUT_ENV_VAR ]: "not-a-number" };
        assert.equal( cli.resolveCacheConnectTimeoutMs( env ), cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS );
    } );

    it( "falls back to the default for zero, a negative value, or an empty string -- never a NaN or negative timeout", () => {
        assert.equal( cli.resolveCacheConnectTimeoutMs( { [ cli.CACHE_CONNECT_TIMEOUT_ENV_VAR ]: "0" } ), cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS );
        assert.equal( cli.resolveCacheConnectTimeoutMs( { [ cli.CACHE_CONNECT_TIMEOUT_ENV_VAR ]: "-100" } ), cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS );
        assert.equal( cli.resolveCacheConnectTimeoutMs( { [ cli.CACHE_CONNECT_TIMEOUT_ENV_VAR ]: "" } ), cli.DEFAULT_CACHE_CONNECT_TIMEOUT_MS );
    } );

    it( "uses the TI_-prefixed name documented in the fail-closed message", () => {
        assert.equal( cli.CACHE_CONNECT_TIMEOUT_ENV_VAR, "TI_IMPORT_CACHE_CONNECT_TIMEOUT_MS" );
    } );

} );

describe( "mapping-error rejection labeling and the absent-list disagreement (findings 2 and 3)", () => {

    // A minimal stand-in for organizationImport.instance.toRecords()'s output: every record carries __row plus the
    // lower-cased header cells. Only employee_id matters to the functions under test here.
    const record = ( row, employeeID ) => ( { __row: row, employee_id: employeeID } );

    it( "mapRowsToEmployeeIDs indexes the raw, trimmed employee_id by row number", () => {
        const byRow = cli.mapRowsToEmployeeIDs( [ record( 2, "  1  " ), record( 3, "42" ) ] );
        assert.equal( byRow.get( 2 ), "1" );
        assert.equal( byRow.get( 3 ), "42" );
        assert.equal( byRow.size, 2 );
    } );

    it( "mapRowsToEmployeeIDs reads an empty cell as an empty string, never undefined", () => {
        const byRow = cli.mapRowsToEmployeeIDs( [ record( 5, "" ) ] );
        assert.equal( byRow.get( 5 ), "" );
    } );

    it( "toMappingRejection labels the rejection with the row's real employee_id -- finding 2", () => {
        const byRow = cli.mapRowsToEmployeeIDs( [ record( 2, "1" ) ] );
        const rejection = cli.toMappingRejection(
            { row: 2, column: "stage", code: "not-an-integer", message: "'stage' must contain only digits" },
            byRow
        );
        assert.deepEqual( rejection, {
            employeeID: "1",
            row: 2,
            code: "not-an-integer",
            message: "stage: 'stage' must contain only digits"
        } );
    } );

    it( "toMappingRejection falls back to '(unmapped)' only when the row's employee_id is genuinely absent", () => {
        // The row failed on the employee_id column itself -- there is no id to surface.
        const byRow = cli.mapRowsToEmployeeIDs( [ record( 4, "" ) ] );
        const rejection = cli.toMappingRejection(
            { row: 4, column: "employee_id", code: "required", message: "'employee_id' is required and was empty" },
            byRow
        );
        assert.equal( rejection.employeeID, "(unmapped)" );
    } );

    it( "toMappingRejection never surfaces any column value other than employee_id", () => {
        const byRow = cli.mapRowsToEmployeeIDs( [ record( 2, "1" ) ] );
        const rejection = cli.toMappingRejection(
            { row: 2, column: "birth_date", code: "not-a-date", message: "'birth_date' must be an ISO-8601 date, formatted YYYY-MM-DD" },
            byRow
        );
        assert.equal( rejection.employeeID, "1" );
        assert.doesNotMatch( rejection.message, /\d{4}-\d{2}-\d{2}/, "no actual date value should ever appear in the message" );
    } );

    it( "excludeMappingErrorsFromAbsent removes exactly the ids a mapping rejection accounts for -- finding 3", () => {
        const mappingRejections = [ { employeeID: "1", row: 2, code: "not-an-integer", message: "stage: ..." } ];
        const result = cli.excludeMappingErrorsFromAbsent( [ "1", "2", "3" ], mappingRejections );
        assert.deepEqual( result, [ "2", "3" ], "id '1' was rejected at the mapping stage, so it must not also read as absent" );
    } );

    it( "excludeMappingErrorsFromAbsent leaves a genuinely absent id untouched when it has no mapping rejection", () => {
        assert.deepEqual( cli.excludeMappingErrorsFromAbsent( [ "9" ], [] ), [ "9" ] );
    } );

    it( "excludeMappingErrorsFromAbsent only subtracts real employeeIDs a rejection named, never the '(unmapped)' placeholder itself", () => {
        const mappingRejections = [ { employeeID: "(unmapped)", row: 4, code: "required", message: "employee_id: ..." } ];
        const result = cli.excludeMappingErrorsFromAbsent( [ "(unmapped)", "7" ], mappingRejections );
        assert.deepEqual( result, [ "(unmapped)", "7" ] );
    } );

    it( "end to end: reproduces the whole-branch review scenario -- a rejected row must not also read as absent", () => {
        // Line 2's employee_id '1' fails mapping (a non-numeric stage). employeeID '1' also belongs to a
        // currently-stored employee, so reconcile() -- which never sees this row at all -- would place it in
        // plan.absent (planAbsentFromReconcile stands in for that output). The CLI merge step must reconcile the
        // two lists once the mapping errors are folded in.
        const records = [ record( 2, "1" ) ];
        const mappingErrors = [ { row: 2, column: "stage", code: "not-an-integer", message: "'stage' must contain only digits" } ];
        const planAbsentFromReconcile = [ "1" ];

        const rowEmployeeIDs = cli.mapRowsToEmployeeIDs( records );
        const mappingRejections = mappingErrors.map( ( error ) => cli.toMappingRejection( error, rowEmployeeIDs ) );
        const absent = cli.excludeMappingErrorsFromAbsent( planAbsentFromReconcile, mappingRejections );

        assert.equal( mappingRejections.length, 1 );
        assert.equal( mappingRejections[ 0 ].employeeID, "1", "the rejection must be named by the real id, not '(unmapped)'" );
        assert.deepEqual( absent, [], "employee_id '1' must not be listed as absent -- its row is right there, rejected" );
    } );

} );
