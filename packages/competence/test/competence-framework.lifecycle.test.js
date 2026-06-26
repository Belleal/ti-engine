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

describe( "CompetenceFramework — lockCycle normalizes empty specializations", () => {

    // Seeded 2026-H2: SE/BA/PM carry a baseline only (every specialization absent); QE/XD/DA/IO/MC/PD are excluded.
    it( "marks every empty specialization of an included family as intentionally empty ([])", async () => {
        const beforeBA = await dataManager.instance.getActiveCompetencySetsForFamily( "BA", "2026-H2" );
        assert.deepEqual( Object.keys( beforeBA ).sort(), [ "baseline" ], "BA specializations start absent (baseline only)" );

        await competenceFramework.instance.lockCycle( "2026-H2", "20" );

        for ( const family of [ "SE", "BA", "PM" ] ) {
            const after = await dataManager.instance.getActiveCompetencySetsForFamily( family, "2026-H2" );
            for ( const spec of configurationLoader.getSpecializationCodes( family ) ) {
                assert.ok( Object.prototype.hasOwnProperty.call( after, spec ), `${ family }/${ spec } must be persisted after lock` );
                assert.deepEqual( after[ spec ], [], `${ family }/${ spec } must be an explicit empty set` );
            }
        }
    } );

    it( "leaves a populated specialization untouched while marking its empty siblings", async () => {
        const baseline = await dataManager.instance.getBaselineSet( "BA", "2026-H2" );
        const code = baseline[ 0 ]; // a real BA-pool code (already in the baseline) keeps validation happy
        await dataManager.instance.setActiveCompetencySet( "BA", "REQUIREMENTS", "2026-H2", [ code ] );

        await competenceFramework.instance.lockCycle( "2026-H2", "20" );

        const afterBA = await dataManager.instance.getActiveCompetencySetsForFamily( "BA", "2026-H2" );
        assert.deepEqual( afterBA[ "REQUIREMENTS" ], [ code ], "a configured specialization keeps its codes" );
        assert.deepEqual( afterBA[ "PROCESS" ], [], "an empty sibling specialization is still marked empty" );
    } );

    it( "does not touch excluded families' specializations", async () => {
        await competenceFramework.instance.lockCycle( "2026-H2", "20" );
        const afterQE = await dataManager.instance.getActiveCompetencySetsForFamily( "QE", "2026-H2" );
        assert.deepEqual( Object.keys( afterQE ), [], "excluded family specializations stay absent (never auto-marked)" );
    } );

    it( "normalizes nothing when the lock fails validation (status stays PLANNING)", async () => {
        await dataManager.instance.setActiveCompetencySet( "SE", "baseline", "2026-H2", [ "E1-1" ] ); // breaks floor coverage
        await assert.rejects( () => competenceFramework.instance.lockCycle( "2026-H2", "20" ) );

        const afterBA = await dataManager.instance.getActiveCompetencySetsForFamily( "BA", "2026-H2" );
        assert.deepEqual( Object.keys( afterBA ).sort(), [ "baseline" ], "no specializations marked when the lock is rejected" );
        const cycle = await dataManager.instance.getCycle( "2026-H2" );
        assert.equal( cycle.status, configurationLoader.cycleStatus.PLANNING );
    } );

} );

describe( "DataManager — team-feedback deadline derivation", () => {

    it( "the seeded cycle gets cycleStart + window, clamped to cycleDate", async () => {
        // 2026-H2 seeds cycleStart 2026-07-01; default window is 14 days → 2026-07-15 (well within cycleDate).
        const cycle = await dataManager.instance.getCycle( "2026-H2" );
        assert.equal( cycle.teamFeedbackDeadline, "2026-07-15" );
    } );

    it( "createCycle derives the default deadline as cycleStart + teamFeedbackWindowDays, and persists it", async () => {
        const created = await dataManager.instance.createCycle( {
            cycleID: "2027-H1", name: "Spring '27 cycle", cycleStart: "2027-01-15", cycleDate: "2027-04-30", cycleEnd: "2027-06-30"
        } );
        assert.equal( created.teamFeedbackDeadline, "2027-01-29" );
        const fetched = await dataManager.instance.getCycle( "2027-H1" );
        assert.equal( fetched.teamFeedbackDeadline, "2027-01-29" );
    } );

    it( "createCycle clamps the deadline to cycleDate when the window overshoots", async () => {
        const created = await dataManager.instance.createCycle( {
            cycleID: "2027-H2", name: "Autumn '27 cycle", cycleStart: "2027-07-01", cycleDate: "2027-07-10", cycleEnd: "2027-12-31"
        } );
        // 2027-07-01 + 14 = 2027-07-15, past cycleDate 2027-07-10 → clamped to cycleDate.
        assert.equal( created.teamFeedbackDeadline, "2027-07-10" );
    } );

    it( "createCycle falls back to cycleDate when there is no cycleStart", async () => {
        const created = await dataManager.instance.createCycle( {
            cycleID: "2028-H1", name: "Spring '28 cycle", cycleStart: null, cycleDate: "2028-04-30", cycleEnd: "2028-06-30"
        } );
        assert.equal( created.teamFeedbackDeadline, "2028-04-30" );
    } );

    it( "createCycle honours an explicit teamFeedbackDeadline over the computed default", async () => {
        const created = await dataManager.instance.createCycle( {
            cycleID: "2028-H2", name: "Autumn '28 cycle", cycleStart: "2028-07-01", cycleDate: "2028-11-30", cycleEnd: "2028-12-31", teamFeedbackDeadline: "2028-08-15"
        } );
        assert.equal( created.teamFeedbackDeadline, "2028-08-15" );
    } );

    it( "setCycleTeamFeedbackDeadline persists an override", async () => {
        const updated = await dataManager.instance.setCycleTeamFeedbackDeadline( "2026-H2", "2026-08-01" );
        assert.equal( updated.teamFeedbackDeadline, "2026-08-01" );
        const fetched = await dataManager.instance.getCycle( "2026-H2" );
        assert.equal( fetched.teamFeedbackDeadline, "2026-08-01" );
    } );

} );
