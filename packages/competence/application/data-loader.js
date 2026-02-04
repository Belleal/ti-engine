/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * Used to create and/or return a Data Loader singleton instance.
 *
 * @class DataLoader
 * @singleton
 * @public
 */
class DataLoader {

    static #instance = null;

    constructor() {
        if ( !DataLoader.#instance ) {
            DataLoader.#instance = this;
        }
        return DataLoader.#instance;
    }

    /* Public interface */

    /**
     * Used to fetch the employee data from the data file.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string} employeeID
     * @returns {Promise<Object>} Returns the employee data object.
     * @public
     */
    fetchEmployee( employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const employees = require( "#data-employees" ).employees;
            const employee = employees.find( ( employee ) => employee.employeeID === employeeID );
            if ( !employee ) {
                reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID: employeeID } ) );
            } else {
                resolve( employee );
            }
        } );
    }

    /**
     * Used to fetch the evaluations data from the data file.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param employeeID
     * @returns {Promise<Array<Object>>} Returns an array of evaluation data objects or empty array if there are no evaluations for the specified employee ID.
     * @public
     */
    fetchEvaluations( employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const evaluations = require( "#data-evaluations" ).evaluations;
            let employeeEvaluations = evaluations.filter( ( evaluation ) => evaluation.employeeID === employeeID );
            resolve( ( !employeeEvaluations || employeeEvaluations.length === 0 ) ? [] : employeeEvaluations );
        } );
    }

    /**
     * Used to fetch the evaluation data from the data file.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param {string} evaluationID
     * @returns {Promise<Object>} Returns the evaluation data object.
     * @public
     */
    fetchEvaluation( evaluationID ) {
        return new Promise( ( resolve, reject ) => {
            const evaluations = require( "#data-evaluations" ).evaluations;
            const evaluation = evaluations.find( ( evaluation ) => evaluation.evaluationID === evaluationID );
            if ( !evaluation ) {
                reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluationID: evaluationID } ) );
            } else {
                resolve( evaluation );
            }
        } );
    }

}

const instance = new DataLoader();
module.exports.instance = Object.freeze( instance );
