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
const { registerCompetenceConfig } = require( "../application/config-registration" );

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

        // Register competence's editable configuration documents with the framework admin config registry/service.
        registerCompetenceConfig( this );

        this.addFragment( "competence-evaluation", {
            title: "Competence Evaluation",
            path: "fragments/frame-competence-evaluation.html",
            components: [ "component-tooltip" ]
        } );
        this.addFragment( "employees-list", {
            title: "Employees List",
            path: "fragments/frame-employees-list.html"
        } );
        this.addFragment( "new-evaluation", {
            title: "New Competence Evaluation",
            path: "fragments/frame-new-evaluation.html"
        } );
        this.addFragment( "manager-calendar", {
            title: "My Availability Calendar",
            path: "fragments/frame-manager-calendar.html"
        } );
        this.addFragment( "interview-schedule", {
            title: "Interview Schedule",
            path: "fragments/frame-interview-schedule.html"
        } );
        this.addFragment( "cycles", {
            title: "Appraisal Cycles",
            path: "fragments/frame-cycles.html"
        } );
        this.addFragment( "cycle-setup", {
            title: "Cycle Setup",
            path: "fragments/frame-cycle-setup.html"
        } );
        this.addFragment( "employee-management", {
            title: "Employee Management",
            path: "fragments/frame-employee-management.html"
        } );
        this.addFragment( "admin-config", {
            title: "Configuration",
            path: "fragments/frame-admin-config.html"
        } );
        this.addFragment( "competency-text-editor", {
            title: "Competency Texts",
            path: "fragments/frame-competency-text-editor.html"
        } );
        this.addFragment( "archetype-assignment", {
            title: "Archetype Assignment",
            path: "fragments/frame-archetype-assignment.html"
        } );
        this.addFragment( "archetype-editor", {
            title: "Relevancy Archetypes",
            path: "fragments/frame-archetype-editor.html"
        } );
        this.addFragment( "role-families", {
            title: "Role Families",
            path: "fragments/frame-role-families.html"
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
        return super.transformHtml( html, { ...options, title: options.title || "Competence" } );
    }

    /**
     * Used to process a request for a data resource.
     *
     * @method
     * @param {TiSession} session
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

            return Promise.all( [
                super.processDataRequest( session, view, options ),
                this.#resolveCurrentCycle()
            ] ).then( ( [ result, currentCycle ] ) => ( {
                ...result,
                grades: grades,
                cycle: currentCycle ? {
                    id: currentCycle.cycleID,
                    name: currentCycle.name,
                    status: currentCycle.status,
                    startDate: currentCycle.cycleStart,
                    date: currentCycle.cycleDate,
                    endDate: currentCycle.cycleEnd
                } : null,
                employeeLevel: this.#resolveSessionEmployeeLevel( session ),
                sidebarNavMapping: {
                    "dashboard": "dashboard",
                    "employees-list": "employees",
                    "competence-evaluation": "evaluation",
                    "new-evaluation": "evaluation",
                    "manager-calendar": "calendar",
                    "interview-schedule": "interviews",
                    "cycles": "cycles",
                    "cycle-setup": "cycles",
                    "employee-management": "employee-management",
                    "admin-config": "administration",
                    "competency-text-editor": "administration",
                    "archetype-assignment": "administration",
                    "archetype-editor": "administration",
                    "role-families": "administration"
                },
                componentsConfig: {
                    userProfileMenu: {
                        menuTitle: localization.getLabel( "interface.topbar.user-profile", session?.language ),
                        placement: "right-end",
                        offset: 0,
                        buttonConfigs: [ {
                            title: localization.getLabel( "interface.user-menu.profile", session?.language ),
                            icon: "user-profile",
                            action: {
                                href: "/app/profile",
                                target: "#ti-content",
                                swap: "innerHTML"
                            }
                        }, {
                            title: localization.getLabel( "interface.user-menu.settings", session?.language ),
                            icon: "settings",
                            action: {
                                href: "/app/administration",
                                target: "#ti-content",
                                swap: "innerHTML"
                            }
                        }, {
                            title: localization.getLabel( "interface.user-menu.logout", session?.language ),
                            icon: "logout",
                            action: {
                                href: "/logout",
                                method: "post",
                                target: "body",
                                swap: "outerHTML"
                            }
                        } ]
                    }
                }
            } ) );
        } else if ( view === "load-dashboard" ) {
            return this.#loadDashboard( session );
        } else if ( view === "load-evaluation" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            const evaluationID = String( options?.query?.evaluationID || "" ).trim();
            return this.#loadEvaluation( session, employeeID, evaluationID );
        } else if ( view === "load-employee-list" ) {
            return this.#loadEmployeeList( session );
        } else if ( view === "load-new-evaluation-data" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            return this.#loadNewEvaluationData( session, employeeID );
        } else if ( view === "load-manager-calendar" ) {
            return this.#loadManagerCalendar( session );
        } else if ( view === "load-interview-schedule" ) {
            return this.#loadInterviewSchedule( session );
        } else if ( view === "load-cycle-list" ) {
            return this.#loadCycleList( session );
        } else if ( view === "load-cycle-setup" ) {
            const cycleID = String( options?.query?.cycleID || "" ).trim();
            return this.#loadCycleSetup( session, cycleID );
        } else if ( view === "load-employee-management-list" ) {
            return this.#loadEmployeeManagementList( session );
        } else if ( view === "load-employee-detail" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            return this.#loadEmployeeDetail( session, employeeID );
        } else {
            return super.processDataRequest( session, view, options );
        }
    }

    /**
     * Used to process an application service request.
     *
     * @method
     * @param {TiSession} session
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
            return this.#startEvaluation( session, params.employeeID, params.team );
        } else if ( service === "toggle-calendar-slot" ) {
            return this.#toggleCalendarSlot( session, params );
        } else if ( service === "book-interview-slot" ) {
            return this.#bookInterviewSlot( session, params );
        } else if ( service === "cancel-interview-booking" ) {
            return this.#cancelInterviewBooking( session, params );
        } else if ( service === "create-cycle" ) {
            return this.#createCycle( session, params );
        } else if ( service === "lock-cycle" ) {
            return this.#lockCycle( session, params );
        } else if ( service === "close-cycle" ) {
            return this.#closeCycle( session, params );
        } else if ( service === "set-active-competency-set" ) {
            return this.#setActiveCompetencySet( session, params );
        } else if ( service === "mark-active-set-empty" ) {
            return this.#markActiveSetEmpty( session, params );
        } else if ( service === "clear-active-competency-set" ) {
            return this.#clearActiveCompetencySet( session, params );
        } else if ( service === "create-employee" ) {
            return this.#createEmployee( session, params );
        } else if ( service === "update-employee" ) {
            return this.#updateEmployee( session, params );
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
     * Resolves the cycle that should drive screens with a "current cycle" affordance (dashboard cycle card,
     * calendar window, interview-schedule, etc.). Prefers the single ACTIVE cycle; falls back to the most-recently
     * created cycle (any status) so PLANNING-only environments still render usefully. Returns null when no cycle
     * exists at all.
     *
     * @method
     * @private
     * @returns {Promise<Cycle|null>}
     */
    #resolveCurrentCycle() {
        return dataManager.instance.getActiveCycle().then( ( activeCycle ) => {
            if ( activeCycle ) return activeCycle;
            return dataManager.instance.getAllCycles().then( ( all ) => ( all && all.length > 0 ) ? all[ 0 ] : null );
        } );
    }

    /**
     * Resolves the career attributes (level/stage/role family) for the session user, or null when the session carries
     * no employee identity.
     *
     * @method
     * @private
     * @param {TiSession} session
     * @returns {Object|null}
     */
    #resolveSessionEmployeeLevel( session ) {
        const userID = session && session.user && session.user.employeeID;
        return userID ? organizationManager.instance.resolveEmployeeAttributes( userID, session?.language ) : null;
    }

    /**
     * Builds a display label combining a role family name and (optionally) a specialization name as
     * `<roleFamily> · <specialization>`. Used by handlers that need a single string for read-only displays.
     *
     * @method
     * @private
     * @param {string} roleFamily
     * @param {string|null} specialization
     * @param {TiLocalizationLanguage} [language]
     * @returns {string}
     */
    #formatRoleFamilyLabel( roleFamily, specialization, language ) {
        if ( !roleFamily ) return "";
        const familyName = localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ roleFamily ]?.name || configurationLoader.roleFamilyCode.name( roleFamily ) || roleFamily, language );
        if ( !specialization ) return familyName;
        const specName = localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ roleFamily ]?.specializations?.[ specialization ]?.name || specialization, language );
        return `${ familyName } · ${ specName }`;
    }

    /**
     * Used to load the employee list sorted by organization unit.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadEmployeeList( session ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireSessionUser( session );

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

            Promise.all( [
                dataManager.instance.fetchEvaluations( null, false ),
                // Used purely to gate UI affordances (e.g., the "Start evaluation" button) — the backend's
                // #startEvaluation still independently enforces that creation requires an ACTIVE cycle.
                dataManager.instance.getActiveCycle()
            ] ).then( ( [ evaluations, activeCycle ] ) => {
                const hasActiveCycle = !!( activeCycle && activeCycle.status === configurationLoader.cycleStatus.ACTIVE );
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

                const evalStatusTone = ( status ) => {
                    if ( status === configurationLoader.evaluationStatus.OPEN ) return "info";
                    if ( status === configurationLoader.evaluationStatus.IN_REVIEW ) return "warn";
                    if ( status === configurationLoader.evaluationStatus.READY ) return "success";
                    return "";
                };

                const toEmployeeEntry = ( employeeNode, unitManagerID = null ) => {
                    if ( !employeeNode ) {
                        return null;
                    }

                    const managerID = organizationManager.instance.resolveManagerIDForEmployee( employeeNode.employeeID, employeeNode.organizationUnitID );
                    const latestEvaluation = latestEvaluationByEmployeeID.get( employeeNode.employeeID ) || null;
                    const canSeePersonalData = ( isManagerOfCurrentUnit || employeeNode.employeeID === userID );

                    let evaluationDate = "";
                    let evaluationDateType = "";
                    if ( latestEvaluation ) {
                        if ( latestEvaluation.status === configurationLoader.evaluationStatus.OPEN ) {
                            const selfDeadline = latestEvaluation.workflow?.selfEvaluationDeadline || "";
                            const teamDeadline = latestEvaluation.workflow?.teamEvaluationDeadline || "";
                            evaluationDate = selfDeadline > teamDeadline ? selfDeadline : teamDeadline;
                            evaluationDateType = "due";
                        } else if ( latestEvaluation.status === configurationLoader.evaluationStatus.IN_REVIEW ) {
                            evaluationDate = latestEvaluation.workflow?.managerEvaluationDeadline || "";
                            evaluationDateType = "due";
                        } else if ( latestEvaluation.status === configurationLoader.evaluationStatus.READY ) {
                            evaluationDate = latestEvaluation.interviewDate || "";
                            evaluationDateType = "interview";
                        }
                    }

                    return {
                        id: employeeNode.employeeID,
                        name: employeeNode.name,
                        email: employeeNode.email,
                        isCurrentUser: employeeNode.employeeID === userID,
                        isManager: unitManagerID !== null && unitManagerID === employeeNode.employeeID,
                        organizationUnitID: employeeNode.organizationUnitID,
                        personal: canSeePersonalData ? {
                            workMode: employeeNode.workMode,
                            workLocation: employeeNode.workLocation
                        } : null,
                        career: {
                            roleFamily: employeeNode.roleFamily,
                            specialization: employeeNode.specialization ?? null,
                            roleFamilyName: localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employeeNode.roleFamily ]?.name || configurationLoader.roleFamilyCode.name( employeeNode.roleFamily ) || employeeNode.roleFamily || "", session?.language ),
                            specializationName: employeeNode.specialization
                                ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employeeNode.roleFamily ]?.specializations?.[ employeeNode.specialization ]?.name || employeeNode.specialization, session?.language )
                                : null,
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
                            statusName: configurationLoader.evaluationStatus.name( latestEvaluation.status ),
                            statusTone: evalStatusTone( latestEvaluation.status ),
                            date: evaluationDate,
                            dateType: evaluationDateType
                        } : null,
                        evaluationHidden: !canSeePersonalData
                    };
                };

                const toUnitEntry = ( unitNode ) => {
                    if ( !unitNode ) {
                        return null;
                    }

                    const rawEmployees = Array.isArray( unitNode.employees ) ? unitNode.employees : [];
                    const employees = rawEmployees.map( ( e ) => toEmployeeEntry( e, unitNode.managerID ) );
                    const activeEvalStatuses = [
                        configurationLoader.evaluationStatus.OPEN,
                        configurationLoader.evaluationStatus.IN_REVIEW,
                        configurationLoader.evaluationStatus.READY
                    ];
                    const inCycle = rawEmployees.filter( ( e ) => {
                        const latestEval = latestEvaluationByEmployeeID.get( e.employeeID );
                        return latestEval && activeEvalStatuses.includes( latestEval.status );
                    } ).length;
                    const ready = rawEmployees.filter( ( e ) => {
                        const latestEval = latestEvaluationByEmployeeID.get( e.employeeID );
                        return latestEval && latestEval.status === configurationLoader.evaluationStatus.READY;
                    } ).length;

                    const managerRawEmployee = rawEmployees.find( ( e ) => e.employeeID === unitNode.managerID );
                    const managerWorkLocation = managerRawEmployee ? ( managerRawEmployee.workLocation || null ) : null;

                    return {
                        id: unitNode.id,
                        type: unitNode.type,
                        name: unitNode.name,
                        description: unitNode.description,
                        branch: unitNode.branch || null,
                        location: unitNode.location || null,
                        managerWorkLocation: managerWorkLocation,
                        managers: toUnitManagers( unitNode ),
                        employees: employees,
                        inCycle: inCycle,
                        ready: ready,
                        parents: organizationManager.instance.resolveParentUnitNames( unitNode.id ),
                        children: ( Array.isArray( unitNode.children ) ? unitNode.children : [] ).map( toUnitEntry )
                    };
                };

                resolve( {
                    organizationUnits: [ toUnitEntry( unitSubtree ) ],
                    isManagerView: isManagerOfCurrentUnit,
                    hasActiveCycle: hasActiveCycle
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to submit the evaluation.
     *
     * @param {TiSession} session
     * @param {Evaluation} evaluation
     * @returns {Promise<Evaluation>}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} If the user is not authorized to perform the operation.
     * @exception {TiException.E_APP_SERVICE_ERROR} If there is a business logic error during the operation. See the exception details for more information.
     * @private
     */
    #submitEvaluation( session, evaluation ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireSessionUser( session );

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
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
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
     * @param {TiSession} session
     * @param {Evaluation} evaluation
     * @returns {Promise<Evaluation>}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} If the user is not authorized to perform the operation.
     * @exception {TiException.E_APP_SERVICE_ERROR} If there is a business logic error during the operation. See the exception details for more information.
     * @private
     */
    #saveEvaluationDraft( session, evaluation ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireSessionUser( session );

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
     * @param {TiSession} session
     * @param {string} employeeID
     * @param {string|null} [evaluationID] Optional evaluation ID to load. If not provided, the most recent valid evaluation will be loaded.
     * @returns {Promise<Object>}
     * @private
     */
    #loadEvaluation( session, employeeID, evaluationID = null ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireSessionUser( session );

            // When no employeeID is supplied (e.g., an employee opening their own evaluation),
            // fall back to the session user's own ID so the server can resolve the record.
            const resolvedEmployeeID = employeeID || userID;
            const noEvaluationSentinel = Symbol();

            let currentEvaluation = null;
            let employee = null;
            let isEmployee = false;
            let isTeamMember = false;
            dataManager.instance.fetchEmployee( resolvedEmployeeID ).then( ( employeeData ) => {
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
                    throw noEvaluationSentinel;
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
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
                }

                // NOTE: Remove information that should not be exposed to some roles:
                competenceFramework.instance.anonymizeEvaluationGrades( currentEvaluation, userRole );
                competenceFramework.instance.anonymizeEvaluationScores( currentEvaluation, userRole );

                // Extract team reviewer counts before deleting workflow:
                const teamSubmitted = currentEvaluation.workflow?.teamEvaluationsSubmitted || 0;
                const teamRemaining = Array.isArray( currentEvaluation.workflow?.team ) ? currentEvaluation.workflow.team.length : 0;
                const teamTotal = teamSubmitted + teamRemaining;

                // NOTE: Make sure to delete the workflow system information:
                delete currentEvaluation.workflow;

                const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee );
                resolve( {
                    employeeID: resolvedEmployeeID,
                    personal: {
                        ...employee.personal,
                        name: `${ employee.personal?.firstName || "" } ${ employee.personal?.lastName || "" }`.trim(),
                        organizationUnitName: organizationContext.organizationUnitName,
                        roleFamily: employee.career?.roleFamily,
                        specialization: employee.career?.specialization ?? null,
                        roleFamilyName: localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employee.career?.roleFamily ]?.name || configurationLoader.roleFamilyCode.name( employee.career?.roleFamily ) || employee.career?.roleFamily || "", session?.language ),
                        specializationName: employee.career?.specialization
                            ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employee.career.roleFamily ]?.specializations?.[ employee.career.specialization ]?.name || employee.career.specialization, session?.language )
                            : null,
                        startingDate: employee.career?.startingDate || null,
                        stageLevel: ( employee.career?.level && employee.career?.stage ) ? `${ employee.career.level }${ employee.career.stage }` : ""
                    },
                    manager: {
                        managerID: organizationContext.managerID,
                        name: organizationContext.managerName
                    },
                    evaluation: {
                        ...currentEvaluation,
                        roleFamilyName: localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ currentEvaluation.roleFamily ]?.name || configurationLoader.roleFamilyCode.name( currentEvaluation.roleFamily ) || currentEvaluation.roleFamily || "", session?.language ),
                        specializationName: currentEvaluation.specialization
                            ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ currentEvaluation.roleFamily ]?.specializations?.[ currentEvaluation.specialization ]?.name || currentEvaluation.specialization, session?.language )
                            : null,
                        statusName: configurationLoader.evaluationStatus.name( currentEvaluation.status ),
                        statusDescription: configurationLoader.evaluationStatus.description( currentEvaluation.status )
                    },
                    userRole: userRole,
                    deadlineDate: deadlineDate,
                    teamReviewers: teamTotal > 0 ? { total: teamTotal, submitted: teamSubmitted } : null,
                    canEdit: canEdit, // Used only for UI visualization purposes - do NOT rely on this!
                    isTeamEvaluationCollective: configurationLoader.getSetting( "performanceAppraisals.isTeamEvaluationCollective" ),
                    competencies: competenceFramework.instance.buildCompetenciesTreeFromSnapshot( currentEvaluation.snapshot, session?.language )
                } );
            } ).catch( ( error ) => {
                if ( error === noEvaluationSentinel ) {
                    return resolve( { noEvaluation: true } );
                }
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to start a new evaluation for an employee.
     *
     * @method
     * @param {TiSession} session
     * @param {string} employeeID
     * @param {string[]} [team]
     * @returns {Promise<string>} Return the evaluationID of the newly created evaluation.
     * @private
     */
    #startEvaluation( session, employeeID, team ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireSessionUser( session );
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );
            let employee;

            let cycle;
            dataManager.instance.fetchEmployee( employeeID ).then( ( result ) => {
                if ( !result ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 );
                }
                employee = result;

                return this.#canManagerPerformEvaluation( userID, employee.employeeID );
            } ).then( ( isManager ) => {
                if ( !isSupervisor && !isManager ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
                }

                // Phase 5: starting an evaluation requires a strictly ACTIVE cycle. PLANNING / CLOSED / no cycle at all
                // are all surfaced to the UI as the same "no active appraisal cycle" error, so the action remains
                // disabled in the operator-friendly sense rather than silently snapshotting against a fallback cycle.
                return dataManager.instance.getActiveCycle();
            } ).then( ( activeCycle ) => {
                if ( !activeCycle || activeCycle.status !== configurationLoader.cycleStatus.ACTIVE ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.no-active-cycle" }, exceptions.httpCode.C_422 );
                }
                cycle = activeCycle;
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

                return competenceFramework.instance.buildEvaluationSnapshot( employee.career.roleFamily, employee.career.specialization, cycle.cycleID );
            } ).then( ( snapshot ) => {
                if ( !Array.isArray( snapshot ) || snapshot.length === 0 ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.empty-competency-set" }, exceptions.httpCode.C_422 );
                }

                const newEvaluation = competenceFramework.instance.createNewEvaluation( employee, cycle, snapshot );
                const resolvedManagerID = organizationManager.instance.resolveManagerIDForEmployee( employee.employeeID, employee.career?.organizationUnitID );
                if ( resolvedManagerID ) {
                    newEvaluation.managerID = resolvedManagerID;
                }

                const uniqueTeam = Array.isArray( team )
                    ? [ ...new Set( team.map( String ) ) ].filter( ( id ) => id !== employee.employeeID && id !== resolvedManagerID )
                    : [];

                const invalidIDs = uniqueTeam.filter( ( id ) => !organizationManager.instance.resolveEmployeeName( id ) );
                if ( invalidIDs.length > 0 ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: "error.evaluation.invalid-team-members" } );
                }

                const minTeam = configurationLoader.getSetting( "performanceAppraisals.minTeamEvaluationMembers", 1 );
                const maxTeam = configurationLoader.getSetting( "performanceAppraisals.maxTeamEvaluationMembers", null );
                if ( uniqueTeam.length < minTeam ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.team-below-minimum" }, exceptions.httpCode.C_422 );
                }
                if ( maxTeam !== null && uniqueTeam.length > maxTeam ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.team-above-maximum" }, exceptions.httpCode.C_422 );
                }

                newEvaluation.workflow.team = uniqueTeam;

                return dataManager.instance.saveEvaluation( newEvaluation );
            } ).then( ( savedEvaluation ) => {
                resolve( savedEvaluation.evaluationID );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to load the data for the new evaluation screen.
     *
     * @method
     * @param {TiSession} session
     * @param {string} employeeID
     * @returns {Promise<Object>}
     * @private
     */
    #loadNewEvaluationData( session, employeeID ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR, configurationLoader.roleCode.MANAGER );

            let employee;
            let cycle;
            dataManager.instance.fetchEmployee( employeeID ).then( ( employeeData ) => {
                if ( !employeeData ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.evaluation.no-employee-found" }, exceptions.httpCode.C_404 );
                }
                employee = employeeData;
                return Promise.all( [
                    dataManager.instance.fetchEmployees(),
                    // Mirrors #startEvaluation: the new-evaluation preview only makes sense against a strictly ACTIVE
                    // cycle so the user does not populate a form they cannot actually submit.
                    dataManager.instance.getActiveCycle()
                ] );
            } ).then( ( [ allEmployees, resolvedCycle ] ) => {
                if ( !resolvedCycle || resolvedCycle.status !== configurationLoader.cycleStatus.ACTIVE ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.no-active-cycle" }, exceptions.httpCode.C_422 );
                }
                cycle = resolvedCycle;

                const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee );
                const availableTeamMembers = [];
                allEmployees.forEach( ( currentEmployee ) => {
                    if ( currentEmployee.employeeID !== employeeID && currentEmployee.employeeID !== organizationContext.managerID ) {
                        const firstName = currentEmployee.personal.firstName || "";
                        const lastName = currentEmployee.personal.lastName || "";
                        availableTeamMembers.push( {
                            employeeID: currentEmployee.employeeID,
                            name: `${ firstName } ${ lastName }`.trim(),
                            roleFamilyName: this.#formatRoleFamilyLabel( currentEmployee.career?.roleFamily, currentEmployee.career?.specialization, session?.language )
                        } );
                    }
                } );

                return competenceFramework.instance.getActiveCompetencySet( employee.career.roleFamily, employee.career.specialization, cycle.cycleID ).then( ( allowedCodes ) => {
                    const allCompetencies = configurationLoader.configCompetencies?.competencies || {};
                    const competencyCategories = new Set();
                    let competencyCount = 0;
                    allowedCodes.forEach( ( code ) => {
                        const comp = allCompetencies[ code ];
                        if ( comp && comp.category ) {
                            competencyCategories.add( comp.category );
                            competencyCount++;
                        }
                    } );

                    resolve( {
                        personal: {
                            id: employeeID,
                            ...employee.personal,
                            name: `${ employee.personal?.firstName || "" } ${ employee.personal?.lastName || "" }`.trim(),
                            organizationUnitName: organizationContext.organizationUnitName,
                            startingDate: employee.career?.startingDate || null
                        },
                        manager: {
                            managerID: organizationContext.managerID,
                            name: organizationContext.managerName
                        },
                        evaluation: {
                            cycleID: cycle.cycleID,
                            cycleDate: cycle.cycleDate,
                            cycleEndDate: cycle.cycleEnd,
                            roleFamily: employee.career.roleFamily,
                            specialization: employee.career.specialization ?? null,
                            roleFamilyName: localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employee.career.roleFamily ]?.name || configurationLoader.roleFamilyCode.name( employee.career.roleFamily ) || employee.career.roleFamily || "", session?.language ),
                            specializationName: employee.career.specialization
                                ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ employee.career.roleFamily ]?.specializations?.[ employee.career.specialization ]?.name || employee.career.specialization, session?.language )
                                : null,
                            stageLevel: `${ employee.career.level }${ employee.career.stage }`,
                            competencyCount: competencyCount,
                            categoryCount: competencyCategories.size
                        },
                        minTeamMembers: configurationLoader.getSetting( "performanceAppraisals.minTeamEvaluationMembers", 1 ),
                        maxTeamMembers: configurationLoader.getSetting( "performanceAppraisals.maxTeamEvaluationMembers", null ),
                        availableTeamMembers: availableTeamMembers
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to load the manager's availability calendar for the current cycle.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadManagerCalendar( session ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.MANAGER );

            const calendarConfig = this.#getCalendarConfig();

            this.#resolveCurrentCycle().then( ( cycle ) => {
                if ( !cycle ) {
                    return resolve( { cycleID: null, cycleDate: null, managerID: userID, slots: [], config: calendarConfig } );
                }
                return dataManager.instance.fetchManagerCalendar( cycle.cycleID, userID ).then( ( slots ) => {
                    resolve( {
                        cycleID: cycle.cycleID,
                        cycleDate: cycle.cycleDate,
                        managerID: userID,
                        slots: slots,
                        config: calendarConfig
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to load all READY evaluations and available calendar slots for the supervisor scheduling view.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadInterviewSchedule( session ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR, configurationLoader.roleCode.MANAGER );

            const calendarConfig = this.#getCalendarConfig();

            this.#resolveCurrentCycle().then( ( cycle ) => {
                if ( !cycle ) {
                    return resolve( { cycleID: null, evaluations: [], slots: [], config: calendarConfig } );
                }
                return Promise.all( [
                    dataManager.instance.fetchEvaluations( null, false ),
                    dataManager.instance.fetchAllCalendarSlots( cycle.cycleID )
                ] ).then( ( [ allEvaluations, allSlots ] ) => {
                    const readyStatus = configurationLoader.evaluationStatus.READY;
                    const readyEvaluations = allEvaluations.filter( ( evaluation ) => evaluation.status === readyStatus );

                    const bookedSlotByEvaluationID = new Map();
                    allSlots.forEach( ( slot ) => {
                        if ( slot.status === configurationLoader.slotStatus.BOOKED && slot.booking?.evaluationID ) {
                            bookedSlotByEvaluationID.set( slot.booking.evaluationID, slot );
                        }
                    } );

                    const evaluations = readyEvaluations.map( ( evaluation ) => {
                        const bookedSlot = bookedSlotByEvaluationID.get( evaluation.evaluationID ) || null;
                        return {
                            evaluationID: evaluation.evaluationID,
                            shortID: evaluation.shortID,
                            employeeID: evaluation.employeeID,
                            employeeName: organizationManager.instance.resolveEmployeeName( evaluation.employeeID ) || evaluation.employeeID,
                            managerID: evaluation.managerID,
                            managerName: organizationManager.instance.resolveEmployeeName( evaluation.managerID ) || evaluation.managerID,
                            roleFamilyName: this.#formatRoleFamilyLabel( evaluation.roleFamily, evaluation.specialization, session?.language ),
                            stageLevel: evaluation.stageLevel || "",
                            finalScore: evaluation.finalScore?.score ?? null,
                            finalScoreGrade: configurationLoader.performanceThreshold.name( evaluation.finalScore?.interpretation ) || "",
                            interviewDate: evaluation.interviewDate || null,
                            bookedSlotID: bookedSlot ? bookedSlot.slotID : null
                        };
                    } );

                    const slots = allSlots
                        .filter( ( slot ) => slot.status === configurationLoader.slotStatus.AVAILABLE )
                        .map( ( slot ) => ( {
                            ...slot,
                            managerName: organizationManager.instance.resolveEmployeeName( slot.managerID ) || slot.managerID
                        } ) );

                    resolve( {
                        cycleID: cycle.cycleID,
                        evaluations: evaluations,
                        slots: slots,
                        config: calendarConfig
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to toggle a calendar slot on/off for the current manager.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.date
     * @param {string} params.startTime
     * @param {string} [params.targetStatus] The desired slot status. Accepts `available` or `busy`. Defaults to `available`. If a slot with the same status already exists, it will be removed (toggle off).
     * @returns {Promise<Object>}
     * @private
     */
    #toggleCalendarSlot( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.MANAGER );

            const date = String( params?.date || "" ).trim();
            const startTime = String( params?.startTime || "" ).trim();
            if ( !date || !startTime ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { params } ) );
            }

            const targetStatus = String( params?.targetStatus || "" ).trim() || configurationLoader.slotStatus.AVAILABLE;
            if ( targetStatus !== configurationLoader.slotStatus.AVAILABLE && targetStatus !== configurationLoader.slotStatus.BUSY ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { targetStatus } ) );
            }

            const durationMinutes = configurationLoader.getSetting( "performanceAppraisals.interviewCalendar.slotDurationMinutes", 30 );

            this.#resolveCurrentCycle().then( ( cycle ) => {
                if ( !cycle ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.calendar.no-active-cycle" }, exceptions.httpCode.C_422 );
                }
                const cycleID = cycle.cycleID;
                const slotID = `${ cycleID }|${ userID }|${ date }|${ startTime }`;
                return dataManager.instance.fetchManagerCalendar( cycleID, userID ).then( ( existingSlots ) => ( { cycleID, slotID, existingSlots } ) );
            } ).then( ( { cycleID, slotID, existingSlots } ) => {
                const existing = existingSlots.find( ( s ) => s.slotID === slotID );

                if ( existing ) {
                    if ( existing.status === configurationLoader.slotStatus.BOOKED ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.calendar.cannot-toggle-booked" }, exceptions.httpCode.C_422 );
                    }
                    if ( existing.status === targetStatus ) {
                        existing.status = configurationLoader.slotStatus.DELETED;
                        return dataManager.instance.saveCalendarSlot( existing ).then( () => ( { action: "removed" } ) );
                    } else {
                        existing.status = targetStatus;
                        return dataManager.instance.saveCalendarSlot( existing ).then( () => ( { action: "updated", slot: existing } ) );
                    }
                } else {
                    const newSlot = {
                        slotID: slotID,
                        managerID: userID,
                        cycleID: cycleID,
                        date: date,
                        startTime: startTime,
                        durationMinutes: durationMinutes,
                        status: targetStatus,
                        booking: null,
                        externalRef: null
                    };
                    return dataManager.instance.saveCalendarSlot( newSlot ).then( () => ( { action: "added", slot: newSlot } ) );
                }
            } ).then( ( result ) => {
                resolve( result );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to book a calendar slot for a specific evaluation interview.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.slotID
     * @param {string} params.evaluationID
     * @returns {Promise<Object>}
     * @private
     */
    #bookInterviewSlot( session, params ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const slotID = String( params?.slotID || "" ).trim();
            const evaluationID = String( params?.evaluationID || "" ).trim();
            if ( !slotID || !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { params } ) );
            }

            const { cycleID, managerID } = this.#parseSlotID( slotID );

            let targetSlot;
            let targetEvaluation;

            dataManager.instance.fetchManagerCalendar( cycleID, managerID ).then( ( slots ) => {
                targetSlot = slots.find( ( s ) => s.slotID === slotID );
                if ( !targetSlot ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.calendar.slot-not-found" }, exceptions.httpCode.C_404 );
                }
                if ( targetSlot.status !== configurationLoader.slotStatus.AVAILABLE ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.calendar.slot-not-available" }, exceptions.httpCode.C_422 );
                }
                return dataManager.instance.fetchEvaluation( evaluationID );
            } ).then( ( evaluation ) => {
                if ( evaluation.status !== configurationLoader.evaluationStatus.READY ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-interview-status" }, exceptions.httpCode.C_422 );
                }
                targetEvaluation = evaluation;

                targetSlot.status = configurationLoader.slotStatus.BOOKED;
                targetSlot.booking = {
                    evaluationID: evaluationID,
                    employeeID: evaluation.employeeID,
                    employeeName: organizationManager.instance.resolveEmployeeName( evaluation.employeeID ) || evaluation.employeeID,
                    bookedAt: new Date().toISOString()
                };

                targetEvaluation.interviewDate = targetSlot.date;

                return Promise.all( [
                    dataManager.instance.saveCalendarSlot( targetSlot ),
                    dataManager.instance.saveEvaluation( targetEvaluation )
                ] );
            } ).then( () => {
                resolve( { slotID: slotID, interviewDate: targetSlot.date } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to cancel an existing interview booking, freeing the slot and clearing the evaluation's interview date.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.slotID
     * @returns {Promise<Object>}
     * @private
     */
    #cancelInterviewBooking( session, params ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const slotID = String( params?.slotID || "" ).trim();
            if ( !slotID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { params } ) );
            }

            const { cycleID, managerID } = this.#parseSlotID( slotID );

            let targetSlot;

            dataManager.instance.fetchManagerCalendar( cycleID, managerID ).then( ( slots ) => {
                targetSlot = slots.find( ( s ) => s.slotID === slotID );
                if ( !targetSlot ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.calendar.slot-not-found" }, exceptions.httpCode.C_404 );
                }
                if ( targetSlot.status !== configurationLoader.slotStatus.BOOKED ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.calendar.slot-not-booked" }, exceptions.httpCode.C_422 );
                }

                const evaluationID = targetSlot.booking?.evaluationID;
                targetSlot.status = configurationLoader.slotStatus.AVAILABLE;
                targetSlot.booking = null;

                const saveSlotPromise = dataManager.instance.saveCalendarSlot( targetSlot );
                const clearDatePromise = evaluationID
                    ? dataManager.instance.fetchEvaluation( evaluationID ).then( ( evaluation ) => {
                        evaluation.interviewDate = null;
                        return dataManager.instance.saveEvaluation( evaluation );
                    } )
                    : Promise.resolve();

                return Promise.all( [ saveSlotPromise, clearDatePromise ] );
            } ).then( () => {
                resolve( { slotID: slotID } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to load the dashboard data for the current user.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadDashboard( session ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireSessionUser( session );

            const isManager = userRoles.includes( configurationLoader.roleCode.MANAGER ) || userRoles.includes( configurationLoader.roleCode.SUPERVISOR );

            const evalStatusTone = ( status ) => {
                if ( status === configurationLoader.evaluationStatus.OPEN ) return "info";
                if ( status === configurationLoader.evaluationStatus.IN_REVIEW ) return "warn";
                if ( status === configurationLoader.evaluationStatus.READY ) return "success";
                return "";
            };

            Promise.all( [
                dataManager.instance.fetchEvaluations( userID ),
                dataManager.instance.fetchEvaluations( null, false ),
                this.#resolveCurrentCycle()
            ] ).then( ( [ myEvaluations, allEvaluations, currentCycle ] ) => {
                const myLatestEvaluation = myEvaluations.length > 0
                    ? myEvaluations.slice().sort( ( a, b ) => new Date( b.cycleDate ) - new Date( a.cycleDate ) )[ 0 ]
                    : null;

                const myEvalStatus = myLatestEvaluation
                    ? {
                        evaluationID: myLatestEvaluation.evaluationID,
                        status: myLatestEvaluation.status,
                        statusName: configurationLoader.evaluationStatus.name( myLatestEvaluation.status ),
                        statusTone: evalStatusTone( myLatestEvaluation.status ),
                        cycleDate: myLatestEvaluation.cycleDate
                    }
                    : null;

                // Self-grades progress from the user's own latest evaluation, read off the snapshot frozen at creation.
                let selfGrades = { completed: 0, total: 0 };
                if ( myLatestEvaluation ) {
                    const gradeEntries = myLatestEvaluation.grades ? Object.values( myLatestEvaluation.grades ) : [];
                    selfGrades.total = Array.isArray( myLatestEvaluation.snapshot ) ? myLatestEvaluation.snapshot.length : 0;
                    if ( gradeEntries.length > 0 ) {
                        selfGrades.completed = gradeEntries.filter( ( grade ) => configurationLoader.evaluationGrade.contains( grade.employee ) ).length;
                    }
                }

                // Peer feedback: evaluations still waiting for the current user's team review
                const pendingTeamEvals = allEvaluations.filter( ( evaluation ) =>
                    evaluation.status === configurationLoader.evaluationStatus.OPEN &&
                    Array.isArray( evaluation.workflow?.team ) &&
                    evaluation.workflow.team.includes( userID )
                );
                const peerFeedback = { submitted: 0, requested: pendingTeamEvals.length };

                // Team coverage: active evaluations among teammates in the same org unit
                const activeStatuses = [
                    configurationLoader.evaluationStatus.OPEN,
                    configurationLoader.evaluationStatus.IN_REVIEW,
                    configurationLoader.evaluationStatus.READY
                ];
                const userUnitID = organizationManager.instance.resolveOrganizationUnitIDForEmployee( userID );
                const unitSubtree = userUnitID ? organizationManager.instance.getOrganizationUnitSubtree( userUnitID ) : null;
                const unitEmployees = unitSubtree && Array.isArray( unitSubtree.employees ) ? unitSubtree.employees : [];
                const teammates = unitEmployees.filter( ( e ) => e.employeeID !== userID );

                const latestEvalByEmployee = new Map();
                allEvaluations.forEach( ( e ) => {
                    const existing = latestEvalByEmployee.get( e.employeeID );
                    if ( !existing || new Date( e.cycleDate ) > new Date( existing.cycleDate ) ) {
                        latestEvalByEmployee.set( e.employeeID, e );
                    }
                } );
                const teamCoverageStarted = teammates.filter( ( teammate ) => {
                    const latestEval = latestEvalByEmployee.get( teammate.employeeID );
                    return latestEval && activeStatuses.includes( latestEval.status );
                } ).length;
                const teamCoverage = { started: teamCoverageStarted, total: teammates.length };

                // Team evaluations for managers
                const teamEvaluations = isManager
                    ? allEvaluations
                        .filter( ( e ) =>
                            e.managerID === userID &&
                            e.status !== configurationLoader.evaluationStatus.CLOSED &&
                            e.status !== configurationLoader.evaluationStatus.DELETED
                        )
                        .map( ( e ) => ( {
                            evaluationID: e.evaluationID,
                            employeeID: e.employeeID,
                            employeeName: organizationManager.instance.resolveEmployeeName( e.employeeID ) || e.employeeID,
                            status: e.status,
                            statusName: configurationLoader.evaluationStatus.name( e.status )
                        } ) )
                    : [];

                const stats = {
                    total: teamEvaluations.length,
                    open: teamEvaluations.filter( ( e ) => e.status === configurationLoader.evaluationStatus.OPEN ).length,
                    inReview: teamEvaluations.filter( ( e ) => e.status === configurationLoader.evaluationStatus.IN_REVIEW ).length,
                    ready: teamEvaluations.filter( ( e ) => e.status === configurationLoader.evaluationStatus.READY ).length
                };

                resolve( {
                    userID: userID,
                    isManager: isManager,
                    cycle: currentCycle ? {
                        id: currentCycle.cycleID,
                        name: currentCycle.name,
                        status: currentCycle.status,
                        statusName: localization.getLabel( configurationLoader.cycleStatus.name( currentCycle.status ) || currentCycle.status, session?.language ),
                        statusTone: this.#cycleStatusTone( currentCycle.status ),
                        startDate: currentCycle.cycleStart,
                        date: currentCycle.cycleDate,
                        endDate: currentCycle.cycleEnd
                    } : null,
                    myEvaluation: myEvalStatus,
                    teamEvaluations: teamEvaluations,
                    stats: stats,
                    employeeMetrics: {
                        peerFeedback: peerFeedback,
                        selfGrades: selfGrades,
                        teamCoverage: teamCoverage
                    },
                    activity: [
                        {
                            id: 1,
                            type: "cycle_opened",
                            actorID: null,
                            actorName: "System",
                            action: "opened the evaluation cycle",
                            statusLabel: null,
                            statusTone: null,
                            time: "2 days ago"
                        },
                        {
                            id: 2,
                            type: "self_eval",
                            actorID: userID,
                            actorName: organizationManager.instance.resolveEmployeeName( userID ) || "You",
                            action: "submitted a self-evaluation",
                            statusLabel: "Open",
                            statusTone: "info",
                            time: "1 day ago"
                        },
                        {
                            id: 3,
                            type: "peer_eval",
                            actorID: null,
                            actorName: "A colleague",
                            action: "submitted peer feedback for you",
                            statusLabel: null,
                            statusTone: null,
                            time: "6 hours ago"
                        },
                        {
                            id: 4,
                            type: "review_started",
                            actorID: null,
                            actorName: "Your manager",
                            action: "started the manager review",
                            statusLabel: "In Review",
                            statusTone: "warn",
                            time: "2 hours ago"
                        }
                    ]
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /* ------------------------------------------------------------------ */
    /*                       Cycle management screens                     */

    /* ------------------------------------------------------------------ */

    /**
     * Used to load the cycle list for the Cycle Management screen. Supervisor-only. Returns every cycle ordered by
     * createdAt descending, each enriched with localized status, planned dates, lock metadata, and per-cycle evaluation
     * counts (in-progress vs. completed).
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadCycleList( session ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const activeStatuses = [
                configurationLoader.evaluationStatus.OPEN,
                configurationLoader.evaluationStatus.IN_REVIEW,
                configurationLoader.evaluationStatus.READY
            ];

            Promise.all( [
                dataManager.instance.getAllCycles(),
                dataManager.instance.fetchEvaluations( null, false )
            ] ).then( ( [ cycles, evaluations ] ) => {
                const countsByCycle = new Map();
                evaluations.forEach( ( evaluation ) => {
                    const cycleID = evaluation?.cycleID;
                    if ( !cycleID ) return;
                    const bucket = countsByCycle.get( cycleID ) || { inProgress: 0, completed: 0 };
                    if ( activeStatuses.includes( evaluation.status ) ) {
                        bucket.inProgress++;
                    } else if ( evaluation.status === configurationLoader.evaluationStatus.CLOSED ) {
                        bucket.completed++;
                    }
                    countsByCycle.set( cycleID, bucket );
                } );

                const projected = cycles.map( ( cycle ) => {
                    const counts = countsByCycle.get( cycle.cycleID ) || { inProgress: 0, completed: 0 };
                    return {
                        cycleID: cycle.cycleID,
                        name: cycle.name,
                        status: cycle.status,
                        statusName: localization.getLabel( configurationLoader.cycleStatus.name( cycle.status ) || cycle.status, session?.language ),
                        statusTone: this.#cycleStatusTone( cycle.status ),
                        createdAt: cycle.createdAt || null,
                        createdBy: cycle.createdBy || null,
                        createdByName: cycle.createdBy ? ( organizationManager.instance.resolveEmployeeName( cycle.createdBy ) || cycle.createdBy ) : null,
                        cycleStart: cycle.cycleStart || null,
                        cycleDate: cycle.cycleDate || null,
                        cycleEnd: cycle.cycleEnd || null,
                        actualCloseDate: cycle.actualCloseDate || null,
                        lockedAt: cycle.lockedAt || null,
                        lockedBy: cycle.lockedBy || null,
                        lockedByName: cycle.lockedBy ? ( organizationManager.instance.resolveEmployeeName( cycle.lockedBy ) || cycle.lockedBy ) : null,
                        counts: counts
                    };
                } );

                const activeCycle = projected.find( ( cycle ) => cycle.status === configurationLoader.cycleStatus.ACTIVE ) || null;
                const hasOpenCycle = projected.some( ( cycle ) => cycle.status !== configurationLoader.cycleStatus.CLOSED );
                resolve( {
                    cycles: projected,
                    activeCycleID: activeCycle ? activeCycle.cycleID : null,
                    hasOpenCycle: hasOpenCycle,
                    suggestedCycleID: this.#suggestNextCycleID( projected )
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to load the data backing the Cycle Setup screen for a specific cycle. Supervisor-only. Returns the cycle,
     * the full role-families catalogue with localized names, the persisted active competency sets for the cycle, the
     * full competencies dictionary (localized) the picker filters over, the canonical subcategory list, the
     * validation result, the cap, and a readOnly flag.
     *
     * @method
     * @param {TiSession} session
     * @param {string} cycleID
     * @returns {Promise<Object>}
     * @private
     */
    #loadCycleSetup( session, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }

            const language = session?.language;

            Promise.all( [
                dataManager.instance.getCycle( cycleID ),
                dataManager.instance.getRoleFamilies(),
                competenceFramework.instance.validateCycleForLock( cycleID )
            ] ).then( ( [ cycle, roleFamilies, validation ] ) => {
                return Promise.all( Object.keys( roleFamilies ).map( ( familyCode ) =>
                    dataManager.instance.getActiveCompetencySetsForFamily( familyCode, cycleID )
                        .then( ( familySets ) => [ familyCode, familySets ] )
                ) ).then( ( familySetPairs ) => {
                    const families = Object.entries( roleFamilies ).map( ( [ code, family ] ) => ( {
                        code,
                        name: localization.getLabel( family.name || configurationLoader.roleFamilyCode.name( code ) || code, language ),
                        description: localization.getLabel( family.description || "", language ),
                        specializations: Object.entries( family.specializations || {} ).map( ( [ specCode, spec ] ) => ( {
                            code: specCode,
                            name: localization.getLabel( spec.name || specCode, language ),
                            description: localization.getLabel( spec.description || "", language ),
                            eCFMapping: Array.isArray( spec.eCFMapping ) ? spec.eCFMapping : []
                        } ) )
                    } ) );

                    const sets = {};
                    familySetPairs.forEach( ( [ familyCode, familySets ] ) => {
                        sets[ familyCode ] = {};
                        Object.entries( familySets ).forEach( ( [ key, codes ] ) => {
                            sets[ familyCode ][ key ] = {
                                codes: Array.isArray( codes ) ? codes.slice() : [],
                                markedEmpty: Array.isArray( codes ) && codes.length === 0 && key !== "baseline"
                            };
                        } );
                    } );

                    const errorsByFamily = {};
                    if ( validation && Array.isArray( validation.errors ) ) {
                        validation.errors.forEach( ( error ) => {
                            const groupKey = error.specialization ? `${ error.family }.${ error.specialization }` : error.family;
                            errorsByFamily[ groupKey ] = errorsByFamily[ groupKey ] || [];
                            errorsByFamily[ groupKey ].push( {
                                rule: error.rule,
                                detail: error.detail || ""
                            } );
                        } );
                    }

                    const dictionary = ( configurationLoader.configCompetencies && configurationLoader.configCompetencies.competencies ) || {};
                    const categories = ( configurationLoader.configCompetencies && configurationLoader.configCompetencies.categories ) || {};

                    const competenciesByCode = {};
                    Object.entries( dictionary ).forEach( ( [ code, competency ] ) => {
                        const subcategoryConfig = categories[ competency.category ]?.subcategories?.[ competency.subcategory ];
                        competenciesByCode[ code ] = {
                            code,
                            name: localization.getLabel( competency.name, language ),
                            description: localization.getLabel( competency.description, language ),
                            category: competency.category,
                            categoryName: localization.getLabel( categories[ competency.category ]?.name || competency.category, language ),
                            subcategory: competency.subcategory,
                            subcategoryName: localization.getLabel( subcategoryConfig?.name || competency.subcategory, language ),
                            subcategoryDescription: localization.getLabel( subcategoryConfig?.description || "", language ),
                            relevancyArchetype: competency.relevancyArchetype,
                            eCFMapping: Array.isArray( competency.eCFMapping ) ? _.cloneDeep( competency.eCFMapping ) : []
                        };
                    } );

                    const subcategories = [];
                    Object.entries( categories ).forEach( ( [ catCode, category ] ) => {
                        Object.entries( category.subcategories || {} ).forEach( ( [ subCode, sub ] ) => {
                            subcategories.push( {
                                code: subCode,
                                name: localization.getLabel( sub.name || subCode, language ),
                                description: localization.getLabel( sub.description || "", language ),
                                categoryCode: catCode,
                                categoryName: localization.getLabel( category.name || catCode, language )
                            } );
                        } );
                    } );

                    resolve( {
                        cycle: {
                            cycleID: cycle.cycleID,
                            name: cycle.name,
                            status: cycle.status,
                            statusName: localization.getLabel( configurationLoader.cycleStatus.name( cycle.status ) || cycle.status, language ),
                            statusTone: this.#cycleStatusTone( cycle.status ),
                            cycleStart: cycle.cycleStart || null,
                            cycleDate: cycle.cycleDate || null,
                            cycleEnd: cycle.cycleEnd || null,
                            actualCloseDate: cycle.actualCloseDate || null,
                            lockedAt: cycle.lockedAt || null,
                            lockedBy: cycle.lockedBy || null,
                            lockedByName: cycle.lockedBy ? ( organizationManager.instance.resolveEmployeeName( cycle.lockedBy ) || cycle.lockedBy ) : null,
                            createdAt: cycle.createdAt || null,
                            createdBy: cycle.createdBy || null,
                            createdByName: cycle.createdBy ? ( organizationManager.instance.resolveEmployeeName( cycle.createdBy ) || cycle.createdBy ) : null
                        },
                        isReadOnly: cycle.status !== configurationLoader.cycleStatus.PLANNING,
                        cap: configurationLoader.getSetting( "performanceAppraisals.activeCompetencySetCap", 30 ),
                        families,
                        sets,
                        competenciesByCode,
                        poolByFamily: configurationLoader.configRoleFamilyCompetencies,
                        subcategories,
                        validation: {
                            valid: validation ? validation.valid : true,
                            errorsByFamily
                        }
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to create a new cycle in a PLANNING state. Supervisor-only.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @param {string} params.name
     * @param {string} params.cycleStart
     * @param {string} params.cycleDate
     * @param {string} params.cycleEnd
     * @returns {Promise<Cycle>}
     * @private
     */
    #createCycle( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            const name = String( params?.name || "" ).trim();
            const cycleStart = String( params?.cycleStart || "" ).trim();
            const cycleDate = String( params?.cycleDate || "" ).trim();
            const cycleEnd = String( params?.cycleEnd || "" ).trim();

            if ( !cycleID || !name || !cycleEnd ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID, name, cycleEnd } ) );
            }
            if ( !/^\d{4}-H[12]$/.test( cycleID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, {
                    details: "error.cycle.invalid-id-format",
                    cycleID
                } ) );
            }
            if ( cycleStart && cycleEnd && cycleStart > cycleEnd ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: "error.cycle.invalid-date-range" } ) );
            }

            dataManager.instance.getAllCycles().then( ( cycles ) => {
                const openCycle = cycles.find( ( cycle ) => cycle.status !== configurationLoader.cycleStatus.CLOSED );
                if ( openCycle ) {
                    return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: `Cannot create a new cycle while cycle '${ openCycle.cycleID }' is still '${ openCycle.status }'. Close it first.` }, exceptions.httpCode.C_409 ) );
                }
                dataManager.instance.createCycle( {
                    cycleID,
                    name,
                    cycleStart: cycleStart || null,
                    cycleDate: cycleDate || cycleEnd,
                    cycleEnd,
                    createdBy: userID
                } ).then( ( cycle ) => {
                    resolve( cycle );
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to lock a cycle: validates and transitions PLANNING → ACTIVE. Supervisor-only. On validation failure the
     * structured errors propagate to the caller so the UI can render them grouped by family.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @returns {Promise<Cycle>}
     * @private
     */
    #lockCycle( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }

            competenceFramework.instance.lockCycle( cycleID, userID ).then( ( cycle ) => {
                resolve( cycle );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to close a cycle: transitions ACTIVE → CLOSED. Supervisor-only.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @returns {Promise<Cycle>}
     * @private
     */
    #closeCycle( session, params ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }

            competenceFramework.instance.closeCycle( cycleID ).then( ( cycle ) => {
                resolve( cycle );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to persist the competency codes for a (roleFamily, key, cycleID) tuple. Supervisor-only. Refuses writes
     * when the cycle is not in PLANNING. Validates that every code exists in the dictionary and that the key is a
     * valid `baseline` or specialization code under the parent family.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @param {string} params.roleFamily
     * @param {string} params.key - Literal "baseline" or a specialization code under the parent family.
     * @param {string[]} params.codes
     * @returns {Promise<Object>}
     * @private
     */
    #setActiveCompetencySet( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            const roleFamily = String( params?.roleFamily || "" ).trim();
            const key = String( params?.key || "" ).trim();
            const codes = Array.isArray( params?.codes ) ? params.codes.map( String ) : null;

            if ( !cycleID || !roleFamily || !key || !codes ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID, roleFamily, key, codes: !!codes } ) );
            }

            this.#assertCyclePlanning( cycleID )
                .then( () => this.#assertValidFamilyAndKey( roleFamily, key ) )
                .then( () => this.#assertCodesKnown( codes ) )
                .then( () => this.#assertCodesInPool( roleFamily, codes ) )
                .then( () => dataManager.instance.setActiveCompetencySet( roleFamily, key, cycleID, codes ) )
                .then( ( storedCodes ) => {
                    return dataManager.instance.appendAuditEntry( {
                        subjectType: "activeCompetencySet",
                        subjectID: `${ cycleID }|${ roleFamily }|${ key }`,
                        changedBy: userID,
                        field: "codes",
                        oldValue: null,
                        newValue: storedCodes
                    } ).then( () => ( { cycleID, roleFamily, key, codes: storedCodes } ) );
                } )
                .then( resolve )
                .catch( ( error ) => reject( exceptions.raise( error ) ) );
        } );
    }

    /**
     * Used to mark a specialization's active set as intentionally empty for the cycle. Supervisor-only. Persists an
     * explicit empty array, so the UI can distinguish "intentionally empty" (entry presents, codes.length === 0) from
     * "not configured" (entry absent).
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @param {string} params.roleFamily
     * @param {string} params.key - Must be a specialization code (cannot be "baseline").
     * @returns {Promise<Object>}
     * @private
     */
    #markActiveSetEmpty( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            const roleFamily = String( params?.roleFamily || "" ).trim();
            const key = String( params?.key || "" ).trim();

            if ( !cycleID || !roleFamily || !key ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID, roleFamily, key } ) );
            }
            if ( key === "baseline" ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: "error.cycle.cannot-mark-baseline-empty" } ) );
            }

            this.#assertCyclePlanning( cycleID )
                .then( () => this.#assertValidFamilyAndKey( roleFamily, key ) )
                .then( () => dataManager.instance.setActiveCompetencySet( roleFamily, key, cycleID, [] ) )
                .then( () => {
                    return dataManager.instance.appendAuditEntry( {
                        subjectType: "activeCompetencySet",
                        subjectID: `${ cycleID }|${ roleFamily }|${ key }`,
                        changedBy: userID,
                        field: "markedEmpty",
                        oldValue: null,
                        newValue: true
                    } ).then( () => ( { cycleID, roleFamily, key, codes: [], markedEmpty: true } ) );
                } )
                .then( resolve )
                .catch( ( error ) => reject( exceptions.raise( error ) ) );
        } );
    }

    /**
     * Used to clear a specialization's active set for the cycle, reverting it from "intentionally empty" back to "not
     * configured" (entry removed). Supervisor-only. The inverse of {@link #markActiveSetEmpty}; baseline sets cannot be
     * cleared this way.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.cycleID
     * @param {string} params.roleFamily
     * @param {string} params.key - Must be a specialization code (cannot be "baseline").
     * @returns {Promise<Object>}
     * @private
     */
    #clearActiveCompetencySet( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const cycleID = String( params?.cycleID || "" ).trim();
            const roleFamily = String( params?.roleFamily || "" ).trim();
            const key = String( params?.key || "" ).trim();

            if ( !cycleID || !roleFamily || !key ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID, roleFamily, key } ) );
            }
            if ( key === "baseline" ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: "error.cycle.cannot-clear-baseline" } ) );
            }

            this.#assertCyclePlanning( cycleID )
                .then( () => this.#assertValidFamilyAndKey( roleFamily, key ) )
                .then( () => dataManager.instance.deleteActiveCompetencySet( roleFamily, key, cycleID ) )
                .then( () => {
                    return dataManager.instance.appendAuditEntry( {
                        subjectType: "activeCompetencySet",
                        subjectID: `${ cycleID }|${ roleFamily }|${ key }`,
                        changedBy: userID,
                        field: "markedEmpty",
                        oldValue: true,
                        newValue: null
                    } ).then( () => ( { cycleID, roleFamily, key, cleared: true } ) );
                } )
                .then( resolve )
                .catch( ( error ) => reject( exceptions.raise( error ) ) );
        } );
    }

    /**
     * Asserts that the cycle is in a PLANNING state. Used as a precondition by every active-set mutation.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Cycle>}
     * @private
     */
    #assertCyclePlanning( cycleID ) {
        return dataManager.instance.getCycle( cycleID ).then( ( cycle ) => {
            if ( cycle.status !== configurationLoader.cycleStatus.PLANNING ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, {
                    details: "error.cycle.not-in-planning",
                    cycleID,
                    status: cycle.status
                }, exceptions.httpCode.C_422 );
            }
            return cycle;
        } );
    }

    /**
     * Asserts that the role family exists and the key is `baseline` or one of the family's specialization codes.
     *
     * @method
     * @param {string} roleFamily
     * @param {string} key
     * @returns {Promise<void>}
     * @private
     */
    #assertValidFamilyAndKey( roleFamily, key ) {
        const families = configurationLoader.configRoleFamilies || {};
        const family = families[ roleFamily ];
        if ( !family ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Role family '${ roleFamily }' is not defined.` }, exceptions.httpCode.C_404 ) );
        }
        if ( key === "baseline" ) {
            return Promise.resolve();
        }
        const validSpecs = family.specializations || {};
        if ( !validSpecs[ key ] ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: `Specialization '${ key }' is not valid for family '${ roleFamily }'.` } ) );
        }
        return Promise.resolve();
    }

    /**
     * Asserts every code is present in the competencies' dictionary.
     *
     * @method
     * @param {string[]} codes
     * @returns {Promise<void>}
     * @private
     */
    #assertCodesKnown( codes ) {
        const dictionary = ( configurationLoader.configCompetencies && configurationLoader.configCompetencies.competencies ) || {};
        const unknown = codes.filter( ( code ) => !dictionary[ code ] );
        if ( unknown.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: `Unknown competency codes: ${ unknown.join( ", " ) }` } ) );
        }
        return Promise.resolve();
    }

    /**
     * Asserts every code belongs to the role family's competency pool (the applicability universe). A family with no
     * defined pool is not constrained. Mirrors the lock-time `pool-membership` rule so out-of-pool codes are rejected at
     * save time, not just at lock time.
     *
     * @method
     * @param {string} roleFamily
     * @param {string[]} codes
     * @returns {Promise<void>}
     * @private
     */
    #assertCodesInPool( roleFamily, codes ) {
        const pool = configurationLoader.getCompetencyPool( roleFamily );
        if ( pool.length === 0 ) {
            return Promise.resolve();
        }
        const poolSet = new Set( pool );
        const outside = codes.filter( ( code ) => !poolSet.has( code ) );
        if ( outside.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: `Competency codes not in the '${ roleFamily }' pool: ${ outside.join( ", " ) }` } ) );
        }
        return Promise.resolve();
    }

    /**
     * Maps a cycle status to a status-pill tone variant. PLANNING → info, ACTIVE → success, CLOSED → muted.
     * <br/>
     * NOTE: This is intentionally a separate scale from the evaluation status tones (see {@link getEvalTone}
     * inside {@link #loadEmployeeList}). The two lifecycles only overlap on "info" today (PLANNING and OPEN), which
     * is fine semantically — but if visual differentiation is ever needed, the door is open here.
     *
     * @method
     * @param {CycleStatusValue|string} status
     * @returns {"info"|"success"|"muted"|""}
     * @private
     */
    #cycleStatusTone( status ) {
        if ( status === configurationLoader.cycleStatus.PLANNING ) return "info";
        if ( status === configurationLoader.cycleStatus.ACTIVE ) return "success";
        if ( status === configurationLoader.cycleStatus.CLOSED ) return "muted";
        return "";
    }

    /**
     * Maps an evaluation status to a status-pill tone variant. OPEN → info, IN_REVIEW → warn, READY → success.
     * Returns "" for any other status (e.g., CLOSED, NOT_STARTED) so the consumer can fall back to the default pill.
     * <br/>
     * NOTE: Two inline copies of this helper still live in {@link #loadEmployeeList} and the dashboard projection.
     * Future cleanup can route them through here; this method exists now because the People > Evaluations data-grid
     * needs the tone to render the StatusPill consistently with the org chart.
     *
     * @method
     * @param {string} status
     * @returns {"info"|"warn"|"success"|""}
     * @private
     */
    #evaluationStatusTone( status ) {
        if ( status === configurationLoader.evaluationStatus.OPEN ) return "info";
        if ( status === configurationLoader.evaluationStatus.IN_REVIEW ) return "warn";
        if ( status === configurationLoader.evaluationStatus.READY ) return "success";
        return "";
    }

    /**
     * Suggests the next free cycle ID based on today's half-year. Iterates YYYY-Hx forward until an unused ID is
     * found. Used as the default value in the Create Cycle modal.
     *
     * @method
     * @param {Array<{cycleID: string}>} existingCycles
     * @returns {string}
     * @private
     */
    #suggestNextCycleID( existingCycles ) {
        const used = new Set( ( existingCycles || [] ).map( ( cycle ) => cycle.cycleID ) );
        const today = new Date();
        let year = today.getUTCFullYear();
        let half = ( today.getUTCMonth() < 6 ) ? 2 : 1;
        if ( half === 1 ) {
            year++;
        }
        // Iterate forward until we land on an unused slot.
        for ( let i = 0; i < 20; i++ ) {
            const candidate = `${ year }-H${ half }`;
            if ( !used.has( candidate ) ) {
                return candidate;
            }
            if ( half === 1 ) {
                half = 2;
            } else {
                half = 1;
                year++;
            }
        }
        return `${ year }-H${ half }`;
    }

    /* ------------------------------------------------------------------ */
    /*                      Employee management screen                    */

    /* ------------------------------------------------------------------ */

    /**
     * Loads the employee list for the management screen. Scope-aware: a Supervisor sees every employee; a Manager
     * sees only their direct or indirect reports (via `isSuperiorManagerOfEmployee`). Also returns the dropdown
     * options the detail form needs.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadEmployeeManagementList( session ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR, configurationLoader.roleCode.MANAGER );
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );

            dataManager.instance.fetchEmployees().then( ( employees ) => {
                const filtered = isSupervisor
                    ? employees
                    : employees.filter( ( employee ) => employee.employeeID !== userID && organizationManager.instance.isSuperiorManagerOfEmployee( userID, employee.employeeID ) );

                const rows = filtered.map( ( employee ) => this.#projectEmployeeRow( employee, session ) );
                rows.sort( ( a, b ) => ( a.name || "" ).localeCompare( b.name || "" ) );

                resolve( {
                    scope: isSupervisor ? "supervisor" : "manager",
                    employees: rows,
                    options: this.#buildEmployeeFormOptions( session )
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Loads the full detail for a single employee, including manager context, in-flight evaluation count, and the
     * audit log (Supervisor only). Manager scope is enforced — a Manager cannot read the detail of an employee not
     * under their reporting chain.
     *
     * @method
     * @param {TiSession} session
     * @param {string} employeeID
     * @returns {Promise<Object>}
     * @private
     */
    #loadEmployeeDetail( session, employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR, configurationLoader.roleCode.MANAGER );
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );

            if ( !employeeID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID } ) );
            }

            dataManager.instance.fetchEmployee( employeeID ).then( ( employee ) => {
                if ( !isSupervisor && !organizationManager.instance.isSuperiorManagerOfEmployee( userID, employeeID ) ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
                }

                const activeStatuses = [
                    configurationLoader.evaluationStatus.OPEN,
                    configurationLoader.evaluationStatus.IN_REVIEW,
                    configurationLoader.evaluationStatus.READY
                ];

                return Promise.all( [
                    dataManager.instance.fetchEvaluations( employeeID, false ),
                    isSupervisor ? dataManager.instance.getAuditEntriesForEmployee( employeeID ) : Promise.resolve( [] )
                ] ).then( ( [ evaluations, auditEntries ] ) => {
                    const inFlightList = ( evaluations || [] ).filter( ( evaluation ) => activeStatuses.includes( evaluation.status ) );
                    const auditProjected = ( auditEntries || [] ).map( ( entry ) => ( {
                        entryID: entry.entryID,
                        timestamp: entry.timestamp,
                        changedBy: entry.changedBy,
                        changedByName: entry.changedBy ? ( organizationManager.instance.resolveEmployeeName( entry.changedBy ) || entry.changedBy ) : null,
                        field: entry.field,
                        oldValue: entry.oldValue,
                        newValue: entry.newValue,
                        reason: entry.reason || null
                    } ) );

                    const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee );
                    const isSelf = employeeID === userID;
                    const isDirectManager = !isSupervisor && organizationManager.instance.isSuperiorManagerOfEmployee( userID, employeeID );

                    resolve( {
                        employee: this.#projectEmployeeDetail( employee, session ),
                        manager: organizationContext,
                        inFlightEvaluations: {
                            count: inFlightList.length,
                            entries: inFlightList.map( ( evaluation ) => ( {
                                evaluationID: evaluation.evaluationID,
                                shortID: evaluation.shortID,
                                cycleID: evaluation.cycleID,
                                status: evaluation.status,
                                statusName: configurationLoader.evaluationStatus.name( evaluation.status ),
                                statusTone: this.#evaluationStatusTone( evaluation.status ),
                                // Used by the People > Evaluations tab to render a level pip and an interview-date column.
                                stageLevel: ( evaluation.stageLevel || ( employee?.career?.level && employee?.career?.stage ? `${ employee.career.level }${ employee.career.stage }` : "" ) ) || "",
                                interviewDate: evaluation.interviewDate || null
                            } ) )
                        },
                        audit: auditProjected,
                        permissions: {
                            isSupervisor,
                            isDirectManager,
                            isSelf,
                            canEditAllFields: isSupervisor,
                            canEditSpecialization: isSupervisor || isDirectManager,
                            canViewAudit: isSupervisor
                        }
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Creates a new employee record. Supervisor-only. Auto-assigns the next available employeeID. Validates the
     * record against the schema rules and writes a single "created" audit entry.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {Object} params.employee
     * @returns {Promise<Object>}
     * @private
     */
    #createEmployee( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const input = params?.employee;
            if ( !input || typeof input !== "object" ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employee: !!input } ) );
            }

            dataManager.instance.fetchEmployees().then( ( employees ) => {
                const nextID = this.#deriveNextEmployeeID( employees );
                const newEmployee = {
                    employeeID: nextID,
                    email: String( input.email || "" ).trim() || undefined,
                    employmentStatus: input.employmentStatus || "active",
                    personal: {
                        firstName: String( input.personal?.firstName || "" ).trim(),
                        lastName: String( input.personal?.lastName || "" ).trim(),
                        workMode: input.personal?.workMode || "Full-time",
                        workLocation: input.personal?.workLocation || "On-site",
                        ...( input.personal?.birthDate ? { birthDate: input.personal.birthDate } : {} ),
                        ...( input.personal?.gender ? { gender: input.personal.gender } : {} )
                    },
                    career: {
                        organizationUnitID: String( input.career?.organizationUnitID || "" ).trim(),
                        roleFamily: String( input.career?.roleFamily || "" ).trim(),
                        specialization: input.career?.specialization || null,
                        level: String( input.career?.level || "" ).trim(),
                        stage: Number( input.career?.stage ),
                        ...( input.career?.startingDate ? { startingDate: input.career.startingDate } : {} )
                    }
                };
                // Strip undefined fields so the persisted record is clean.
                if ( !newEmployee.email ) delete newEmployee.email;

                const validationError = this.#validateEmployeeFields( newEmployee );
                if ( validationError ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: validationError }, exceptions.httpCode.C_422 );
                }

                return dataManager.instance.saveEmployee( newEmployee ).then( ( saved ) => {
                    return dataManager.instance.appendAuditEntry( {
                        subjectType: "employee",
                        subjectID: saved.employeeID,
                        changedBy: userID,
                        field: "__created__",
                        oldValue: null,
                        newValue: saved
                    } ).then( () => organizationManager.instance.buildOrganizationChart().then( () => saved ) );
                } );
            } ).then( ( saved ) => {
                resolve( this.#projectEmployeeDetail( saved, session ) );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Updates an employee record with the supplied field diff. Field-level permission gating per §4: a Supervisor can
     * edit every field; a Manager (only on direct reports) can edit `career.specialization` only; all other edits are
     * rejected with 403. Each changed field writes one audit entry through DataManager.appendAuditEntry.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.employeeID
     * @param {Object.<string, *>} params.fields - Dotted-path field paths mapped to new values.
     * @returns {Promise<Object>}
     * @private
     */
    #updateEmployee( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR, configurationLoader.roleCode.MANAGER );
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );

            const employeeID = String( params?.employeeID || "" ).trim();
            const fields = params?.fields;
            if ( !employeeID || !fields || typeof fields !== "object" ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, hasFields: !!fields } ) );
            }

            dataManager.instance.fetchEmployee( employeeID ).then( ( employee ) => {
                const isDirectManager = !isSupervisor && organizationManager.instance.isSuperiorManagerOfEmployee( userID, employeeID );
                if ( !isSupervisor && !isDirectManager ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
                }

                const updated = _.cloneDeep( employee );
                const changes = [];

                for ( const [ path, rawValue ] of Object.entries( fields ) ) {
                    this.#assertEditableField( path, { isSupervisor, isDirectManager } );
                    const oldValue = this.#getFieldByPath( updated, path );
                    const newValue = this.#normalizeFieldValue( path, rawValue );
                    if ( this.#fieldsEqual( oldValue, newValue ) ) {
                        continue;
                    }
                    this.#setFieldByPath( updated, path, newValue );
                    changes.push( { path, oldValue, newValue } );
                }

                if ( changes.length === 0 ) {
                    resolve( this.#projectEmployeeDetail( employee, session ) );
                    return;
                }

                const validationError = this.#validateEmployeeFields( updated );
                if ( validationError ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: validationError }, exceptions.httpCode.C_422 );
                }

                return dataManager.instance.saveEmployee( updated ).then( ( saved ) => {
                    return Promise.all( changes.map( ( change ) => dataManager.instance.appendAuditEntry( {
                        subjectType: "employee",
                        subjectID: saved.employeeID,
                        changedBy: userID,
                        field: change.path,
                        oldValue: change.oldValue,
                        newValue: change.newValue
                    } ) ) ).then( () => organizationManager.instance.buildOrganizationChart().then( () => saved ) );
                } ).then( ( saved ) => {
                    resolve( this.#projectEmployeeDetail( saved, session ) );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Projects an employee record for the master list. Strips internal-only data, resolves localized labels, and
     * surfaces the resolved manager (via the org chart).
     *
     * @method
     * @param {Employee} employee
     * @param {TiSession} session
     * @returns {Object}
     * @private
     */
    #projectEmployeeRow( employee, session ) {
        const firstName = employee?.personal?.firstName || "";
        const lastName = employee?.personal?.lastName || "";
        const roleFamily = employee?.career?.roleFamily || "";
        const specialization = employee?.career?.specialization || null;
        const level = employee?.career?.level || "";
        const stage = employee?.career?.stage || null;
        const stageLevel = ( level && stage ) ? `${ level }${ stage }` : ( level ? `${ level }1` : "" );
        const organizationContext = organizationManager.instance.resolveEmployeeOrganizationContext( employee ) || {};

        return {
            employeeID: employee.employeeID,
            name: `${ firstName } ${ lastName }`.trim(),
            email: employee.email || "",
            employmentStatus: employee.employmentStatus || "active",
            roleFamily,
            roleFamilyName: roleFamily ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ roleFamily ]?.name || roleFamily, session?.language ) : "",
            specialization,
            specializationName: ( roleFamily && specialization )
                ? localization.getLabel( ( configurationLoader.configRoleFamilies || {} )[ roleFamily ]?.specializations?.[ specialization ]?.name || specialization, session?.language )
                : null,
            level,
            stage,
            stageLevel,
            organizationUnitID: employee?.career?.organizationUnitID || "",
            organizationUnitName: organizationContext.organizationUnitName || "",
            managerID: organizationContext.managerID || null,
            managerName: organizationContext.managerName || null
        };
    }

    /**
     * Projects a full employee record for the detail panel. Returns the persisted shape augmented with localized
     * labels for the form.
     *
     * @method
     * @param {Employee} employee
     * @param {TiSession} session
     * @returns {Object}
     * @private
     */
    #projectEmployeeDetail( employee, session ) {
        const projection = this.#projectEmployeeRow( employee, session );
        return {
            ...projection,
            personal: {
                firstName: employee?.personal?.firstName || "",
                lastName: employee?.personal?.lastName || "",
                birthDate: employee?.personal?.birthDate || null,
                gender: employee?.personal?.gender || null,
                workMode: employee?.personal?.workMode || "",
                workLocation: employee?.personal?.workLocation || ""
            },
            career: {
                organizationUnitID: employee?.career?.organizationUnitID || "",
                roleFamily: employee?.career?.roleFamily || "",
                specialization: employee?.career?.specialization || null,
                level: employee?.career?.level || "",
                stage: employee?.career?.stage || null,
                startingDate: employee?.career?.startingDate || null
            }
        };
    }

    /**
     * Builds the dropdown options used by the detail form (role families with their specializations, stage levels,
     * organization units, employment statuses, work modes / locations). All localized via session language.
     *
     * @method
     * @param {TiSession} session
     * @returns {Object}
     * @private
     */
    #buildEmployeeFormOptions( session ) {
        const language = session?.language;
        const families = configurationLoader.configRoleFamilies || {};
        const roleFamilies = Object.entries( families ).map( ( [ code, family ] ) => ( {
            code,
            name: localization.getLabel( family.name || code, language ),
            specializations: Object.entries( family.specializations || {} ).map( ( [ specCode, spec ] ) => ( {
                code: specCode,
                name: localization.getLabel( spec.name || specCode, language )
            } ) )
        } ) );

        // Stage-level dual-track ladder, derived from config.stage-levels.json (single source of truth).
        const stageLevels = configurationLoader.getStageLevelLadder();

        const orgStructure = configurationLoader.configOrganizationStructure || {};
        const organizationUnits = Object.entries( orgStructure ).map( ( [ id, unit ] ) => ( {
            id: unit.id || id,
            name: unit.displayName || unit.name || id,
            parent: unit.parent || null,
            managerID: unit.managerID || null,
            managerName: unit.managerID ? ( organizationManager.instance.resolveEmployeeName( unit.managerID ) || unit.managerID ) : null
        } ) ).sort( ( a, b ) => ( a.name || "" ).localeCompare( b.name || "" ) );

        return {
            roleFamilies,
            stageLevels,
            organizationUnits,
            employmentStatuses: [ "active", "on-leave", "terminated" ],
            workModes: [ "Full-time", "Part-time", "Contract" ],
            workLocations: [ "On-site", "Hybrid", "Remote" ]
        };
    }

    /**
     * Returns the set of field paths a non-Supervisor manager is allowed to edit on a direct report.
     *
     * @method
     * @returns {Set<string>}
     * @private
     */
    #managerEditableFields() {
        return new Set( [ "career.specialization" ] );
    }

    /**
     * Throws E_SEC_UNAUTHORIZED_ACCESS when the supplied field is outside the caller's edit scope.
     *
     * @method
     * @param {string} fieldPath
     * @param {{isSupervisor: boolean, isDirectManager: boolean}} actorScope
     * @private
     */
    #assertEditableField( fieldPath, actorScope ) {
        if ( actorScope.isSupervisor ) return;
        if ( actorScope.isDirectManager && this.#managerEditableFields().has( fieldPath ) ) return;
        throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: `Field '${ fieldPath }' is not editable by the current role.` }, exceptions.httpCode.C_403 );
    }

    /**
     * Reads a value out of an object by dotted path (e.g., "career.roleFamily").
     *
     * @method
     * @param {Object} obj
     * @param {string} path
     * @returns {*}
     * @private
     */
    #getFieldByPath( obj, path ) {
        const parts = path.split( "." );
        let current = obj;
        for ( const part of parts ) {
            if ( current === null || current === undefined ) return undefined;
            current = current[ part ];
        }
        return ( current === undefined ) ? null : current;
    }

    /**
     * Sets a value into an object by dotted path, creating any intermediate objects as needed.
     *
     * @method
     * @param {Object} obj
     * @param {string} path
     * @param {*} value
     * @private
     */
    #setFieldByPath( obj, path, value ) {
        const parts = path.split( "." );
        let current = obj;
        for ( let i = 0; i < parts.length - 1; i++ ) {
            if ( current[ parts[ i ] ] === undefined || current[ parts[ i ] ] === null ) {
                current[ parts[ i ] ] = {};
            }
            current = current[ parts[ i ] ];
        }
        const lastPart = parts[ parts.length - 1 ];
        if ( value === null || value === undefined || value === "" ) {
            // For specialization specifically, store null. For optional scalars (email, birthDate), delete the key.
            if ( path === "career.specialization" ) {
                current[ lastPart ] = null;
            } else if ( path === "email" || path === "personal.birthDate" || path === "personal.gender" || path === "career.startingDate" ) {
                delete current[ lastPart ];
            } else {
                current[ lastPart ] = value;
            }
        } else {
            current[ lastPart ] = value;
        }
    }

    /**
     * Normalizes a raw submitted value for the given field path — coerces stage to integer, trims strings, leaves
     * null / empty as-is.
     *
     * @method
     * @param {string} path
     * @param {*} rawValue
     * @returns {*}
     * @private
     */
    #normalizeFieldValue( path, rawValue ) {
        if ( rawValue === null || rawValue === undefined ) {
            return null;
        }
        if ( path === "career.stage" ) {
            const n = Number( rawValue );
            return Number.isFinite( n ) ? n : null;
        }
        if ( typeof rawValue === "string" ) {
            return rawValue.trim();
        }
        return rawValue;
    }

    /**
     * Loose equality used to detect a no-op field change (audit log entries are only written for real changes).
     *
     * @method
     * @param {*} a
     * @param {*} b
     * @returns {boolean}
     * @private
     */
    #fieldsEqual( a, b ) {
        const norm = ( v ) => ( v === undefined || v === "" ) ? null : v;
        return norm( a ) === norm( b );
    }

    /**
     * Runs the cross-field validation rules on a candidate employee record (used by both create and update before
     * persisting). Returns an i18n key when invalid, null when valid.
     *
     * @method
     * @param {Employee} employee
     * @returns {string|null}
     * @private
     */
    #validateEmployeeFields( employee ) {
        const firstName = employee?.personal?.firstName;
        const lastName = employee?.personal?.lastName;
        if ( !firstName || !lastName ) {
            return "error.employee.missing-name";
        }

        const workMode = employee?.personal?.workMode;
        if ( ![ "Full-time", "Part-time", "Contract" ].includes( workMode ) ) {
            return "error.employee.invalid-work-mode";
        }
        const workLocation = employee?.personal?.workLocation;
        if ( ![ "On-site", "Hybrid", "Remote" ].includes( workLocation ) ) {
            return "error.employee.invalid-work-location";
        }

        const employmentStatus = employee?.employmentStatus || "active";
        if ( ![ "active", "on-leave", "terminated" ].includes( employmentStatus ) ) {
            return "error.employee.invalid-employment-status";
        }

        const roleFamily = employee?.career?.roleFamily;
        const families = configurationLoader.configRoleFamilies || {};
        if ( !roleFamily || !families[ roleFamily ] ) {
            return "error.employee.invalid-role-family";
        }
        const specialization = employee?.career?.specialization || null;
        if ( specialization && !( families[ roleFamily ].specializations || {} )[ specialization ] ) {
            return "error.employee.invalid-specialization";
        }

        const level = employee?.career?.level;
        const stage = employee?.career?.stage;
        if ( ![ "N", "J", "R", "S", "X", "T" ].includes( level ) ) {
            return "error.employee.invalid-level";
        }
        if ( !Number.isInteger( stage ) || stage < 1 || stage > 3 ) {
            return "error.employee.invalid-stage";
        }
        // Dual-track rule: N, X, T have only stage 1.
        if ( ( level === "N" || level === "X" || level === "T" ) && stage !== 1 ) {
            return "error.employee.invalid-stage-for-level";
        }

        const organizationUnitID = employee?.career?.organizationUnitID;
        const orgStructure = configurationLoader.configOrganizationStructure || {};
        if ( !organizationUnitID || !orgStructure[ organizationUnitID ] ) {
            return "error.employee.invalid-organization-unit";
        }

        if ( employee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( employee.email ) ) {
            return "error.employee.invalid-email";
        }

        return null;
    }

    /**
     * Picks the next available employeeID by incrementing the highest numeric ID already in the registry. Falls back
     * to `1` when the registry is empty.
     *
     * @method
     * @param {Array<Employee>} employees
     * @returns {string}
     * @private
     */
    #deriveNextEmployeeID( employees ) {
        const maxID = ( employees || [] ).reduce( ( accumulator, employee ) => {
            const n = Number( employee?.employeeID );
            return Number.isFinite( n ) && n > accumulator ? n : accumulator;
        }, 0 );
        return String( maxID + 1 );
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

    /**
     * Extracts the authenticated user context from the session.
     *
     * @method
     * @param {TiSession} session
     * @returns {{ userID: string, userRoles: string[] }}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} (401) If the session has no valid user identity.
     * @private
     */
    #requireSessionUser( session ) {
        const userID = session?.user?.employeeID;
        if ( !userID ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        }
        const userRoles = Array.isArray( session?.user?.roles ) ? session.user.roles : [];
        return { userID, userRoles };
    }

    /**
     * Extracts the authenticated user context and verifies that the user holds at least one of the specified roles.
     *
     * @method
     * @param {TiSession} session
     * @param {...string} roles One or more role codes; at least one must be present in the session.
     * @returns {{ userID: string, userRoles: string[] }}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} (401) when unauthenticated, or (403) when authenticated but holding none of the required roles.
     * @private
     */
    #requireRole( session, ...roles ) {
        const context = this.#requireSessionUser( session );
        if ( !roles.some( ( role ) => context.userRoles.includes( role ) ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
        }
        return context;
    }

    /**
     * Returns the interview calendar configuration derived from application settings.
     *
     * @method
     * @returns {Object}
     * @private
     */
    #getCalendarConfig() {
        return {
            slotDurationMinutes: configurationLoader.getSetting( "performanceAppraisals.interviewCalendar.slotDurationMinutes", 30 ),
            workingHoursStart: configurationLoader.getSetting( "performanceAppraisals.interviewCalendar.workingHoursStart", "09:00" ),
            workingHoursEnd: configurationLoader.getSetting( "performanceAppraisals.interviewCalendar.workingHoursEnd", "18:00" ),
            workingDays: configurationLoader.getSetting( "performanceAppraisals.interviewCalendar.workingDays", [ 1, 2, 3, 4, 5 ] )
        };
    }

    /**
     * Parses a slot ID string into its component parts.
     *
     * @method
     * @param {string} slotID
     * @returns {{ cycleID: string, managerID: string, date: string, startTime: string }}
     * @exception {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the format of the slot ID is invalid.
     * @private
     */
    #parseSlotID( slotID ) {
        const parts = slotID.split( "|" );
        if ( parts.length < 4 ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { slotID } );
        }
        const [ cycleID, managerID, date, startTime ] = parts;
        return { cycleID, managerID, date, startTime };
    }

}

module.exports = CompetenceWebApplication;
