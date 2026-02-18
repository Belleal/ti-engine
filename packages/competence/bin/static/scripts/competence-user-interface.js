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
            department: "",
            level: "",
            stage: "",
            startingDate: ""
        },
        manager: {
            name: "",
            managerID: ""
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
    const tiApplication = Alpine.store( "tiApplication" );

    const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

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
        manager: {},
        personal: clone( initialDataModels.competencyEvaluation.personal ),
        evaluation: clone( initialDataModels.competencyEvaluation.evaluation ),
        competencies: clone( initialDataModels.competencyEvaluation.competencies ),
        grades: {},
        showEvaluationForm: false,

        init() {
            const onInitialized = () => {
                this.grades = tiApplication.configuration.grades;
                this.employeeID = getEmployeeIDFromUrl();
                this.loadEmployee( this.employeeID );
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
            this.personal = clone( fresh.personal || initialDataModels.competencyEvaluation.personal );
            this.manager = clone( fresh.manager || initialDataModels.competencyEvaluation.manager );
            this.evaluation = clone( fresh.evaluation || initialDataModels.competencyEvaluation.evaluation );
            this.competencies = clone( fresh.competencies || initialDataModels.competencyEvaluation.competencies );
        },

        loadEmployee( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            if ( !resolvedID ) {
                this.showEvaluationForm = false;
                this.reset();
            } else {
                this.employeeID = resolvedID;
                const evaluationID = getEvaluationIDFromUrl();
                const url = `/app/load-employee-competencies?employeeID=${ encodeURIComponent( resolvedID ) }${ evaluationID ? `&evaluationID=${ encodeURIComponent( evaluationID ) }` : "" }`;
                tiApplication.sendRequest( url ).then( ( result ) => {
                    this.showEvaluationForm = true;
                    this.applyData( result?.data );
                } ).catch( ( error ) => {
                    if ( error?.name === "AbortError" || error?.isAborted ) return;

                    this.showEvaluationForm = false;
                    this.applyData( initialDataModels.competencyEvaluation );
                    tiApplication.notify( { message: `Failed to load competence evaluation: ${ error.message }`, timeout: 60000 } );
                } );
            }
        },

        reset() {
            const schema = document.getElementById( "competency-evaluation-schema" );
            if ( schema ) {
                const initial = JSON.parse( schema.textContent || '{}' );
                this.applyData( initial );
            } else if ( this.employeeID ) {
                this.loadEmployee( this.employeeID );
            } else {
                this.applyData( initialDataModels.competencyEvaluation );
            }
        },

        saveDraft() {
            tiApplication.sendRequest( "/app/save-evaluation-draft", "POST", { evaluation: this.evaluation } ).then( () => {
                tiApplication.notify( {
                    message: tiApplication.getLabel( "interface.evaluation.messages.draft-saved", "Draft saved successfully." ),
                    timeout: 3000
                } );
            } ).catch( ( error ) => {
                tiApplication.notify( { message: error.message } );
            } );
        },

        submitEvaluation() {
            if ( confirm( tiApplication.getLabel( "interface.evaluation.messages.confirm-submit", "Are you sure you want to submit the evaluation?" ) ) ) {
                tiApplication.sendRequest( "/app/submit-evaluation", "POST", this.evaluation ).then( () => {
                    tiApplication.notify( {
                        message: tiApplication.getLabel( "interface.evaluation.messages.submitted", "Evaluation submitted successfully." ),
                        timeout: 5000
                    } );
                    this.loadEmployee( this.employeeID );
                } ).catch( ( error ) => {
                    tiApplication.notify( { message: error.message } );
                } );
            }
        },

        resetGrades() {
            const role = this.isEmployee() ? "employee" : ( this.isEmployeeManager() ? "manager" : null );
            if ( role && this.evaluation && this.evaluation.grades ) {
                Object.keys( this.evaluation.grades ).forEach( ( key ) => {
                    if ( this.evaluation.grades[ key ] ) {
                        this.evaluation.grades[ key ][ role ] = "";
                    }
                } );
            }
        },

        setInterviewDate( value ) {
            this.evaluation.interviewDate = value;
        },

        getItemGrade( competencyCode, role, defaultValue = "" ) {
            let grade;
            if ( competencyCode ) {
                grade = ( role !== "team" ) ? this.evaluation.grades?.[ competencyCode ]?.[ role ] : this.evaluation.grades?.[ competencyCode ]?.team?.cumulative;
            }
            return grade || defaultValue;
        },

        setItemGrade( competencyCode, role, value ) {
            this.evaluation.grades = this.evaluation.grades || {};
            this.evaluation.grades[ competencyCode ] = this.evaluation.grades[ competencyCode ] || {};
            if ( role !== "team" ) {
                this.evaluation.grades[ competencyCode ][ role ] = value;
            } else {
                this.evaluation.grades[ competencyCode ].team = this.evaluation.grades[ competencyCode ].team || {};
                this.evaluation.grades[ competencyCode ].team.cumulative = value;
            }
        },

        formatDate( value ) {
            if ( !value ) return "";
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00Z`
                : value;
            const date = new Date( normalized );
            return isValidDate( date ) ? date.toLocaleDateString() : "";
        },

        isEmployeeManager() {
            return tiApplication.user && tiApplication.user.roles && tiApplication.user.roles.includes( 2 ) && this.manager.managerID === tiApplication.user.employeeID;
        },

        isEmployee() {
            return tiApplication.user && tiApplication.user.roles && tiApplication.user.roles.includes( 1 ) && this.employeeID === tiApplication.user.employeeID;
        }
    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
} );
