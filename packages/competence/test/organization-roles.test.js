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

// Seeded org (config.organization-structure.json + seeders/employees.json):
//   root unit "1" mgr 22  ->  "1-1" Engineering mgr 20  ->  { "1-1-1" mgr 8, "1-1-2" mgr 11 }
//   ICs: 1,3,4,9 in 1-1-1 ; 2,5,7 in 1-1-2.
describe( "OrganizationManager org-derived role helpers", () => {

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

    it( "getTopManagerID returns the root unit's manager (22)", () => {
        assert.equal( organizationManager.instance.getTopManagerID(), "22" );
    } );

    it( "isUnitManager is true for unit managers and false for ICs", () => {
        assert.equal( organizationManager.instance.isUnitManager( "22" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "20" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "8" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "11" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "1" ), false );
        assert.equal( organizationManager.instance.isUnitManager( "9" ), false );
    } );

    it( "isAutoSupervisor is true only for the top manager in the seeded org", () => {
        assert.equal( organizationManager.instance.isAutoSupervisor( "22" ), true );
        assert.equal( organizationManager.instance.isAutoSupervisor( "20" ), false );
        assert.equal( organizationManager.instance.isAutoSupervisor( "8" ), false );
        assert.equal( organizationManager.instance.isAutoSupervisor( "1" ), false );
    } );

    it( "degrades gracefully for unknown / empty ids", () => {
        assert.equal( organizationManager.instance.isUnitManager( "" ), false );
        assert.equal( organizationManager.instance.isAutoSupervisor( "no-such-employee" ), false );
    } );

} );
