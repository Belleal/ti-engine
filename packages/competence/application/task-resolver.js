/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const configurationLoader = require( "#configuration-loader" );

/**
 * @typedef {Object} TaskResolverContext
 * @property {boolean} isSupervisor - Whether the requesting user holds the Supervisor role.
 * @property {function(string): boolean} canManage - Predicate: can the user act as a manager for the given employeeID,
 *           i.e. is anywhere up their reporting chain (org hierarchy). Injected by the caller so the resolver performs
 *           no organization I/O. Used for team-finalize (any superior may close out the round).
 * @property {function(string): boolean} [isInterviewManager] - Predicate keyed by *evaluationID*: is the user the
 *           manager conducting that evaluation's interview (the owner of the booked calendar slot). Injected by the
 *           caller. This — not the reporting line — drives the interview notification, so it correctly follows the
 *           actual participant even when a covering manager (e.g. a stand-in for an absent direct manager) runs it.
 * @property {string} today - Current date as `YYYY-MM-DD`, used for deadline comparisons.
 * @property {function(string): string} [resolveName] - Optional injected employee-name lookup; falls back to the
 *           employeeID itself when absent.
 */

/**
 * @typedef {Object} TeamFeedbackTask
 * @property {"team-feedback"} type
 * @property {string} evaluationID
 * @property {string} employeeID - The evaluatee.
 * @property {string} employeeName
 * @property {string} deadline - Team-feedback deadline (`YYYY-MM-DD`), or "" when unset.
 * @property {boolean} overdue - True only when a deadline is set and `today` is strictly past it.
 */

/**
 * @typedef {Object} TeamFinalizeTask
 * @property {"team-finalize"} type
 * @property {string} evaluationID
 * @property {string} employeeID - The evaluatee.
 * @property {string} employeeName
 * @property {number} pendingCount - Reviewers still owing feedback.
 * @property {number} submittedCount - Reviewers who already submitted.
 */

/**
 * @typedef {Object} InterviewScheduleTask
 * @property {"interview-schedule"} type
 * @property {number} count - Number of READY evaluations org-wide still awaiting an interview slot. Emitted once, for
 *           Supervisors only (the sole role that can book a slot), as a single aggregate rather than one-per-evaluation.
 */

/**
 * @typedef {Object} InterviewScheduledTask
 * @property {"interview-scheduled"} type
 * @property {"self"|"manager"} audience - "self" for the evaluatee, "manager" for the evaluatee's manager.
 * @property {string} evaluationID
 * @property {string} [employeeID] - The evaluatee (present for the "manager" audience).
 * @property {string} [employeeName] - The evaluatee's resolved name (present for the "manager" audience).
 * @property {string} interviewDate - The scheduled interview date (`YYYY-MM-DD`).
 */

/**
 * @typedef {Object} InterviewCloseTask
 * @property {"interview-close"} type
 * @property {number} count - READY evaluations whose interview date has passed and that still await formal closure.
 *           Emitted once, for Supervisors only (the sole role that can close), as a single aggregate.
 */

/**
 * @typedef {Object} EvaluationClosedTask
 * @property {"evaluation-closed"} type
 * @property {string} evaluationID
 * @property {string} closedAt - ISO-8601 timestamp of closure (the evaluee is notified for a short window afterwards).
 */

/**
 * @typedef {Object} OverdueSelfTask
 * @property {"overdue-self"} type
 * @property {number} count - `Open` evaluations org-wide whose self-evaluation deadline (`workflow.selfEvaluationDeadline`)
 *           has passed while `selfEvaluationCompleted` is still false. Emitted once, for Supervisors only, as a single
 *           aggregate (the CA-59 deadline-governance stall-recovery cue), deep-linking to the Evaluations Oversight
 *           screen where the Supervisor may waive the round via `finalizeSelfEvaluation`.
 */

/**
 * @typedef {Object} OverdueManagerTask
 * @property {"overdue-manager"} type
 * @property {number} count - `In Review` evaluations org-wide whose manager-evaluation deadline
 *           (`workflow.managerEvaluationDeadline`) has passed while `managerEvaluationCompleted` is still false.
 *           Emitted once, for Supervisors only, as a single aggregate; the manager deadline is a nudge, not a block, so
 *           this task is purely informational and deep-links to the Evaluations Oversight screen where a Supervisor may
 *           complete the manager grades on the manager's behalf.
 */

/**
 * Derives a user's actionable dashboard tasks from already-fetched evaluation/workflow state. Pure by design: it does
 * no persistence and no organization lookups of its own — the manager predicate and the name resolver are injected via
 * `ctx`, so the resolver is fully unit-testable with stubs. This is the seed of a future reusable `web-framework` tasks
 * module; keep it free of competence-specific I/O. (The OPEN-status constant is read from the competence config for
 * now; that becomes a parameter when the module is lifted out.)
 *
 * @class TaskResolver
 * @singleton
 * @public
 */
class TaskResolver {

    static #instance = null;

    /**
     * @constructor
     * @returns {TaskResolver}
     */
    constructor() {
        if ( !TaskResolver.#instance ) {
            TaskResolver.#instance = this;
        }
        return TaskResolver.#instance;
    }

    /**
     * Resolves the in-scope task descriptors for the given user: `team-feedback` / `team-finalize` (from OPEN
     * evaluations), plus the interview tasks (from READY evaluations) — `interview-schedule` (a Supervisor-only
     * aggregate of interviews awaiting a slot) and `interview-scheduled` (informing the evaluatee and their manager
     * once a slot is booked) — plus the CA-59 deadline-governance Supervisor aggregates `overdue-self` /
     * `overdue-manager` (OPEN/IN_REVIEW evaluations whose self/manager deadline has passed while that round is still
     * incomplete).
     *
     * @method
     * @param {string} userID
     * @param {TaskResolverContext} ctx
     * @param {Array<Evaluation>} evaluations - Already-fetched evaluations to derive tasks from.
     * @returns {Array<TeamFeedbackTask|TeamFinalizeTask|InterviewScheduleTask|InterviewScheduledTask|InterviewCloseTask|EvaluationClosedTask|OverdueSelfTask|OverdueManagerTask>}
     * @public
     */
    resolveTasks( userID, ctx, evaluations ) {
        if ( !userID || !ctx || !Array.isArray( evaluations ) ) {
            return [];
        }

        const today = ctx.today || "";
        const resolveName = ( typeof ctx.resolveName === "function" ) ? ctx.resolveName : ( id ) => id;
        const canManage = ( typeof ctx.canManage === "function" ) ? ctx.canManage : () => false;
        const isInterviewManager = ( typeof ctx.isInterviewManager === "function" ) ? ctx.isInterviewManager : () => false;
        const isSupervisor = ( ctx.isSupervisor === true );

        const tasks = [];

        // A Supervisor gets a single aggregate "awaiting scheduling" task rather than one-per-evaluation (they schedule
        // across the whole organization). Accumulate the count while iterating; emit once after the loop.
        let interviewsAwaitingScheduling = 0;
        // A Supervisor also gets a single aggregate "awaiting closure" task for interviews already held (date passed).
        let interviewsHeldAwaitingClosure = 0;
        // A Supervisor also gets single aggregates for OPEN/IN_REVIEW evaluations whose self/manager deadline has
        // passed while the corresponding evaluation step is still incomplete.
        let overdueSelf = 0;
        let overdueManager = 0;
        // The evaluatee is notified their evaluation closed for a short window after closure, then it drops off.
        const CLOSED_NOTICE_WINDOW_DAYS = 14;

        for ( const evaluation of evaluations ) {
            if ( !evaluation ) {
                continue;
            }

            const workflow = evaluation.workflow || {};

            if ( isSupervisor && evaluation.status === configurationLoader.evaluationStatus.OPEN
                && !workflow.selfEvaluationCompleted && !workflow.selfEvaluationWaived
                && workflow.selfEvaluationDeadline && today !== "" && today > workflow.selfEvaluationDeadline ) {
                overdueSelf++;
            }
            if ( isSupervisor && evaluation.status === configurationLoader.evaluationStatus.IN_REVIEW
                && !workflow.managerEvaluationCompleted
                && workflow.managerEvaluationDeadline && today !== "" && today > workflow.managerEvaluationDeadline ) {
                overdueManager++;
            }

            // team-feedback / team-finalize are derived from the still-open team-evaluation round.
            if ( evaluation.status === configurationLoader.evaluationStatus.OPEN ) {
                const team = Array.isArray( workflow.team ) ? workflow.team : [];
                const deadline = workflow.teamEvaluationDeadline || "";
                // A non-empty deadline strictly before today is "past". A missing/empty deadline is treated as NOT past
                // so legacy evaluations (created before deadlines were populated) never spuriously become
                // overdue/finalizable.
                const deadlinePassed = ( deadline !== "" && today > deadline );

                // team-feedback: the user is still an assigned reviewer on someone else's open evaluation.
                if ( team.includes( userID ) && evaluation.employeeID !== userID ) {
                    tasks.push( {
                        type: "team-feedback",
                        evaluationID: evaluation.evaluationID,
                        employeeID: evaluation.employeeID,
                        employeeName: resolveName( evaluation.employeeID ),
                        deadline: deadline,
                        overdue: deadlinePassed
                    } );
                }

                // team-finalize: a manager/supervisor may close out the still-pending team round once the deadline passes.
                if ( ( isSupervisor || canManage( evaluation.employeeID ) ) && deadlinePassed && team.length > 0 ) {
                    tasks.push( {
                        type: "team-finalize",
                        evaluationID: evaluation.evaluationID,
                        employeeID: evaluation.employeeID,
                        employeeName: resolveName( evaluation.employeeID ),
                        pendingCount: team.length,
                        submittedCount: workflow.teamEvaluationsSubmitted || 0
                    } );
                }

                continue;
            }

            // interview tasks are derived from a READY evaluation and whether its interview slot is booked yet
            // (evaluation.interviewDate is set by #bookInterviewSlot).
            if ( evaluation.status === configurationLoader.evaluationStatus.READY ) {
                const interviewDate = evaluation.interviewDate || "";

                if ( interviewDate === "" ) {
                    // Awaiting scheduling: only a Supervisor can book a slot, so only they are prompted (aggregated).
                    if ( isSupervisor ) {
                        interviewsAwaitingScheduling++;
                    }
                } else {
                    // Scheduled and still upcoming: inform the evaluatee and the conducting manager (slot owner). Once the
                    // interview date has passed these notices are stale, so they stop and the Supervisor's close-pending
                    // aggregate below takes over.
                    if ( interviewDate >= today ) {
                        if ( evaluation.employeeID === userID ) {
                            tasks.push( {
                                type: "interview-scheduled",
                                audience: "self",
                                evaluationID: evaluation.evaluationID,
                                interviewDate: interviewDate
                            } );
                        }
                        if ( evaluation.employeeID !== userID && isInterviewManager( evaluation.evaluationID ) ) {
                            tasks.push( {
                                type: "interview-scheduled",
                                audience: "manager",
                                evaluationID: evaluation.evaluationID,
                                employeeID: evaluation.employeeID,
                                employeeName: resolveName( evaluation.employeeID ),
                                interviewDate: interviewDate
                            } );
                        }
                    }
                    // Held (date reached/passed): a Supervisor is prompted to close it.
                    if ( isSupervisor && today !== "" && interviewDate <= today ) {
                        interviewsHeldAwaitingClosure++;
                    }
                }
            }

            // A freshly closed evaluation notifies its evaluatee that results/feedback/goals are available — for a short
            // window only, after which the passive Scores screen carries it.
            if ( evaluation.status === configurationLoader.evaluationStatus.CLOSED ) {
                const closure = evaluation.closure || {};
                const closedAtDate = ( typeof closure.closedAt === "string" ) ? closure.closedAt.slice( 0, 10 ) : "";
                if ( evaluation.employeeID === userID && closedAtDate !== "" && today !== "" ) {
                    const daysSince = Math.round( ( new Date( today + "T00:00:00Z" ) - new Date( closedAtDate + "T00:00:00Z" ) ) / 86400000 );
                    if ( daysSince >= 0 && daysSince <= CLOSED_NOTICE_WINDOW_DAYS ) {
                        tasks.push( {
                            type: "evaluation-closed",
                            evaluationID: evaluation.evaluationID,
                            closedAt: closure.closedAt
                        } );
                    }
                }
            }
        }

        if ( isSupervisor && interviewsAwaitingScheduling > 0 ) {
            tasks.push( {
                type: "interview-schedule",
                count: interviewsAwaitingScheduling
            } );
        }

        if ( isSupervisor && interviewsHeldAwaitingClosure > 0 ) {
            tasks.push( {
                type: "interview-close",
                count: interviewsHeldAwaitingClosure
            } );
        }

        if ( isSupervisor && overdueSelf > 0 ) {
            tasks.push( {
                type: "overdue-self",
                count: overdueSelf
            } );
        }
        if ( isSupervisor && overdueManager > 0 ) {
            tasks.push( {
                type: "overdue-manager",
                count: overdueManager
            } );
        }

        return tasks;
    }

}

const instance = new TaskResolver();
module.exports.instance = Object.freeze( instance );
