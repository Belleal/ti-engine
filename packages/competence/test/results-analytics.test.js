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

describe( "ResultsAnalytics — module shape", () => {

    it( "exports a frozen singleton instance", () => {
        assert.ok( resultsAnalytics.instance, "expected an exported instance" );
        assert.equal( Object.isFrozen( resultsAnalytics.instance ), true );
    } );

    it( "returns the same instance on re-require (singleton)", () => {
        const again = require( "#results-analytics" );
        assert.equal( again.instance, resultsAnalytics.instance );
    } );

} );

const resultsAnalyticsInstance = require( "#results-analytics" ).instance;

// Hand-built evaluation fixture. Mirrors the real shape: grades[code].{employee, manager, team:{cumulative,individual}},
// and the per-evaluation snapshot[] carrying relevancy keyed by stageLevel (competence-framework.js:464).
function evaluationFixture( over = {} ) {
    const stageLevel = over.stageLevel || "S2";
    return {
        evaluationID: over.evaluationID || "ev1",
        employeeID: over.employeeID || "emp1",
        managerID: over.managerID || "mgr1",
        cycleID: over.cycleID || "2026-H2",
        status: ( over.status !== undefined ) ? over.status : "Ready",
        roleFamily: over.roleFamily || "SE",
        specialization: ( over.specialization !== undefined ) ? over.specialization : null,
        stageLevel: stageLevel,
        interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : "2026-06-10",
        finalScore: ( over.finalScore !== undefined ) ? over.finalScore : { score: 100, interpretation: "T3" },
        scores: over.scores || { E: { score: 100, interpretation: "T3" }, I: { score: 100, interpretation: "T3" }, C: { score: 100, interpretation: "T3" } },
        grades: ( over.grades !== undefined ) ? over.grades : {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "R", individual: [ "R", "S" ] } }
        },
        snapshot: over.snapshot || [
            { code: "E1-1", category: "E", subcategory: "E1", relevancy: { S2: 7, R1: 4 } }
        ]
    };
}

// Default injected org-unit resolver for the pure tests.
function filterFixture( over = {} ) {
    return {
        organizationUnitID: ( over.organizationUnitID !== undefined ) ? over.organizationUnitID : null,
        roleFamily: ( over.roleFamily !== undefined ) ? over.roleFamily : null,
        specialization: ( over.specialization !== undefined ) ? over.specialization : null,
        stageLevel: ( over.stageLevel !== undefined ) ? over.stageLevel : null,
        level: ( over.level !== undefined ) ? over.level : null,
        source: over.source || "blended",
        groupBy: over.groupBy || "roleFamily",
        allowedEmployeeIDs: ( over.allowedEmployeeIDs !== undefined ) ? over.allowedEmployeeIDs : null,
        rootUnitID: ( over.rootUnitID !== undefined ) ? over.rootUnitID : "1",
        resolveOrgUnit: over.resolveOrgUnit || ( ( employeeID ) => ( employeeID === "emp1" ? "unit-A" : "unit-B" ) )
    };
}

describe( "ResultsAnalytics.buildCohortFrame — normalization", () => {

    it( "keeps only rows whose cycleID matches", () => {
        const evals = [
            evaluationFixture( { evaluationID: "a", cycleID: "2026-H2" } ),
            evaluationFixture( { evaluationID: "b", cycleID: "2025-H1" } )
        ];
        const frame = resultsAnalyticsInstance.buildCohortFrame( evals, "2026-H2", filterFixture() );
        assert.equal( frame.length, 1 );
        assert.equal( frame[ 0 ].evaluationID, "a" );
    } );

    it( "carries the status as the enum VALUE string (with the space in 'In Review')", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { status: "In Review" } ) ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].status, "In Review" );
    } );

    it( "maps grades[code].employee → competencies[code].self", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture() ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].competencies[ "E1-1" ].self, "S" );
    } );

    it( "populates team from grades[code].team.cumulative ONLY (never individual[])", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture() ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].competencies[ "E1-1" ].team, "R" );
        assert.equal( Object.prototype.hasOwnProperty.call( frame[ 0 ].competencies[ "E1-1" ], "individual" ), false );
        // The serialized row must not leak the per-peer grades anywhere.
        assert.equal( JSON.stringify( frame[ 0 ] ).includes( "individual" ), false );
    } );

    it( "resolves numeric gradeWeights and maps '' → null (ungraded, never 0)", () => {
        const grades = { "E1-1": { employee: "S", manager: "", team: { cumulative: "N" } } };
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { grades } ) ], "2026-H2", filterFixture() );
        const c = frame[ 0 ].competencies[ "E1-1" ];
        assert.equal( c.selfWeight, 1.3 );
        assert.equal( c.managerWeight, null );   // "" → null, NOT 0
        assert.equal( c.teamWeight, 0.0 );        // "N" → 0.0 (a real grade), NOT null
    } );

    it( "reads relevancy from the evaluation's own snapshot keyed by stageLevel", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { stageLevel: "S2" } ) ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].competencies[ "E1-1" ].relevancy, 7 );
    } );

    it( "defaults missing snapshot relevancy to 0", () => {
        const snapshot = [ { code: "E1-1", category: "E", subcategory: "E1", relevancy: { R1: 4 } } ];
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { stageLevel: "S2", snapshot } ) ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].competencies[ "E1-1" ].relevancy, 0 );
    } );

    it( "resolves organizationUnitID via the injected resolveOrgUnit", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { employeeID: "emp1" } ) ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].organizationUnitID, "unit-A" );
    } );

    it( "derives roleFamily/stageLevel/level/isScored onto the row", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { roleFamily: "SE", stageLevel: "S2" } ) ], "2026-H2", filterFixture() );
        assert.equal( frame[ 0 ].roleFamily, "SE" );
        assert.equal( frame[ 0 ].stageLevel, "S2" );
        assert.equal( frame[ 0 ].level, "S" );   // stage-family letter
        assert.equal( frame[ 0 ].isScored, true );
    } );

    it( "marks an unscored ACTIVE-cycle row (no finalScore) isScored:false but still keeps it in the frame", () => {
        const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { status: "Open", finalScore: null } ) ], "2026-H2", filterFixture() );
        assert.equal( frame.length, 1 );
        assert.equal( frame[ 0 ].isScored, false );
        assert.equal( frame[ 0 ].finalScore, null );
    } );

} );
