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

// Persists a READY evaluation with a booked interview date, overridable per field.
async function saveReadyEvaluation( over = {} ) {
    const evaluation = {
        evaluationID: over.evaluationID || "eval-1",
        employeeID: over.employeeID || "emp-1",
        cycleID: "2026-H2",
        cycleDate: "2026-11-30",
        status: over.status || configurationLoader.evaluationStatus.READY,
        roleFamily: "SE",
        stageLevel: "S2",
        snapshot: [ { code: "E1-1" } ],
        grades: { "E1-1": { employee: "R", manager: "R", team: { cumulative: "R", individual: [ "R" ] } } },
        interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : "2000-01-01",
        closure: ( over.closure !== undefined ) ? over.closure : { feedback: "", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null }
    };
    await dataManager.instance.saveEvaluation( evaluation );
    return evaluation;
}

const employee = {
    employeeID: "emp-1",
    career: { roleFamily: "SE", specialization: null, level: "S", stage: "2" }
};
const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30", teamFeedbackDeadline: "2026-11-16" };
const snapshot = [ { code: "E1-1" }, { code: "I2-1" } ];

describe( "CompetenceFramework — createNewEvaluation closure defaults", () => {

    it( "initializes an empty closure block on a new evaluation", () => {
        const evaluation = competenceFramework.instance.createNewEvaluation( employee, cycle, snapshot );
        assert.deepEqual( evaluation.closure, {
            feedback: "",
            goals: [],
            pip: { required: false, plan: "" },
            closedAt: null,
            closedBy: null
        } );
    } );

} );

describe( "CompetenceFramework — recordInterviewOutcome", () => {

    it( "records feedback, goals, and pip on a READY evaluation", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, interviewDate: "2000-01-01", closure: { feedback: "", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } };
        const result = competenceFramework.instance.recordInterviewOutcome( evaluation, {
            feedback: "Strong half.",
            goals: [ { text: "Lead a project", targetDate: "2027-06-30" }, { text: "Mentor a junior" } ],
            pip: { required: false, plan: "" }
        } );
        assert.equal( result.closure.feedback, "Strong half." );
        assert.equal( result.closure.goals.length, 2 );
        assert.deepEqual( result.closure.goals[ 1 ], { text: "Mentor a junior", targetDate: null } );
        assert.deepEqual( result.closure.pip, { required: false, plan: "" } );
        assert.equal( result.status, configurationLoader.evaluationStatus.READY, "status is untouched" );
        assert.equal( result.closure.closedAt, null, "recordInterviewOutcome must not set closedAt" );
        assert.equal( result.closure.closedBy, null, "recordInterviewOutcome must not set closedBy" );
    } );

    it( "rejects when the evaluation is not READY", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.IN_REVIEW, closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { feedback: "x" } ),
            ( err ) => ( err?.data?.details === "error.evaluation.outcome-not-ready" ) );
    } );

    it( "rejects more goals than the configured maximum", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, interviewDate: "2000-01-01", closure: {} };
        const goals = Array.from( { length: 6 }, ( _v, i ) => ( { text: "g" + i } ) );
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { goals } ),
            ( err ) => ( err?.data?.details === "error.evaluation.too-many-goals" ) );
    } );

    it( "rejects a goal with empty text", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, interviewDate: "2000-01-01", closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { goals: [ { text: "  " } ] } ),
            ( err ) => ( err?.data?.details === "error.evaluation.invalid-goal" ) );
    } );

    it( "rejects recording the outcome before the interview date has been reached", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, interviewDate: "2999-12-31", closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { feedback: "x" } ),
            ( err ) => ( err?.data?.details === "error.evaluation.outcome-interview-not-held" ) );
    } );

    it( "rejects recording the outcome when no interview is booked", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, interviewDate: null, closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { feedback: "x" } ),
            ( err ) => ( err?.data?.details === "error.evaluation.outcome-interview-not-held" ) );
    } );

} );

describe( "CompetenceFramework — closeEvaluation", () => {

    it( "closes a READY evaluation with a past interview and a recorded outcome", async () => {
        await saveReadyEvaluation( { interviewDate: "2000-01-01", closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        const closed = await competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" );
        assert.equal( closed.status, configurationLoader.evaluationStatus.CLOSED );
        assert.ok( closed.closure.closedAt, "closedAt must be set" );
        assert.equal( closed.closure.closedBy, "sup-1" );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.status, configurationLoader.evaluationStatus.CLOSED );

        const audit = await dataManager.instance.getAuditEntriesForEvaluation( "eval-1" );
        assert.ok( audit.some( ( e ) => e.field === "status" && e.newValue === configurationLoader.evaluationStatus.CLOSED ), "an audit entry records the close" );

        const statusEntries = audit.filter( ( e ) => e.field === "status" && e.newValue === configurationLoader.evaluationStatus.CLOSED );
        assert.equal( statusEntries.length, 1, "exactly one close audit entry" );
        assert.equal( statusEntries[ 0 ].oldValue, configurationLoader.evaluationStatus.READY, "audit oldValue must be Ready" );
    } );

    it( "rejects closing when status is not READY", async () => {
        await saveReadyEvaluation( { status: configurationLoader.evaluationStatus.IN_REVIEW } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-not-ready" ) );
    } );

    it( "rejects closing when no interview is booked", async () => {
        await saveReadyEvaluation( { interviewDate: null, closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-no-interview" ) );
    } );

    it( "rejects closing when the interview date is still in the future", async () => {
        await saveReadyEvaluation( { interviewDate: "2999-12-31", closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-interview-not-held" ) );
    } );

    it( "rejects closing when no outcome has been recorded", async () => {
        await saveReadyEvaluation( { interviewDate: "2000-01-01", closure: { feedback: "  ", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-no-outcome" ) );
    } );

    it( "rejects re-closing an already Closed evaluation", async () => {
        await saveReadyEvaluation( { status: configurationLoader.evaluationStatus.CLOSED, interviewDate: "2000-01-01" } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-not-ready" ) );
    } );

} );
