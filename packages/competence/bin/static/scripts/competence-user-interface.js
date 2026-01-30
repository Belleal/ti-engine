let initial = {
    "personal": {
        "name": "Boris Kostadinov",
        "position": "Director of Software Integrations",
        "department": "Software Integrations",
        "manager": "The Boss",
        "level": "X1",
        "startingDate": "01.01.2020"
    },
    "evaluation": {
        "cycle": "2026-1",
        "cycleDate": "15.05.2026",
        "interviewDate": "23.05.2026"
    },
    "competences": [
        {
            "id": "E",
            "name": "Expertise",
            "subcategories": [
                {
                    "id": "E1",
                    "name": "Theoretical knowledge",
                    "items": [
                        {
                            "id": "E1.1",
                            "name": "Foundations",
                            "description": "Understands core principles and concepts.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        },
                        {
                            "id": "E1.2",
                            "name": "Methodologies",
                            "description": "Understands methodologies and patterns.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        }
                    ]
                },
                {
                    "id": "E2",
                    "name": "Applied skills",
                    "items": [
                        {
                            "id": "E2.1",
                            "name": "Coding",
                            "description": "Applies knowledge in code.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        },
                        {
                            "id": "E2.2",
                            "name": "Debugging",
                            "description": "Finds and fixes defects effectively.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        }
                    ]
                }
            ],
            "feedback": { "manager": "", "employee": "" }
        },
        {
            "id": "I",
            "name": "Impact",
            "subcategories": [
                {
                    "id": "I1",
                    "name": "Delivery",
                    "items": [
                        {
                            "id": "I1.1",
                            "name": "Execution",
                            "description": "Delivers on commitments.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        }
                    ]
                }
            ],
            "feedback": { "manager": "", "employee": "" }
        },
        {
            "id": "C",
            "name": "Collaboration",
            "subcategories": [
                {
                    "id": "C1",
                    "name": "Teamwork",
                    "items": [
                        {
                            "id": "C1.1",
                            "name": "Code reviews",
                            "description": "Participates constructively in reviews.",
                            "grades": { "manager": "", "employee": "", "team": "" }
                        }
                    ]
                }
            ],
            "feedback": { "manager": "", "employee": "" }
        }
    ]
};


let configureCompetenceEvaluation = () => {
    return {
        personal: initial.personal,
        evaluation: initial.evaluation,
        competences: initial.competences,

        reset() {
            const schemaEl = document.getElementById( 'competence-evaluation-schema' );
            const fresh = schemaEl ? JSON.parse( schemaEl.textContent || '{}' ) : { personal: {}, evaluation: {}, competences: [] };
            this.personal = JSON.parse( JSON.stringify( fresh.personal ) );
            this.evaluation = JSON.parse( JSON.stringify( fresh.evaluation || initial.evaluation ) );
            this.competences = JSON.parse( JSON.stringify( fresh.competences ) );
        },

        save() {
            // Placeholder: integrate with backend via HTMX or service call.
            if ( window.tiNotify ) {
                window.tiNotify.success( 'Form state captured locally. Wire up persistence next.' );
            }
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
            for ( const cat of this.competences ) {
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
    Alpine.data( "competenceEvaluation", configureCompetenceEvaluation );
} );
