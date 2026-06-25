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

    it( "produces the locked top-level keys with coverage populated and the stable axes computed (empty for an unscored frame)", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [ { evaluationID: "e1" }, { evaluationID: "e2" } ],
            coverageReport: coverageReport(),
            cycle: cycle(),
            dictionaryVersion: "3.3.1",
            meta: { cycleID: "2026-H2", mode: "snapshot", cycleStatus: "CLOSED" }
        } );

        assert.equal( snap.cycleID, "2026-H2" );
        assert.equal( snap.schemaVersion, 2 );
        assert.equal( snap.dictionaryVersion, "3.3.1" );
        assert.equal( snap.competencyCodeEra, "v3.0.0" );
        assert.equal( snap.provisional, false );
        assert.equal( snap.cycleClosedAt, "2027-01-15" );
        assert.ok( typeof snap.computedAt === "string" && snap.computedAt.length > 0 );
        assert.deepEqual( snap.reports.coverage, coverageReport() );

        // CA-X0: the cross-cycle substrate is now COMPUTED (was stubbed). These frame rows are unscored, so there are
        // no reported rows: score aggregates are empty/zero-filled and the org/role breakdowns have no groups.
        const zeroBands = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
        assert.deepEqual( snap.overall, { finalScore: {}, tBandMix: zeroBands } );
        assert.deepEqual( snap.byCategory, { E: { tBandMix: zeroBands }, I: { tBandMix: zeroBands }, C: { tBandMix: zeroBands } } );
        assert.deepEqual( snap.ladderOrdinalHistogram, { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } );
        assert.equal( snap.ladderMeanRung, null );
        assert.deepEqual( snap.byRoleFamily, {} );
        assert.deepEqual( snap.byOrgUnit, {} );

        // R5 (CA-67): levelDistribution + byStageLevel are populated from the frame; an unscored frame yields all 12
        // rungs suppressed (n:0) but the stable axis is present.
        assert.equal( Object.keys( snap.byStageLevel ).length, 12 );
        assert.deepEqual( snap.byStageLevel.N1, { n: 0, suppressed: true } );   // CA-X4 review: small cells carry the suppressed flag (parity with byRoleFamily/byOrgUnit)
        assert.equal( snap.reports.levelDistribution.groups.length, 12 );
        assert.deepEqual( snap.reports.levelDistribution.reference, [ { v: 105, label: "T3" } ] );

        // R4 (CA-67): heatmap + bySubcategory present; an unscored frame yields no cells and an empty-but-keyed axis.
        assert.equal( snap.reports.heatmap.rows.length, 9 );
        assert.deepEqual( snap.reports.heatmap.cells, [] );
        assert.equal( Object.keys( snap.bySubcategory ).length, 9 );
        assert.deepEqual( snap.bySubcategory.E1, { meanGrade: null, n: 0, expectedMeanGrade: null, gap: null } );

        // R6 (CA-67): predictiveDrivers present; an unscored frame has too few rows → insufficientData.
        assert.deepEqual( snap.reports.predictiveDrivers, { rows: [], insufficientData: true } );

        // R3 (CA-67): alignment present; an unscored frame yields no points but the diagonal/quadrant envelope.
        assert.deepEqual( snap.reports.alignment.points, [] );
        assert.equal( snap.reports.alignment.diagonal, true );

        // timeDistribution stays null here — buildResultsSnapshot only computes it when persistResultsSnapshot
        // supplies the calendar (this builder test passes no slots).
        assert.equal( snap.reports.timeDistribution, null );
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
        // Frame rows must carry status and isScored so nClosed and nScored are accurate (Fix 2).
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [
                { evaluationID: "e1", status: "Closed", isScored: true },
                { evaluationID: "e2", status: "Closed", isScored: true }
            ],
            coverageReport: coverageReport( { n: 2, N: 3, pct: 66.7 } ),
            cycle: cycle(), dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( snap.cohort.nEligible, 3 );
        assert.equal( snap.cohort.nClosed, 2 );
        assert.equal( snap.cohort.nScored, 2 );
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
