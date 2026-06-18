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
 * @property {function(string): boolean} canManage - Predicate: can the user act as the manager for the given
 *           employeeID (org hierarchy). Injected by the caller so the resolver performs no organization I/O.
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
     * Resolves the in-scope task descriptors (`team-feedback`, `team-finalize`) for the given user.
     *
     * @method
     * @param {string} userID
     * @param {TaskResolverContext} ctx
     * @param {Array<Evaluation>} evaluations - Already-fetched evaluations to derive tasks from.
     * @returns {Array<TeamFeedbackTask|TeamFinalizeTask>}
     * @public
     */
    resolveTasks( userID, ctx, evaluations ) {
        if ( !userID || !ctx || !Array.isArray( evaluations ) ) {
            return [];
        }

        const today = ctx.today || "";
        const resolveName = ( typeof ctx.resolveName === "function" ) ? ctx.resolveName : ( id ) => id;
        const canManage = ( typeof ctx.canManage === "function" ) ? ctx.canManage : () => false;
        const isSupervisor = ( ctx.isSupervisor === true );

        const tasks = [];

        for ( const evaluation of evaluations ) {
            if ( !evaluation || evaluation.status !== configurationLoader.evaluationStatus.OPEN ) {
                continue;
            }

            const workflow = evaluation.workflow || {};
            const team = Array.isArray( workflow.team ) ? workflow.team : [];
            const deadline = workflow.teamEvaluationDeadline || "";
            // A non-empty deadline strictly before today is "past". A missing/empty deadline is treated as NOT past so
            // legacy evaluations (created before deadlines were populated) never spuriously become overdue/finalizable.
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
        }

        return tasks;
    }

}

const instance = new TaskResolver();
module.exports.instance = Object.freeze( instance );
