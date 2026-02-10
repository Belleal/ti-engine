/**
 * Initialization data models for the various Competence screens.
 *
 * @constant
 */
const initialDataModels = {
    "competencyEvaluation": {
        "personal": {
            "name": "",
            "position": "",
            "department": "",
            "manager": "",
            "managerID": "",
            "level": "",
            "stage": "",
            "startingDate": ""
        },
        "evaluation": {
            "cycle": "",
            "cycleID": "",
            "cycleDate": "",
            "interviewDate": ""
        },
        "competencies": [
            {
                "id": "E",
                "name": "Expertise",
                "subcategories": [
                    {
                        "id": "E1",
                        "name": "Theoretical knowledge",
                        "items": []
                    },
                    {
                        "id": "E2",
                        "name": "Applied skills",
                        "items": []
                    }
                ]
            },
            {
                "id": "I",
                "name": "Impact",
                "subcategories": [
                    {
                        "id": "I1",
                        "name": "Delivery",
                        "items": []
                    }
                ]
            },
            {
                "id": "C",
                "name": "Collaboration",
                "subcategories": [
                    {
                        "id": "C1",
                        "name": "Teamwork",
                        "items": []
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

    const getEmployeeIdFromUrl = () => {
        const params = new URLSearchParams( window.location.search );
        return params.get( "employeeID" );
    };

    return {
        employeeID: null,
        personal: clone( initialDataModels.competencyEvaluation.personal ),
        evaluation: clone( initialDataModels.competencyEvaluation.evaluation ),
        competencies: clone( initialDataModels.competencyEvaluation.competencies ),
        grades: {},

        init() {
            const onInitialized = () => {
                this.grades = tiApplication.configuration.grades;
                this.employeeID = getEmployeeIdFromUrl();
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
            this.evaluation = clone( fresh.evaluation || initialDataModels.competencyEvaluation.evaluation );
            this.competencies = clone( fresh.competencies || initialDataModels.competencyEvaluation.competencies );
        },

        loadEmployee( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            if ( !resolvedID ) {
                this.reset();
            } else {
                this.employeeID = resolvedID;
                const url = `/app/load-employee-competencies?employeeID=${ encodeURIComponent( resolvedID ) }`;
                tiApplication.sendRequest( url ).then( ( result ) => {
                    this.applyData( result?.data );
                } ).catch( ( error ) => {
                    if ( error?.name === "AbortError" || error?.isAborted ) return;

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

        save() {
            // TODO: implement this!
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

        formatDate( value ) {
            if ( !value ) return "";
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00Z`
                : value;
            const date = new Date( normalized );
            return isValidDate( date ) ? date.toLocaleDateString() : "";
        },

        isEmployeeManager() {
            return tiApplication.user && tiApplication.user.roles && tiApplication.user.roles.includes( 2 ) && this.personal.managerID === tiApplication.user.employeeID;
        },

        isEmployee() {
            return tiApplication.user && tiApplication.user.roles && tiApplication.user.roles.includes( 1 ) && this.employeeID === tiApplication.user.employeeID;
        }
    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
} );
