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

let competenceFramework;
let dataManager;

before( async () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
    competenceFramework = require( "#competence-framework" );
} );

beforeEach( async () => {
    // Reset and reseed the in-memory store so each test starts from a clean baseline-2026-H2 configuration.
    installInMemoryCache();
    dataManager = require( "#data-manager" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await dataManager.instance.initialize();
} );

describe( "CompetenceFramework.validateCycleForLock — four rules in pass and fail cases", () => {

    it( "accepts a well-formed cycle (seeded 2026-H2 SE/BA/PM baselines satisfy all four rules)", async () => {
        const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
        assert.equal( result.valid, true, `Expected valid:true but got errors:\n  ${ result.errors.map( ( e ) => e.detail ).join( "\n  " ) }` );
        assert.deepEqual( result.errors, [] );
    } );

    // ----- Rule 1: Baseline floor coverage -----

    it( "rule 1 (floor coverage): rejects a baseline missing one subcategory", async () => {
        // Replace SE baseline with codes covering only 8 of 9 subcategories (drop C3).
        await dataManager.instance.setActiveCompetencySet( "SE", "baseline", "2026-H2", [
            "E1-1", "E2-1", "E3-1", "I1-1", "I2-1", "I3-1", "C1-1", "C2-1"
        ] );
        const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
        assert.equal( result.valid, false );
        const floorErrors = result.errors.filter( ( e ) => e.rule === "baseline-floor-coverage" && e.family === "SE" );
        assert.ok( floorErrors.length >= 1, "expected at least one floor-coverage error for SE" );
        assert.match( floorErrors[ 0 ].detail, /C3/ );
    } );

    // ----- Rule 2: Cap -----

    it( "rule 2 (cap): rejects a resolved set exceeding the configured cap", async () => {
        // Lower the cap by injecting a setting at runtime. The simplest way is to push a giant specialization
        // that pushes baseline ∪ specialization over the default cap of 30.
        // A large specialization set of valid SE-pool codes, all outside the SE baseline, so the resolved set is
        // pushed past a lowered cap without tripping reference-integrity. (The baseline alone is already 22, so the
        // cap rule fires regardless; these keep the test focused on the cap rule with no retired/unknown codes.)
        const bigSet = [ "E2-4", "E2-7", "E2-9", "E2-10", "E2-11", "E2-12", "E2-13", "E2-14", "E2-15", "E2-16" ];
        await dataManager.instance.setActiveCompetencySet( "SE", "BACKEND", "2026-H2", bigSet );
        // Lower the cap via the application config so the baseline and resolved sets exceed it.
        const configurationLoader = require( "#configuration-loader" );
        const originalGetSetting = configurationLoader.getSetting;
        configurationLoader.getSetting = ( setting, defaultValue ) => {
            if ( setting === "performanceAppraisals.activeCompetencySetCap" ) return 10;
            return originalGetSetting( setting, defaultValue );
        };
        try {
            const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
            const capErrors = result.errors.filter( ( e ) => e.rule === "cap" );
            assert.ok( capErrors.length >= 1, "expected at least one cap error with cap=10" );
        } finally {
            configurationLoader.getSetting = originalGetSetting;
        }
    } );

    // ----- Rule 3: Reference integrity -----

    it( "rule 3 (reference integrity): rejects unknown competency codes", async () => {
        await dataManager.instance.setActiveCompetencySet( "SE", "baseline", "2026-H2", [
            "E1-1", "E2-1", "E3-1", "I1-1", "I2-1", "I3-1", "C1-1", "C2-1", "C3-1",
            "X9-999" // not in the dictionary
        ] );
        const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
        const refErrors = result.errors.filter( ( e ) => e.rule === "reference-integrity" && /X9-999/.test( e.detail ) );
        assert.equal( refErrors.length, 1 );
    } );

    it( "rule 3 (reference integrity): rejects specialization keys that are not valid under the parent family", async () => {
        // SE has no NOT_A_SPEC specialization in role-families config.
        await dataManager.instance.setActiveCompetencySet( "SE", "NOT_A_SPEC", "2026-H2", [ "E1-1" ] );
        const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
        const refErrors = result.errors.filter( ( e ) => e.rule === "reference-integrity" && e.specialization === "NOT_A_SPEC" );
        assert.equal( refErrors.length, 1, `Expected exactly one specialization-key error; got ${ result.errors.length } total errors` );
    } );

    // ----- Rule 4: No empty baseline -----

    it( "rule 4 (no empty baseline): rejects a family that has specialization data but an empty baseline", async () => {
        // Seed family QE with a specialization but no baseline (default seed has neither for QE).
        await dataManager.instance.setActiveCompetencySet( "QE", "AUTOMATION", "2026-H2", [ "E2-1" ] );
        const result = await competenceFramework.instance.validateCycleForLock( "2026-H2" );
        const ruleErrors = result.errors.filter( ( e ) => e.rule === "no-empty-baseline" && e.family === "QE" );
        assert.equal( ruleErrors.length, 1 );
    } );

} );
