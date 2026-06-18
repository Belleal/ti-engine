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
