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

let competenceFramework;
let dataManager;
let configurationLoader;

beforeEach( async () => {
    installInMemoryCache();
    configurationLoader = require( "#configuration-loader" );
    dataManager = require( "#data-manager" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await dataManager.instance.initialize();
} );

describe( "CompetenceFramework — cycle lifecycle state machine", () => {

    it( "PLANNING → ACTIVE: lockCycle validates first, then transitions, setting lockedAt and lockedBy", async () => {
        const before = await dataManager.instance.getCycle( "2026-H2" );
        assert.equal( before.status, configurationLoader.cycleStatus.PLANNING );
        assert.equal( before.lockedAt, null );

        const locked = await competenceFramework.instance.lockCycle( "2026-H2", "20" );
        assert.equal( locked.status, configurationLoader.cycleStatus.ACTIVE );
        assert.ok( locked.lockedAt, "lockedAt must be set after locking" );
        assert.equal( locked.lockedBy, "20" );
    } );

    it( "lockCycle refuses to transition when validation fails", async () => {
        // Break the SE baseline so floor coverage fails.
        await dataManager.instance.setActiveCompetencySet( "SE", "baseline", "2026-H2", [ "E1-1" ] );
        await assert.rejects(
            async () => competenceFramework.instance.lockCycle( "2026-H2", "20" ),
            ( err ) => /validation/i.test( err?.data?.details || err?.message || "" ) || Array.isArray( err?.data?.errors ),
            "lockCycle must reject when validateCycleForLock returns errors"
        );
        const cycle = await dataManager.instance.getCycle( "2026-H2" );
        assert.equal( cycle.status, configurationLoader.cycleStatus.PLANNING, "cycle status must NOT change on failed lock" );
    } );

    it( "single-active-cycle invariant: locking a second cycle while one is already ACTIVE fails", async () => {
        await competenceFramework.instance.lockCycle( "2026-H2", "20" );

        // Create a second cycle and prepare it for lock.
        await dataManager.instance.createCycle( {
            cycleID: "2027-H1",
            name: "Spring '27 cycle",
            cycleStart: "2027-01-15",
            cycleDate: "2027-04-30",
            cycleEnd: "2027-06-30"
        } );
        // Reuse the seeded baselines so the new cycle would otherwise be lockable.
        for ( const family of [ "SE", "BA", "PM" ] ) {
            const codes = await dataManager.instance.getBaselineSet( family, "2026-H2" );
            await dataManager.instance.setActiveCompetencySet( family, "baseline", "2027-H1", codes );
        }

        await assert.rejects(
            async () => competenceFramework.instance.lockCycle( "2027-H1", "20" ),
            ( err ) => /already ACTIVE/i.test( err?.data?.details || err?.message || "" ),
            "Expected a single-active-cycle invariant error"
        );
    } );

    it( "ACTIVE → CLOSED: closeCycle transitions and sets actualCloseDate", async () => {
        await competenceFramework.instance.lockCycle( "2026-H2", "20" );
        const closed = await competenceFramework.instance.closeCycle( "2026-H2" );
        assert.equal( closed.status, configurationLoader.cycleStatus.CLOSED );
        assert.ok( closed.actualCloseDate, "actualCloseDate must be set after closing" );
    } );

    it( "rejects invalid transitions: cannot lock a CLOSED cycle, cannot close a PLANNING cycle", async () => {
        // PLANNING → CLOSED directly is invalid.
        await assert.rejects(
            async () => competenceFramework.instance.closeCycle( "2026-H2" ),
            ( err ) => /PLANNING.*CLOSED|cannot transition/i.test( err?.data?.details || err?.message || "" )
        );

        // Lock + close, then try to lock again.
        await competenceFramework.instance.lockCycle( "2026-H2", "20" );
        await competenceFramework.instance.closeCycle( "2026-H2" );
        await assert.rejects(
            async () => competenceFramework.instance.lockCycle( "2026-H2", "20" ),
            ( err ) => /CLOSED.*ACTIVE|cannot transition/i.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "after CLOSED transition, getActiveCycle returns null", async () => {
        await competenceFramework.instance.lockCycle( "2026-H2", "20" );
        await competenceFramework.instance.closeCycle( "2026-H2" );
        const active = await dataManager.instance.getActiveCycle();
        assert.equal( active, null );
    } );

} );
