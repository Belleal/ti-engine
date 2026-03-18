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
        userRole: null,
        deadlineDate: null,
        canEdit: false,
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
            this.personal = clone( fresh.personal || initialDataModels.competencyEvaluation.personal );
            this.manager = clone( fresh.manager || initialDataModels.competencyEvaluation.manager );
            this.userRole = fresh.userRole;
            this.deadlineDate = fresh.deadlineDate;
            this.canEdit = fresh.canEdit;
            this.evaluation = clone( fresh.evaluation || initialDataModels.competencyEvaluation.evaluation );
            this.competencies = clone( fresh.competencies || initialDataModels.competencyEvaluation.competencies );
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

        setInterviewDate( value ) {
            this.evaluation.interviewDate = value;
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
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00`
                : value;
            const date = new Date( normalized );
            return isValidDate( date ) ? date.toLocaleDateString() : tiApplication.getLabel( placeholder, "" );
        }

    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
} );
