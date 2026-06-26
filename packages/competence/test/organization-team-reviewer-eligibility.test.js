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
//   unit 1-1-1 "Platform Engineering" manager 8   employees 1,3,4,8,9
//   unit 1-1-2 "Product Engineering"  manager 11  employees 2,5,7,11
//   unit 1-1   "Engineering"          manager 20  (parent of the two leaf teams)
//   unit 1     "Parent Organization"  manager 22  (root)
//
// A team reviewer must NOT be the evaluatee themselves nor any of the evaluatee's managers (direct OR higher).
describe( "OrganizationManager.isEligibleTeamReviewer", () => {

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
        assert.equal( typeof organizationManager.instance.isEligibleTeamReviewer, "function" );
    } );

    // Evaluatee emp 1 sits in unit 1-1-1; its managers are 8 (direct), 20 and 22 (higher).
    it( "accepts a peer in the evaluatee's own unit", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "3", "1" ), true );
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "9", "1" ), true );
    } );

    it( "accepts a colleague in a different unit who is not a manager of the evaluatee", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "2", "1" ), true );
    } );

    it( "rejects the evaluatee's direct manager", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "8", "1" ), false );
    } );

    it( "rejects a higher-level (skip) manager", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "20", "1" ), false );
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "22", "1" ), false );
    } );

    it( "rejects the evaluatee themselves", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "1", "1" ), false );
    } );

    it( "returns false for missing input", () => {
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "", "1" ), false );
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( "3", "" ), false );
        assert.equal( organizationManager.instance.isEligibleTeamReviewer( null, null ), false );
    } );

} );
