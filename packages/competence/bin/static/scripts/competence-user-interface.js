/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Returns a configuration object for the competency evaluation screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureCompetenceEvaluation = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        employeeID: null,
        userRole: null,
        deadlineDate: null,
        teamReviewers: null,
        isTeamEvaluationCollective: false,
        canEdit: false,
        manager: {},
        personal: {},
        evaluation: {
            scores: {},
            finalScore: {}
        },
        feedback: {},
        competencies: {},
        grades: {},
        showEvaluationForm: false,
        noEvaluationState: null,
        warningMessage: "",

        init() {
            const onInitialized = () => {
                this.grades = tiApplication.configuration.grades;
                this.employeeID = tiToolbox.getUrlParam( "employeeID" );
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
            this.personal = fresh.personal ? tiToolbox.structuredClone( fresh.personal ) : {};
            this.manager = fresh.manager ? tiToolbox.structuredClone( fresh.manager ) : {};
            this.userRole = fresh.userRole;
            this.deadlineDate = fresh.deadlineDate;
            this.teamReviewers = fresh.teamReviewers ? tiToolbox.structuredClone( fresh.teamReviewers ) : null;
            this.canEdit = fresh.canEdit;
            this.evaluation = fresh.evaluation ? tiToolbox.structuredClone( fresh.evaluation ) : {
                scores: {},
                finalScore: {}
            };
            this.competencies = fresh.competencies ? tiToolbox.structuredClone( fresh.competencies ) : {};

            tiApplication.setTopbarSubtitle( this.personal.name || "" );
            this.warningMessage = this.getEvaluationWarning();
        },

        loadEmployeeEvaluation( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            if ( resolvedID ) {
                this.employeeID = resolvedID;
            }
            const evaluationID = tiToolbox.getUrlParam( "evaluationID" );
            const params = new URLSearchParams();
            if ( resolvedID ) params.set( "employeeID", resolvedID );
            if ( evaluationID ) params.set( "evaluationID", evaluationID );
            const paramString = params.toString();
            const url = `/app/load-evaluation${ paramString ? `?${ paramString }` : "" }`;
            tiApplication.sendRequest( url ).then( ( result ) => {
                if ( result?.data?.noEvaluation ) {
                    this.showEvaluationForm = false;
                    this.applyData( {} );
                    this.noEvaluationState = "none";
                    return;
                }
                this.noEvaluationState = null;
                this.showEvaluationForm = true;
                this.applyData( result?.data );
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }
                this.showEvaluationForm = false;
                this.applyData( {} );
                this.noEvaluationState = null;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        reset() {
            const schema = document.getElementById( "competency-evaluation-schema" );
            if ( schema ) {
                const initial = JSON.parse( schema.textContent || '{}' );
                this.applyData( initial );
            } else {
                this.loadEmployeeEvaluation( this.employeeID );
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

        setFeedbackComment( role, value ) {
            if ( role === "employee" ) {
                this.evaluation.comment = value;
            } else if ( role === "manager" ) {
                this.evaluation.feedback = this.evaluation.feedback || {};
                this.evaluation.feedback.managerComment = value;
            } else if ( role === "team" ) {
                this.evaluation.feedback = this.evaluation.feedback || {};
                this.evaluation.feedback.teamComments = value;
            }
        },

        getEvaluationWarning() {
            if ( !this.evaluation ) {
                return "";
            }

            const now = new Date();
            const deadline = this.deadlineDate ? new Date( this.deadlineDate ) : null;

            if ( deadline && now > deadline ) {
                return "interface.evaluation.messages.deadline-expired";
            } else if ( this.userRole === 2 ) {
                if ( this.evaluation.status === 'Open' ) {
                    return "interface.evaluation.messages.waiting-for-employees";
                }
            } else if ( this.userRole === 1 ) {
                if ( this.evaluation.status === 'In Review' ) {
                    return "interface.evaluation.messages.waiting-for-manager";
                }
            }

            return "";
        },

        getFeedbackComment( role ) {
            const defaultComment = tiApplication.getLabel( "interface.evaluation.default.not-provided" );
            if ( role === "employee" ) {
                return this.evaluation.comment || defaultComment;
            } else if ( role === "manager" ) {
                return this.evaluation.feedback?.managerComment || defaultComment;
            } else if ( role === "team" ) {
                return this.evaluation.feedback?.teamComments || [];
            } else {
                return defaultComment;
            }
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        },

        toggleGrade( competencyCode, role, gradeKey ) {
            const current = this.getItemGrade( competencyCode, role );
            this.setItemGrade( competencyCode, role, current === gradeKey ? "" : gradeKey );
        },

        getGradeChipClass( competencyCode, role, gradeKey ) {
            const current = this.getItemGrade( competencyCode, role );
            return current === gradeKey ? "selectable selected" : "selectable";
        },

        getGradeShortDesc( gradeKey ) {
            return tiApplication.getLabel( `interface.evaluation.grades.short.${ gradeKey }`, "" );
        },

        getPageTitle() {
            if ( this.userRole === 1 ) return "interface.evaluation.page.employee-title";
            if ( this.userRole === 2 ) return "interface.evaluation.page.manager-title";
            if ( this.userRole === 4 ) return "interface.evaluation.page.team-title";
            return "";
        },

        getPageDesc() {
            if ( this.userRole === 1 ) return "interface.evaluation.page.employee-desc";
            if ( this.userRole === 2 ) return "interface.evaluation.page.manager-desc";
            if ( this.userRole === 4 ) return "interface.evaluation.page.team-desc";
            return "";
        },

        getRolePanelTitle() {
            if ( this.userRole === 1 ) return "interface.evaluation.banners.employee-title";
            if ( this.userRole === 2 ) return "interface.evaluation.banners.manager-title";
            if ( this.userRole === 4 ) return "interface.evaluation.banners.team-title";
            return "";
        },

        getRolePanelDesc() {
            if ( this.userRole === 1 ) return "interface.evaluation.banners.employee-desc";
            if ( this.userRole === 2 ) return "interface.evaluation.banners.manager-desc";
            if ( this.userRole === 4 ) return "interface.evaluation.banners.team-desc";
            return "";
        },

        getContextualDeadline() {
            if ( this.evaluation?.status === "Ready" ) {
                return this.evaluation?.interviewDate || null;
            }
            return this.deadlineDate || null;
        },

        getDeadlineLabel() {
            if ( this.evaluation?.status === "Ready" ) {
                return "interface.evaluation.appraisal.interview-date";
            }
            return "interface.evaluation.appraisal.submission-deadline";
        },

        getContextualDeadlinePlaceholder() {
            if ( this.evaluation?.status === "Ready" ) {
                return "interface.evaluation.appraisal.interview-date-not-set";
            }
            return "interface.evaluation.appraisal.submission-deadline-not-set";
        },

        getDaysLeft( dateStr ) {
            if ( !dateStr ) return null;
            const diffMs = new Date( dateStr ).getTime() - Date.now();
            const diffDays = Math.ceil( diffMs / ( 1000 * 60 * 60 * 24 ) );
            return diffDays > 0 ? diffDays : null;
        },

        getStatusPillTone() {
            const status = this.evaluation?.status;
            if ( status === "Open" ) return "info";
            if ( status === "In Review" ) return "warn";
            if ( status === "Ready" ) return "success";
            return "";
        },

        getEvalStatusSteps() {
            return [
                tiApplication.getLabel( "framework.status.name.open", "Open" ),
                tiApplication.getLabel( "framework.status.name.in-review", "In Review" ),
                tiApplication.getLabel( "framework.status.name.ready", "Ready" ),
                tiApplication.getLabel( "framework.status.name.closed", "Closed" )
            ];
        },

        getStatusStageIndex() {
            const status = this.evaluation?.status;
            if ( status === "Open" ) return 0;
            if ( status === "In Review" ) return 1;
            if ( status === "Ready" ) return 2;
            if ( status === "Closed" ) return 3;
            return -1;
        },

        getStepClass( i ) {
            const idx = this.getStatusStageIndex();
            const isComplete = idx > i || idx === 3;
            const isCurrent = idx === i && idx !== 3;
            return ( isComplete ? "complete" : "" ) + ( isCurrent ? " current" : "" );
        },

        getLineClass( i ) {
            const idx = this.getStatusStageIndex();
            const isComplete = idx > i;
            const isCurrent = idx === i;
            return ( isComplete ? "complete" : "" ) + ( isCurrent ? " current" : "" );
        },

        getGradeCount() {
            return Object.keys( this.grades || {} ).length;
        },

        getGradeScaleLabel() {
            const count = this.getGradeCount();
            const scale = tiApplication.getLabel( "interface.evaluation.instructions.point-scale", "point scale" );
            return `${ count }-${ scale }`;
        },

        getStickyProgressText() {
            const of = tiApplication.getLabel( "interface.evaluation.sticky.of", "of" );
            const total = this.getTotalCount();
            const isCollectiveTeam = this.userRole === 4 && this.isTeamEvaluationCollective;
            const graded = isCollectiveTeam
                ? tiApplication.getLabel( "interface.evaluation.sticky.subcategories-graded", "subcategories graded" )
                : tiApplication.getLabel( "interface.evaluation.sticky.graded", "competencies graded" );
            return `${ of } ${ total } ${ graded }`;
        },

        getCategoryGradedCount( categoryId ) {
            if ( !this.evaluation?.grades ) return 0;
            const role = this.getUserRoleAsText();
            if ( !role ) return 0;
            const prefix = categoryId ? categoryId.charAt( 0 ) : "";
            return Object.entries( this.evaluation.grades )
                .filter( ( [ code, g ] ) => code.startsWith( prefix ) && g && g[ role ] )
                .length;
        },

        getCategoryTotalCount( categoryId ) {
            if ( !Array.isArray( this.competencies ) ) return 0;
            const category = this.competencies.find( ( cat ) => cat.id === categoryId );
            if ( !category || !Array.isArray( category.subcategories ) ) return 0;
            return category.subcategories.reduce( ( sum, sub ) => sum + ( Array.isArray( sub.items ) ? sub.items.length : 0 ), 0 );
        },

        getCategoryGradedPct( categoryId ) {
            const total = this.getCategoryTotalCount( categoryId );
            if ( total === 0 ) return 0;
            return Math.round( ( this.getCategoryGradedCount( categoryId ) / total ) * 100 );
        },

        getTotalCount() {
            if ( !Array.isArray( this.competencies ) ) return 0;
            if ( this.userRole === 4 && this.isTeamEvaluationCollective ) {
                return this.competencies.reduce( ( sum, cat ) => sum + ( Array.isArray( cat.subcategories ) ? cat.subcategories.length : 0 ), 0 );
            }
            return this.competencies.reduce( ( sum, cat ) =>
                sum + ( Array.isArray( cat.subcategories ) ? cat.subcategories.reduce( ( s, sub ) =>
                    s + ( Array.isArray( sub.items ) ? sub.items.length : 0 ), 0 ) : 0 ), 0 );
        },

        getGradedCount() {
            const role = this.getUserRoleAsText();
            if ( !role ) return 0;
            if ( this.userRole === 4 && this.isTeamEvaluationCollective ) {
                if ( !Array.isArray( this.competencies ) ) return 0;
                return this.competencies.reduce( ( sum, cat ) => {
                    if ( !Array.isArray( cat.subcategories ) ) return sum;
                    return sum + cat.subcategories.filter( ( sub ) => {
                        const g = this.evaluation.grades && this.evaluation.grades[ sub.id ];
                        return g && g.team;
                    } ).length;
                }, 0 );
            }
            if ( !this.evaluation?.grades ) return 0;
            return Object.values( this.evaluation.grades ).filter( ( g ) => g && g[ role ] ).length;
        },

        getGradedPct() {
            const total = this.getTotalCount();
            if ( total === 0 ) return 0;
            return Math.round( ( this.getGradedCount() / total ) * 100 );
        },

        getTeamReviewersPct() {
            if ( !this.teamReviewers || !this.teamReviewers.total ) return 0;
            return Math.round( ( this.teamReviewers.submitted / this.teamReviewers.total ) * 100 );
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
const configureEmployeesList = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        unitType: "",
        unitName: "",
        unitBranch: "",
        unitLocation: "",
        unitManagers: "",
        units: [],
        isManagerView: false,
        // Gates the inline "Start evaluation" affordances. Mirrors the backend's #startEvaluation guard so the
        // user only sees the button when clicking it would actually succeed. Backend remains the source of truth.
        hasActiveCycle: false,

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
                this.hasActiveCycle = data.hasActiveCycle === true;
                this.unitType = String( rootUnit.type || "" ).trim();
                this.unitName = String( rootUnit.name || "" ).trim();
                this.unitBranch = String( rootUnit.branch || "" ).trim();
                this.unitLocation = String( rootUnit.location || "" ).trim();
                this.unitManagers = this.formatList( rootUnit.managers );
                this.units = [];
                this.flattenUnits( organizationUnits, this.units );
                tiApplication.setTopbarSubtitle( this.unitName );
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

        startNewEvaluation( employeeID ) {
            tiApplication.openScreen( "new-evaluation?employeeID=" + encodeURIComponent( employeeID ) );
        },

        openEvaluation( employeeID, evaluationID ) {
            let screen = "competence-evaluation?employeeID=" + encodeURIComponent( employeeID );
            if ( evaluationID ) {
                screen += "&evaluationID=" + encodeURIComponent( evaluationID );
            }
            tiApplication.openScreen( screen );
        },

        openEmployeeManagement( employeeID ) {
            tiApplication.openScreen( "employee-management?employeeID=" + encodeURIComponent( employeeID ) );
        },

        totalEmployees() {
            let total = 0;
            for ( let i = 0; i < this.units.length; i++ ) {
                total += this.units[ i ].employees.length;
            }
            return total;
        },

        totalInCycle() {
            let total = 0;
            for ( let i = 0; i < this.units.length; i++ ) {
                total += ( this.units[ i ].inCycle || 0 );
            }
            return total;
        },

        totalReady() {
            let total = 0;
            for ( let i = 0; i < this.units.length; i++ ) {
                total += ( this.units[ i ].ready || 0 );
            }
            return total;
        },

        getEvalTone( statusTone ) {
            return statusTone || "";
        },

        formatList( values, separator = ", " ) {
            if ( Array.isArray( values ) ) {
                return values.map( ( entry ) => String( entry || "" ).trim() ).filter( Boolean ).join( separator );
            } else if ( typeof values === "string" ) {
                return values.trim();
            }
            return "";
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }

    };
};

/**
 * Returns a configuration object for the new evaluation screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureNewEvaluation = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        employeeID: null,
        personal: {},
        manager: {},
        evaluation: {},
        availableTeamMembers: [],
        team: [],
        selectedTeamMemberID: "",
        competencyCount: 0,
        categoryCount: 0,
        minTeamMembers: 1,
        maxTeamMembers: null,
        // Surfaced inline (as an empty state) instead of via toast when the backend reports no active cycle —
        // the user can't start an evaluation, so showing the action bar would be misleading.
        noActiveCycle: false,

        init() {
            const onInitialized = () => {
                this.employeeID = tiToolbox.getUrlParam( "employeeID" );
                this.loadData( this.employeeID );
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

        loadData( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            if ( !resolvedID ) {
                this.applyData( {} );
            } else {
                this.employeeID = resolvedID;
                const url = `/app/load-new-evaluation-data?employeeID=${ encodeURIComponent( resolvedID ) }`;
                tiApplication.sendRequest( url ).then( ( result ) => {
                    this.applyData( result?.data );
                } ).catch( ( error ) => {
                    if ( error?.name === "AbortError" || error?.isAborted ) {
                        return;
                    }
                    this.applyData( {} );
                    // 5005 + "error.evaluation.no-active-cycle" → render an inline empty state and suppress the
                    // toast. Any other error keeps the existing toast behavior so the user still sees what went wrong.
                    if ( error?.exception?.code === 5005 && error?.exception?.data?.details === "error.evaluation.no-active-cycle" ) {
                        this.noActiveCycle = true;
                        return;
                    }
                    tiApplication.notify( tiApplication.formatException( error ) );
                    if ( error.exception?.httpCode === 401 ) {
                        tiApplication.openScreen( "dashboard" );
                    }
                } );
            }
        },

        applyData( data ) {
            const fresh = ( data && typeof data === "object" ) ? data : {};
            this.personal = fresh.personal ? tiToolbox.structuredClone( fresh.personal ) : {};
            this.manager = fresh.manager ? tiToolbox.structuredClone( fresh.manager ) : {};
            this.evaluation = fresh.evaluation ? tiToolbox.structuredClone( fresh.evaluation ) : {};
            this.availableTeamMembers = fresh.availableTeamMembers ? tiToolbox.structuredClone( fresh.availableTeamMembers ) : [];
            this.competencyCount = fresh.evaluation?.competencyCount || 0;
            this.categoryCount = fresh.evaluation?.categoryCount || 0;
            this.minTeamMembers = typeof fresh.minTeamMembers === "number" ? fresh.minTeamMembers : 1;
            this.maxTeamMembers = typeof fresh.maxTeamMembers === "number" ? fresh.maxTeamMembers : null;
            this.team = [];
            this.selectedTeamMemberID = "";
            this.noActiveCycle = false;
        },

        getPageTitle() {
            const label = tiApplication.getLabel( "interface.evaluation.new-eval.page-title" );
            return ( label || "" ).replace( "{name}", this.personal.name || "" );
        },

        getCompetencyCountText() {
            if ( !this.competencyCount ) {
                return "";
            }
            const across = tiApplication.getLabel( "interface.evaluation.new-eval.across-categories" );
            return `${ this.competencyCount } ${ ( across || "across {n} categories" ).replace( "{n}", String( this.categoryCount ) ) }`;
        },

        getTeamPanelDesc() {
            const label = tiApplication.getLabel( "interface.evaluation.new-eval.team-desc" );
            return ( label || "" ).replace( "{name}", this.personal.name || "" );
        },

        getTeamHintText() {
            const min = this.minTeamMembers;
            const max = this.maxTeamMembers;
            if ( !min ) return "";

            const RECOMMENDED_MIN = 3;
            if ( max !== null && max !== undefined ) {
                const rangeLabel = tiApplication.getLabel( "interface.evaluation.new-eval.team-hint-range" ) || "Minimum: {min} — Maximum: {max} peers";
                let text = rangeLabel.replace( "{min}", String( min ) ).replace( "{max}", String( max ) );
                if ( min < RECOMMENDED_MIN ) {
                    const recLabel = tiApplication.getLabel( "interface.evaluation.new-eval.team-hint-recommended" ) || "Recommended: {n}+";
                    text += " · " + recLabel.replace( "{n}", String( RECOMMENDED_MIN ) );
                }
                return text;
            }
            const minLabel = tiApplication.getLabel( "interface.evaluation.new-eval.team-hint-min" ) || "Minimum: {n} peers";
            let text = minLabel.replace( "{n}", String( min ) );
            if ( min < RECOMMENDED_MIN ) {
                const recLabel = tiApplication.getLabel( "interface.evaluation.new-eval.team-hint-recommended" ) || "Recommended: {n}+";
                text += " · " + recLabel.replace( "{n}", String( RECOMMENDED_MIN ) );
            }
            return text;
        },

        addTeamMember() {
            if ( this.selectedTeamMemberID && !this.team.find( m => m.employeeID === this.selectedTeamMemberID ) ) {
                if ( this.maxTeamMembers !== null && this.team.length >= this.maxTeamMembers ) {
                    this.selectedTeamMemberID = "";
                    return;
                }
                const member = this.availableTeamMembers.find( m => m.employeeID === this.selectedTeamMemberID );
                if ( member ) {
                    this.team.push( { employeeID: member.employeeID, name: member.name } );
                }
            }
            this.selectedTeamMemberID = "";
        },

        removeTeamMember( employeeID ) {
            this.team = this.team.filter( m => m.employeeID !== employeeID );
        },

        submitNewEvaluation() {
            const teamIDs = this.team.map( m => m.employeeID );
            if ( this.minTeamMembers > 0 && teamIDs.length < this.minTeamMembers ) {
                const label = tiApplication.getLabel( "interface.evaluation.new-eval.team-min-error" ) || "Please add at least {min} team reviewers.";
                tiApplication.notify( label.replace( "{min}", String( this.minTeamMembers ) ) );
                return;
            }
            tiApplication.sendRequest( "/app/start-evaluation", "POST", {
                employeeID: this.employeeID,
                team: teamIDs
            } ).then( ( result ) => {
                const evaluationID = result?.data;
                let screen = "competence-evaluation?employeeID=" + encodeURIComponent( this.employeeID );
                if ( evaluationID ) {
                    screen += "&evaluationID=" + encodeURIComponent( evaluationID );
                }
                tiApplication.openScreen( screen );
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        cancel() {
            tiApplication.openScreen( "employees-list" );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        }
    };
};

/**
 * Returns a configuration object for the manager availability calendar screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureManagerCalendar = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const DAY_NAMES = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];

    const parseTime = ( timeStr ) => {
        const [ h, m ] = String( timeStr || "09:00" ).split( ":" ).map( Number );
        return h * 60 + ( m || 0 );
    };

    const minutesToTime = ( minutes ) => {
        const h = Math.floor( minutes / 60 );
        const m = minutes % 60;
        return `${ String( h ).padStart( 2, "0" ) }:${ String( m ).padStart( 2, "0" ) }`;
    };

    return {
        cycleID: "",
        cycleDate: "",
        managerID: "",
        config: { slotDurationMinutes: 30, workingHoursStart: "09:00", workingHoursEnd: "18:00", workingDays: [ 1, 2, 3, 4, 5 ] },
        slots: {},
        currentWeekStart: null,

        init() {
            this.currentWeekStart = tiToolbox.getMonday( new Date() );

            const onInitialized = () => {
                this.loadCalendar();
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

        loadCalendar() {
            tiApplication.sendRequest( "/app/load-manager-calendar" ).then( ( result ) => {
                const data = ( result?.data && typeof result.data === "object" ) ? result.data : {};
                this.cycleID = data.cycleID || "";
                this.cycleDate = data.cycleDate || "";
                this.managerID = data.managerID || "";
                this.config = data.config || this.config;
                this.slots = {};
                if ( Array.isArray( data.slots ) ) {
                    data.slots.forEach( ( slot ) => {
                        this.slots[ `${ slot.date }|${ slot.startTime }` ] = slot;
                    } );
                }
                tiApplication.setTopbarSubtitle( this.getLabel( 'interface.calendar.page-subtitle' ) + ' ' + this.cycleID );
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

        toggleSlot( date, startTime, targetStatus = "available" ) {
            const key = `${ date }|${ startTime }`;
            const existing = this.slots[ key ];
            if ( existing && existing.status === "booked" ) {
                return;
            }
            tiApplication.sendRequest( "/app/toggle-calendar-slot", "POST", { date, startTime, targetStatus } ).then( ( result ) => {
                const action = result?.data?.action;
                if ( action === "removed" ) {
                    delete this.slots[ key ];
                } else if ( ( action === "added" || action === "updated" ) && result?.data?.slot ) {
                    this.slots[ key ] = result.data.slot;
                }
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        getWeekDays() {
            const days = [];
            const workingDays = Array.isArray( this.config.workingDays ) ? this.config.workingDays : [ 1, 2, 3, 4, 5 ];
            for ( let i = 0; i < 7; i++ ) {
                const d = new Date( this.currentWeekStart );
                d.setDate( d.getDate() + i );
                const dayOfWeek = d.getDay();
                if ( workingDays.includes( dayOfWeek ) ) {
                    days.push( {
                        date: tiToolbox.toDateString( d ),
                        dayLabel: DAY_NAMES[ dayOfWeek ],
                        dateLabel: `${ String( d.getDate() ).padStart( 2, "0" ) } ${ d.toLocaleString( "en", { month: "short" } ) }`
                    } );
                }
            }
            return days;
        },

        getTimeSlots() {
            const slots = [];
            const start = parseTime( this.config.workingHoursStart );
            const end = parseTime( this.config.workingHoursEnd );
            const step = Number( this.config.slotDurationMinutes ) || 30;
            for ( let t = start; t < end; t += step ) {
                slots.push( { startTime: minutesToTime( t ) } );
            }
            return slots;
        },

        getSlotState( date, startTime ) {
            const slot = this.slots[ `${ date }|${ startTime }` ];
            if ( !slot || slot.status === "deleted" ) {
                return "empty";
            }
            return slot.status;
        },

        getSlotCssClass( date, startTime ) {
            const state = this.getSlotState( date, startTime );
            if ( state === "available" ) {
                return "competence-available";
            }
            if ( state === "busy" ) {
                return "competence-busy";
            }
            if ( state === "booked" ) {
                return "competence-booked";
            }
            return state;
        },

        handleSlotClick( date, startTime ) {
            const state = this.getSlotState( date, startTime );
            if ( state !== "empty" && state !== "booked" ) {
                this.toggleSlot( date, startTime, state );
            }
        },

        getSlotBookingLabel( date, startTime ) {
            const slot = this.slots[ `${ date }|${ startTime }` ];
            if ( slot && slot.status === "booked" && slot.booking ) {
                return slot.booking.employeeName || slot.booking.employeeID || "";
            }
            return "";
        },

        getWeekLabel() {
            if ( !this.currentWeekStart ) {
                return "";
            }
            const end = new Date( this.currentWeekStart );
            end.setDate( end.getDate() + 6 );
            const fmt = ( d ) => `${ d.getDate() } ${ d.toLocaleString( "en", { month: "short" } ) } ${ d.getFullYear() }`;
            return `${ fmt( this.currentWeekStart ) } — ${ fmt( end ) }`;
        },

        prevWeek() {
            if ( !this.canGoPrev() ) {
                return;
            }
            const d = new Date( this.currentWeekStart );
            d.setDate( d.getDate() - 7 );
            this.currentWeekStart = d;
        },

        nextWeek() {
            if ( !this.canGoNext() ) {
                return;
            }
            const d = new Date( this.currentWeekStart );
            d.setDate( d.getDate() + 7 );
            this.currentWeekStart = d;
        },

        canGoPrev() {
            if ( !this.currentWeekStart ) {
                return false;
            }
            return tiToolbox.toDateString( this.currentWeekStart ) > tiToolbox.toDateString( tiToolbox.getMonday( new Date() ) );
        },

        canGoNext() {
            if ( !this.currentWeekStart || !this.cycleDate ) {
                return true;
            }
            const cycleEnd = new Date( this.cycleDate );
            const nextWeekStart = new Date( this.currentWeekStart );
            nextWeekStart.setDate( nextWeekStart.getDate() + 7 );
            return nextWeekStart <= cycleEnd;
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        },

        isToday( dateStr ) {
            return dateStr === tiToolbox.toDateString( new Date() );
        },

        getAvailableCount() {
            const weekDates = new Set( this.getWeekDays().map( d => d.date ) );
            return Object.entries( this.slots ).filter( ( [ key, slot ] ) =>
                slot.status === "available" && weekDates.has( key.split( "|" )[ 0 ] )
            ).length;
        },

        getBookedCount() {
            const weekDates = new Set( this.getWeekDays().map( d => d.date ) );
            return Object.entries( this.slots ).filter( ( [ key, slot ] ) =>
                slot.status === "booked" && weekDates.has( key.split( "|" )[ 0 ] )
            ).length;
        },

        getCycleDaysLeft() {
            if ( !this.cycleDate ) {
                return null;
            }
            const end = new Date( this.cycleDate );
            const today = new Date();
            today.setHours( 0, 0, 0, 0 );
            end.setHours( 0, 0, 0, 0 );
            return Math.max( 0, Math.ceil( ( end - today ) / ( 1000 * 60 * 60 * 24 ) ) );
        },

        getCycleSubText() {
            if ( !this.cycleID ) {
                return "";
            }
            const days = this.getCycleDaysLeft();
            if ( days === null ) {
                return this.cycleID;
            }
            return `${ this.cycleID } · ${ days } ${ this.getLabel( "interface.calendar.days-left" ) }`;
        },

        getSlotLabel( date, startTime ) {
            const state = this.getSlotState( date, startTime );
            if ( state === "available" ) {
                return this.getLabel( "interface.calendar.slot-free" );
            }
            if ( state === "busy" ) {
                return this.getLabel( "interface.calendar.slot-busy" );
            }
            return "";
        }

    };
};

/**
 * Returns a configuration object for the supervisor interview scheduling screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureInterviewSchedule = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const DAY_NAMES_SHORT = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];

    return {
        cycleID: "",
        evaluations: [],
        slots: [],
        selectedEvaluationID: null,
        slotViewStart: null,
        config: {},

        init() {
            const onInitialized = () => {
                this.loadSchedule();
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

        loadSchedule() {
            tiApplication.sendRequest( "/app/load-interview-schedule" ).then( ( result ) => {
                const data = ( result?.data && typeof result.data === "object" ) ? result.data : {};
                this.cycleID = data.cycleID || "";
                this.evaluations = Array.isArray( data.evaluations ) ? tiToolbox.structuredClone( data.evaluations ) : [];
                this.slots = Array.isArray( data.slots ) ? tiToolbox.structuredClone( data.slots ) : [];
                this.config = data.config || {};
                this.selectedEvaluationID = null;

                const todayMonday = tiToolbox.getMonday( new Date() );
                const available = this.slots.filter( ( s ) => s.status === "available" );
                if ( available.length > 0 ) {
                    const earliest = available.reduce( ( a, b ) => ( a.date <= b.date ? a : b ) );
                    const earliestMonday = tiToolbox.getMonday( new Date( earliest.date + "T00:00:00" ) );
                    this.slotViewStart = earliestMonday < todayMonday ? todayMonday : earliestMonday;
                } else {
                    this.slotViewStart = todayMonday;
                }
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

        selectEvaluation( evaluationID ) {
            this.selectedEvaluationID = ( this.selectedEvaluationID === evaluationID ) ? null : evaluationID;
        },

        bookSlot( slotID ) {
            if ( !this.selectedEvaluationID ) {
                return;
            }
            tiApplication.sendRequest( "/app/book-interview-slot", "POST", {
                slotID: slotID,
                evaluationID: this.selectedEvaluationID
            } ).then( () => {
                this.loadSchedule();
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        cancelBooking( slotID ) {
            if ( !slotID ) {
                return;
            }
            tiApplication.sendRequest( "/app/cancel-interview-booking", "POST", { slotID: slotID } ).then( () => {
                this.loadSchedule();
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        hasAvailableSlots() {
            return this.slots.some( ( s ) => s.status === "available" );
        },

        getSlotViewWeeks() {
            if ( !this.slotViewStart ) {
                return [];
            }
            const available = this.slots.filter( ( s ) => s.status === "available" );
            const weeks = [];
            const fmt = ( d ) => `${ d.getDate() } ${ d.toLocaleString( "en", { month: "short" } ) }`;
            for ( let w = 0; w < 4; w++ ) {
                const weekStart = new Date( this.slotViewStart );
                weekStart.setDate( weekStart.getDate() + w * 7 );
                const weekEnd = new Date( weekStart );
                weekEnd.setDate( weekEnd.getDate() + 6 );
                const weekStartStr = tiToolbox.toDateString( weekStart );
                const weekEndStr = tiToolbox.toDateString( weekEnd );
                const weekSlots = available
                    .filter( ( s ) => s.date >= weekStartStr && s.date <= weekEndStr )
                    .sort( ( a, b ) => `${ a.date }|${ a.startTime }`.localeCompare( `${ b.date }|${ b.startTime }` ) );
                weeks.push( {
                    weekLabel: `${ fmt( weekStart ) } — ${ fmt( weekEnd ) }`,
                    slots: weekSlots
                } );
            }
            return weeks;
        },

        prevSlotWeeks() {
            if ( !this.canGoPrevSlotWeeks() ) {
                return;
            }
            const todayMonday = tiToolbox.getMonday( new Date() );
            const d = new Date( this.slotViewStart );
            d.setDate( d.getDate() - 28 );
            this.slotViewStart = d < todayMonday ? todayMonday : d;
        },

        nextSlotWeeks() {
            if ( !this.canGoNextSlotWeeks() ) {
                return;
            }
            const d = new Date( this.slotViewStart );
            d.setDate( d.getDate() + 28 );
            this.slotViewStart = d;
        },

        canGoPrevSlotWeeks() {
            if ( !this.slotViewStart ) {
                return false;
            }
            return tiToolbox.toDateString( this.slotViewStart ) > tiToolbox.toDateString( tiToolbox.getMonday( new Date() ) );
        },

        canGoNextSlotWeeks() {
            if ( !this.slotViewStart ) {
                return false;
            }
            const windowEnd = new Date( this.slotViewStart );
            windowEnd.setDate( windowEnd.getDate() + 28 );
            const windowEndStr = tiToolbox.toDateString( windowEnd );
            return this.slots.some( ( s ) => s.status === "available" && s.date >= windowEndStr );
        },

        formatSlotTime( slot ) {
            if ( !slot ) {
                return "";
            }
            const d = new Date( slot.date + "T00:00:00" );
            return `${ DAY_NAMES_SHORT[ d.getDay() ] || "" } ${ String( d.getDate() ).padStart( 2, "0" ) } ${ slot.startTime }`;
        },

        pendingCount() {
            return this.evaluations.filter( ( e ) => !e.interviewDate ).length;
        },

        getEvalMeta( evaluation ) {
            const displayID = evaluation.shortID || evaluation.evaluationID;
            return [ displayID, evaluation.roleFamilyName, evaluation.stageLevel ]
                .filter( ( v ) => !!v )
                .join( " · " );
        },

        getScoreText( evaluation ) {
            if ( evaluation.finalScore === null || evaluation.finalScore === undefined ) return "—";
            const grade = evaluation.finalScoreGrade ? this.getLabel( evaluation.finalScoreGrade ) : "";
            return grade ? `${ evaluation.finalScore } · ${ grade }` : String( evaluation.finalScore );
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }

    };
};

/**
 * Returns a configuration object for the dashboard screen.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureDashboard = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        isLoading: true,
        isManager: false,
        cycle: {},
        myEvaluation: null,
        teamEvaluations: [],
        stats: { total: 0, open: 0, inReview: 0, ready: 0 },
        activity: [],
        tasks: [],
        employeeMetrics: { peerFeedback: { submitted: 0, requested: 0 }, selfGrades: { completed: 0, total: 0 }, teamCoverage: { started: 0, total: 0 } },

        init() {
            const onInitialized = () => {
                this.loadDashboard();
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

        loadDashboard() {
            this.isLoading = true;
            tiApplication.sendRequest( "/app/load-dashboard" ).then( ( result ) => {
                const data = ( result?.data && typeof result.data === "object" ) ? result.data : {};
                this.isManager = !!data.isManager;
                this.cycle = data.cycle ? tiToolbox.structuredClone( data.cycle ) : {};
                this.myEvaluation = data.myEvaluation ? tiToolbox.structuredClone( data.myEvaluation ) : null;
                this.teamEvaluations = Array.isArray( data.teamEvaluations ) ? tiToolbox.structuredClone( data.teamEvaluations ) : [];
                this.stats = data.stats ? tiToolbox.structuredClone( data.stats ) : { total: 0, open: 0, inReview: 0, ready: 0 };
                this.activity = Array.isArray( data.activity ) ? tiToolbox.structuredClone( data.activity ) : [];
                this.tasks = this._buildTasks();
                this.employeeMetrics = data.employeeMetrics ? tiToolbox.structuredClone( data.employeeMetrics ) : {
                    peerFeedback: {
                        submitted: 0,
                        requested: 0
                    }, selfGrades: { completed: 0, total: 0 }, teamCoverage: { started: 0, total: 0 }
                };
                this.isLoading = false;
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }
                this.isLoading = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openMyEvaluation() {
            if ( this.myEvaluation?.evaluationID ) {
                tiApplication.openScreen( `competence-evaluation?evaluationID=${ this.myEvaluation.evaluationID }` );
            } else {
                tiApplication.openScreen( "competence-evaluation" );
            }
        },

        getLabel( key, defaultText ) {
            return tiApplication.getLabel( key, defaultText );
        },

        getGreeting() {
            const hour = new Date().getHours();
            if ( hour < 12 ) return tiApplication.getLabel( "interface.dashboard.greeting-morning", "Good morning" );
            if ( hour < 17 ) return tiApplication.getLabel( "interface.dashboard.greeting-afternoon", "Good afternoon" );
            return tiApplication.getLabel( "interface.dashboard.greeting-evening", "Good evening" );
        },

        getUserName() {
            const user = tiApplication.user;
            return ( user && user.name ) ? user.name.split( " " )[ 0 ] : "there";
        },

        statusColorClass( status ) {
            const map = {
                "NOT_STARTED": "muted",
                "OPEN": "info",
                "IN_REVIEW": "warn",
                "READY": "success",
                "CLOSED": "muted",
                "DELETED": "danger"
            };
            return map[ status ] || "muted";
        },

        cycleProgressPct() {
            if ( this.stats.total <= 0 ) {
                return 0;
            }
            return Math.round( ( this.stats.ready / this.stats.total ) * 100 );
        },

        cycleTimePct() {
            if ( !this.cycle.startDate || !this.cycle.date ) return 0;
            const start = new Date( this.cycle.startDate ).getTime();
            const end = new Date( this.cycle.date ).getTime();
            const now = Date.now();
            const elapsed = now - start;
            const total = end - start;
            return Math.min( 100, Math.max( 0, Math.round( ( elapsed / total ) * 100 ) ) );
        },

        daysToDeadline() {
            if ( !this.cycle.date ) return 0;
            const diff = new Date( this.cycle.date ).getTime() - Date.now();
            return Math.max( 0, Math.ceil( diff / ( 1000 * 60 * 60 * 24 ) ) );
        },

        stageProgressPct() {
            const order = [ "NOT_STARTED", "OPEN", "IN_REVIEW", "READY", "CLOSED" ];
            if ( !this.myEvaluation ) return 0;
            const idx = order.indexOf( this.myEvaluation.status );
            return idx < 0 ? 0 : Math.round( ( idx / ( order.length - 1 ) ) * 100 );
        },

        _buildTasks() {
            const tasks = [];
            if ( this.myEvaluation ) {
                const s = this.myEvaluation.status;
                if ( s === "NOT_STARTED" || s === "OPEN" ) {
                    tasks.push( {
                        id: "self-eval",
                        tone: "info",
                        title: tiApplication.getLabel( "interface.evaluation.appraisal.title", "Complete self-evaluation" ),
                        sub: tiApplication.getLabel( "interface.dashboard.no-evaluation", "Your evaluation is open and waiting for your input" ),
                        action: "evaluation"
                    } );
                }
                if ( s === "READY" ) {
                    tasks.push( {
                        id: "interview",
                        tone: "success",
                        title: tiApplication.getLabel( "interface.schedule.title", "Schedule your interview" ),
                        sub: tiApplication.getLabel( "interface.schedule.no-evaluations", "Your evaluation is ready for interview scheduling" ),
                        action: "schedule"
                    } );
                }
            }
            if ( this.isManager ) {
                const pendingReview = this.teamEvaluations.filter( ( e ) => e.status === "IN_REVIEW" ).length;
                if ( pendingReview > 0 ) {
                    tasks.push( {
                        id: "manager-review",
                        tone: "warn",
                        title: tiApplication.getLabel( "interface.topbar.employees", "Review pending evaluations" ) + " (" + pendingReview + ")",
                        sub: tiApplication.getLabel( "interface.dashboard.stats.review-desc", "Team evaluations await your manager review" ),
                        action: "employees"
                    } );
                }
            }
            if ( tasks.length === 0 ) {
                tasks.push( {
                    id: "stub-1",
                    tone: "info",
                    title: tiApplication.getLabel( "interface.evaluation.appraisal.title", "Complete self-evaluation" ),
                    sub: "21 competencies · saved 2h ago · due 21 May",
                    action: "evaluation"
                } );
                tasks.push( {
                    id: "stub-2",
                    tone: "muted",
                    title: tiApplication.getLabel( "interface.dashboard.task-team-feedback", "Provide team feedback for a colleague" ),
                    sub: "Software Engineer · R3 · due 21 May",
                    action: "evaluation"
                } );
                tasks.push( {
                    id: "stub-3",
                    tone: "muted",
                    title: tiApplication.getLabel( "interface.schedule.title", "Block your availability for interviews" ),
                    sub: "Your team needs ~6 slots in late May",
                    action: "schedule"
                } );
            }
            return tasks;
        },

        handleTaskClick( task ) {
            if ( task.action ) {
                tiApplication.openScreen( task.action === "evaluation" ? "competence-evaluation" :
                    task.action === "schedule" ? "interview-schedule" : "employees-list" );
            }
        },

        getDayInfo() {
            const now = new Date();
            const months = [ "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" ];
            const days = [ "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY" ];
            return months[ now.getMonth() ] + " " + now.getFullYear() + " · " + days[ now.getDay() ];
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }
    };
};

/**
 * Returns a configuration object for the cycle management screen (Supervisor-only).
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureCycleManagement = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const emptyModal = () => ( { kind: null, payload: {}, errorMessage: "", errorField: "", busy: false } );

    return {
        loaded: false,
        cycles: [],
        activeCycleID: null,
        hasOpenCycle: false,
        suggestedCycleID: "",
        modal: emptyModal(),

        init() {
            const onInitialized = () => {
                // Register the CTA up front but disabled, then enable/disable in loadCycles based on actual state.
                // This avoids a flash where the button looks clickable before we know if a cycle is already open.
                tiApplication.setTopbarPrimaryCta( {
                    labelKey: "interface.cycles.new-btn",
                    icon: "plus",
                    tone: "primary",
                    disabled: true,
                    handler: () => this.openCreateModal()
                } );
                this.loadCycles();
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

        loadCycles() {
            tiApplication.sendRequest( "/app/load-cycle-list" ).then( ( result ) => {
                const data = result?.data || {};
                this.cycles = Array.isArray( data.cycles ) ? tiToolbox.structuredClone( data.cycles ) : [];
                this.activeCycleID = data.activeCycleID || null;
                this.hasOpenCycle = data.hasOpenCycle === true;
                this.suggestedCycleID = data.suggestedCycleID || "";
                this.loaded = true;
                // Sync the CTA's disabled state with the freshly loaded "hasOpenCycle" flag.
                tiApplication.setTopbarPrimaryCtaDisabled( this.hasOpenCycle );
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        openCycleSetup( cycleID ) {
            tiApplication.openScreen( "cycle-setup?cycleID=" + encodeURIComponent( cycleID ) );
        },

        openCreateModal() {
            this.modal = {
                kind: "create",
                payload: {
                    cycleID: this.suggestedCycleID || "",
                    name: "",
                    cycleStart: "",
                    cycleDate: "",
                    cycleEnd: ""
                },
                errorMessage: "",
                errorField: "",
                busy: false
            };
        },

        onLockClick( cycle ) {
            if ( this.activeCycleID && this.activeCycleID !== cycle.cycleID ) {
                tiApplication.notify( tiApplication.getLabel( "interface.cycles.lock-modal.active-conflict" ) );
                return;
            }
            this.modal = {
                kind: "lock-confirm",
                payload: { cycleID: cycle.cycleID, name: cycle.name },
                errorMessage: "",
                errorField: "",
                busy: false
            };
        },

        openCloseModal( cycle ) {
            this.modal = {
                kind: "close-confirm",
                payload: { cycleID: cycle.cycleID, name: cycle.name },
                errorMessage: "",
                errorField: "",
                busy: false
            };
        },

        openAuditModal( cycle ) {
            this.modal = {
                kind: "audit",
                payload: {
                    cycleID: cycle.cycleID,
                    name: cycle.name,
                    entries: this.buildCycleAuditEntries( cycle )
                },
                errorMessage: "",
                errorField: "",
                busy: false
            };
        },

        getHistoryAria( cycle ) {
            const tmpl = tiApplication.getLabel( "interface.cycles.actions.history-aria", "Show audit history for {cycle}" );
            return tmpl.replace( "{cycle}", cycle.cycleID );
        },

        // Newest first, so the most recent transition is the first thing the user sees.
        buildCycleAuditEntries( cycle ) {
            const entries = [];
            if ( cycle.createdAt ) {
                entries.push( {
                    kind: "created",
                    tone: "info",
                    timestamp: cycle.createdAt,
                    actorName: cycle.createdByName || null
                } );
            }
            if ( cycle.lockedAt ) {
                entries.push( {
                    kind: "locked",
                    tone: "success",
                    timestamp: cycle.lockedAt,
                    actorName: cycle.lockedByName || null
                } );
            }
            if ( cycle.actualCloseDate ) {
                entries.push( {
                    kind: "closed",
                    tone: "muted",
                    timestamp: cycle.actualCloseDate,
                    // No closedBy field in the cycle schema (yet) — fall back to "system" in the UI.
                    actorName: null
                } );
            }
            return entries.sort( ( a, b ) => ( a.timestamp > b.timestamp ? -1 : ( a.timestamp < b.timestamp ? 1 : 0 ) ) );
        },

        formatAuditTime( value ) {
            if ( !value ) return "—";
            const date = new Date( /^\d{4}-\d{2}-\d{2}$/.test( value ) ? `${ value }T00:00:00` : value );
            if ( !Number.isFinite( date.getTime() ) ) return value;
            return date.toLocaleString();
        },

        closeModal() {
            this.modal = emptyModal();
        },

        submitCreate() {
            const payload = this.modal.payload;
            const id = String( payload.cycleID || "" ).trim();
            const name = String( payload.name || "" ).trim();
            const cycleStart = String( payload.cycleStart || "" ).trim();
            const cycleDate = String( payload.cycleDate || "" ).trim();
            const cycleEnd = String( payload.cycleEnd || "" ).trim();

            if ( !id || !name || !cycleEnd ) {
                this.modal.errorField = !id ? "cycleID" : ( !name ? "name" : "cycleEnd" );
                this.modal.errorMessage = tiApplication.getLabel( "interface.cycles.create-modal.validation-required" );
                return;
            }
            if ( !/^\d{4}-H[12]$/.test( id ) ) {
                this.modal.errorField = "cycleID";
                this.modal.errorMessage = tiApplication.getLabel( "interface.cycles.create-modal.validation-format" );
                return;
            }
            if ( this.cycles.some( ( cycle ) => cycle.cycleID === id ) ) {
                this.modal.errorField = "cycleID";
                this.modal.errorMessage = tiApplication.getLabel( "interface.cycles.create-modal.validation-uniqueness" );
                return;
            }
            if ( cycleStart && cycleEnd && cycleStart > cycleEnd ) {
                this.modal.errorField = "cycleEnd";
                this.modal.errorMessage = tiApplication.getLabel( "interface.cycles.create-modal.validation-date-range" );
                return;
            }

            this.modal.busy = true;
            this.modal.errorMessage = "";
            this.modal.errorField = "";

            tiApplication.sendRequest( "/app/create-cycle", "POST", {
                cycleID: id,
                name,
                cycleStart: cycleStart || null,
                cycleDate: cycleDate || cycleEnd,
                cycleEnd
            } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.cycles.toast.created" ) );
                this.closeModal();
                this.loadCycles();
            } ).catch( ( error ) => {
                this.modal.busy = false;
                this.modal.errorMessage = tiApplication.formatException( error );
            } );
        },

        submitLock() {
            const cycleID = this.modal.payload.cycleID;
            this.modal.busy = true;
            tiApplication.sendRequest( "/app/lock-cycle", "POST", { cycleID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.cycles.toast.locked" ) );
                this.closeModal();
                this.loadCycles();
            } ).catch( ( error ) => {
                const errors = error?.exception?.data?.errors;
                if ( Array.isArray( errors ) && errors.length > 0 ) {
                    this.modal = {
                        kind: "lock-errors",
                        payload: {
                            cycleID,
                            groups: this.groupLockErrors( errors )
                        },
                        errorMessage: "",
                        errorField: "",
                        busy: false
                    };
                    return;
                }
                this.modal.busy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        submitClose() {
            const cycleID = this.modal.payload.cycleID;
            this.modal.busy = true;
            tiApplication.sendRequest( "/app/close-cycle", "POST", { cycleID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.cycles.toast.closed" ) );
                this.closeModal();
                this.loadCycles();
            } ).catch( ( error ) => {
                this.modal.busy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        groupLockErrors( errors ) {
            const map = new Map();
            errors.forEach( ( error ) => {
                const label = error.specialization ? `${ error.family } / ${ error.specialization }` : error.family;
                if ( !map.has( label ) ) {
                    map.set( label, { label, errors: [] } );
                }
                map.get( label ).errors.push( { rule: error.rule, detail: error.detail || "" } );
            } );
            return Array.from( map.values() );
        },

        getRuleLabel( rule ) {
            return tiApplication.getLabel( `interface.cycles.rule.${ rule }`, rule );
        },

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        formatDate( value, placeholder = "—" ) {
            return tiToolbox.formatDate( value, placeholder );
        }
    };
};

/**
 * Returns a configuration object for the cycle setup screen (Supervisor-only).
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureCycleSetup = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const emptyModal = () => ( { kind: null, payload: {} } );

    const draftKey = ( family, key ) => `${ family }|${ key }`;

    return {
        loaded: false,
        cycleID: null,
        cycle: {},
        isReadOnly: false,
        cap: 30,
        families: [],
        sets: {},
        competenciesByCode: {},
        subcategories: [],
        validation: { valid: true, errorsByFamily: {} },
        allCycles: [],
        drafts: {},
        selectedFamily: null,
        selectedKey: null,
        draft: { codes: [], markedEmpty: false },
        modal: emptyModal(),
        saving: false,

        init() {
            const onInitialized = () => {
                this.cycleID = tiToolbox.getUrlParam( "cycleID" );
                this.loadData();
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

        loadData() {
            if ( !this.cycleID ) {
                tiApplication.notify( "Missing cycleID." );
                tiApplication.openScreen( "cycles" );
                return;
            }
            const setupPromise = tiApplication.sendRequest( "/app/load-cycle-setup?cycleID=" + encodeURIComponent( this.cycleID ) );
            const listPromise = tiApplication.sendRequest( "/app/load-cycle-list" );
            Promise.all( [ setupPromise, listPromise ] ).then( ( [ setupResult, listResult ] ) => {
                this.applyData( setupResult?.data || {} );
                this.allCycles = Array.isArray( listResult?.data?.cycles ) ? tiToolbox.structuredClone( listResult.data.cycles ) : [];
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    tiApplication.openScreen( "dashboard" );
                } else if ( error.exception?.httpCode === 404 ) {
                    tiApplication.openScreen( "cycles" );
                }
            } );
        },

        applyData( data ) {
            this.cycle = data.cycle ? tiToolbox.structuredClone( data.cycle ) : {};
            this.isReadOnly = data.isReadOnly === true;
            this.cap = typeof data.cap === "number" ? data.cap : 30;
            this.families = Array.isArray( data.families ) ? tiToolbox.structuredClone( data.families ) : [];
            this.sets = data.sets ? tiToolbox.structuredClone( data.sets ) : {};
            this.competenciesByCode = data.competenciesByCode ? tiToolbox.structuredClone( data.competenciesByCode ) : {};
            this.subcategories = Array.isArray( data.subcategories ) ? tiToolbox.structuredClone( data.subcategories ) : [];
            this.validation = data.validation ? tiToolbox.structuredClone( data.validation ) : { valid: true, errorsByFamily: {} };

            // Preserve currently selected node across reloads when possible; otherwise clear.
            if ( !this.selectedFamily || !this.families.find( ( family ) => family.code === this.selectedFamily ) ) {
                this.selectedFamily = null;
                this.selectedKey = null;
                this.draft = { codes: [], markedEmpty: false };
            } else {
                this.drafts = {};
                this.selectNode( this.selectedFamily, this.selectedKey );
            }

            // Register/refresh the topbar CTA. Lock-cycle is only meaningful while the cycle is still in PLANNING;
            // the button is disabled until validation passes so the user gets a visual hint that something is wrong.
            if ( !this.isReadOnly ) {
                tiApplication.setTopbarPrimaryCta( {
                    labelKey: "interface.cycles.actions.lock-cycle",
                    icon: "send",
                    tone: "primary",
                    disabled: !( this.validation && this.validation.valid ),
                    handler: () => this.openLockModal()
                } );
            } else {
                tiApplication.setTopbarPrimaryCta( null );
            }
        },

        backToCycles() {
            tiApplication.openScreen( "cycles" );
        },

        /* -------------------------- Lock ----------------------------------- */

        openLockModal() {
            if ( this.isReadOnly || !this.validation || !this.validation.valid ) return;
            this.modal = {
                kind: "lock-confirm",
                payload: { cycleID: this.cycleID, name: this.cycle.name || "" }
            };
        },

        submitLock() {
            const cycleID = this.cycleID;
            tiApplication.sendRequest( "/app/lock-cycle", "POST", { cycleID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.cycles.toast.locked" ) );
                this.closeModal();
                // Re-load so isReadOnly flips and the CTA goes away.
                this.loadData();
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        selectNode( familyCode, key ) {
            this.selectedFamily = familyCode;
            this.selectedKey = key;
            const draftID = draftKey( familyCode, key );
            if ( !this.drafts[ draftID ] ) {
                const persisted = this.sets[ familyCode ] && this.sets[ familyCode ][ key ];
                this.drafts[ draftID ] = {
                    codes: persisted && Array.isArray( persisted.codes ) ? persisted.codes.slice() : [],
                    markedEmpty: persisted ? persisted.markedEmpty === true : false
                };
            }
            this.draft = this.drafts[ draftID ];
        },

        /* -------------------------- Tree helpers --------------------------- */

        getNodeStatus( familyCode, key ) {
            const persisted = this.sets[ familyCode ] && this.sets[ familyCode ][ key ];
            const groupKey = key === "baseline" ? familyCode : `${ familyCode }.${ key }`;
            const hasErrors = ( this.validation.errorsByFamily && Array.isArray( this.validation.errorsByFamily[ groupKey ] ) && this.validation.errorsByFamily[ groupKey ].length > 0 );
            // Family-level errors also bubble into baseline nodes (no-empty-baseline, baseline-floor-coverage).
            const familyErrors = ( key === "baseline" && this.validation.errorsByFamily && Array.isArray( this.validation.errorsByFamily[ familyCode ] ) && this.validation.errorsByFamily[ familyCode ].length > 0 );

            if ( !persisted ) {
                return "unconfigured";
            }
            if ( hasErrors || familyErrors ) {
                return "warn";
            }
            if ( persisted.codes && persisted.codes.length === 0 ) {
                return key === "baseline" ? "warn" : "empty";
            }
            return "clean";
        },

        getNodeStatusGlyph( familyCode, key ) {
            const status = this.getNodeStatus( familyCode, key );
            if ( status === "clean" ) return "✓";   // ✓
            if ( status === "warn" ) return "⚠";    // ⚠
            if ( status === "empty" ) return "—";   // —
            return "";
        },

        getNodeStatusAria( familyCode, key ) {
            const status = this.getNodeStatus( familyCode, key );
            return tiApplication.getLabel( `interface.cycle-setup.tree-status.${ status }-aria`, "" );
        },

        getNodeCount( familyCode, key ) {
            const persisted = this.sets[ familyCode ] && this.sets[ familyCode ][ key ];
            return ( persisted && Array.isArray( persisted.codes ) ) ? persisted.codes.length : 0;
        },

        /* -------------------------- Editor helpers ------------------------- */

        getSelectedFamily() {
            return this.families.find( ( family ) => family.code === this.selectedFamily ) || { code: "", name: "", description: "", specializations: [] };
        },

        getSelectedSpec() {
            const family = this.getSelectedFamily();
            const spec = family.specializations.find( ( s ) => s.code === this.selectedKey );
            return spec || { code: "", name: "", description: "" };
        },

        getBaselineCodes() {
            const persisted = this.sets[ this.selectedFamily ] && this.sets[ this.selectedFamily ][ "baseline" ];
            return persisted && Array.isArray( persisted.codes ) ? persisted.codes : [];
        },

        getResolvedSize() {
            if ( this.selectedKey === "baseline" ) {
                return this.draft.codes.length;
            }
            // For a specialization node, resolved = baseline (persisted) + draft (specialization).
            const baseline = this.getBaselineCodes();
            const merged = new Set( [ ...baseline, ...this.draft.codes ] );
            return merged.size;
        },

        isOverCap() {
            return this.getResolvedSize() > this.cap;
        },

        capBarStyle() {
            const pct = Math.min( 100, Math.round( ( this.getResolvedSize() / Math.max( 1, this.cap ) ) * 100 ) );
            // Return an object (CSS custom property) rather than a string. Alpine's CSP build writes object-style
            // bindings via element.style.setProperty(), which the CSP style-src directive allows; string bindings
            // would call setAttribute("style", ...) and trip the policy.
            return { "--pct": pct + "%" };
        },

        getCapText() {
            if ( this.selectedKey === "baseline" ) {
                const tmpl = tiApplication.getLabel( "interface.cycle-setup.cap-usage", "{n} of {cap} competencies selected." );
                return tmpl.replace( "{n}", String( this.draft.codes.length ) ).replace( "{cap}", String( this.cap ) );
            }
            const baseline = this.getBaselineCodes();
            const baselineSize = baseline.length;
            const specSize = this.draft.codes.length;
            const merged = new Set( [ ...baseline, ...this.draft.codes ] );
            const total = merged.size;
            const tmpl = tiApplication.getLabel( "interface.cycle-setup.cap-usage-spec", "Baseline ({b}) + Specialization ({s}) = {t} of {cap}." );
            return tmpl.replace( "{b}", String( baselineSize ) ).replace( "{s}", String( specSize ) ).replace( "{t}", String( total ) ).replace( "{cap}", String( this.cap ) );
        },

        isSubcategoryCovered( subcategoryCode ) {
            return this.draft.codes.some( ( code ) => {
                const comp = this.competenciesByCode[ code ];
                return comp && comp.subcategory === subcategoryCode;
            } );
        },

        getFloorPillAria( subcategoryCode ) {
            const key = this.isSubcategoryCovered( subcategoryCode ) ? "interface.cycle-setup.floor-coverage-aria-satisfied" : "interface.cycle-setup.floor-coverage-aria-missing";
            return tiApplication.getLabel( key, subcategoryCode ).replace( "{sub}", subcategoryCode );
        },

        onMarkedEmptyChange() {
            // If marked empty was just set to true, the code list is empty by construction (the checkbox is disabled
            // when there are codes). If toggled off, no automatic change to codes is needed.
        },

        getCompetencyName( code ) {
            return ( this.competenciesByCode[ code ] && this.competenciesByCode[ code ].name ) || code;
        },

        getCompetencySubcategory( code ) {
            const comp = this.competenciesByCode[ code ];
            return ( comp && comp.subcategoryName ) ? `${ comp.subcategory } · ${ comp.subcategoryName }` : ( comp ? comp.subcategory : "" );
        },

        getCompetencyECF( code ) {
            const comp = this.competenciesByCode[ code ];
            return ( comp && Array.isArray( comp.eCFMapping ) ) ? comp.eCFMapping : [];
        },

        getRemoveAria( code ) {
            const tmpl = tiApplication.getLabel( "interface.cycle-setup.remove-aria", "Remove {code}" );
            return tmpl.replace( "{code}", code );
        },

        removeCode( code ) {
            if ( this.isReadOnly ) return;
            this.draft.codes = this.draft.codes.filter( ( c ) => c !== code );
            if ( this.draft.codes.length === 0 && this.selectedKey !== "baseline" ) {
                // Allow user to re-mark empty after removing last code.
                this.draft.markedEmpty = false;
            }
        },

        /* -------------------------- Picker --------------------------------- */

        openPicker() {
            if ( this.isReadOnly ) return;
            this.modal = {
                kind: "picker",
                payload: {
                    query: "",
                    category: "",
                    subcategory: "",
                    selected: {}
                }
            };
        },

        closeModal() {
            this.modal = emptyModal();
        },

        categoryOptions() {
            const seen = new Set();
            const out = [];
            this.subcategories.forEach( ( sub ) => {
                if ( !seen.has( sub.categoryCode ) ) {
                    seen.add( sub.categoryCode );
                    out.push( { code: sub.categoryCode, name: sub.categoryName } );
                }
            } );
            return out;
        },

        subcategoryOptionsForCategory( catCode ) {
            if ( !catCode ) {
                return this.subcategories;
            }
            return this.subcategories.filter( ( sub ) => sub.categoryCode === catCode );
        },

        pickerFilteredCompetencies() {
            const payload = this.modal.payload || {};
            const q = ( payload.query || "" ).trim().toLowerCase();
            const cat = payload.category || "";
            const sub = payload.subcategory || "";
            const competencies = Object.values( this.competenciesByCode );
            return competencies.filter( ( competency ) => {
                if ( cat && competency.category !== cat ) return false;
                if ( sub && competency.subcategory !== sub ) return false;
                if ( q ) {
                    const text = ( competency.code + " " + competency.name ).toLowerCase();
                    if ( text.indexOf( q ) < 0 ) return false;
                }
                return true;
            } ).sort( ( a, b ) => a.code.localeCompare( b.code, undefined, { numeric: true } ) );
        },

        togglePickerSelection( code ) {
            if ( this.isCodeInDraft( code ) ) return;
            const selected = this.modal.payload.selected || {};
            if ( selected[ code ] ) {
                delete selected[ code ];
            } else {
                selected[ code ] = true;
            }
            this.modal.payload.selected = { ...selected };
        },

        pickerSelectedCount() {
            return Object.keys( this.modal.payload?.selected || {} ).length;
        },

        getPickerConfirmLabel() {
            const tmpl = tiApplication.getLabel( "interface.cycle-setup.picker.confirm-btn", "Add {n}" );
            return tmpl.replace( "{n}", String( this.pickerSelectedCount() ) );
        },

        isCodeInDraft( code ) {
            return this.draft.codes.indexOf( code ) >= 0;
        },

        confirmPicker() {
            const selected = Object.keys( this.modal.payload?.selected || {} );
            const merged = new Set( [ ...this.draft.codes, ...selected ] );
            this.draft.codes = Array.from( merged ).sort( ( a, b ) => a.localeCompare( b, undefined, { numeric: true } ) );
            if ( this.draft.codes.length > 0 ) {
                this.draft.markedEmpty = false;
            }
            this.closeModal();
        },

        /* -------------------------- Clone ---------------------------------- */

        openCloneModal() {
            if ( this.isReadOnly ) return;
            const prevCycleID = this.findPreviousCycleID();
            this.modal = {
                kind: "clone",
                payload: {
                    source: prevCycleID ? "prev-cycle" : "other",
                    prevCycleID,
                    prevCodes: [],
                    otherFamily: "",
                    otherKey: ""
                }
            };
            if ( prevCycleID ) {
                this.loadPrevCycleCodes( prevCycleID );
            }
        },

        findPreviousCycleID() {
            // First entry in allCycles that isn't this cycle. allCycles are sorted by createdAt desc by the server.
            const candidate = this.allCycles.find( ( cycle ) => cycle.cycleID !== this.cycleID );
            return candidate ? candidate.cycleID : null;
        },

        loadPrevCycleCodes( prevCycleID ) {
            tiApplication.sendRequest( "/app/load-cycle-setup?cycleID=" + encodeURIComponent( prevCycleID ) ).then( ( result ) => {
                const data = result?.data || {};
                const family = data.sets && data.sets[ this.selectedFamily ];
                const entry = family && family[ this.selectedKey ];
                if ( this.modal.kind === "clone" ) {
                    this.modal.payload.prevCodes = ( entry && Array.isArray( entry.codes ) ) ? entry.codes.slice() : [];
                }
            } ).catch( () => {
                if ( this.modal.kind === "clone" ) {
                    this.modal.payload.prevCodes = [];
                }
            } );
        },

        onCloneFamilyChange() {
            this.modal.payload.otherKey = "";
        },

        otherFamilySpecs() {
            const family = this.families.find( ( f ) => f.code === this.modal.payload.otherFamily );
            return family ? family.specializations : [];
        },

        otherSourceCodes() {
            const family = this.sets[ this.modal.payload.otherFamily ];
            const entry = family && family[ this.modal.payload.otherKey ];
            return ( entry && Array.isArray( entry.codes ) ) ? entry.codes : [];
        },

        canCloneConfirm() {
            if ( this.modal.payload.source === "prev-cycle" ) {
                return !!this.modal.payload.prevCycleID && this.modal.payload.prevCodes.length > 0;
            }
            if ( this.modal.payload.source === "other" ) {
                return !!this.modal.payload.otherFamily && !!this.modal.payload.otherKey && this.otherSourceCodes().length > 0;
            }
            return false;
        },

        confirmClone() {
            let sourceCodes = [];
            if ( this.modal.payload.source === "prev-cycle" ) {
                sourceCodes = this.modal.payload.prevCodes.slice();
            } else if ( this.modal.payload.source === "other" ) {
                sourceCodes = this.otherSourceCodes().slice();
            }
            this.draft.codes = sourceCodes.slice().sort( ( a, b ) => a.localeCompare( b, undefined, { numeric: true } ) );
            this.draft.markedEmpty = sourceCodes.length === 0 && this.selectedKey !== "baseline";
            tiApplication.notify( tiApplication.getLabel( "interface.cycle-setup.toast.cloned" ) );
            this.closeModal();
        },

        formatCount( n ) {
            const num = Number( n ) || 0;
            return num === 1 ? "1 competency" : `${ num } competencies`;
        },

        /* -------------------------- Save / dirty --------------------------- */

        isDirty() {
            if ( !this.selectedFamily ) return false;
            const persisted = this.sets[ this.selectedFamily ] && this.sets[ this.selectedFamily ][ this.selectedKey ];
            const persistedCodes = persisted && Array.isArray( persisted.codes ) ? persisted.codes : null;
            const draftCodes = this.draft.codes;

            // Track "marked empty" specifically — when there are no codes either side, an explicit checkbox flip should
            // count as dirty so the user can persist the "intentionally empty" marker.
            if ( !persisted && draftCodes.length === 0 ) {
                return this.draft.markedEmpty === true;
            }
            if ( !persisted && draftCodes.length > 0 ) {
                return true;
            }
            if ( persistedCodes.length !== draftCodes.length ) return true;
            for ( let i = 0; i < persistedCodes.length; i++ ) {
                if ( persistedCodes[ i ] !== draftCodes[ i ] ) return true;
            }
            return false;
        },

        saveDraft() {
            if ( this.isReadOnly || this.saving || !this.isDirty() ) return;
            const family = this.selectedFamily;
            const key = this.selectedKey;
            const draftCodes = this.draft.codes.slice();
            const markedEmpty = this.draft.markedEmpty === true;

            this.saving = true;
            const endpoint = ( draftCodes.length === 0 && markedEmpty && key !== "baseline" ) ? "/app/mark-active-set-empty" : "/app/set-active-competency-set";
            const params = ( endpoint === "/app/mark-active-set-empty" ) ? { cycleID: this.cycleID, roleFamily: family, key } : { cycleID: this.cycleID, roleFamily: family, key, codes: draftCodes };

            tiApplication.sendRequest( endpoint, "POST", params ).then( () => {
                const toastLabel = ( endpoint === "/app/mark-active-set-empty" ) ? "interface.cycle-setup.toast.marked-empty" : "interface.cycle-setup.toast.saved";
                tiApplication.notify( tiApplication.getLabel( toastLabel ) );
                this.saving = false;
                this.reloadAfterSave();
            } ).catch( ( error ) => {
                this.saving = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        reloadAfterSave() {
            // Re-fetch the full-screen data to refresh validation and persisted sets; preserve the selected node so the
            // user stays on the same screen.
            tiApplication.sendRequest( "/app/load-cycle-setup?cycleID=" + encodeURIComponent( this.cycleID ) ).then( ( result ) => {
                this.applyData( result?.data || {} );
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        }
    };
};

/**
 * Returns a configuration object for the employee management screen (Supervisor and Manager).
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureEmployeeManagement = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const emptyModal = () => ( { kind: null, payload: {}, errorMessage: "", busy: false } );
    const emptyDetail = () => ( {
        employee: null,
        manager: { managerID: null, managerName: null, organizationUnitName: "" },
        inFlightEvaluations: { count: 0, entries: [] },
        audit: [],
        permissions: { isSupervisor: false, isDirectManager: false, isSelf: false, canEditAllFields: false, canEditSpecialization: false, canViewAudit: false }
    } );

    return {
        loaded: false,
        scope: "",
        employees: [],
        options: { roleFamilies: [], stageLevels: [], organizationUnits: [], employmentStatuses: [], workModes: [], workLocations: [] },
        filters: { search: "", roleFamily: "", specialization: "", stageLevel: "", employmentStatus: "" },
        selectedEmployeeID: null,
        detail: emptyDetail(),
        draft: null,
        activeTab: "details",
        modal: emptyModal(),
        saving: false,
        pendingRoleFamilyChange: null,
        pendingSpecializationChange: null,

        init() {
            const onInitialized = () => {
                this.loadList( () => {
                    const initialID = tiToolbox.getUrlParam( "employeeID" );
                    if ( initialID ) {
                        this.selectEmployee( initialID );
                    }
                } );
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

        loadList( afterFn ) {
            tiApplication.sendRequest( "/app/load-employee-management-list" ).then( ( result ) => {
                const data = result?.data || {};
                this.scope = data.scope || "manager";
                this.employees = Array.isArray( data.employees ) ? tiToolbox.structuredClone( data.employees ) : [];
                this.options = data.options ? tiToolbox.structuredClone( data.options ) : this.options;
                this.loaded = true;
                // Supervisor-only CTA — register once the scope is known so the button only shows for supervisors.
                if ( this.scope === "supervisor" ) {
                    tiApplication.setTopbarPrimaryCta( {
                        labelKey: "interface.employee-management.new-btn",
                        icon: "plus",
                        tone: "primary",
                        handler: () => this.openCreateModal()
                    } );
                }
                if ( typeof afterFn === "function" ) afterFn();
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) return;
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        selectEmployee( employeeID ) {
            this.selectedEmployeeID = employeeID;
            this.activeTab = "details";
            this.loadDetail( employeeID );
        },

        loadDetail( employeeID ) {
            tiApplication.sendRequest( "/app/load-employee-detail?employeeID=" + encodeURIComponent( employeeID ) ).then( ( result ) => {
                this.detail = result?.data ? tiToolbox.structuredClone( result.data ) : emptyDetail();
                this.resetDraft();
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) {
                    this.selectedEmployeeID = null;
                    this.detail = emptyDetail();
                }
            } );
        },

        resetDraft() {
            if ( !this.detail.employee ) {
                this.draft = null;
                return;
            }
            this.draft = tiToolbox.structuredClone( this.detail.employee );
            this.draft.email = this.draft.email || "";
            if ( !this.draft.career.startingDate ) this.draft.career.startingDate = "";
        },

        /* ------------------------- Master list helpers --------------------- */

        filteredEmployees() {
            const q = ( this.filters.search || "" ).trim().toLowerCase();
            return this.employees.filter( ( employee ) => {
                if ( q ) {
                    const haystack = `${ employee.name || "" } ${ employee.email || "" }`.toLowerCase();
                    if ( haystack.indexOf( q ) < 0 ) return false;
                }
                if ( this.filters.roleFamily && employee.roleFamily !== this.filters.roleFamily ) return false;
                if ( this.filters.specialization && employee.specialization !== this.filters.specialization ) return false;
                if ( this.filters.stageLevel && employee.stageLevel !== this.filters.stageLevel ) return false;
                if ( this.filters.employmentStatus && employee.employmentStatus !== this.filters.employmentStatus ) return false;
                return true;
            } );
        },

        availableSpecializationsForFilter() {
            if ( !this.filters.roleFamily ) return [];
            const family = this.options.roleFamilies.find( ( f ) => f.code === this.filters.roleFamily );
            return family ? family.specializations : [];
        },

        availableSpecializationsForDraft() {
            if ( !this.draft || !this.draft.career.roleFamily ) return [];
            const family = this.options.roleFamilies.find( ( f ) => f.code === this.draft.career.roleFamily );
            return family ? family.specializations : [];
        },

        createModalSpecializations() {
            const family = this.modal.payload && this.modal.payload.career && this.modal.payload.career.roleFamily
                ? this.options.roleFamilies.find( ( f ) => f.code === this.modal.payload.career.roleFamily )
                : null;
            return family ? family.specializations : [];
        },

        allStageLevelCodes() {
            const codes = [];
            ( this.options.stageLevels || [] ).forEach( ( sl ) => {
                ( sl.stages || [] ).forEach( ( stage ) => codes.push( `${ sl.code }${ stage }` ) );
            } );
            return codes;
        },

        stageLevelOf( record ) {
            if ( !record || !record.career || !record.career.level ) return "";
            return `${ record.career.level }${ record.career.stage || 1 }`;
        },

        employmentStatusTone( status ) {
            if ( status === "active" ) return "success";
            if ( status === "on-leave" ) return "warn";
            if ( status === "terminated" ) return "muted";
            return "";
        },

        /* ------------------------- Permissions ---------------------------- */

        isFieldEditable( path ) {
            if ( !this.detail.permissions ) return false;
            if ( this.detail.permissions.isSupervisor ) return true;
            if ( this.detail.permissions.isDirectManager && path === "career.specialization" ) return true;
            return false;
        },

        canEditAnything() {
            if ( !this.detail.permissions ) return false;
            return this.detail.permissions.isSupervisor || this.detail.permissions.isDirectManager;
        },

        /* ------------------------- Edit handlers --------------------------- */

        onRoleFamilyChange( newValue ) {
            if ( !this.draft || this.draft.career.roleFamily === newValue ) return;
            this.pendingRoleFamilyChange = newValue;
            this.modal = { kind: "role-family-change", payload: {}, errorMessage: "", busy: false };
            // The select uses x-bind:value, so Alpine re-renders and snaps it back to the persisted
            // roleFamily on the next tick. No manual DOM revert needed.
        },

        confirmRoleFamilyChange() {
            if ( this.draft && this.pendingRoleFamilyChange ) {
                this.draft.career.roleFamily = this.pendingRoleFamilyChange;
                this.draft.career.specialization = null;
            }
            this.pendingRoleFamilyChange = null;
            this.modal = emptyModal();
        },

        onSpecializationChange( newValueRaw ) {
            const newValue = newValueRaw || null;
            if ( !this.draft ) return;
            const oldValue = this.draft.career.specialization || null;
            if ( oldValue === newValue ) return;

            // No-confirmation path: previously generalist (null) becoming specialized — purely additive.
            if ( oldValue === null ) {
                this.draft.career.specialization = newValue;
                return;
            }

            // Confirmation path: changing or clearing an existing specialization.
            this.pendingSpecializationChange = newValue;
            this.modal = { kind: "specialization-change", payload: {}, errorMessage: "", busy: false };
            // x-bind:value will snap the select back to the persisted specialization on the next tick.
        },

        confirmSpecializationChange() {
            if ( this.draft ) {
                this.draft.career.specialization = this.pendingSpecializationChange;
            }
            this.pendingSpecializationChange = null;
            this.modal = emptyModal();
        },

        onStageLevelChange( stageLevel ) {
            if ( !this.draft || !stageLevel ) return;
            this.draft.career.level = stageLevel.charAt( 0 );
            this.draft.career.stage = Number( stageLevel.slice( 1 ) ) || 1;
        },

        closeModal() {
            this.pendingRoleFamilyChange = null;
            this.pendingSpecializationChange = null;
            this.modal = emptyModal();
        },

        /* ------------------------- Dirty / Save --------------------------- */

        computeDiff() {
            const employee = this.detail.employee;
            const draft = this.draft;
            if ( !employee || !draft ) return [];
            const eq = ( a, b ) => {
                const norm = ( v ) => ( v === undefined || v === null || v === "" ) ? null : v;
                return norm( a ) === norm( b );
            };
            const fields = [
                [ "personal.firstName", employee.personal.firstName, draft.personal.firstName ],
                [ "personal.lastName", employee.personal.lastName, draft.personal.lastName ],
                [ "personal.workMode", employee.personal.workMode, draft.personal.workMode ],
                [ "personal.workLocation", employee.personal.workLocation, draft.personal.workLocation ],
                [ "email", employee.email, draft.email ],
                [ "employmentStatus", employee.employmentStatus, draft.employmentStatus ],
                [ "career.roleFamily", employee.career.roleFamily, draft.career.roleFamily ],
                [ "career.specialization", employee.career.specialization, draft.career.specialization ],
                [ "career.level", employee.career.level, draft.career.level ],
                [ "career.stage", employee.career.stage, draft.career.stage ],
                [ "career.startingDate", employee.career.startingDate, draft.career.startingDate ],
                [ "career.organizationUnitID", employee.career.organizationUnitID, draft.career.organizationUnitID ]
            ];
            const diff = [];
            for ( const [ path, oldVal, newVal ] of fields ) {
                if ( !eq( oldVal, newVal ) ) diff.push( [ path, newVal ] );
            }
            return diff;
        },

        isDirty() {
            return this.computeDiff().length > 0;
        },

        onSaveClick() {
            if ( !this.isDirty() || this.saving ) return;
            const diff = this.computeDiff();
            const fields = {};
            for ( const [ path, value ] of diff ) {
                fields[ path ] = value;
            }
            this.saving = true;
            tiApplication.sendRequest( "/app/update-employee", "POST", {
                employeeID: this.selectedEmployeeID,
                fields
            } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.toast.updated" ) );
                this.saving = false;
                const id = this.selectedEmployeeID;
                this.loadList();
                this.loadDetail( id );
            } ).catch( ( error ) => {
                this.saving = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        /* ------------------------- Create modal --------------------------- */

        openCreateModal() {
            this.modal = {
                kind: "create",
                payload: {
                    email: "",
                    employmentStatus: "active",
                    personal: { firstName: "", lastName: "", workMode: "Full-time", workLocation: "On-site" },
                    career: { roleFamily: "", specialization: "", stageLevel: "", organizationUnitID: "", startingDate: "" }
                },
                errorMessage: "",
                busy: false
            };
        },

        submitCreate() {
            const payload = this.modal.payload;
            if ( !payload.personal.firstName || !payload.personal.lastName ) {
                this.modal.errorMessage = tiApplication.getLabel( "error.employee.missing-name" );
                return;
            }
            if ( !payload.career.roleFamily ) {
                this.modal.errorMessage = tiApplication.getLabel( "error.employee.invalid-role-family" );
                return;
            }
            if ( !payload.career.stageLevel ) {
                this.modal.errorMessage = tiApplication.getLabel( "error.employee.invalid-level" );
                return;
            }
            if ( !payload.career.organizationUnitID ) {
                this.modal.errorMessage = tiApplication.getLabel( "error.employee.invalid-organization-unit" );
                return;
            }
            const level = payload.career.stageLevel.charAt( 0 );
            const stage = Number( payload.career.stageLevel.slice( 1 ) );

            const newEmployee = {
                email: payload.email || undefined,
                employmentStatus: payload.employmentStatus || "active",
                personal: { ...payload.personal },
                career: {
                    organizationUnitID: payload.career.organizationUnitID,
                    roleFamily: payload.career.roleFamily,
                    specialization: payload.career.specialization || null,
                    level,
                    stage,
                    startingDate: payload.career.startingDate || undefined
                }
            };

            this.modal.busy = true;
            this.modal.errorMessage = "";
            tiApplication.sendRequest( "/app/create-employee", "POST", { employee: newEmployee } ).then( ( result ) => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.toast.created" ) );
                const newID = result?.data?.employeeID;
                this.modal = emptyModal();
                this.loadList( () => {
                    if ( newID ) this.selectEmployee( newID );
                } );
            } ).catch( ( error ) => {
                this.modal.busy = false;
                this.modal.errorMessage = tiApplication.formatException( error );
            } );
        },

        /* ------------------------- Audit / display ------------------------- */

        getAuditFieldLabel( field ) {
            return tiApplication.getLabel( "interface.employee-management.audit.field." + field, field );
        },

        formatAuditValue( value ) {
            if ( value === null || value === undefined || value === "" ) return "—";
            if ( typeof value === "object" ) return JSON.stringify( value );
            return String( value );
        },

        formatDateTime( value ) {
            if ( !value ) return "—";
            const date = new Date( value );
            if ( !Number.isFinite( date.getTime() ) ) return value;
            return date.toLocaleString();
        },

        formatInFlightCount( n ) {
            const tmpl = tiApplication.getLabel( "interface.employee-management.role-family-change.in-flight-count", "{n} in-flight evaluation(s) will continue with the original set." );
            return tmpl.replace( "{n}", String( n ) );
        },

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        }
    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competenceEvaluation", configureCompetenceEvaluation );
    Alpine.data( "competenceEmployeesList", configureEmployeesList );
    Alpine.data( "competenceNewEvaluation", configureNewEvaluation );
    Alpine.data( "competenceManagerCalendar", configureManagerCalendar );
    Alpine.data( "competenceInterviewSchedule", configureInterviewSchedule );
    Alpine.data( "competenceDashboard", configureDashboard );
    Alpine.data( "competenceCycleManagement", configureCycleManagement );
    Alpine.data( "competenceCycleSetup", configureCycleSetup );
    Alpine.data( "competenceEmployeeManagement", configureEmployeeManagement );
} );
