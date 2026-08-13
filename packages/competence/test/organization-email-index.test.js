/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const organizationManager = require( "#organization-manager" );

// Employees whose emails exercise the index: a plain match, a mixed-case match, a duplicate pair, and one with no
// email at all. organizationUnitID is left null — the index is built from the employee records themselves, and an
// employee with no unit simply gets no membership edge, which does not affect these assertions.
const TEST_EMPLOYEES = [
    { employeeID: "901", email: "Ada@Example.com", employmentStatus: "active", personal: { firstName: "Ada", lastName: "L" }, career: { organizationUnitID: null } },
    { employeeID: "902", email: "grace@example.com", employmentStatus: "on-leave", personal: { firstName: "Grace", lastName: "H" }, career: { organizationUnitID: null } },
    { employeeID: "903", email: "twins@example.com", employmentStatus: "active", personal: { firstName: "Twin", lastName: "One" }, career: { organizationUnitID: null } },
    { employeeID: "904", email: "twins@example.com", employmentStatus: "active", personal: { firstName: "Twin", lastName: "Two" }, career: { organizationUnitID: null } },
    { employeeID: "905", employmentStatus: "active", personal: { firstName: "No", lastName: "Email" }, career: { organizationUnitID: null } },
    // Deliberately carries NO employmentStatus, to pin that the index does not invent one.
    { employeeID: "906", email: "nostatus@example.com", personal: { firstName: "No", lastName: "Status" }, career: { organizationUnitID: null } }
];

describe( "organizationManager email index", () => {

    before( async () => {
        // Seed the store through the in-memory cache stub, then build the chart from it. This is the established
        // pattern in the other organization-* suites. Do NOT try to replace `dataManager.instance.fetchEmployees`:
        // the singleton is exported frozen, so assigning a new own property silently no-ops and the real store read
        // would run instead.
        const stub = installInMemoryCache();
        const employeeMap = {};
        TEST_EMPLOYEES.forEach( ( employee ) => {
            employeeMap[ employee.employeeID ] = employee;
        } );
        await stub.setJSON( "ti:competence:data:employees", employeeMap );
        await organizationManager.instance.buildOrganizationChart();
    } );

    it( "passes an absent employmentStatus through instead of defaulting it to active", () => {
        // This index feeds login identity resolution, and the resolver admits only a status on its permitted list.
        // Defaulting an absent status to "active" here would hand a full employee session and org-derived roles to
        // a record carrying no approved status — a fail-open on a security-relevant field. Asserting `undefined`
        // rather than merely "not active" is deliberate: it pins the pass-through, not just the absence of a grant.
        const resolved = organizationManager.instance.resolveEmployeeIDByEmail( "nostatus@example.com" );
        assert.equal( resolved.employeeID, "906" );
        assert.equal( resolved.employmentStatus, undefined, "the index must not invent a status the record does not have" );
    } );

    it( "resolves an employee by their exact email", () => {
        assert.deepEqual( organizationManager.instance.resolveEmployeeIDByEmail( "grace@example.com" ), {
            employeeID: "902",
            employmentStatus: "on-leave"
        } );
    } );

    it( "matches case-insensitively and ignores surrounding whitespace", () => {
        const result = organizationManager.instance.resolveEmployeeIDByEmail( "  ada@EXAMPLE.com " );
        assert.equal( result.employeeID, "901" );
    } );

    it( "reports a duplicated email as ambiguous instead of picking one", () => {
        assert.deepEqual( organizationManager.instance.resolveEmployeeIDByEmail( "twins@example.com" ), { ambiguous: true } );
    } );

    it( "returns null for an unknown email", () => {
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( "nobody@example.com" ), null );
    } );

    it( "returns null for an empty or missing email", () => {
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( "" ), null );
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( undefined ), null );
    } );

    it( "knows which employees exist", () => {
        assert.equal( organizationManager.instance.hasEmployee( "901" ), true );
        assert.equal( organizationManager.instance.hasEmployee( "905" ), true, "an employee with no email still exists" );
        assert.equal( organizationManager.instance.hasEmployee( "999" ), false );
        assert.equal( organizationManager.instance.hasEmployee( "" ), false );
    } );

} );
