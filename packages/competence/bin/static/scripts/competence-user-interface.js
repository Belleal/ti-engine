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
        personal: {
            name: "",
            position: "",
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
    },
    employeesList: {
        unit: {
            type: "Department",
            name: "Department A",
            managers: [ "Michael Scott" ],
            parents: [ "Division Alpha" ]
        },
        units: [
            {
                id: "department-a",
                type: "Department",
                name: "Department A",
                managers: [ "Michael Scott" ],
                employees: [],
                children: [
                    {
                        id: "team-1",
                        type: "Team",
                        name: "Team 1",
                        managers: [ "Pam Beesly" ],
                        employees: [
                            {
                                id: "Employee ID 1",
                                name: "John Smith",
                                position: "Software Engineer",
                                level: "R2",
                                since: "12.03.2020",
                                evaluation: { status: "new", date: "" }
                            },
                            {
                                id: "Employee ID 2",
                                name: "Jane Doe",
                                position: "Software Engineer",
                                level: "R3",
                                since: "25.01.2020",
                                evaluation: { status: "open", date: "28.04.2026" }
                            }
                        ],
                        children: []
                    },
                    {
                        id: "team-2",
                        type: "Team",
                        name: "Team 2",
                        managers: [ "Jim Halpert" ],
                        employees: [
                            {
                                id: "Employee ID n",
                                name: "Names",
                                position: "Position",
                                level: "R3",
                                since: "25.01.2020",
                                evaluation: { status: "new", date: "" }
                            }
                        ],
                        children: []
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
 * Returns a configuration object for the employees list screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
let configureEmployeesList = () => {
    const tiApplication = Alpine.store( "tiApplication" );
    const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

    const formatList = ( values, separator = ", " ) => {
        if ( !Array.isArray( values ) ) {
            return "";
        }
        return values.map( ( entry ) => String( entry || "" ).trim() ).filter( Boolean ).join( separator );
    };

    const getLabel = ( key, fallback ) => {
        if ( tiApplication && typeof tiApplication.getLabel === "function" ) {
            return tiApplication.getLabel( key, fallback );
        }
        return fallback;
    };

    const buildUnitEntry = ( unit, depth, index ) => {
        const type = String( unit?.type || "" ).trim();
        const name = String( unit?.name || "" ).trim();
        const managers = formatList( unit?.managers );
        const managersLabel = managers
            ? `${ getLabel( "interface.employees.unit.managers", "Managers:" ) } ${ managers }`
            : "";
        return {
            id: unit?.id || `${ type || "unit" }-${ name || "unknown" }-${ depth }-${ index }`,
            depth: depth,
            type: type,
            name: name,
            displayName: type ? `${ type }: ${ name }` : name,
            managersLabel: managersLabel,
            employees: clone( Array.isArray( unit?.employees ) ? unit.employees : [] )
        };
    };

    const flattenUnits = ( units, depth = 0, output = [] ) => {
        const list = Array.isArray( units ) ? units : [];
        list.forEach( ( unit, index ) => {
            output.push( buildUnitEntry( unit, depth, index ) );
            const children = Array.isArray( unit?.children ) ? unit.children : [];
            if ( children.length > 0 ) {
                flattenUnits( children, depth + 1, output );
            }
        } );
        return output;
    };

    return {
        unitType: "",
        unitName: "",
        unitManagers: "",
        unitLocation: "",
        units: [],
        flatUnits: [],
        employees: [],
        hasHierarchy: false,

        init() {
            this.applyData( initialDataModels.employeesList );
        },

        applyData( data ) {
            const fresh = ( data && typeof data === "object" ) ? data : {};
            const unit = ( fresh.unit && typeof fresh.unit === "object" ) ? fresh.unit : {};

            this.unitType = String( unit.type || "" ).trim();
            this.unitName = String( unit.name || "" ).trim();
            this.unitManagers = formatList( unit.managers );
            this.unitLocation = formatList( unit.parents, " / " );

            this.units = clone( Array.isArray( fresh.units ) ? fresh.units : [] );
            this.hasHierarchy = this.units.length > 1
                || this.units.some( ( entry ) => Array.isArray( entry?.children ) && entry.children.length > 0 );

            if ( !this.hasHierarchy && this.units.length === 1 ) {
                this.employees = clone( Array.isArray( this.units[ 0 ]?.employees ) ? this.units[ 0 ].employees : [] );
            } else {
                this.employees = [];
            }

            this.flatUnits = this.hasHierarchy ? flattenUnits( this.units ) : [];
        }

    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
    Alpine.data( "employeesList", configureEmployeesList );
} );
