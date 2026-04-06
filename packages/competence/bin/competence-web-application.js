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
const _ = require( "lodash" );
const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const competenceFramework = require( "#competence-framework" );

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
            let grades = {};
            _.forOwn( configurationLoader.evaluationGrade.properties, ( grade, code ) => {
                grades[ code ] = {
                    value: grade.value,
                    name: localization.getLabel( grade.name, session?.language ),
                    description: localization.getLabel( grade.description, session?.language )
                };
            } );

            return super.processDataRequest( session, view, options ).then( ( result ) => ( {
                ...result,
                grades: grades
            } ) );
        } else if ( view === "load-evaluation" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            const evaluationID = String( options?.query?.evaluationID || "" ).trim();
            return this.#loadEvaluation( session, employeeID, evaluationID );
        } else if ( view === "load-employee-list" ) {
            return this.#loadEmployeeList( session );
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

    /**
     * Used to verify whether the current user has access to the requested resource.
     *
     * @method
     * @override
     * @param {TiSession} session
     * @param {*} resource
     * @returns {Promise}
     * @public
     */
    verifyAccess( session, resource ) {
        return Promise.resolve();
    }

    /* Private interface */

    /**
     * Used to load the employee list sorted by organization unit.
     *
     * @method
     * @param {Object} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadEmployeeList( session ) {
        return new Promise( ( resolve, reject ) => {
            const userID = session?.user?.employeeID;
            if ( !userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }

            const userRoles = Array.isArray( session?.user?.roles ) ? session.user.roles : [];
            const userUnitID = organizationManager.instance.resolveOrganizationUnitIDForEmployee( userID );
            if ( !userUnitID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 ) );
            }

            const unitSubtree = organizationManager.instance.getOrganizationUnitSubtree( userUnitID );
            if ( !unitSubtree ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Organization unit '${ userUnitID }' not found.` }, exceptions.httpCode.C_404 ) );
            }

            const isManagerOfCurrentUnit = ( unitSubtree.managerID === userID ) && userRoles.includes( configurationLoader.roleCode.MANAGER );

            const toComparableDate = ( dateValue ) => {
                const date = new Date( String( dateValue || "" ).trim() );
                const time = date.getTime();
                return Number.isFinite( time ) ? time : 0;
            };

            const toUnitManagers = ( unit ) => {
                const managerID = unit?.managerID;
                if ( !managerID ) {
                    return [];
                }

                const managerName = organizationManager.instance.resolveEmployeeName( managerID );
                return [ managerName || managerID ];
            };

            dataManager.instance.fetchEvaluations( null, false ).then( ( evaluations ) => {
                const latestEvaluationByEmployeeID = new Map();

                evaluations.forEach( ( evaluation ) => {
                    const employeeID = evaluation?.employeeID;
                    if ( !employeeID ) {
                        return;
                    }

                    const existing = latestEvaluationByEmployeeID.get( employeeID );
                    if ( !existing || toComparableDate( evaluation?.cycleDate ) > toComparableDate( existing?.cycleDate ) ) {
                        latestEvaluationByEmployeeID.set( employeeID, evaluation );
                    }
                } );

                const toEmployeeEntry = ( employeeNode ) => {
                    if ( !employeeNode ) {
                        return null;
                    }

                    const managerID = organizationManager.instance.resolveManagerIDForEmployee( employeeNode.employeeID, employeeNode.organizationUnitID );
                    const latestEvaluation = latestEvaluationByEmployeeID.get( employeeNode.employeeID ) || null;
                    const canSeePersonalData = ( isManagerOfCurrentUnit || employeeNode.employeeID === userID );

                    let evaluationDate = "";
                    if ( latestEvaluation ) {
                        if ( latestEvaluation.status === configurationLoader.evaluationStatus.OPEN ) {
                            const selfDeadline = latestEvaluation.workflow?.selfEvaluationDeadline || "";
                            const teamDeadline = latestEvaluation.workflow?.teamEvaluationDeadline || "";
                            evaluationDate = selfDeadline > teamDeadline ? selfDeadline : teamDeadline;
                        } else if ( latestEvaluation.status === configurationLoader.evaluationStatus.IN_REVIEW ) {
                            evaluationDate = latestEvaluation.workflow?.managerEvaluationDeadline || "";
                        } else if ( latestEvaluation.status === configurationLoader.evaluationStatus.READY ) {
                            evaluationDate = latestEvaluation.interviewDate || "";
                        }
                    }

                    return {
                        id: employeeNode.employeeID,
                        name: employeeNode.name,
                        isCurrentUser: employeeNode.employeeID === userID,
                        organizationUnitID: employeeNode.organizationUnitID,
                        career: {
                            careerPath: employeeNode.careerPath,
                            careerPathName: configurationLoader.careerPathCode.name( employeeNode.careerPath ) || employeeNode.careerPath,
                            level: employeeNode.level,
                            stage: canSeePersonalData ? employeeNode.stage : null,
                            startingDate: canSeePersonalData ? employeeNode.startingDate : null
                        },
                        manager: {
                            managerID: managerID,
                            name: organizationManager.instance.resolveEmployeeName( managerID )
                        },
                        evaluation: ( canSeePersonalData && latestEvaluation ) ? {
                            evaluationID: latestEvaluation.evaluationID,
                            status: latestEvaluation.status,
                            date: evaluationDate
                        } : null
                    };
                };

                const toUnitEntry = ( unitNode ) => {
                    if ( !unitNode ) {
                        return null;
                    }

                    return {
                        id: unitNode.id,
                        type: unitNode.type,
                        name: unitNode.name,
                        description: unitNode.description,
                        managers: toUnitManagers( unitNode ),
                        employees: ( Array.isArray( unitNode.employees ) ? unitNode.employees : [] ).map( toEmployeeEntry ),
                        parents: organizationManager.instance.resolveParentUnitNames( unitNode.id ),
                        children: ( Array.isArray( unitNode.children ) ? unitNode.children : [] ).map( toUnitEntry )
                    };
                };

                resolve( {
                    organizationUnits: [ toUnitEntry( unitSubtree ) ],
                    isManagerView: isManagerOfCurrentUnit
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

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

                return this.#canManagerPerformEvaluation( userID, existingEvaluation.employeeID );
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
                    competenceFramework.instance.updateSelfEvaluationGrades( existingEvaluation, evaluation.grades );

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

                    const isCollective = configurationLoader.getSetting( "performanceAppraisals.isTeamEvaluationCollective" );
                    if ( isCollective ) {
                        const submittedGrades = evaluation.grades || {};
                        evaluation.grades = {};
                        const competencies = configurationLoader.configCompetencies?.competencies || {};
                        Object.keys( existingEvaluation.grades || {} ).forEach( ( competencyCode ) => {
                            const competency = competencies[ competencyCode ];
                            if ( competency && competency.subcategory ) {
                                evaluation.grades[ competencyCode ] = { team: submittedGrades[ competency.subcategory ]?.team || null };
                            }
                        } );
                    }

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.team ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    competenceFramework.instance.updateTeamEvaluationGrades( existingEvaluation, evaluation.grades );

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
                        competenceFramework.instance.calculateTeamCumulativeGrades( existingEvaluation );
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

                    competenceFramework.instance.updateManagerEvaluationGrades( existingEvaluation, evaluation.grades );

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.manager ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    existingEvaluation.workflow.managerEvaluationCompleted = true;
                    existingEvaluation.status = configurationLoader.evaluationStatus.READY;

                    // At this point calculate the performance scores:
                    competenceFramework.instance.calculateFinalEvaluationScores( existingEvaluation );
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
                competenceFramework.instance.anonymizeEvaluationGrades( savedEvaluation, userRole );
                competenceFramework.instance.anonymizeEvaluationScores( savedEvaluation, userRole );

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

                return this.#canManagerPerformEvaluation( userID, existingEvaluation.employeeID );
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
                    competenceFramework.instance.updateSelfEvaluationGrades( existingEvaluation, evaluation.grades );
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

                    competenceFramework.instance.updateManagerEvaluationGrades( existingEvaluation, evaluation.grades );
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
                competenceFramework.instance.anonymizeEvaluationGrades( savedEvaluation, userRole );
                competenceFramework.instance.anonymizeEvaluationScores( savedEvaluation, userRole );

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

                return this.#canManagerPerformEvaluation( userID, currentEvaluation.employeeID );
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
                competenceFramework.instance.anonymizeEvaluationGrades( currentEvaluation, userRole );
                competenceFramework.instance.anonymizeEvaluationScores( currentEvaluation, userRole );

                // NOTE: Make sure to delete the workflow system information:
                delete currentEvaluation.workflow;

                const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee );
                resolve( {
                    employeeID: employeeID,
                    personal: {
                        ...employee.personal,
                        organizationUnitName: organizationContext.organizationUnitName,
                        positionName: configurationLoader.careerPathCode.name( employee.personal?.careerPath )
                    },
                    manager: {
                        managerID: organizationContext.managerID,
                        name: organizationContext.managerName
                    },
                    evaluation: {
                        ...currentEvaluation,
                        careerPathName: configurationLoader.careerPathCode.name( currentEvaluation.careerPath )
                    },
                    userRole: userRole,
                    deadlineDate: deadlineDate,
                    canEdit: canEdit, // Used only for UI visualization purposes - do NOT rely on this!
                    isTeamEvaluationCollective: configurationLoader.getSetting( "performanceAppraisals.isTeamEvaluationCollective" ),
                    competencies: competenceFramework.instance.buildCompetenciesTree(
                        configurationLoader.configCompetencies,
                        session?.language,
                        competenceFramework.instance.getAllowedCompetencyCodes( employee.personal.careerPath, currentEvaluation.cycleID )
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
            let employee;

            dataManager.instance.fetchEmployee( employeeID ).then( ( result ) => {
                if ( !result ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 );
                }
                employee = result;

                return this.#canManagerPerformEvaluation( userID, employee.employeeID );
            } ).then( ( isManager ) => {
                if ( !isSupervisor && !isManager ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                }

                return dataManager.instance.fetchEvaluations( employee.employeeID );
            } ).then( ( evaluations ) => {
                const activeStatuses = [
                    configurationLoader.evaluationStatus.OPEN,
                    configurationLoader.evaluationStatus.IN_REVIEW,
                    configurationLoader.evaluationStatus.READY
                ];
                const hasActiveEvaluation = ( evaluations || [] ).some( ( evaluation ) => activeStatuses.includes( evaluation.status ) );

                if ( hasActiveEvaluation ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.active-evaluation-exists" }, exceptions.httpCode.C_409 );
                }

                const newEvaluation = competenceFramework.instance.createNewEvaluation( employee );
                const resolvedManagerID = organizationManager.instance.resolveManagerIDForEmployee( employee.employeeID, employee.personal?.organizationUnitID );
                if ( resolvedManagerID ) {
                    newEvaluation.managerID = resolvedManagerID;
                }

                // Populate the competencies based on the employee career path and the role configuration:
                for ( const competencyCode of competenceFramework.instance.getAllowedCompetencyCodes( employee.personal.careerPath, newEvaluation.cycleID ) ) {
                    newEvaluation.grades[ competencyCode ] = competenceFramework.instance.normalizeGrades( newEvaluation.grades, competencyCode );
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
     * Used to check if the provided user ID is authorized to act as a manager for the evaluation.
     *
     * @method
     * @param {string} managerID
     * @param {string} employeeID
     * @returns {Promise<boolean>}
     * @private
     */
    #canManagerPerformEvaluation( managerID, employeeID ) {
        return Promise.resolve( organizationManager.instance.isSuperiorManagerOfEmployee( managerID, employeeID ) );
    }

}

module.exports = CompetenceWebApplication;