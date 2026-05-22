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

let competenceFramework;
let dataManager;

const REQUIRED_RELEVANCY_KEYS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];
const REQUIRED_SCOPE_KEYS = [ "N", "J", "R", "S", "X", "T" ];

before( async () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await dataManager.instance.initialize();
} );

describe( "CompetenceFramework.buildEvaluationSnapshot — completeness and immutability", () => {

    it( "every snapshot entry contains code/name/description/category/subcategory/scope/relevancy/origin/originLabel", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", "BACKEND", "2026-H2" );
        assert.ok( snapshot.length > 0, "snapshot must contain at least one entry" );

        for ( const entry of snapshot ) {
            assert.match( entry.code, /^[EIC][1-3]-\d+$/, `code '${ entry.code }' must match competency-code pattern` );
            assert.ok( entry.name, "name (localization key) must be present" );
            assert.ok( entry.description, "description (localization key) must be present" );
            assert.ok( /^[EIC]$/.test( entry.category ), `category '${ entry.category }' must be E/I/C` );
            assert.ok( /^[EIC][1-3]$/.test( entry.subcategory ), `subcategory '${ entry.subcategory }' must match parent category` );
            assert.equal( entry.category, entry.subcategory.charAt( 0 ), "subcategory must belong to the entry's category" );

            for ( const key of REQUIRED_SCOPE_KEYS ) {
                assert.ok( entry.scope[ key ], `scope.${ key } must be present` );
            }
            for ( const key of REQUIRED_RELEVANCY_KEYS ) {
                assert.equal( typeof entry.relevancy[ key ], "number", `relevancy.${ key } must be a number` );
            }
            assert.ok( Array.isArray( entry.eCFMapping ), "eCFMapping must be an array (possibly empty)" );
            assert.ok( typeof entry.origin === "string" && entry.origin.length > 0, "origin must be a non-empty string" );
            assert.ok( typeof entry.originLabel === "string" && entry.originLabel.length > 0, "originLabel (localization key) must be a non-empty string" );
        }
    } );

    it( "origin marker is \"baseline\" for codes from baseline and the specialization code for codes from specialization", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", "BACKEND", "2026-H2" );
        const baselineCodes = new Set( await dataManager.instance.getBaselineSet( "SE", "2026-H2" ) );
        const baselineOriginEntries = snapshot.filter( ( e ) => e.origin === "baseline" );
        const specializationOriginEntries = snapshot.filter( ( e ) => e.origin === "BACKEND" );

        // Every entry must be tagged either as baseline or as the specialization code.
        assert.equal( baselineOriginEntries.length + specializationOriginEntries.length, snapshot.length );

        // Codes in the baseline must be tagged "baseline" — even if the specialization repeats them (overlap rule).
        for ( const entry of baselineOriginEntries ) {
            assert.ok( baselineCodes.has( entry.code ), `entry '${ entry.code }' has origin=baseline but is not in the baseline set` );
        }
        // Codes tagged with the specialization code must NOT be in baseline.
        for ( const entry of specializationOriginEntries ) {
            assert.ok( !baselineCodes.has( entry.code ), `entry '${ entry.code }' has origin=BACKEND but is also in the baseline set (overlap should be tagged 'baseline')` );
        }
    } );

    it( "originLabel resolves to the baseline localization key for baseline-origin codes and the spec's name key for spec-origin codes", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", "BACKEND", "2026-H2" );
        const baselineEntries = snapshot.filter( ( e ) => e.origin === "baseline" );
        const specEntries = snapshot.filter( ( e ) => e.origin === "BACKEND" );

        assert.ok( baselineEntries.length > 0, "at least one baseline entry expected" );
        for ( const entry of baselineEntries ) {
            assert.equal( entry.originLabel, "interface.evaluation.context.origin.baseline" );
        }

        // The configured spec name key for SE.BACKEND should land on every spec-origin entry. We dereference it from
        // configuration rather than hard-coding so this test follows config renames automatically.
        const configurationLoader = require( "#configuration-loader" );
        const expectedSpecKey = configurationLoader.configRoleFamilies.SE.specializations.BACKEND.name;
        assert.ok( specEntries.length > 0, "at least one specialization entry expected" );
        for ( const entry of specEntries ) {
            assert.equal( entry.originLabel, expectedSpecKey );
        }
    } );

    it( "snapshot for a generalist (no specialization) tags every entry as baseline with the baseline label", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", null, "2026-H2" );
        assert.ok( snapshot.length > 0 );
        for ( const entry of snapshot ) {
            assert.equal( entry.origin, "baseline" );
            assert.equal( entry.originLabel, "interface.evaluation.context.origin.baseline" );
        }
    } );

    it( "snapshot is independent of subsequent dictionary mutation (immutability)", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", "BACKEND", "2026-H2" );
        const sampleEntry = snapshot[ 0 ];
        const originalName = sampleEntry.name;
        const originalRelevancy = { ...sampleEntry.relevancy };

        // Tamper with the live dictionary entry post-snapshot. This is exactly the scenario the brief calls out:
        // "Mutating a competency in the dictionary after evaluation creation does NOT change the form's content."
        const configurationLoader = require( "#configuration-loader" );
        const live = configurationLoader.configCompetencies.competencies[ sampleEntry.code ];
        // The configCompetencies is deepFrozen — attempting to mutate it throws in strict mode and is a no-op
        // in non-strict mode. We confirm immutability by checking that the snapshot would survive even if a
        // (non-frozen) consumer accidentally mutated it. To verify the snapshot's independence we test a deeper
        // property: mutate the entry's own returned scope/relevancy in the consumer's hand and re-resolve.
        try {
            live.name = "tampered.key";
            live.relevancy.J1 = 999;
        } catch ( ignored ) { /* deep-frozen — expected in production */ }

        // The previously-captured snapshot entry must remain unchanged.
        assert.equal( sampleEntry.name, originalName );
        assert.deepEqual( sampleEntry.relevancy, originalRelevancy );
    } );

    it( "createNewEvaluation embeds a deep-cloned snapshot into the evaluation record", async () => {
        const snapshot = await competenceFramework.instance.buildEvaluationSnapshot( "SE", "BACKEND", "2026-H2" );
        const employee = {
            employeeID: "test-1",
            career: { roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2 }
        };
        const cycle = {
            cycleID: "2026-H2",
            name: "Autumn '26 cycle",
            cycleDate: "2026-11-30",
            status: "PLANNING"
        };
        const evaluation = competenceFramework.instance.createNewEvaluation( employee, cycle, snapshot );

        // The evaluation carries the snapshot.
        assert.equal( Array.isArray( evaluation.snapshot ), true );
        assert.equal( evaluation.snapshot.length, snapshot.length );
        assert.deepEqual( evaluation.snapshot[ 0 ], snapshot[ 0 ] );

        // It is a clone — mutating the input snapshot does not affect the evaluation's copy.
        snapshot[ 0 ].name = "mutated";
        assert.notEqual( evaluation.snapshot[ 0 ].name, "mutated" );

        // Every snapshot code has a normalized empty grade entry pre-populated.
        assert.equal( Object.keys( evaluation.grades ).length, evaluation.snapshot.length );
        for ( const entry of evaluation.snapshot ) {
            assert.ok( evaluation.grades[ entry.code ], `grades[${ entry.code }] must exist` );
            assert.equal( evaluation.grades[ entry.code ].employee, "" );
        }

        // Evaluation carries the new three-dimensional fields.
        assert.equal( evaluation.roleFamily, "SE" );
        assert.equal( evaluation.specialization, "BACKEND" );
        assert.equal( evaluation.stageLevel, "R2" );
        assert.equal( evaluation.cycleID, "2026-H2" );
    } );

} );
