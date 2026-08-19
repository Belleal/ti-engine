/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @typedef {Object} EmployeeRulesContext
 * @property {Object} roleFamilies - The role-families configuration, keyed by family code.
 * @property {Object} organizationStructure - The organization unit tree, keyed by unit ID.
 */

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const LEVELS = Object.freeze( [ "N", "J", "R", "S", "X", "T" ] );
// N (Intern), X (Expert) and T (Manager) are single-stage rungs of the ladder; J, R and S carry stages 1-3.
const SINGLE_STAGE_LEVELS = Object.freeze( [ "N", "X", "T" ] );
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure validation rules for an employee record. Performs no I/O — the caller injects the role-families and
 * organization-structure configuration (mirrors the {@link RoleResolver} pattern), so every rule is unit-testable
 * with plain objects and the web UI, the CSV importer and any future sync driver all decide validity identically.
 *
 * @class EmployeeRules
 * @singleton
 * @public
 */
class EmployeeRules {

    static #instance = null;

    /**
     * @constructor
     * @returns {EmployeeRules}
     */
    constructor() {
        if ( !EmployeeRules.#instance ) {
            EmployeeRules.#instance = this;
        }
        return EmployeeRules.#instance;
    }

    /* Public interface */

    /**
     * Validates an employee record's fields. Returns the localization label key of the first violation found, or
     * `null` when the record is valid. Pure.
     *
     * @method
     * @param {Employee} employee
     * @param {EmployeeRulesContext} context
     * @returns {string|null}
     * @public
     */
    validateEmployee( employee, context ) {
        const ctx = context || {};
        const families = ctx.roleFamilies || {};
        const structure = ctx.organizationStructure || {};

        const firstName = employee && employee.personal && employee.personal.firstName;
        const lastName = employee && employee.personal && employee.personal.lastName;
        if ( !firstName || !lastName ) {
            return "error.employee.missing-name";
        }

        const workMode = employee.personal.workMode;
        if ( !WORK_MODES.includes( workMode ) ) {
            return "error.employee.invalid-work-mode";
        }
        const workLocation = employee.personal.workLocation;
        if ( !WORK_LOCATIONS.includes( workLocation ) ) {
            return "error.employee.invalid-work-location";
        }

        const employmentStatus = employee.employmentStatus || "active";
        if ( !EMPLOYMENT_STATUSES.includes( employmentStatus ) ) {
            return "error.employee.invalid-employment-status";
        }

        const career = employee.career || {};
        const roleFamily = career.roleFamily;
        if ( !roleFamily || !families[ roleFamily ] ) {
            return "error.employee.invalid-role-family";
        }
        const specialization = career.specialization || null;
        if ( specialization && !( families[ roleFamily ].specializations || {} )[ specialization ] ) {
            return "error.employee.invalid-specialization";
        }

        const level = career.level;
        const stage = career.stage;
        if ( !LEVELS.includes( level ) ) {
            return "error.employee.invalid-level";
        }
        if ( !Number.isInteger( stage ) || stage < 1 || stage > 3 ) {
            return "error.employee.invalid-stage";
        }
        if ( SINGLE_STAGE_LEVELS.includes( level ) && stage !== 1 ) {
            return "error.employee.invalid-stage-for-level";
        }

        const organizationUnitID = career.organizationUnitID;
        if ( !organizationUnitID || !structure[ organizationUnitID ] ) {
            return "error.employee.invalid-organization-unit";
        }

        if ( employee.email && !EMAIL_PATTERN.test( employee.email ) ) {
            return "error.employee.invalid-email";
        }

        return null;
    }

}

const instance = new EmployeeRules();
module.exports.instance = Object.freeze( instance );
