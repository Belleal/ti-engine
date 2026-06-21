/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const cache = require( "@ti-engine/core/cache" );
const exceptions = require( "@ti-engine/core/exceptions" );
const tools = require( "@ti-engine/core/tools" );
const _ = require( "lodash" );
const configurationLoader = require( "#configuration-loader" );

const cacheEntryKeyActiveCompetencySets = "ti:competence:data:active-competency-sets";
const cacheEntryKeyAuditLog = "ti:competence:data:audit-log";
const cacheEntryKeyCalendars = "ti:competence:data:calendars";
const cacheEntryKeyCycles = "ti:competence:data:cycles";
const cacheEntryKeyEmployees = "ti:competence:data:employees";
const cacheEntryKeyEvaluations = "ti:competence:data:evaluations";
const cacheEntryKeyRoleFamilies = "ti:competence:data:role-families";
const cacheEntryKeyResultsSnapshots = "ti:competence:data:results-snapshots"; // { [cycleID]: ResultsSnapshot }

const BASELINE_KEY = "baseline";

/**
 * Used to create and/or return a Data Manager singleton instance.
 *
 * @class DataManager
 * @singleton
 * @public
 */
class DataManager {

    static #instance = null;

    /**
     * @constructor
     * @returns {DataManager}
     */
    constructor() {
        if ( !DataManager.#instance ) {
            DataManager.#instance = this;
        }
        return DataManager.#instance;
    }

    /* Public interface */

    /**
     * Used to initialize the data manager. When the `COMPETENCE_PRELOAD_DATA` env var is true, performs a destructive
     * reseeding: wipes every managed collection and reloads from the bootstrap configuration and seed files.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize() {
        let promises = [];

        promises.push( cache.instance.setJSON( cacheEntryKeyActiveCompetencySets, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyAuditLog, this.#emptyAuditLogShape(), "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyCalendars, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyCycles, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyEmployees, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyEvaluations, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyRoleFamilies, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyResultsSnapshots, {}, "$", 1 ) );

        let preloadData = ( process.env.COMPETENCE_PRELOAD_DATA !== undefined ) ? tools.toBool( process.env.COMPETENCE_PRELOAD_DATA ) : false;

        if ( preloadData === true ) {
            // Role families — frozen bootstrap configuration → mutable per-instance cache.
            const roleFamilies = _.cloneDeep( configurationLoader.configRoleFamilies || {} );
            for ( const [ familyCode, family ] of Object.entries( roleFamilies ) ) {
                promises.push( cache.instance.editJSON( cacheEntryKeyRoleFamilies, { [ familyCode ]: family } ) );
            }

            // Active competency sets — keyed by (roleFamily, baseline|specializationCode, cycleID).
            const activeSets = _.cloneDeep( configurationLoader.configActiveCompetencySets || {} );
            for ( const [ familyCode, familyEntry ] of Object.entries( activeSets ) ) {
                if ( familyEntry && typeof familyEntry === "object" ) {
                    promises.push( cache.instance.editJSON( cacheEntryKeyActiveCompetencySets, { [ familyCode ]: familyEntry } ) );
                }
            }

            // Cycles — synthesized from the cycle IDs referenced by the active-competency-sets configuration.
            const seededCycles = this.#deriveSeededCycles( activeSets );
            for ( const cycle of seededCycles ) {
                promises.push( cache.instance.editJSON( cacheEntryKeyCycles, { [ cycle.cycleID ]: cycle } ) );
            }

            // Employees — from the seed registry, already in the new (roleFamily, optional specialization) shape.
            const employees = require( "#data-employees" ).employees;
            employees.forEach( ( employee ) => {
                promises.push( cache.instance.editJSON( cacheEntryKeyEmployees, { [ employee.employeeID ]: employee } ) );
            } );

            // Evaluations — seeded for cycles in ACTIVE or CLOSED state only. For a fresh PLANNING-state seed there are none.
            const seededEvaluations = require( "#data-evaluations" ).evaluations || [];
            seededEvaluations.forEach( ( evaluation ) => {
                promises.push( cache.instance.editJSON( cacheEntryKeyEvaluations, { [ evaluation.employeeID ]: { [ evaluation.evaluationID ]: evaluation } } ) );
            } );
        }

        return Promise.all( promises );
    }

    /**
     * Used to fetch all employees from the data storage.
     *
     * @method
     * @returns {Promise<Array<Employee>>}
     * @public
     */
    fetchEmployees() {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyEmployees, "$" ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        resolve( [] );
                    } else {
                        resolve( Object.values( source ) );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                const employees = require( "#data-employees" ).employees;
                resolve( _.cloneDeep( Array.isArray( employees ) ? employees : [] ) );
            }
        } );
    }

    /**
     * Used to fetch an employee from the data storage by employee ID.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string|number} employeeID
     * @returns {Promise<Employee>} Returns the employee data object.
     * @public
     */
    fetchEmployee( employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const resolvedEmployeeID = String( employeeID );

            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyEmployees, `${ resolvedEmployeeID }` ).then( ( result ) => {
                    if ( !result || result.length === 0 ) {
                        reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Employee with ID '${ employeeID }' not found!` } ) );
                    } else {
                        resolve( _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result ) );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                const employees = require( "#data-employees" ).employees;
                const employee = employees.find( ( employee ) => employee.employeeID === resolvedEmployeeID );
                if ( !employee ) {
                    reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Employee with ID '${ employeeID }' not found!` } ) );
                } else {
                    resolve( _.cloneDeep( employee ) );
                }
            }
        } );
    }

    /**
     * Used to persist an employee record (create or update). The caller is responsible for emitting any audit log
     * entries required for the change.
     *
     * @method
     * @param {Employee} employee
     * @returns {Promise<Employee>}
     * @public
     */
    saveEmployee( employee ) {
        return new Promise( ( resolve, reject ) => {
            if ( !employee?.employeeID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employee } ) );
            }
            cache.instance.editJSON( cacheEntryKeyEmployees, { [ employee.employeeID ]: employee } ).then( () => {
                resolve( _.cloneDeep( employee ) );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to fetch a set of evaluations from the data storage and filter them by employee ID (if provided).
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string|number|null} [employeeID] If provided, it will filter out evaluations that are not assigned to the specified employee ID.
     * @param {boolean} [filterClosed=false] If true, it will filter out evaluations that are closed.
     * @returns {Promise<Array<Evaluation>>} Returns an array of evaluation data objects or empty array if there are no evaluations for the specified employee ID.
     * @public
     */
    fetchEvaluations( employeeID, filterClosed = false ) {
        return new Promise( ( resolve, reject ) => {
            const resolvedEmployeeID = employeeID ? String( employeeID ) : null;
            let statusFilter = [];
            statusFilter.push( configurationLoader.evaluationStatus.DELETED );
            if ( filterClosed === true ) {
                statusFilter.push( configurationLoader.evaluationStatus.CLOSED );
            }

            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyEvaluations, resolvedEmployeeID ? `${ resolvedEmployeeID }` : "$" ).then( ( result ) => {
                    if ( !result || result.length === 0 ) {
                        resolve( [] );
                    } else {
                        let employeeEvaluations = ( result instanceof Array ) ? result[ 0 ] : result;
                        if ( resolvedEmployeeID ) {
                            employeeEvaluations = _.filter( employeeEvaluations, ( evaluation ) => ( statusFilter.indexOf( evaluation.status ) < 0 ) );
                            resolve( ( !employeeEvaluations || employeeEvaluations.length === 0 ) ? [] : _.cloneDeep( employeeEvaluations ) );
                        } else {
                            let evaluations = [];
                            _.forEach( employeeEvaluations, ( employee ) => {
                                _.forEach( employee, ( employeeEvaluation ) => {
                                    if ( statusFilter.indexOf( employeeEvaluation.status ) < 0 ) {
                                        evaluations.push( employeeEvaluation );
                                    }
                                } );
                            } );
                            resolve( evaluations );
                        }
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                const rawEvaluations = require( "#data-evaluations" ).evaluations;
                const evaluations = Array.isArray( rawEvaluations ) ? rawEvaluations : [];
                resolve( _.cloneDeep( evaluations.filter( ( evaluation ) => ( !resolvedEmployeeID || evaluation.employeeID === resolvedEmployeeID ) && statusFilter.indexOf( evaluation.status ) < 0 ) ) );
            }
        } );
    }

    /**
     * Used to fetch an evaluation from the data storage by evaluation ID.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string} evaluationID
     * @returns {Promise<Evaluation>} Returns the evaluation data object.
     * @public
     */
    fetchEvaluation( evaluationID ) {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyEvaluations, `*.${ evaluationID }` ).then( ( result ) => {
                    const evaluation = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !evaluation || evaluation.status === configurationLoader.evaluationStatus.DELETED ) {
                        reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Evaluation with ID '${ evaluationID }' not found!` } ) );
                    } else {
                        resolve( evaluation );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                const evaluations = require( "#data-evaluations" ).evaluations;
                const evaluation = evaluations.find( ( evaluation ) => evaluation.evaluationID === evaluationID );
                if ( !evaluation || evaluation.status === configurationLoader.evaluationStatus.DELETED ) {
                    reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Evaluation with ID '${ evaluationID }' not found!` } ) );
                } else {
                    resolve( _.cloneDeep( evaluation ) );
                }
            }
        } );
    }

    /**
     * Used to save an evaluation to the data storage.
     *
     * @method
     * @param {Evaluation} evaluation
     * @returns {Promise<Evaluation>}
     * @public
     */
    saveEvaluation( evaluation ) {
        return new Promise( ( resolve, reject ) => {
            if ( !evaluation?.employeeID || !evaluation?.evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluation } ) );
            }
            cache.instance.editJSON( cacheEntryKeyEvaluations, { [ evaluation.employeeID ]: { [ evaluation.evaluationID ]: evaluation } } ).then( () => {
                resolve( evaluation );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to fetch all non-deleted calendar slots for a specific manager and cycle.
     *
     * @method
     * @param {string} cycleID
     * @param {string} managerID
     * @returns {Promise<Array<Object>>}
     * @public
     */
    fetchManagerCalendar( cycleID, managerID ) {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyCalendars, [ cycleID, managerID ] ).then( ( result ) => {
                    if ( !result || result.length === 0 ) {
                        return resolve( [] );
                    }
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    resolve( Object.values( source ).filter( ( slot ) => slot && slot.status !== configurationLoader.slotStatus.DELETED ) );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                resolve( [] );
            }
        } );
    }

    /**
     * Used to fetch all non-deleted calendar slots for all managers in a cycle.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Array<Object>>}
     * @public
     */
    fetchAllCalendarSlots( cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyCalendars, [ cycleID ] ).then( ( result ) => {
                    if ( !result || result.length === 0 ) {
                        return resolve( [] );
                    }
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    let slots = [];
                    _.forEach( source, ( managerSlots ) => {
                        if ( managerSlots && typeof managerSlots === "object" ) {
                            _.forEach( managerSlots, ( slot ) => {
                                if ( slot && slot.status !== configurationLoader.slotStatus.DELETED ) {
                                    slots.push( slot );
                                }
                            } );
                        }
                    } );
                    resolve( slots );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                return resolve( [] );
            }
        } );
    }

    /**
     * Used to save a calendar slot to the data storage.
     *
     * @method
     * @param {Object} slot
     * @returns {Promise<Object>}
     * @public
     */
    saveCalendarSlot( slot ) {
        return new Promise( ( resolve, reject ) => {
            if ( !slot?.slotID || !slot?.managerID || !slot?.cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { slot } ) );
            }
            cache.instance.editJSON( cacheEntryKeyCalendars, { [ slot.cycleID ]: { [ slot.managerID ]: { [ slot.slotID ]: slot } } } ).then( () => {
                resolve( slot );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /* ------------------------------------------------------------------ */
    /*                          Role families                             */

    /* ------------------------------------------------------------------ */

    /**
     * Returns every role family as an object keyed by family code.
     *
     * @method
     * @returns {Promise<Object.<RoleFamilyCodeValue, RoleFamily>>}
     * @public
     */
    getRoleFamilies() {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyRoleFamilies, "$" ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    resolve( ( source && typeof source === "object" ) ? source : {} );
                } ).catch( reject );
            } else {
                resolve( _.cloneDeep( configurationLoader.configRoleFamilies || {} ) );
            }
        } );
    }

    /**
     * Returns one role family by code.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} familyCode
     * @returns {Promise<RoleFamily>}
     * @public
     */
    getRoleFamily( familyCode ) {
        return new Promise( ( resolve, reject ) => {
            if ( !familyCode ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { familyCode } ) );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyRoleFamilies, `${ familyCode }` ).then( ( result ) => {
                    const family = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !family ) {
                        reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Role family '${ familyCode }' not found!` } ) );
                    } else {
                        resolve( family );
                    }
                } ).catch( reject );
            } else {
                const family = ( configurationLoader.configRoleFamilies || {} )[ familyCode ];
                if ( !family ) {
                    reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Role family '${ familyCode }' not found!` } ) );
                } else {
                    resolve( _.cloneDeep( family ) );
                }
            }
        } );
    }

    /**
     * Returns the specialization map (keyed by specialization code) for the given family.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} familyCode
     * @returns {Promise<Object.<string, Specialization>>}
     * @public
     */
    getSpecializationsForFamily( familyCode ) {
        return this.getRoleFamily( familyCode ).then( ( family ) => family.specializations || {} );
    }

    /* ------------------------------------------------------------------ */
    /*                              Cycles                                */

    /* ------------------------------------------------------------------ */

    /**
     * Creates a new cycle in PLANNING state. Persists `createdAt` and `createdBy` automatically; the caller may
     * override them via the input object. Cycle ID uniqueness is enforced.
     *
     * @method
     * @param {Partial<Cycle>} cycleData - At minimum must contain `cycleID`, `name`, `cycleStart`, `cycleDate`, `cycleEnd`.
     * @returns {Promise<Cycle>}
     * @public
     */
    createCycle( cycleData ) {
        return new Promise( ( resolve, reject ) => {
            if ( !cycleData?.cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleData } ) );
            }
            this.getCycle( cycleData.cycleID ).then( () => {
                reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_ALREADY_EXISTS, { details: `Cycle '${ cycleData.cycleID }' already exists.` }, exceptions.httpCode.C_409 ) );
            } ).catch( ( error ) => {
                // Cycle does not exist — proceed with creation.
                if ( error && error.code !== exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND ) {
                    return reject( error );
                }
                const cycle = {
                    status: configurationLoader.cycleStatus.PLANNING,
                    actualCloseDate: null,
                    lockedAt: null,
                    lockedBy: null,
                    teamFeedbackDeadline: this.#deriveTeamFeedbackDeadline( cycleData.cycleStart, cycleData.cycleDate || cycleData.cycleEnd ),
                    createdAt: new Date().toISOString(),
                    createdBy: null,
                    ...cycleData
                };
                if ( cache.instance.isOperational ) {
                    cache.instance.editJSON( cacheEntryKeyCycles, { [ cycle.cycleID ]: cycle } ).then( () => {
                        resolve( _.cloneDeep( cycle ) );
                    } ).catch( reject );
                } else {
                    resolve( _.cloneDeep( cycle ) );
                }
            } );
        } );
    }

    /**
     * Returns a cycle by ID.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Cycle>}
     * @public
     */
    getCycle( cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyCycles, `${ cycleID }` ).then( ( result ) => {
                    const cycle = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !cycle ) {
                        reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Cycle '${ cycleID }' not found!` } ) );
                    } else {
                        resolve( cycle );
                    }
                } ).catch( reject );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: `Cycle '${ cycleID }' not found!` } ) );
            }
        } );
    }

    /**
     * Returns every cycle, ordered by `createdAt` descending.
     *
     * @method
     * @returns {Promise<Array<Cycle>>}
     * @public
     */
    getAllCycles() {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyCycles, "$" ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    const cycles = Object.values( source );
                    cycles.sort( ( a, b ) => ( b.createdAt || "" ).localeCompare( a.createdAt || "" ) );
                    resolve( cycles );
                } ).catch( reject );
            } else {
                resolve( [] );
            }
        } );
    }

    /**
     * Returns the single cycle in ACTIVE state, or null if there is none.
     *
     * @method
     * @returns {Promise<Cycle|null>}
     * @public
     */
    getActiveCycle() {
        return this.getAllCycles().then( ( cycles ) => {
            const active = cycles.find( ( cycle ) => cycle.status === configurationLoader.cycleStatus.ACTIVE );
            return active || null;
        } );
    }

    /**
     * Updates the lifecycle status of a cycle. Sets `lockedAt`/`lockedBy` on PLANNING → ACTIVE and `actualCloseDate`
     * on ACTIVE → CLOSED. Does NOT validate transition legality — callers (e.g., `CompetenceFramework.lockCycle`) must
     * enforce the lifecycle state machine and the single-active-cycle invariant.
     *
     * @method
     * @param {string} cycleID
     * @param {CycleStatusValue} newStatus
     * @param {string|null} [actorID] - Employee ID of the actor performing the transition (used to populate `lockedBy`).
     * @returns {Promise<Cycle>}
     * @public
     */
    updateCycleStatus( cycleID, newStatus, actorID = null ) {
        return this.getCycle( cycleID ).then( ( cycle ) => {
            const updated = _.cloneDeep( cycle );
            updated.status = newStatus;
            const nowIso = new Date().toISOString();
            const todayDate = nowIso.slice( 0, 10 );
            if ( newStatus === configurationLoader.cycleStatus.ACTIVE ) {
                updated.lockedAt = nowIso;
                updated.lockedBy = actorID;
            } else if ( newStatus === configurationLoader.cycleStatus.CLOSED ) {
                updated.actualCloseDate = todayDate;
            }
            return new Promise( ( resolve, reject ) => {
                if ( cache.instance.isOperational ) {
                    cache.instance.editJSON( cacheEntryKeyCycles, { [ cycleID ]: updated } ).then( () => {
                        resolve( _.cloneDeep( updated ) );
                    } ).catch( reject );
                } else {
                    resolve( _.cloneDeep( updated ) );
                }
            } );
        } );
    }

    /**
     * Persists the explicit set of role families excluded from a cycle. Excluded families are skipped by lock
     * validation and hidden in Cycle Setup. Intended for PLANNING cycles (the precondition is enforced by the caller).
     *
     * @method
     * @param {string} cycleID
     * @param {Array<string>} excludedFamilies
     * @returns {Promise<Cycle>} The updated cycle.
     * @public
     */
    setCycleExcludedFamilies( cycleID, excludedFamilies ) {
        return this.getCycle( cycleID ).then( ( cycle ) => {
            const updated = _.cloneDeep( cycle );
            updated.excludedFamilies = Array.isArray( excludedFamilies ) ? _.uniq( excludedFamilies ).sort() : [];
            return new Promise( ( resolve, reject ) => {
                if ( cache.instance.isOperational ) {
                    cache.instance.editJSON( cacheEntryKeyCycles, { [ cycleID ]: updated } ).then( () => {
                        resolve( _.cloneDeep( updated ) );
                    } ).catch( reject );
                } else {
                    resolve( _.cloneDeep( updated ) );
                }
            } );
        } );
    }

    /**
     * Persists the cycle-wide team-feedback deadline. Intended for PLANNING cycles (the precondition is enforced by
     * the caller, mirroring setCycleExcludedFamilies).
     *
     * @method
     * @param {string} cycleID
     * @param {string} date - Team-feedback deadline (YYYY-MM-DD).
     * @returns {Promise<Cycle>} The updated cycle.
     * @public
     */
    setCycleTeamFeedbackDeadline( cycleID, date ) {
        return this.getCycle( cycleID ).then( ( cycle ) => {
            const updated = _.cloneDeep( cycle );
            updated.teamFeedbackDeadline = date;
            return new Promise( ( resolve, reject ) => {
                if ( cache.instance.isOperational ) {
                    cache.instance.editJSON( cacheEntryKeyCycles, { [ cycleID ]: updated } ).then( () => {
                        resolve( _.cloneDeep( updated ) );
                    } ).catch( reject );
                } else {
                    resolve( _.cloneDeep( updated ) );
                }
            } );
        } );
    }

    /* ------------------------------------------------------------------ */
    /*                       Active competency sets                       */

    /* ------------------------------------------------------------------ */

    /**
     * Returns the resolved active competency set for a (roleFamily, specialization?, cycleID) tuple as
     * `baseline ∪ specialization`, deduplicated and sorted by competency code ascending.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {SpecializationCodeValue|string|null} specialization
     * @param {string} cycleID
     * @returns {Promise<Array<string>>}
     * @public
     */
    getActiveCompetencySet( roleFamily, specialization, cycleID ) {
        return Promise.all( [
            this.getBaselineSet( roleFamily, cycleID ),
            ( specialization ? this.getSpecializationSet( roleFamily, specialization, cycleID ) : Promise.resolve( [] ) )
        ] ).then( ( [ baseline, spec ] ) => {
            const merged = new Set( [ ...baseline, ...spec ] );
            return Array.from( merged ).sort( ( a, b ) => a.localeCompare( b, undefined, { numeric: true } ) );
        } );
    }

    /**
     * Returns the baseline competency codes for a (roleFamily, cycleID) tuple. Empty array if absent.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {string} cycleID
     * @returns {Promise<Array<string>>}
     * @public
     */
    getBaselineSet( roleFamily, cycleID ) {
        return this.#fetchSet( roleFamily, BASELINE_KEY, cycleID );
    }

    /**
     * Returns the specialization-only competency codes for a (roleFamily, specialization, cycleID) tuple. Empty array
     * if absent.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {SpecializationCodeValue|string} specialization
     * @param {string} cycleID
     * @returns {Promise<Array<string>>}
     * @public
     */
    getSpecializationSet( roleFamily, specialization, cycleID ) {
        if ( !specialization ) return Promise.resolve( [] );
        return this.#fetchSet( roleFamily, specialization, cycleID );
    }

    /**
     * Returns every persisted set (baseline + every specialization) for a family within the given cycle, keyed by
     * `"baseline"` or specialization code. Useful for validation flows that need all of the family's data at once.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {string} cycleID
     * @returns {Promise<Object.<string, Array<string>>>}
     * @public
     */
    getActiveCompetencySetsForFamily( roleFamily, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !roleFamily || !cycleID ) {
                return resolve( {} );
            }
            const projectFamilyEntry = ( familyEntry ) => {
                if ( !familyEntry || typeof familyEntry !== "object" ) {
                    return {};
                }
                const out = {};
                for ( const [ key, cycleMap ] of Object.entries( familyEntry ) ) {
                    if ( cycleMap && Array.isArray( cycleMap[ cycleID ] ) ) {
                        out[ key ] = cycleMap[ cycleID ].slice();
                    }
                }
                return out;
            };
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyActiveCompetencySets, `${ roleFamily }` ).then( ( result ) => {
                    resolve( projectFamilyEntry( ( result instanceof Array ) ? result[ 0 ] : result ) );
                } ).catch( reject );
            } else {
                resolve( projectFamilyEntry( ( configurationLoader.configActiveCompetencySets || {} )[ roleFamily ] ) );
            }
        } );
    }

    /**
     * Persists the competency codes for a (roleFamily, baseline-or-specialization, cycleID) tuple. The `key` argument
     * is the literal `"baseline"` or a valid specialization code under the parent family.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {"baseline"|SpecializationCodeValue|string} key
     * @param {string} cycleID
     * @param {Array<string>} competencyCodes
     * @returns {Promise<Array<string>>}
     * @public
     */
    setActiveCompetencySet( roleFamily, key, cycleID, competencyCodes ) {
        return new Promise( ( resolve, reject ) => {
            if ( !roleFamily || !key || !cycleID || !Array.isArray( competencyCodes ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { roleFamily, key, cycleID, competencyCodes } ) );
            }
            const codes = _.uniq( competencyCodes ).sort( ( a, b ) => a.localeCompare( b, undefined, { numeric: true } ) );
            const update = { [ roleFamily ]: { [ key ]: { [ cycleID ]: codes } } };
            if ( cache.instance.isOperational ) {
                cache.instance.editJSON( cacheEntryKeyActiveCompetencySets, update ).then( () => {
                    resolve( _.cloneDeep( codes ) );
                } ).catch( reject );
            } else {
                resolve( _.cloneDeep( codes ) );
            }
        } );
    }

    /**
     * Removes the persisted set for a (roleFamily, specialization, cycleID) tuple, reverting it to "not configured"
     * (entry absent) — the inverse of {@link DataManager#setActiveCompetencySet}. Used to un-mark a specialization
     * that was flagged as intentionally empty. No-op when nothing is persisted for the tuple.
     *
     * @method
     * @param {RoleFamilyCodeValue|string} roleFamily
     * @param {SpecializationCodeValue|string} key - A specialization code under the parent family (never "baseline").
     * @param {string} cycleID
     * @returns {Promise}
     * @public
     */
    deleteActiveCompetencySet( roleFamily, key, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !roleFamily || !key || !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { roleFamily, key, cycleID } ) );
            }
            if ( !cache.instance.isOperational ) {
                return resolve();
            }
            // RedisJSON's JSON.MERGE (used by editJSON) follows RFC 7396 merge-patch semantics, where a null value
            // deletes the target leaf. Merging null at (roleFamily → key → cycleID) drops just this cycle's set, leaving
            // any other cycles under the same specialization — and the family's baseline — untouched.
            const update = { [ roleFamily ]: { [ key ]: { [ cycleID ]: null } } };
            cache.instance.editJSON( cacheEntryKeyActiveCompetencySets, update ).then( () => resolve() ).catch( reject );
        } );
    }

    /* ------------------------------------------------------------------ */
    /*                            Audit log                               */

    /* ------------------------------------------------------------------ */

    /**
     * Appends an audit entry. Auto-fills `entryID` and `timestamp` when absent. Append-only.
     *
     * @method
     * @param {Partial<AuditEntry>} entry
     * @returns {Promise<AuditEntry>}
     * @public
     */
    appendAuditEntry( entry ) {
        return new Promise( ( resolve, reject ) => {
            if ( !entry?.subjectType || !entry?.subjectID || !entry?.changedBy || !entry?.field ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { entry } ) );
            }
            const populated = {
                entryID: entry.entryID || tools.getUUID(),
                timestamp: entry.timestamp || new Date().toISOString(),
                reason: null,
                ...entry
            };
            const bucket = this.#auditLogBucketForSubject( populated.subjectType );
            const update = { [ bucket ]: { [ populated.subjectID ]: { [ populated.entryID ]: populated } } };
            if ( cache.instance.isOperational ) {
                cache.instance.editJSON( cacheEntryKeyAuditLog, update ).then( () => {
                    resolve( _.cloneDeep( populated ) );
                } ).catch( reject );
            } else {
                resolve( _.cloneDeep( populated ) );
            }
        } );
    }

    /**
     * Returns every audit entry for the given employee, ordered by `timestamp` descending.
     *
     * @method
     * @param {string} employeeID
     * @returns {Promise<Array<AuditEntry>>}
     * @public
     */
    getAuditEntriesForEmployee( employeeID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !employeeID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID } ) );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyAuditLog, [ "employees", `${ employeeID }` ] ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    const entries = Object.values( source );
                    entries.sort( ( a, b ) => ( b.timestamp || "" ).localeCompare( a.timestamp || "" ) );
                    resolve( entries );
                } ).catch( reject );
            } else {
                resolve( [] );
            }
        } );
    }

    /**
     * Returns every audit entry for the given evaluation, ordered by `timestamp` descending. Mirrors
     * getAuditEntriesForEmployee against the evaluation-scoped bucket.
     *
     * @method
     * @param {string} evaluationID
     * @returns {Promise<Array<AuditEntry>>}
     * @public
     */
    getAuditEntriesForEvaluation( evaluationID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluationID } ) );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyAuditLog, [ "evaluations", `${ evaluationID }` ] ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    const entries = Object.values( source );
                    entries.sort( ( a, b ) => ( b.timestamp || "" ).localeCompare( a.timestamp || "" ) );
                    resolve( entries );
                } ).catch( reject );
            } else {
                resolve( [] );
            }
        } );
    }

    /* Private interface */

    /**
     * @method
     * @private
     * @returns {{employees: {}, cycles: {}, activeCompetencySets: {}, evaluations: {}}}
     */
    #emptyAuditLogShape() {
        return { employees: {}, cycles: {}, activeCompetencySets: {}, evaluations: {} };
    }

    /**
     * @method
     * @private
     * @param {"employee"|"cycle"|"activeCompetencySet"|"evaluation"} subjectType
     * @returns {"employees"|"cycles"|"activeCompetencySets"|"evaluations"}
     */
    #auditLogBucketForSubject( subjectType ) {
        switch ( subjectType ) {
            case "employee":
                return "employees";
            case "cycle":
                return "cycles";
            case "activeCompetencySet":
                return "activeCompetencySets";
            case "evaluation":
                return "evaluations";
            default:
                return "employees";
        }
    }

    /**
     * Reads a single (roleFamily, key, cycleID) tuple from the active-competency-sets store, returning an empty array
     * when absent.
     *
     * @method
     * @private
     * @param {string} roleFamily
     * @param {string} key - The literal "baseline" or a specialization code.
     * @param {string} cycleID
     * @returns {Promise<Array<string>>}
     */
    #fetchSet( roleFamily, key, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !roleFamily || !key || !cycleID ) {
                return resolve( [] );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyActiveCompetencySets, [ roleFamily, key, cycleID ] ).then( ( result ) => {
                    const codes = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    resolve( Array.isArray( codes ) ? codes : [] );
                } ).catch( reject );
            } else {
                const source = ( configurationLoader.configActiveCompetencySets || {} )[ roleFamily ] || {};
                const entry = source[ key ] || {};
                resolve( Array.isArray( entry[ cycleID ] ) ? _.cloneDeep( entry[ cycleID ] ) : [] );
            }
        } );
    }

    /**
     * Derives an initial Cycle record per unique cycle ID found in the active-competency-sets configuration. Used by
     * `initialize()` when COMPETENCE_PRELOAD_DATA is enabled. Cycles are created in PLANNING state with default dates
     * derived from the half-year encoded in the cycle ID.
     *
     * @method
     * @private
     * @param {ConfigActiveCompetencySets} activeSets
     * @returns {Array<Cycle>}
     */
    #deriveSeededCycles( activeSets ) {
        const cycleIDs = new Set();
        for ( const familyEntry of Object.values( activeSets || {} ) ) {
            if ( !familyEntry || typeof familyEntry !== "object" ) continue;
            for ( const cycleMap of Object.values( familyEntry ) ) {
                if ( !cycleMap || typeof cycleMap !== "object" ) continue;
                for ( const cycleID of Object.keys( cycleMap ) ) {
                    cycleIDs.add( cycleID );
                }
            }
        }
        const createdAt = new Date().toISOString();
        // Pick the first seeded employee as the default creator so the "created by" column on the Cycles
        // screen has a real name to display. The seeder runs without a session (no logged-in user), so
        // there's no real actor — using the first registry entry keeps the name resolvable through
        // organizationManager.resolveEmployeeName without coupling to a magic test-user ID.
        const seedEmployees = require( "#data-employees" ).employees;
        const seedCreator = ( Array.isArray( seedEmployees ) && seedEmployees.length > 0 ) ? seedEmployees[ 0 ].employeeID : null;
        const allFamilies = Object.keys( configurationLoader.configRoleFamilies || {} );
        return Array.from( cycleIDs ).map( ( cycleID ) => {
            const [ yearStr, half ] = cycleID.split( "-" );
            const year = Number( yearStr );
            const cycleStart = ( half === "H1" ) ? `${ year }-01-15` : `${ year }-07-01`;
            const cycleDate = ( half === "H1" ) ? `${ year }-04-30` : `${ year }-11-30`;
            const cycleEnd = ( half === "H1" ) ? `${ year }-06-30` : `${ year }-12-31`;
            // Exclude every family that has no competencies for this cycle, so the seeded cycle is lockable out of the
            // box (lock validation now blocks a cycle that leaves an included family unconfigured).
            const configuredFamilies = new Set();
            for ( const [ family, familyEntry ] of Object.entries( activeSets || {} ) ) {
                if ( !familyEntry || typeof familyEntry !== "object" ) continue;
                const hasData = Object.values( familyEntry ).some( ( cycleMap ) => cycleMap && Array.isArray( cycleMap[ cycleID ] ) && cycleMap[ cycleID ].length > 0 );
                if ( hasData ) configuredFamilies.add( family );
            }
            const excludedFamilies = allFamilies.filter( ( family ) => !configuredFamilies.has( family ) );
            return {
                cycleID,
                name: `${ half === "H1" ? "Spring" : "Autumn" } '${ String( year ).slice( -2 ) } cycle`,
                status: configurationLoader.cycleStatus.PLANNING,
                cycleStart,
                cycleDate,
                cycleEnd,
                actualCloseDate: null,
                lockedAt: null,
                lockedBy: null,
                teamFeedbackDeadline: this.#deriveTeamFeedbackDeadline( cycleStart, cycleDate ),
                createdAt,
                createdBy: seedCreator,
                excludedFamilies
            };
        } );
    }

    /**
     * Derives the default team-feedback deadline for a cycle: `cycleStart` + `teamFeedbackWindowDays`, clamped so it
     * never extends past the manager-review deadline (`cycleDate`). Falls back to `cycleDate` when there is no
     * `cycleStart`. Reads only the app setting; shared by createCycle and #deriveSeededCycles.
     *
     * @method
     * @private
     * @param {string|null} cycleStart - Cycle start date (YYYY-MM-DD) or null.
     * @param {string} cycleDate - Manager-review deadline (YYYY-MM-DD); the clamp ceiling.
     * @returns {string} Derived team-feedback deadline (YYYY-MM-DD), or "" when neither date is available.
     */
    #deriveTeamFeedbackDeadline( cycleStart, cycleDate ) {
        const windowDays = configurationLoader.getSetting( "performanceAppraisals.teamFeedbackWindowDays", 14 );
        if ( !cycleStart ) {
            return cycleDate || "";
        }
        const start = new Date( `${ cycleStart }T00:00:00.000Z` );
        if ( Number.isNaN( start.getTime() ) ) {
            return cycleDate || "";
        }
        start.setUTCDate( start.getUTCDate() + windowDays );
        const derived = start.toISOString().slice( 0, 10 );
        return ( cycleDate && derived > cycleDate ) ? cycleDate : derived;
    }

}

const instance = new DataManager();
module.exports.instance = Object.freeze( instance );
