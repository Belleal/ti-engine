/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
     * @return {Object|undefined} Returns the employee data object or undefined if the employee is not found.
     * @public
     */
    fetchEmployee( employeeID ) {
        const employees = require( "#data-employees" ).employees;
        return employees.find( ( employee ) => employee.employeeID === employeeID );
    }

    /**
     * Used to fetch the evaluations data from the data file.
     * <br/>
     * NOTE: This specifically does not cache the data! It is a temporary implementation for development purposes only.
     *
     * @method
     * @param employeeID
     * @param evaluationID
     * @return {Array<Object>|undefined} Returns an array of evaluation data objects or undefined if no employee evaluations are not found.
     * @public
     */
    fetchEvaluations( employeeID, evaluationID = undefined ) {
        const evaluations = require( "#data-evaluations" ).evaluations;
        const employeeEvaluations = evaluations.filter( ( evaluation ) => evaluation.employeeID === employeeID );
        return ( evaluationID ) ? [ employeeEvaluations.find( ( evaluation ) => evaluation.evaluationID === evaluationID ) ] : employeeEvaluations;
    }

}

const instance = new DataLoader();
module.exports.instance = Object.freeze( instance );