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
            "level": "",
            "stage": "",
            "startingDate": ""
        },
        "evaluation": {
            "cycle": "",
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

        init() {
            this.employeeID = getEmployeeIdFromUrl();
            this.loadEmployee( this.employeeID );
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
                const tiApplication = Alpine.store( "tiApplication" );
                tiApplication.sendRequest( url ).then( ( result ) => {
                    this.applyData( result?.data );
                } ).catch( ( error ) => {
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

        getItemGrade( item, role ) {
            if ( !item || !item.grades ) {
                return "";
            }
            return item.grades[ role ] || "";
        },

        setItemGrade( item, role, value ) {
            if ( !item ) {
                return;
            }
            if ( !item.grades ) {
                item.grades = {};
            }
            item.grades[ role ] = value;
        },

        formatDate( value ) {
            if ( !value ) return "";
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00Z`
                : value;
            return new Date( normalized ).toLocaleDateString();
        },

        // Compute summary for a category based on manager grades majority across all items.
        categorySummary( category ) {
            const counts = { U: 0, R: 0, S: 0 };
            for ( const sub of category.subcategories ) {
                for ( const item of sub.items ) {
                    const g = ( item.grades?.manager || '' ).toUpperCase();
                    if ( g === 'U' || g === 'R' || g === 'S' ) counts[ g ]++;
                }
            }
            const best = Object.entries( counts ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ];
            return ( best && best[ 1 ] > 0 ) ? best[ 0 ] : '-';
        },

        totalSummary() {
            const counts = { U: 0, R: 0, S: 0 };
            for ( const cat of this.competencies ) {
                for ( const sub of cat.subcategories ) {
                    for ( const item of sub.items ) {
                        const g = ( item.grades?.manager || '' ).toUpperCase();
                        if ( g === 'U' || g === 'R' || g === 'S' ) counts[ g ]++;
                    }
                }
            }
            const best = Object.entries( counts ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ];
            return ( best && best[ 1 ] > 0 ) ? best[ 0 ] : '-';
        },

        badgeClass( val ) {
            switch ( val ) {
                case 'S':
                    return 'ti-badge-success';
                case 'R':
                    return 'ti-badge-warning';
                case 'U':
                    return 'ti-badge-danger';
                default:
                    return 'ti-badge';
            }
        }
    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
} );
