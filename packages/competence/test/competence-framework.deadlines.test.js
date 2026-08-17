/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let competenceFramework;

beforeEach( async () => {
    installInMemoryCache();
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    const dataManager = require( "#data-manager" );
    await dataManager.instance.initialize();
} );

function employee() {
    return { employeeID: "emp-1", career: { roleFamily: "SE", specialization: null, level: "R", stage: "1" } };
}
function snapshot() {
    return [ { code: "E1-1", category: "E", relevancy: { R1: 10 } } ];
}

describe( "createNewEvaluation — deadline population", () => {
    it( "sets managerEvaluationDeadline to the cycle date and selfEvaluationDeadline to the team-feedback deadline", () => {
        const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30", teamFeedbackDeadline: "2026-10-31" };
        const evaluation = competenceFramework.instance.createNewEvaluation( employee(), cycle, snapshot() );
        assert.equal( evaluation.workflow.managerEvaluationDeadline, "2026-11-30" );
        assert.equal( evaluation.workflow.selfEvaluationDeadline, "2026-10-31" );
    } );

    it( "falls back selfEvaluationDeadline to the cycle date when the cycle has no team-feedback deadline", () => {
        const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30" };
        const evaluation = competenceFramework.instance.createNewEvaluation( employee(), cycle, snapshot() );
        assert.equal( evaluation.workflow.selfEvaluationDeadline, "2026-11-30" );
        assert.equal( evaluation.workflow.managerEvaluationDeadline, "2026-11-30" );
    } );
} );

describe( "resolveMissedRounds — rounds that closed without producing grades (CA-104)", () => {
    function workflow( overrides ) {
        return { workflow: Object.assign( {
            selfEvaluationCompleted: false,
            selfEvaluationWaived: false,
            teamEvaluationCompleted: false,
            teamEvaluationsSubmitted: 0,
            team: [ "peer-1" ]
        }, overrides ) };
    }

    it( "reports a waived self round", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( { selfEvaluationWaived: true } ) );
        assert.equal( missed.self, "waived" );
    } );

    it( "reports no missed self round when the self-assessment was submitted", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( { selfEvaluationCompleted: true } ) );
        assert.equal( missed.self, null );
    } );

    it( "reports no missed self round while the round is still open", () => {
        assert.equal( competenceFramework.instance.resolveMissedRounds( workflow( {} ) ).self, null );
    } );

    it( "reports a peer round finalized with zero submissions", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( { teamEvaluationCompleted: true, team: [] } ) );
        assert.equal( missed.team, "no-responses" );
    } );

    it( "reports no missed peer round when at least one peer submitted — a submitting peer must grade the whole set, so every competency carries a cumulative", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( {
            teamEvaluationCompleted: true,
            teamEvaluationsSubmitted: 1,
            team: []
        } ) );
        assert.equal( missed.team, null );
    } );

    it( "reports an evaluation that never had peer reviewers assigned", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( { team: [] } ) );
        assert.equal( missed.team, "none-assigned" );
    } );

    it( "reports no missed peer round while reviewers are still pending", () => {
        assert.equal( competenceFramework.instance.resolveMissedRounds( workflow( {} ) ).team, null );
    } );

    it( "never reports the manager round — a late manager submit is never blocked, so a blank manager grade stays pending", () => {
        const missed = competenceFramework.instance.resolveMissedRounds( workflow( { managerEvaluationCompleted: false } ) );
        assert.deepEqual( Object.keys( missed ).sort(), [ "self", "team" ] );
    } );

    it( "concludes nothing without a workflow rather than mistaking an absent roster for an empty one", () => {
        assert.deepEqual( competenceFramework.instance.resolveMissedRounds( {} ), { self: null, team: null } );
        assert.deepEqual( competenceFramework.instance.resolveMissedRounds( null ), { self: null, team: null } );
    } );
} );
