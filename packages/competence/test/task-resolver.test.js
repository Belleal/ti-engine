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
 * Builds an evaluation record with a workflow, overridable per field. The resolver reads
 * evaluationID / employeeID / status / interviewDate / workflow.{team, teamEvaluationDeadline,
 * teamEvaluationsSubmitted}. Defaults to an OPEN evaluation with no interview scheduled.
 */
function evaluation( over = {} ) {
    return {
        evaluationID: over.evaluationID || "e1",
        employeeID: over.employeeID || "emp1",
        status: over.status || "Open",
        interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : null,
        closure: ( over.closure !== undefined ) ? over.closure : null,
        workflow: {
            team: over.team || [],
            teamEvaluationDeadline: ( over.deadline !== undefined ) ? over.deadline : "2026-07-15",
            teamEvaluationsSubmitted: over.submitted || 0,
            selfEvaluationDeadline: ( over.selfDeadline !== undefined ) ? over.selfDeadline : "",
            selfEvaluationCompleted: over.selfDone === true,
            managerEvaluationDeadline: ( over.managerDeadline !== undefined ) ? over.managerDeadline : "",
            managerEvaluationCompleted: over.managerDone === true
        }
    };
}

function ctx( over = {} ) {
    return {
        isSupervisor: over.isSupervisor === true,
        canManage: over.canManage || ( () => false ),
        isInterviewManager: over.isInterviewManager || ( () => false ),
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

describe( "TaskResolver — interview-schedule (supervisor aggregate)", () => {

    // Two READY evaluations with no interview scheduled yet.
    const readyUnscheduled = () => [
        evaluation( { evaluationID: "e1", employeeID: "empA", status: "Ready", interviewDate: null } ),
        evaluation( { evaluationID: "e2", employeeID: "empB", status: "Ready", interviewDate: null } )
    ];

    it( "emits a single aggregate task for a supervisor, counting READY evaluations without an interview date", () => {
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true } ), readyUnscheduled() );
        const scheduleTasks = tasks.filter( ( t ) => t.type === "interview-schedule" );
        assert.equal( scheduleTasks.length, 1 );
        assert.equal( scheduleTasks[ 0 ].count, 2 );
    } );

    it( "excludes already-scheduled READY evaluations from the count", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", employeeID: "empA", status: "Ready", interviewDate: null } ),
            evaluation( { evaluationID: "e2", employeeID: "empB", status: "Ready", interviewDate: "2026-08-01" } )
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true } ), evaluations );
        assert.equal( tasks.find( ( t ) => t.type === "interview-schedule" ).count, 1 );
    } );

    it( "does NOT emit an interview-schedule task for a non-supervisor", () => {
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { isSupervisor: false } ), readyUnscheduled() );
        assert.equal( tasks.some( ( t ) => t.type === "interview-schedule" ), false );
    } );

    it( "does NOT emit an interview-schedule task when every READY evaluation is already scheduled", () => {
        const evaluations = [ evaluation( { status: "Ready", interviewDate: "2026-08-01" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-schedule" ), false );
    } );

    it( "does NOT count OPEN evaluations as awaiting interview scheduling", () => {
        const evaluations = [ evaluation( { status: "Open", interviewDate: null } ) ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-schedule" ), false );
    } );

} );

describe( "TaskResolver — interview-scheduled (self notification)", () => {

    it( "emits a self task for the viewer's own READY evaluation once an interview date is set", () => {
        const evaluations = [ evaluation( { evaluationID: "e9", employeeID: "u1", status: "Ready", interviewDate: "2026-08-01" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), evaluations );
        const selfTask = tasks.find( ( t ) => t.type === "interview-scheduled" && t.audience === "self" );
        assert.ok( selfTask, "expected a self interview-scheduled task" );
        assert.equal( selfTask.evaluationID, "e9" );
        assert.equal( selfTask.interviewDate, "2026-08-01" );
    } );

    it( "does NOT emit a self task while the interview is unscheduled", () => {
        const evaluations = [ evaluation( { employeeID: "u1", status: "Ready", interviewDate: null } ) ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" ), false );
    } );

    it( "does NOT emit a self task for a non-READY own evaluation", () => {
        const evaluations = [ evaluation( { employeeID: "u1", status: "In Review", interviewDate: "2026-08-01" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx(), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" ), false );
    } );

} );

describe( "TaskResolver — interview-scheduled (manager notification)", () => {

    const scheduledReport = () => [ evaluation( { evaluationID: "e5", employeeID: "emp1", status: "Ready", interviewDate: "2026-08-01" } ) ];

    it( "emits a manager task for the interview's conducting manager (the booked-slot owner)", () => {
        const tasks = taskResolver.instance.resolveTasks( "mgr", ctx( { isInterviewManager: ( evalID ) => evalID === "e5" } ), scheduledReport() );
        const managerTask = tasks.find( ( t ) => t.type === "interview-scheduled" && t.audience === "manager" );
        assert.ok( managerTask, "expected a manager interview-scheduled task" );
        assert.equal( managerTask.evaluationID, "e5" );
        assert.equal( managerTask.employeeID, "emp1" );
        assert.equal( managerTask.employeeName, "Name(emp1)" );
        assert.equal( managerTask.interviewDate, "2026-08-01" );
    } );

    it( "targets the conducting manager from the booked slot, NOT the reporting line", () => {
        // A covering manager who is nowhere in the evaluatee's chain (canManage false) still gets the task when they
        // are the one conducting the interview — the org relationship never drives the recipient.
        const tasks = taskResolver.instance.resolveTasks( "cover", ctx( { canManage: () => false, isInterviewManager: ( evalID ) => evalID === "e5" } ), scheduledReport() );
        assert.ok( tasks.some( ( t ) => t.type === "interview-scheduled" && t.audience === "manager" ), "expected the conducting (covering) manager to be notified" );
    } );

    it( "does NOT emit a manager task for a superior manager who is not conducting the interview", () => {
        // canManage (any superior in the chain) is true, but the viewer is not the booked slot's owner — the task
        // follows the interview participants, so it never propagates up the reporting chain to non-participants.
        const tasks = taskResolver.instance.resolveTasks( "boss", ctx( { canManage: () => true, isInterviewManager: () => false } ), scheduledReport() );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" && t.audience === "manager" ), false );
    } );

    it( "does NOT emit a manager task for the viewer's own evaluation", () => {
        const evaluations = [ evaluation( { employeeID: "mgr", status: "Ready", interviewDate: "2026-08-01" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "mgr", ctx( { isInterviewManager: () => true } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" && t.audience === "manager" ), false );
    } );

    it( "does NOT emit a manager task for a user not conducting the interview", () => {
        const tasks = taskResolver.instance.resolveTasks( "u9", ctx(), scheduledReport() );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" && t.audience === "manager" ), false );
    } );

    it( "does NOT emit interview tasks for a Closed evaluation", () => {
        const evaluations = [ evaluation( { employeeID: "emp1", status: "Closed", interviewDate: "2026-08-01" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "mgr", ctx( { isSupervisor: true, isInterviewManager: () => true } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-schedule" || t.type === "interview-scheduled" ), false );
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

describe( "TaskResolver — interview-close (supervisor aggregate)", () => {

    it( "emits an interview-close aggregate for READY evals whose interview date has passed", () => {
        const evaluations = [
            evaluation( { evaluationID: "a", status: "Ready", interviewDate: "2026-07-05" } ),
            evaluation( { evaluationID: "b", status: "Ready", interviewDate: "2026-07-08" } ),
            evaluation( { evaluationID: "c", status: "Ready", interviewDate: "2026-07-20" } )   // still future — not counted
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup1", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        const close = tasks.find( ( t ) => t.type === "interview-close" );
        assert.deepEqual( close, { type: "interview-close", count: 2 } );
    } );

    it( "does NOT emit interview-close for a non-supervisor", () => {
        const evaluations = [ evaluation( { status: "Ready", interviewDate: "2026-07-05" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "mgr1", ctx( { isSupervisor: false, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-close" ), false );
    } );

    it( "suppresses the interview-scheduled self notice once the interview date has passed", () => {
        const evaluations = [ evaluation( { status: "Ready", employeeID: "emp1", interviewDate: "2026-07-05" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" ), false );
    } );

    it( "still emits the interview-scheduled self notice while the interview is upcoming", () => {
        const evaluations = [ evaluation( { status: "Ready", employeeID: "emp1", interviewDate: "2026-07-20" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.ok( tasks.find( ( t ) => t.type === "interview-scheduled" && t.audience === "self" ) );
    } );

} );

describe( "TaskResolver — evaluation-closed (evaluee notice)", () => {

    it( "emits an evaluation-closed notice to the evaluee within the 14-day window", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "evaluation-closed" ), { type: "evaluation-closed", evaluationID: "e1", closedAt: "2026-07-06T09:00:00.000Z" } );
    } );

    it( "does NOT emit the notice after the 14-day window", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-06-01T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "evaluation-closed" ), false );
    } );

    it( "does NOT emit the notice to anyone other than the evaluee", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "sup1", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "evaluation-closed" ), false );
    } );

    it( "emits at exactly the 14-day boundary but not at 15 days", () => {
        const at14 = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-20" } ),
            [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ] );
        assert.ok( at14.find( ( t ) => t.type === "evaluation-closed" ), "day 14 still emits" );
        const at15 = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-21" } ),
            [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ] );
        assert.equal( at15.some( ( t ) => t.type === "evaluation-closed" ), false, "day 15 does not emit" );
    } );

} );

describe( "TaskResolver — overdue-self / overdue-manager (supervisor aggregates)", () => {
    it( "counts OPEN evaluations past the self deadline with self incomplete", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", status: "Open", selfDeadline: "2026-07-01", selfDone: false } ),
            evaluation( { evaluationID: "e2", status: "Open", selfDeadline: "2026-07-01", selfDone: true } ), // done — excluded
            evaluation( { evaluationID: "e3", status: "Open", selfDeadline: "2026-08-01", selfDone: false } ) // future — excluded
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "overdue-self" ), { type: "overdue-self", count: 1 } );
    } );

    it( "counts IN_REVIEW evaluations past the manager deadline with manager incomplete", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", status: "In Review", managerDeadline: "2026-07-01", managerDone: false } )
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "overdue-manager" ), { type: "overdue-manager", count: 1 } );
    } );

    it( "emits neither aggregate for a non-supervisor", () => {
        const evaluations = [ evaluation( { status: "Open", selfDeadline: "2026-07-01", selfDone: false } ) ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { isSupervisor: false, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "overdue-self" || t.type === "overdue-manager" ), false );
    } );
} );
