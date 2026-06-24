/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const exceptions = require( "@ti-engine/core/exceptions" );
const organizationManager = require( "#organization-manager" );
const packageVersion = require( "../package.json" ).version;

// Grade-letter → numeric weight (mirrors competence-framework.js:17-22). Empty "" → null (ungraded, excluded from means).
const GRADE_WEIGHTS = Object.freeze( { S: 1.3, R: 1.0, U: 0.6, N: 0.0 } );

// Per-source blend weights (mirrors competence-framework.js:24-28 evaluationWeights defaults). Used by the "blended"
// source view so a heatmap cell reconciles with the final score.
const EVALUATION_WEIGHTS = Object.freeze( { self: 0.2, team: 0.3, manager: 0.5 } );

// The nine subcategory codes (mirrors competence-framework.js:38) — the stable heatmap/driver row axis.
const SUBCATEGORIES = Object.freeze( [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ] );

// Synthetic roster-minus-evaluations label — NOT the NOT_STARTED enum value.
const NOT_STARTED_LABEL = "Not started";

// The 12 flattened stage-level rungs (the archetype curve keys), in ladder order. Mirrors config.stage-levels.json /
// the archetype weight keys; kept as a constant so R5 always renders all 12 boxes (even empty levels) for the drift
// narrative. The resolve wiring may override via filter.stageLevels, but this is the canonical order.
const STAGE_LEVELS = Object.freeze( [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ] );

// Small-cell suppression floor (resolved decision §7.5) — a level/cell with fewer reported rows is suppressed.
const MIN_COHORT_SIZE = 3;

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
                    relevancy: relevancy,
                    // Full frozen archetype weight curve {N1..T1} from the evaluation's own snapshot (framework.js:163).
                    // Used by R5/R4 to derive the maturity-step expected grade (peak/intro/mature); honors snapshot
                    // isolation — a closed cycle's expected reflects the weights AT snapshot time, not the live config.
                    relevancyCurve: ( snapEntry && snapEntry.relevancy && typeof snapEntry.relevancy === "object" ) ? snapEntry.relevancy : null
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

    /**
     * Computes the Coverage report payload from a frame + the in-scope roster. "Completed" = Ready + Closed
     * (resolved decision §7.1); "Not started" = roster employees with no evaluation row (synthetic label, not the
     * NOT_STARTED enum). Groups by roleFamily or orgUnit per filter.groupBy.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[] (only status/employeeID/roleFamily/organizationUnitID/evaluationID read).
     * @param {Array<Object>} roster - [{employeeID, name, roleFamily, organizationUnitID}].
     * @param {Object} filter - CohortFilter; filter.groupBy ∈ {"roleFamily","orgUnit"}.
     * @returns {Object} coverage payload
     * @public
     */
    computeCoverage( frame, roster, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const members = Array.isArray( roster ) ? roster : [];
        const groupBy = ( filter && filter.groupBy === "orgUnit" ) ? "orgUnit" : "roleFamily";

        const rowByEmployee = new Map();
        for ( const row of rows ) {
            if ( row && row.employeeID ) {
                rowByEmployee.set( row.employeeID, row );
            }
        }

        const overall = this.#emptyCoverageBucket();
        const groups = new Map();   // groupKey → { groupType, groupKey, groupLabel, bucket }
        const pending = [];

        for ( const member of members ) {
            const row = rowByEmployee.get( member.employeeID ) || null;
            const groupKey = ( groupBy === "orgUnit" ) ? ( member.organizationUnitID || "" ) : ( member.roleFamily || "" );
            if ( !groups.has( groupKey ) ) {
                groups.set( groupKey, { groupType: groupBy, groupKey: groupKey, groupLabel: groupKey, bucket: this.#emptyCoverageBucket() } );
            }
            const group = groups.get( groupKey );

            this.#tallyCoverage( overall, row );
            this.#tallyCoverage( group.bucket, row );

            const status = row ? row.status : NOT_STARTED_LABEL;
            if ( status !== configurationLoader.evaluationStatus.READY && status !== configurationLoader.evaluationStatus.CLOSED ) {
                pending.push( {
                    evaluationID: row ? row.evaluationID : null,
                    employeeID: member.employeeID,
                    name: ( member.name !== undefined ) ? member.name : null,
                    groupLabel: groupKey,
                    status: status   // one of Open / In Review / "Not started"
                } );
            }
        }

        return {
            overall: this.#finalizeCoverageBucket( overall ),
            byGroup: Array.from( groups.values() ).map( ( g ) => Object.assign(
                { groupType: g.groupType, groupKey: g.groupKey, groupLabel: g.groupLabel },
                this.#finalizeCoverageBucket( g.bucket )
            ) ),
            pending: pending
        };
    }

    /**
     * @method
     * @returns {Object} A fresh coverage accumulator.
     * @private
     */
    #emptyCoverageBucket() {
        return { N: 0, n: 0, notStarted: 0, byStatus: { "Open": 0, "In Review": 0, "Ready": 0, "Closed": 0 } };
    }

    /**
     * Tallies one roster member (with its evaluation row or null) into a coverage accumulator.
     * @method
     * @param {Object} bucket
     * @param {Object|null} row
     * @private
     */
    #tallyCoverage( bucket, row ) {
        bucket.N += 1;
        if ( !row ) {
            bucket.notStarted += 1;
            return;
        }
        if ( Object.prototype.hasOwnProperty.call( bucket.byStatus, row.status ) ) {
            bucket.byStatus[ row.status ] += 1;
        }
        if ( row.status === configurationLoader.evaluationStatus.READY || row.status === configurationLoader.evaluationStatus.CLOSED ) {
            bucket.n += 1;
        }
    }

    /**
     * Finalizes an accumulator: appends the rounded completion pct.
     * @method
     * @param {Object} bucket
     * @returns {Object}
     * @private
     */
    #finalizeCoverageBucket( bucket ) {
        const pct = ( bucket.N > 0 ) ? Math.round( ( bucket.n / bucket.N ) * 100 ) : 0;
        return { N: bucket.N, n: bucket.n, pct: pct, byStatus: bucket.byStatus, notStarted: bucket.notStarted };
    }

    /**
     * R5 — Level correlation box-plots + the rising maturity-step EXPECTED curve (CA-67, owner-approved Candidate 1).
     * Buckets the reported subset (`isScored && status ∈ {Ready,Closed}`) by stageLevel across the 12 rungs (kept even
     * when empty, for the drift x-axis). Per level: a nearest-rank five-number summary + mean of `finalScore.score`,
     * and an `expected` reference — the mean over the level's reported evaluations of each evaluation's all-expected
     * score (the maturity-step expected grade substituted for every source, through the exact scoring path). Levels
     * with `n < minCohortSize` are emitted `suppressed` (no box). The expected curve rises overall but is NOT
     * guaranteed monotone (declining archetype tails) — surfaced in the a11y label / info block.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; rows carry finalScore.score, stageLevel, status, isScored, and
     *   competencies[code].{category, relevancy, relevancyCurve}.
     * @param {Object} [filter] - optional { stageLevels:[...], minCohortSize:number, t3:number }.
     * @returns {Object} { groups:[{id,label,n,min?,q1?,median?,q3?,max?,mean?,expected?,suppressed?}], reference:[{v,label}] }
     * @public
     */
    computeLevelDistribution( frame, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const levels = ( filter && Array.isArray( filter.stageLevels ) && filter.stageLevels.length ) ? filter.stageLevels : STAGE_LEVELS;
        const minCohort = ( filter && typeof filter.minCohortSize === "number" ) ? filter.minCohortSize : MIN_COHORT_SIZE;
        const t3 = ( filter && typeof filter.t3 === "number" ) ? filter.t3 : 105;

        const byLevel = new Map();
        for ( const level of levels ) { byLevel.set( level, [] ); }
        for ( const row of rows ) {
            if ( !row || !row.isScored || !row.finalScore || typeof row.finalScore.score !== "number" ) { continue; }
            if ( row.status !== configurationLoader.evaluationStatus.READY && row.status !== configurationLoader.evaluationStatus.CLOSED ) { continue; }
            if ( byLevel.has( row.stageLevel ) ) { byLevel.get( row.stageLevel ).push( row ); }
        }

        const groups = levels.map( ( level ) => {
            const levelRows = byLevel.get( level );
            const n = levelRows.length;
            if ( n < minCohort ) {
                return { id: level, label: level, n: n, suppressed: true };
            }
            const scores = levelRows.map( ( r ) => r.finalScore.score ).sort( ( a, b ) => a - b );
            let sum = 0;
            for ( const s of scores ) { sum += s; }
            return {
                id: level, label: level, n: n,
                min: scores[ 0 ],
                q1: nearestRankPercentile( scores, 0.25 ),
                median: nearestRankPercentile( scores, 0.5 ),
                q3: nearestRankPercentile( scores, 0.75 ),
                max: scores[ scores.length - 1 ],
                mean: Math.round( sum / n ),
                expected: this.#expectedScoreForLevel( levelRows, level )
            };
        } );

        return { groups: groups, reference: [ { v: t3, label: "T3" } ] };
    }

    /**
     * Mean (rounded) of the per-evaluation expected scores for a level's reported rows — the "typical target performer"
     * reference. Returns null when no evaluation yields a score.
     * @method
     * @param {Array<Object>} levelRows
     * @param {string} stageLevel
     * @returns {number|null}
     * @private
     */
    #expectedScoreForLevel( levelRows, stageLevel ) {
        const perEval = [];
        for ( const row of levelRows ) {
            const score = this.#expectedScoreForEvaluation( row, stageLevel );
            if ( score !== null ) { perEval.push( score ); }
        }
        if ( perEval.length === 0 ) { return null; }
        let sum = 0;
        for ( const s of perEval ) { sum += s; }
        return Math.round( sum / perEval.length );
    }

    /**
     * The final score one evaluation WOULD earn if every source graded each competency at its maturity-step expected
     * grade (expectedGradeForArchetype over the competency's frozen snapshot weight curve at `stageLevel`). Reuses the
     * exact scoring path (competence-framework.js:467-504): per category `share = Σ(expectedGradeWeight·relevancy)/Σrelevancy`
     * (all three sources identical, so the 0.2/0.3/0.5 blend collapses to `share`), `categoryScore = ceil(share·100)`,
     * final = `ceil(mean of category scores)`. Competencies with no curve or zero relevancy are skipped (mirrors scoring).
     * @method
     * @param {Object} row
     * @param {string} stageLevel
     * @returns {number|null}
     * @private
     */
    #expectedScoreForEvaluation( row, stageLevel ) {
        const comps = ( row && row.competencies && typeof row.competencies === "object" ) ? row.competencies : {};
        const weighted = {};
        const relSum = {};
        for ( const code of Object.keys( comps ) ) {
            const competency = comps[ code ];
            if ( !competency || typeof competency.relevancy !== "number" || competency.relevancy <= 0 || !competency.category || !competency.relevancyCurve ) {
                continue;
            }
            const expectedGrade = expectedGradeForArchetype( competency.relevancyCurve, stageLevel );
            const gradeWeight = Object.prototype.hasOwnProperty.call( GRADE_WEIGHTS, expectedGrade ) ? GRADE_WEIGHTS[ expectedGrade ] : 0;
            weighted[ competency.category ] = ( weighted[ competency.category ] || 0 ) + ( gradeWeight * competency.relevancy );
            relSum[ competency.category ] = ( relSum[ competency.category ] || 0 ) + competency.relevancy;
        }
        const categoryScores = [];
        for ( const category of Object.keys( relSum ) ) {
            if ( relSum[ category ] > 0 ) {
                categoryScores.push( Math.ceil( ( weighted[ category ] / relSum[ category ] ) * 100 ) );
            }
        }
        if ( categoryScores.length === 0 ) { return null; }
        let sum = 0;
        for ( const s of categoryScores ) { sum += s; }
        return Math.ceil( sum / categoryScores.length );
    }

    /**
     * R4 — Competence heatmap (CA-67). Per (subcategory × group) cell over the reported subset: `v` = relevancy-weighted
     * mean of the selected source's grade weight (relevancy-weighted to reconcile with scoring — ungraded count their
     * relevancy in the denominator with a 0 numerator, exactly as `calculateFinalEvaluationScores` does); `expected` =
     * relevancy-weighted mean of the maturity-step expected grade over the same competencies at each row's level (the
     * SAME definition as R5); `delta = v − expected`. Cells with `n < minCohortSize` reported rows are suppressed; cells
     * with no data are omitted (the renderer leaves a gap). Rows are the 9 fixed subcategories; columns are the distinct
     * group keys (role-family or org-unit) present in the cohort.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; competencies carry {subcategory, relevancy, relevancyCurve, *Weight}.
     * @param {Object} [filter] - { source:"self"|"manager"|"team"|"blended", groupBy:"roleFamily"|"orgUnit", minCohortSize }.
     * @returns {Object} { rows:[{id,label}], cols:[{id,label}], cells:[{r,c,v,n,expected,delta}|{r,c,n,suppressed:true}] }
     * @public
     */
    computeCompetenceHeatmap( frame, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const source = ( filter && [ "self", "manager", "team", "blended" ].indexOf( filter.source ) >= 0 ) ? filter.source : "blended";
        const groupBy = ( filter && filter.groupBy === "orgUnit" ) ? "orgUnit" : "roleFamily";
        const minCohort = ( filter && typeof filter.minCohortSize === "number" ) ? filter.minCohortSize : MIN_COHORT_SIZE;

        const reported = rows.filter( ( r ) => r && r.isScored && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );
        const keyOf = ( r ) => ( ( groupBy === "orgUnit" ) ? ( r.organizationUnitID || "" ) : ( r.roleFamily || "" ) );

        const colKeys = [];
        const colIndex = new Map();
        for ( const r of reported ) {
            const key = keyOf( r );
            if ( !colIndex.has( key ) ) { colIndex.set( key, true ); colKeys.push( key ); }
        }
        colKeys.sort();
        colKeys.forEach( ( key, i ) => colIndex.set( key, i ) );

        const acc = new Map();   // "subIdx|colIdx" → { vNum, expNum, relSum, rowSet }
        for ( const r of reported ) {
            const c = colIndex.get( keyOf( r ) );
            const comps = ( r.competencies && typeof r.competencies === "object" ) ? r.competencies : {};
            for ( const code of Object.keys( comps ) ) {
                const comp = comps[ code ];
                if ( !comp || typeof comp.relevancy !== "number" || comp.relevancy <= 0 || !comp.subcategory ) { continue; }
                const sIdx = SUBCATEGORIES.indexOf( comp.subcategory );
                if ( sIdx < 0 ) { continue; }
                const mapKey = sIdx + "|" + c;
                if ( !acc.has( mapKey ) ) { acc.set( mapKey, { vNum: 0, expNum: 0, relSum: 0, rowSet: new Set() } ); }
                const cell = acc.get( mapKey );
                const expectedGrade = comp.relevancyCurve ? expectedGradeForArchetype( comp.relevancyCurve, r.stageLevel ) : "R";
                cell.vNum += this.#sourceWeight( comp, source ) * comp.relevancy;
                cell.expNum += ( GRADE_WEIGHTS[ expectedGrade ] || 0 ) * comp.relevancy;
                cell.relSum += comp.relevancy;
                cell.rowSet.add( r.evaluationID );
            }
        }

        const cells = [];
        for ( let s = 0; s < SUBCATEGORIES.length; s++ ) {
            for ( let c = 0; c < colKeys.length; c++ ) {
                const cell = acc.get( s + "|" + c );
                if ( !cell || cell.relSum <= 0 ) { continue; }
                const n = cell.rowSet.size;
                if ( n < minCohort ) {
                    cells.push( { r: s, c: c, n: n, suppressed: true } );
                    continue;
                }
                const v = cell.vNum / cell.relSum;
                const expected = cell.expNum / cell.relSum;
                cells.push( { r: s, c: c, n: n, v: this.#round3( v ), expected: this.#round3( expected ), delta: this.#round3( v - expected ) } );
            }
        }

        return {
            rows: SUBCATEGORIES.map( ( code ) => ( { id: code, label: code } ) ),
            cols: colKeys.map( ( key ) => ( { id: key, label: key } ) ),
            cells: cells
        };
    }

    /**
     * The grade weight of one competency for a source view; missing/ungraded → 0 (so it dilutes the relevancy-weighted
     * mean exactly as scoring does). "blended" applies the per-source evaluation weights.
     * @method
     * @param {Object} comp
     * @param {"self"|"manager"|"team"|"blended"} source
     * @returns {number}
     * @private
     */
    #sourceWeight( comp, source ) {
        const sw = ( typeof comp.selfWeight === "number" ) ? comp.selfWeight : 0;
        const mw = ( typeof comp.managerWeight === "number" ) ? comp.managerWeight : 0;
        const tw = ( typeof comp.teamWeight === "number" ) ? comp.teamWeight : 0;
        if ( source === "self" ) { return sw; }
        if ( source === "manager" ) { return mw; }
        if ( source === "team" ) { return tw; }
        return ( sw * EVALUATION_WEIGHTS.self ) + ( tw * EVALUATION_WEIGHTS.team ) + ( mw * EVALUATION_WEIGHTS.manager );
    }

    /**
     * Org-wide per-subcategory aggregate for the cross-cycle snapshot substrate (§4 bySubcategory): blended relevancy-
     * weighted mean grade, the maturity-step expected mean, their gap, and the contributing-evaluation count.
     * @method
     * @param {Array<Object>} frame
     * @returns {Object<string,{meanGrade:number,n:number,expectedMeanGrade:number,gap:number}>}
     * @private
     */
    #computeBySubcategory( frame ) {
        const reported = ( Array.isArray( frame ) ? frame : [] ).filter( ( r ) => r && r.isScored && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );
        const acc = {};
        for ( const code of SUBCATEGORIES ) { acc[ code ] = { vNum: 0, expNum: 0, relSum: 0, rowSet: new Set() }; }
        for ( const r of reported ) {
            const comps = ( r.competencies && typeof r.competencies === "object" ) ? r.competencies : {};
            for ( const code of Object.keys( comps ) ) {
                const comp = comps[ code ];
                if ( !comp || typeof comp.relevancy !== "number" || comp.relevancy <= 0 || !acc[ comp.subcategory ] ) { continue; }
                const cell = acc[ comp.subcategory ];
                const expectedGrade = comp.relevancyCurve ? expectedGradeForArchetype( comp.relevancyCurve, r.stageLevel ) : "R";
                cell.vNum += this.#sourceWeight( comp, "blended" ) * comp.relevancy;
                cell.expNum += ( GRADE_WEIGHTS[ expectedGrade ] || 0 ) * comp.relevancy;
                cell.relSum += comp.relevancy;
                cell.rowSet.add( r.evaluationID );
            }
        }
        const out = {};
        for ( const code of SUBCATEGORIES ) {
            const cell = acc[ code ];
            if ( cell.relSum > 0 ) {
                const mean = cell.vNum / cell.relSum;
                const expectedMean = cell.expNum / cell.relSum;
                out[ code ] = { meanGrade: this.#round3( mean ), n: cell.rowSet.size, expectedMeanGrade: this.#round3( expectedMean ), gap: this.#round3( mean - expectedMean ) };
            } else {
                out[ code ] = { meanGrade: null, n: 0, expectedMeanGrade: null, gap: null };
            }
        }
        return out;
    }

    /**
     * Rounds to 3 decimals (grade-weight space is 0..1.3; preserves small gap precision).
     * @method
     * @param {number} n
     * @returns {number}
     * @private
     */
    #round3( n ) {
        return Math.round( n * 1000 ) / 1000;
    }

    /**
     * Extracts the YYYY-MM month key from an ISO date string, or null if the input is not the expected YYYY-MM-DD
     * shape — so a malformed date is skipped rather than silently bucketed under a corrupt key (e.g. "2026/").
     * @method
     * @param {string} date
     * @returns {string|null}
     * @private
     */
    #monthKey( date ) {
        const s = String( date );
        return /^\d{4}-\d{2}-\d{2}/.test( s ) ? s.slice( 0, 7 ) : null;
    }

    /**
     * R6 — Predictive drivers (CA-67). Over the reported subset (needs ≥ minSampleSize, default 5, else
     * `insufficientData`), Pearson-correlates each subcategory's per-row blended score-share with `finalScore.score`
     * (`r`); derives `empiricalShare = |r| / Σ|r|`, the `configuredShare` = that subcategory's slice of the cohort's
     * total relevancy mass, their `divergence`, and a `misweightFlag` when the two share-ranks differ by ≥ rankDelta
     * (default 2). Rows are sorted by `r` desc (null-`r` subcategories — constant/too-few — sort last). No precomputed
     * correlation or category weights exist in config (verified); all derived from the frame at request time.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; competencies carry {subcategory, relevancy, *Weight}; rows carry finalScore.score.
     * @param {Object} [filter] - { minSampleSize, misweightRankDelta }.
     * @returns {Object} { rows:[{id,label,r,empiricalShare,configuredShare,divergence,misweightFlag}], insufficientData:boolean }
     * @public
     */
    computePredictiveDrivers( frame, filter ) {
        const minSample = ( filter && typeof filter.minSampleSize === "number" ) ? filter.minSampleSize : 5;
        const rankDelta = ( filter && typeof filter.misweightRankDelta === "number" ) ? filter.misweightRankDelta : 2;
        const reported = ( Array.isArray( frame ) ? frame : [] ).filter( ( r ) => r && r.isScored && r.finalScore && typeof r.finalScore.score === "number" && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );

        if ( reported.length < minSample ) {
            return { rows: [], insufficientData: true };
        }

        const relInSubcat = {};
        const pairs = {};
        for ( const code of SUBCATEGORIES ) { relInSubcat[ code ] = 0; pairs[ code ] = { x: [], y: [] }; }
        let relTotal = 0;

        for ( const row of reported ) {
            const comps = ( row.competencies && typeof row.competencies === "object" ) ? row.competencies : {};
            const perSubcat = {};   // subcat → { wNum, relSum }
            for ( const code of Object.keys( comps ) ) {
                const comp = comps[ code ];
                if ( !comp || typeof comp.relevancy !== "number" || comp.relevancy <= 0 || SUBCATEGORIES.indexOf( comp.subcategory ) < 0 ) { continue; }
                if ( !perSubcat[ comp.subcategory ] ) { perSubcat[ comp.subcategory ] = { wNum: 0, relSum: 0 }; }
                perSubcat[ comp.subcategory ].wNum += this.#sourceWeight( comp, "blended" ) * comp.relevancy;
                perSubcat[ comp.subcategory ].relSum += comp.relevancy;
                relInSubcat[ comp.subcategory ] += comp.relevancy;
                relTotal += comp.relevancy;
            }
            for ( const subcat of Object.keys( perSubcat ) ) {
                if ( perSubcat[ subcat ].relSum > 0 ) {
                    pairs[ subcat ].x.push( perSubcat[ subcat ].wNum / perSubcat[ subcat ].relSum );
                    pairs[ subcat ].y.push( row.finalScore.score );
                }
            }
        }

        const rBy = {};
        let absSum = 0;
        for ( const code of SUBCATEGORIES ) {
            const r = pearson( pairs[ code ].x, pairs[ code ].y );
            rBy[ code ] = r;
            if ( r !== null ) { absSum += Math.abs( r ); }
        }

        const empiricalShare = {};
        const configuredShare = {};
        for ( const code of SUBCATEGORIES ) {
            empiricalShare[ code ] = ( rBy[ code ] !== null && absSum > 0 ) ? ( Math.abs( rBy[ code ] ) / absSum ) : 0;
            configuredShare[ code ] = ( relTotal > 0 ) ? ( relInSubcat[ code ] / relTotal ) : 0;
        }

        const empRank = this.#rankDesc( SUBCATEGORIES, empiricalShare );
        const confRank = this.#rankDesc( SUBCATEGORIES, configuredShare );

        const out = SUBCATEGORIES.map( ( code ) => ( {
            id: code, label: code,
            r: ( rBy[ code ] !== null ) ? this.#round3( rBy[ code ] ) : null,
            empiricalShare: this.#round3( empiricalShare[ code ] ),
            configuredShare: this.#round3( configuredShare[ code ] ),
            divergence: this.#round3( empiricalShare[ code ] - configuredShare[ code ] ),
            misweightFlag: Math.abs( empRank[ code ] - confRank[ code ] ) >= rankDelta
        } ) );

        out.sort( ( a, b ) => {
            if ( a.r === null && b.r === null ) { return 0; }
            if ( a.r === null ) { return 1; }
            if ( b.r === null ) { return -1; }
            return b.r - a.r;
        } );

        return { rows: out, insufficientData: false };
    }

    /**
     * Returns a 1-based descending rank per key by `valueByKey[key]` (highest value → rank 1). Stable on ties (key
     * order preserved — Node's Array.sort is stable).
     * @method
     * @param {Array<string>} keys
     * @param {Object<string,number>} valueByKey
     * @returns {Object<string,number>}
     * @private
     */
    #rankDesc( keys, valueByKey ) {
        const sorted = keys.slice().sort( ( a, b ) => valueByKey[ b ] - valueByKey[ a ] );
        const rank = {};
        sorted.forEach( ( key, i ) => { rank[ key ] = i + 1; } );
        return rank;
    }

    /**
     * R2 — Interview time distribution (CA-67). Monthly **planned** (booked calendar slots, by slot date) vs **held**
     * (the labeled proxy: evaluations at Ready/Closed whose scheduled `interviewDate` is on or before `today`, by
     * interview month) — "held" is a proxy for the interview having taken place, never a true attendance signal. Plus
     * **unscheduledReady** (Ready evaluations with no `interviewDate` — the actionable bucket) and a per-manager
     * breakdown (held/unscheduledReady from `evaluation.managerID`; planned from `slot.managerID`).
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; rows carry status, interviewDate, managerID.
     * @param {Array<Object>} slots - Calendar slots (fetchAllCalendarSlots); booked ones carry {date, status, managerID}.
     * @param {string} today - YYYY-MM-DD; the held proxy requires interviewDate <= today.
     * @returns {Object} { rows:[{monthKey,planned,held}], unscheduledReady:number, perManager:[{managerID,planned,held,unscheduledReady}] }
     * @public
     */
    computeTimeDistribution( frame, slots, today ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const slotList = Array.isArray( slots ) ? slots : [];
        // No valid `today` ⇒ "held" (defined relative to today) is undeterminable, so skip it rather than defaulting
        // to a far-future date (which would mis-count every future interview as held). Planned/unscheduled don't depend
        // on today and still compute.
        const todayStr = ( typeof today === "string" && today ) ? today : null;

        const months = new Map();
        const ensureMonth = ( key ) => { if ( !months.has( key ) ) { months.set( key, { planned: 0, held: 0 } ); } return months.get( key ); };
        const perManager = new Map();
        const ensureManager = ( id ) => { if ( !perManager.has( id ) ) { perManager.set( id, { planned: 0, held: 0, unscheduledReady: 0 } ); } return perManager.get( id ); };
        let unscheduledReady = 0;

        for ( const row of rows ) {
            if ( !row ) { continue; }
            const ready = row.status === configurationLoader.evaluationStatus.READY;
            const readyOrClosed = ready || row.status === configurationLoader.evaluationStatus.CLOSED;
            if ( todayStr && readyOrClosed && row.interviewDate && row.interviewDate <= todayStr ) {
                const monthKey = this.#monthKey( row.interviewDate );
                if ( monthKey ) {
                    ensureMonth( monthKey ).held += 1;
                    if ( row.managerID ) { ensureManager( row.managerID ).held += 1; }   // unattributed evals stay out of the per-manager breakdown
                }
            }
            if ( ready && !row.interviewDate ) {
                unscheduledReady += 1;
                if ( row.managerID ) { ensureManager( row.managerID ).unscheduledReady += 1; }
            }
        }

        for ( const slot of slotList ) {
            if ( slot && slot.status === configurationLoader.slotStatus.BOOKED && slot.date ) {
                const monthKey = this.#monthKey( slot.date );
                if ( monthKey ) {
                    ensureMonth( monthKey ).planned += 1;
                    if ( slot.managerID ) { ensureManager( slot.managerID ).planned += 1; }
                }
            }
        }

        const monthRows = Array.from( months.keys() ).sort().map( ( key ) => ( { monthKey: key, planned: months.get( key ).planned, held: months.get( key ).held } ) );
        const managerRows = Array.from( perManager.keys() ).sort().map( ( id ) => Object.assign( { managerID: id }, perManager.get( id ) ) );

        return { rows: monthRows, unscheduledReady: unscheduledReady, perManager: managerRows };
    }

    /**
     * R3 — Alignment gap quadrant (CA-67). One point per reported evaluation that has at least one self AND one manager
     * grade: `x` = relevancy-weighted mean MANAGER grade, `y` = mean SELF grade, `z` = mean TEAM grade (sources kept
     * SEPARATE — unlike scoring, which blends them — and each is a TRUE mean over only the competencies that source
     * graded, so a partially-graded source is not dragged toward zero). The quadrant splits each axis at `midpoint`
     * (default the R=1.0 grade weight, configurable via alignmentQuadrantMidpoint): `y-x` side strings (self-high/
     * manager-low = hidden talent, self-low/manager-high = blind spot, etc.). `gap = y − x` (signed self−manager).
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; competencies carry per-source weights + relevancy + category.
     * @param {Object} [filter] - { midpoint:number, category:"E"|"I"|"C" }.
     * @returns {Object} { points:[{evaluationID,employeeRef,roleFamily,organizationUnitID,x,y,z,quadrant,gap}], quadrantCounts, diagonal:true, midpoint }
     * @public
     */
    computeAlignment( frame, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const midpoint = ( filter && typeof filter.midpoint === "number" ) ? filter.midpoint : GRADE_WEIGHTS.R;
        const category = ( filter && [ "E", "I", "C" ].indexOf( filter.category ) >= 0 ) ? filter.category : null;
        const reported = rows.filter( ( r ) => r && r.isScored && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );

        const points = [];
        const quadrantCounts = { "high-high": 0, "high-low": 0, "low-high": 0, "low-low": 0 };
        for ( const row of reported ) {
            const y = this.#sourceMean( row.competencies, "self", category );
            const x = this.#sourceMean( row.competencies, "manager", category );
            const z = this.#sourceMean( row.competencies, "team", category );
            if ( x === null || y === null ) { continue; }   // need both axes to place the point
            const quadrant = ( y >= midpoint ? "high" : "low" ) + "-" + ( x >= midpoint ? "high" : "low" );   // self(y)-manager(x)
            quadrantCounts[ quadrant ] += 1;
            points.push( {
                evaluationID: row.evaluationID,
                employeeRef: row.employeeID,
                roleFamily: row.roleFamily,
                organizationUnitID: row.organizationUnitID,
                x: this.#round3( x ), y: this.#round3( y ), z: ( z !== null ) ? this.#round3( z ) : null,
                quadrant: quadrant,
                gap: this.#round3( y - x )
            } );
        }
        return { points: points, quadrantCounts: quadrantCounts, diagonal: true, midpoint: midpoint };
    }

    /**
     * Relevancy-weighted TRUE mean of one source's grade weights over a row's competencies (only those the source
     * actually graded — `null` weights excluded from both numerator and denominator). Optionally restricted to a
     * category. Returns null when the source graded nothing.
     * @method
     * @param {Object} comps - row.competencies
     * @param {"self"|"manager"|"team"} source
     * @param {string|null} category
     * @returns {number|null}
     * @private
     */
    #sourceMean( comps, source, category ) {
        const competencies = ( comps && typeof comps === "object" ) ? comps : {};
        const weightKey = ( source === "self" ) ? "selfWeight" : ( source === "manager" ) ? "managerWeight" : "teamWeight";
        let num = 0, rel = 0;
        for ( const code of Object.keys( competencies ) ) {
            const comp = competencies[ code ];
            if ( !comp || typeof comp.relevancy !== "number" || comp.relevancy <= 0 ) { continue; }
            if ( category && comp.category !== category ) { continue; }
            const weight = comp[ weightKey ];
            if ( typeof weight !== "number" ) { continue; }   // ungraded by this source → excluded (true mean)
            num += weight * comp.relevancy;
            rel += comp.relevancy;
        }
        return ( rel > 0 ) ? ( num / rel ) : null;
    }

    /**
     * R3 drill — per-competency self/manager/team breakdown for ONE evaluation row, sorted by |self − manager| gap
     * descending (largest divergences = blind spots / hidden strengths first). PURE: takes the already-built CohortRow;
     * the web layer fetches the evaluation, builds the row, and re-gates `isSuperiorManagerOfEmployee` before exposing
     * identity (analytics stays role/session-agnostic).
     * @method
     * @param {Object} row - a single CohortRow.
     * @param {string} [category] - optional E/I/C restriction.
     * @returns {Object} { evaluationID, employeeID, competencies:[{code,subcategory,category,self,manager,team,gap}] }
     * @public
     */
    computeAlignmentDrill( row, category ) {
        const comps = ( row && row.competencies && typeof row.competencies === "object" ) ? row.competencies : {};
        const cat = ( [ "E", "I", "C" ].indexOf( category ) >= 0 ) ? category : null;
        const out = [];
        for ( const code of Object.keys( comps ) ) {
            const comp = comps[ code ];
            if ( !comp ) { continue; }
            if ( cat && comp.category !== cat ) { continue; }
            const self = ( typeof comp.selfWeight === "number" ) ? comp.selfWeight : null;
            const manager = ( typeof comp.managerWeight === "number" ) ? comp.managerWeight : null;
            const gap = ( self !== null && manager !== null ) ? this.#round3( self - manager ) : null;
            out.push( { code: code, subcategory: comp.subcategory, category: comp.category, self: comp.self, manager: comp.manager, team: comp.team, gap: gap } );
        }
        out.sort( ( a, b ) => Math.abs( b.gap || 0 ) - Math.abs( a.gap || 0 ) );
        return { evaluationID: row ? row.evaluationID : null, employeeID: row ? row.employeeID : null, competencies: out };
    }

    /**
     * Manager-only — Grader Calibration (CA-68). Over the requesting grader's own evaluations (rows where
     * `managerID === filter.managerID`, within the already-subtree-scoped frame), the signed gaps in WEIGHT space of
     * the manager grade vs self and vs the team cumulative (`+` ⇒ the grader is more lenient than the comparison
     * source). Plain unweighted deltas (design §3 "signed gaps in weight space" — no relevancy weighting). Rolled to
     * overall / category / subcategory / per-competency; a pair is counted only when BOTH sides are graded; `n` is the
     * number of distinct evaluations contributing to a cell, and a cell with `n < minCohortSize` is suppressed (so a
     * 1–2-person cohort cannot de-anonymize the team source). Calibration is NOT snapshotted (it is per-grader); a
     * closed cycle recomputes it from the closed evals.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[]; competencies carry self/manager/teamWeight + category + subcategory.
     * @param {Object} filter - { managerID, minCohortSize? }.
     * @returns {Object} calibration payload (see design §3 contract).
     * @public
     */
    computeCalibration( frame, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const managerID = ( filter && filter.managerID ) || "";
        const minCohort = ( filter && typeof filter.minCohortSize === "number" ) ? filter.minCohortSize : MIN_COHORT_SIZE;
        const cohort = managerID ? rows.filter( ( r ) => r && r.managerID === managerID ) : [];

        const newCell = () => ( { vsSelf: { sum: 0, pairs: 0, evals: new Set() }, vsTeam: { sum: 0, pairs: 0, evals: new Set() } } );
        const addGap = ( side, gap, evaluationID ) => { side.sum += gap; side.pairs += 1; side.evals.add( evaluationID ); };
        const ensure = ( map, key ) => { if ( !map[ key ] ) { map[ key ] = newCell(); } return map[ key ]; };
        const finalizeSide = ( side ) => ( ( side.evals.size < minCohort ) ? { suppressed: true, n: side.evals.size } : { meanGap: this.#round3( side.sum / side.pairs ), n: side.evals.size } );
        const finalizeCell = ( cell ) => ( { vsSelf: finalizeSide( cell.vsSelf ), vsTeam: finalizeSide( cell.vsTeam ) } );

        const overall = newCell();
        const byCategory = {};
        const bySubcategory = {};
        const perCompetency = new Map();
        let selfPairs = 0, teamPairs = 0;

        for ( const row of cohort ) {
            const comps = ( row.competencies && typeof row.competencies === "object" ) ? row.competencies : {};
            for ( const code of Object.keys( comps ) ) {
                const comp = comps[ code ];
                if ( !comp || typeof comp.managerWeight !== "number" ) { continue; }   // manager hasn't graded → no calibration pair
                if ( !perCompetency.has( code ) ) { perCompetency.set( code, { subcategory: comp.subcategory, cell: newCell() } ); }
                const compCell = perCompetency.get( code ).cell;
                if ( typeof comp.selfWeight === "number" ) {
                    const gap = comp.managerWeight - comp.selfWeight;
                    addGap( overall.vsSelf, gap, row.evaluationID );
                    if ( comp.category ) { addGap( ensure( byCategory, comp.category ).vsSelf, gap, row.evaluationID ); }
                    if ( comp.subcategory ) { addGap( ensure( bySubcategory, comp.subcategory ).vsSelf, gap, row.evaluationID ); }
                    addGap( compCell.vsSelf, gap, row.evaluationID );
                    selfPairs += 1;
                }
                if ( typeof comp.teamWeight === "number" ) {
                    const gap = comp.managerWeight - comp.teamWeight;
                    addGap( overall.vsTeam, gap, row.evaluationID );
                    if ( comp.category ) { addGap( ensure( byCategory, comp.category ).vsTeam, gap, row.evaluationID ); }
                    if ( comp.subcategory ) { addGap( ensure( bySubcategory, comp.subcategory ).vsTeam, gap, row.evaluationID ); }
                    addGap( compCell.vsTeam, gap, row.evaluationID );
                    teamPairs += 1;
                }
            }
        }

        const mapCells = ( map ) => { const out = {}; for ( const key of Object.keys( map ) ) { out[ key ] = finalizeCell( map[ key ] ); } return out; };
        const perComp = Array.from( perCompetency.entries() ).map( ( [ code, entry ] ) => Object.assign( { code: code, subcategory: entry.subcategory }, finalizeCell( entry.cell ) ) );
        perComp.sort( ( a, b ) => Math.abs( ( b.vsSelf && typeof b.vsSelf.meanGap === "number" ) ? b.vsSelf.meanGap : 0 ) - Math.abs( ( a.vsSelf && typeof a.vsSelf.meanGap === "number" ) ? a.vsSelf.meanGap : 0 ) );

        return {
            cohortSize: new Set( cohort.map( ( r ) => r.evaluationID ) ).size,
            pairsCompared: { self: selfPairs, team: teamPairs },
            overall: finalizeCell( overall ),
            byCategory: mapCells( byCategory ),
            bySubcategory: mapCells( bySubcategory ),
            perCompetency: perComp
        };
    }

    /**
     * Recursively flattens an org subtree node into a de-duplicated roster. The subtree's `.employees` are direct
     * members only; descendants live under `.children` (organization-manager.js:459-470), so the roster walks
     * `.children` recursively concatenating each node's `.employees`.
     *
     * @method
     * @param {Object|null} subtree - Output of organizationManager.getOrganizationUnitSubtree(rootUnitID).
     * @returns {Array<Object>} [{employeeID, name, roleFamily, organizationUnitID}]
     * @public
     */
    buildRoster( subtree ) {
        const seen = new Set();
        const roster = [];
        const walk = ( node ) => {
            if ( !node || typeof node !== "object" ) {
                return;
            }
            const employees = Array.isArray( node.employees ) ? node.employees : [];
            for ( const employee of employees ) {
                if ( !employee || !employee.employeeID || seen.has( employee.employeeID ) ) {
                    continue;
                }
                seen.add( employee.employeeID );
                roster.push( {
                    employeeID: employee.employeeID,
                    name: ( employee.name !== undefined ) ? employee.name : null,
                    roleFamily: employee.roleFamily || "",
                    organizationUnitID: employee.organizationUnitID || ""
                } );
            }
            const children = Array.isArray( node.children ) ? node.children : [];
            for ( const child of children ) {
                walk( child );
            }
        };
        walk( subtree );
        return roster;
    }

    /**
     * Resolves the cohort scope from an injected authority descriptor. Supervisor → whole org (allowedEmployeeIDs
     * null, rooted at the resolved org root — the web layer computes orgRootUnitID via
     * organizationManager.getOrganizationRootUnitID(), Task B0). Manager → own subtree (rooted at the manager's
     * unit, allow-listed by the pre-computed subtree member IDs). The web layer computes
     * managerUnitID/subtreeEmployeeIDs via organizationManager + isSuperiorManagerOfEmployee (resolved decision
     * §7.7: full multi-level subtree).
     *
     * @method
     * @param {Object} authority - { isSupervisor, employeeID, orgRootUnitID?, managerUnitID?, subtreeEmployeeIDs? }
     * @returns {Object} { rootUnitID, allowedEmployeeIDs }
     * @public
     */
    resolveScopeFilter( authority ) {
        if ( authority && authority.isSupervisor === true ) {
            return { rootUnitID: authority.orgRootUnitID || "", allowedEmployeeIDs: null };
        }
        return {
            rootUnitID: ( authority && authority.managerUnitID ) || "",
            allowedEmployeeIDs: ( authority && Array.isArray( authority.subtreeEmployeeIDs ) ) ? authority.subtreeEmployeeIDs.slice() : []
        };
    }

    /**
     * Pure live/snapshot resolution core. Deps are injected so the branch logic unit-tests without Redis. The public
     * `resolve` wires the real singletons. A falsy cycle (the real getCycle rejection is swallowed to null by the
     * public wrapper) is treated as a CLOSED whole-org read, which projects an empty snapshot. CLOSED + whole-org →
     * snapshot projection (no recompute); CLOSED + narrow filter → recompute from the still-present closed evals
     * (re-applying the DELETED exclusion, since the raw path bypasses fetchEvaluations' default filter). ACTIVE →
     * live compute with meta.partial / pctReporting. (Coverage is the only reportKey for Phase 0.)
     *
     * @method
     * @param {Object} deps - { getCycle, fetchEvaluations, getResultsSnapshot, buildSubtree, resolveOrgUnit }
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter (allowedEmployeeIDs decides whole-org vs narrow; rootUnitID roots the roster).
     * @param {string} reportKey - "coverage" for Phase 0.
     * @returns {Promise<Object>} report payload merged with { meta }.
     * @public
     */
    _resolveWith( deps, cycleID, filter, reportKey ) {
        return deps.getCycle( cycleID ).then( ( cycle ) => {
            const status = cycle ? cycle.status : configurationLoader.cycleStatus.CLOSED;   // falsy cycle (not-found) → treated as closed/empty
            const wholeOrg = !filter || filter.allowedEmployeeIDs === null;

            if ( status === configurationLoader.cycleStatus.CLOSED && wholeOrg ) {
                return deps.getResultsSnapshot( cycleID ).then( ( snapshot ) => {
                    // Project the requested report from the snapshot keyed by its OWN reportKey (CA-67: was hardcoded
                    // "coverage" in Phase 0 when only Coverage existed — that would mis-key R2–R6 read from a snapshot).
                    const payload = ( snapshot && snapshot.reports && snapshot.reports[ reportKey ] ) ? { [ reportKey ]: snapshot.reports[ reportKey ] } : this.#emptyReport( reportKey );
                    return this.#withMeta( payload, cycleID, status, null, false );
                } );
            }

            // ACTIVE (live), or CLOSED + narrow filter (recompute) — both read evals and re-apply DELETED exclusion.
            return deps.fetchEvaluations( null, false ).then( ( evaluations ) => {
                const allowed = ( filter && Array.isArray( filter.allowedEmployeeIDs ) ) ? new Set( filter.allowedEmployeeIDs ) : null;
                const liveEvals = evaluations.filter( ( evaluation ) => {
                    if ( !evaluation || evaluation.status === configurationLoader.evaluationStatus.DELETED ) {   // defensive: fetchEvaluations already strips DELETED; guard against a future change
                        return false;
                    }
                    return allowed === null || allowed.has( evaluation.employeeID );
                } );
                const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: deps.resolveOrgUnit } );
                const frame = this.buildCohortFrame( liveEvals, cycleID, frameFilter );

                let roster = this.buildRoster( deps.buildSubtree( filter ) );
                if ( allowed !== null ) {
                    roster = roster.filter( ( member ) => allowed.has( member.employeeID ) );
                }

                const finalize = ( reportFilter ) => {
                    const payload = this.#computeReport( reportKey, frame, roster, reportFilter );
                    return this.#withMeta( payload, cycleID, status, frame, status === configurationLoader.cycleStatus.ACTIVE );
                };
                // R2 alone needs data beyond the frame — the calendar + today — so fetch slots only for it.
                if ( reportKey === "timeDistribution" && typeof deps.fetchCalendarSlots === "function" ) {
                    return deps.fetchCalendarSlots( cycleID ).then( ( slots ) => finalize( Object.assign( {}, frameFilter, { slots: slots, today: deps.today } ) ) );
                }
                // R3 honors the configured quadrant midpoint live (filter.midpoint from the web layer wins; else the deps setting).
                if ( reportKey === "alignment" ) {
                    const midpoint = ( typeof frameFilter.midpoint === "number" ) ? frameFilter.midpoint : deps.alignmentMidpoint;
                    return finalize( Object.assign( {}, frameFilter, { midpoint: midpoint } ) );
                }
                return finalize( frameFilter );
            } );
        } );
    }

    /**
     * Public entrypoint: wires the real singletons into the pure resolve core. The web layer first computes the
     * scope (resolveScopeFilter) and injects rootUnitID + allowedEmployeeIDs into `filter`. The real getCycle
     * REJECTS with E_APP_RESOURCE_NOT_FOUND for an unknown cycle (data-manager.js:529-530), so it is wrapped to
     * resolve null on that one exception — letting the pure core's falsy-cycle branch handle it instead of throwing.
     *
     * @method
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter with rootUnitID + allowedEmployeeIDs already resolved by the web layer.
     * @param {string} reportKey
     * @returns {Promise<Object>}
     * @public
     */
    resolve( cycleID, filter, reportKey ) {
        const deps = {
            getCycle: ( id ) => dataManager.instance.getCycle( id ).catch( ( error ) => {
                if ( error && error.code === exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND ) {
                    return null;
                }
                throw error;
            } ),
            fetchEvaluations: ( employeeID, filterClosed ) => dataManager.instance.fetchEvaluations( employeeID, filterClosed ),
            getResultsSnapshot: ( id ) => dataManager.instance.getResultsSnapshot( id ),
            buildSubtree: ( f ) => organizationManager.instance.getOrganizationUnitSubtree( f ? f.rootUnitID : "" ),
            resolveOrgUnit: ( employeeID ) => organizationManager.instance.resolveOrganizationUnitIDForEmployee( employeeID ),
            fetchCalendarSlots: ( id ) => dataManager.instance.fetchAllCalendarSlots( id ),   // R2 only
            today: new Date().toISOString().split( "T" )[ 0 ],
            alignmentMidpoint: configurationLoader.getSetting( "performanceAppraisals.alignmentQuadrantMidpoint" )   // R3 only
        };
        return this._resolveWith( deps, cycleID, filter, reportKey );
    }

    /**
     * Dispatches a frame to the requested report computation. The six leadership report keys are all listed here so a
     * new report swaps exactly one branch from its empty stub to its real compute (avoids the shared-dispatcher merge
     * hot-spot). Inputs beyond (frame, roster, filter) — archetype weights (R4/R5), calendar slots + today (R2),
     * quadrant midpoint (R3) — are injected on `filter` by the caller (the `filter.resolveOrgUnit` precedent), so this
     * signature stays stable. Reports not yet implemented return their locked empty shape via #emptyReport.
     * @method
     * @param {string} reportKey
     * @param {Array<Object>} frame
     * @param {Array<Object>} roster
     * @param {Object} filter
     * @returns {Object}
     * @private
     */
    #computeReport( reportKey, frame, roster, filter ) {
        switch ( reportKey ) {
            case "coverage":
                return { coverage: this.computeCoverage( frame, roster, filter ) };
            case "levelDistribution":  // CA-67 Task 1
                return { levelDistribution: this.computeLevelDistribution( frame, filter ) };
            case "heatmap":            // CA-67 Task 2
                return { heatmap: this.computeCompetenceHeatmap( frame, filter ) };
            case "predictiveDrivers":  // CA-67 Task 3
                return { predictiveDrivers: this.computePredictiveDrivers( frame, filter ) };
            case "calibration":        // CA-68 — manager-scoped grader calibration (filter.managerID = the grader)
                return { calibration: this.computeCalibration( frame, filter ) };
            case "timeDistribution":   // CA-67 Task 4 — slots + today injected on the filter by the resolver
                return { timeDistribution: this.computeTimeDistribution( frame, filter ? filter.slots : null, filter ? filter.today : null ) };
            case "alignment":          // CA-67 Task 5 — midpoint/category injected on the filter by the web layer
                return { alignment: this.computeAlignment( frame, filter ) };
            default:
                return this.#emptyReport( reportKey );
        }
    }

    /**
     * Returns the locked empty payload for a report key (used before a report is implemented, and for the no-data /
     * not-found cycle case). Each shape matches its chart contract so the front-end renders a graceful empty state.
     * @method
     * @param {string} reportKey
     * @returns {Object}
     * @private
     */
    #emptyReport( reportKey ) {
        switch ( reportKey ) {
            case "coverage":
                return { coverage: { overall: this.#finalizeCoverageBucket( this.#emptyCoverageBucket() ), byGroup: [], pending: [] } };
            case "timeDistribution":
                return { timeDistribution: { rows: [], unscheduledReady: 0, perManager: [] } };
            case "alignment":
                return { alignment: { points: [], quadrantCounts: {}, diagonal: true, midpoint: GRADE_WEIGHTS.R } };
            case "heatmap":
                return { heatmap: { rows: SUBCATEGORIES.map( ( code ) => ( { id: code, label: code } ) ), cols: [], cells: [] } };
            case "levelDistribution":
                return { levelDistribution: { groups: [], reference: [] } };
            case "predictiveDrivers":
                return { predictiveDrivers: { rows: [], insufficientData: true } };
            case "calibration":
                return { calibration: { cohortSize: 0, pairsCompared: { self: 0, team: 0 }, overall: { vsSelf: { suppressed: true, n: 0 }, vsTeam: { suppressed: true, n: 0 } }, byCategory: {}, bySubcategory: {}, perCompetency: [] } };
            default:
                return {};
        }
    }

    /**
     * Wraps a report payload with the shared ResultMeta envelope. `reporting` = Ready+Closed rows in the frame;
     * `partial` is true only for ACTIVE cycles where not everyone is reporting. CLOSED / snapshot is always
     * partial:false (no frame is passed, so total/reporting are 0).
     * @method
     * @param {Object} payload
     * @param {string} cycleID
     * @param {string} cycleStatus
     * @param {Array<Object>|null} frame - frame (live/recompute) used for reporting counts; null for projection.
     * @param {boolean} isActive
     * @returns {Object}
     * @private
     */
    #withMeta( payload, cycleID, cycleStatus, frame, isActive ) {
        const mode = ( cycleStatus === configurationLoader.cycleStatus.ACTIVE ) ? "live" : "snapshot";
        let total = 0;
        let reporting = 0;
        if ( Array.isArray( frame ) ) {
            total = frame.length;
            reporting = frame.filter( ( row ) => row && ( row.status === configurationLoader.evaluationStatus.READY || row.status === configurationLoader.evaluationStatus.CLOSED ) ).length;
        }
        const pctReporting = ( total > 0 ) ? Math.round( ( reporting / total ) * 100 ) : 0;
        const meta = {
            cycleID: cycleID,
            mode: mode,
            cycleStatus: cycleStatus,
            computedAt: new Date().toISOString(),
            total: total,
            reporting: reporting,
            pctReporting: pctReporting,
            partial: ( isActive === true ) && ( reporting < total )
        };
        return Object.assign( {}, payload, { meta: meta } );
    }

    /**
     * Builds and persists the immutable results snapshot for a just-closed cycle. RE-READS the cycle via getCycle so
     * `actualCloseDate` (written by updateCycleStatus on ACTIVE→CLOSED, data-manager.js:602) is captured — the cycle
     * object that entered closeCycle predates that write. CONTRACT: only ever called post-close on an existing cycle;
     * getCycle rejects (E_APP_RESOURCE_NOT_FOUND) for an unknown cycleID rather than resolving null, and that rejection
     * is logged by the caller's catch, not swallowed here. Whole-org scope uses the resolved org-root unit id (never
     * the empty string, which getOrganizationUnitSubtree rejects → empty roster). Idempotent: re-running merge-writes
     * the cycle's snapshot, and since the shape is fixed every populated leaf is replaced.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Object>} The persisted ResultsSnapshot.
     * @public
     */
    persistResultsSnapshot( cycleID ) {
        return dataManager.instance.getCycle( cycleID ).then( ( cycle ) => {
            const rootUnitID = organizationManager.instance.getOrganizationRootUnitID();
            if ( !rootUnitID ) {
                return Promise.reject( new Error( "Cannot persist results snapshot for cycle '" + cycleID + "': organization chart not initialised" ) );
            }
            const filter = { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: rootUnitID };
            const resolveOrgUnit = ( employeeID ) => organizationManager.instance.resolveOrganizationUnitIDForEmployee( employeeID );
            const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: resolveOrgUnit } );
            return Promise.all( [
                dataManager.instance.fetchEvaluations( null, false ),
                dataManager.instance.fetchAllCalendarSlots( cycleID )   // R2 input
            ] ).then( ( [ evaluations, slots ] ) => {
                const cycleEvals = evaluations.filter( ( ev ) => ev && ev.cycleID === cycleID && ev.status !== configurationLoader.evaluationStatus.DELETED );
                const frame = this.buildCohortFrame( cycleEvals, cycleID, frameFilter );
                const subtree = organizationManager.instance.getOrganizationUnitSubtree( rootUnitID );
                const roster = this.buildRoster( subtree );
                const coverageReport = this.computeCoverage( frame, roster, frameFilter );
                const metaPayload = this.#withMeta( {}, cycleID, cycle.status, frame, false );
                const meta = metaPayload.meta;
                const snapshot = this.buildResultsSnapshot( cycleID, {
                    frame: frame,
                    coverageReport: coverageReport,
                    cycle: cycle,
                    dictionaryVersion: packageVersion,
                    meta: meta,
                    slots: slots,
                    today: new Date().toISOString().split( "T" )[ 0 ],
                    alignmentMidpoint: configurationLoader.getSetting( "performanceAppraisals.alignmentQuadrantMidpoint" )
                } );
                return dataManager.instance.saveResultsSnapshot( snapshot );
            } );
        } );
    }

    /**
     * Builds the immutable ResultsSnapshot for a closed cycle. PURE — takes the already-built cohort `frame`, the
     * already-computed Coverage report, and the re-read `cycle` (so `actualCloseDate` is populated). For Phase 0 only
     * `reports.coverage` is populated; the cross-cycle stable-axis aggregates are present with their locked shape but
     * empty (back-fill is impossible, so the envelope is locked now — §4 / §6).
     *
     * @method
     * @param {string} cycleID
     * @param {Object} input
     * @param {Array<Object>} input.frame - The CohortRow[] (Component B); used for cohort counts.
     * @param {Object|null} input.coverageReport - The Coverage payload (Component B computeCoverage output).
     * @param {Object} input.cycle - The re-read cycle (carries `actualCloseDate`).
     * @param {string} input.dictionaryVersion - The competence package version (code-drift guard).
     * @param {Object} input.meta - The ResultMeta envelope.
     * @returns {Object} The locked ResultsSnapshot.
     * @public
     */
    buildResultsSnapshot( cycleID, input ) {
        const frame = Array.isArray( input.frame ) ? input.frame : [];
        const coverageReport = input.coverageReport || null;
        const cycle = input.cycle || {};
        const overall = ( coverageReport && coverageReport.overall ) ? coverageReport.overall : {};

        const parts = String( cycleID ).split( "-" );
        const year = Number( parts[ 0 ] ) || 0;
        const half = parts[ 1 ];
        const chronoKey = ( year * 2 ) + ( half === "H2" ? 1 : 0 );

        const computedAt = ( input.meta && input.meta.computedAt ) ? input.meta.computedAt : new Date().toISOString();

        // R5 (CA-67): the level-distribution report is computed from the frame at close so a CLOSED cycle projects it.
        // byStageLevel is the compact cross-cycle slice derived from the same groups (stable 12-rung axis).
        const levelDistribution = this.computeLevelDistribution( frame, {} );
        const byStageLevel = {};
        for ( const group of levelDistribution.groups ) {
            byStageLevel[ group.id ] = { n: group.n, finalScoreMean: ( typeof group.mean === "number" ) ? group.mean : null };
        }
        // R4 (CA-67): canonical whole-org heatmap (blended source, role-family grouping) + the stable bySubcategory axis.
        // Alternate source/groupBy views on a CLOSED cycle recompute (a known projection-fidelity follow-up; ACTIVE is exact).
        const heatmap = this.computeCompetenceHeatmap( frame, { source: "blended", groupBy: "roleFamily" } );
        const bySubcategory = this.#computeBySubcategory( frame );
        // R6 (CA-67): whole-cohort predictive drivers (no filter variants).
        const predictiveDrivers = this.computePredictiveDrivers( frame, {} );
        // R2 (CA-67): time distribution needs the calendar + the close date, supplied by persistResultsSnapshot.
        const timeDistribution = Array.isArray( input.slots ) ? this.computeTimeDistribution( frame, input.slots, input.today ) : null;
        // R3 (CA-67): alignment quadrant at the configured midpoint (persistResultsSnapshot injects the live setting).
        const alignment = this.computeAlignment( frame, { midpoint: ( typeof input.alignmentMidpoint === "number" ) ? input.alignmentMidpoint : GRADE_WEIGHTS.R } );

        return {
            cycleID: cycleID,
            schemaVersion: 1,
            dictionaryVersion: input.dictionaryVersion || null,
            competencyCodeEra: "v3.0.0",
            computedAt: computedAt,
            cycleClosedAt: cycle.actualCloseDate || null,
            provisional: false,
            chronoKey: chronoKey,
            meta: input.meta || {},
            cohort: {
                nEligible: ( overall.N != null ) ? overall.N : 0,
                nClosed: frame.filter( ( r ) => r.status === configurationLoader.evaluationStatus.CLOSED ).length,
                nScored: frame.filter( ( r ) => r.isScored ).length,
                reportingPct: ( overall.pct != null ) ? overall.pct : 0
            },

            // Populated incrementally across CA-67; the remaining keys stay null until their report lands.
            reports: {
                coverage: coverageReport,
                timeDistribution: timeDistribution,      // CA-67 R2 (null when no calendar supplied)
                alignment: alignment,                    // CA-67 R3
                heatmap: heatmap,                        // CA-67 R4 (canonical blended/role-family variant)
                levelDistribution: levelDistribution,   // CA-67 R5
                predictiveDrivers: predictiveDrivers     // CA-67 R6
            },

            // Cross-cycle stable-axis substrate — locked SHAPE now, populated as reports land (never back-fillable).
            overall: { finalScore: {}, tBandMix: {} },
            byCategory: {},
            bySubcategory: bySubcategory,   // CA-67 R4 (stable E1..C3 axis)
            byStageLevel: byStageLevel,   // CA-67 R5 (stable 12-rung axis)
            ladderOrdinalHistogram: {},
            byRoleFamily: {},
            byOrgUnit: {}
        };
    }

}

const instance = new ResultsAnalytics();
module.exports.instance = Object.freeze( instance );

/**
 * Pure cycle selector: returns the cycle whose cycleID matches `requestedCycleID` from `cycles`,
 * or `fallbackCycle` when the request is blank/unknown. No I/O.
 *
 * @param {Array<Object>} cycles - All known cycles (each carries `cycleID`).
 * @param {string} requestedCycleID - The `?cycleID` query value (may be empty).
 * @param {Object|null} fallbackCycle - The active-or-latest cycle.
 * @returns {Object|null}
 */
function pickCycleForRequest( cycles, requestedCycleID, fallbackCycle ) {
    const wanted = String( requestedCycleID || "" ).trim();
    if ( wanted && Array.isArray( cycles ) ) {
        const match = cycles.find( ( cycle ) => cycle && cycle.cycleID === wanted );
        if ( match ) return match;
    }
    return fallbackCycle || null;
}

module.exports.pickCycleForRequest = pickCycleForRequest;

/**
 * Maturity-step expected GRADE for a competency at a stage level, from its relevancy-archetype weight curve (CA-67,
 * owner-approved Candidate 1). With `peak = max(weights)`, `intro = 0.5·peak`, `mature = 0.9·peak`: a competency is
 * expected `U` while still emerging (`w < intro`), `R` once it is core (`intro ≤ w < mature`), and `S` once it has
 * matured (`w ≥ mature`). Strict `<` on both thresholds (do not flip the boundary grade). A degenerate all-zero curve
 * (the competency is never relevant, so its grade never affects the score) returns `U`. Pure.
 *
 * @param {Object<string,number>} weights - Archetype weights keyed by stage-level (N1..T1).
 * @param {string} stageLevel
 * @returns {"U"|"R"|"S"}
 */
function expectedGradeForArchetype( weights, stageLevel ) {
    if ( !weights || typeof weights !== "object" ) {
        return "R";
    }
    let peak = 0;
    for ( const lvl of Object.keys( weights ) ) {
        const value = Number( weights[ lvl ] ) || 0;
        if ( value > peak ) { peak = value; }
    }
    if ( peak <= 0 ) {
        return "U";
    }
    const w = Number( weights[ stageLevel ] ) || 0;
    if ( w < ( 0.5 * peak ) ) { return "U"; }
    if ( w < ( 0.9 * peak ) ) { return "R"; }
    return "S";
}

/**
 * Pearson correlation coefficient of two equal-length numeric vectors. Returns null when undefined: mismatched/short
 * (n<2) inputs, or a zero-variance vector (a constant series has no linear correlation). Hand-rolled — no dependency.
 * Pure.
 *
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @returns {number|null}
 */
function pearson( x, y ) {
    if ( !Array.isArray( x ) || !Array.isArray( y ) || x.length !== y.length || x.length < 2 ) {
        return null;
    }
    const n = x.length;
    let sx = 0, sy = 0;
    for ( let i = 0; i < n; i++ ) { sx += x[ i ]; sy += y[ i ]; }
    const mx = sx / n, my = sy / n;
    let cov = 0, vx = 0, vy = 0;
    for ( let i = 0; i < n; i++ ) {
        const dx = x[ i ] - mx, dy = y[ i ] - my;
        cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    if ( vx <= 0 || vy <= 0 ) {
        return null;
    }
    return cov / Math.sqrt( vx * vy );
}

/**
 * Nearest-rank percentile of an ascending-sorted numeric array (the method named in §3 R5 for the box five-number
 * summary — no interpolation). `p` in [0,1]; p=0 → first element, p=1 → last. Returns null for an empty array. Pure.
 *
 * @param {Array<number>} sortedAsc - Values sorted ascending.
 * @param {number} p - Percentile in [0,1].
 * @returns {number|null}
 */
function nearestRankPercentile( sortedAsc, p ) {
    if ( !Array.isArray( sortedAsc ) || sortedAsc.length === 0 ) {
        return null;
    }
    const n = sortedAsc.length;
    let rank = Math.ceil( p * n );
    if ( rank < 1 ) { rank = 1; }
    if ( rank > n ) { rank = n; }
    return sortedAsc[ rank - 1 ];
}

module.exports.expectedGradeForArchetype = expectedGradeForArchetype;
module.exports.pearson = pearson;
module.exports.nearestRankPercentile = nearestRankPercentile;
