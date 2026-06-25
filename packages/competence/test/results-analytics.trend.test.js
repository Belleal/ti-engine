/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const resultsAnalytics = require( "#results-analytics" );

// Minimal snapshot stubs carrying only the substrate the trend reads. schemaVersion 1 = legacy (empty substrate).
function snap( over ) {
    return Object.assign( {
        cycleID: over.cycleID, chronoKey: over.chronoKey, schemaVersion: ( over.schemaVersion !== undefined ) ? over.schemaVersion : 2,
        overall: { finalScore: {}, tBandMix: { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 } },
        bySubcategory: {}, ladderOrdinalHistogram: {}, byRoleFamily: {}, byOrgUnit: {}
    }, over );
}

describe( "ResultsAnalytics._computeTrendWith — overallScore (CA-X2)", () => {

    const snapshots = [
        snap( { cycleID: "2025-H2", chronoKey: 4051, overall: { finalScore: { mean: 100, p25: 90, p75: 110 } } } ),
        snap( { cycleID: "2026-H1", chronoKey: 4052, schemaVersion: 1, overall: { finalScore: {} } } ),                 // legacy
        snap( { cycleID: "2026-H2", chronoKey: 4053, provisional: true, overall: { finalScore: { mean: 112, p25: 104, p75: 120 } } } )
    ];

    it( "shapes a mean line + p25–p75 band, nulling legacy cycles and listing them", () => {
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "overallScore" } );
        const mean = t.series.find( ( s ) => s.key === "mean" );
        assert.deepEqual( mean.values, [ 100, null, 112 ] );
        assert.deepEqual( mean.band, [ [ 90, 110 ], null, [ 104, 120 ] ] );
        assert.deepEqual( t.legacyCycles, [ "2026-H1" ] );
    } );

    it( "marks the provisional cycle in meta.cycles (the live ACTIVE point)", () => {
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "overallScore" } );
        assert.equal( t.meta.cycles.length, 3 );
        assert.equal( t.meta.cycles[ 2 ].provisional, true );
        assert.equal( t.meta.cycles[ 0 ].provisional, false );
    } );

    it( "applies a trailing window", () => {
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "overallScore", window: 2 } );
        assert.equal( t.meta.cycles.length, 2 );
        assert.deepEqual( t.meta.cycles.map( ( c ) => c.cycleID ), [ "2026-H1", "2026-H2" ] );
    } );

} );

describe( "ResultsAnalytics._computeTrendWith — cohort (CA-X2)", () => {

    it( "tracks one org-unit's finalScoreMean across cycles, nulling suppressed cells", () => {
        const snapshots = [
            snap( { cycleID: "2025-H2", chronoKey: 4051, byOrgUnit: { u1: { n: 5, unitName: "Unit One", finalScoreMean: 104 } } } ),
            snap( { cycleID: "2026-H1", chronoKey: 4052, byOrgUnit: { u1: { n: 2, suppressed: true } } } ),
            snap( { cycleID: "2026-H2", chronoKey: 4053, byOrgUnit: { u1: { n: 6, unitName: "Unit One", finalScoreMean: 111 } } } )
        ];
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "cohort", dimension: "orgUnit", key: "u1" } );
        const series = t.series.find( ( s ) => s.key === "u1" );
        assert.deepEqual( series.values, [ 104, null, 111 ] );
        assert.deepEqual( t.suppressedCycles, [ "2026-H1" ] );
    } );

} );

describe( "ResultsAnalytics._computeTrendWith — gapClosure + ladder (CA-X2)", () => {

    it( "emits one sparkline series per subcategory of bySubcategory.gap", () => {
        const snapshots = [
            snap( { cycleID: "2025-H2", chronoKey: 4051, bySubcategory: { E1: { gap: -0.2 }, I1: { gap: 0.1 } } } ),
            snap( { cycleID: "2026-H2", chronoKey: 4053, bySubcategory: { E1: { gap: -0.05 }, I1: { gap: 0.15 } } } )
        ];
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "gapClosure" } );
        const e1 = t.series.find( ( s ) => s.key === "E1" );
        assert.deepEqual( e1.values, [ -0.2, -0.05 ] );
    } );

    it( "emits a stacked ordinal series + a mean-rung line for ladder", () => {
        const snapshots = [
            snap( { cycleID: "2025-H2", chronoKey: 4051, ladderOrdinalHistogram: { "1": 0, "2": 1, "3": 3, "4": 2, "5": 1 }, ladderMeanRung: 3.4 } ),
            snap( { cycleID: "2026-H2", chronoKey: 4053, ladderOrdinalHistogram: { "1": 0, "2": 0, "3": 2, "4": 4, "5": 2 }, ladderMeanRung: 4.0 } )
        ];
        const t = resultsAnalytics.instance._computeTrendWith( { snapshots: snapshots }, { metric: "ladder" } );
        const rung3 = t.series.find( ( s ) => s.key === "3" );
        assert.deepEqual( rung3.values, [ 3, 2 ] );
        const meanRung = t.series.find( ( s ) => s.key === "meanRung" );
        assert.deepEqual( meanRung.values, [ 3.4, 4.0 ] );
    } );

} );
