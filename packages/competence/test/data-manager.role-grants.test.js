/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const dataManager = require( "#data-manager" );

describe( "DataManager supervisor role grants", () => {

    beforeEach( async () => {
        installInMemoryCache();
        await dataManager.instance.loadRoleGrants();   // start from an empty, freshly-mirrored store
    } );

    it( "grants a role and reflects it in the synchronous mirror + store", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        assert.equal( dataManager.instance.hasSupervisorGrant( "9" ), true );
        const grants = await dataManager.instance.fetchRoleGrants();
        assert.equal( grants[ "9" ].grantedBy, "22" );
        assert.equal( typeof grants[ "9" ].grantedAt, "string" );
        assert.deepEqual( dataManager.instance.getSupervisorGrantIDs(), [ "9" ] );
    } );

    it( "revokes a role from the mirror + store", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        await dataManager.instance.revokeSupervisorRole( "9" );
        assert.equal( dataManager.instance.hasSupervisorGrant( "9" ), false );
        const grants = await dataManager.instance.fetchRoleGrants();
        assert.ok( !grants[ "9" ] || !grants[ "9" ].role );
    } );

    it( "loadRoleGrants rebuilds the mirror from the store", async () => {
        await dataManager.instance.grantSupervisorRole( "4", "22" );
        const persisted = await dataManager.instance.fetchRoleGrants();
        const stub = installInMemoryCache();
        // Re-installing the cache swaps the store but does NOT touch the persistent in-memory mirror, so first load
        // against the fresh (empty) store to clear the mirror — simulating a process that booted before the grant.
        await dataManager.instance.loadRoleGrants();
        await stub.setJSON( "ti:competence:data:role-grants", persisted );
        assert.equal( dataManager.instance.hasSupervisorGrant( "4" ), false, "mirror is empty before load" );
        await dataManager.instance.loadRoleGrants();
        assert.equal( dataManager.instance.hasSupervisorGrant( "4" ), true, "mirror repopulated from store" );
    } );

    it( "writes an audit entry on grant", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        const entries = await dataManager.instance.getAuditEntriesForEmployee( "9" );
        const grantEntry = entries.find( ( e ) => e.field === "supervisorRole" );
        assert.ok( grantEntry, "a supervisorRole audit entry exists" );
        assert.equal( grantEntry.changedBy, "22" );
        assert.equal( grantEntry.newValue, "granted" );
    } );

} );
