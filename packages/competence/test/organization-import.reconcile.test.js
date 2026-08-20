/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

const CONTEXT = {
    roleFamilies: { SE: { specializations: { BACKEND: {} } }, PM: { specializations: { AGILE: {} } } },
    organizationStructure: { "1": {}, "1-1": {} }
};

function employee( over = {} ) {
    return {
        employeeID: over.employeeID || "1",
        email: ( over.email !== undefined ) ? over.email : "ada@example.com",
        employmentStatus: over.employmentStatus || "active",
        personal: { firstName: "Ada", lastName: "Lovelace", workMode: "Full-time", workLocation: "On-site" },
        career: {
            organizationUnitID: over.unit || "1-1",
            roleFamily: over.roleFamily || "SE",
            specialization: ( over.specialization !== undefined ) ? over.specialization : "BACKEND",
            level: over.level || "R",
            stage: ( over.stage !== undefined ) ? over.stage : 2
        }
    };
}

describe( "organizationImport.reconcile", () => {

    it( "classifies an unknown employeeID as a create", () => {
        const plan = organizationImport.instance.reconcile( [ employee() ], [], CONTEXT );
        assert.equal( plan.create.length, 1 );
        assert.equal( plan.update.length, 0 );
        assert.equal( plan.rejected.length, 0 );
    } );

    it( "classifies a changed record as an update", () => {
        const existing = [ employee( { level: "J" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { level: "S" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.update[ 0 ].previous.career.level, "J" );
        assert.equal( plan.update[ 0 ].employee.career.level, "S" );
    } );

    it( "classifies an identical record as unchanged", () => {
        const plan = organizationImport.instance.reconcile( [ employee() ], [ employee() ], CONTEXT );
        assert.equal( plan.unchanged.length, 1 );
        assert.equal( plan.update.length, 0 );
    } );

    it( "reconciles on employeeID, so a changed email still updates the same record", () => {
        const existing = [ employee( { email: "old@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { email: "new@example.com" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.create.length, 0 );
    } );

    it( "rejects two rows in the batch sharing an email, naming both", () => {
        const rows = [ employee( { employeeID: "1" } ), employee( { employeeID: "2" } ) ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.equal( plan.rejected.length, 2 );
        assert.ok( plan.rejected.every( ( r ) => r.code === "duplicate-email" ) );
        assert.deepEqual( plan.rejected.map( ( r ) => r.employeeID ).sort(), [ "1", "2" ] );
    } );

    it( "rejects a row whose email is already held by a different stored employee", () => {
        const existing = [ employee( { employeeID: "9", email: "ada@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employeeID: "1" } ) ], existing, CONTEXT );
        assert.equal( plan.rejected.length, 1 );
        assert.equal( plan.rejected[ 0 ].code, "duplicate-email" );
    } );

    it( "rejects a row whose organization unit is not in the tree", () => {
        const plan = organizationImport.instance.reconcile( [ employee( { unit: "9-9" } ) ], [], CONTEXT );
        assert.equal( plan.rejected.length, 1 );
        assert.equal( plan.rejected[ 0 ].code, "error.employee.invalid-organization-unit" );
    } );

    it( "rejects a specialization that does not belong to the family", () => {
        const plan = organizationImport.instance.reconcile( [ employee( { roleFamily: "PM", specialization: "BACKEND" } ) ], [], CONTEXT );
        assert.equal( plan.rejected[ 0 ].code, "error.employee.invalid-specialization" );
    } );

    it( "treats a leaver as an update to terminated, never a deletion", () => {
        const existing = [ employee( { employmentStatus: "active" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employmentStatus: "terminated" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.update[ 0 ].employee.employmentStatus, "terminated" );
    } );

    it( "reports a stored employee missing from the file without touching them", () => {
        const existing = [ employee( { employeeID: "1" } ), employee( { employeeID: "7", email: "g@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employeeID: "1" } ) ], existing, CONTEXT );
        assert.deepEqual( plan.absent, [ "7" ] );
        assert.equal( plan.update.length, 0 );
        assert.equal( plan.unchanged.length, 1 );
    } );

    it( "rejects two rows carrying the same employeeID", () => {
        const rows = [ employee( { employeeID: "1", email: "a@x.co" } ), employee( { employeeID: "1", email: "b@x.co" } ) ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.ok( plan.rejected.some( ( r ) => r.code === "duplicate-employee-id" ) );
    } );

    // `reconcile` runs two passes and rejects a row at the first thing that disqualifies it, so the order is part
    // of its contract: pass 1 finds batch-internal collisions, pass 2 then runs validity, then the stored-email
    // collision, then classification. Every case above breaks one thing at a time, which would still pass if two
    // stages were swapped — these pin the precedence. (The same gap was found by review twice earlier in this
    // feature; a case whose two violations are not adjacent pins far less than it appears to.)
    it( "reports a batch-internal duplicate email ahead of a validity failure", () => {
        const rows = [ employee( { employeeID: "1", unit: "9-9" } ), employee( { employeeID: "2", unit: "9-9" } ) ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.equal( plan.rejected.length, 2 );
        assert.ok( plan.rejected.every( ( rejection ) => rejection.code === "duplicate-email" ) );
    } );

    it( "reports a duplicate employeeID ahead of a validity failure", () => {
        const rows = [
            employee( { employeeID: "1", email: "a@x.co", unit: "9-9" } ),
            employee( { employeeID: "1", email: "b@x.co", unit: "9-9" } )
        ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.ok( plan.rejected.some( ( rejection ) => rejection.code === "duplicate-employee-id" ) );
        assert.equal( plan.rejected.some( ( rejection ) => rejection.code.startsWith( "error.employee." ) ), false );
    } );

    it( "reports a validity failure ahead of a stored-email collision", () => {
        const existing = [ employee( { employeeID: "9", email: "ada@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employeeID: "1", unit: "9-9" } ) ], existing, CONTEXT );
        assert.equal( plan.rejected.length, 1 );
        assert.equal( plan.rejected[ 0 ].code, "error.employee.invalid-organization-unit" );
    } );

    it( "names the source line on a rejection, and strips the marker from the plan", () => {
        const bad = Object.assign( employee( { unit: "9-9" } ), { __row: 17 } );
        const good = Object.assign( employee( { employeeID: "2", email: "g@example.com" } ), { __row: 18 } );
        const plan = organizationImport.instance.reconcile( [ bad, good ], [], CONTEXT );

        assert.equal( plan.rejected[ 0 ].row, 17 );
        assert.equal( Object.prototype.hasOwnProperty.call( plan.create[ 0 ], "__row" ), false );
    } );

    it( "is idempotent — reconciling the applied result again yields only unchanged", () => {
        const first = organizationImport.instance.reconcile( [ employee() ], [], CONTEXT );
        const second = organizationImport.instance.reconcile( [ employee() ], first.create, CONTEXT );
        assert.equal( second.unchanged.length, 1 );
        assert.equal( second.create.length, 0 );
        assert.equal( second.update.length, 0 );
    } );

    it( "accounts for every batch-collision row exactly once across all plan arrays", () => {
        const batch = [
            employee( { employeeID: "new-1", email: "new@x.co" } ),
            employee( { employeeID: "1", email: "existing@x.co" } ),
            employee( { employeeID: "2", email: "identical@x.co" } ),
            employee( { employeeID: "dup-3", email: "dup3a@x.co" } ),
            employee( { employeeID: "dup-3", email: "dup3b@x.co" } ),
            employee( { employeeID: "dup-email-4", email: "shared@x.co" } ),
            employee( { employeeID: "dup-email-5", email: "shared@x.co" } ),
            employee( { employeeID: "invalid-6", unit: "9-9" } )
        ];
        const existing = [
            employee( { employeeID: "1", email: "old@x.co" } ),
            employee( { employeeID: "2", email: "identical@x.co" } )
        ];
        const plan = organizationImport.instance.reconcile( batch, existing, CONTEXT );
        const totalAccounted = plan.create.length + plan.update.length + plan.unchanged.length + plan.rejected.length;
        assert.equal( totalAccounted, batch.length, `Expected ${ batch.length } rows accounted for, got ${ totalAccounted }` );
    } );

    it( "rejects duplicate employeeID naming every row in the group with count", () => {
        const rows = [
            employee( { employeeID: "1", email: "a@x.co" } ),
            employee( { employeeID: "1", email: "b@x.co" } )
        ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.equal( plan.rejected.length, 2 );
        assert.ok( plan.rejected.every( ( r ) => r.code === "duplicate-employee-id" ) );
        const ids = plan.rejected.map( ( r ) => r.employeeID ).sort();
        assert.deepEqual( ids, [ "1", "1" ] );
    } );

    it( "rejects three rows sharing one email, yielding exactly 3 distinct rejection entries", () => {
        const rows = [
            employee( { employeeID: "1", email: "same@x.co" } ),
            employee( { employeeID: "2", email: "same@x.co" } ),
            employee( { employeeID: "3", email: "same@x.co" } )
        ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        const rejectedByEmail = plan.rejected.filter( ( r ) => r.code === "duplicate-email" );
        assert.equal( rejectedByEmail.length, 3 );
        const ids = rejectedByEmail.map( ( r ) => r.employeeID ).sort();
        assert.deepEqual( ids, [ "1", "2", "3" ] );
    } );

    it( "rejects a row that is both duplicate employeeID and duplicate email exactly once", () => {
        const row0 = Object.assign( employee( { employeeID: "1", email: "shared-email@x.co" } ), { __row: 2 } );
        const row1 = Object.assign( employee( { employeeID: "1", email: "diff@x.co" } ), { __row: 3 } );
        const row2 = Object.assign( employee( { employeeID: "3", email: "shared-email@x.co" } ), { __row: 4 } );
        const plan = organizationImport.instance.reconcile( [ row0, row1, row2 ], [], CONTEXT );
        // Row 0 is both duplicate ID (with row 1) and duplicate email (with row 2).
        // It should appear exactly once in rejections, rejected for the duplicate ID, not also for email.
        const row0Rejections = plan.rejected.filter( ( r ) => r.row === 2 );
        assert.equal( row0Rejections.length, 1, "Row 2 should have exactly one rejection entry" );
        assert.equal( row0Rejections[ 0 ].code, "duplicate-employee-id" );
    } );

} );

// `dataManager.saveEmployee` persists through a Redis `JSON.MERGE` (RFC 7386 merge-patch): an omitted key is left
// in place, only an explicit `null` deletes it. `mapRow` OMITS `personal.birthDate`, `personal.gender` and
// `career.startingDate` (never writes them as `null`) when their CSV cell is blank, so a write built from such a
// row can never change one of those three fields. `#isSameRecord` has to agree, or a stored employee who has one
// of these and a blank cell in the file gets reclassified `update` on every single run, forever, even though the
// write never actually changes anything.
describe( "organizationImport.reconcile — blank optional cell means leave-unchanged (merge-patch parity)", () => {

    it( "treats a stored personal.birthDate as unchanged when the incoming row omits it", () => {
        const stored = employee();
        stored.personal.birthDate = "1990-05-12";
        const incoming = employee(); // mapRow never set birthDate for this row — its CSV cell was blank
        const plan = organizationImport.instance.reconcile( [ incoming ], [ stored ], CONTEXT );
        assert.equal( plan.unchanged.length, 1 );
        assert.equal( plan.update.length, 0 );
    } );

    it( "treats a stored personal.gender as unchanged when the incoming row omits it", () => {
        const stored = employee();
        stored.personal.gender = "female";
        const incoming = employee();
        const plan = organizationImport.instance.reconcile( [ incoming ], [ stored ], CONTEXT );
        assert.equal( plan.unchanged.length, 1 );
        assert.equal( plan.update.length, 0 );
    } );

    it( "treats a stored career.startingDate as unchanged when the incoming row omits it", () => {
        const stored = employee();
        stored.career.startingDate = "2018-09-01";
        const incoming = employee();
        const plan = organizationImport.instance.reconcile( [ incoming ], [ stored ], CONTEXT );
        assert.equal( plan.unchanged.length, 1 );
        assert.equal( plan.update.length, 0 );
    } );

    it( "still classifies a different incoming birthDate as an update — the omission rule must not make the field un-importable", () => {
        const stored = employee();
        stored.personal.birthDate = "1990-05-12";
        const incoming = employee();
        incoming.personal.birthDate = "1985-01-01";
        const plan = organizationImport.instance.reconcile( [ incoming ], [ stored ], CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.unchanged.length, 0 );
        assert.equal( plan.update[ 0 ].employee.personal.birthDate, "1985-01-01" );
    } );

    it( "still classifies an explicit null career.specialization as an update — the omission rule must not extend to specialization", () => {
        // Unlike the three fields above, mapRow sets specialization to an explicit `null` on a blank cell (its
        // schema type permits null), and merge-patch DELETES a key on an explicit null — so it genuinely converges
        // and must keep comparing normally, never treated as "omitted".
        const stored = employee( { specialization: "BACKEND" } );
        const incoming = employee( { specialization: null } );
        const plan = organizationImport.instance.reconcile( [ incoming ], [ stored ], CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.unchanged.length, 0 );
        assert.equal( plan.update[ 0 ].employee.career.specialization, null );
    } );

} );
