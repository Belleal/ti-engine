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
    const emptyModal = () => ( { kind: null, payload: {}, busy: false } );

    // Confirmation-modal focus management. No Alpine focus plugin is bundled, so this is hand-rolled: the element that
    // opened the modal is captured (in plain closure state, never reactive — a Proxy-wrapped DOM node breaks .focus())
    // so focus can return to it on close, and the focusable query is used to move focus into the dialog on open and to
    // trap Tab within it while it stays open.
    let modalReturnFocus = null;
    const MODAL_FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
    const modalFocusables = ( dialog ) => dialog
        ? Array.from( dialog.querySelectorAll( MODAL_FOCUSABLE_SELECTOR ) ).filter( ( el ) => el.offsetParent !== null )
        : [];

    return {
        employeeID: null,
        userRole: null,
        deadlineDate: null,
        teamReviewers: null,
        isTeamEvaluationCollective: false,
        canEdit: false,
        canFinalizeTeam: false,
        isFacilitator: false,
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
        isMyResults: false,
        isOwnResults: false,
        modal: emptyModal(),

        // Phase 3 — individual results (populated by buildResults() at READY/CLOSED)
        resultsReady: false,
        resultsHeroSpec: { type: "stat", data: { value: 0, label: "", sub: "" }, a11yLabel: "" },
        resultsCategories: [],
        resultsSourceBarsSpec: { type: "bars", data: { rows: [] }, options: { mode: "grouped" }, a11yLabel: "" },
        resultsRadarSpec: { type: "radar", data: { axes: [], series: [] }, a11yLabel: "" },
        resultsStrengths: [],
        resultsGaps: [],
        // CA-X4 — the requester's own historical finalScore line, shown on "My results" only.
        resultsHistoryReady: false,
        resultsHistorySpec: { type: "line", data: { x: [], series: [] }, options: {}, a11yLabel: "" },

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
            this.canFinalizeTeam = ( fresh.canFinalizeTeam === true );
            this.isFacilitator = ( fresh.isFacilitator === true );
            if ( typeof fresh.isOwnResults === "boolean" ) {
                this.isOwnResults = fresh.isOwnResults;
            }
            this.evaluation = fresh.evaluation ? tiToolbox.structuredClone( fresh.evaluation ) : {
                scores: {},
                finalScore: {}
            };
            this.competencies = fresh.competencies ? tiToolbox.structuredClone( fresh.competencies ) : {};

            tiApplication.setTopbarSubtitle( this.personal.name || "" );
            this.warningMessage = this.getEvaluationWarning();
            this.buildResults();
        },

        loadEmployeeEvaluation( employeeID ) {
            const resolvedID = String( employeeID || "" ).trim();
            this.employeeID = resolvedID || null;
            const evaluationID = tiToolbox.getUrlParam( "evaluationID" );
            const params = new URLSearchParams();
            if ( resolvedID ) params.set( "employeeID", resolvedID );
            if ( evaluationID ) params.set( "evaluationID", evaluationID );
            const paramString = params.toString();
            // "My results" reuses this fragment but loads the latest reported result (incl. CLOSED) via load-my-results,
            // since load-evaluation rejects CLOSED. The same screen serves a manager/supervisor viewing a SPECIFIC
            // employee's scores: the employeeID is forwarded and the endpoint authorizes it. isOwnResults drives the
            // self-vs-other labels (and the topbar title override so a manager's view never reads "My ...").
            const isMyResults = !!( window.location && window.location.pathname && window.location.pathname.indexOf( "my-results" ) >= 0 );
            this.isMyResults = isMyResults;
            const ownID = ( tiApplication.user && tiApplication.user.employeeID ) ? String( tiApplication.user.employeeID ) : "";
            this.isOwnResults = isMyResults && ( !resolvedID || resolvedID === ownID );
            tiApplication.setScreenTitle( ( isMyResults && !this.isOwnResults ) ? tiApplication.getLabel( "interface.topbar.results-other", "Performance Scores" ) : "" );
            const url = isMyResults
                ? `/app/load-my-results${ resolvedID ? `?employeeID=${ encodeURIComponent( resolvedID ) }` : "" }`
                : `/app/load-evaluation${ paramString ? `?${ paramString }` : "" }`;
            this.resultsHistoryReady = false;
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
                // Load the score-history trend whenever results are final — for the evaluee's own view AND for a
                // manager/supervisor viewing a report (the endpoint gates access; an unauthorized viewer just gets no card).
                if ( this.resultsReady ) {
                    this.loadHistory();
                }
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

        // CA-X4 — fetches the viewed employee's historical score line and builds the line spec. Passes the viewed
        // employeeID when a manager/supervisor is looking at a report (the endpoint gates access; "My results" and the
        // employee's own view omit it and default to the requester). Silent on failure / too-few cycles — card stays hidden.
        loadHistory() {
            // Pass the viewed employeeID whenever present (manager/supervisor viewing a report — on either the
            // evaluation screen or the results screen); "My results" omits it and the endpoint defaults to self.
            const q = this.employeeID ? ( "?employeeID=" + encodeURIComponent( this.employeeID ) ) : "";
            tiApplication.sendRequest( "/app/load-employee-history" + q ).then( ( result ) => {
                const data = ( result && result.data ) ? result.data : {};
                if ( data.noHistory || !data.history || !Array.isArray( data.history.x ) || data.history.x.length === 0 ) {
                    this.resultsHistoryReady = false;
                    return;
                }
                this.resultsHistorySpec = {
                    type: "line",
                    data: { x: data.history.x, series: data.history.series },
                    options: {},
                    a11yLabel: tiApplication.getLabel( "interface.evaluation.results.history-title", "Score history" )
                };
                this.resultsHistoryReady = true;
            } ).catch( () => {
                this.resultsHistoryReady = false;
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

        openSubmitModal( event ) {
            modalReturnFocus = ( event && event.currentTarget ) || null;
            this.modal = { kind: "submit-confirm", payload: {}, busy: false };
        },

        submitEvaluation() {
            this.modal.busy = true;
            tiApplication.sendRequest( "/app/submit-evaluation", "POST", { evaluation: this.evaluation } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.evaluation.messages.submitted" ) );
                this.closeModal();
                tiApplication.openScreen( "dashboard" );
            } ).catch( ( error ) => {
                this.closeModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openFinalizeTeamModal( event ) {
            const evaluationID = this.evaluation && this.evaluation.evaluationID;
            if ( !evaluationID ) {
                return;
            }
            modalReturnFocus = ( event && event.currentTarget ) || null;
            this.modal = { kind: "finalize-team-confirm", payload: { evaluationID: evaluationID }, busy: false };
        },

        finalizeTeamFeedback() {
            const evaluationID = this.modal.payload.evaluationID;
            if ( !evaluationID ) {
                return;
            }
            this.modal.busy = true;
            tiApplication.sendRequest( "/app/finalize-team-feedback", "POST", { evaluationID: evaluationID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.evaluation.messages.team-finalized", "Team feedback finalized." ) );
                this.closeModal();
                tiApplication.openScreen( "dashboard" );
            } ).catch( ( error ) => {
                this.closeModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        closeModal() {
            this.modal = emptyModal();
            // Return focus to the control that opened the modal so keyboard users aren't dropped at the top of the page.
            const returnTo = modalReturnFocus;
            modalReturnFocus = null;
            if ( returnTo && typeof returnTo.focus === "function" ) {
                this.$nextTick( () => returnTo.focus() );
            }
        },

        // Move focus into the confirmation dialog when it opens — wired via x-effect on the dialog element, which runs
        // once on mount (it reads no reactive state). $nextTick lets the dialog's children render before we focus.
        focusModal( dialog ) {
            this.$nextTick( () => {
                const focusables = modalFocusables( dialog );
                const target = focusables[ 0 ] || dialog;
                if ( target && typeof target.focus === "function" ) {
                    target.focus();
                }
            } );
        },

        // Trap Tab / Shift+Tab within the open dialog so focus can't slip to the page behind the overlay.
        trapModalFocus( event, dialog ) {
            if ( event.key !== "Tab" || !dialog ) {
                return;
            }
            const focusables = modalFocusables( dialog );
            if ( focusables.length === 0 ) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusables[ 0 ];
            const last = focusables[ focusables.length - 1 ];
            const active = document.activeElement;
            if ( event.shiftKey ) {
                if ( active === first || !dialog.contains( active ) ) {
                    event.preventDefault();
                    last.focus();
                }
            } else if ( active === last || !dialog.contains( active ) ) {
                event.preventDefault();
                first.focus();
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
            if ( this.isMyResults ) return this.isOwnResults ? "interface.evaluation.page.my-results-title" : "interface.evaluation.page.results-other-title";
            if ( this.userRole === 1 ) return "interface.evaluation.page.employee-title";
            if ( this.userRole === 2 ) return "interface.evaluation.page.manager-title";
            if ( this.userRole === 4 ) return "interface.evaluation.page.team-title";
            return "";
        },

        getPageDesc() {
            if ( this.isMyResults ) return this.isOwnResults ? "interface.evaluation.page.my-results-desc" : "interface.evaluation.page.results-other-desc";
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

        // Results (Scores) panel header is context-aware: second-person for the evaluee viewing their OWN scores,
        // neutral ("Scores" + "...for {name}") for a manager/supervisor viewing another employee's scores.
        getResultsTitle() {
            return this.isOwnResults ? "interface.evaluation.results.title" : "interface.evaluation.results.title-other";
        },

        getResultsDesc() {
            return this.isOwnResults
                ? tiApplication.getLabel( "interface.evaluation.results.desc" )
                : ( tiApplication.getLabel( "interface.evaluation.results.desc-other" ) || "" ).replace( "{name}", this.personal.name || "" );
        },

        // Compact final-score panel (evaluation screen): the numeric score, guarded — finalScore is OPTIONAL on the
        // evaluation record (absent until Ready), so it must never be dereferenced unguarded in the template.
        getFinalScoreValue() {
            const fs = this.evaluation && this.evaluation.finalScore;
            return ( fs && typeof fs.score === "number" ) ? fs.score : "";
        },

        // Compact final-score panel (evaluation screen): the band display name once results are final.
        getFinalScoreBandName() {
            const fs = this.evaluation && this.evaluation.finalScore;
            if ( !fs || typeof fs.score !== "number" ) return "";
            return fs.interpretationName ? tiApplication.getLabel( fs.interpretationName, fs.interpretationName ) : ( fs.interpretation || "" );
        },

        // "Results are ready" info bar (evaluation screen) — second-person for the evaluee, neutral for a manager.
        getResultsReadyTitle() {
            if ( this.userRole === 1 ) return tiApplication.getLabel( "interface.evaluation.results-ready.title" );
            return ( tiApplication.getLabel( "interface.evaluation.results-ready.title-other" ) || "" ).replace( "{name}", this.personal.name || "" );
        },

        getResultsReadyAction() {
            return this.userRole === 1 ? "interface.evaluation.results-ready.action" : "interface.evaluation.results-ready.action-other";
        },

        // Opens the read-only results (scores) screen: the evaluee sees their own ("My Scores"); a manager/supervisor
        // opens the viewed employee's scores (load-my-results forwards + authorizes the employeeID).
        openResults() {
            if ( this.userRole === 1 || !this.employeeID ) {
                tiApplication.openScreen( "my-results" );
            } else {
                tiApplication.openScreen( "my-results?employeeID=" + encodeURIComponent( this.employeeID ) );
            }
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
        },

        /* ===== Phase 3 — individual results (READY/CLOSED) ===== */

        hasResults() {
            return this.resultsReady === true;
        },

        // The grade LETTER one source gave a competency, from the RAW eval grades (self key is `employee`, NOT `self`;
        // team is the cumulative string after the READY peer-collapse, or {cumulative} if still an object).
        gradeLetterFor( code, sourceKey ) {
            const entry = ( this.evaluation && this.evaluation.grades ) ? this.evaluation.grades[ code ] : null;
            if ( !entry ) return "";
            if ( sourceKey === "employee" ) return entry.employee || "";
            if ( sourceKey === "manager" ) return entry.manager || "";
            const team = entry.team;
            if ( typeof team === "string" ) return team;
            return ( team && team.cumulative ) || "";
        },

        // T-band cascade mirroring the server EXACTLY: ascending T1→T5, first band where score <= threshold, else T5.
        tBand( score ) {
            const thresholds = ( tiApplication.configuration && tiApplication.configuration.performanceThresholds ) || {
                T1: 76,
                T2: 89,
                T3: 105,
                T4: 119,
                T5: 150
            };
            const order = [ "T1", "T2", "T3", "T4", "T5" ];
            for ( let i = 0; i < order.length; i++ ) {
                if ( typeof thresholds[ order[ i ] ] === "number" && score <= thresholds[ order[ i ] ] ) {
                    return order[ i ];
                }
            }
            return "T5";
        },

        // Maturity-step expected grade weight for a competency (mirrors results-analytics.expectedGradeForArchetype):
        // intro=0.5·peak, mature=0.9·peak over the snapshot relevancy curve; U/R/S → weight.
        expectedGradeWeight( relevancyCurve, stageLevel, gradeWeights ) {
            if ( !relevancyCurve || typeof relevancyCurve !== "object" ) {
                return null;
            }
            let peak = 0;
            const keys = Object.keys( relevancyCurve );
            for ( let i = 0; i < keys.length; i++ ) {
                const v = Number( relevancyCurve[ keys[ i ] ] ) || 0;
                if ( v > peak ) {
                    peak = v;
                }
            }
            if ( peak <= 0 ) {
                return ( typeof gradeWeights.U === "number" ) ? gradeWeights.U : 0.6;
            }
            const w = Number( relevancyCurve[ stageLevel ] ) || 0;
            const letter = ( w < ( 0.5 * peak ) ) ? "U" : ( ( w < ( 0.9 * peak ) ) ? "R" : "S" );
            return ( typeof gradeWeights[ letter ] === "number" ) ? gradeWeights[ letter ] : null;
        },

        // Recomputes the per-source category/subcategory means from the raw grades + snapshot relevancy (scores[E/I/C]
        // are pre-blended and irreversible) and builds the result chart specs + strengths/gaps. Populates reactive state.
        buildResults() {
            const ev = this.evaluation || {};
            const ready = ( ev.status === "Ready" || ev.status === "Closed" ) && ev.finalScore && typeof ev.finalScore.score === "number";
            if ( !ready ) {
                this.resultsReady = false;
                return;
            }

            const cfg = tiApplication.configuration || {};
            const gradeWeights = cfg.gradeWeights || { S: 1.3, R: 1.0, U: 0.6, N: 0.0 };
            const evalWeights = cfg.evaluationWeights || { self: 0.2, team: 0.3, manager: 0.5 };
            const scoreMax = Number( cfg.performanceThresholds && cfg.performanceThresholds.T5 ) || 150;
            const maxGrade = ( typeof gradeWeights.S === "number" ) ? gradeWeights.S : 1.3;
            const snapshot = Array.isArray( ev.snapshot ) ? ev.snapshot : [];
            const stageLevel = ev.stageLevel || "";
            const round2 = ( n ) => Math.round( n * 100 ) / 100;
            // An ungraded competency contributes weight 0 to a source's NUMERATOR but its full relevancy still counts in
            // the SHARED denominator — exactly mirroring the server (competence-framework.js calculateFinalEvaluationScores
            // keeps ONE maxScoreByCategory per scope, the same divisor for self/team/manager). This keeps every displayed
            // per-source mean a faithful decomposition of the authoritative score: a source's gaps lower its mean just as
            // they lowered its share of the score.
            const wOf = ( letter ) => ( Object.prototype.hasOwnProperty.call( gradeWeights, letter ) ? gradeWeights[ letter ] : null );

            const SUBCATS = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];
            const SOURCE_KEYS = [ "employee", "manager", "team" ];
            const den = {};                                                       // shared per-scope divisor: Σ relevancy
            const num = { employee: {}, manager: {}, team: {}, expected: {} };    // per-series weighted sums
            const participated = { employee: false, manager: false, team: false };
            const addDen = ( key, v ) => {
                den[ key ] = ( den[ key ] || 0 ) + v;
            };
            const addNum = ( series, key, v ) => {
                num[ series ][ key ] = ( num[ series ][ key ] || 0 ) + v;
            };

            for ( let i = 0; i < snapshot.length; i++ ) {
                const snap = snapshot[ i ];
                const code = snap.code, cat = snap.category, subcat = snap.subcategory;
                const rel = ( snap.relevancy && typeof snap.relevancy[ stageLevel ] === "number" ) ? snap.relevancy[ stageLevel ] : 0;
                if ( !code || !cat || rel <= 0 ) {
                    continue;
                }
                addDen( "cat:" + cat, rel );
                if ( subcat ) {
                    addDen( "sub:" + subcat, rel );
                }
                for ( let s = 0; s < SOURCE_KEYS.length; s++ ) {
                    const weight = wOf( this.gradeLetterFor( code, SOURCE_KEYS[ s ] ) );
                    if ( weight !== null ) {
                        participated[ SOURCE_KEYS[ s ] ] = true;
                    }
                    const w = ( weight === null ) ? 0 : weight;
                    addNum( SOURCE_KEYS[ s ], "cat:" + cat, w * rel );
                    if ( subcat ) {
                        addNum( SOURCE_KEYS[ s ], "sub:" + subcat, w * rel );
                    }
                }
                const ew = this.expectedGradeWeight( snap.relevancy, stageLevel, gradeWeights );
                if ( ew !== null ) {
                    addNum( "expected", "cat:" + cat, ew * rel );
                    if ( subcat ) {
                        addNum( "expected", "sub:" + subcat, ew * rel );
                    }
                }
            }
            // Omit a source that graded nothing at all (e.g. an evaluation that ran without a team) so it never renders as a
            // misleading flat zero; self and manager are always complete by the time results are final.
            for ( let s = 0; s < SOURCE_KEYS.length; s++ ) {
                if ( !participated[ SOURCE_KEYS[ s ] ] ) {
                    num[ SOURCE_KEYS[ s ] ] = {};
                }
            }
            const meanOf = ( series, key ) => {
                const n = num[ series ][ key ];
                return ( den[ key ] > 0 && typeof n === "number" ) ? ( n / den[ key ] ) : null;
            };

            // Sources that actually participated — self/manager always; team only if it graded anything. Tones match the
            // SELF / MANAGER / TEAM grading-form column colours (.competence-h-*: self=info, manager=accent, team=success).
            const activeSources = [
                { key: "self", series: "employee", tone: "self" },
                { key: "manager", series: "manager", tone: "manager" }
            ];
            if ( participated.team ) {
                activeSources.push( { key: "team", series: "team", tone: "team" } );
            }
            // Shared chart legend describing which colour is which source (reuses the grading column labels).
            const sourceLabel = ( key ) => tiApplication.getLabel( "interface.evaluation.competencies." + key, key );
            const sourceLegend = activeSources.map( ( src ) => ( { label: sourceLabel( src.key ), tone: src.tone } ) );

            // True score ceiling for THIS form. The server score is a relevancy-NORMALISED weighted average of grade
            // weights (Σ(weight·rel)/Σrel per source, blended by source weight, ×100 — see calculateFinalEvaluationScores),
            // so the maximum is ceil( S · Σ participating-source-weights · 100 ). The relevancy divisor cancels, so it is
            // independent of family/competencies: full participation ⇒ ceil(1.3·1·100)=130; a source that never graded drops
            // its weight from the ceiling. (The old 150 was the T5 interpretation band, not an achievable maximum.)
            const participatingWeight = ( participated.employee ? ( evalWeights.self || 0 ) : 0 )
                + ( participated.manager ? ( evalWeights.manager || 0 ) : 0 )
                + ( participated.team ? ( evalWeights.team || 0 ) : 0 );
            const maxScore = ( participatingWeight > 0 ) ? Math.ceil( maxGrade * participatingWeight * 100 ) : scoreMax;

            // category/subcategory display names from the competency tree (fallback to codes)
            const catName = {}, subName = {};
            const tree = Array.isArray( this.competencies ) ? this.competencies : [];
            for ( let i = 0; i < tree.length; i++ ) {
                const c = tree[ i ];
                if ( c && c.id ) {
                    catName[ c.id ] = c.name || c.id;
                }
                const subs = Array.isArray( c && c.subcategories ) ? c.subcategories : [];
                for ( let j = 0; j < subs.length; j++ ) {
                    if ( subs[ j ] && subs[ j ].id ) {
                        subName[ subs[ j ].id ] = subs[ j ].name || subs[ j ].id;
                    }
                }
            }

            // Hero: the server's authoritative finalScore + its band. interpretationName is a label KEY
            // (e.g. "framework.performance.threshold.name.T3") — resolve it through getLabel, never render it raw.
            const finalScore = ev.finalScore.score;
            const bandCode = ev.finalScore.interpretation || this.tBand( finalScore );
            const finalScoreLabel = tiApplication.getLabel( "interface.evaluation.results.final-score", "Final score" );
            const bandName = ev.finalScore.interpretationName ? tiApplication.getLabel( ev.finalScore.interpretationName, ev.finalScore.interpretationName ) : bandCode;
            this.resultsHeroSpec = {
                type: "stat",
                data: { value: finalScore, label: finalScoreLabel, sub: bandName, pct: Math.max( 0, Math.min( 1, finalScore / maxScore ) ) },
                a11yLabel: finalScoreLabel + " " + String( finalScore ) + " (" + String( bandName ) + ")"
            };

            // Per-category breakdown for the hero — compact score chips coloured by category identity (matching the
            // E / I / C letter boxes in the grading form), filled against the form's true score ceiling (maxScore).
            const scores = ( ev.scores && typeof ev.scores === "object" ) ? ev.scores : {};
            this.resultsCategories = Object.keys( scores ).map( ( cat ) => {
                const v = ( typeof scores[ cat ].score === "number" ) ? scores[ cat ].score : 0;
                return {
                    id: cat,
                    label: catName[ cat ] || cat,
                    score: v,
                    max: maxScore,
                    tone: cat,
                    pct: Math.max( 0, Math.min( 100, Math.round( ( v / maxScore ) * 100 ) ) )
                };
            } );

            // Source comparison: per category, grouped self/manager/team mean (weight space). Thin bars (≈⅓ the
            // default height) with a smaller value caption keep the three-source comparison compact and legible.
            this.resultsSourceBarsSpec = {
                type: "bars", options: { mode: "grouped", valueLabels: true, barThickness: 1.5, valueFontSize: 2.6, legend: sourceLegend },
                data: {
                    rows: [ "E", "I", "C" ].filter( ( cat ) => den[ "cat:" + cat ] > 0 ).map( ( cat ) => ( {
                        id: cat, label: catName[ cat ] || cat,
                        values: activeSources.map( ( src ) => ( { key: src.key, v: round2( meanOf( src.series, "cat:" + cat ) || 0 ), tone: src.tone } ) )
                    } ) )
                },
                a11yLabel: tiApplication.getLabel( "interface.evaluation.results.source-comparison", "Self vs manager vs team" )
            };

            // Radar: 9 subcategories × self/manager/team (whichever participated) + the maturity-step expected curve.
            const subValues = ( series ) => {
                const out = {};
                for ( let i = 0; i < SUBCATS.length; i++ ) {
                    const m = meanOf( series, "sub:" + SUBCATS[ i ] );
                    if ( m !== null ) {
                        out[ SUBCATS[ i ] ] = round2( m );
                    }
                }
                return out;
            };
            this.resultsRadarSpec = {
                type: "radar",
                options: {
                    legend: sourceLegend.concat( [ {
                        label: tiApplication.getLabel( "interface.evaluation.results.expected", "Expected" ),
                        tone: "expected", dashed: true
                    } ] )
                },
                data: {
                    axes: SUBCATS.map( ( s ) => ( { id: s, label: s, max: maxGrade, tone: "cat-" + s.charAt( 0 ).toLowerCase() } ) ),
                    series: activeSources.map( ( src ) => ( { key: src.key, tone: src.tone, values: subValues( src.series ) } ) ).concat( [
                        { key: "expected", tone: "expected", style: "dashed", values: subValues( "expected" ) }
                    ] )
                },
                a11yLabel: tiApplication.getLabel( "interface.evaluation.results.profile", "Subcategory profile" )
            };

            // Strengths / gaps: blended subcategory mean vs the maturity-step expected.
            const insights = [];
            for ( let i = 0; i < SUBCATS.length; i++ ) {
                const sc = SUBCATS[ i ];
                const self = meanOf( "employee", "sub:" + sc ), team = meanOf( "team", "sub:" + sc ), mgr = meanOf( "manager", "sub:" + sc );
                const expected = meanOf( "expected", "sub:" + sc );
                if ( expected === null || ( self === null && team === null && mgr === null ) ) {
                    continue;
                }
                const weightedSources = [
                    { value: self, weight: evalWeights.self },
                    { value: team, weight: evalWeights.team },
                    { value: mgr, weight: evalWeights.manager }
                ].filter( ( src ) => src.value !== null && typeof src.weight === "number" && src.weight > 0 );
                const weightTotal = weightedSources.reduce( ( sum, src ) => sum + src.weight, 0 );
                const blended = weightTotal > 0
                    ? weightedSources.reduce( ( sum, src ) => sum + ( src.value * src.weight ), 0 ) / weightTotal
                    : 0;
                const gapVal = round2( blended - expected );
                // `display` is the signed deviation vs the maturity-step expected ("+0.30" / "-0.43") — the SAME quantity
                // for strengths and gaps, so the two lists read consistently (strengths previously showed the raw mean).
                insights.push( {
                    code: sc,
                    label: subName[ sc ] || sc,
                    value: round2( blended ),
                    expected: round2( expected ),
                    gap: gapVal,
                    display: ( gapVal > 0 ? "+" : "" ) + gapVal.toFixed( 2 )
                } );
            }
            this.resultsStrengths = insights.filter( ( x ) => x.gap > 0 ).sort( ( a, b ) => b.gap - a.gap ).slice( 0, 3 );
            this.resultsGaps = insights.filter( ( x ) => x.gap < 0 ).sort( ( a, b ) => a.gap - b.gap ).slice( 0, 3 );

            this.resultsReady = true;
        },

        getResultsHeroAriaLabel() {
            return this.resultsHeroSpec.a11yLabel;
        },
        getResultsSourceAriaLabel() {
            return this.resultsSourceBarsSpec.a11yLabel;
        },
        getResultsRadarAriaLabel() {
            return this.resultsRadarSpec.a11yLabel;
        },

        hasHistory() {
            return this.resultsHistoryReady === true;
        },
        getResultsHistoryAriaLabel() {
            return this.resultsHistorySpec.a11yLabel;
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
        teamDropdownOpen: false,
        // When room below the trigger is tight, the reviewer popover flips above it (computed in toggleTeamDropdown).
        teamDropdownUp: false,
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
            this.teamDropdownOpen = false;
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

        // The picker hides colleagues already added to the team so each can only be chosen once. (The server roster
        // already excludes the evaluatee and their managers — direct or higher — so those never appear at all.)
        getSelectableTeamMembers() {
            return this.availableTeamMembers.filter( ( member ) => !this.team.find( ( t ) => t.employeeID === member.employeeID ) );
        },

        toggleTeamDropdown() {
            // Decide the open direction before showing so the menu never flashes downward first. Only relevant
            // when opening; on close the value is left as-is and recomputed on the next open.
            if ( !this.teamDropdownOpen ) {
                this.teamDropdownUp = this.shouldReviewerDropUp();
            }
            this.teamDropdownOpen = !this.teamDropdownOpen;
        },

        // Flip the reviewer popover above the trigger only when it would not fit below AND there is more room
        // above. The menu is display:none until shown, so its height can't be measured first — estimate it from
        // the option count, capped at the CSS max-height (288px). Errs slightly tall so we never clip at the bottom.
        shouldReviewerDropUp() {
            const trigger = this.$refs.reviewerTrigger;
            if ( !trigger ) {
                return false;
            }
            const GAP = 4;                  // the 4px offset baked into .competence-reviewer-options
            const MAX_HEIGHT = 288;         // the max-height of .competence-reviewer-options
            const ROW_HEIGHT = 50;          // approx height of one option row (or the empty-state row)
            const CONTAINER_PADDING = 8;    // 4px top + 4px bottom padding of the options container
            const rowCount = Math.max( this.getSelectableTeamMembers().length, 1 );   // empty state still renders one row
            const estimatedHeight = Math.min( rowCount * ROW_HEIGHT + CONTAINER_PADDING, MAX_HEIGHT );
            const rect = trigger.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            return spaceBelow < estimatedHeight + GAP && spaceAbove > spaceBelow;
        },

        closeTeamDropdown() {
            this.teamDropdownOpen = false;
        },

        // Close and return focus to the trigger — used by the keyboard (Escape) path and after a selection so keyboard
        // users aren't stranded on the now-hidden option buttons. (A mouse click-away uses closeTeamDropdown() instead,
        // so focus follows the click rather than snapping back to the trigger.)
        closeTeamDropdownAndRefocus() {
            const wasOpen = this.teamDropdownOpen;
            this.teamDropdownOpen = false;
            if ( wasOpen && this.$refs.reviewerTrigger ) {
                this.$refs.reviewerTrigger.focus();
            }
        },

        selectTeamMember( member ) {
            this.selectedTeamMemberID = member.employeeID;
            this.closeTeamDropdownAndRefocus();
        },

        getReviewerTriggerText() {
            if ( this.selectedTeamMemberID ) {
                const member = this.availableTeamMembers.find( ( m ) => m.employeeID === this.selectedTeamMemberID );
                if ( member ) {
                    return member.name;
                }
            }
            return tiApplication.getLabel( "interface.evaluation.new-eval.choose-colleague", "Choose a colleague…" );
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
        canSchedule: false,
        maxGoals: 5,
        outcomeForID: null,
        outcomeDraft: { feedback: "", goals: [], pip: { required: false, plan: "" } },
        closeModal: { open: false, evaluationID: null, employeeName: "", busy: false },

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
                this.canSchedule = ( data.canSchedule === true );   // only a Supervisor books; managers see this read-only
                this.maxGoals = ( typeof data.maxGoals === "number" ) ? data.maxGoals : 5;
                this.outcomeForID = null;
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
            // Step back a full 4-week window. canGoPrevSlotWeeks() only returns true when an available slot exists
            // before the current window start, and the schedule projection carries only future (schedulable) slots, so
            // paging back always lands on/before a window that contains slots and terminates at the earliest slot's
            // window — symmetric with canGoNextSlotWeeks(); no today-clamp needed.
            const d = new Date( this.slotViewStart );
            d.setDate( d.getDate() - 28 );
            this.slotViewStart = d;
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
            // There is an earlier window worth showing only if an available slot falls BEFORE the current window start —
            // symmetric with canGoNextSlotWeeks(). (Previously this compared against today's Monday, which left "Earlier"
            // enabled so the user could page back into the empty weeks between today and the first available slot.)
            const windowStartStr = tiToolbox.toDateString( this.slotViewStart );
            return this.slots.some( ( s ) => s.status === "available" && s.date < windowStartStr );
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

        canRecordOutcome( evaluation ) {
            return evaluation.canRecordOutcome === true;
        },

        toggleOutcome( evaluation ) {
            if ( this.outcomeForID === evaluation.evaluationID ) {
                this.outcomeForID = null;
                return;
            }
            const closure = evaluation.closure || { feedback: "", goals: [], pip: { required: false, plan: "" } };
            this.outcomeDraft = {
                feedback: closure.feedback || "",
                goals: Array.isArray( closure.goals ) ? closure.goals.map( ( g ) => ( { text: g.text || "", targetDate: g.targetDate || "" } ) ) : [],
                pip: { required: !!( closure.pip && closure.pip.required ), plan: ( closure.pip && closure.pip.plan ) ? closure.pip.plan : "" }
            };
            this.outcomeForID = evaluation.evaluationID;
        },

        setOutcomeFeedback( value ) {
            this.outcomeDraft.feedback = value;
        },

        addGoal() {
            if ( this.outcomeDraft.goals.length >= this.maxGoals ) {
                return;
            }
            this.outcomeDraft.goals.push( { text: "", targetDate: "" } );
        },

        removeGoal( index ) {
            this.outcomeDraft.goals.splice( index, 1 );
        },

        setGoalText( index, value ) {
            if ( this.outcomeDraft.goals[ index ] ) {
                this.outcomeDraft.goals[ index ].text = value;
            }
        },

        setGoalDate( index, value ) {
            if ( this.outcomeDraft.goals[ index ] ) {
                this.outcomeDraft.goals[ index ].targetDate = value;
            }
        },

        togglePipRequired() {
            this.outcomeDraft.pip.required = !this.outcomeDraft.pip.required;
        },

        setPipPlan( value ) {
            this.outcomeDraft.pip.plan = value;
        },

        goalCapLabel() {
            return this.getLabel( "interface.schedule.outcome.goal-cap" )
                .replace( "{n}", String( this.outcomeDraft.goals.length ) )
                .replace( "{max}", String( this.maxGoals ) );
        },

        canAddGoal() {
            return this.outcomeDraft.goals.length < this.maxGoals;
        },

        saveOutcome( evaluationID ) {
            const goals = this.outcomeDraft.goals
                .map( ( g ) => ( { text: ( g.text || "" ).trim(), targetDate: ( g.targetDate || "" ).trim() || null } ) )
                .filter( ( g ) => g.text !== "" );
            tiApplication.sendRequest( "/app/save-interview-outcome", "POST", {
                evaluationID: evaluationID,
                feedback: this.outcomeDraft.feedback,
                goals: goals,
                pip: { required: this.outcomeDraft.pip.required, plan: this.outcomeDraft.pip.plan }
            } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.schedule.outcome.saved-toast" ) );
                this.loadSchedule();
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openCloseModal( evaluation ) {
            this.closeModal = { open: true, evaluationID: evaluation.evaluationID, employeeName: evaluation.employeeName || "", busy: false };
        },

        dismissCloseModal() {
            this.closeModal = { open: false, evaluationID: null, employeeName: "", busy: false };
        },

        confirmClose() {
            if ( !this.closeModal.evaluationID ) {
                return;
            }
            this.closeModal.busy = true;
            tiApplication.sendRequest( "/app/close-evaluation", "POST", { evaluationID: this.closeModal.evaluationID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.schedule.outcome.closed-toast" ) );
                this.dismissCloseModal();
                this.loadSchedule();
            } ).catch( ( error ) => {
                this.dismissCloseModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        rowStatusLabel( evaluation ) {
            if ( !evaluation.interviewHeld ) {
                return this.getLabel( "interface.schedule.outcome.status-awaiting" );
            }
            const closure = evaluation.closure || { feedback: "", goals: [] };
            const recorded = ( closure.feedback && closure.feedback.trim() !== "" ) || ( Array.isArray( closure.goals ) && closure.goals.length > 0 );
            return recorded
                ? this.getLabel( "interface.schedule.outcome.status-ready-to-close" )
                : this.getLabel( "interface.schedule.outcome.status-pending" );
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
 * Shared factory for the Insights cycle/team analytics screens. `config.reportScope === "team"` appends `scope=team`
 * to every report request (the web layer narrows to the requesting user's subtree); `config.shellEndpoint` selects the
 * shell; `config.includeCalibration` adds the grader-calibration report (team only). Both screens reuse the same
 * spec-builders, loading flow, and caveat handling.
 *
 * @method
 * @param {Object} [config] - { shellEndpoint, reportScope:"org"|"team", includeCalibration }
 * @returns {Object}
 * @public
 */
const configureInsightsScreen = ( config ) => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );
    const screen = config || {};
    const shellEndpoint = screen.shellEndpoint || "load-insights-cycle";
    const reportScope = ( screen.reportScope === "team" ) ? "team" : "org";
    const includeCalibration = !!screen.includeCalibration;

    return {
        isLoading: true,
        selectedCycleID: "",
        cycle: null,
        cycles: [],
        coverage: null,
        meta: null,
        coverageGaugeSpec: { type: "gauge", data: { value: 0, label: "", sublabel: "" }, a11yLabel: "", provisional: false },
        coverageBarsSpec: { type: "bars", data: { rows: [] }, options: { mode: "stacked" }, a11yLabel: "", provisional: false },
        timeDistributionSpec: { type: "bars", data: { rows: [] }, options: { mode: "grouped" }, a11yLabel: "", provisional: false },
        alignmentSpec: { type: "scatter", data: { points: [], diagonal: true }, options: {}, a11yLabel: "", provisional: false },
        heatmapSpec: { type: "heatmap", data: { rows: [], cols: [], cells: [] }, options: { scale: "sequential" }, a11yLabel: "", provisional: false },
        levelDistributionSpec: { type: "box", data: { groups: [], reference: [] }, a11yLabel: "", provisional: false },
        predictiveDriversSpec: { type: "bars", data: { rows: [] }, options: { mode: "diverging" }, a11yLabel: "", provisional: false },
        timeDistribution: null,
        alignment: null,
        heatmap: null,
        levelDistribution: null,
        predictiveDrivers: null,
        heatmapView: "value",
        predictiveInsufficient: false,
        unscheduledReady: 0,
        calibration: null,
        calibrationSpec: { type: "bars", data: { rows: [] }, options: { mode: "diverging" }, a11yLabel: "", provisional: false },
        calibrationKpiSpec: { type: "stat", data: { value: "—", label: "", sub: "" }, a11yLabel: "" },

        init() {
            const onInitialized = () => {
                this.selectedCycleID = tiToolbox.getUrlParam( "cycleID" ) || "";
                this.loadAll();
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

        loadAll() {
            this.isLoading = true;
            const params = [];
            if ( this.selectedCycleID ) {
                params.push( "cycleID=" + encodeURIComponent( this.selectedCycleID ) );
            }
            if ( reportScope === "team" ) {
                params.push( "scope=team" );
            }
            const q = params.length ? ( "?" + params.join( "&" ) ) : "";
            const heatmapQ = q ? ( q + "&groupBy=roleFamily" ) : "?groupBy=roleFamily";
            const shellQ = this.selectedCycleID ? ( "?cycleID=" + encodeURIComponent( this.selectedCycleID ) ) : "";
            const requests = [
                tiApplication.sendRequest( "/app/" + shellEndpoint + shellQ ),
                tiApplication.sendRequest( "/app/load-report-coverage" + q ),
                tiApplication.sendRequest( "/app/load-report-time-distribution" + q ),
                tiApplication.sendRequest( "/app/load-report-alignment" + q ),
                tiApplication.sendRequest( "/app/load-report-heatmap" + heatmapQ ),
                tiApplication.sendRequest( "/app/load-report-level-distribution" + q ),
                tiApplication.sendRequest( "/app/load-report-predictive-drivers" + q )
            ];
            if ( includeCalibration ) {
                requests.push( tiApplication.sendRequest( "/app/load-report-calibration" + q ) );
            }
            Promise.all( requests ).then( ( results ) => {
                const dataOf = ( result ) => ( ( result && result.data && typeof result.data === "object" ) ? result.data : {} );
                const shell = dataOf( results[ 0 ] );
                const coveragePayload = dataOf( results[ 1 ] );
                const tdPayload = dataOf( results[ 2 ] );
                const alignPayload = dataOf( results[ 3 ] );
                const heatPayload = dataOf( results[ 4 ] );
                const levelPayload = dataOf( results[ 5 ] );
                const driversPayload = dataOf( results[ 6 ] );
                const calibPayload = includeCalibration ? dataOf( results[ 7 ] ) : {};

                this.cycle = shell.cycle ? tiToolbox.structuredClone( shell.cycle ) : null;
                this.cycles = Array.isArray( shell.cycles ) ? tiToolbox.structuredClone( shell.cycles ) : [];
                if ( this.cycle && !this.selectedCycleID ) {
                    this.selectedCycleID = this.cycle.id;
                }
                // Coverage drives the screen-level mode/partial caveat banner.
                this.coverage = coveragePayload.coverage ? tiToolbox.structuredClone( coveragePayload.coverage ) : null;
                this.meta = coveragePayload.meta ? tiToolbox.structuredClone( coveragePayload.meta ) : null;
                this.coverageGaugeSpec = this.buildGaugeSpec( this.coverage, this.meta );
                this.coverageBarsSpec = this.buildBarsSpec( this.coverage, this.meta );

                this.timeDistribution = tdPayload.timeDistribution ? tiToolbox.structuredClone( tdPayload.timeDistribution ) : null;
                this.unscheduledReady = ( this.timeDistribution && typeof this.timeDistribution.unscheduledReady === "number" ) ? this.timeDistribution.unscheduledReady : 0;
                this.alignment = alignPayload.alignment ? tiToolbox.structuredClone( alignPayload.alignment ) : null;
                this.heatmap = heatPayload.heatmap ? tiToolbox.structuredClone( heatPayload.heatmap ) : null;
                this.levelDistribution = levelPayload.levelDistribution ? tiToolbox.structuredClone( levelPayload.levelDistribution ) : null;
                this.predictiveDrivers = driversPayload.predictiveDrivers ? tiToolbox.structuredClone( driversPayload.predictiveDrivers ) : null;
                this.predictiveInsufficient = !!( this.predictiveDrivers && this.predictiveDrivers.insufficientData );

                this.timeDistributionSpec = this.buildTimeDistributionSpec( this.timeDistribution, this.meta );
                this.alignmentSpec = this.buildAlignmentSpec( this.alignment, this.meta );
                this.heatmapSpec = this.buildHeatmapSpec( this.heatmap, this.heatmapView, this.meta );
                this.levelDistributionSpec = this.buildLevelDistributionSpec( this.levelDistribution, this.meta );
                this.predictiveDriversSpec = this.buildPredictiveDriversSpec( this.predictiveDrivers, this.meta );
                this.calibration = calibPayload.calibration ? tiToolbox.structuredClone( calibPayload.calibration ) : null;
                this.calibrationSpec = this.buildCalibrationSpec( this.calibration, this.meta );
                this.calibrationKpiSpec = this.buildCalibrationKpiSpec( this.calibration );
                this.isLoading = false;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.isLoading = false;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error && error.exception && ( error.exception.httpCode === 401 || error.exception.httpCode === 403 ) ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        onCycleChange( event ) {
            this.selectedCycleID = event && event.target ? event.target.value : "";
            this.loadAll();
        },

        /**
         * Localized label lookup for in-template attribute bindings (the heatmap-view picker's aria-label). Mirrors
         * the pass-through every other screen component exposes; without it CSP-mode Alpine throws "Undefined
         * variable: getLabel" when the picker renders.
         *
         * @method
         * @param {string} label - The label key to resolve.
         * @returns {string}
         * @public
         */
        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        /**
         * Builds the Coverage gauge TiChartSpec from a coverage report payload.
         *
         * @method
         * @param {Object} coverage - `report.coverage` (carries `overall.{n,N,pct}`).
         * @param {Object} meta - `report.meta` (carries `mode`, `partial`, `pctReporting`).
         * @returns {Object} TiChartSpec of type "gauge".
         * @public
         */
        buildGaugeSpec( coverage, meta ) {
            const overall = ( coverage && coverage.overall ) ? coverage.overall : { n: 0, N: 0, pct: 0 };
            const value = ( overall.N > 0 ) ? ( overall.n / overall.N ) : 0;
            const partial = !!( meta && meta.partial );
            let sublabel = String( overall.n ) + " / " + String( overall.N );
            if ( partial && meta && typeof meta.pctReporting === "number" ) {
                sublabel = sublabel + " · " + String( meta.pctReporting ) + "% reporting";
            }
            return {
                type: "gauge",
                data: { value: value, label: "Coverage", sublabel: sublabel },
                a11yLabel: "Coverage gauge: " + String( overall.n ) + " of " + String( overall.N ) + " complete",
                provisional: partial
            };
        },

        /**
         * Builds the per-group stacked-bars TiChartSpec from a coverage report payload.
         *
         * @method
         * @param {Object} coverage - `report.coverage` (carries `byGroup[]`).
         * @param {Object} meta - `report.meta`.
         * @returns {Object} TiChartSpec of type "bars".
         * @public
         */
        buildBarsSpec( coverage, meta ) {
            const groups = ( coverage && Array.isArray( coverage.byGroup ) ) ? coverage.byGroup : [];
            const rows = groups.map( function ( group ) {
                const byStatus = group.byStatus || {};
                const segments = [
                    { key: "Closed", v: byStatus[ "Closed" ] || 0, tone: "grade-s" },
                    { key: "Ready", v: byStatus[ "Ready" ] || 0, tone: "grade-r" },
                    { key: "In Review", v: byStatus[ "In Review" ] || 0, tone: "grade-u" },
                    { key: "Open", v: byStatus[ "Open" ] || 0, tone: "grade-n" },
                    { key: "Not started", v: group.notStarted || 0, tone: "ink" }
                ];
                const groupN = group.N || 0;
                // "Complete" mirrors the gauge: an evaluation counts once it reaches Ready or Closed.
                const complete = ( byStatus[ "Closed" ] || 0 ) + ( byStatus[ "Ready" ] || 0 );
                const pct = ( groupN > 0 ) ? Math.round( ( complete / groupN ) * 100 ) : 0;
                return {
                    id: String( group.groupKey || group.groupLabel || "" ),
                    label: group.groupLabel || "",
                    segments: segments,
                    total: groupN,
                    valueLabel: String( pct ) + "%"
                };
            } );
            return {
                type: "bars",
                data: { rows: rows },
                options: { mode: "stacked", legend: this.buildCoverageLegend() },
                a11yLabel: "Coverage by group: " + String( rows.length ) + " groups",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * Status legend for the coverage stacked bars — the five segment types with their grade/ink tones and
         * localized labels. Carried on the spec so the chart renders a swatch key below the bars, making the
         * otherwise-unlabelled segment colours decipherable.
         *
         * @method
         * @returns {Array<{label:string,tone:string}>}
         * @public
         */
        buildCoverageLegend() {
            const entries = [
                { key: "closed", tone: "grade-s" },
                { key: "ready", tone: "grade-r" },
                { key: "in-review", tone: "grade-u" },
                { key: "open", tone: "grade-n" },
                { key: "not-started", tone: "ink" }
            ];
            return entries.map( function ( entry ) {
                return { label: tiApplication.getLabel( "interface.insights.cycle.coverage-legend." + entry.key, entry.key ), tone: entry.tone };
            } );
        },

        hasCoverage() {
            return !!( this.coverage && this.coverage.overall );
        },

        pendingRows() {
            return ( this.coverage && Array.isArray( this.coverage.pending ) ) ? this.coverage.pending : [];
        },

        getCycleSubtitle() {
            if ( !this.cycle ) return "";
            const mode = ( this.meta && this.meta.mode === "live" )
                ? tiApplication.getLabel( "interface.insights.cycle.mode-live", "as of now" )
                : tiApplication.getLabel( "interface.insights.cycle.mode-snapshot", "final" );
            return ( this.cycle.name || "" ) + " · " + mode;
        },

        isLive() {
            return !!( this.meta && this.meta.mode === "live" );
        },

        // CA-L7 live caveat banner: on an ACTIVE cycle, surface the "as of now / % reporting" provisionality.
        getCaveatBanner() {
            if ( !this.meta ) return "";
            if ( this.meta.mode === "live" ) {
                const live = tiApplication.getLabel( "interface.insights.cycle.mode-live", "as of now" );
                if ( this.meta.partial && typeof this.meta.pctReporting === "number" ) {
                    return live + " · " + String( this.meta.pctReporting ) + "% " + tiApplication.getLabel( "interface.insights.cycle.reporting", "reporting" );
                }
                return live;
            }
            return tiApplication.getLabel( "interface.insights.cycle.mode-snapshot", "final" );
        },

        getGaugeAriaLabel() {
            return this.coverageGaugeSpec.a11yLabel;
        },

        getBarsAriaLabel() {
            return this.coverageBarsSpec.a11yLabel;
        },

        pendingTone( status ) {
            if ( status === "Open" ) return "info";
            if ( status === "In Review" ) return "warn";
            if ( status === "Ready" ) return "success";
            return "";
        },

        /**
         * R2 — grouped bars (month × {planned, finalised}). Maps timeDistribution.rows to the ti-chart grouped contract.
         * @method
         */
        buildTimeDistributionSpec( report, meta ) {
            const monthRows = ( report && Array.isArray( report.rows ) ) ? report.rows : [];
            const rows = monthRows.map( function ( m ) {
                return {
                    id: String( m.monthKey || "" ), label: String( m.monthKey || "" ), values: [
                        { key: "planned", v: m.planned || 0, tone: "grade-r" },
                        { key: "held", v: m.held || 0, tone: "grade-s" }
                    ]
                };
            } );
            return {
                type: "bars", data: { rows: rows }, options: { mode: "grouped" },
                a11yLabel: "Interview timing across " + String( rows.length ) + " months (planned vs finalised)",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * R3 — scatter (x=manager, y=self, z=team bubble) with the y=x diagonal + quadrant midlines.
         * @method
         */
        buildAlignmentSpec( report, meta ) {
            const points = ( report && Array.isArray( report.points ) ) ? report.points.map( function ( p ) {
                return { id: String( p.evaluationID || "" ), x: p.x, y: p.y, z: p.z, tone: ( p.gap > 0 ) ? "grade-s" : ( p.gap < 0 ? "grade-n" : "info" ) };
            } ) : [];
            const midpoint = ( report && typeof report.midpoint === "number" ) ? report.midpoint : 1.0;
            return {
                type: "scatter",
                data: { points: points, diagonal: true },
                options: { bubble: "z", domain: { xMin: 0, xMax: 1.3, yMin: 0, yMax: 1.3 }, midX: midpoint, midY: midpoint },
                a11yLabel: "Self vs manager alignment: " + String( points.length ) + " people",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * R4 — heatmap; `view` selects the sequential value scale or the diverging gap (delta) scale.
         * @method
         */
        buildHeatmapSpec( report, view, meta ) {
            const gap = ( view === "gap" );
            const rows = ( report && Array.isArray( report.rows ) ) ? report.rows : [];
            const cols = ( report && Array.isArray( report.cols ) ) ? report.cols : [];
            const cells = ( report && Array.isArray( report.cells ) ) ? report.cells.map( function ( c ) {
                return { r: c.r, c: c.c, v: gap ? c.delta : c.v, n: c.n, delta: c.delta, expected: c.expected, suppressed: c.suppressed };
            } ) : [];
            return {
                type: "heatmap", data: { rows: rows, cols: cols, cells: cells },
                options: { scale: gap ? "diverging" : "sequential" },
                a11yLabel: "Competence heatmap (" + ( gap ? "gap vs expected" : "value" ) + "): " + String( rows.length ) + " subcategories × " + String( cols.length ) + " groups",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * R5 — box plot per stage level with the per-box expected marker + the T3 reference.
         * @method
         */
        buildLevelDistributionSpec( report, meta ) {
            const groups = ( report && Array.isArray( report.groups ) ) ? report.groups : [];
            const reference = ( report && Array.isArray( report.reference ) ) ? report.reference : [];
            return {
                type: "box", data: { groups: groups, reference: reference },
                options: { domain: { min: 0, max: 150 } },
                a11yLabel: "Score distribution across " + String( groups.length ) + " levels with expected markers",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * R6 — diverging bars of empirical-minus-configured share per subcategory (sorted by influence). Flagged
         * subcategories are accented; an empty/insufficient cohort yields no rows.
         * @method
         */
        buildPredictiveDriversSpec( report, meta ) {
            const driverRows = ( report && Array.isArray( report.rows ) ) ? report.rows : [];
            const rows = driverRows.map( function ( d ) {
                return {
                    id: String( d.id || "" ), label: String( d.label || d.id || "" ), values: [
                        { key: "divergence", v: d.divergence || 0, tone: d.misweightFlag ? "grade-u" : "info" }
                    ]
                };
            } );
            return {
                type: "bars", data: { rows: rows }, options: { mode: "diverging" },
                a11yLabel: "Performance drivers: empirical-minus-configured influence share per subcategory",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * Grader calibration — diverging bars per subcategory (vs-self + vs-team signed gaps, centered on 0).
         * @method
         */
        buildCalibrationSpec( calibration, meta ) {
            const bySub = ( calibration && calibration.bySubcategory && typeof calibration.bySubcategory === "object" ) ? calibration.bySubcategory : {};
            const order = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];
            const rows = order.filter( function ( key ) {
                return bySub[ key ];
            } ).map( function ( key ) {
                const cell = bySub[ key ];
                const self = ( cell.vsSelf && typeof cell.vsSelf.meanGap === "number" ) ? cell.vsSelf.meanGap : 0;
                const team = ( cell.vsTeam && typeof cell.vsTeam.meanGap === "number" ) ? cell.vsTeam.meanGap : 0;
                return { id: key, label: key, values: [ { key: "vsSelf", v: self, tone: "info" }, { key: "vsTeam", v: team, tone: "grade-r" } ] };
            } );
            return {
                type: "bars", data: { rows: rows }, options: { mode: "diverging" },
                a11yLabel: "Grader calibration: manager grade minus self/team per subcategory",
                provisional: !!( meta && meta.partial )
            };
        },

        /**
         * Grader calibration headline KPI — the overall vs-self gap as a stat tile (signed, with vs-team in the sub).
         * @method
         */
        buildCalibrationKpiSpec( calibration ) {
            const overall = ( calibration && calibration.overall ) ? calibration.overall : {};
            const self = ( overall.vsSelf && typeof overall.vsSelf.meanGap === "number" ) ? overall.vsSelf.meanGap : null;
            const team = ( overall.vsTeam && typeof overall.vsTeam.meanGap === "number" ) ? overall.vsTeam.meanGap : null;
            return {
                type: "stat",
                data: {
                    value: this.formatGap( { meanGap: self } ),
                    label: tiApplication.getLabel( "interface.insights.cycle.reports.calibration.kpi-self", "Avg gap vs self" ),
                    sub: tiApplication.getLabel( "interface.insights.cycle.reports.calibration.kpi-team", "vs team" ) + ": " + this.formatGap( { meanGap: team } )
                },
                a11yLabel: "Overall grader gap vs self " + this.formatGap( { meanGap: self } ) + ", vs team " + this.formatGap( { meanGap: team } )
            };
        },

        // Signed gap formatter for calibration cells: "+0.30" / "-0.20" / "—" (suppressed or missing).
        formatGap( cell ) {
            if ( !cell || cell.suppressed || typeof cell.meanGap !== "number" ) {
                return "—";
            }
            return ( cell.meanGap > 0 ? "+" : "" ) + cell.meanGap.toFixed( 2 );
        },
        hasCalibration() {
            return !!( this.calibration && this.calibration.bySubcategory && Object.keys( this.calibration.bySubcategory ).length );
        },
        calibrationDrillRows() {
            return ( this.calibration && Array.isArray( this.calibration.perCompetency ) ) ? this.calibration.perCompetency : [];
        },
        getCalibrationAriaLabel() {
            return this.calibrationSpec.a11yLabel;
        },
        getCalibrationKpiAriaLabel() {
            return this.calibrationKpiSpec.a11yLabel;
        },

        setHeatmapView( view ) {
            this.heatmapView = ( view === "gap" ) ? "gap" : "value";
            this.heatmapSpec = this.buildHeatmapSpec( this.heatmap, this.heatmapView, this.meta );
        },
        onHeatmapViewChange( event ) {
            this.setHeatmapView( event && event.target ? event.target.value : "value" );
        },

        hasTimeDistribution() {
            return !!( this.timeDistribution && Array.isArray( this.timeDistribution.rows ) && this.timeDistribution.rows.length );
        },
        hasAlignment() {
            return !!( this.alignment && Array.isArray( this.alignment.points ) && this.alignment.points.length );
        },
        hasHeatmap() {
            return !!( this.heatmap && Array.isArray( this.heatmap.cells ) && this.heatmap.cells.length );
        },
        hasLevelDistribution() {
            return !!( this.levelDistribution && Array.isArray( this.levelDistribution.groups ) && this.levelDistribution.groups.length );
        },
        hasPredictiveDrivers() {
            return !!( this.predictiveDrivers && Array.isArray( this.predictiveDrivers.rows ) && this.predictiveDrivers.rows.length );
        },

        reportLabel( key, field, fallback ) {
            return tiApplication.getLabel( "interface.insights.cycle.reports." + key + "." + field, fallback );
        },
        getTimeDistributionAriaLabel() {
            return this.timeDistributionSpec.a11yLabel;
        },
        getAlignmentAriaLabel() {
            return this.alignmentSpec.a11yLabel;
        },
        getHeatmapAriaLabel() {
            return this.heatmapSpec.a11yLabel;
        },
        getLevelDistributionAriaLabel() {
            return this.levelDistributionSpec.a11yLabel;
        },
        getPredictiveDriversAriaLabel() {
            return this.predictiveDriversSpec.a11yLabel;
        }
    };
};

/**
 * Insights → Cycle analytics (Supervisor, whole-org). Thin wrapper over the shared screen factory.
 * @returns {Object}
 */
const configureInsightsCycle = () => configureInsightsScreen( { shellEndpoint: "load-insights-cycle", reportScope: "org", includeCalibration: false } );

/**
 * Insights → Team analytics (Manager subtree / Supervisor subtree). Same six reports scoped to the requesting user's
 * subtree (?scope=team) plus the grader-calibration report.
 * @returns {Object}
 */
const configureInsightsTeam = () => configureInsightsScreen( { shellEndpoint: "load-insights-team", reportScope: "team", includeCalibration: true } );

/**
 * Insights → Trends (Cross-cycle, CA-X3). SUPERVISOR-only whole-org trends over the persisted snapshots: overall score
 * (line + p25–p75 band), T-band mix (stacked bars per cycle), gap-closure (multi-series line of bySubcategory gap),
 * ladder movement (stacked ordinal bars + mean-rung line), and cohort comparison (per role-family score line). Reads the
 * load-results-trend endpoint per metric; the x-axis is the snapshots' chronological cycle list (no cycle selector).
 * @returns {Object}
 */
const configureTrendsScreen = () => {
    const tiApplication = Alpine.store( "tiApplication" );
    const BAND_TONES = { T1: "grade-n", T2: "grade-n", T3: "grade-r", T4: "grade-s", T5: "grade-s" };
    const ORDINAL_TONES = { "1": "grade-n", "2": "grade-n", "3": "grade-r", "4": "grade-s", "5": "grade-s" };

    return {
        isLoading: true,
        hasData: false,
        partial: false,
        overallSpec: { type: "line", data: { x: [], series: [] }, options: {}, a11yLabel: "" },
        tbandSpec: { type: "bars", data: { rows: [] }, options: { mode: "stacked" }, a11yLabel: "" },
        gapSpec: { type: "line", data: { x: [], series: [] }, options: { zeroBaseline: true }, a11yLabel: "" },
        ladderSpec: { type: "bars", data: { rows: [] }, options: { mode: "stacked" }, a11yLabel: "" },
        ladderRungSpec: { type: "line", data: { x: [], series: [] }, options: {}, a11yLabel: "" },
        cohortSpec: { type: "line", data: { x: [], series: [] }, options: {}, a11yLabel: "" },

        init() {
            const onInitialized = () => {
                this.loadTrends();
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

        loadTrends() {
            this.isLoading = true;
            const url = ( metric, extra ) => "/app/load-results-trend?metric=" + metric + ( extra || "" );
            // The framework keys in-flight GET requests by path with the query string stripped (see ti-framework
            // sendRequest) and aborts the previous request that shares a key. All five trend metrics target the same
            // /app/load-results-trend path, so firing them with Promise.all made each call abort the one before it —
            // four requests cancelled, the rejection surfaced as an AbortError, and the screen hung on "Loading…".
            // Load them sequentially so every metric resolves against its own request.
            const metrics = [
                [ "overallScore", "" ],
                [ "tBandMix", "" ],
                [ "gapClosure", "" ],
                [ "ladder", "" ],
                [ "cohort", "&dimension=roleFamily" ]
            ];
            const results = [];
            metrics.reduce( ( chain, metric ) => chain.then( () => {
                return tiApplication.sendRequest( url( metric[ 0 ], metric[ 1 ] ) ).then( ( result ) => {
                    results.push( result );
                } );
            } ), Promise.resolve() ).then( () => {
                const dataOf = ( result ) => ( ( result && result.data && typeof result.data === "object" ) ? result.data : {} );
                const overall = dataOf( results[ 0 ] );
                const tband = dataOf( results[ 1 ] );
                const gap = dataOf( results[ 2 ] );
                const ladder = dataOf( results[ 3 ] );
                const cohort = dataOf( results[ 4 ] );

                const cycles = ( overall.meta && Array.isArray( overall.meta.cycles ) ) ? overall.meta.cycles : [];
                this.hasData = cycles.length > 0;
                this.partial = !!( overall.meta && overall.meta.partial );

                this.overallSpec = this.buildLineSpec( overall, "interface.insights.trends.reports.overall.title", {} );
                this.tbandSpec = this.buildStackedSpec( tband, BAND_TONES, "interface.insights.trends.tband-title" );
                this.gapSpec = this.buildLineSpec( gap, "interface.insights.trends.reports.gapClosure.title", { zeroBaseline: true } );
                this.ladderSpec = this.buildStackedSpec( this.ladderHistogramOnly( ladder ), ORDINAL_TONES, "interface.insights.trends.reports.ladder.title" );
                this.ladderRungSpec = this.buildLineSpec( this.ladderRungOnly( ladder ), "interface.insights.trends.rung-title", {} );
                this.cohortSpec = this.buildLineSpec( cohort, "interface.insights.trends.reports.cohort.title", {} );
                this.isLoading = false;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.isLoading = false;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error && error.exception && ( error.exception.httpCode === 401 || error.exception.httpCode === 403 ) ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        // The x-axis (cycle labels) from a trend payload's meta.cycles.
        cycleAxis( trend ) {
            const cycles = ( trend && trend.meta && Array.isArray( trend.meta.cycles ) ) ? trend.meta.cycles : [];
            return cycles.map( ( c ) => ( { id: c.cycleID, label: c.cycleID } ) );
        },

        // A line spec straight from a trend payload's series (each carries values + optional band + tone).
        buildLineSpec( trend, titleKey, extraOptions ) {
            const series = ( trend && Array.isArray( trend.series ) ) ? trend.series.map( ( s ) => {
                const out = { key: s.key, tone: s.tone || "info", values: Array.isArray( s.values ) ? s.values : [] };
                if ( Array.isArray( s.band ) ) {
                    out.band = s.band;
                }
                if ( s.style ) {
                    out.style = s.style;
                }
                return out;
            } ) : [];
            const options = Object.assign( {}, extraOptions || {} );
            if ( trend && trend.meta && trend.meta.partial ) {
                options.provisionalLastPoint = true;
            }
            return { type: "line", data: { x: this.cycleAxis( trend ), series: series }, options: options, a11yLabel: tiApplication.getLabel( titleKey, "" ) };
        },

        // A stacked-bars spec (one bar per cycle) transposed from a trend payload's per-band/ordinal series.
        buildStackedSpec( trend, toneMap, titleKey ) {
            const axis = this.cycleAxis( trend );
            const series = ( trend && Array.isArray( trend.series ) ) ? trend.series : [];
            const rows = axis.map( ( cyc, i ) => {
                let total = 0;
                const segments = series.map( ( s ) => {
                    const v = ( Array.isArray( s.values ) && typeof s.values[ i ] === "number" ) ? s.values[ i ] : 0;
                    total += v;
                    return { key: s.key, v: v, tone: toneMap[ s.key ] || "info" };
                } );
                return { id: cyc.id, label: cyc.label, total: total, segments: segments };
            } );
            return { type: "bars", data: { rows: rows }, options: { mode: "stacked" }, a11yLabel: tiApplication.getLabel( titleKey, "" ) };
        },

        // Splits the ladder trend payload into the ordinal-histogram series (drops the meanRung line) for the stacked bars.
        ladderHistogramOnly( trend ) {
            if ( !trend || !Array.isArray( trend.series ) ) {
                return trend;
            }
            return Object.assign( {}, trend, { series: trend.series.filter( ( s ) => s.key !== "meanRung" ) } );
        },
        // Keeps only the meanRung line series for the rung overlay.
        ladderRungOnly( trend ) {
            if ( !trend || !Array.isArray( trend.series ) ) {
                return trend;
            }
            return Object.assign( {}, trend, { series: trend.series.filter( ( s ) => s.key === "meanRung" ) } );
        },

        getCaveatBanner() {
            return tiApplication.getLabel( "interface.insights.trends.provisional-caveat", "The latest cycle is still active — its point is provisional." );
        },
        getOverallAria() {
            return this.overallSpec.a11yLabel;
        },
        getTbandAria() {
            return this.tbandSpec.a11yLabel;
        },
        getGapAria() {
            return this.gapSpec.a11yLabel;
        },
        getLadderAria() {
            return this.ladderSpec.a11yLabel;
        },
        getLadderRungAria() {
            return this.ladderRungSpec.a11yLabel;
        },
        getCohortAria() {
            return this.cohortSpec.a11yLabel;
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
        serverTasks: [],
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
                this.serverTasks = Array.isArray( data.tasks ) ? tiToolbox.structuredClone( data.tasks ) : [];
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

        _buildTasks() {
            const tasks = [];
            if ( this.myEvaluation ) {
                const s = this.myEvaluation.status;
                // Only prompt the self-evaluation while it is genuinely outstanding. An Open evaluation whose self part
                // is already submitted has no action for the employee (it is waiting on peers / the manager).
                if ( ( s === "Not Started" || s === "Open" ) && !this.myEvaluation.selfEvaluationCompleted ) {
                    tasks.push( {
                        id: "self-eval",
                        tone: "info",
                        title: tiApplication.getLabel( "interface.evaluation.appraisal.title", "Performance Appraisal Form" ),
                        sub: tiApplication.getLabel( "interface.dashboard.task-self-eval-sub", "Your evaluation is open — complete your self-assessment" ),
                        action: "evaluation"
                    } );
                }
                // The interview tasks (schedule / scheduled) are server-derived below — interview scheduling is a
                // Supervisor action, so an employee is never prompted to open the Supervisor-only schedule screen.
            }
            if ( this.isManager ) {
                const pendingReview = this.teamEvaluations.filter( ( e ) => e.status === "In Review" ).length;
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
            // Server-derived tasks from the TaskResolver (team-feedback, team-finalize). Each carries the evaluatee's
            // employeeID + evaluationID so handleTaskClick can open the correct record (a colleague's, not the viewer's).
            for ( const serverTask of this.serverTasks ) {
                const name = serverTask.employeeName || serverTask.employeeID || "";
                if ( serverTask.type === "team-feedback" ) {
                    const stateLabel = serverTask.overdue
                        ? tiApplication.getLabel( "interface.dashboard.task-feedback-overdue", "Feedback overdue" )
                        : tiApplication.getLabel( "interface.dashboard.task-feedback-due", "Feedback requested" );
                    tasks.push( {
                        id: "team-feedback-" + serverTask.evaluationID,
                        tone: serverTask.overdue ? "warn" : "info",
                        title: tiApplication.getLabel( "interface.dashboard.task-team-feedback", "Provide team feedback for a colleague" ),
                        sub: name + " · " + stateLabel,
                        employeeID: serverTask.employeeID,
                        evaluationID: serverTask.evaluationID
                    } );
                } else if ( serverTask.type === "team-finalize" ) {
                    tasks.push( {
                        id: "team-finalize-" + serverTask.evaluationID,
                        tone: "warn",
                        title: tiApplication.getLabel( "interface.dashboard.task-team-finalize", "Finalize team feedback" ),
                        sub: name + " · " + serverTask.pendingCount + " " + tiApplication.getLabel( "interface.dashboard.task-finalize-pending", "reviewer(s) still pending" ),
                        employeeID: serverTask.employeeID,
                        evaluationID: serverTask.evaluationID
                    } );
                } else if ( serverTask.type === "interview-schedule" ) {
                    // Supervisor-only aggregate: N READY evaluations awaiting a booked slot. Opens the schedule screen.
                    tasks.push( {
                        id: "interview-schedule",
                        tone: "info",
                        title: tiApplication.getLabel( "interface.dashboard.task-interview-schedule", "Interviews awaiting scheduling" ) + " (" + serverTask.count + ")",
                        sub: tiApplication.getLabel( "interface.dashboard.task-interview-pending", "Ready evaluations need an interview slot." ),
                        action: "schedule"
                    } );
                } else if ( serverTask.type === "interview-scheduled" ) {
                    const on = tiApplication.getLabel( "interface.dashboard.task-interview-on", "Scheduled for" );
                    const when = tiToolbox.formatDate( serverTask.interviewDate, "" );
                    if ( serverTask.audience === "manager" ) {
                        // The evaluatee's manager: informational; opens the read-only Team Interviews view.
                        tasks.push( {
                            id: "interview-scheduled-" + serverTask.employeeID,
                            tone: "success",
                            title: tiApplication.getLabel( "interface.dashboard.task-interview-scheduled-team", "Team interview scheduled" ),
                            sub: name + " · " + on + " " + when,
                            action: "schedule"
                        } );
                    } else {
                        // The evaluatee themselves: opens their own evaluation, which shows the interview date.
                        tasks.push( {
                            id: "interview-scheduled-self",
                            tone: "success",
                            title: tiApplication.getLabel( "interface.dashboard.task-interview-scheduled-self", "Your interview is scheduled" ),
                            sub: on + " " + when,
                            evaluationID: serverTask.evaluationID
                        } );
                    }
                }
            }
            return tasks;
        },

        handleTaskClick( task ) {
            if ( task.evaluationID ) {
                const params = new URLSearchParams();
                if ( task.employeeID ) params.set( "employeeID", task.employeeID );
                params.set( "evaluationID", task.evaluationID );
                tiApplication.openScreen( "competence-evaluation?" + params.toString() );
                return;
            }
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
                // Non-validation failure (e.g. another cycle already ACTIVE): close the confirm modal and surface the
                // error as a toast — it now renders above the modal layer, and the toast carries the details line.
                this.closeModal();
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
                this.closeModal();
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
        poolByFamily: {},
        excludedFamilies: [],
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
            this.poolByFamily = data.poolByFamily ? tiToolbox.structuredClone( data.poolByFamily ) : {};
            this.excludedFamilies = Array.isArray( data.excludedFamilies ) ? tiToolbox.structuredClone( data.excludedFamilies ) : [];
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

        saveTeamFeedbackDeadline() {
            if ( this.isReadOnly ) {
                return;
            }
            const value = ( this.cycle && this.cycle.teamFeedbackDeadline ) ? this.cycle.teamFeedbackDeadline : "";
            tiApplication.sendRequest( "/app/set-cycle-team-feedback-deadline", "POST", {
                cycleID: this.cycleID,
                teamFeedbackDeadline: value
            } ).then( ( result ) => {
                if ( result && result.data && result.data.teamFeedbackDeadline ) {
                    this.cycle.teamFeedbackDeadline = result.data.teamFeedbackDeadline;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.cycle-setup.team-feedback-deadline-saved", "Team-feedback deadline saved." ) );
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
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
                this.closeModal();
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
            // An excluded family is not part of the cycle — its nodes read as "excluded" regardless of configuration.
            if ( this.isFamilyExcluded( familyCode ) ) {
                return "excluded";
            }
            const persisted = this.sets[ familyCode ] && this.sets[ familyCode ][ key ];
            const groupKey = key === "baseline" ? familyCode : `${ familyCode }.${ key }`;
            const hasErrors = ( this.validation.errorsByFamily && Array.isArray( this.validation.errorsByFamily[ groupKey ] ) && this.validation.errorsByFamily[ groupKey ].length > 0 );
            // Family-level errors also bubble into baseline nodes (no-empty-baseline, baseline-floor-coverage,
            // family-not-configured). Checked before the unconfigured case so an empty *included* family reads as a
            // blocker (warn), not a benign "unconfigured".
            const familyErrors = ( key === "baseline" && this.validation.errorsByFamily && Array.isArray( this.validation.errorsByFamily[ familyCode ] ) && this.validation.errorsByFamily[ familyCode ].length > 0 );

            if ( hasErrors || familyErrors ) {
                return "warn";
            }
            if ( !persisted ) {
                return "unconfigured";
            }
            if ( persisted.codes && persisted.codes.length === 0 ) {
                return key === "baseline" ? "warn" : "empty";
            }
            return "clean";
        },

        getNodeStatusAria( familyCode, key ) {
            const status = this.getNodeStatus( familyCode, key );
            return tiApplication.getLabel( `interface.cycle-setup.tree-status.${ status }-aria`, "" );
        },

        getNodeCount( familyCode, key ) {
            const persisted = this.sets[ familyCode ] && this.sets[ familyCode ][ key ];
            return ( persisted && Array.isArray( persisted.codes ) ) ? persisted.codes.length : 0;
        },

        /* -------------------------- Family exclusion ----------------------- */

        isFamilyExcluded( familyCode ) {
            return this.excludedFamilies.indexOf( familyCode ) >= 0;
        },

        isSelectedFamilyExcluded() {
            return !!this.selectedFamily && this.isFamilyExcluded( this.selectedFamily );
        },

        // Toggle the selected family's inclusion in the cycle. An excluded family is skipped by lock validation and has
        // its specializations hidden in the tree; the baseline node stays reachable so the family can be re-included.
        toggleFamilyExcluded() {
            if ( this.isReadOnly || !this.selectedFamily || this.saving ) return;
            const family = this.selectedFamily;
            const excluded = !this.isFamilyExcluded( family );
            this.saving = true;
            tiApplication.sendRequest( "/app/set-family-excluded", "POST", { cycleID: this.cycleID, roleFamily: family, excluded } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( excluded ? "interface.cycle-setup.toast.family-excluded" : "interface.cycle-setup.toast.family-included" ) );
                this.saving = false;
                this.reloadAfterSave();
            } ).catch( ( error ) => {
                this.saving = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
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

        // Cap text split into a count + suffix so the markup can render <strong>{count}</strong> followed by a muted
        // qualifier. Mirrors the design concept's `<strong>N</strong> of CAP competencies for Family · Spec`.
        getCapCount() {
            return this.getResolvedSize();
        },

        getCapSuffix() {
            const family = this.getSelectedFamily();
            if ( this.selectedKey === "baseline" ) {
                const tmpl = tiApplication.getLabel( "interface.cycle-setup.cap-suffix", "of {cap} competencies for {family}" );
                return tmpl.replace( "{cap}", String( this.cap ) ).replace( "{family}", family.name || "" );
            }
            const spec = this.getSelectedSpec();
            const baselineSize = this.getBaselineCodes().length;
            const specSize = this.draft.codes.length;
            const tmpl = tiApplication.getLabel( "interface.cycle-setup.cap-suffix-spec", "of {cap} competencies (baseline {b} + specialization {s}) for {family} · {spec}" );
            return tmpl
                .replace( "{cap}", String( this.cap ) )
                .replace( "{b}", String( baselineSize ) )
                .replace( "{s}", String( specSize ) )
                .replace( "{family}", family.name || "" )
                .replace( "{spec}", spec.name || "" );
        },

        // Read-only banner copy varies by cycle status (ACTIVE vs CLOSED) so users see a status-aware reason for why
        // the editor is read-only. Falls back to the generic banner when status doesn't match either case.
        getReadOnlyBannerText() {
            const status = ( this.cycle && this.cycle.status ) ? String( this.cycle.status ).toUpperCase() : "";
            if ( status === "ACTIVE" ) {
                return tiApplication.getLabel( "interface.cycle-setup.read-only-banner-active" );
            }
            if ( status === "CLOSED" ) {
                return tiApplication.getLabel( "interface.cycle-setup.read-only-banner-closed" );
            }
            return tiApplication.getLabel( "interface.cycle-setup.read-only-banner" );
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
            // Constrain the picker to the selected family's competency pool (its applicability universe). Every family
            // has a pool (unpopulated disciplines still carry the shared canonical competencies); a family with no pool
            // entry at all yields an empty picker, which is the correct "nothing to add yet" state.
            const familyPool = this.poolByFamily[ this.selectedFamily ];
            const poolSet = new Set( Array.isArray( familyPool ) ? familyPool : [] );
            const competencies = Object.values( this.competenciesByCode );
            return competencies.filter( ( competency ) => {
                if ( !poolSet.has( competency.code ) ) return false;
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
            if ( this.isCodeInDraft( code ) || this.isCodeInBaseline( code ) ) return;
            const selected = this.modal.payload.selected || {};
            if ( selected[ code ] ) {
                delete selected[ code ];
            } else {
                selected[ code ] = true;
            }
            this.modal.payload.selected = { ...selected };
        },

        // Null-safe lookup used by the picker row bindings. closeModal() resets modal.payload to {} (no `selected`
        // key), and Alpine can re-evaluate the inner x-bind one last time before the parent x-if unmounts the
        // picker — without this guard the subscript throws "Cannot read property of null or undefined".
        isPickerCodeSelected( code ) {
            const selected = this.modal && this.modal.payload && this.modal.payload.selected;
            return !!( selected && selected[ code ] );
        },

        pickerRowClass( code ) {
            const selectedClass = this.isPickerCodeSelected( code ) ? "is-selected" : "";
            const disabledClass = ( this.isCodeInDraft( code ) || this.isCodeInBaseline( code ) ) ? " is-disabled" : "";
            return selectedClass + disabledClass;
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

        // When configuring a specialization, the family's persisted baseline competencies are already part of every
        // employee's resolved set (resolved = baseline ∪ specialization), so adding them here would be redundant. They
        // surface as disabled rows flagged "in baseline". Baseline nodes have no parent set, so nothing is excluded.
        isCodeInBaseline( code ) {
            if ( this.selectedKey === "baseline" ) return false;
            return this.getBaselineCodes().indexOf( code ) >= 0;
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
            const persistedCodes = ( persisted && Array.isArray( persisted.codes ) ) ? persisted.codes : null;
            const persistedMarkedEmpty = ( persisted && persisted.markedEmpty === true );
            const draftCodes = this.draft.codes;
            // Read the marker unconditionally so the binding always tracks it reactively, regardless of which branch
            // below returns — otherwise toggling the checkbox would not re-enable the Save button.
            const draftMarkedEmpty = ( this.draft.markedEmpty === true );

            // Any difference in the code set is a change.
            if ( persistedCodes === null ) {
                if ( draftCodes.length > 0 ) return true;
            } else if ( persistedCodes.length !== draftCodes.length ) {
                return true;
            } else {
                for ( let i = 0; i < persistedCodes.length; i++ ) {
                    if ( persistedCodes[ i ] !== draftCodes[ i ] ) return true;
                }
            }

            // Codes match the persisted state. For a specialization with no codes, flipping the "intentionally empty"
            // marker is itself the saveable change — both marking it (→ persist empty) and un-marking it (→ revert to
            // "not configured") count as dirty. Baseline sets have no such marker.
            if ( this.selectedKey !== "baseline" && draftCodes.length === 0 ) {
                return draftMarkedEmpty !== persistedMarkedEmpty;
            }
            return false;
        },

        saveDraft() {
            if ( this.isReadOnly || this.saving || !this.isDirty() ) return;
            const family = this.selectedFamily;
            const key = this.selectedKey;
            const isSpec = key !== "baseline";
            const draftCodes = this.draft.codes.slice();
            const markedEmpty = this.draft.markedEmpty === true;
            const wasPersisted = !!( this.sets[ family ] && this.sets[ family ][ key ] );

            this.saving = true;

            let endpoint;
            let params;
            if ( isSpec && draftCodes.length === 0 && !markedEmpty && wasPersisted ) {
                // Un-marked an "intentionally empty" specialization → clear it back to "not configured".
                endpoint = "/app/clear-active-competency-set";
                params = { cycleID: this.cycleID, roleFamily: family, key };
            } else if ( isSpec && draftCodes.length === 0 && markedEmpty ) {
                endpoint = "/app/mark-active-set-empty";
                params = { cycleID: this.cycleID, roleFamily: family, key };
            } else {
                endpoint = "/app/set-active-competency-set";
                params = { cycleID: this.cycleID, roleFamily: family, key, codes: draftCodes };
            }

            tiApplication.sendRequest( endpoint, "POST", params ).then( () => {
                const toastLabel = ( endpoint === "/app/mark-active-set-empty" ) ? "interface.cycle-setup.toast.marked-empty"
                    : ( endpoint === "/app/clear-active-competency-set" ) ? "interface.cycle-setup.toast.cleared"
                        : "interface.cycle-setup.toast.saved";
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
        supervisor: { isSupervisor: false, source: null },
        permissions: {
            isSupervisor: false,
            isDirectManager: false,
            isSelf: false,
            canEditAllFields: false,
            canEditSpecialization: false,
            canViewAudit: false,
            canAssignSupervisor: false,
            canRevokeSupervisor: false
        }
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
        supervisorBusy: false,
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

        openEvaluation( employeeID, evaluationID ) {
            let screen = "competence-evaluation?employeeID=" + encodeURIComponent( employeeID );
            if ( evaluationID ) {
                screen += "&evaluationID=" + encodeURIComponent( evaluationID );
            }
            tiApplication.openScreen( screen );
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

        hasActiveFilters() {
            const f = this.filters || {};
            return !!( f.search || f.roleFamily || f.specialization || f.stageLevel || f.employmentStatus );
        },

        clearAllFilters() {
            this.filters = { search: "", roleFamily: "", specialization: "", stageLevel: "", employmentStatus: "" };
        },

        filteredCountLabel() {
            const n = this.filteredEmployees().length;
            const key = n === 1 ? "interface.employee-management.list-count-one" : "interface.employee-management.list-count";
            return tiApplication.getLabel( key ).replace( "{n}", String( n ) );
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

        // Per-level helpers used by the split Level + Stage selects in the Details form.
        availableStagesForLevel( levelCode ) {
            const entry = ( this.options.stageLevels || [] ).find( ( sl ) => sl.code === levelCode );
            return entry ? ( entry.stages || [] ) : [];
        },

        availableStagesForDraft() {
            if ( !this.draft || !this.draft.career ) return [];
            return this.availableStagesForLevel( this.draft.career.level );
        },

        // Imperatively sync the select's DOM value with the underlying draft after the option <template>
        // has rendered its children. Alpine's x-model / x-bind:value can race the x-for and end up
        // setting element.value before any option exists, leaving the select on its first option.
        // Calling these from x-effect re-runs whenever draft.career changes.
        syncLevelSelect( el ) {
            const draft = this.draft;
            const value = ( draft && draft.career && draft.career.level ) ? draft.career.level : "";
            this.$nextTick( () => {
                if ( el && el.value !== value ) {
                    el.value = value;
                }
            } );
        },

        syncStageSelect( el ) {
            const career = this.draft && this.draft.career;
            if ( !career ) return;
            // Read level too so x-effect re-runs when level changes — Stage's <template x-for>
            // rebuilds its options at that point and the selection would otherwise be lost.
            void career.level;
            const value = career.stage != null ? String( career.stage ) : "";
            this.$nextTick( () => {
                if ( el && el.value !== value ) {
                    el.value = value;
                }
            } );
        },

        // Same race fix for Specialization. Its hardcoded "Generalist" option absorbs the failed
        // match (the select displays the empty-value option when nothing else matches), so the
        // employee's real specialization never shows without this nudge. Reads roleFamily too so
        // it re-fires when family changes and the spec options are rebuilt.
        syncSpecializationSelect( el ) {
            const career = this.draft && this.draft.career;
            if ( !career ) return;
            void career.roleFamily;
            const value = career.specialization || "";
            this.$nextTick( () => {
                if ( el && el.value !== value ) {
                    el.value = value;
                }
            } );
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

        /* ------------------------- Supervisor grant / revoke --------------- */

        openSupervisorAssignModal() {
            this.modal = { kind: "supervisor-grant", payload: {}, errorMessage: "", busy: false };
        },

        supervisorAssignDescription() {
            const name = ( this.detail && this.detail.employee ) ? this.detail.employee.name : "";
            return tiApplication.getLabel( "interface.employee-management.supervisor.assign-modal.desc" ).replace( "{name}", name || "" );
        },

        confirmSupervisorAssign() {
            if ( this.supervisorBusy || !this.selectedEmployeeID ) return;
            this.supervisorBusy = true;
            const id = this.selectedEmployeeID;
            tiApplication.sendRequest( "/app/grant-supervisor", "POST", { employeeID: id } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.supervisor.toast-assigned" ) );
                this.supervisorBusy = false;
                this.closeModal();
                // Guard against a stale reload: if the user selected another employee while the request was in flight,
                // reloading `id` would replace the now-current detail with the wrong employee (and a later save would
                // post fields against the wrong selected ID).
                if ( this.selectedEmployeeID === id ) {
                    this.loadDetail( id );
                }
            } ).catch( ( error ) => {
                this.supervisorBusy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openSupervisorRevokeModal() {
            this.modal = { kind: "supervisor-revoke", payload: {}, errorMessage: "", busy: false };
        },

        supervisorRevokeDescription() {
            const name = ( this.detail && this.detail.employee ) ? this.detail.employee.name : "";
            return tiApplication.getLabel( "interface.employee-management.supervisor.revoke-modal.desc" ).replace( "{name}", name || "" );
        },

        confirmSupervisorRevoke() {
            if ( this.supervisorBusy || !this.selectedEmployeeID ) return;
            this.supervisorBusy = true;
            const id = this.selectedEmployeeID;
            tiApplication.sendRequest( "/app/revoke-supervisor", "POST", { employeeID: id } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.supervisor.toast-removed" ) );
                this.supervisorBusy = false;
                this.closeModal();
                // Same stale-reload guard as the assign path above.
                if ( this.selectedEmployeeID === id ) {
                    this.loadDetail( id );
                }
            } ).catch( ( error ) => {
                this.supervisorBusy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
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

        // Split Level + Stage controls. When Level changes, re-snap Stage to the first valid value for the
        // new level if the current stage isn't offered (e.g. R3 → T leaves only stage 1).
        onLevelChange( newLevel ) {
            if ( !this.draft ) return;
            this.draft.career.level = newLevel || "";
            const stages = this.availableStagesForLevel( newLevel );
            if ( stages.length === 0 ) {
                this.draft.career.stage = null;
            } else if ( !stages.includes( Number( this.draft.career.stage ) ) ) {
                this.draft.career.stage = stages[ 0 ];
            }
        },

        onStageChange( newStage ) {
            if ( !this.draft ) return;
            this.draft.career.stage = Number( newStage ) || null;
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

        formatDate( value, placeholder = "—" ) {
            return tiToolbox.formatDate( value, placeholder );
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

/**
 * Alpine component for the admin Configuration landing (frame-admin-config.html). Lists the configuration editors,
 * exports the live config bundle (via a plain download link in the markup), and shows the cross-document change feed
 * from the framework admin API with a re-validated restore. Admin-gated: non-admins are bounced to the dashboard.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureAdminConfig = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const emptyModal = () => ( { kind: null, payload: {} } );

    return {
        loaded: false,
        loadingChanges: false,
        restoring: false,
        changes: [],
        modal: emptyModal(),

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
                this.loaded = true;
                this.loadChanges();
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

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        openEditor( screen ) {
            tiApplication.openScreen( screen );
        },

        loadChanges() {
            this.loadingChanges = true;
            tiApplication.sendRequest( "/admin/config/changes" ).then( ( result ) => {
                this.changes = ( result && Array.isArray( result.data ) ) ? result.data : [];
                this.loadingChanges = false;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loadingChanges = false;
                this.changes = [];
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        formatTimestamp( value ) {
            if ( !value ) {
                return "";
            }
            const date = new Date( value );
            return tiToolbox.isValidDate( date ) ? date.toLocaleString() : String( value );
        },

        formatDocCount( change ) {
            const count = ( change && Array.isArray( change.documents ) ) ? change.documents.length : 0;
            const tmpl = ( count === 1 )
                ? tiApplication.getLabel( "interface.admin.doc-count-one", "{n} document" )
                : tiApplication.getLabel( "interface.admin.doc-count-many", "{n} documents" );
            return tmpl.replace( "{n}", String( count ) );
        },

        openRestore( change ) {
            this.modal = { kind: "restore", payload: { changeSetID: change.changeSetID, note: change.note || "" } };
        },

        closeModal() {
            this.modal = emptyModal();
        },

        submitRestore() {
            const changeSetID = this.modal.payload && this.modal.payload.changeSetID;
            if ( !changeSetID || this.restoring ) {
                return;
            }
            this.restoring = true;
            tiApplication.sendRequest( "/admin/config/changes/" + encodeURIComponent( changeSetID ) + "/restore", "POST", {} ).then( ( result ) => {
                this.restoring = false;
                const data = result && result.data;
                // Restore re-validates the historic snapshot against the *current* schemas/validators; a snapshot that
                // no longer validates comes back as { ok:false, errors } and nothing is written.
                if ( data && data.ok === false ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.restore-invalid", "Restore failed — the snapshot no longer passes validation." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.admin.restore-success", "Configuration restored." ) );
                this.closeModal();
                this.loadChanges();
            } ).catch( ( error ) => {
                this.restoring = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        }
    };
};

/**
 * Alpine component for the competency text editor (frame-competency-text-editor.html) — the bilingual BG-review
 * screen. Loads the `competency-text` composite editor (rows + per-document versions) from the framework admin API,
 * lists competencies grouped category -> subcategory, and edits each competency's name / description / six scope
 * anchors with language switch-with-reference (edit one language while the other shows read-only). Saves only the
 * changed rows through the composite editor (validate-all -> atomic, versioned change-set), surfacing validation
 * issues and version conflicts. Admin-gated.
 *
 * Edit fields use `x-bind:value` + `@input` (not `x-model`) because the bound language is dynamic, and the Alpine CSP
 * build does not allow computed member access in template expressions — the getter/setter methods do it in JS.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureCompetencyTextEditor = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const EDITOR_KEY = "competency-text";
    const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];

    return {
        loaded: false,
        saving: false,
        editLang: "bg",
        rows: [],
        versions: {},
        groups: [],
        rowsByCode: {},
        selectedCode: null,
        search: "",
        dirtyCodes: {},
        saveErrors: [],
        scopeLevels: SCOPE_LEVELS,

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
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

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        loadData() {
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY ).then( ( result ) => {
                const data = ( result && result.data ) || {};
                this.rows = Array.isArray( data.rows ) ? tiToolbox.structuredClone( data.rows ) : [];
                this.versions = data.versions ? tiToolbox.structuredClone( data.versions ) : {};
                this.dirtyCodes = {};
                this.saveErrors = [];
                this.indexRows();
                if ( this.selectedCode && !this.rowsByCode[ this.selectedCode ] ) {
                    this.selectedCode = null;
                }
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 401 || httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        // Build the grouped list (category -> subcategory -> codes) and the code index from the flat rows. Re-run when
        // the edit language changes so the list labels follow the active language.
        indexRows() {
            const byCode = {};
            const groupMap = {};
            const groupOrder = [];
            this.rows.forEach( ( row ) => {
                byCode[ row.code ] = row;
                const category = row.category || "";
                if ( !groupMap[ category ] ) {
                    groupMap[ category ] = { category: category, categoryName: this.langText( row.categoryName ), subMap: {}, subOrder: [] };
                    groupOrder.push( category );
                }
                const group = groupMap[ category ];
                const subcategory = row.subcategory || "";
                if ( !group.subMap[ subcategory ] ) {
                    group.subMap[ subcategory ] = { subcategory: subcategory, subName: this.langText( row.subcategoryName ), codes: [] };
                    group.subOrder.push( subcategory );
                }
                group.subMap[ subcategory ].codes.push( row.code );
            } );
            this.rowsByCode = byCode;
            this.groups = groupOrder.map( ( category ) => {
                const group = groupMap[ category ];
                return { category: group.category, categoryName: group.categoryName, subs: group.subOrder.map( ( key ) => group.subMap[ key ] ) };
            } );
        },

        langText( pair ) {
            const value = pair || {};
            return value[ this.editLang ] || value.en || value.bg || "";
        },

        otherLang() {
            return this.editLang === "en" ? "bg" : "en";
        },

        langLabel( lang ) {
            return ( lang === "en" )
                ? tiApplication.getLabel( "interface.admin.text-editor.lang-en", "English" )
                : tiApplication.getLabel( "interface.admin.text-editor.lang-bg", "Bulgarian" );
        },

        refLangLabel() {
            return this.langLabel( this.otherLang() );
        },

        isEditLang( lang ) {
            return this.editLang === lang;
        },

        setEditLang( lang ) {
            if ( lang !== "en" && lang !== "bg" ) {
                return;
            }
            this.editLang = lang;
            this.indexRows();
        },

        /* -------------------------- List ----------------------------------- */

        filteredGroups() {
            const query = ( this.search || "" ).trim().toLowerCase();
            if ( !query ) {
                return this.groups;
            }
            const out = [];
            this.groups.forEach( ( group ) => {
                const subs = [];
                group.subs.forEach( ( sub ) => {
                    const codes = sub.codes.filter( ( code ) => {
                        const row = this.rowsByCode[ code ];
                        const name = row ? this.langText( row.name ) : "";
                        return ( code + " " + name ).toLowerCase().indexOf( query ) >= 0;
                    } );
                    if ( codes.length > 0 ) {
                        subs.push( { subcategory: sub.subcategory, subName: sub.subName, codes: codes } );
                    }
                } );
                if ( subs.length > 0 ) {
                    out.push( { category: group.category, categoryName: group.categoryName, subs: subs } );
                }
            } );
            return out;
        },

        rowName( code ) {
            const row = this.rowsByCode[ code ];
            return row ? this.langText( row.name ) : code;
        },

        isSelected( code ) {
            return this.selectedCode === code;
        },

        isRowDirty( code ) {
            return this.dirtyCodes[ code ] === true;
        },

        selectCode( code ) {
            this.selectedCode = code;
        },

        /* -------------------------- Detail --------------------------------- */

        hasSelection() {
            return !!( this.selectedCode && this.rowsByCode[ this.selectedCode ] );
        },

        getDetail() {
            return this.selectedCode ? ( this.rowsByCode[ this.selectedCode ] || null ) : null;
        },

        detailCategory() {
            const detail = this.getDetail();
            return detail ? detail.category : "";
        },

        detailSubcategory() {
            const detail = this.getDetail();
            return detail ? detail.subcategory : "";
        },

        detailCategoryName() {
            const detail = this.getDetail();
            return detail ? this.langText( detail.categoryName ) : "";
        },

        detailSubcategoryName() {
            const detail = this.getDetail();
            return detail ? this.langText( detail.subcategoryName ) : "";
        },

        fieldValue( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.editLang ] || "" ) : "";
        },

        fieldRef( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.otherLang() ] || "" ) : "";
        },

        setField( field, value ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            if ( !detail[ field ] ) {
                detail[ field ] = { en: "", bg: "" };
            }
            detail[ field ][ this.editLang ] = value;
            this.dirtyCodes[ this.selectedCode ] = true;
        },

        scopeValue( level ) {
            const detail = this.getDetail();
            return ( detail && detail.scope && detail.scope[ level ] ) ? ( detail.scope[ level ][ this.editLang ] || "" ) : "";
        },

        scopeRef( level ) {
            const detail = this.getDetail();
            return ( detail && detail.scope && detail.scope[ level ] ) ? ( detail.scope[ level ][ this.otherLang() ] || "" ) : "";
        },

        setScope( level, value ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            if ( !detail.scope ) {
                detail.scope = {};
            }
            if ( !detail.scope[ level ] ) {
                detail.scope[ level ] = { en: "", bg: "" };
            }
            detail.scope[ level ][ this.editLang ] = value;
            this.dirtyCodes[ this.selectedCode ] = true;
        },

        /* -------------------------- Save ----------------------------------- */

        dirtyCount() {
            return Object.keys( this.dirtyCodes ).length;
        },

        isDirty() {
            return this.dirtyCount() > 0;
        },

        dirtyCountLabel() {
            const count = this.dirtyCount();
            const tmpl = ( count === 1 )
                ? tiApplication.getLabel( "interface.admin.text-editor.dirty-one", "{n} unsaved competency" )
                : tiApplication.getLabel( "interface.admin.text-editor.dirty-many", "{n} unsaved competencies" );
            return tmpl.replace( "{n}", String( count ) );
        },

        save() {
            if ( !this.isDirty() || this.saving ) {
                return;
            }
            const changed = this.rows.filter( ( row ) => this.dirtyCodes[ row.code ] === true );
            this.saving = true;
            this.saveErrors = [];
            const body = {
                edited: changed,
                expectedVersions: this.versions,
                note: tiApplication.getLabel( "interface.admin.text-editor.save-note", "Competency text edit" )
            };
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY, "POST", body ).then( ( result ) => {
                this.saving = false;
                const data = ( result && result.data ) || {};
                // The composite save validates the whole labels document; a content failure returns { ok:false, errors }
                // and writes nothing — surface the per-field issues and keep the edits so they can be corrected.
                if ( data.ok === false ) {
                    this.saveErrors = this.flattenErrors( data.errors );
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.text-editor.save-invalid", "Some changes are invalid — see the issues listed." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.admin.text-editor.save-success", "Competency texts saved." ) );
                this.loadData();
            } ).catch( ( error ) => {
                this.saving = false;
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 409 ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.text-editor.save-conflict", "Configuration changed elsewhere — reloading the latest version." ) );
                    this.loadData();
                    return;
                }
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        flattenErrors( errors ) {
            const out = [];
            const byKey = errors || {};
            Object.keys( byKey ).forEach( ( key ) => {
                ( byKey[ key ] || [] ).forEach( ( issue ) => {
                    out.push( this.describeIssue( issue ) );
                } );
            } );
            return out;
        },

        // Map a validator path (".competency.name.E1-1" / ".competency.scope.E1-1.N") to a { code, field, message }.
        describeIssue( issue ) {
            const parts = ( ( issue && issue.path ) || "" ).split( "." ).filter( Boolean );
            let field;
            let code;
            if ( parts[ 1 ] === "scope" ) {
                code = parts[ 2 ] || "";
                field = "scope " + ( parts[ 3 ] || "" );
            } else {
                field = parts[ 1 ] || "";
                code = parts[ 2 ] || "";
            }
            return { code: code, field: field, message: ( issue && issue.message ) || "" };
        },

        formatIssue( issue ) {
            return issue.code + " · " + issue.field;
        },

        discard() {
            if ( !this.isDirty() ) {
                return;
            }
            this.loadData();
        },

        backToConfig() {
            tiApplication.openScreen( "admin-config" );
        }
    };
};

/**
 * Alpine component for the archetype assignment editor (frame-archetype-assignment.html). Loads the
 * `archetype-assignment` composite editor (each competency's global relevancy archetype + the archetype catalogue),
 * lets an admin pick an archetype per competency from a dropdown with a small curve preview, and saves only the
 * changed assignments back into the dictionary. Admin-gated.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureArchetypeAssignment = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const EDITOR_KEY = "archetype-assignment";
    const STAGE_LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];

    return {
        loaded: false,
        saving: false,
        displayLang: "bg",
        rows: [],
        archetypes: [],
        archetypesById: {},
        versions: {},
        groups: [],
        rowsByCode: {},
        dirtyCodes: {},
        search: "",
        saveErrors: [],
        stageLevels: STAGE_LEVELS,

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
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

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        backToConfig() {
            tiApplication.openScreen( "admin-config" );
        },

        loadData() {
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY ).then( ( result ) => {
                const data = ( result && result.data ) || {};
                // composeView wraps the editor's compose() result under `data.rows`; this editor's compose returns
                // { rows, archetypes }, so unwrap that envelope.
                const view = ( data.rows && typeof data.rows === "object" && !Array.isArray( data.rows ) ) ? data.rows : {};
                this.rows = Array.isArray( view.rows ) ? tiToolbox.structuredClone( view.rows ) : [];
                this.archetypes = Array.isArray( view.archetypes ) ? tiToolbox.structuredClone( view.archetypes ) : [];
                this.versions = data.versions ? tiToolbox.structuredClone( data.versions ) : {};
                this.archetypesById = {};
                this.archetypes.forEach( ( archetype ) => {
                    this.archetypesById[ archetype.id ] = archetype;
                } );
                this.dirtyCodes = {};
                this.saveErrors = [];
                this.indexRows();
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 401 || httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        indexRows() {
            const byCode = {};
            const groupMap = {};
            const groupOrder = [];
            this.rows.forEach( ( row ) => {
                byCode[ row.code ] = row;
                const category = row.category || "";
                if ( !groupMap[ category ] ) {
                    groupMap[ category ] = { category: category, categoryName: this.langText( row.categoryName ), subMap: {}, subOrder: [] };
                    groupOrder.push( category );
                }
                const group = groupMap[ category ];
                const subcategory = row.subcategory || "";
                if ( !group.subMap[ subcategory ] ) {
                    group.subMap[ subcategory ] = { subcategory: subcategory, subName: this.langText( row.subcategoryName ), codes: [] };
                    group.subOrder.push( subcategory );
                }
                group.subMap[ subcategory ].codes.push( row.code );
            } );
            this.rowsByCode = byCode;
            this.groups = groupOrder.map( ( category ) => {
                const group = groupMap[ category ];
                return { category: group.category, categoryName: group.categoryName, subs: group.subOrder.map( ( key ) => group.subMap[ key ] ) };
            } );
        },

        langText( pair ) {
            const value = pair || {};
            return value[ this.displayLang ] || value.en || value.bg || "";
        },

        isDisplayLang( lang ) {
            return this.displayLang === lang;
        },

        setDisplayLang( lang ) {
            if ( lang !== "en" && lang !== "bg" ) {
                return;
            }
            this.displayLang = lang;
            this.indexRows();
        },

        filteredGroups() {
            const query = ( this.search || "" ).trim().toLowerCase();
            if ( !query ) {
                return this.groups;
            }
            const out = [];
            this.groups.forEach( ( group ) => {
                const subs = [];
                group.subs.forEach( ( sub ) => {
                    const codes = sub.codes.filter( ( code ) => {
                        const row = this.rowsByCode[ code ];
                        const name = row ? this.langText( row.name ) : "";
                        return ( code + " " + name ).toLowerCase().indexOf( query ) >= 0;
                    } );
                    if ( codes.length > 0 ) {
                        subs.push( { subcategory: sub.subcategory, subName: sub.subName, codes: codes } );
                    }
                } );
                if ( subs.length > 0 ) {
                    out.push( { category: group.category, categoryName: group.categoryName, subs: subs } );
                }
            } );
            return out;
        },

        rowName( code ) {
            const row = this.rowsByCode[ code ];
            return row ? this.langText( row.name ) : code;
        },

        rowArchetype( code ) {
            const row = this.rowsByCode[ code ];
            return row ? ( row.relevancyArchetype || "" ) : "";
        },

        setArchetype( code, id ) {
            const row = this.rowsByCode[ code ];
            if ( !row ) {
                return;
            }
            row.relevancyArchetype = id;
            this.dirtyCodes[ code ] = true;
        },

        isRowDirty( code ) {
            return this.dirtyCodes[ code ] === true;
        },

        archetypeName( id ) {
            const archetype = this.archetypesById[ id ];
            return archetype ? this.langText( archetype.name ) : id;
        },

        // Returns the selected archetype's curve as [{ level, weight }] for the inline sparkline preview.
        rowCurve( code ) {
            const id = this.rowArchetype( code );
            const archetype = this.archetypesById[ id ];
            const weights = ( archetype && archetype.weights ) || {};
            return this.stageLevels.map( ( level ) => ( { level: level, weight: ( typeof weights[ level ] === "number" ) ? weights[ level ] : 0 } ) );
        },

        // Object style-binding (CSP-safe: written via element.style, unlike a string `style` attribute).
        barStyle( weight ) {
            const pct = Math.max( 0, Math.min( 100, weight * 10 ) );
            return { height: pct + "%" };
        },

        dirtyCount() {
            return Object.keys( this.dirtyCodes ).length;
        },

        isDirty() {
            return this.dirtyCount() > 0;
        },

        dirtyCountLabel() {
            const count = this.dirtyCount();
            const tmpl = ( count === 1 )
                ? tiApplication.getLabel( "interface.admin.assignment.dirty-one", "{n} unsaved assignment" )
                : tiApplication.getLabel( "interface.admin.assignment.dirty-many", "{n} unsaved assignments" );
            return tmpl.replace( "{n}", String( count ) );
        },

        save() {
            if ( !this.isDirty() || this.saving ) {
                return;
            }
            const changed = this.rows.filter( ( row ) => this.dirtyCodes[ row.code ] === true );
            this.saving = true;
            this.saveErrors = [];
            const body = {
                edited: changed,
                expectedVersions: this.versions,
                note: tiApplication.getLabel( "interface.admin.assignment.save-note", "Archetype assignment edit" )
            };
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY, "POST", body ).then( ( result ) => {
                this.saving = false;
                const data = ( result && result.data ) || {};
                if ( data.ok === false ) {
                    this.saveErrors = this.flattenErrors( data.errors );
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.assignment.save-invalid", "Some assignments are invalid — see the issues listed." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.admin.assignment.save-success", "Archetype assignments saved." ) );
                this.loadData();
            } ).catch( ( error ) => {
                this.saving = false;
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 409 ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.assignment.save-conflict", "Configuration changed elsewhere — reloading the latest version." ) );
                    this.loadData();
                    return;
                }
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        flattenErrors( errors ) {
            const out = [];
            const byKey = errors || {};
            Object.keys( byKey ).forEach( ( key ) => {
                ( byKey[ key ] || [] ).forEach( ( issue ) => {
                    const parts = ( ( issue && issue.path ) || "" ).split( "." ).filter( Boolean );
                    out.push( { code: parts[ 1 ] || "", message: ( issue && issue.message ) || "" } );
                } );
            } );
            return out;
        },

        discard() {
            if ( !this.isDirty() ) {
                return;
            }
            this.loadData();
        }
    };
};

/**
 * Alpine component for the relevancy archetype (curve) editor (frame-archetype-editor.html). Loads the
 * `relevancy-archetype` composite editor (each curve's id, bilingual name/description, twelve stage-level weights, and
 * assignment count), and lets an admin edit weights/names, add a new archetype, or remove one that is unassigned. The
 * submitted set is the complete set, so the whole row list is sent on save (decompose treats omitted ids as removed,
 * guarded server-side by archetypesReferentialIntegrity). Admin-gated.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureArchetypeEditor = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const EDITOR_KEY = "relevancy-archetype";
    const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

    const emptyModal = () => ( { kind: null, payload: {} } );

    return {
        loaded: false,
        saving: false,
        dirty: false,
        editLang: "bg",
        rows: [],
        stageLevels: [],
        versions: {},
        selectedId: null,
        saveErrors: [],
        modal: emptyModal(),

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
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

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        backToConfig() {
            tiApplication.openScreen( "admin-config" );
        },

        loadData() {
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY ).then( ( result ) => {
                const data = ( result && result.data ) || {};
                // composeView wraps the editor's compose() result under `data.rows`; this editor's compose returns
                // { rows, stageLevels }, so unwrap that envelope.
                const view = ( data.rows && typeof data.rows === "object" && !Array.isArray( data.rows ) ) ? data.rows : {};
                this.rows = Array.isArray( view.rows ) ? tiToolbox.structuredClone( view.rows ) : [];
                this.stageLevels = Array.isArray( view.stageLevels ) ? view.stageLevels.slice() : [];
                this.versions = data.versions ? tiToolbox.structuredClone( data.versions ) : {};
                this.dirty = false;
                this.saveErrors = [];
                if ( this.selectedId && !this.rows.find( ( row ) => row.id === this.selectedId ) ) {
                    this.selectedId = null;
                }
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 401 || httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        otherLang() {
            return this.editLang === "en" ? "bg" : "en";
        },

        langLabel( lang ) {
            return ( lang === "en" )
                ? tiApplication.getLabel( "interface.admin.text-editor.lang-en", "English" )
                : tiApplication.getLabel( "interface.admin.text-editor.lang-bg", "Bulgarian" );
        },

        refLangLabel() {
            return this.langLabel( this.otherLang() );
        },

        isEditLang( lang ) {
            return this.editLang === lang;
        },

        setEditLang( lang ) {
            if ( lang === "en" || lang === "bg" ) {
                this.editLang = lang;
            }
        },

        /* -------------------------- List ----------------------------------- */

        archetypeName( row ) {
            const pair = row && row.name;
            return ( pair && ( pair[ this.editLang ] || pair.en || pair.bg ) ) || row.id;
        },

        isSelected( id ) {
            return this.selectedId === id;
        },

        selectId( id ) {
            this.selectedId = id;
        },

        /* -------------------------- Detail --------------------------------- */

        hasSelection() {
            return !!( this.selectedId && this.rows.find( ( row ) => row.id === this.selectedId ) );
        },

        getDetail() {
            return this.selectedId ? ( this.rows.find( ( row ) => row.id === this.selectedId ) || null ) : null;
        },

        detailId() {
            const detail = this.getDetail();
            return detail ? detail.id : "";
        },

        fieldValue( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.editLang ] || "" ) : "";
        },

        fieldRef( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.otherLang() ] || "" ) : "";
        },

        setField( field, value ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            if ( !detail[ field ] ) {
                detail[ field ] = { en: "", bg: "" };
            }
            detail[ field ][ this.editLang ] = value;
            this.dirty = true;
        },

        weightValue( level ) {
            const detail = this.getDetail();
            const weight = detail && detail.weights ? detail.weights[ level ] : null;
            return ( weight === null || weight === undefined ) ? "" : weight;
        },

        setWeight( level, value ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            if ( !detail.weights ) {
                detail.weights = {};
            }
            const parsed = parseInt( value, 10 );
            detail.weights[ level ] = Number.isFinite( parsed ) ? parsed : null;
            this.dirty = true;
        },

        // Curve preview for the selected archetype.
        detailCurve() {
            const detail = this.getDetail();
            const weights = ( detail && detail.weights ) || {};
            return this.stageLevels.map( ( level ) => ( { level: level, weight: ( typeof weights[ level ] === "number" ) ? weights[ level ] : 0 } ) );
        },

        barStyle( weight ) {
            const pct = Math.max( 0, Math.min( 100, weight * 10 ) );
            return { height: pct + "%" };
        },

        assignedCount() {
            const detail = this.getDetail();
            return ( detail && typeof detail.assignedCount === "number" ) ? detail.assignedCount : 0;
        },

        assignedCountLabel() {
            const count = this.assignedCount();
            const tmpl = ( count === 1 )
                ? tiApplication.getLabel( "interface.admin.archetype.assigned-one", "{n} competency uses this archetype" )
                : tiApplication.getLabel( "interface.admin.archetype.assigned-many", "{n} competencies use this archetype" );
            return tmpl.replace( "{n}", String( count ) );
        },

        canRemove() {
            return this.hasSelection() && this.assignedCount() === 0;
        },

        removeSelected() {
            if ( !this.canRemove() ) {
                return;
            }
            const id = this.selectedId;
            this.rows = this.rows.filter( ( row ) => row.id !== id );
            this.selectedId = null;
            this.dirty = true;
        },

        /* -------------------------- Add ------------------------------------ */

        openAdd() {
            this.modal = { kind: "add", payload: { id: "", error: "" } };
        },

        closeModal() {
            this.modal = emptyModal();
        },

        confirmAdd() {
            const id = String( ( this.modal.payload && this.modal.payload.id ) || "" ).trim();
            if ( !ID_PATTERN.test( id ) ) {
                this.modal.payload.error = tiApplication.getLabel( "interface.admin.archetype.add-invalid-id", "Use letters, numbers, dash or underscore only." );
                return;
            }
            if ( this.rows.find( ( row ) => row.id === id ) ) {
                this.modal.payload.error = tiApplication.getLabel( "interface.admin.archetype.add-duplicate-id", "An archetype with this id already exists." );
                return;
            }
            const weights = {};
            this.stageLevels.forEach( ( level ) => {
                weights[ level ] = 5;
            } );
            this.rows.push( { id: id, name: { en: "", bg: "" }, description: { en: "", bg: "" }, weights: weights, assignedCount: 0 } );
            this.selectedId = id;
            this.dirty = true;
            this.closeModal();
        },

        /* -------------------------- Save ----------------------------------- */

        isDirty() {
            return this.dirty === true;
        },

        save() {
            if ( !this.isDirty() || this.saving ) {
                return;
            }
            this.saving = true;
            this.saveErrors = [];
            // The submitted rows are the complete set (omitted ids are removed by decompose).
            const body = {
                edited: { rows: this.rows },
                expectedVersions: this.versions,
                note: tiApplication.getLabel( "interface.admin.archetype.save-note", "Relevancy archetype edit" )
            };
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY, "POST", body ).then( ( result ) => {
                this.saving = false;
                const data = ( result && result.data ) || {};
                if ( data.ok === false ) {
                    this.saveErrors = this.flattenErrors( data.errors );
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.archetype.save-invalid", "Some changes are invalid — see the issues listed." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.admin.archetype.save-success", "Relevancy archetypes saved." ) );
                this.loadData();
            } ).catch( ( error ) => {
                this.saving = false;
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 409 ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.archetype.save-conflict", "Configuration changed elsewhere — reloading the latest version." ) );
                    this.loadData();
                    return;
                }
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        flattenErrors( errors ) {
            const out = [];
            const byKey = errors || {};
            Object.keys( byKey ).forEach( ( key ) => {
                ( byKey[ key ] || [] ).forEach( ( issue ) => {
                    const path = ( issue && ( issue.path || issue.dataPath ) ) || "";
                    const parts = path.split( "." ).filter( Boolean );
                    out.push( { id: parts[ 0 ] || key, message: ( issue && issue.message ) || "" } );
                } );
            } );
            return out;
        },

        discard() {
            if ( !this.isDirty() ) {
                return;
            }
            this.loadData();
        }
    };
};

/**
 * Alpine component for the role families editor (frame-role-families.html). Loads the `role-families` composite editor
 * (the nine disciplines, each with bilingual name/description and a list of specializations + active-set usage), and
 * lets an admin edit the family text and add/edit/remove specializations with language switch-with-reference. The nine
 * families are fixed (schema); only their text and specializations are editable. Saves the full family set. A spec is
 * removable in the UI when no active set uses it; employee references are caught server-side on save. Admin-gated.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureRoleFamilies = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    const EDITOR_KEY = "role-families";
    const SPEC_PATTERN = /^[A-Z][A-Z0-9_]*$/;

    const emptyModal = () => ( { kind: null, payload: {} } );

    return {
        loaded: false,
        saving: false,
        dirty: false,
        editLang: "bg",
        families: [],
        versions: {},
        selectedCode: null,
        saveErrors: [],
        modal: emptyModal(),

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
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

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        backToConfig() {
            tiApplication.openScreen( "admin-config" );
        },

        loadData() {
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY ).then( ( result ) => {
                const data = ( result && result.data ) || {};
                // composeView wraps the editor's compose() result under `data.rows`; this editor returns { families }.
                const view = ( data.rows && typeof data.rows === "object" && !Array.isArray( data.rows ) ) ? data.rows : {};
                this.families = Array.isArray( view.families ) ? tiToolbox.structuredClone( view.families ) : [];
                this.versions = data.versions ? tiToolbox.structuredClone( data.versions ) : {};
                this.dirty = false;
                this.saveErrors = [];
                if ( this.selectedCode && !this.families.find( ( family ) => family.code === this.selectedCode ) ) {
                    this.selectedCode = null;
                }
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 401 || httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        otherLang() {
            return this.editLang === "en" ? "bg" : "en";
        },

        langLabel( lang ) {
            return ( lang === "en" )
                ? tiApplication.getLabel( "interface.admin.text-editor.lang-en", "English" )
                : tiApplication.getLabel( "interface.admin.text-editor.lang-bg", "Bulgarian" );
        },

        refLangLabel() {
            return this.langLabel( this.otherLang() );
        },

        isEditLang( lang ) {
            return this.editLang === lang;
        },

        setEditLang( lang ) {
            if ( lang === "en" || lang === "bg" ) {
                this.editLang = lang;
            }
        },

        /* -------------------------- List ----------------------------------- */

        familyName( family ) {
            const pair = family && family.name;
            return ( pair && ( pair[ this.editLang ] || pair.en || pair.bg ) ) || family.code;
        },

        familySpecCount( family ) {
            return ( family && Array.isArray( family.specializations ) ) ? family.specializations.length : 0;
        },

        isSelected( code ) {
            return this.selectedCode === code;
        },

        selectFamily( code ) {
            this.selectedCode = code;
        },

        /* -------------------------- Detail --------------------------------- */

        hasSelection() {
            return !!( this.selectedCode && this.families.find( ( family ) => family.code === this.selectedCode ) );
        },

        getDetail() {
            return this.selectedCode ? ( this.families.find( ( family ) => family.code === this.selectedCode ) || null ) : null;
        },

        detailCode() {
            const detail = this.getDetail();
            return detail ? detail.code : "";
        },

        getSpecs() {
            const detail = this.getDetail();
            return ( detail && Array.isArray( detail.specializations ) ) ? detail.specializations : [];
        },

        familyFieldValue( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.editLang ] || "" ) : "";
        },

        familyFieldRef( field ) {
            const detail = this.getDetail();
            return ( detail && detail[ field ] ) ? ( detail[ field ][ this.otherLang() ] || "" ) : "";
        },

        setFamilyField( field, value ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            if ( !detail[ field ] ) {
                detail[ field ] = { en: "", bg: "" };
            }
            detail[ field ][ this.editLang ] = value;
            this.dirty = true;
        },

        getSpec( specCode ) {
            return this.getSpecs().find( ( spec ) => spec.code === specCode ) || null;
        },

        specFieldValue( specCode, field ) {
            const spec = this.getSpec( specCode );
            return ( spec && spec[ field ] ) ? ( spec[ field ][ this.editLang ] || "" ) : "";
        },

        specFieldRef( specCode, field ) {
            const spec = this.getSpec( specCode );
            return ( spec && spec[ field ] ) ? ( spec[ field ][ this.otherLang() ] || "" ) : "";
        },

        setSpecField( specCode, field, value ) {
            const spec = this.getSpec( specCode );
            if ( !spec ) {
                return;
            }
            if ( !spec[ field ] ) {
                spec[ field ] = { en: "", bg: "" };
            }
            spec[ field ][ this.editLang ] = value;
            this.dirty = true;
        },

        specActiveSetUse( spec ) {
            return ( spec && typeof spec.activeSetUse === "number" ) ? spec.activeSetUse : 0;
        },

        canRemoveSpec( spec ) {
            return this.specActiveSetUse( spec ) === 0;
        },

        specRemoveHint( spec ) {
            return this.canRemoveSpec( spec )
                ? tiApplication.getLabel( "interface.admin.families.spec-remove", "Remove specialization" )
                : tiApplication.getLabel( "interface.admin.families.spec-remove-blocked", "In use by an active set" );
        },

        removeSpec( specCode ) {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            const spec = this.getSpec( specCode );
            if ( !spec || !this.canRemoveSpec( spec ) ) {
                return;
            }
            detail.specializations = detail.specializations.filter( ( candidate ) => candidate.code !== specCode );
            this.dirty = true;
        },

        /* -------------------------- Add specialization --------------------- */

        openAddSpec() {
            this.modal = { kind: "add-spec", payload: { code: "", error: "" } };
        },

        closeModal() {
            this.modal = emptyModal();
        },

        confirmAddSpec() {
            const detail = this.getDetail();
            if ( !detail ) {
                return;
            }
            const code = String( ( this.modal.payload && this.modal.payload.code ) || "" ).trim().toUpperCase();
            if ( !SPEC_PATTERN.test( code ) ) {
                this.modal.payload.error = tiApplication.getLabel( "interface.admin.families.add-invalid-code", "Use uppercase letters, numbers or underscore; start with a letter." );
                return;
            }
            if ( detail.specializations.find( ( spec ) => spec.code === code ) ) {
                this.modal.payload.error = tiApplication.getLabel( "interface.admin.families.add-duplicate-code", "This family already has a specialization with that code." );
                return;
            }
            detail.specializations.push( { code: code, name: { en: "", bg: "" }, description: { en: "", bg: "" }, eCFMapping: [], activeSetUse: 0 } );
            this.dirty = true;
            this.closeModal();
        },

        /* -------------------------- Save ----------------------------------- */

        isDirty() {
            return this.dirty === true;
        },

        save() {
            if ( !this.isDirty() || this.saving ) {
                return;
            }
            this.saving = true;
            this.saveErrors = [];
            const body = {
                edited: { families: this.families },
                expectedVersions: this.versions,
                note: tiApplication.getLabel( "interface.admin.families.save-note", "Role families edit" )
            };
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY, "POST", body ).then( ( result ) => {
                this.saving = false;
                const data = ( result && result.data ) || {};
                if ( data.ok === false ) {
                    this.saveErrors = this.flattenErrors( data.errors );
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.families.save-invalid", "Some changes are invalid — see the issues listed." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.admin.families.save-success", "Role families saved." ) );
                this.loadData();
            } ).catch( ( error ) => {
                this.saving = false;
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 409 ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.families.save-conflict", "Configuration changed elsewhere — reloading the latest version." ) );
                    this.loadData();
                    return;
                }
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        flattenErrors( errors ) {
            const out = [];
            const byKey = errors || {};
            Object.keys( byKey ).forEach( ( key ) => {
                ( byKey[ key ] || [] ).forEach( ( issue ) => {
                    const parts = ( ( issue && ( issue.path || issue.dataPath ) ) || "" ).split( "." ).filter( Boolean );
                    let label = parts[ 0 ] || "";
                    if ( parts[ 1 ] === "specializations" && parts[ 2 ] ) {
                        label = parts[ 0 ] + " · " + parts[ 2 ];
                    }
                    out.push( { label: label, message: ( issue && issue.message ) || "" } );
                } );
            } );
            return out;
        },

        discard() {
            if ( !this.isDirty() ) {
                return;
            }
            this.loadData();
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
    Alpine.data( "competenceAdminConfig", configureAdminConfig );
    Alpine.data( "competenceCompetencyTextEditor", configureCompetencyTextEditor );
    Alpine.data( "competenceArchetypeAssignment", configureArchetypeAssignment );
    Alpine.data( "competenceArchetypeEditor", configureArchetypeEditor );
    Alpine.data( "competenceRoleFamilies", configureRoleFamilies );
    Alpine.data( "insightsCycle", configureInsightsCycle );
    Alpine.data( "insightsTeam", configureInsightsTeam );
    Alpine.data( "insightsTrends", configureTrendsScreen );
} );
