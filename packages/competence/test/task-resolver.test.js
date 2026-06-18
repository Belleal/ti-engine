/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const taskResolver = require( "#task-resolver" );

/**
 * Builds an OPEN evaluation record with a workflow, overridable per field. The resolver only reads
 * evaluationID / employeeID / status / workflow.{team, teamEvaluationDeadline, teamEvaluationsSubmitted}.
 */
function evaluation( over = {} ) {
    return {
        evaluationID: over.evaluationID || "e1",
        employeeID: over.employeeID || "emp1",
        status: over.status || "Open",
        workflow: {
            team: over.team || [],
            teamEvaluationDeadline: ( over.deadline !== undefined ) ? over.deadline : "2026-07-15",
            teamEvaluationsSubmitted: over.submitted || 0
        }
    };
}

function ctx( over = {} ) {
    return {
        isSupervisor: over.isSupervisor === true,
        canManage: over.canManage || ( () => false ),
        today: over.today || "2026-07-10",
        resolveName: over.resolveName || ( ( id ) => `Name(${ id })` )
    };
}

describe( "TaskResolver — team-feedback discovery", () => {

    it( "emits a team-feedback task when the user is an assigned reviewer on an OPEN evaluation", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), [ evaluation( { team: [ "u1", "u2" ] } ) ] );
        assert.equal( tasks.length, 1 );
        assert.deepEqual( tasks[ 0 ], {
            type: "team-feedback",
            evaluationID: "e1",
            employeeID: "emp1",
            employeeName: "Name(emp1)",
            deadline: "2026-07-15",
            overdue: false
        } );
    } );

    it( "does not emit team-feedback for a non-OPEN evaluation", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), [ evaluation( { status: "In Review", team: [ "u1" ] } ) ] );
        assert.equal( tasks.length, 0 );
    } );

    it( "excludes the user's own evaluation even if they appear in the team", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), [ evaluation( { employeeID: "u1", team: [ "u1" ] } ) ] );
        assert.equal( tasks.filter( ( t ) => t.type === "team-feedback" ).length, 0 );
    } );

    it( "does not emit team-feedback for a user not on the team", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), [ evaluation( { team: [ "u2", "u3" ] } ) ] );
        assert.equal( tasks.length, 0 );
    } );

    it( "flags overdue when the deadline has passed", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { today: "2026-07-20" } ), [ evaluation( { team: [ "u1" ] } ) ] );
        assert.equal( tasks.find( ( t ) => t.type === "team-feedback" ).overdue, true );
    } );

    it( "treats a missing/empty deadline as not overdue", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { today: "2026-07-20" } ), [ evaluation( { team: [ "u1" ], deadline: "" } ) ] );
        assert.equal( tasks.find( ( t ) => t.type === "team-feedback" ).overdue, false );
    } );

    it( "falls back to the employeeID when no name resolver is provided", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", { isSupervisor: false, canManage: () => false, today: "2026-07-10" }, [ evaluation( { team: [ "u1" ] } ) ] );
        assert.equal( tasks[ 0 ].employeeName, "emp1" );
    } );

} );

describe( "TaskResolver — team-finalize discovery", () => {

    // OPEN, past the deadline, two reviewers still pending, one already submitted.
    const pastDeadline = () => [ evaluation( { team: [ "u2", "u3" ], deadline: "2026-07-15", submitted: 1 } ) ];

    it( "emits team-finalize for a supervisor when past the deadline with a non-empty team", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-20" } ), pastDeadline() );
        const t = tasks.find( ( x ) => x.type === "team-finalize" );
        assert.ok( t, "expected a team-finalize task" );
        assert.equal( t.evaluationID, "e1" );
        assert.equal( t.pendingCount, 2 );
        assert.equal( t.submittedCount, 1 );
        assert.equal( t.employeeName, "Name(emp1)" );
    } );

    it( "emits team-finalize for the org manager (canManage true)", () => {
        const tasks = taskResolver.instance.resolveTasks( "mgr", ctx( { canManage: ( id ) => id === "emp1", today: "2026-07-20" } ), pastDeadline() );
        assert.ok( tasks.some( ( t ) => t.type === "team-finalize" ) );
    } );

    it( "does NOT emit team-finalize before the deadline", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-10" } ), pastDeadline() );
        assert.equal( tasks.some( ( t ) => t.type === "team-finalize" ), false );
    } );

    it( "does NOT emit team-finalize when the team is already empty", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-20" } ), [ evaluation( { team: [], submitted: 3 } ) ] );
        assert.equal( tasks.some( ( t ) => t.type === "team-finalize" ), false );
    } );

    it( "does NOT emit team-finalize for a plain user with no manage rights", () => {
        const tasks = taskResolver.instance.resolveTasks( "u9", ctx( { today: "2026-07-20" } ), pastDeadline() );
        assert.equal( tasks.some( ( t ) => t.type === "team-finalize" ), false );
    } );

    it( "does NOT emit team-finalize when the deadline is empty (defensive)", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-20" } ), [ evaluation( { team: [ "u2" ], deadline: "" } ) ] );
        assert.equal( tasks.some( ( t ) => t.type === "team-finalize" ), false );
    } );

} );

describe( "TaskResolver — guards & combinations", () => {

    it( "returns [] for missing/invalid inputs", () => {
        assert.deepEqual( taskResolver.instance.resolveTasks( "", ctx(), [] ), [] );
        assert.deepEqual( taskResolver.instance.resolveTasks( "u1", null, [] ), [] );
        assert.deepEqual( taskResolver.instance.resolveTasks( "u1", ctx(), null ), [] );
    } );

    it( "a supervisor who is also a reviewer gets both tasks for the same evaluation past the deadline", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-20" } ), [ evaluation( { team: [ "sup" ] } ) ] );
        assert.ok( tasks.some( ( t ) => t.type === "team-feedback" ) );
        assert.ok( tasks.some( ( t ) => t.type === "team-finalize" ) );
    } );

    it( "resolves tasks across multiple evaluations independently", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", employeeID: "empA", team: [ "u1" ], deadline: "2026-07-15" } ),
            evaluation( { evaluationID: "e2", employeeID: "empB", team: [ "u2" ], deadline: "2026-07-15" } ),
            evaluation( { evaluationID: "e3", employeeID: "empC", status: "Closed", team: [ "u1" ] } )
        ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.length, 1 );
        assert.equal( tasks[ 0 ].evaluationID, "e1" );
    } );

} );
