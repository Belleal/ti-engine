/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
const exceptions = require( "@ti-engine/core/exceptions" );
const localization = require( "@ti-engine/core/localization" );
const tools = require( "@ti-engine/core/tools" );
const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );

const gradeWeights = tools.deepFreeze( {
    [ configurationLoader.evaluationGrade.S ]: 1.3,
    [ configurationLoader.evaluationGrade.R ]: 1.0,
    [ configurationLoader.evaluationGrade.U ]: 0.6
} );

/**
 * NOTE: This is still a work in progress.
 *
 * @class CompetenceWebApplication
 * @extends TiWebAppManager
 * @public
 */
class CompetenceWebApplication extends TiWebAppManager {

    /**
     * @constructor
     * @param {string} identifier
     */
    constructor( identifier = "competence" ) {
        super( identifier );

        this.addFragment( "competence-evaluation", {
            title: "Competence Evaluation",
            path: "fragments/frame-competence-evaluation.html",
            components: [ "component-tooltip" ]
        } );
        this.addFragment( "employees-list", {
            title: "Employees List",
            path: "fragments/frame-employees-list.html"
        } );
    }

    /* Public interface */

    /**
     * Optional HTML transformation hook.
     *
     * @method
     * @param {string} html
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @param {string} [options.title] Optional title to replace the placeholder in the HTML.
     * @returns {Promise<string>}
     * @override
     * @public
     */
    transformHtml( html, options ) {
        return super.transformHtml( html, options );
    }

    /**
     * Used to process a request for a data resource.
     *
     * @method
     * @param {Object} session
     * @param {string} view
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @override
     * @public
     */
    processDataRequest( session, view, options = {} ) {
        if ( view === "config" ) {
            return super.processDataRequest( session, view, options ).then( ( result ) => ( {
                ...result,
                grades: configurationLoader.evaluationGrade.properties
            } ) );
        } else if ( view === "load-evaluation" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            const evaluationID = String( options?.query?.evaluationID || "" ).trim();
            return this.#loadEvaluation( session, employeeID, evaluationID );
        } else {
            return super.processDataRequest( session, view, options );
        }
    }

    /**
     * Used to process an application service request.
     *
     * @method
     * @param {Object} session
     * @param {string} service
     * @param {Object} params
     * @returns {Promise<Object>}
     * @override
     * @public
     */
    processServiceRequest( session, service, params ) {
        if ( service === "save-evaluation-draft" ) {
            return this.#saveEvaluationDraft( session, params.evaluation );
        } else if ( service === "submit-evaluation" ) {
            return this.#submitEvaluation( session, params.evaluation );
        } else if ( service === "start-evaluation" ) {
            return this.#startEvaluation( session, params.employeeID );
        } else {
            return super.processServiceRequest( session, service, params );
        }
    }

    /* Private interface */

    /**
     * Used to submit the evaluation.
     *
     * @param {Object} session
     * @param {Evaluation} evaluation
     * @returns {Promise<Evaluation>}
     * @throws {TiException.E_SEC_UNAUTHORIZED_ACCESS} If the user is not authorized to perform the operation.
     * @throws {TiException.E_APP_SERVICE_ERROR} If there is a business logic error during the operation. See the exception details for more information.
     * @private
     */
    #submitEvaluation( session, evaluation ) {
        return new Promise( ( resolve, reject ) => {
            const userID = session?.user?.employeeID;
            if ( !userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }

            let existingEvaluation = null;
            let isEmployee = false;
            let isManager = false;
            let isTeamMember = false;
            dataManager.instance.fetchEvaluation( evaluation.evaluationID ).then( ( storedEvaluation ) => {
                existingEvaluation = storedEvaluation;
                isEmployee = existingEvaluation.employeeID === userID;
                isTeamMember = Array.isArray( existingEvaluation.workflow?.team ) && existingEvaluation.workflow.team.includes( userID ) && !isEmployee;

                return this.#canManagerModifyEvaluation( userID, existingEvaluation );
            } ).then( ( isManagerResult ) => {
                isManager = isManagerResult;
                const today = new Date().toISOString().split( "T" )[ 0 ];

                if ( isEmployee ) {
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.OPEN ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-submit-status-open" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.selfEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-self-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.selfEvaluationDeadline && today > existingEvaluation.workflow.selfEvaluationDeadline ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.deadline-over-self-evaluation" }, exceptions.httpCode.C_422 );
                    }

                    if ( evaluation.comment !== undefined ) {
                        existingEvaluation.comment = evaluation.comment;
                    }
                    this.#updateSelfEvaluationGrades( existingEvaluation, evaluation.grades );

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.employee ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    existingEvaluation.workflow.selfEvaluationCompleted = true;
                } else if ( isTeamMember ) {
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.OPEN ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-submit-status-open" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.teamEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-team-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.teamEvaluationDeadline && today > existingEvaluation.workflow.teamEvaluationDeadline ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.deadline-over-team-evaluation" }, exceptions.httpCode.C_422 );
                    }

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.team ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    this.#updateTeamEvaluationGrades( existingEvaluation, evaluation.grades );

                    if ( evaluation.feedback && evaluation.feedback.teamComments ) {
                        existingEvaluation.feedback = existingEvaluation.feedback || {};
                        existingEvaluation.feedback.teamComments = existingEvaluation.feedback.teamComments || [];
                        const comments = evaluation.feedback.teamComments;
                        if ( Array.isArray( comments ) ) {
                            existingEvaluation.feedback.teamComments.push( ...comments );
                        } else if ( typeof comments === "string" && comments.trim() ) {
                            existingEvaluation.feedback.teamComments.push( comments );
                        }
                    }

                    existingEvaluation.workflow.teamEvaluationsSubmitted = ( existingEvaluation.workflow.teamEvaluationsSubmitted || 0 ) + 1;
                    existingEvaluation.workflow.team = existingEvaluation.workflow.team.filter( ( id ) => id !== userID );

                    if ( existingEvaluation.workflow.team.length === 0 ) {
                        existingEvaluation.workflow.teamEvaluationCompleted = true;
                        this.#calculateTeamCumulativeGrades( existingEvaluation );
                    }
                } else if ( isManager ) {
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.IN_REVIEW ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-submit-status-in-review" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.managerEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-manager-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.managerEvaluationDeadline && today > existingEvaluation.workflow.managerEvaluationDeadline ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.deadline-over-manager-evaluation" }, exceptions.httpCode.C_422 );
                    }

                    if ( evaluation.feedback && evaluation.feedback.managerComment !== undefined ) {
                        existingEvaluation.feedback = existingEvaluation.feedback || {};
                        existingEvaluation.feedback.managerComment = evaluation.feedback.managerComment;
                    }

                    this.#updateManagerEvaluationGrades( existingEvaluation, evaluation.grades );

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.manager ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    existingEvaluation.workflow.managerEvaluationCompleted = true;
                    existingEvaluation.status = configurationLoader.evaluationStatus.READY;
                } else {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                }

                if ( existingEvaluation.status === configurationLoader.evaluationStatus.OPEN ) {
                    const teamDone = existingEvaluation.workflow.teamEvaluationCompleted
                        || ( !existingEvaluation.workflow.team || existingEvaluation.workflow.team.length === 0 );
                    if ( existingEvaluation.workflow.selfEvaluationCompleted && teamDone ) {
                        existingEvaluation.status = configurationLoader.evaluationStatus.IN_REVIEW;
                    }
                }

                // TODO: Make sure to update the 'currentStep' of the workflow accordingly (graph implementation needed first).

                return dataManager.instance.saveEvaluation( existingEvaluation );
            } ).then( ( savedEvaluation ) => {
                let userRole;
                if ( isTeamMember ) {
                    userRole = configurationLoader.roleCode.TEAM_MEMBER;
                } else if ( isEmployee ) {
                    userRole = configurationLoader.roleCode.EMPLOYEE;
                } else if ( isManager ) {
                    userRole = configurationLoader.roleCode.MANAGER;
                }

                // NOTE: Remove information that should not be exposed to some roles:
                this.#anonymizeEvaluationGrades( savedEvaluation, userRole );

                // NOTE: Make sure to delete the workflow system information:
                delete savedEvaluation.workflow;

                resolve( savedEvaluation );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to save a draft of the evaluation.
     *
     * @method
     * @param {Object} session
     * @param {Evaluation} evaluation
     * @returns {Promise<Evaluation>}
     * @throws {TiException.E_SEC_UNAUTHORIZED_ACCESS} If the user is not authorized to perform the operation.
     * @throws {TiException.E_APP_SERVICE_ERROR} If there is a business logic error during the operation. See the exception details for more information.
     * @private
     */
    #saveEvaluationDraft( session, evaluation ) {
        return new Promise( ( resolve, reject ) => {
            const userID = session?.user?.employeeID;
            if ( !userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }

            let existingEvaluation = null;
            let isEmployee = false;
            let isManager = false;
            dataManager.instance.fetchEvaluation( evaluation.evaluationID ).then( ( storedEvaluation ) => {
                isEmployee = storedEvaluation.employeeID === userID;
                existingEvaluation = storedEvaluation;

                return this.#canManagerModifyEvaluation( userID, existingEvaluation );
            } ).then( ( isManagerResult ) => {
                isManager = isManagerResult;
                const today = new Date().toISOString().split( "T" )[ 0 ];

                if ( isEmployee ) {
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.OPEN ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-draft-status-open" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.selfEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-self-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow?.selfEvaluationDeadline && today > existingEvaluation.workflow.selfEvaluationDeadline ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.deadline-over-self-evaluation" }, exceptions.httpCode.C_422 );
                    }

                    if ( evaluation.comment !== undefined ) {
                        existingEvaluation.comment = evaluation.comment;
                    }
                    this.#updateSelfEvaluationGrades( existingEvaluation, evaluation.grades );
                } else if ( isManager ) {
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.IN_REVIEW ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-draft-status-in-review" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.managerEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-manager-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow?.managerEvaluationDeadline && today > existingEvaluation.workflow.managerEvaluationDeadline ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.deadline-over-manager-evaluation" }, exceptions.httpCode.C_422 );
                    }

                    if ( evaluation.feedback && evaluation.feedback.managerComment !== undefined ) {
                        existingEvaluation.feedback = existingEvaluation.feedback || {};
                        existingEvaluation.feedback.managerComment = evaluation.feedback.managerComment;
                    }

                    this.#updateManagerEvaluationGrades( existingEvaluation, evaluation.grades );
                } else {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.no-draft-saving-possible" }, exceptions.httpCode.C_422 );
                }

                return dataManager.instance.saveEvaluation( existingEvaluation );
            } ).then( ( savedEvaluation ) => {
                let userRole;
                if ( isEmployee ) {
                    userRole = configurationLoader.roleCode.EMPLOYEE;
                } else if ( isManager ) {
                    userRole = configurationLoader.roleCode.MANAGER;
                }

                // NOTE: Remove information that should not be exposed to some roles:
                this.#anonymizeEvaluationGrades( savedEvaluation, userRole );

                // NOTE: Make sure to delete the workflow system information:
                delete savedEvaluation.workflow;

                resolve( savedEvaluation );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to load the data for the competence evaluation form for a specific employee.
     *
     * @method
     * @param {Object} session
     * @param {string} employeeID
     * @param {string|null} [evaluationID] Optional evaluation ID to load. If not provided, the most recent valid evaluation will be loaded.
     * @returns {Promise<Object>}
     * @private
     */
    #loadEvaluation( session, employeeID, evaluationID = null ) {
        return new Promise( ( resolve, reject ) => {
            const userID = session?.user?.employeeID;
            if ( !userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }

            let currentEvaluation = null;
            let employee = null;
            let isEmployee = false;
            let isTeamMember = false;
            dataManager.instance.fetchEmployee( employeeID ).then( ( employeeData ) => {
                if ( !employeeData ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 );
                }

                employee = employeeData;
                return dataManager.instance.fetchEvaluations( employee.employeeID );
            } ).then( ( evaluations ) => {
                // Load the current evaluation - either by the specified evaluation ID or by the most recent evaluation in the list:
                if ( evaluationID ) {
                    currentEvaluation = evaluations.find( ( evaluation ) => evaluation.evaluationID === evaluationID );
                    if ( !currentEvaluation ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluationID: evaluationID } );
                    }
                } else if ( evaluations.length > 0 ) {
                    currentEvaluation = evaluations.slice().sort( ( a, b ) => new Date( b.cycleDate ) - new Date( a.cycleDate ) )[ 0 ];
                } else {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-evaluation-found" }, exceptions.httpCode.C_404 );
                }

                if ( currentEvaluation.status === configurationLoader.evaluationStatus.CLOSED ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.status-is-closed" }, exceptions.httpCode.C_422 );
                }

                isEmployee = currentEvaluation.employeeID === userID && session?.user?.roles?.includes( configurationLoader.roleCode.EMPLOYEE );
                isTeamMember = Array.isArray( currentEvaluation.workflow?.team ) && currentEvaluation.workflow.team.includes( userID ) && !isEmployee;

                return this.#canManagerModifyEvaluation( userID, currentEvaluation );
            } ).then( ( isManager ) => {
                let userRole;
                let canEdit;
                let deadlineDate;
                const today = new Date().toISOString().split( "T" )[ 0 ];
                if ( isTeamMember ) {
                    userRole = configurationLoader.roleCode.TEAM_MEMBER;
                    deadlineDate = currentEvaluation.workflow.teamEvaluationDeadline;
                    canEdit = !currentEvaluation.workflow.teamEvaluationCompleted
                        && currentEvaluation.status === configurationLoader.evaluationStatus.OPEN
                        && ( !deadlineDate || today <= deadlineDate );
                } else if ( isEmployee ) {
                    userRole = configurationLoader.roleCode.EMPLOYEE;
                    deadlineDate = currentEvaluation.workflow.selfEvaluationDeadline;
                    canEdit = !currentEvaluation.workflow.selfEvaluationCompleted
                        && currentEvaluation.status === configurationLoader.evaluationStatus.OPEN
                        && ( !deadlineDate || today <= deadlineDate );
                } else if ( isManager ) {
                    userRole = configurationLoader.roleCode.MANAGER;
                    deadlineDate = currentEvaluation.workflow.managerEvaluationDeadline;
                    canEdit = !currentEvaluation.workflow.managerEvaluationCompleted
                        && currentEvaluation.status === configurationLoader.evaluationStatus.IN_REVIEW
                        && ( !deadlineDate || today <= deadlineDate );
                } else {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                }

                // NOTE: Remove information that should not be exposed to some roles:
                this.#anonymizeEvaluationGrades( currentEvaluation, userRole );

                // NOTE: Make sure to delete the workflow system information:
                delete currentEvaluation.workflow;

                const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee );
                resolve( {
                    employeeID: employeeID,
                    personal: {
                        ...employee.personal,
                        organizationUnitName: organizationContext.organizationUnitName,
                        positionName: configurationLoader.organizationPositionCode.name( employee.personal?.position )
                    },
                    manager: {
                        managerID: organizationContext.managerID,
                        name: organizationContext.managerName
                    },
                    evaluation: currentEvaluation,
                    userRole: userRole,
                    deadlineDate: deadlineDate,
                    canEdit: canEdit, // Used only for UI visualization purposes - do NOT rely on this!
                    competencies: this.#buildCompetenciesTree(
                        configurationLoader.configCompetencies,
                        session?.language,
                        this.#getAllowedCompetencyCodes( employee.personal.position, currentEvaluation.cycleID )
                    )
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to start a new evaluation for an employee.
     *
     * @method
     * @param {Object} session
     * @param {string} employeeID
     * @returns {Promise<string>} Return the evaluationID of the newly created evaluation.
     * @private
     */
    #startEvaluation( session, employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const userID = session?.user?.employeeID;
            if ( !userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }

            const isSupervisor = Array.isArray( session?.user?.roles ) && session.user.roles.includes( configurationLoader.roleCode.SUPERVISOR );
            let resolvedManagerID;

            dataManager.instance.fetchEmployee( employeeID ).then( ( employee ) => {
                if ( !employee ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 );
                }

                resolvedManagerID = organizationManager.instance.resolveManagerIDForEmployee( employee );
                const isManager = ( resolvedManagerID === userID );

                if ( !isSupervisor && !isManager ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                }

                return Promise.all( [ Promise.resolve( employee ), dataManager.instance.fetchEvaluations( employeeID ) ] );
            } ).then( ( [ employee, evaluations ] ) => {
                const activeStatuses = [
                    configurationLoader.evaluationStatus.OPEN,
                    configurationLoader.evaluationStatus.IN_REVIEW,
                    configurationLoader.evaluationStatus.READY
                ];
                const hasActiveEvaluation = ( evaluations || [] ).some( ( evaluation ) => activeStatuses.includes( evaluation.status ) );

                if ( hasActiveEvaluation ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.active-evaluation-exists" }, exceptions.httpCode.C_409 );
                }

                const newEvaluation = this.#createNewEvaluation( employeeID );
                if ( resolvedManagerID ) {
                    newEvaluation.managerID = resolvedManagerID;
                }

                // Populate the competencies based on the employee position and the role configuration:
                for ( const competencyCode of this.#getAllowedCompetencyCodes( employee.personal.position, newEvaluation.cycleID ) ) {
                    newEvaluation.grades[ competencyCode ] = this.#normalizeGrades( newEvaluation.grades, competencyCode );
                }

                return dataManager.instance.saveEvaluation( newEvaluation );
            } ).then( ( savedEvaluation ) => {
                resolve( savedEvaluation.evaluationID );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to get the allowed competency codes for the provided position and evaluation cycle.
     *
     * @method
     * @param {string} positionKey
     * @param {string} cycleID
     * @returns {Array<string>} Will be empty if no competencies are allowed for the provided criteria.
     * @private
     */
    #getAllowedCompetencyCodes( positionKey, cycleID ) {
        let allowedCompetencyCodes = [];
        if ( positionKey ) {
            const positionCompetencies = configurationLoader.configEvaluationPositionCompetencies || {};
            const positionEntry = Object.prototype.hasOwnProperty.call( positionCompetencies, positionKey )
                ? positionCompetencies[ positionKey ]
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
     * @private
     */
    #buildCompetenciesTree( competenceConfig, language, allowedCompetencyCodes = null ) {
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

    /**
     * Used to calculate the cumulative grades for the team evaluation.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @private
     */
    #calculateTeamCumulativeGrades( evaluation ) {
        if ( evaluation.grades ) {
            Object.values( evaluation.grades ).forEach( ( gradeEntry ) => {
                if ( gradeEntry.team && gradeEntry.team.individual && gradeEntry.team.individual.length > 0 ) {
                    let sum = 0;
                    let count = 0;
                    gradeEntry.team.individual.forEach( ( grade ) => {
                        if ( gradeWeights[ grade ] ) {
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
     * Used to anonymize the evaluation grades based on the user role.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {RoleCodeValue} userRole
     * @private
     */
    #anonymizeEvaluationGrades( evaluation, userRole ) {
        if ( evaluation.grades ) {
            Object.keys( evaluation.grades ).forEach( ( competencyCode ) => {
                if ( userRole === configurationLoader.roleCode.EMPLOYEE ) {
                    delete evaluation.grades[ competencyCode ].manager;
                    delete evaluation.grades[ competencyCode ].team;
                } else if ( userRole === configurationLoader.roleCode.TEAM_MEMBER ) {
                    delete evaluation.grades[ competencyCode ].employee;
                    delete evaluation.grades[ competencyCode ].manager;
                    evaluation.grades[ competencyCode ].team = "";
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
     * Used to update the self-evaluation grades in the evaluation object.
     * <br/>
     * NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {Object.<string, EvaluationGradeEntry>} grades
     * @private
     */
    #updateSelfEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            Object.keys( grades ).forEach( ( competencyCode ) => {
                evaluation.grades[ competencyCode ] = evaluation.grades[ competencyCode ] || {
                    employee: "",
                    manager: "",
                    team: { cumulative: "", individual: [] }
                };
                if ( grades[ competencyCode ]?.employee !== undefined ) {
                    evaluation.grades[ competencyCode ].employee = grades[ competencyCode ].employee;
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
     * @private
     */
    #updateTeamEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            Object.keys( grades ).forEach( ( competencyCode ) => {
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
                    teamEntry.individual.push( submittedGrade );
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
     * @private
     */
    #updateManagerEvaluationGrades( evaluation, grades ) {
        if ( grades ) {
            Object.keys( grades ).forEach( ( competencyCode ) => {
                if ( grades[ competencyCode ]?.manager !== undefined ) {
                    evaluation.grades[ competencyCode ].manager = grades[ competencyCode ].manager;
                }
            } );
        }
    }

    /**
     * Used to create a new Evaluation object.
     *
     * @method
     * @param {string} employeeID
     * @returns {Evaluation}
     * @private
     */
    #createNewEvaluation( employeeID ) {
        return {
            evaluationID: tools.getUUID(),
            employeeID: employeeID,
            cycleID: "2025.H1", // TODO: Get cycleID from current cycle!
            cycleDate: "2025-06-30", // TODO: Get cycleDate from current cycle!
            status: configurationLoader.evaluationStatus.OPEN,
            grades: {},
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
     * Used to normalize the grade data for a specific competency.
     * <br/>
     * NOTE: If the grade data is not present for the specified competency, an empty object will be returned.
     *
     * @method
     * @param {Object.<string, EvaluationGradeEntry>|Object} gradesByCode
     * @param {string} competencyCode
     * @returns {EvaluationGradeEntry}
     * @private
     */
    #normalizeGrades( gradesByCode, competencyCode ) {
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
     * Used to check if the provided user ID is authorized to act as a manager for the evaluation.
     *
     * @method
     * @param {string} managerID
     * @param {Evaluation} evaluation
     * @returns {Promise<boolean>}
     * @private
     */
    #canManagerModifyEvaluation( managerID, evaluation ) {
        return new Promise( ( resolve ) => {
            if ( evaluation.managerID ) {
                resolve( evaluation.managerID === managerID );
            } else {
                dataManager.instance.fetchEmployee( evaluation.employeeID ).then( ( employee ) => {
                    resolve( organizationManager.instance.resolveManagerIDForEmployee( employee ) === managerID );
                } ).catch( () => {
                    resolve( false );
                } );
            }
        } );
    }

}

module.exports = CompetenceWebApplication;