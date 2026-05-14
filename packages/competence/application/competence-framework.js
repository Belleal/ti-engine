/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const localization = require( "@ti-engine/core/localization" );
const configurationLoader = require( "#configuration-loader" );
const exceptions = require( "@ti-engine/core/exceptions" );

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

/**
 * Used to create and/or return a Competence Framework singleton instance.
 *
 * @class CompetenceFramework
 * @singleton
 * @public
 */
class CompetenceFramework {

    static #instance = null;

    // TODO: These need to be configurable!
    #evaluationCycleID = "2026-H1";
    #evaluationCycleStart = "2026-01-15";
    #evaluationCycleDate = "2026-06-30";
    #evaluationCycleEnd = "2026-09-15";
    #evaluationCycleName = "Spring '26 cycle";
    #evaluationScoreMatrices = {};

    /**
     * @constructor
     * @returns {CompetenceFramework}
     */
    constructor() {
        if ( !CompetenceFramework.#instance ) {
            CompetenceFramework.#instance = this;
        }

        this.#calculateEvaluationScoreMatrices();

        return CompetenceFramework.#instance;
    }

    /* Public interface */

    /**
     * Property returning the current evaluation cycle ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    get evaluationCycleID() {
        return this.#evaluationCycleID;
    }

    /**
     * Property returning the current evaluation cycle start date.
     *
     * @property
     * @returns {string}
     * @public
     */
    get evaluationCycleStart() {
        return this.#evaluationCycleStart;
    }

    /**
     * Property returning the current evaluation cycle date.
     *
     * @property
     * @returns {string}
     * @public
     */
    get evaluationCycleDate() {
        return this.#evaluationCycleDate;
    }

    /**
     * Property returning the current evaluation cycle end date.
     *
     * @property
     * @returns {string}
     * @public
     */
    get evaluationCycleEnd() {
        return this.#evaluationCycleEnd;
    }

    /**
     * Property returning the current evaluation cycle name.
     *
     * @property
     * @returns {string}
     * @public
     */
    get evaluationCycleName() {
        return this.#evaluationCycleName;
    }

    /**
     * Used to create a new Evaluation object.
     *
     * @method
     * @param {Employee} employee
     * @returns {Evaluation}
     * @public
     */
    createNewEvaluation( employee ) {
        return {
            evaluationID: tools.getUUID(),
            employeeID: employee.employeeID,
            cycleID: this.#evaluationCycleID,
            cycleDate: this.#evaluationCycleDate,
            status: configurationLoader.evaluationStatus.OPEN,
            grades: {},
            careerPath: employee.personal.careerPath,
            stageLevel: `${ employee.personal.level }${ employee.personal.stage }`,
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
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
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
     * Used to calculate the final evaluation scores for the provided evaluation.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @public
     */
    calculateFinalEvaluationScores( evaluation ) {
        if ( evaluation.grades ) {
            const competencies = configurationLoader.configCompetencies?.competencies || {};
            let selfScore = {};
            let teamScore = {};
            let managerScore = {};
            Object.keys( evaluation.grades ).forEach( ( competencyCode ) => {
                const competency = competencies[ competencyCode ];
                const gradeEntry = evaluation.grades[ competencyCode ];
                if ( competency && gradeEntry ) {
                    selfScore[ competency.category ] = selfScore[ competency.category ] || 0;
                    teamScore[ competency.category ] = teamScore[ competency.category ] || 0;
                    managerScore[ competency.category ] = managerScore[ competency.category ] || 0;

                    selfScore[ competency.category ] += gradeWeights[ gradeEntry.employee ] * competency.relevancy[ evaluation.stageLevel ];
                    teamScore[ competency.category ] += gradeWeights[ gradeEntry.team.cumulative ] * competency.relevancy[ evaluation.stageLevel ];
                    managerScore[ competency.category ] += gradeWeights[ gradeEntry.manager ] * competency.relevancy[ evaluation.stageLevel ];
                }
            } );

            evaluation.scores = {};
            evaluation.finalScore = {
                score: 0
            };
            const scoreMatrixByCategory = this.#evaluationScoreMatrices[ evaluation.careerPath ] || {};
            Object.keys( scoreMatrixByCategory ).forEach( ( categoryCode ) => {
                const maxCategoryScore = scoreMatrixByCategory[ categoryCode ]?.[ evaluation.stageLevel ];
                if ( !maxCategoryScore ) {
                    return;
                }
                evaluation.scores[ categoryCode ] = {};
                evaluation.scores[ categoryCode ].score = Math.ceil( (
                    ( ( selfScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.SELF +
                    ( ( teamScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.TEAM +
                    ( ( managerScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.MANAGER
                ) * 100 );

                evaluation.scores[ categoryCode ].interpretation = null;
                Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
                    if ( !evaluation.scores[ categoryCode ].interpretation && evaluation.scores[ categoryCode ].score <= performanceThresholds[ thresholdCode ] ) {
                        evaluation.scores[ categoryCode ].interpretation = thresholdCode;
                    }
                } );
                if ( !evaluation.scores[ categoryCode ].interpretation ) {
                    evaluation.scores[ categoryCode ].interpretation = configurationLoader.performanceThreshold.T5;
                }
                evaluation.finalScore.score += evaluation.scores[ categoryCode ].score;
            } );

            const scoredCategoriesCount = Object.keys( evaluation.scores ).length;
            if ( scoredCategoriesCount === 0 ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.unable-to-final-score" }, exceptions.httpCode.C_422 );
            }
            evaluation.finalScore.score = Math.ceil( evaluation.finalScore.score / scoredCategoriesCount );

            evaluation.finalScore.interpretation = null;
            Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
                if ( !evaluation.finalScore.interpretation && evaluation.finalScore.score <= performanceThresholds[ thresholdCode ] ) {
                    evaluation.finalScore.interpretation = thresholdCode;
                }
            } );
            if ( !evaluation.finalScore.interpretation ) {
                evaluation.finalScore.interpretation = configurationLoader.performanceThreshold.T5;
            }

            logger.log( "Final evaluation scores:", logger.logSeverity.DEBUG, { categories: evaluation.scores, final: evaluation.finalScore } );
        }
    }

    /**
     * Used to update the self-evaluation grades in the evaluation object.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateSelfEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            const allowedCompetencyCodes = new Set( this.getAllowedCompetencyCodes( evaluation.careerPath, evaluation.cycleID ) );
            Object.keys( grades ).forEach( ( competencyCode ) => {
                if ( allowedCompetencyCodes.has( competencyCode ) ) {
                    evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || {
                        employee: "",
                        manager: "",
                        team: { cumulative: "", individual: [] }
                    };
                    const submittedGrade = grades[ competencyCode ]?.employee;
                    if ( submittedGrade !== undefined ) {
                        if ( submittedGrade === "" || configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                            evaluation.grades[ competencyCode ].employee = submittedGrade;
                        }
                    }
                }
            } );
        }
    }

    /**
     * Used to update the team evaluation grades in the evaluation object.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateTeamEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            const competencies = configurationLoader.configCompetencies?.competencies || {};
            const allowedCompetencyCodes = new Set( this.getAllowedCompetencyCodes( evaluation.careerPath, evaluation.cycleID ) );
            Object.keys( grades ).forEach( ( competencyCode ) => {
                if ( competencies[ competencyCode ] && allowedCompetencyCodes.has( competencyCode ) ) {
                    evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || {
                        employee: "",
                        manager: "",
                        team: { cumulative: "", individual: [] }
                    };
                    const teamEntry = evaluation.grades[ competencyCode ].team = evaluation.grades[ competencyCode ].team || {
                        cumulative: "",
                        individual: []
                    };
                    teamEntry.individual = teamEntry.individual || [];

                    const submittedGrade = grades[ competencyCode ]?.team;
                    if ( submittedGrade ) {
                        if ( configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                            teamEntry.individual.push( submittedGrade );
                        }
                    }
                }
            } );
        }
    }

    /**
     * Used to update the manager evaluation grades in the evaluation object.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @public
     */
    updateManagerEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            const allowedCompetencyCodes = new Set( this.getAllowedCompetencyCodes( evaluation.careerPath, evaluation.cycleID ) );
            Object.keys( grades ).forEach( ( competencyCode ) => {
                if ( allowedCompetencyCodes.has( competencyCode ) && evaluation.grades[ competencyCode ] ) {
                    const submittedGrade = grades[ competencyCode ]?.manager;
                    if ( submittedGrade !== undefined ) {
                        if ( submittedGrade === "" || configurationLoader.evaluationGrade.contains( submittedGrade ) ) {
                            evaluation.grades[ competencyCode ].manager = submittedGrade;
                        }
                    }
                }
            } );
        }
    }

    /**
     * Used to anonymize the evaluation grades based on the user role.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
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
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
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
     * <br/>
     * NOTE: If the grade data is not present for the specified competency, an empty object will be returned.
     *
     * @method
     * @param {Object.<string, EvaluationGradeEntry>|Object} gradesByCode
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
                individual: grade.team?.individual || [],
            }
        };
    }

    /**
     * Used to get the allowed competency codes for the provided career path and evaluation cycle.
     *
     * @method
     * @param {string} careerPath
     * @param {string} cycleID
     * @returns {Array<string>} Will be empty if no competencies are allowed for the provided criteria.
     * @public
     */
    getAllowedCompetencyCodes( careerPath, cycleID ) {
        let allowedCompetencyCodes = [];
        if ( careerPath ) {
            const positionCompetencies = configurationLoader.configCareerPathCompetencies || {};
            const positionEntry = Object.prototype.hasOwnProperty.call( positionCompetencies, careerPath )
                ? positionCompetencies[ careerPath ]
                : null;

            if ( Array.isArray( positionEntry ) ) {
                allowedCompetencyCodes = positionEntry;
            } else if ( positionEntry && typeof positionEntry === "object" ) {
                allowedCompetencyCodes = Object.prototype.hasOwnProperty.call( positionEntry, cycleID ) ? positionEntry[ cycleID ] : [];
            }
        }
        return allowedCompetencyCodes;
    }

    /**
     * Used to build a tree of competencies based on the provided configuration.
     * <br/>
     * NOTE: If the 'allowedCompetencyCodes' parameter is provided, only competencies with codes that are present in the array will be included in the tree.
     * Otherwise, all competencies will be included.
     *
     * @method
     * @param {Object} competenceConfig
     * @param {TiLocalizationLanguage} language
     * @param {Array<string>} allowedCompetencyCodes
     * @returns {Array<Object>}
     * @public
     */
    buildCompetenciesTree( competenceConfig, language, allowedCompetencyCodes = null ) {
        const categories = competenceConfig?.categories || {};
        const competencies = competenceConfig?.competencies || {};
        const itemsByCategory = {};
        const filterByPosition = allowedCompetencyCodes !== null;
        const allowedCompetencySet = filterByPosition
            ? new Set( Array.isArray( allowedCompetencyCodes ) ? allowedCompetencyCodes : [] )
            : null;

        Object.entries( competencies ).forEach( ( [ competencyCode, competency ] ) => {
            if ( filterByPosition && !allowedCompetencySet.has( competencyCode ) ) return;
            if ( !competency || !competency.category || !competency.subcategory ) return;
            if ( !itemsByCategory[ competency.category ] ) {
                itemsByCategory[ competency.category ] = {};
            }
            if ( !itemsByCategory[ competency.category ][ competency.subcategory ] ) {
                itemsByCategory[ competency.category ][ competency.subcategory ] = [];
            }

            itemsByCategory[ competency.category ][ competency.subcategory ].push( {
                id: competencyCode,
                name: localization.getLabel( competency.name, language ),
                description: localization.getLabel( competency.description, language )
            } );
        } );

        Object.values( itemsByCategory ).forEach( ( subcategories ) => {
            Object.values( subcategories ).forEach( ( items ) => {
                items.sort( ( a, b ) => a.id.localeCompare( b.id, undefined, { numeric: true } ) );
            } );
        } );

        return Object.entries( categories ).map( ( [ categoryID, category ] ) => {
            const subcategories = Object.entries( category.subcategories || {} ).map( ( [ subID, subcategory ] ) => {
                return {
                    id: subID,
                    name: localization.getLabel( subcategory.name, language ),
                    description: localization.getLabel( subcategory.description, language ),
                    items: itemsByCategory?.[ categoryID ]?.[ subID ] || []
                };
            } );
            const filteredSubcategories = filterByPosition
                ? subcategories.filter( ( subcategory ) => subcategory.items.length > 0 )
                : subcategories;
            if ( filterByPosition && filteredSubcategories.length === 0 ) {
                return null;
            }
            return {
                id: categoryID,
                name: localization.getLabel( category.name, language ),
                description: localization.getLabel( category.description, language ),
                subcategories: filteredSubcategories
            };
        } ).filter( Boolean );
    }

    /* Private interface */

    /**
     * Used to calculate the evaluation score matrices for the current evaluation cycle.
     *
     * @method
     * @private
     */
    #calculateEvaluationScoreMatrices() {
        const competencies = configurationLoader.configCompetencies?.competencies || {};
        Object.keys( configurationLoader.configCareerPathCompetencies ).forEach( ( careerPathID ) => {
            const evaluationCycleCompetencies = this.getAllowedCompetencyCodes( careerPathID, this.#evaluationCycleID );
            if ( evaluationCycleCompetencies && Array.isArray( evaluationCycleCompetencies ) ) {
                this.#evaluationScoreMatrices[ careerPathID ] = {};
                evaluationCycleCompetencies.forEach( ( competencyCode ) => {
                    const competency = competencies[ competencyCode ];
                    if ( competency ) {
                        this.#evaluationScoreMatrices[ careerPathID ][ competency.category ] = this.#evaluationScoreMatrices[ careerPathID ][ competency.category ] || {};
                        Object.keys( configurationLoader.configCareerPathLevels ).forEach( ( careerPathLevelID ) => {
                            const careerPathLevel = configurationLoader.configCareerPathLevels[ careerPathLevelID ];
                            for ( let stage = 1; stage <= careerPathLevel.stages; stage++ ) {
                                const stageLevel = `${ careerPathLevelID }${ stage }`;
                                this.#evaluationScoreMatrices[ careerPathID ][ competency.category ][ stageLevel ] = this.#evaluationScoreMatrices[ careerPathID ][ competency.category ][ stageLevel ] || 0;
                                this.#evaluationScoreMatrices[ careerPathID ][ competency.category ][ stageLevel ] += competency.relevancy[ stageLevel ];
                            }
                        } );
                    }
                } );
            }
        } );
    }

}

const instance = new CompetenceFramework();
module.exports.instance = Object.freeze( instance );