/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const configurationLoader = require( "#configuration-loader" );

let dataManager;
let organizationManager;
let resultsAnalytics;

before( () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
    organizationManager = require( "#organization-manager" );
    resultsAnalytics = require( "#results-analytics" );
} );

beforeEach( async () => {
    installInMemoryCache();
    delete process.env.COMPETENCE_PRELOAD_DATA;
    await dataManager.instance.initialize();
    // Build the org chart so getOrganizationRootUnitID() returns the real root unit id ("1").
    // persistResultsSnapshot rejects when the chart is not initialised (null-root guard, Fix 3).
    await organizationManager.instance.buildOrganizationChart();
} );

describe( "ResultsAnalytics.persistResultsSnapshot — re-reads cycle for actualCloseDate", () => {

    it( "persists a snapshot whose cycleClosedAt equals the re-read cycle.actualCloseDate", async () => {
        // A cycle already transitioned to CLOSED (actualCloseDate written by updateCycleStatus on →CLOSED).
        await dataManager.instance.createCycle( {
            cycleID: "2026-H2", name: "Autumn '26", cycleStart: "2026-07-01", cycleDate: "2026-11-30", cycleEnd: "2026-12-31"
        } );
        await dataManager.instance.updateCycleStatus( "2026-H2", configurationLoader.cycleStatus.CLOSED );

        const saved = await resultsAnalytics.instance.persistResultsSnapshot( "2026-H2" );
        assert.equal( saved.cycleID, "2026-H2" );

        const reread = await dataManager.instance.getCycle( "2026-H2" );
        const stored = await dataManager.instance.getResultsSnapshot( "2026-H2" );
        assert.ok( stored, "snapshot must be persisted" );
        assert.equal( stored.cycleClosedAt, reread.actualCloseDate );
        assert.equal( stored.schemaVersion, 2 );
        assert.equal( stored.provisional, false );
        assert.equal( stored.competencyCodeEra, "v3.0.0" );
        // coverage slot present (object when B's helpers exist, null with the Phase-0 stub) — slot must exist:
        assert.ok( "coverage" in stored.reports, "coverage report slot must be present in the snapshot" );
    } );

} );
