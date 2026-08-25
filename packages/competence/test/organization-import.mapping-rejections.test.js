/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Unit tests for OrganizationImport's mapping-rejection helpers (CA-108) -- mapRowsToEmployeeIDs, toMappingRejection,
 * excludeMappingErrorsFromAbsent. These were promoted from CLI-local functions in bin/build/import-organization.js
 * to public methods here so the employee-import screen's #deriveImportPlan and the CLI both call the exact same
 * logic instead of maintaining two copies of it -- CA-107's review already had to fix this once, for the CLI alone
 * (see import-organization-cli.test.js's own header for findings 2 and 3, still covered there against the CLI's
 * thin delegating wrappers).
 *
 * Kept in their own file rather than organization-import.file-checks.test.js: that file is scoped to the two
 * whole-file checks (findEncodingFailure / findHeaderFailure), while these three belong to the row/mapping stage
 * that runs after mapRows and before -- and after -- reconcile.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

describe( "organizationImport.mapRowsToEmployeeIDs", () => {

    // A minimal stand-in for toRecords()'s output: every record carries __row plus employee_id.
    const record = ( row, employeeID ) => ( { __row: row, employee_id: employeeID } );

    it( "indexes the raw, trimmed employee_id by row number", () => {
        const byRow = organizationImport.instance.mapRowsToEmployeeIDs( [ record( 2, "  1  " ), record( 3, "42" ) ] );
        assert.equal( byRow.get( 2 ), "1" );
        assert.equal( byRow.get( 3 ), "42" );
        assert.equal( byRow.size, 2 );
    } );

    it( "reads an empty cell as an empty string, never undefined", () => {
        const byRow = organizationImport.instance.mapRowsToEmployeeIDs( [ record( 5, "" ) ] );
        assert.equal( byRow.get( 5 ), "" );
    } );

    it( "treats a non-array input as no records, returning an empty map rather than throwing", () => {
        assert.equal( organizationImport.instance.mapRowsToEmployeeIDs( null ).size, 0 );
    } );

} );

describe( "organizationImport.toMappingRejection", () => {

    const record = ( row, employeeID ) => ( { __row: row, employee_id: employeeID } );

    it( "labels the rejection with the row's real employee_id when the row provided one -- CA-107 finding 2", () => {
        const byRow = organizationImport.instance.mapRowsToEmployeeIDs( [ record( 2, "1" ) ] );
        const rejection = organizationImport.instance.toMappingRejection(
            { row: 2, column: "stage", code: "not-an-integer", message: "'stage' must contain only digits" },
            byRow
        );
        assert.deepEqual( rejection, {
            employeeID: "1",
            unmapped: false,
            row: 2,
            code: "not-an-integer",
            message: "stage: 'stage' must contain only digits"
        } );
    } );

    it( "falls back to '(unmapped)' only when the row's employee_id is genuinely absent", () => {
        // The row failed on the employee_id column itself -- there is no id to surface.
        const byRow = organizationImport.instance.mapRowsToEmployeeIDs( [ record( 4, "" ) ] );
        const rejection = organizationImport.instance.toMappingRejection(
            { row: 4, column: "employee_id", code: "required", message: "'employee_id' is required and was empty" },
            byRow
        );
        assert.equal( rejection.employeeID, "(unmapped)" );
        assert.equal( rejection.unmapped, true, "the placeholder is for display; `unmapped` is what consumers branch on" );
    } );

    it( "never surfaces any column value other than employee_id", () => {
        const byRow = organizationImport.instance.mapRowsToEmployeeIDs( [ record( 2, "1" ) ] );
        const rejection = organizationImport.instance.toMappingRejection(
            { row: 2, column: "birth_date", code: "not-a-date", message: "'birth_date' must be an ISO-8601 date, formatted YYYY-MM-DD" },
            byRow
        );
        assert.equal( rejection.employeeID, "1" );
        assert.doesNotMatch( rejection.message, /\d{4}-\d{2}-\d{2}/, "no actual date value should ever appear in the message" );
    } );

} );

describe( "organizationImport.excludeMappingErrorsFromAbsent", () => {

    it( "drops exactly the ids a mapping rejection accounts for -- CA-107 finding 3", () => {
        const mappingRejections = [ { employeeID: "1", row: 2, code: "not-an-integer", message: "stage: ..." } ];
        const result = organizationImport.instance.excludeMappingErrorsFromAbsent( [ "1", "2", "3" ], mappingRejections );
        assert.deepEqual( result, [ "2", "3" ], "id '1' was rejected at the mapping stage, so it must not also read as absent" );
    } );

    it( "leaves a genuinely absent id untouched when it has no mapping rejection", () => {
        assert.deepEqual( organizationImport.instance.excludeMappingErrorsFromAbsent( [ "9" ], [] ), [ "9" ] );
    } );

    it( "subtracts nobody for a rejection whose row carried no id at all", () => {
        const mappingRejections = [ { employeeID: "(unmapped)", unmapped: true, row: 4, code: "required", message: "employee_id: ..." } ];
        const result = organizationImport.instance.excludeMappingErrorsFromAbsent( [ "(unmapped)", "7" ], mappingRejections );
        assert.deepEqual( result, [ "(unmapped)", "7" ] );
    } );

    it( "still subtracts an employee whose real id happens to equal the '(unmapped)' placeholder", () => {
        // `employee_id` need only be non-empty, so this id is legal. Branching on the placeholder string instead
        // of the `unmapped` flag reported this person as absent from the file while their rejected row sat in the
        // list directly above it -- telling the operator to chase a leaver who is right there.
        const mappingRejections = [ { employeeID: "(unmapped)", unmapped: false, row: 4, code: "not-an-integer", message: "stage: ..." } ];
        const result = organizationImport.instance.excludeMappingErrorsFromAbsent( [ "(unmapped)", "7" ], mappingRejections );
        assert.deepEqual( result, [ "7" ] );
    } );

    it( "treats a non-array absent or mappingRejections as empty rather than throwing", () => {
        assert.deepEqual( organizationImport.instance.excludeMappingErrorsFromAbsent( null, null ), [] );
    } );

} );

describe( "organizationImport mapping-rejection helpers -- end to end (CA-107 findings 2 and 3, shared by both drivers since CA-108)", () => {

    it( "a row that fails mapping is labeled by its real employee_id and excluded from absent", () => {
        // Line 2's employee_id '1' fails mapping (a non-numeric stage). employeeID '1' also belongs to a
        // currently-stored employee, so reconcile() -- which never sees this row at all -- would place it in
        // plan.absent (planAbsentFromReconcile stands in for that output). Whichever driver calls these three
        // helpers must reconcile the two lists once the mapping errors are folded in.
        const records = [ { __row: 2, employee_id: "1" } ];
        const mappingErrors = [ { row: 2, column: "stage", code: "not-an-integer", message: "'stage' must contain only digits" } ];
        const planAbsentFromReconcile = [ "1" ];

        const rowEmployeeIDs = organizationImport.instance.mapRowsToEmployeeIDs( records );
        const mappingRejections = mappingErrors.map( ( error ) => organizationImport.instance.toMappingRejection( error, rowEmployeeIDs ) );
        const absent = organizationImport.instance.excludeMappingErrorsFromAbsent( planAbsentFromReconcile, mappingRejections );

        assert.equal( mappingRejections.length, 1 );
        assert.equal( mappingRejections[ 0 ].employeeID, "1", "the rejection must be named by the real id, not '(unmapped)'" );
        assert.deepEqual( absent, [], "employee_id '1' must not be listed as absent -- its row is right there, rejected" );
    } );

} );
