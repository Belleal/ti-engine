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
const configureCompetencyEvaluation = () => {
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
        personal: {},
        evaluation: {
            scores: {},
            finalScore: {}
        },
        feedback: {},
        competencies: {},
        grades: {},
        showEvaluationForm: false,
        warningMessage: "",

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
            this.personal = fresh.personal ? tiToolbox.structuredClone( fresh.personal ) : {};
            this.manager = fresh.manager ? tiToolbox.structuredClone( fresh.manager ) : {};
            this.userRole = fresh.userRole;
            this.deadlineDate = fresh.deadlineDate;
            this.canEdit = fresh.canEdit;
            this.evaluation = fresh.evaluation ? tiToolbox.structuredClone( fresh.evaluation ) : {
                scores: {},
                finalScore: {}
            };
            this.competencies = fresh.competencies ? tiToolbox.structuredClone( fresh.competencies ) : {};

            this.warningMessage = this.getEvaluationWarning();
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
                    this.applyData( {} );
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
                this.applyData( {} );
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

        startNewEvaluation( employeeID ) {
            const url = "/app/new-evaluation?employeeID=" + encodeURIComponent( employeeID );
            if ( window.htmx ) {
                window.htmx.ajax( "GET", url, { target: "#ti-content", swap: "innerHTML" } );
                window.history.pushState( null, "", url );
            } else {
                window.location.href = url;
            }
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

    const getEmployeeIDFromUrl = () => {
        const params = new URLSearchParams( window.location.search );
        return params.get( "employeeID" );
    };

    return {
        employeeID: null,
        personal: {},
        manager: {},
        evaluation: {},
        availableTeamMembers: [],
        team: [],
        selectedTeamMemberID: "",

        init() {
            const onInitialized = () => {
                this.employeeID = getEmployeeIDFromUrl();
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
            this.team = [];
            this.selectedTeamMemberID = "";
        },

        addTeamMember() {
            if ( this.selectedTeamMemberID && !this.team.find( m => m.employeeID === this.selectedTeamMemberID ) ) {
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
            tiApplication.sendRequest( "/app/start-evaluation", "POST", {
                employeeID: this.employeeID,
                team: teamIDs
            } ).then( ( result ) => {
                const evaluationID = result?.data;
                this.openEvaluation( this.employeeID, evaluationID );
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

    const toDateString = ( date ) => {
        const y = date.getFullYear();
        const m = String( date.getMonth() + 1 ).padStart( 2, "0" );
        const d = String( date.getDate() ).padStart( 2, "0" );
        return `${ y }-${ m }-${ d }`;
    };

    const getMonday = ( date ) => {
        const d = new Date( date );
        const day = d.getDay();
        const diff = ( day === 0 ) ? -6 : 1 - day;
        d.setDate( d.getDate() + diff );
        d.setHours( 0, 0, 0, 0 );
        return d;
    };

    return {
        cycleID: "",
        cycleDate: "",
        managerID: "",
        config: { slotDurationMinutes: 30, workingHoursStart: "09:00", workingHoursEnd: "18:00", workingDays: [ 1, 2, 3, 4, 5 ] },
        slots: {},
        currentWeekStart: null,

        init() {
            this.currentWeekStart = getMonday( new Date() );

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
                        date: toDateString( d ),
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
            return toDateString( this.currentWeekStart ) > toDateString( getMonday( new Date() ) );
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

    const toDateString = ( date ) => {
        const y = date.getFullYear();
        const m = String( date.getMonth() + 1 ).padStart( 2, "0" );
        const d = String( date.getDate() ).padStart( 2, "0" );
        return `${ y }-${ m }-${ d }`;
    };

    const getMonday = ( date ) => {
        const d = new Date( date );
        const day = d.getDay();
        const diff = ( day === 0 ) ? -6 : 1 - day;
        d.setDate( d.getDate() + diff );
        d.setHours( 0, 0, 0, 0 );
        return d;
    };

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

                const todayMonday = getMonday( new Date() );
                const available = this.slots.filter( ( s ) => s.status === "available" );
                if ( available.length > 0 ) {
                    const earliest = available.reduce( ( a, b ) => ( a.date <= b.date ? a : b ) );
                    const earliestMonday = getMonday( new Date( earliest.date + "T00:00:00" ) );
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
                const weekStartStr = toDateString( weekStart );
                const weekEndStr = toDateString( weekEnd );
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
            const todayMonday = getMonday( new Date() );
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
            return toDateString( this.slotViewStart ) > toDateString( getMonday( new Date() ) );
        },

        canGoNextSlotWeeks() {
            if ( !this.slotViewStart ) {
                return false;
            }
            const windowEnd = new Date( this.slotViewStart );
            windowEnd.setDate( windowEnd.getDate() + 28 );
            const windowEndStr = toDateString( windowEnd );
            return this.slots.some( ( s ) => s.status === "available" && s.date >= windowEndStr );
        },

        formatSlotTime( slot ) {
            if ( !slot ) {
                return "";
            }
            const d = new Date( slot.date + "T00:00:00" );
            return `${ DAY_NAMES_SHORT[ d.getDay() ] || "" } ${ String( d.getDate() ).padStart( 2, "0" ) } ${ slot.startTime }`;
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        },

        formatDate( value, placeholder = "" ) {
            return tiToolbox.formatDate( value, tiApplication.getLabel( placeholder, "" ) );
        }

    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "competencyEvaluation", configureCompetencyEvaluation );
    Alpine.data( "employeesList", configureEmployeesList );
    Alpine.data( "newEvaluation", configureNewEvaluation );
    Alpine.data( "managerCalendar", configureManagerCalendar );
    Alpine.data( "interviewSchedule", configureInterviewSchedule );
} );
