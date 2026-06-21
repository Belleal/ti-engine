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

function cycle( over = {} ) {
    return {
        cycleID: over.cycleID || "2026-H2",
        status: over.status || "CLOSED",
        actualCloseDate: ( over.actualCloseDate !== undefined ) ? over.actualCloseDate : "2027-01-15"
    };
}

function coverageReport( over = {} ) {
    return {
        overall: { n: over.n || 2, N: over.N || 3, pct: over.pct || 66.7, byStatus: over.byStatus || {}, notStarted: over.notStarted || 1 },
        byGroup: over.byGroup || [],
        pending: over.pending || []
    };
}

describe( "ResultsAnalytics.buildResultsSnapshot — locked shape", () => {

    it( "produces the locked top-level keys with coverage populated and stable axes stubbed", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [ { evaluationID: "e1" }, { evaluationID: "e2" } ],
            coverageReport: coverageReport(),
            cycle: cycle(),
            dictionaryVersion: "3.3.1",
            meta: { cycleID: "2026-H2", mode: "snapshot", cycleStatus: "CLOSED" }
        } );

        assert.equal( snap.cycleID, "2026-H2" );
        assert.equal( snap.schemaVersion, 1 );
        assert.equal( snap.dictionaryVersion, "3.3.1" );
        assert.equal( snap.competencyCodeEra, "v3.0.0" );
        assert.equal( snap.provisional, false );
        assert.equal( snap.cycleClosedAt, "2027-01-15" );
        assert.ok( typeof snap.computedAt === "string" && snap.computedAt.length > 0 );
        assert.deepEqual( snap.reports.coverage, coverageReport() );

        // stable-axis aggregate stubs present with the correct shape, empty for Phase 0
        assert.deepEqual( snap.overall, { finalScore: {}, tBandMix: {} } );
        assert.deepEqual( snap.byCategory, {} );
        assert.deepEqual( snap.bySubcategory, {} );
        assert.deepEqual( snap.byStageLevel, {} );
        assert.deepEqual( snap.ladderOrdinalHistogram, {} );
        assert.deepEqual( snap.byRoleFamily, {} );
        assert.deepEqual( snap.byOrgUnit, {} );

        // other Phase-0 report slots present but null (locked envelope)
        assert.equal( snap.reports.timeDistribution, null );
        assert.equal( snap.reports.alignment, null );
        assert.equal( snap.reports.heatmap, null );
        assert.equal( snap.reports.levelDistribution, null );
        assert.equal( snap.reports.predictiveDrivers, null );
    } );

    it( "computes chronoKey = year*2 + (H2?1:0)", () => {
        const h2 = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [], coverageReport: coverageReport(), cycle: cycle( { cycleID: "2026-H2" } ),
            dictionaryVersion: "3.3.1", meta: {}
        } );
        const h1 = resultsAnalytics.instance.buildResultsSnapshot( "2026-H1", {
            frame: [], coverageReport: coverageReport(), cycle: cycle( { cycleID: "2026-H1" } ),
            dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( h2.chronoKey, 4053 );
        assert.equal( h1.chronoKey, 4052 );
    } );

    it( "derives cohort counts from the frame and coverage report", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [ { evaluationID: "e1" }, { evaluationID: "e2" } ],
            coverageReport: coverageReport( { n: 2, N: 3, pct: 66.7 } ),
            cycle: cycle(), dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( snap.cohort.nEligible, 3 );
        assert.equal( snap.cohort.nClosed, 2 );
        assert.equal( snap.cohort.reportingPct, 66.7 );
    } );

    it( "tolerates a null coverageReport (degraded snapshot still locks the envelope)", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [], coverageReport: null, cycle: cycle(), dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( snap.reports.coverage, null );
        assert.equal( snap.cohort.nEligible, 0 );
        assert.equal( snap.cohort.reportingPct, 0 );
    } );

} );
