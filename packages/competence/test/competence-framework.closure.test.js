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
