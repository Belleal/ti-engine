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

// NOTE: "2026-H2" is pre-seeded by COMPETENCE_PRELOAD_DATA (derived from config.active-competency-sets.json), so
// createCycle() would reject with "already exists" for that ID. Tests here use a cycle ID outside the seed set.
const TEST_CYCLE_ID = "2030-H1";

/**
 * Seeds (creates) a cycle via the DataManager cycle-save API, overridable per field.
 */
function seedCycle( over = {} ) {
    return dataManager.instance.createCycle( {
        cycleID: over.cycleID || TEST_CYCLE_ID,
        name: "Spring '30 cycle",
        cycleStart: "2030-01-15",
        cycleDate: ( over.cycleDate !== undefined ) ? over.cycleDate : "2030-04-30",
        cycleEnd: "2030-06-30",
        teamFeedbackDeadline: ( over.teamFeedbackDeadline !== undefined ) ? over.teamFeedbackDeadline : "2030-02-15"
    } );
}

/**
 * Builds and persists an evaluation with a bare-bones workflow, overridable per field. Defaults to an OPEN
 * evaluation referencing the seeded test cycle with empty self/manager deadlines (the pre-CA-59 legacy shape).
 */
async function seedEvaluation( over = {} ) {
    const evaluation = {
        evaluationID: over.evaluationID || "eval-1",
        employeeID: over.employeeID || "emp-1",
        cycleID: over.cycleID || TEST_CYCLE_ID,
        cycleDate: "2030-04-30",
        status: over.status || configurationLoader.evaluationStatus.OPEN,
        grades: {},
        workflow: {
            currentStep: 1,
            selfEvaluationCompleted: false,
            selfEvaluationDeadline: ( over.selfDeadline !== undefined ) ? over.selfDeadline : "",
            managerEvaluationCompleted: false,
            managerEvaluationDeadline: ( over.managerDeadline !== undefined ) ? over.managerDeadline : "",
            teamEvaluationCompleted: false,
            teamEvaluationDeadline: "2026-11-15",
            teamEvaluationsSubmitted: 0,
            team: []
        }
    };
    await dataManager.instance.saveEvaluation( evaluation );
    return evaluation;
}

describe( "CompetenceFramework — backfillMissingEvaluationDeadlines", () => {

    it( "fills empty self/manager deadlines on an OPEN evaluation from its cycle's dates", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1" } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 1 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "2030-02-15" ); // cycle.teamFeedbackDeadline
        assert.equal( fetched.workflow.managerEvaluationDeadline, "2030-04-30" ); // cycle.cycleDate
    } );

    it( "falls back to cycleDate for the self deadline when the cycle has no teamFeedbackDeadline", async () => {
        await seedCycle( { teamFeedbackDeadline: "" } );
        await seedEvaluation( { evaluationID: "eval-1" } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 1 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "2030-04-30" ); // cycle.cycleDate fallback
        assert.equal( fetched.workflow.managerEvaluationDeadline, "2030-04-30" );
    } );

    it( "does not overwrite an evaluation whose deadlines are already set", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1", selfDeadline: "2020-01-01", managerDeadline: "2020-02-02" } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 0 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "2020-01-01" );
        assert.equal( fetched.workflow.managerEvaluationDeadline, "2020-02-02" );
    } );

    it( "is idempotent — running it twice fills nothing on the second pass", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1" } );

        const first = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( first.updated, 1 );

        const second = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( second.updated, 0 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "2030-02-15" );
        assert.equal( fetched.workflow.managerEvaluationDeadline, "2030-04-30" );
    } );

    it( "does not touch a CLOSED evaluation with empty deadlines", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1", status: configurationLoader.evaluationStatus.CLOSED } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 0 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "" );
        assert.equal( fetched.workflow.managerEvaluationDeadline, "" );
    } );

    it( "does not touch a DELETED evaluation with empty deadlines", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1", status: configurationLoader.evaluationStatus.DELETED } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 0 );

        // fetchEvaluation 404s on DELETED by design (soft-delete read filter) — read the raw cache entry instead.
        const cache = require( "@ti-engine/core/cache" );
        const [ fetched ] = await cache.instance.getJSON( "ti:competence:data:evaluations", [ "emp-1", "eval-1" ] );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "" );
        assert.equal( fetched.workflow.managerEvaluationDeadline, "" );
    } );

    it( "leaves an evaluation's deadlines unchanged (and does not throw) when its cycle cannot be resolved", async () => {
        // No cycle seeded at all — the evaluation references a cycleID that does not exist.
        await seedEvaluation( { evaluationID: "eval-1", cycleID: "no-such-cycle" } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 0 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "" );
        assert.equal( fetched.workflow.managerEvaluationDeadline, "" );
    } );

    it( "only fills the field that is actually empty, leaving an already-set companion field untouched", async () => {
        await seedCycle();
        await seedEvaluation( { evaluationID: "eval-1", selfDeadline: "2020-01-01", managerDeadline: "" } );

        const summary = await competenceFramework.instance.backfillMissingEvaluationDeadlines();
        assert.equal( summary.updated, 1 );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.workflow.selfEvaluationDeadline, "2020-01-01" ); // untouched
        assert.equal( fetched.workflow.managerEvaluationDeadline, "2030-04-30" ); // filled
    } );

} );
