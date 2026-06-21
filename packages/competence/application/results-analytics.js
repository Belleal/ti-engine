/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );

// Grade-letter → numeric weight (mirrors competence-framework.js:17-22). Empty "" → null (ungraded, excluded from means).
const GRADE_WEIGHTS = Object.freeze( { S: 1.3, R: 1.0, U: 0.6, N: 0.0 } );

// Synthetic roster-minus-evaluations label — NOT the NOT_STARTED enum value.
const NOT_STARTED_LABEL = "Not started";

/**
 * Cross-evaluation cohort analytics. Pure compute + (later) snapshot projection. Mirrors the frozen-singleton
 * pattern of the other application modules (cf. data-manager.js:1062-1063). The aggregation primitives are pure:
 * they take injected data (evaluations / roster / cycle) so they unit-test with hand-built fixtures (no Redis),
 * following the task-resolver.js precedent.
 *
 * @class ResultsAnalytics
 * @singleton
 * @public
 */
class ResultsAnalytics {

    static #instance = null;

    /**
     * @constructor
     * @returns {ResultsAnalytics}
     */
    constructor() {
        if ( !ResultsAnalytics.#instance ) {
            ResultsAnalytics.#instance = this;
        }
        return ResultsAnalytics.#instance;
    }

    /**
     * Builds the normalized, privacy-reduced CohortRow[] frame for a cycle from already-fetched evaluations.
     * Pure: org-unit resolution is injected via `filter.resolveOrgUnit` so the function unit-tests without the
     * organization graph. DELETED rows are assumed already excluded by the caller (fetchEvaluations strips them);
     * the raw-read recompute branch re-applies the exclusion explicitly (see _resolveWith, Task B5).
     *
     * @method
     * @param {Array<Object>} evaluations - Already-fetched evaluations (DELETED already excluded).
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter; `filter.resolveOrgUnit(employeeID)` injected by the caller.
     * @returns {Array<Object>} CohortRow[]
     * @public
     */
    buildCohortFrame( evaluations, cycleID, filter ) {
        if ( !Array.isArray( evaluations ) || !cycleID ) {
            return [];
        }
        const resolveOrgUnit = ( filter && typeof filter.resolveOrgUnit === "function" ) ? filter.resolveOrgUnit : () => "";
        const rows = [];

        for ( const evaluation of evaluations ) {
            if ( !evaluation || evaluation.cycleID !== cycleID ) {
                continue;
            }

            const stageLevel = evaluation.stageLevel || "";
            const snapshotByCode = new Map();
            const snapshot = Array.isArray( evaluation.snapshot ) ? evaluation.snapshot : [];
            for ( const entry of snapshot ) {
                if ( entry && entry.code ) {
                    snapshotByCode.set( entry.code, entry );
                }
            }

            const competencies = {};
            const grades = ( evaluation.grades && typeof evaluation.grades === "object" ) ? evaluation.grades : {};
            for ( const [ code, gradeEntry ] of Object.entries( grades ) ) {
                if ( !gradeEntry ) {
                    continue;
                }
                const snapEntry = snapshotByCode.get( code );
                const relevancy = ( snapEntry && snapEntry.relevancy && typeof snapEntry.relevancy[ stageLevel ] === "number" ) ? snapEntry.relevancy[ stageLevel ] : 0;
                const self = this.#letterOrEmpty( gradeEntry.employee );      // grades[code].employee → self
                const manager = this.#letterOrEmpty( gradeEntry.manager );
                const team = this.#teamCumulative( gradeEntry.team );          // cumulative ONLY
                competencies[ code ] = {
                    self: self,
                    manager: manager,
                    team: team,
                    selfWeight: this.#gradeWeight( self ),
                    managerWeight: this.#gradeWeight( manager ),
                    teamWeight: this.#gradeWeight( team ),
                    subcategory: snapEntry ? snapEntry.subcategory : null,
                    category: snapEntry ? snapEntry.category : null,
                    relevancy: relevancy
                };
            }

            const finalScore = ( evaluation.finalScore && typeof evaluation.finalScore.score === "number" ) ? evaluation.finalScore : null;

            rows.push( {
                evaluationID: evaluation.evaluationID,
                employeeID: evaluation.employeeID,
                managerID: evaluation.managerID || "",
                status: evaluation.status,                                  // enum VALUE string
                roleFamily: evaluation.roleFamily || "",
                specialization: ( evaluation.specialization !== undefined ) ? evaluation.specialization : null,
                stageLevel: stageLevel,
                level: stageLevel ? stageLevel.charAt( 0 ) : "",            // stage-family letter (N/J/R/S/X/T)
                organizationUnitID: resolveOrgUnit( evaluation.employeeID ) || "",
                interviewDate: ( evaluation.interviewDate !== undefined ) ? evaluation.interviewDate : null,
                isScored: finalScore !== null,
                finalScore: finalScore,
                finalInterpretation: finalScore ? ( finalScore.interpretation || null ) : null,
                competencies: competencies
            } );
        }

        return rows;
    }

    /**
     * Returns the grade letter unchanged, or "" for a missing/empty value.
     * @method
     * @param {string} [letter]
     * @returns {string}
     * @private
     */
    #letterOrEmpty( letter ) {
        return ( typeof letter === "string" && letter !== "" ) ? letter : "";
    }

    /**
     * Extracts ONLY the team cumulative letter; never copies individual[] (structural peer anonymity).
     * @method
     * @param {Object|string} [team]
     * @returns {string}
     * @private
     */
    #teamCumulative( team ) {
        if ( typeof team === "string" ) {
            return this.#letterOrEmpty( team );
        }
        if ( team && typeof team === "object" ) {
            return this.#letterOrEmpty( team.cumulative );
        }
        return "";
    }

    /**
     * Maps a grade letter to its numeric weight; "" → null (ungraded, excluded from means — never 0).
     * @method
     * @param {string} letter
     * @returns {number|null}
     * @private
     */
    #gradeWeight( letter ) {
        if ( letter === "" || letter === undefined || letter === null ) {
            return null;
        }
        return Object.prototype.hasOwnProperty.call( GRADE_WEIGHTS, letter ) ? GRADE_WEIGHTS[ letter ] : null;
    }

}

const instance = new ResultsAnalytics();
module.exports.instance = Object.freeze( instance );
