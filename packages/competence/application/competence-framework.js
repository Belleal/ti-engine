/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const localization = require( "@ti-engine/core/localization" );
const configurationLoader = require( "#configuration-loader" );
const exceptions = require( "@ti-engine/core/exceptions" );
const dataManager = require( "#data-manager" );

const gradeWeights = tools.deepFreeze( {
    [ configurationLoader.evaluationGrade.S ]: configurationLoader.getSetting( "performanceAppraisals.gradeWeights.S" ) ?? 1.3,
    [ configurationLoader.evaluationGrade.R ]: configurationLoader.getSetting( "performanceAppraisals.gradeWeights.R" ) ?? 1.0,
    [ configurationLoader.evaluationGrade.U ]: configurationLoader.getSetting( "performanceAppraisals.gradeWeights.U" ) ?? 0.6,
    [ configurationLoader.evaluationGrade.N ]: configurationLoader.getSetting( "performanceAppraisals.gradeWeights.N" ) ?? 0.0
} );

const evaluationWeights = tools.deepFreeze( {
    SELF: configurationLoader.getSetting( "performanceAppraisals.evaluationWeights.self" ) ?? 0.2,
    TEAM: configurationLoader.getSetting( "performanceAppraisals.evaluationWeights.team" ) ?? 0.3,
    MANAGER: configurationLoader.getSetting( "performanceAppraisals.evaluationWeights.manager" ) ?? 0.5
} );

const performanceThresholds = tools.deepFreeze( {
    [ configurationLoader.performanceThreshold.T1 ]: configurationLoader.getSetting( "performanceAppraisals.performanceThresholds.T1" ) ?? 76,
    [ configurationLoader.performanceThreshold.T2 ]: configurationLoader.getSetting( "performanceAppraisals.performanceThresholds.T2" ) ?? 89,
    [ configurationLoader.performanceThreshold.T3 ]: configurationLoader.getSetting( "performanceAppraisals.performanceThresholds.T3" ) ?? 105,
    [ configurationLoader.performanceThreshold.T4 ]: configurationLoader.getSetting( "performanceAppraisals.performanceThresholds.T4" ) ?? 119,
    [ configurationLoader.performanceThreshold.T5 ]: configurationLoader.getSetting( "performanceAppraisals.performanceThresholds.T5" ) ?? 150
} );

const SUBCATEGORIES = Object.freeze( [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ] );
const BASELINE_KEY = "baseline";

/**
 * Used to create and/or return a Competence Framework singleton instance.
 *
 * @class CompetenceFramework
 * @singleton
 * @public
 */
class CompetenceFramework {

    static #instance = null;

    /**
     * @constructor
     * @returns {CompetenceFramework}
     */
    constructor() {
        if ( !CompetenceFramework.#instance ) {
            CompetenceFramework.#instance = this;
        }
        return CompetenceFramework.#instance;
    }

    /* Public interface */

    /**
     * Used to generate a short display ID from a UUID.
     * Deterministic: the same UUID always produces the same base candidate.
     * Collision-safe: if the candidate is already used within the cycle, increments until a free slot is found.
     *
     * @method
     * @param {string} uuid
     * @param {Set<string>} [usedShortIDs]
     * @returns {string} 6-character uppercase base-36 string
     * @public
     */
    generateShortID( uuid, usedShortIDs = new Set() ) {
        const hex = uuid.replace( /-/g, "" );
        const a = parseInt( hex.slice( 0, 8 ), 16 ) >>> 0;
        const b = parseInt( hex.slice( 8, 16 ), 16 ) >>> 0;
        const c = parseInt( hex.slice( 16, 24 ), 16 ) >>> 0;
        const d = parseInt( hex.slice( 24, 32 ), 16 ) >>> 0;
        const M = 2176782336; // 36^6 — 2.18 billion possible values
        let seed = ( ( a ^ b ^ c ^ d ) >>> 0 ) % M;
        let candidate = seed.toString( 36 ).toUpperCase().padStart( 6, "0" );
        while ( usedShortIDs.has( candidate ) ) {
            seed = ( seed + 1 ) % M;
            candidate = seed.toString( 36 ).toUpperCase().padStart( 6, "0" );
        }
        return candidate;
    }

    /**
     * Resolves the Active Competency Set for `(roleFamily, specialization?, cycleID)` as `baseline ∪ specialization`,
     * deduplicated and sorted by competency code ascending.
     *
     * <br/>NOTE: Throws when the baseline for the given family and cycle is absent or empty — a configuration error
     * for any non-PLANNING cycle. The specialization side is optional; a missing specialization set contributes an
     * empty array (not an error).
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {SpecializationCodeValue|string|null} specialization
     * @param {string} cycleID
     * @returns {Promise<Array<string>>}
     * @public
     */
    getActiveCompetencySet( roleFamily, specialization, cycleID ) {
        if ( !roleFamily || !cycleID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { roleFamily, cycleID } ) );
        }
        return dataManager.instance.getBaselineSet( roleFamily, cycleID ).then( ( baseline ) => {
            if ( !Array.isArray( baseline ) || baseline.length === 0 ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: `Missing or empty baseline for role family '${ roleFamily }' in cycle '${ cycleID }'.` }, exceptions.httpCode.C_422 );
            }
            const specPromise = specialization
                ? dataManager.instance.getSpecializationSet( roleFamily, specialization, cycleID )
                : Promise.resolve( [] );
            return specPromise.then( ( spec ) => {
                const merged = new Set( [ ...baseline, ...( Array.isArray( spec ) ? spec : [] ) ] );
                return Array.from( merged ).sort( ( a, b ) => a.localeCompare( b, undefined, { numeric: true } ) );
            } );
        } );
    }

    /**
     * Builds a frozen Active Competency Set snapshot for evaluation creation. Each entry carries the metadata needed
     * to render the evaluation form (name/description/scope/relevancy) and the origin marker used by the per-row
     * "Baseline" / "<Specialization>" badge.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {SpecializationCodeValue|string|null} specialization
     * @param {string} cycleID
     * @returns {Promise<Array<SnapshotEntry>>}
     * @public
     */
    buildEvaluationSnapshot( roleFamily, specialization, cycleID ) {
        return Promise.all( [
            this.getActiveCompetencySet( roleFamily, specialization, cycleID ),
            dataManager.instance.getBaselineSet( roleFamily, cycleID )
        ] ).then( ( [ resolvedCodes, baselineCodes ] ) => {
            const dictionary = ( configurationLoader.configCompetencies && configurationLoader.configCompetencies.competencies ) || {};
            const baselineSet = new Set( baselineCodes );
            return resolvedCodes.map( ( code ) => {
                const competency = dictionary[ code ];
                if ( !competency ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Competency '${ code }' referenced by the Active Competency Set is missing from the dictionary.` }, exceptions.httpCode.C_422 );
                }
                return {
                    code,
                    name: competency.name,
                    description: competency.description,
                    category: competency.category,
                    subcategory: competency.subcategory,
                    scope: { ...competency.scope },
                    relevancy: { ...competency.relevancy },
                    eCFMapping: Array.isArray( competency.eCFMapping ) ? _.cloneDeep( competency.eCFMapping ) : [],
                    origin: baselineSet.has( code ) ? BASELINE_KEY : specialization
                };
            } );
        } );
    }

    /**
     * Validates a PLANNING cycle for promotion to ACTIVE. Returns a structured result enumerating every failure
     * grouped by family so the UI can render errors inline. Pure function over the persisted data — no side effects.
     *
     * Rules:
     *   1. Baseline floor coverage — for every family that has any data for the cycle, baseline must include at
     *      least one competency from each of E1, E2, E3, I1, I2, I3, C1, C2, C3.
     *   2. Cap — resolved set (baseline ∪ specialization) must not exceed `performanceAppraisals.activeCompetencySetCap`
     *      (default 30).
     *   3. Reference integrity — every competency code must exist in the dictionary; every specialization key must be
     *      a valid specialization of the parent family.
     *   4. No empty baseline — a family with any specialization data for the cycle must have a non-empty baseline.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<{valid: boolean, errors: Array<{family: string, specialization?: string, rule: string, detail: string}>}>}
     * @public
     */
    validateCycleForLock( cycleID ) {
        if ( !cycleID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
        }
        const cap = configurationLoader.getSetting( "performanceAppraisals.activeCompetencySetCap", 30 );
        const dictionary = ( configurationLoader.configCompetencies && configurationLoader.configCompetencies.competencies ) || {};
        const roleFamilies = configurationLoader.configRoleFamilies || {};

        return dataManager.instance.getRoleFamilies().then( ( storedFamilies ) => {
            // Allow either the seeded cache copy or the static configuration as the authority for which specializations
            // are valid — they should be identical, but if the DB-backed copy is incomplete (e.g., never seeded),
            // fall back to the configuration source.
            const familySource = ( storedFamilies && Object.keys( storedFamilies ).length > 0 ) ? storedFamilies : roleFamilies;
            return new Promise( ( resolve, reject ) => {
                Promise.all( Object.keys( familySource ).map( ( family ) => this.#validateFamilyForLock( family, cycleID, dictionary, familySource[ family ], cap ) ) )
                    .then( ( perFamilyErrors ) => {
                        const errors = perFamilyErrors.flat();
                        resolve( { valid: errors.length === 0, errors } );
                    } )
                    .catch( reject );
            } );
        } );
    }

    /**
     * Transitions a cycle from PLANNING to ACTIVE. Runs `validateCycleForLock` first and aborts on any failure.
     * Enforces the single-active-cycle invariant: refuses to lock if another cycle is already ACTIVE.
     *
     * @method
     * @param {string} cycleID
     * @param {string|null} [actorID] - Employee ID of the actor performing the lock (Supervisor).
     * @returns {Promise<Cycle>}
     * @public
     */
    lockCycle( cycleID, actorID = null ) {
        return Promise.all( [
            dataManager.instance.getCycle( cycleID ),
            dataManager.instance.getActiveCycle()
        ] ).then( ( [ cycle, activeCycle ] ) => {
            if ( cycle.status !== configurationLoader.cycleStatus.PLANNING ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: `Cycle '${ cycleID }' cannot transition from '${ cycle.status }' to ACTIVE.` }, exceptions.httpCode.C_422 );
            }
            if ( activeCycle && activeCycle.cycleID !== cycleID ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: `Cannot lock '${ cycleID }' while cycle '${ activeCycle.cycleID }' is already ACTIVE. Close it first.` }, exceptions.httpCode.C_409 );
            }
            return this.validateCycleForLock( cycleID ).then( ( validation ) => {
                if ( !validation.valid ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "Cycle validation failed.", errors: validation.errors }, exceptions.httpCode.C_422 );
                }
                return dataManager.instance.updateCycleStatus( cycleID, configurationLoader.cycleStatus.ACTIVE, actorID );
            } );
        } );
    }

    /**
     * Transitions a cycle from ACTIVE to CLOSED.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Cycle>}
     * @public
     */
    closeCycle( cycleID ) {
        return dataManager.instance.getCycle( cycleID ).then( ( cycle ) => {
            if ( cycle.status !== configurationLoader.cycleStatus.ACTIVE ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: `Cycle '${ cycleID }' cannot transition from '${ cycle.status }' to CLOSED.` }, exceptions.httpCode.C_422 );
            }
            return dataManager.instance.updateCycleStatus( cycleID, configurationLoader.cycleStatus.CLOSED );
        } );
    }

    /**
     * Used to create a new Evaluation object. The caller is responsible for pre-resolving the cycle (e.g. via
     * `DataManager.getActiveCycle()`) and the snapshot (via `buildEvaluationSnapshot`).
     *
     * @method
     * @param {Employee} employee
     * @param {Cycle} cycle
     * @param {Array<SnapshotEntry>} snapshot
     * @returns {Evaluation}
     * @public
     */
    createNewEvaluation( employee, cycle, snapshot ) {
        if ( !employee || !cycle || !Array.isArray( snapshot ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employee: !!employee, cycle: !!cycle, snapshot: Array.isArray( snapshot ) } );
        }
        const evaluationID = tools.getUUID();
        const grades = {};
        for ( const entry of snapshot ) {
            grades[ entry.code ] = this.normalizeGrades( null, entry.code );
        }
        return {
            evaluationID: evaluationID,
            shortID: `${ cycle.cycleID }-${ this.generateShortID( evaluationID ) }`,
            employeeID: employee.employeeID,
            cycleID: cycle.cycleID,
            cycleDate: cycle.cycleDate,
            status: configurationLoader.evaluationStatus.OPEN,
            roleFamily: employee.career.roleFamily,
            specialization: employee.career.specialization ?? null,
            stageLevel: `${ employee.career.level }${ employee.career.stage }`,
            snapshot: _.cloneDeep( snapshot ),
            grades: grades,
            scores: {},
            finalScore: {},
            comment: "",
            feedback: {
                managerComment: "",
                teamComments: []
            },
            workflow: {
                currentStep: 1,
                selfEvaluationCompleted: false,
                selfEvaluationDeadline: "",
                managerEvaluationCompleted: false,
                managerEvaluationDeadline: "",
                teamEvaluationCompleted: false,
                teamEvaluationDeadline: "",
                teamEvaluationsSubmitted: 0,
                team: []
            }
        };
    }

    /**
     * Used to calculate the cumulative grades for the team evaluation.
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @public
     */
    calculateTeamCumulativeGrades( evaluation ) {
        if ( evaluation.grades ) {
            Object.values( evaluation.grades ).forEach( ( gradeEntry ) => {
                if ( gradeEntry.team && gradeEntry.team.individual && gradeEntry.team.individual.length > 0 ) {
                    let sum = 0;
                    let count = 0;
                    gradeEntry.team.individual.forEach( ( grade ) => {
                        if ( Object.prototype.hasOwnProperty.call( gradeWeights, grade ) ) {
                            sum += gradeWeights[ grade ];
                            count++;
                        }
                    } );
                    if ( count > 0 ) {
                        const average = sum / count;
                        let closestGrade = "";
                        let minDiff = Number.MAX_VALUE;

                        Object.keys( gradeWeights ).forEach( ( grade ) => {
                            const diff = Math.abs( average - gradeWeights[ grade ] );
                            if ( diff < minDiff ) {
                                minDiff = diff;
                                closestGrade = grade;
                            }
                        } );

                        gradeEntry.team.cumulative = closestGrade;
                    }
                }
            } );
        }
    }

    /**
     * Used to calculate the final evaluation scores for the provided evaluation. Reads per-stage-level relevancy
     * weights from the evaluation snapshot, not from the live competencies dictionary.
     *
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @public
     */
    calculateFinalEvaluationScores( evaluation ) {
        if ( !evaluation || !Array.isArray( evaluation.snapshot ) || !evaluation.grades ) {
            return;
        }

        const snapshotByCode = new Map();
        for ( const entry of evaluation.snapshot ) {
            snapshotByCode.set( entry.code, entry );
        }

        const selfScore = {};
        const teamScore = {};
        const managerScore = {};
        const maxScoreByCategory = {};

        Object.entries( evaluation.grades ).forEach( ( [ competencyCode, gradeEntry ] ) => {
            const entry = snapshotByCode.get( competencyCode );
            if ( !entry || !gradeEntry ) {
                return;
            }
            const relevancy = entry.relevancy?.[ evaluation.stageLevel ] || 0;
            const category = entry.category;

            selfScore[ category ] = ( selfScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.employee ] || 0 ) * relevancy;
            teamScore[ category ] = ( teamScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.team?.cumulative ] || 0 ) * relevancy;
            managerScore[ category ] = ( managerScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.manager ] || 0 ) * relevancy;
            maxScoreByCategory[ category ] = ( maxScoreByCategory[ category ] || 0 ) + relevancy;
        } );

        evaluation.scores = {};
        evaluation.finalScore = { score: 0 };

        Object.entries( maxScoreByCategory ).forEach( ( [ categoryCode, maxCategoryScore ] ) => {
            if ( !maxCategoryScore ) {
                return;
            }
            const categoryScore = Math.ceil( (
                ( ( selfScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.SELF +
                ( ( teamScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.TEAM +
                ( ( managerScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.MANAGER
            ) * 100 );

            let interpretation = null;
            Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
                if ( !interpretation && categoryScore <= performanceThresholds[ thresholdCode ] ) {
                    interpretation = thresholdCode;
                }
            } );
            if ( !interpretation ) {
                interpretation = configurationLoader.performanceThreshold.T5;
            }

            evaluation.scores[ categoryCode ] = { score: categoryScore, interpretation };
            evaluation.finalScore.score += categoryScore;
        } );

        const scoredCategoriesCount = Object.keys( evaluation.scores ).length;
        if ( scoredCategoriesCount === 0 ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.unable-to-final-score" }, exceptions.httpCode.C_422 );
        }
        evaluation.finalScore.score = Math.ceil( evaluation.finalScore.score / scoredCategoriesCount );

        let finalInterpretation = null;
        Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
            if ( !finalInterpretation && evaluation.finalScore.score <= performanceThresholds[ thresholdCode ] ) {
                finalInterpretation = thresholdCode;
            }
        } );
        evaluation.finalScore.interpretation = finalInterpretation || configurationLoader.performanceThreshold.T5;

        logger.log( "Final evaluation scores:", logger.logSeverity.DEBUG, { categories: evaluation.scores, final: evaluation.finalScore } );
    }

    /**
     * Used to update the self-evaluation grades in the evaluation object. Filters to competency codes present in the
     * evaluation's snapshot.
     *
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateSelfEvaluationGrades( evaluation, grades ) {
        if ( !grades ) return;
        const allowed = this.#snapshotCodes( evaluation );
        Object.keys( grades ).forEach( ( competencyCode ) => {
            if ( !allowed.has( competencyCode ) ) return;
            evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || this.normalizeGrades( null, competencyCode );
            const submittedGrade = grades[ competencyCode ]?.employee;
            if ( submittedGrade !== undefined ) {
                if ( submittedGrade === "" || configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                    evaluation.grades[ competencyCode ].employee = submittedGrade;
                }
            }
        } );
    }

    /**
     * Used to update the team evaluation grades in the evaluation object. Filters to competency codes present in the
     * evaluation's snapshot.
     *
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateTeamEvaluationGrades( evaluation, grades ) {
        if ( !grades ) return;
        const allowed = this.#snapshotCodes( evaluation );
        Object.keys( grades ).forEach( ( competencyCode ) => {
            if ( !allowed.has( competencyCode ) ) return;
            evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || this.normalizeGrades( null, competencyCode );
            const teamEntry = evaluation.grades[ competencyCode ].team = evaluation.grades[ competencyCode ].team || { cumulative: "", individual: [] };
            teamEntry.individual = teamEntry.individual || [];

            const submittedGrade = grades[ competencyCode ]?.team;
            if ( submittedGrade && configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                teamEntry.individual.push( submittedGrade );
            }
        } );
    }

    /**
     * Used to update the manager evaluation grades in the evaluation object. Filters to competency codes present in
     * the evaluation's snapshot.
     *
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateManagerEvaluationGrades( evaluation, grades ) {
        if ( !grades ) return;
        const allowed = this.#snapshotCodes( evaluation );
        Object.keys( grades ).forEach( ( competencyCode ) => {
            if ( !allowed.has( competencyCode ) ) return;
            evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || this.normalizeGrades( null, competencyCode );
            const submittedGrade = grades[ competencyCode ]?.manager;
            if ( submittedGrade !== undefined ) {
                if ( submittedGrade === "" || configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                    evaluation.grades[ competencyCode ].manager = submittedGrade;
                }
            }
        } );
    }

    /**
     * Used to anonymize the evaluation grades based on the user role.
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {RoleCodeValue} userRole
     * @public
     */
    anonymizeEvaluationGrades( evaluation, userRole ) {
        if ( evaluation.grades ) {
            Object.keys( evaluation.grades ).forEach( ( competencyCode ) => {
                if ( userRole === configurationLoader.roleCode.EMPLOYEE ) {
                    delete evaluation.grades[ competencyCode ].manager;
                    delete evaluation.grades[ competencyCode ].team;
                } else if ( userRole === configurationLoader.roleCode.TEAM_MEMBER ) {
                    const isCollective = configurationLoader.getSetting( "performanceAppraisals.isTeamEvaluationCollective" );
                    if ( isCollective ) {
                        delete evaluation.grades[ competencyCode ];
                    } else {
                        delete evaluation.grades[ competencyCode ].employee;
                        delete evaluation.grades[ competencyCode ].manager;
                        evaluation.grades[ competencyCode ].team = "";
                    }
                } else if ( userRole === configurationLoader.roleCode.MANAGER ) {
                    evaluation.grades[ competencyCode ].team = evaluation.grades[ competencyCode ].team?.cumulative || "";
                } else {
                    delete evaluation.grades[ competencyCode ].employee;
                    delete evaluation.grades[ competencyCode ].manager;
                    delete evaluation.grades[ competencyCode ].team;
                }
            } );
        }
    }

    /**
     * Used to anonymize the evaluation scores based on the user role.
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {RoleCodeValue} userRole
     * @public
     */
    anonymizeEvaluationScores( evaluation, userRole ) {
        if ( userRole === configurationLoader.roleCode.EMPLOYEE || userRole === configurationLoader.roleCode.MANAGER ) {
            if ( evaluation.finalScore && evaluation.finalScore.interpretation ) {
                evaluation.finalScore = {
                    ...evaluation.finalScore,
                    interpretationName: configurationLoader.performanceThreshold.name( evaluation.finalScore.interpretation )
                };
            }
            if ( evaluation.scores ) {
                Object.values( evaluation.scores ).forEach( ( score ) => {
                    if ( score && score.interpretation ) {
                        score.interpretationName = configurationLoader.performanceThreshold.name( score.interpretation );
                    }
                } );
            }
        } else {
            evaluation.finalScore = {};
            evaluation.scores = {};
            if ( evaluation.feedback ) {
                delete evaluation.feedback.managerComment;
                evaluation.feedback.teamComments = [];
            }
            delete evaluation.comment;
        }
    }

    /**
     * Used to normalize the grade data for a specific competency.
     *
     * <br/>NOTE: If the grade data is not present for the specified competency, an empty entry is returned.
     *
     * @method
     * @param {Object.<string, EvaluationGradeEntry>|Object|null} gradesByCode
     * @param {string} competencyCode
     * @returns {EvaluationGradeEntry}
     * @public
     */
    normalizeGrades( gradesByCode, competencyCode ) {
        const grade = ( gradesByCode && gradesByCode[ competencyCode ] ) || {};
        return {
            employee: grade.employee || "",
            manager: grade.manager || "",
            team: {
                cumulative: grade.team?.cumulative || "",
                individual: grade.team?.individual || []
            }
        };
    }

    /**
     * Builds a category/subcategory tree from an evaluation snapshot for rendering in the evaluation form. Reads
     * exclusively from the snapshot — does NOT consult the live competencies dictionary.
     *
     * @method
     * @param {Array<SnapshotEntry>} snapshot
     * @param {TiLocalizationLanguage} language
     * @returns {Array<Object>}
     * @public
     */
    buildCompetenciesTreeFromSnapshot( snapshot, language ) {
        const config = configurationLoader.configCompetencies || {};
        const categories = config.categories || {};
        const itemsByCategory = {};

        ( Array.isArray( snapshot ) ? snapshot : [] ).forEach( ( entry ) => {
            if ( !entry || !entry.category || !entry.subcategory ) return;
            itemsByCategory[ entry.category ] = itemsByCategory[ entry.category ] || {};
            itemsByCategory[ entry.category ][ entry.subcategory ] = itemsByCategory[ entry.category ][ entry.subcategory ] || [];
            itemsByCategory[ entry.category ][ entry.subcategory ].push( {
                id: entry.code,
                name: localization.getLabel( entry.name, language ),
                description: localization.getLabel( entry.description, language ),
                origin: entry.origin,
                eCFMapping: Array.isArray( entry.eCFMapping ) ? entry.eCFMapping : []
            } );
        } );

        Object.values( itemsByCategory ).forEach( ( subcategories ) => {
            Object.values( subcategories ).forEach( ( items ) => {
                items.sort( ( a, b ) => a.id.localeCompare( b.id, undefined, { numeric: true } ) );
            } );
        } );

        return Object.entries( categories ).map( ( [ categoryID, category ] ) => {
            const subcategories = Object.entries( category.subcategories || {} )
                .map( ( [ subID, subcategory ] ) => ( {
                    id: subID,
                    name: localization.getLabel( subcategory.name, language ),
                    description: localization.getLabel( subcategory.description, language ),
                    items: itemsByCategory?.[ categoryID ]?.[ subID ] || []
                } ) )
                .filter( ( subcategory ) => subcategory.items.length > 0 );
            if ( subcategories.length === 0 ) {
                return null;
            }
            return {
                id: categoryID,
                name: localization.getLabel( category.name, language ),
                description: localization.getLabel( category.description, language ),
                subcategories
            };
        } ).filter( Boolean );
    }

    /* Private interface */

    /**
     * Returns the set of competency codes baked into the evaluation snapshot, for fast membership checks.
     *
     * @method
     * @private
     * @param {Evaluation} evaluation
     * @returns {Set<string>}
     */
    #snapshotCodes( evaluation ) {
        const codes = new Set();
        if ( Array.isArray( evaluation?.snapshot ) ) {
            evaluation.snapshot.forEach( ( entry ) => entry?.code && codes.add( entry.code ) );
        }
        return codes;
    }

    /**
     * Runs the four validation rules for one role family within the given cycle. Returns an array of error
     * descriptors (empty when the family is well-formed).
     *
     * @method
     * @private
     * @param {string} family
     * @param {string} cycleID
     * @param {Object.<string, Competency>} dictionary
     * @param {RoleFamily} familyConfig
     * @param {number} cap
     * @returns {Promise<Array<Object>>}
     */
    #validateFamilyForLock( family, cycleID, dictionary, familyConfig, cap ) {
        return dataManager.instance.getActiveCompetencySetsForFamily( family, cycleID ).then( ( allSets ) => {
            const baseline = Array.isArray( allSets[ BASELINE_KEY ] ) ? allSets[ BASELINE_KEY ] : [];
            const specializationSets = {};
            for ( const [ key, codes ] of Object.entries( allSets ) ) {
                if ( key === BASELINE_KEY ) continue;
                specializationSets[ key ] = Array.isArray( codes ) ? codes : [];
            }
            return { baseline, specializationSets };
        } ).then( ( { baseline, specializationSets } ) => {
            const errors = [];
            const baselineArr = Array.isArray( baseline ) ? baseline : [];
            const hasAnyData = baselineArr.length > 0 || Object.values( specializationSets ).some( ( arr ) => arr.length > 0 );
            if ( !hasAnyData ) {
                return errors;
            }

            // Rule 4 first: no empty baseline if any specialization data is present for the cycle.
            const hasSpecData = Object.values( specializationSets ).some( ( arr ) => arr.length > 0 );
            if ( hasSpecData && baselineArr.length === 0 ) {
                errors.push( { family, rule: "no-empty-baseline", detail: `Family '${ family }' has specialization data but an empty baseline.` } );
            }

            // Rule 1: baseline floor coverage — applies only when baseline has content.
            if ( baselineArr.length > 0 ) {
                const baselineSubcategories = new Set();
                baselineArr.forEach( ( code ) => {
                    const comp = dictionary[ code ];
                    if ( comp && comp.subcategory ) baselineSubcategories.add( comp.subcategory );
                } );
                for ( const subcategory of SUBCATEGORIES ) {
                    if ( !baselineSubcategories.has( subcategory ) ) {
                        errors.push( { family, rule: "baseline-floor-coverage", detail: `Baseline for '${ family }' is missing a competency in subcategory '${ subcategory }'.` } );
                    }
                }
            }

            // Rule 3: reference integrity — competency codes exist in the dictionary.
            const allCodes = new Set( baselineArr );
            for ( const [ specCode, codes ] of Object.entries( specializationSets ) ) {
                codes.forEach( ( c ) => allCodes.add( c ) );
                for ( const code of codes ) {
                    if ( !dictionary[ code ] ) {
                        errors.push( { family, specialization: specCode, rule: "reference-integrity", detail: `Specialization '${ specCode }' references unknown competency '${ code }'.` } );
                    }
                }
            }
            for ( const code of baselineArr ) {
                if ( !dictionary[ code ] ) {
                    errors.push( { family, rule: "reference-integrity", detail: `Baseline references unknown competency '${ code }'.` } );
                }
            }

            // Rule 3: reference integrity — every specialization key must exist under the parent family.
            const validSpecCodes = new Set( Object.keys( familyConfig?.specializations || {} ) );
            for ( const specCode of Object.keys( specializationSets ) ) {
                if ( !validSpecCodes.has( specCode ) ) {
                    errors.push( { family, specialization: specCode, rule: "reference-integrity", detail: `Specialization code '${ specCode }' is not a valid specialization of family '${ family }'.` } );
                }
            }

            // Rule 2: cap — for the family's baseline and every (baseline ∪ specialization) resolved set.
            if ( baselineArr.length > cap ) {
                errors.push( { family, rule: "cap", detail: `Baseline size ${ baselineArr.length } exceeds the configured cap of ${ cap }.` } );
            }
            for ( const [ specCode, codes ] of Object.entries( specializationSets ) ) {
                const resolved = new Set( [ ...baselineArr, ...codes ] );
                if ( resolved.size > cap ) {
                    errors.push( { family, specialization: specCode, rule: "cap", detail: `Resolved set (baseline ∪ '${ specCode }') has size ${ resolved.size } and exceeds the configured cap of ${ cap }.` } );
                }
            }

            return errors;
        } );
    }

}

const instance = new CompetenceFramework();
module.exports.instance = Object.freeze( instance );
