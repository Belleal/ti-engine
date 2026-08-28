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
 * @property {Object} workSites - The work-sites nomenclature, keyed by site code.
 */

const configurationLoader = require( "#configuration-loader" );

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const GENDERS = Object.freeze( [ "M", "F" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const LEVELS = Object.freeze( [ "N", "J", "R", "S", "X", "T" ] );
// How many sub-levels each rung carries, read from the ladder rather than restated. It used to be a
// hard-coded 1-3 bound plus a list of single-stage rungs, which silently accepted T3 the moment CA-111
// gave T two sub-levels instead of one: nothing tied the bound to the ladder that actually defines it.
// N and X carry one, J/R/S three, T two (T1 Team Lead, T2 Head of Department -- same scope anchors,
// distinguished by relevancy weighting, since scope is defined per letter).
const STAGES_PER_LEVEL = Object.freeze( configurationLoader.getStageLevelLadder().reduce( ( map, entry ) => {
    map[ entry.code ] = entry.stages.length;
    return map;
}, {} ) );
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure validation rules for an employee record. Performs no I/O — the caller injects the role-families, the
 * organization-structure and the work-sites configuration (mirrors the {@link RoleResolver} pattern), so every rule
 * is unit-testable with plain objects and the web UI, the CSV importer and any future sync driver all decide
 * validity identically.
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
        const sites = ctx.workSites || {};

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
        const workSite = employee.personal.workSite;
        // Object.hasOwn, not `!sites[ workSite ]`: a plain object's bracket lookup also resolves inherited
        // properties, so a work site (or role family / specialization / organization unit, below) named "toString"
        // or "constructor" would find Object.prototype's own member and read as "known" against an empty
        // nomenclature. Own-property checking closes that off without rejecting any legitimate code.
        if ( workSite && !Object.hasOwn( sites, workSite ) ) {
            return "error.employee.invalid-work-site";
        }
        const gender = employee.personal.gender;
        if ( gender && !GENDERS.includes( gender ) ) {
            return "error.employee.invalid-gender";
        }

        const employmentStatus = employee.employmentStatus || "active";
        if ( !EMPLOYMENT_STATUSES.includes( employmentStatus ) ) {
            return "error.employee.invalid-employment-status";
        }

        const career = employee.career || {};
        const roleFamily = career.roleFamily;
        if ( !roleFamily || !Object.hasOwn( families, roleFamily ) ) {
            return "error.employee.invalid-role-family";
        }
        const specialization = career.specialization || null;
        if ( specialization && !Object.hasOwn( families[ roleFamily ].specializations || {}, specialization ) ) {
            return "error.employee.invalid-specialization";
        }

        const level = career.level;
        const stage = career.stage;
        if ( !LEVELS.includes( level ) ) {
            return "error.employee.invalid-level";
        }
        if ( !Number.isInteger( stage ) || stage < 1 ) {
            return "error.employee.invalid-stage";
        }
        if ( stage > ( STAGES_PER_LEVEL[ level ] || 1 ) ) {
            return "error.employee.invalid-stage-for-level";
        }

        const organizationUnitID = career.organizationUnitID;
        if ( !organizationUnitID || !Object.hasOwn( structure, organizationUnitID ) ) {
            return "error.employee.invalid-organization-unit";
        }

        if ( employee.email && !EMAIL_PATTERN.test( employee.email ) ) {
            return "error.employee.invalid-email";
        }

        return null;
    }

    /**
     * Finds an existing employee already using the given email, excluding the record being written. Returns the
     * colliding `employeeID`, or `null`. Matching is trimmed and case-insensitive, exactly as
     * `OrganizationManager#buildEmailIndex` normalizes at login. Pure.
     * <br/>
     * A collision is a hard rejection rather than a warning: a shared address makes the login index ambiguous, and
     * `IdentityResolver` then refuses **both** employees rather than guessing which one signed in.
     *
     * @method
     * @param {string} [email]
     * @param {string} [employeeID] - The record being written, excluded from the search.
     * @param {Array<Employee>} [employees]
     * @returns {string|null}
     * @public
     */
    findEmailCollision( email, employeeID, employees ) {
        const normalized = String( email == null ? "" : email ).trim().toLowerCase();
        if ( !normalized ) {
            return null;
        }
        const self = String( employeeID == null ? "" : employeeID );
        const list = Array.isArray( employees ) ? employees : [];
        for ( const candidate of list ) {
            const candidateID = candidate && candidate.employeeID;
            if ( !candidateID || String( candidateID ) === self ) {
                continue;
            }
            if ( String( candidate.email == null ? "" : candidate.email ).trim().toLowerCase() === normalized ) {
                return String( candidateID );
            }
        }
        return null;
    }

}

const instance = new EmployeeRules();
module.exports.instance = Object.freeze( instance );
