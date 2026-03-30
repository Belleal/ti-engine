/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Initialization data models for the various Competence screens.
 *
 * @constant
 */
const initialDataModels = {
    competencyEvaluation: {
        isTeamEvaluationCollective: false,
        personal: {
            name: "",
            careerPath: "",
            organizationUnitID: "",
            organizationUnitName: "",
            level: "",
            stage: "",
            startingDate: ""
        },
        manager: {
            name: ""
        },
        evaluation: {
            cycle: "",
            cycleID: "",
            cycleDate: "",
            interviewDate: ""
        },
        competencies: [
            {
                id: "E",
                name: "Expertise",
                subcategories: [
                    {
                        id: "E1",
                        name: "Theoretical knowledge",
                        items: []
                    },
                    {
                        id: "E2",
                        name: "Applied skills",
                        items: []
                    }
                ]
            },
            {
                id: "I",
                name: "Impact",
                subcategories: [
                    {
                        id: "I1",
                        name: "Delivery",
                        items: []
                    }
                ]
            },
            {
                id: "C",
                name: "Collaboration",
                subcategories: [
                    {
                        id: "C1",
                        name: "Teamwork",
                        items: []
                    }
                ]
            }
        ]
    }
};

/**
 * Returns a configuration object for the competency evaluation screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
let configureCompetencyEvaluation = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const getEmployeeIDFromUrl = () => {
        const params = new URLSearchParams( window.location.search );
        return params.get( "employeeID" );
    };

    const getEvaluationIDFromUrl = () => {
        const params = new URLSearchParams( window.location.search );
        return params.get( "evaluationID" );
    };

    return {
        employeeID: null,
        userRole: null,
        deadlineDate: null,
        isTeamEvaluationCollective: false,
        canEdit: false,
        manager: {},
        personal: tiToolbox.structuredClone( initialDataModels.competencyEvaluation.personal ),
        evaluation: tiToolbox.structuredClone( initialDataModels.competencyEvaluation.evaluation ),
        competencies: tiToolbox.structuredClone( initialDataModels.competencyEvaluation.competencies ),
        grades: {},
        showEvaluationForm: false,

        init() {
            const onInitialized = () => {
                this.grades = tiApplication.configuration.grades;
                this.employeeID = getEmployeeIDFromUrl();
                this.loadEmployeeEvaluation( this.employeeID );
            };

            if ( tiApplication.isInitialized ) {
                onInitialized();
            } else {
                this.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
                    if ( isInitialized ) {
                        onInitialized();
                    }
                } );
            }
        },

        applyData( data ) {
            const fresh = ( data && typeof data === "object" ) ? data : {};
            this.isTeamEvaluationCollective = ( fresh.isTeamEvaluationCollective === true );
            this.personal = tiToolbox.structuredClone( fresh.personal || initialDataModels.competencyEvaluation.personal );
            this.manager = tiToolbox.structuredClone( fresh.manager || initialDataModels.competencyEvaluation.manager );
            this.userRole = fresh.userRole;
            this.deadlineDate = fresh.deadlineDate;
            this.canEdit = fresh.canEdit;
            this.evaluation = tiToolbox.structuredClone( fresh.evaluation || initialDataModels.competencyEvaluation.evaluation );
            this.competencies = tiToolbox.structuredClone( fresh.competencies || initialDataModels.competencyEvaluation.competencies );
        },

        loadEmployeeEvaluation( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            if ( !resolvedID ) {
                this.showEvaluationForm = false;
                this.reset();
            } else {
                this.employeeID = resolvedID;
                const evaluationID = getEvaluationIDFromUrl();
                const url = `/app/load-evaluation?employeeID=${ encodeURIComponent( resolvedID ) }${ evaluationID ? `&evaluationID=${ encodeURIComponent( evaluationID ) }` : "" }`;
                tiApplication.sendRequest( url ).then( ( result ) => {
                    this.showEvaluationForm = true;
                    this.applyData( result?.data );
                } ).catch( ( error ) => {
                    if ( error?.name === "AbortError" || error?.isAborted ) {
                        return;
                    }

                    this.showEvaluationForm = false;
                    this.applyData( initialDataModels.competencyEvaluation );
                    tiApplication.notify( tiApplication.formatException( error ) );
                    if ( error.exception?.httpCode === 401 ) {
                        tiApplication.openScreen( "dashboard" );
                    }
                } );
            }
        },

        reset() {
            const schema = document.getElementById( "competency-evaluation-schema" );
            if ( schema ) {
                const initial = JSON.parse( schema.textContent || '{}' );
                this.applyData( initial );
            } else if ( this.employeeID ) {
                this.loadEmployeeEvaluation( this.employeeID );
            } else {
                this.applyData( initialDataModels.competencyEvaluation );
            }
        },

        saveDraft() {
            tiApplication.sendRequest( "/app/save-evaluation-draft", "POST", { evaluation: this.evaluation } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.evaluation.messages.draft-saved" ) );
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        submitEvaluation() {
            if ( confirm( tiApplication.getLabel( "interface.evaluation.messages.confirm-submit", "Are you sure you want to submit the evaluation?" ) ) ) {
                tiApplication.sendRequest( "/app/submit-evaluation", "POST", { evaluation: this.evaluation } ).then( () => {
                    tiApplication.notify( tiApplication.getLabel( "interface.evaluation.messages.submitted" ) );
                    tiApplication.openScreen( "dashboard" );
                } ).catch( ( error ) => {
                    tiApplication.notify( tiApplication.formatException( error ) );
                } );
            }
        },

        getUserRoleAsText() {
            switch ( this.userRole ) {
                case 1:
                    return "employee";
                case 2:
                    return "manager";
                case 4:
                    return "team";
                default:
                    return "";
            }
        },

        resetGrades() {
            const role = this.getUserRoleAsText();
            if ( role && this.evaluation && this.evaluation.grades ) {
                Object.keys( this.evaluation.grades ).forEach( ( key ) => {
                    if ( this.evaluation.grades[ key ] ) {
                        this.evaluation.grades[ key ][ role ] = "";
                    }
                } );
            }
        },

        getItemGrade( competencyCode, role, defaultValue = "" ) {
            let grade;
            if ( competencyCode ) {
                grade = this.evaluation.grades?.[ competencyCode ]?.[ role ];
            }
            return grade || defaultValue;
        },

        setItemGrade( competencyCode, role, value ) {
            this.evaluation.grades = this.evaluation.grades || {};
            this.evaluation.grades[ competencyCode ] = this.evaluation.grades[ competencyCode ] || {};
            this.evaluation.grades[ competencyCode ][ role ] = value;
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }

    };
};

/**
 * Returns a configuration object for the list of employees screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
let configureEmployeesList = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        unitType: "",
        unitName: "",
        unitManagers: "",
        unitLocation: "",
        units: [],
        isManagerView: false,

        init() {
            const onInitialized = () => {
                this.loadEmployeeList();
            };

            if ( tiApplication.isInitialized ) {
                onInitialized();
            } else {
                this.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
                    if ( isInitialized ) {
                        onInitialized();
                    }
                } );
            }
        },

        flattenUnits( organizationUnits, flattenedUnits = [] ) {
            organizationUnits.forEach( ( unit ) => {
                flattenedUnits.push( unit );
                if ( unit.children && Array.isArray( unit.children ) ) {
                    this.flattenUnits( unit.children, flattenedUnits );
                }
            } );
        },

        loadEmployeeList() {
            const url = "/app/load-employee-list";
            tiApplication.sendRequest( url ).then( ( result ) => {
                const data = ( result?.data && typeof result.data === "object" ) ? result.data : {};
                const organizationUnits = Array.isArray( data.organizationUnits ) ? data.organizationUnits : [];
                const rootUnit = organizationUnits[ 0 ] || {};
                this.isManagerView = !!data.isManagerView;
                this.unitType = String( rootUnit.type || "" ).trim();
                this.unitName = String( rootUnit.name || "" ).trim();
                this.unitManagers = this.formatList( rootUnit.managers );
                this.unitLocation = this.formatList( rootUnit.parents, " / " );
                this.units = [];
                this.flattenUnits( organizationUnits, this.units );
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }

                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        startEvaluation( employeeID ) {
            tiApplication.sendRequest( "/app/start-evaluation", "POST", { employeeID: employeeID } ).then( ( result ) => {
                const evaluationID = result?.data;
                this.openEvaluation( employeeID, evaluationID );
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openEvaluation( employeeID, evaluationID ) {
            let url = "/app/competence-evaluation?employeeID=" + encodeURIComponent( employeeID );
            if ( evaluationID ) {
                url += "&evaluationID=" + encodeURIComponent( evaluationID );
            }
            if ( window.htmx ) {
                window.htmx.ajax( "GET", url, { target: "#ti-content", swap: "innerHTML" } );
                window.history.pushState( null, "", url );
            } else {
                window.location.href = url;
            }
        },

        formatList( values, separator = ", " ) {
            if ( Array.isArray( values ) ) {
                return values.map( ( entry ) => String( entry || "" ).trim() ).filter( Boolean ).join( separator );
            } else if ( typeof values === "string" ) {
                return values.trim();
            }
            return "";
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }

    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
    Alpine.data( "employeesList", configureEmployeesList );
} );
