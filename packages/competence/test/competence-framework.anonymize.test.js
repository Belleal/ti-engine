/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const competenceFramework = require( "#competence-framework" );
const configurationLoader = require( "#configuration-loader" );

function evaluationAt( status ) {
    return {
        status: status,
        grades: {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "U", individual: [ "U", "R" ] } }
        }
    };
}

describe( "CompetenceFramework — anonymizeEvaluationGrades: employee reveal at Ready", () => {

    it( "hides the manager grade and team grades from the employee while OPEN", () => {
        const evaluation = evaluationAt( configurationLoader.evaluationStatus.OPEN );
        competenceFramework.instance.anonymizeEvaluationGrades( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( evaluation.grades[ "E1-1" ].employee, "S", "the employee keeps their own self grade" );
        assert.equal( Object.prototype.hasOwnProperty.call( evaluation.grades[ "E1-1" ], "manager" ), false );
        assert.equal( Object.prototype.hasOwnProperty.call( evaluation.grades[ "E1-1" ], "team" ), false );
    } );

    it( "still hides them during IN_REVIEW (manager not finalized)", () => {
        const evaluation = evaluationAt( configurationLoader.evaluationStatus.IN_REVIEW );
        competenceFramework.instance.anonymizeEvaluationGrades( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( Object.prototype.hasOwnProperty.call( evaluation.grades[ "E1-1" ], "manager" ), false );
        assert.equal( Object.prototype.hasOwnProperty.call( evaluation.grades[ "E1-1" ], "team" ), false );
    } );

    it( "reveals the manager grade and the team cumulative to the employee at Ready, without leaking individual peer grades", () => {
        const evaluation = evaluationAt( configurationLoader.evaluationStatus.READY );
        competenceFramework.instance.anonymizeEvaluationGrades( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( evaluation.grades[ "E1-1" ].employee, "S" );
        assert.equal( evaluation.grades[ "E1-1" ].manager, "R", "manager grade is revealed once Ready" );
        // The team field is collapsed to the cumulative string — the individual reviewer grades are not exposed.
        assert.equal( evaluation.grades[ "E1-1" ].team, "U" );
    } );

    it( "reveals the manager grade and the team cumulative to the employee at Closed too (the 'My results' history path)", () => {
        const evaluation = evaluationAt( configurationLoader.evaluationStatus.CLOSED );
        competenceFramework.instance.anonymizeEvaluationGrades( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( evaluation.grades[ "E1-1" ].employee, "S" );
        assert.equal( evaluation.grades[ "E1-1" ].manager, "R", "manager grade stays visible once Closed" );
        // The team field is collapsed to the cumulative string — the individual reviewer grades are not exposed.
        assert.equal( evaluation.grades[ "E1-1" ].team, "U" );
    } );

    it( "always hides the self and manager grades from a team reviewer (collective config collapses to nothing)", () => {
        const evaluation = evaluationAt( configurationLoader.evaluationStatus.READY );
        competenceFramework.instance.anonymizeEvaluationGrades( evaluation, configurationLoader.roleCode.TEAM_MEMBER );
        // With the seeded collective config the whole grade entry is removed for team members; either way the
        // employee/manager grades must never be present.
        const entry = evaluation.grades[ "E1-1" ];
        if ( entry ) {
            assert.equal( Object.prototype.hasOwnProperty.call( entry, "employee" ), false );
            assert.equal( Object.prototype.hasOwnProperty.call( entry, "manager" ), false );
        }
    } );

} );

function feedbackEvaluationAt( status ) {
    return {
        status: status,
        comment: "employee self reflection",
        feedback: {
            managerComment: "manager private note",
            teamComments: [ "peer one", "peer two" ]
        }
    };
}

const hasKey = ( object, key ) => Object.prototype.hasOwnProperty.call( object, key );

describe( "CompetenceFramework — anonymizeEvaluationScores: employee feedback exposure", () => {

    it( "withholds the manager comment and the raw peer comments from the employee while OPEN", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.OPEN );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( hasKey( evaluation.feedback, "managerComment" ), false, "manager comment must be withheld before results are revealed" );
        assert.deepEqual( evaluation.feedback.teamComments, [], "raw peer comments must never reach the employee" );
        assert.equal( evaluation.comment, "employee self reflection", "the employee keeps their own self-reflection" );
    } );

    it( "still withholds the manager comment from the employee during IN_REVIEW (not yet finalized)", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.IN_REVIEW );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( hasKey( evaluation.feedback, "managerComment" ), false );
        assert.deepEqual( evaluation.feedback.teamComments, [] );
    } );

    it( "reveals the manager comment to the employee at Ready, but still never the raw peer comments", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.READY );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( evaluation.feedback.managerComment, "manager private note", "manager comment is revealed once Ready (mirrors the manager grade)" );
        assert.deepEqual( evaluation.feedback.teamComments, [], "raw peer comments stay withheld even at Ready — only the team cumulative grade is shown" );
    } );

    it( "keeps the manager comment revealed at Closed, raw peer comments still withheld", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.CLOSED );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.EMPLOYEE );
        assert.equal( evaluation.feedback.managerComment, "manager private note" );
        assert.deepEqual( evaluation.feedback.teamComments, [] );
    } );

    it( "gives the manager full visibility of their own comment and the raw peer comments at any stage", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.IN_REVIEW );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.MANAGER );
        assert.equal( evaluation.feedback.managerComment, "manager private note" );
        assert.deepEqual( evaluation.feedback.teamComments, [ "peer one", "peer two" ] );
        assert.equal( evaluation.comment, "employee self reflection", "the manager also sees the employee's self-reflection" );
    } );

    it( "strips all feedback and the self-reflection from a team reviewer", () => {
        const evaluation = feedbackEvaluationAt( configurationLoader.evaluationStatus.OPEN );
        competenceFramework.instance.anonymizeEvaluationScores( evaluation, configurationLoader.roleCode.TEAM_MEMBER );
        assert.equal( hasKey( evaluation.feedback, "managerComment" ), false );
        assert.deepEqual( evaluation.feedback.teamComments, [] );
        assert.equal( hasKey( evaluation, "comment" ), false, "a team reviewer must not receive the employee's self-reflection" );
    } );

} );
