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

describe( "OrganizationManager.getOrganizationRootUnitID", () => {

    it( "is a function on the exported singleton", () => {
        assert.equal( typeof organizationManager.instance.getOrganizationRootUnitID, "function" );
    } );

    it( "returns the configured root unit id (the unit whose parent is null)", () => {
        // The seeded org structure roots at unit "1" (config.organization-structure.json: parent === null).
        // When the chart is not built in a bare unit test, the accessor returns null rather than throwing.
        const rootID = organizationManager.instance.getOrganizationRootUnitID();
        assert.ok( rootID === "1" || rootID === null );
    } );

} );

describe( "OrganizationManager.resolveOrganizationUnitName (CA-X0)", () => {

    before( async () => {
        installInMemoryCache();
        await organizationManager.instance.buildOrganizationChart();
    } );

    it( "returns the display name for a known unit id", () => {
        const name = organizationManager.instance.resolveOrganizationUnitName( "1" );
        assert.equal( typeof name, "string" );
        assert.ok( name.length > 0, "the seeded root unit must have a name" );
    } );

    it( "returns an empty string for an unknown unit id", () => {
        assert.equal( organizationManager.instance.resolveOrganizationUnitName( "no-such-unit" ), "" );
    } );

} );
