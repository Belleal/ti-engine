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

// Cross-cycle ladder-movement ordinals (design §3): the stage-family letter folds onto five rungs, with X and T (the two
// top single-rung families) collapsed into one top ordinal so the histogram has a stable 1..5 axis across cycles.
const LADDER_ORDINAL = Object.freeze( { N: 1, J: 2, R: 3, S: 4, X: 5, T: 5 } );

// The T-band axis for tBandMix histograms (stable across cycles).
const T_BANDS = Object.freeze( [ "T1", "T2", "T3", "T4", "T5" ] );

/**
 * Population standard deviation of a numeric array, rounded to 3 decimals. Returns null for an empty array. Pure.
 *
 * @param {Array<number>} values
 * @returns {number|null}
 */
function stdev( values ) {
    const n = values.length;
    if ( n < 1 ) {
        return null;
    }
    let sum = 0;
    for ( const v of values ) { sum += v; }
    const mean = sum / n;
    let sq = 0;
    for ( const v of values ) { sq += ( v - mean ) * ( v - mean ); }
    return Math.round( Math.sqrt( sq / n ) * 1000 ) / 1000;
}

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
        const resolveOrgUnitName = ( filter && typeof filter.resolveOrgUnitName === "function" ) ? filter.resolveOrgUnitName : () => "";
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
            const organizationUnitID = resolveOrgUnit( evaluation.employeeID ) || "";

            rows.push( {
                evaluationID: evaluation.evaluationID,
                employeeID: evaluation.employeeID,
                managerID: evaluation.managerID || "",
                status: evaluation.status,                                  // enum VALUE string
                roleFamily: evaluation.roleFamily || "",
                specialization: ( evaluation.specialization !== undefined ) ? evaluation.specialization : null,
                stageLevel: stageLevel,
                level: stageLevel ? stageLevel.charAt( 0 ) : "",            // stage-family letter (N/J/R/S/X/T)
                organizationUnitID: organizationUnitID,
                organizationUnitName: resolveOrgUnitName( organizationUnitID ) || "",
                interviewDate: ( evaluation.interviewDate !== undefined ) ? evaluation.interviewDate : null,
                isScored: finalScore !== null,
                finalScore: finalScore,
                finalInterpretation: finalScore ? ( finalScore.interpretation || null ) : null,
                // Per-category {score,interpretation} from calculateFinalEvaluationScores — the cross-cycle byCategory substrate.
                scores: ( evaluation.scores && typeof evaluation.scores === "object" ) ? evaluation.scores : null,
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
     * The reported subset of a frame: scored evaluations at a final status (Ready/Closed). The cross-cycle substrate
     * (overall/byCategory/ladder/byRoleFamily/byOrgUnit) is computed over this subset only.
     * @method
     * @param {Array<Object>} frame
     * @returns {Array<Object>}
     * @private
     */
    #reportedRows( frame ) {
        return ( Array.isArray( frame ) ? frame : [] ).filter( ( r ) => r && r.isScored && r.finalScore && typeof r.finalScore.score === "number"
            && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );
    }

    /**
     * Five-number summary (nearest-rank, no interpolation) plus mean and population stdev over a 0..150 score array.
     * Returns an empty object for an empty array (the legacy-safe "no substrate yet" shape).
     * @method
     * @param {Array<number>} scores
     * @returns {Object}
     * @private
     */
    #scoreStats( scores ) {
        if ( !scores.length ) {
            return {};
        }
        const sorted = scores.slice().sort( ( a, b ) => a - b );
        let sum = 0;
        for ( const s of sorted ) { sum += s; }
        return {
            n: sorted.length,
            mean: Math.round( sum / sorted.length ),
            median: nearestRankPercentile( sorted, 0.5 ),
            p25: nearestRankPercentile( sorted, 0.25 ),
            p75: nearestRankPercentile( sorted, 0.75 ),
            min: sorted[ 0 ],
            max: sorted[ sorted.length - 1 ],
            stdev: stdev( sorted )
        };
    }

    /**
     * Zero-filled count of `finalInterpretation` (the T-band) across rows. Used for overall.tBandMix and byCategory.tBandMix.
     * @method
     * @param {Array<Object>} rows
     * @param {string} [field] - the row field carrying the band (default "finalInterpretation").
     * @returns {Object<string,number>}
     * @private
     */
    #tBandMix( rows, field ) {
        const key = field || "finalInterpretation";
        const mix = {};
        for ( const band of T_BANDS ) { mix[ band ] = 0; }
        for ( const r of rows ) {
            const band = r[ key ];
            if ( band && mix[ band ] !== undefined ) { mix[ band ]++; }
        }
        return mix;
    }

    /**
     * overall.finalScore substrate: the five-number summary + mean/stdev over the reported rows' finalScore.score.
     * @method
     * @param {Array<Object>} frame
     * @returns {Object}
     * @private
     */
    #computeOverallStats( frame ) {
        return this.#scoreStats( this.#reportedRows( frame ).map( ( r ) => r.finalScore.score ) );
    }

    /**
     * byCategory substrate: per-category (E/I/C) five-number summary + mean/stdev + T-band mix over the reported rows'
     * pre-blended per-category scores (CohortRow.scores[cat].{score,interpretation}).
     * @method
     * @param {Array<Object>} rows - the reported subset.
     * @returns {Object<string,Object>}
     * @private
     */
    #computeByCategory( rows ) {
        const out = {};
        for ( const cat of [ "E", "I", "C" ] ) {
            const cells = rows.filter( ( r ) => r.scores && r.scores[ cat ] && typeof r.scores[ cat ].score === "number" )
                .map( ( r ) => ( { score: r.scores[ cat ].score, interpretation: r.scores[ cat ].interpretation } ) );
            out[ cat ] = Object.assign( {}, this.#scoreStats( cells.map( ( c ) => c.score ) ), { tBandMix: this.#tBandMix( cells, "interpretation" ) } );
        }
        return out;
    }

    /**
     * ladderOrdinalHistogram substrate: counts of reported rows per ladder ordinal (N→1,J→2,R→3,S→4,X+T→5) plus the
     * relevancy-free mean rung. Cohort-composition movement, not individual promotion (design §3 caveat).
     * @method
     * @param {Array<Object>} rows - the reported subset.
     * @returns {{hist:Object<string,number>,meanRung:(number|null)}}
     * @private
     */
    #computeLadderOrdinalHistogram( rows ) {
        const hist = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
        let ordinalSum = 0;
        let counted = 0;
        for ( const r of rows ) {
            const ordinal = LADDER_ORDINAL[ r.level ];
            if ( !ordinal ) { continue; }
            hist[ String( ordinal ) ]++;
            ordinalSum += ordinal;
            counted++;
        }
        return { hist: hist, meanRung: counted ? ( Math.round( ( ordinalSum / counted ) * 100 ) / 100 ) : null };
    }

    /**
     * byRoleFamily substrate: per role-family cohort summary, suppressed to {n,suppressed:true} below MIN_COHORT_SIZE
     * (highest de-anonymization risk — §5.3). Each surviving family carries n, finalScoreMean, byCategory and the
     * per-subcategory gap map.
     * @method
     * @param {Array<Object>} frame
     * @returns {Object<string,Object>}
     * @private
     */
    #computeByRoleFamily( frame ) {
        const groups = new Map();
        for ( const r of this.#reportedRows( frame ) ) {
            const key = r.roleFamily || "";
            if ( !groups.has( key ) ) { groups.set( key, [] ); }
            groups.get( key ).push( r );
        }
        const out = {};
        for ( const [ family, rows ] of groups ) {
            out[ family ] = this.#cohortCell( rows, { byCategory: true, bySubcategoryGap: true } );
        }
        return out;
    }

    /**
     * byOrgUnit substrate: per organization-unit cohort summary, suppressed below MIN_COHORT_SIZE (§5.3). Surviving
     * units carry n, the resolved unitName, finalScoreMean and byCategory.
     * @method
     * @param {Array<Object>} frame
     * @returns {Object<string,Object>}
     * @private
     */
    #computeByOrgUnit( frame ) {
        const groups = new Map();
        for ( const r of this.#reportedRows( frame ) ) {
            const key = r.organizationUnitID || "";
            if ( !groups.has( key ) ) { groups.set( key, [] ); }
            groups.get( key ).push( r );
        }
        const out = {};
        for ( const [ unitID, rows ] of groups ) {
            out[ unitID ] = this.#cohortCell( rows, { byCategory: true, unitName: ( rows[ 0 ] && rows[ 0 ].organizationUnitName ) || "" } );
        }
        return out;
    }

    /**
     * Builds one cohort breakdown cell (a role-family or org-unit group), applying the MIN_COHORT_SIZE suppression
     * floor. Below the floor it returns only {n,suppressed:true}; otherwise n, finalScoreMean and the requested extras.
     * @method
     * @param {Array<Object>} rows - already the reported subset for this group.
     * @param {Object} extras - { byCategory?:bool, bySubcategoryGap?:bool, unitName?:string }
     * @returns {Object}
     * @private
     */
    #cohortCell( rows, extras ) {
        const n = rows.length;
        if ( n < MIN_COHORT_SIZE ) {
            return { n: n, suppressed: true };
        }
        let sum = 0;
        for ( const r of rows ) { sum += r.finalScore.score; }
        const cell = { n: n, finalScoreMean: Math.round( sum / n ) };
        if ( extras && typeof extras.unitName === "string" ) { cell.unitName = extras.unitName; }
        if ( extras && extras.byCategory ) { cell.byCategory = this.#computeByCategory( rows ); }
        if ( extras && extras.bySubcategoryGap ) {
            const sub = this.#computeBySubcategory( rows );
            const gaps = {};
            for ( const code of Object.keys( sub ) ) { gaps[ code ] = sub[ code ].gap; }
            cell.bySubcategoryGap = gaps;
        }
        return cell;
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

        // meanGap = mean over distinct evaluations of each evaluation's OWN mean gap (so each evaluee is weighted
        // equally — a person graded on many competencies does not dominate — and the denominator matches `n`); `n` =
        // distinct evaluations contributing (the suppression/confidence basis). A side accumulates per evaluation.
        const newSide = () => ( { byEval: new Map() } );   // evaluationID → { sum, count }
        const newCell = () => ( { vsSelf: newSide(), vsTeam: newSide() } );
        const addGap = ( side, gap, evaluationID ) => {
            let entry = side.byEval.get( evaluationID );
            if ( !entry ) { entry = { sum: 0, count: 0 }; side.byEval.set( evaluationID, entry ); }
            entry.sum += gap; entry.count += 1;
        };
        const ensure = ( map, key ) => { if ( !map[ key ] ) { map[ key ] = newCell(); } return map[ key ]; };
        const finalizeSide = ( side ) => {
            const n = side.byEval.size;
            if ( n < minCohort ) { return { suppressed: true, n: n }; }
            let total = 0;
            for ( const entry of side.byEval.values() ) { total += ( entry.sum / entry.count ); }
            return { meanGap: this.#round3( total / n ), n: n };
        };
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
     * Pure cross-cycle trend shaping (CA-X2). Takes chrono-sorted ResultsSnapshots (the public computeTrend injects
     * getAllResultsSnapshots) and shapes ONE metric into chart-ready series. Snapshots are whole-org — these trends are
     * leadership-level (the endpoint is SUPERVISOR-gated). Tolerates legacy (schemaVersion < 2 / empty-substrate)
     * snapshots: they contribute `null` and are listed in `legacyCycles` rather than throwing. Cohort cells suppressed
     * for n<k contribute `null` and are listed in `suppressedCycles`. No I/O.
     *
     * @method
     * @param {Object} deps - { snapshots: Array<ResultsSnapshot> } (the last may carry provisional:true — the live ACTIVE cycle).
     * @param {Object} params - { metric:"overallScore"|"tBandMix"|"gapClosure"|"ladder"|"cohort", dimension?, key?, window? }
     * @returns {{meta:Object, series:Array, legacyCycles:Array<string>, suppressedCycles:Array<string>}}
     * @public
     */
    _computeTrendWith( deps, params ) {
        const all = ( deps && Array.isArray( deps.snapshots ) ) ? deps.snapshots.slice() : [];
        all.sort( ( a, b ) => ( a.chronoKey || 0 ) - ( b.chronoKey || 0 ) );
        const windowed = ( params && typeof params.window === "number" && params.window > 0 ) ? all.slice( -params.window ) : all;
        const metric = ( params && params.metric ) || "overallScore";
        const legacyCycles = [];
        const suppressedCycles = [];
        const isLegacy = ( s ) => ( ( s.schemaVersion || 1 ) < 2 );
        const markLegacy = ( s ) => { if ( legacyCycles.indexOf( s.cycleID ) < 0 ) { legacyCycles.push( s.cycleID ); } };

        const meta = {
            metric: metric,
            window: ( params && params.window ) || null,
            cycles: windowed.map( ( s ) => ( { cycleID: s.cycleID, chronoKey: s.chronoKey, provisional: Boolean( s.provisional ) } ) ),
            partial: windowed.some( ( s ) => Boolean( s.provisional ) )
        };

        let series = [];
        if ( metric === "overallScore" ) {
            const values = [], band = [];
            for ( const s of windowed ) {
                const fs = ( s.overall && s.overall.finalScore ) ? s.overall.finalScore : {};
                if ( isLegacy( s ) || typeof fs.mean !== "number" ) { values.push( null ); band.push( null ); markLegacy( s ); }
                else { values.push( fs.mean ); band.push( ( typeof fs.p25 === "number" && typeof fs.p75 === "number" ) ? [ fs.p25, fs.p75 ] : null ); }
            }
            series = [ { key: "mean", tone: "grade-s", values: values, band: band } ];
        } else if ( metric === "tBandMix" ) {
            const bands = [ "T1", "T2", "T3", "T4", "T5" ];
            series = bands.map( ( band, i ) => ( { key: band, tone: ( i <= 1 ? "grade-n" : ( i === 2 ? "grade-r" : "grade-s" ) ), values: windowed.map( ( s ) => {
                const mix = ( s.overall && s.overall.tBandMix ) ? s.overall.tBandMix : null;
                if ( isLegacy( s ) || !mix ) { return null; }
                return ( typeof mix[ band ] === "number" ) ? mix[ band ] : 0;
            } ) } ) );
            for ( const s of windowed ) { if ( isLegacy( s ) || !( s.overall && s.overall.tBandMix ) ) { markLegacy( s ); } }
        } else if ( metric === "gapClosure" ) {
            series = SUBCATEGORIES.map( ( code ) => ( { key: code, tone: "info", values: windowed.map( ( s ) => {
                const cell = ( !isLegacy( s ) && s.bySubcategory && s.bySubcategory[ code ] ) ? s.bySubcategory[ code ] : null;
                return ( cell && typeof cell.gap === "number" ) ? cell.gap : null;
            } ) } ) );
            for ( const s of windowed ) { if ( isLegacy( s ) || !s.bySubcategory || Object.keys( s.bySubcategory ).length === 0 ) { markLegacy( s ); } }
        } else if ( metric === "ladder" ) {
            const ordinals = [ "1", "2", "3", "4", "5" ];
            series = ordinals.map( ( ord ) => ( { key: ord, tone: "info", values: windowed.map( ( s ) => {
                const hist = s.ladderOrdinalHistogram || null;
                if ( isLegacy( s ) || !hist || Object.keys( hist ).length === 0 ) { return null; }
                return ( typeof hist[ ord ] === "number" ) ? hist[ ord ] : 0;
            } ) } ) );
            series.push( { key: "meanRung", tone: "grade-s", values: windowed.map( ( s ) => ( typeof s.ladderMeanRung === "number" ) ? s.ladderMeanRung : null ) } );
            for ( const s of windowed ) { if ( isLegacy( s ) || !s.ladderOrdinalHistogram || Object.keys( s.ladderOrdinalHistogram ).length === 0 ) { markLegacy( s ); } }
        } else if ( metric === "cohort" ) {
            const dimension = ( params && params.dimension ) || "orgUnit";
            const field = ( dimension === "roleFamily" ) ? "byRoleFamily" : ( ( dimension === "stageLevel" ) ? "byStageLevel" : "byOrgUnit" );
            let keys;
            if ( params && params.key ) {
                keys = [ params.key ];
            } else {
                const seen = new Set();
                for ( const s of windowed ) { const m = s[ field ] || {}; for ( const k of Object.keys( m ) ) { seen.add( k ); } }
                keys = Array.from( seen );
            }
            series = keys.map( ( k ) => ( { key: k, tone: "info", values: windowed.map( ( s ) => {
                const cell = ( s[ field ] && s[ field ][ k ] ) ? s[ field ][ k ] : null;
                if ( isLegacy( s ) || !cell ) { return null; }
                if ( cell.suppressed ) { if ( suppressedCycles.indexOf( s.cycleID ) < 0 ) { suppressedCycles.push( s.cycleID ); } return null; }
                return ( typeof cell.finalScoreMean === "number" ) ? cell.finalScoreMean : null;
            } ) } ) );
            for ( const s of windowed ) { if ( isLegacy( s ) || !s[ field ] || Object.keys( s[ field ] ).length === 0 ) { markLegacy( s ); } }
        }

        return { meta: meta, series: series, legacyCycles: legacyCycles, suppressedCycles: suppressedCycles };
    }

    /**
     * Public cross-cycle trend entrypoint (CA-X2): reads all persisted ResultsSnapshots (chrono-sorted by the data
     * layer) and shapes the requested metric via _computeTrendWith. Snapshots-only — a provisional live ACTIVE-cycle
     * point is a noted follow-up (it needs an active-cycle dry-build of the substrate). Whole-org; the endpoint gates
     * SUPERVISOR.
     *
     * @method
     * @param {Object} params - { metric, dimension?, key?, window? }
     * @returns {Promise<Object>}
     * @public
     */
    computeTrend( params ) {
        return dataManager.instance.getAllResultsSnapshots().then( ( snapshots ) => {
            return this._computeTrendWith( { snapshots: snapshots || [] }, params || {} );
        } );
    }

    /**
     * Pure per-employee historical score line (CA-X4). Over ONE employee's reported (Ready/Closed, scored) evaluations,
     * sorted chronologically by cycleDate, shapes a single finalScore line. The web layer gates access (self / superior
     * manager / supervisor) and passes the raw evaluations — this NEVER touches the anonymous snapshots. Returns
     * { noHistory:true } when fewer than minCycles (default 2) reported cycles exist.
     *
     * @method
     * @param {Array<Object>} evaluations - one employee's evaluations (raw).
     * @param {Object} [options] - { minCycles?:number }
     * @returns {{history:{x:Array,series:Array}}|{noHistory:true}}
     * @public
     */
    buildEmployeeHistory( evaluations, options ) {
        const minCycles = ( options && typeof options.minCycles === "number" ) ? options.minCycles : 2;
        const rows = ( Array.isArray( evaluations ) ? evaluations : [] )
            .filter( ( ev ) => ev && ( ev.status === configurationLoader.evaluationStatus.READY || ev.status === configurationLoader.evaluationStatus.CLOSED ) && ev.finalScore && typeof ev.finalScore.score === "number" )
            .slice()
            .sort( ( a, b ) => String( a.cycleDate || a.cycleID || "" ).localeCompare( String( b.cycleDate || b.cycleID || "" ) ) );
        if ( rows.length < minCycles ) {
            return { noHistory: true };
        }
        return {
            history: {
                x: rows.map( ( r ) => ( { id: r.cycleID, label: r.cycleID } ) ),
                series: [ { key: "score", tone: "grade-s", values: rows.map( ( r ) => r.finalScore.score ) } ]
            }
        };
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
            const resolveOrgUnitName = ( unitID ) => organizationManager.instance.resolveOrganizationUnitName( unitID );
            const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: resolveOrgUnit, resolveOrgUnitName: resolveOrgUnitName } );
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
            // Carry the suppression marker through (parity with byRoleFamily/byOrgUnit) so a stageLevel cohort trend can
            // flag small cells in suppressedCycles rather than emitting a silent null.
            byStageLevel[ group.id ] = group.suppressed
                ? { n: group.n, suppressed: true }
                : { n: group.n, finalScoreMean: ( typeof group.mean === "number" ) ? group.mean : null };
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

        // Phase 4 (CA-X0): the cross-cycle stable-axis substrate — computed over the reported subset, suppressing small
        // org/role cells (§5.3). Populating these bumps schemaVersion to 2; readers tolerate legacy (v1, empty) snapshots.
        const reported = this.#reportedRows( frame );
        const ladder = this.#computeLadderOrdinalHistogram( reported );
        const overallStats = this.#computeOverallStats( frame );
        const tBandMix = this.#tBandMix( reported );
        const byCategory = this.#computeByCategory( reported );
        const byRoleFamily = this.#computeByRoleFamily( frame );
        const byOrgUnit = this.#computeByOrgUnit( frame );

        return {
            cycleID: cycleID,
            schemaVersion: 2,
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

            // Cross-cycle stable-axis substrate (CA-X0) — populated over the reported subset; never back-fillable, so
            // cycles closed before this change keep the empty v1 shape and readers must tolerate it.
            overall: { finalScore: overallStats, tBandMix: tBandMix },
            byCategory: byCategory,                       // CA-X0 (stable E/I/C axis)
            bySubcategory: bySubcategory,                 // CA-67 R4 (stable E1..C3 axis)
            byStageLevel: byStageLevel,                   // CA-67 R5 (stable 12-rung axis)
            ladderOrdinalHistogram: ladder.hist,          // CA-X0 (N→1,J→2,R→3,S→4,X+T→5)
            ladderMeanRung: ladder.meanRung,              // CA-X0 (relevancy-free mean ordinal)
            byRoleFamily: byRoleFamily,                   // CA-X0 (n<k suppressed)
            byOrgUnit: byOrgUnit                          // CA-X0 (n<k suppressed)
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
