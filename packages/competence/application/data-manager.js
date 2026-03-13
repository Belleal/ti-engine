/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const cache = require( "@ti-engine/core/cache" );
const exceptions = require( "@ti-engine/core/exceptions" );
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
     * @param {boolean} preloadData If true, it will preload the data from the available data files into the data storage.
     * @returns {Promise}
     * @public
     */
    initialize( preloadData = false ) {
        let promises = [];
        promises.push( cache.instance.setJSON( `ti:competence:data:employees`, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( `ti:competence:data:evaluations`, {}, "$", 1 ) );

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
     * Used to fetch a set of evaluations from the data storage by employee ID.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string|number} employeeID
     * @param {boolean} [filterClosed=false] If true, it will filter out evaluations that are closed.
     * @returns {Promise<Array<Evaluation>>} Returns an array of evaluation data objects or empty array if there are no evaluations for the specified employee ID.
     * @public
     */
    fetchEvaluations( employeeID, filterClosed = false ) {
        return new Promise( ( resolve, reject ) => {
            const resolvedEmployeeID = String( employeeID );
            let statusFilter = [];
            statusFilter.push( configurationLoader.evaluationStatus.DELETED );
            if ( filterClosed === true ) {
                statusFilter.push( configurationLoader.evaluationStatus.CLOSED );
            }

            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( `ti:competence:data:evaluations`, `${ resolvedEmployeeID }` ).then( ( result ) => {
                    if ( !result || result.length === 0 ) {
                        resolve( [] );
                    } else {

                        let employeeEvaluations = _.filter( ( result instanceof Array ) ? result[ 0 ] : result, ( evaluation ) => ( statusFilter.indexOf( evaluation.status ) < 0 ) );
                        resolve( ( !employeeEvaluations || employeeEvaluations.length === 0 ) ? [] : _.cloneDeep( employeeEvaluations ) );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                // NOTE: Only for development purposes. The system expects an actual DB to function properly.
                const evaluations = require( "#data-evaluations" ).evaluations;
                let employeeEvaluations = evaluations.filter( ( evaluation ) => evaluation.employeeID === resolvedEmployeeID && statusFilter.indexOf( evaluation.status ) < 0 );
                resolve( ( !employeeEvaluations || employeeEvaluations.length === 0 ) ? [] : _.cloneDeep( employeeEvaluations ) );
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
                if ( !evaluation ) {
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