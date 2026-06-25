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
const configurationLoader = require( "#configuration-loader" );

const READY = configurationLoader.evaluationStatus.READY;
const CLOSED = configurationLoader.evaluationStatus.CLOSED;
const OPEN = configurationLoader.evaluationStatus.OPEN;

// A synthetic CohortRow as the extended buildCohortFrame produces it (carries per-category `scores` + `organizationUnitName`).
function row( o ) {
    return {
        evaluationID: o.id, employeeID: o.id, managerID: "m1",
        status: o.status, roleFamily: o.roleFamily, specialization: null,
        stageLevel: o.level + "1", level: o.level,
        organizationUnitID: o.unit, organizationUnitName: o.unitName,
        interviewDate: null,
        isScored: o.score !== null,
        finalScore: ( o.score !== null ) ? { score: o.score, interpretation: o.band } : null,
        finalInterpretation: ( o.score !== null ) ? o.band : null,
        scores: ( o.score !== null ) ? { E: { score: o.e, interpretation: o.band }, I: { score: o.i, interpretation: o.band }, C: { score: o.c, interpretation: o.band } } : null,
        competencies: {}
    };
}

// Reported rows: SE/u1 ×3 (R,S,X), BA/u2 ×1 (T, suppressed), plus a non-scored OPEN SE row that must be excluded.
function buildFrame() {
    return [
        row( { id: "a", status: CLOSED, roleFamily: "SE", level: "R", unit: "u1", unitName: "Unit One", score: 100, band: "T3", e: 100, i: 96, c: 108 } ),
        row( { id: "b", status: READY, roleFamily: "SE", level: "S", unit: "u1", unitName: "Unit One", score: 120, band: "T5", e: 120, i: 116, c: 128 } ),
        row( { id: "c", status: CLOSED, roleFamily: "SE", level: "X", unit: "u1", unitName: "Unit One", score: 110, band: "T4", e: 110, i: 106, c: 118 } ),
        row( { id: "d", status: READY, roleFamily: "BA", level: "T", unit: "u2", unitName: "Unit Two", score: 90, band: "T3", e: 90, i: 86, c: 98 } ),
        row( { id: "e", status: OPEN, roleFamily: "SE", level: "J", unit: "u1", unitName: "Unit One", score: null } )
    ];
}

function buildSnapshot() {
    return resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
        frame: buildFrame(),
        coverageReport: { overall: { N: 5, pct: 80 } },
        cycle: { actualCloseDate: "2026-12-31" },
        dictionaryVersion: "3.3.1",
        meta: { computedAt: "2026-12-31T00:00:00.000Z" }
    } );
}

describe( "ResultsAnalytics — cross-cycle snapshot substrate (CA-X0)", () => {

    it( "bumps the snapshot schemaVersion to 2", () => {
        assert.equal( buildSnapshot().schemaVersion, 2 );
    } );

    it( "computes overall.finalScore as a full five-number summary + mean/stdev over reported rows only", () => {
        const overall = buildSnapshot().overall.finalScore;   // reported scores: [90,100,110,120]
        assert.deepEqual( overall, { n: 4, mean: 105, median: 100, p25: 90, p75: 110, min: 90, max: 120, stdev: 11.18 } );
    } );

    it( "computes overall.tBandMix as zero-filled counts of finalInterpretation", () => {
        assert.deepEqual( buildSnapshot().overall.tBandMix, { T1: 0, T2: 0, T3: 2, T4: 1, T5: 1 } );
    } );

    it( "computes ladderOrdinalHistogram with X and T collapsed into ordinal 5, plus the mean rung", () => {
        const snap = buildSnapshot();   // levels R(3),S(4),X(5),T(5)
        assert.deepEqual( snap.ladderOrdinalHistogram, { "1": 0, "2": 0, "3": 1, "4": 1, "5": 2 } );
        assert.equal( snap.ladderMeanRung, 4.25 );
    } );

    it( "computes byCategory five-number summaries over the per-category scores", () => {
        const byCat = buildSnapshot().byCategory;   // E:[100,120,110,90] I:[96,116,106,86] C:[108,128,118,98]
        assert.equal( byCat.E.n, 4 );
        assert.equal( byCat.E.mean, 105 );
        assert.equal( byCat.I.mean, 101 );
        assert.equal( byCat.C.mean, 113 );
        assert.deepEqual( byCat.E.tBandMix, { T1: 0, T2: 0, T3: 2, T4: 1, T5: 1 } );
    } );

    it( "computes byRoleFamily and suppresses families below the cohort floor", () => {
        const byFam = buildSnapshot().byRoleFamily;
        assert.equal( byFam.SE.n, 3 );
        assert.equal( byFam.SE.finalScoreMean, 110 );          // (100+120+110)/3
        assert.equal( byFam.SE.byCategory.E.mean, 110 );       // SE E scores [100,120,110]
        assert.ok( byFam.SE.bySubcategoryGap && typeof byFam.SE.bySubcategoryGap === "object" );
        assert.deepEqual( byFam.BA, { n: 1, suppressed: true } );
    } );

    it( "computes byOrgUnit with the unit name and suppresses units below the cohort floor", () => {
        const byUnit = buildSnapshot().byOrgUnit;
        assert.equal( byUnit.u1.n, 3 );
        assert.equal( byUnit.u1.unitName, "Unit One" );
        assert.equal( byUnit.u1.finalScoreMean, 110 );
        assert.deepEqual( byUnit.u2, { n: 1, suppressed: true } );
    } );

} );

describe( "ResultsAnalytics — buildCohortFrame carries scores + organizationUnitName (CA-X0)", () => {

    it( "captures the per-category scores and the resolved org-unit name onto each row", () => {
        const evaluation = {
            evaluationID: "e1", employeeID: "emp1", cycleID: "2026-H2", status: CLOSED,
            roleFamily: "SE", stageLevel: "R2",
            grades: { "E1-1": { employee: "S", manager: "R", team: { cumulative: "R" } } },
            snapshot: [ { code: "E1-1", category: "E", subcategory: "E1", relevancy: { R2: 0.8 } } ],
            finalScore: { score: 112, interpretation: "T4" },
            scores: { E: { score: 115, interpretation: "T4" }, I: { score: 108, interpretation: "T4" }, C: { score: 113, interpretation: "T4" } }
        };
        const filter = {
            resolveOrgUnit: () => "u1",
            resolveOrgUnitName: ( id ) => ( id === "u1" ? "Unit One" : "" )
        };
        const frame = resultsAnalytics.instance.buildCohortFrame( [ evaluation ], "2026-H2", filter );
        assert.equal( frame.length, 1 );
        assert.equal( frame[ 0 ].organizationUnitName, "Unit One" );
        assert.deepEqual( frame[ 0 ].scores, evaluation.scores );
    } );

} );
