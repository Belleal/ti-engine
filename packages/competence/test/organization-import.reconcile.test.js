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

} );
