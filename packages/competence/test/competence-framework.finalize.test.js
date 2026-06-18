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

// Deadlines well outside any plausible wall-clock so the "past"/"future" assertions are deterministic.
const PAST = "2000-01-01";
const FUTURE = "2999-12-31";

/**
 * Builds and persists an OPEN evaluation with a team-feedback workflow, overridable per field.
 */
async function saveEvaluation( over = {} ) {
    const evaluation = {
        evaluationID: over.evaluationID || "eval-1",
        employeeID: over.employeeID || "emp-1",
        cycleID: "2026-H2",
        cycleDate: "2026-11-30",
        status: over.status || configurationLoader.evaluationStatus.OPEN,
        grades: over.grades || {
            "E1-1": { employee: "S", manager: "", team: { cumulative: "", individual: [ "R", "R" ] } }
        },
        workflow: {
            currentStep: 1,
            selfEvaluationCompleted: over.selfEvaluationCompleted === true,
            selfEvaluationDeadline: "",
            teamEvaluationCompleted: false,
            teamEvaluationDeadline: ( over.deadline !== undefined ) ? over.deadline : PAST,
            managerEvaluationCompleted: false,
            managerEvaluationDeadline: "",
            teamEvaluationsSubmitted: over.submitted || 0,
            team: over.team || [ "u2", "u3" ]
        }
    };
    await dataManager.instance.saveEvaluation( evaluation );
    return evaluation;
}

describe( "CompetenceFramework — finalizeTeamFeedback", () => {

    it( "drops pending reviewers, recomputes cumulative, and advances to IN_REVIEW when self is complete", async () => {
        await saveEvaluation( { selfEvaluationCompleted: true, team: [ "u2", "u3" ], submitted: 1, deadline: PAST } );
        const updated = await competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" );
        assert.equal( updated.workflow.team.length, 0 );
        assert.equal( updated.workflow.teamEvaluationCompleted, true );
        assert.equal( updated.status, configurationLoader.evaluationStatus.IN_REVIEW );
        assert.equal( updated.grades[ "E1-1" ].team.cumulative, "R" );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.status, configurationLoader.evaluationStatus.IN_REVIEW );
        assert.equal( fetched.workflow.team.length, 0 );
    } );

    it( "stays OPEN (awaiting self) when the self-evaluation is not complete", async () => {
        await saveEvaluation( { selfEvaluationCompleted: false, deadline: PAST } );
        const updated = await competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" );
        assert.equal( updated.status, configurationLoader.evaluationStatus.OPEN );
        assert.equal( updated.workflow.teamEvaluationCompleted, true );
        assert.equal( updated.workflow.team.length, 0 );
    } );

    it( "allows finalize with zero submissions when allowFinalizeTeamWithoutSubmissions is true (default)", async () => {
        await saveEvaluation( { submitted: 0, selfEvaluationCompleted: true, deadline: PAST } );
        const updated = await competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" );
        assert.equal( updated.status, configurationLoader.evaluationStatus.IN_REVIEW );
    } );

    it( "rejects finalize with zero submissions when allowFinalizeTeamWithoutSubmissions is false", async () => {
        await saveEvaluation( { submitted: 0, deadline: PAST } );
        const original = configurationLoader.getSetting;
        configurationLoader.getSetting = ( key, def ) => ( key === "performanceAppraisals.allowFinalizeTeamWithoutSubmissions" ? false : original( key, def ) );
        try {
            await assert.rejects(
                () => competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" ),
                ( err ) => /finalize-no-submissions/.test( err?.data?.details || err?.message || "" )
            );
        } finally {
            configurationLoader.getSetting = original;
        }
    } );

    it( "rejects before the deadline has passed", async () => {
        await saveEvaluation( { deadline: FUTURE } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" ),
            ( err ) => /finalize-deadline-not-reached/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "rejects when the evaluation is not OPEN", async () => {
        await saveEvaluation( { status: configurationLoader.evaluationStatus.IN_REVIEW, deadline: PAST } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" ),
            ( err ) => /finalize-not-open/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "rejects when no reviewers are pending", async () => {
        await saveEvaluation( { team: [], submitted: 3, deadline: PAST } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "manager" ),
            ( err ) => /finalize-no-pending-team/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "writes exactly one evaluation-scoped audit entry retrievable via getAuditEntriesForEvaluation", async () => {
        await saveEvaluation( { selfEvaluationCompleted: true, team: [ "u2", "u3" ], submitted: 1, deadline: PAST } );
        await competenceFramework.instance.finalizeTeamFeedback( "eval-1", "mgr-1", "supervisor" );

        const entries = await dataManager.instance.getAuditEntriesForEvaluation( "eval-1" );
        assert.equal( entries.length, 1 );
        assert.equal( entries[ 0 ].subjectType, "evaluation" );
        assert.equal( entries[ 0 ].subjectID, "eval-1" );
        assert.equal( entries[ 0 ].changedBy, "mgr-1" );
        assert.equal( entries[ 0 ].field, "workflow.teamFeedbackFinalized" );
        assert.equal( entries[ 0 ].oldValue, 2 );
        assert.equal( entries[ 0 ].newValue, configurationLoader.evaluationStatus.IN_REVIEW );
        assert.match( entries[ 0 ].reason, /supervisor/ );

        // An evaluation-scoped entry must not leak into the employee bucket.
        const employeeEntries = await dataManager.instance.getAuditEntriesForEmployee( "emp-1" );
        assert.equal( employeeEntries.length, 0 );
    } );

} );
