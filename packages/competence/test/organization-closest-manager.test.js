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

// Seeded org (config.organization-structure.json + data/seeders/employees.json):
//   unit 1     "Parent Organization"  manager 22   (root)
//   unit 1-1   "Engineering"          manager 20   (parent of the two leaf teams)
//   unit 1-1-1 "Platform Engineering" manager 8    employees 1,3,4,8,9
//   unit 1-1-2 "Product Engineering"  manager 11   employees 2,5,7,11
//
// The dashboard "review pending" task must reach an evaluation's CLOSEST manager, resolved live from the org graph
// (never the persisted, optional evaluation.managerID, which can be unset at creation or stale after a reorg).
describe( "OrganizationManager.resolveClosestManagerIDForEmployee", () => {

    before( async () => {
        const stub = installInMemoryCache();
        const employees = require( "#data-employees" ).employees || [];
        const employeeMap = {};
        employees.forEach( ( employee ) => {
            employeeMap[ employee.employeeID ] = employee;
        } );
        await stub.setJSON( "ti:competence:data:employees", employeeMap );
        await organizationManager.instance.buildOrganizationChart();
    } );

    it( "is a function on the exported singleton", () => {
        assert.equal( typeof organizationManager.instance.resolveClosestManagerIDForEmployee, "function" );
    } );

    it( "returns the leaf-unit manager for an individual contributor", () => {
        // emp 1 sits in 1-1-1 → closest manager is the unit manager 8.
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "1" ), "8" );
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "2" ), "11" );
    } );

    it( "skips the employee's own unit and returns the parent-unit manager when the employee manages their unit", () => {
        // emp 8 manages 1-1-1, so their closest manager is the Engineering manager 20 (parent unit 1-1).
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "8" ), "20" );
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "11" ), "20" );
    } );

    it( "walks up to the org root manager for a mid-level manager", () => {
        // emp 20 manages Engineering (1-1); closest manager is the root manager 22 (unit 1).
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "20" ), "22" );
    } );

    it( "returns an empty string for the org-root employee (no superior above)", () => {
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "22" ), "" );
    } );

    it( "returns an empty string for an unknown employee", () => {
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "no-such-employee" ), "" );
    } );

    it( "returns an empty string for missing input", () => {
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( "" ), "" );
        assert.equal( organizationManager.instance.resolveClosestManagerIDForEmployee( null ), "" );
    } );

} );
