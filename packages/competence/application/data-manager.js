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
     * Used to initialize the data manager.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize() {
        let promises = [];
        promises.push( cache.instance.setJSON( `ti:competence:data:employees`, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( `ti:competence:data:evaluations`, {}, "$", 1 ) );

        let preloadData = ( process.env.COMPETENCE_PRELOAD_DATA !== undefined ) ? tools.toBool( process.env.COMPETENCE_PRELOAD_DATA ) : false;

        if ( preloadData === true ) {
            const employees = require( "#data-employees" ).employees;
            employees.forEach( ( employee ) => {
                promises.push( cache.instance.editJSON( `ti:competence:data:employees`, { [ employee.employeeID ]: employee } ) );
            } );
            const evaluations = require( "#data-evaluations" ).evaluations;
            evaluations.forEach( ( evaluation ) => {
                promises.push( cache.instance.editJSON( `ti:competence:data:evaluations`, { [ evaluation.employeeID ]: { [ evaluation.evaluationID ]: evaluation } } ) );
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
                cache.instance.getJSON( `ti:competence:data:employees`, "$" ).then( ( result ) => {
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
                cache.instance.getJSON( `ti:competence:data:employees`, `${ resolvedEmployeeID }` ).then( ( result ) => {
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
                cache.instance.getJSON( `ti:competence:data:evaluations`, resolvedEmployeeID ? `${ resolvedEmployeeID }` : "$" ).then( ( result ) => {
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
                cache.instance.getJSON( `ti:competence:data:evaluations`, `*.${ evaluationID }` ).then( ( result ) => {
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
            cache.instance.editJSON( `ti:competence:data:evaluations`, { [ evaluation.employeeID ]: { [ evaluation.evaluationID ]: evaluation } } ).then( () => {
                resolve( evaluation );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

}

const instance = new DataManager();
module.exports.instance = Object.freeze( instance );