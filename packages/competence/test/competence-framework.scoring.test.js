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

beforeEach( async () => {
    installInMemoryCache();
    require( "#configuration-loader" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await require( "#data-manager" ).instance.initialize();
} );

// Three single-competency categories (E/I/C), relevancy 10 at R1. `over.grades` overrides the grade map;
// `over.self/team/manager` (default true) drive the participation completion flags.
function scoringEval( over = {} ) {
    const relevancy = { R1: 10 };
    return {
        stageLevel: "R1",
        snapshot: [
            { code: "E1-1", category: "E", relevancy },
            { code: "I1-1", category: "I", relevancy },
            { code: "C1-1", category: "C", relevancy }
        ],
        grades: over.grades || {
            "E1-1": { employee: "R", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "R", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "R", manager: "R", team: { cumulative: "R" } }
        },
        scores: {},
        finalScore: {},
        workflow: {
            selfEvaluationCompleted: over.self !== false,
            teamEvaluationCompleted: over.team !== false,
            teamEvaluationsSubmitted: ( over.teamSubmitted !== undefined ) ? over.teamSubmitted : ( over.team !== false ? 2 : 0 ),
            managerEvaluationCompleted: over.manager !== false
        }
    };
}

describe( "calculateFinalEvaluationScores — participating-source renormalization", () => {
    it( "scores all-R at ~100 when all three sources participate", () => {
        const e = scoringEval();
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 );
    } );

    it( "scores a no-team all-R evaluation at 100 (not depressed by the unused 0.30 team weight)", () => {
        const e = scoringEval( { team: false } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 ); // pre-change this was ceil(0.7*100) = 70
    } );

    it( "excludes a waived self round entirely, even with leftover draft self-grades", () => {
        const grades = {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "S", manager: "R", team: { cumulative: "R" } }
        };
        const e = scoringEval( { self: false, grades } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 ); // self "S" ignored because selfEvaluationCompleted is false
    } );

    it( "excludes a team round finalized with zero submissions (renormalizes to 100, not 70)", () => {
        // allowFinalizeTeamWithoutSubmissions can complete the team round with no submissions and an empty cumulative;
        // that round must not count as participating (else its 0.30 weight depresses an all-R self/manager to 70).
        const grades = {
            "E1-1": { employee: "R", manager: "R", team: { cumulative: "" } },
            "I1-1": { employee: "R", manager: "R", team: { cumulative: "" } },
            "C1-1": { employee: "R", manager: "R", team: { cumulative: "" } }
        };
        const e = scoringEval( { team: true, teamSubmitted: 0, grades } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 );
    } );

    it( "still differentiates when all participate (self S, team R, manager R => 106)", () => {
        const grades = {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "S", manager: "R", team: { cumulative: "R" } }
        };
        const e = scoringEval( { grades } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 106 );
    } );
} );
