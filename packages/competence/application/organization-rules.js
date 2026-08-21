/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Pure structural rules for the organization unit tree. Performs no I/O — the caller passes the structure (and, for
 * the manager diagnostic, the employee list) as plain objects, mirroring the {@link RoleResolver} pattern.
 * <br/>
 * The first three rules are facts about the document itself and back **blocking** config validators. The fourth,
 * {@link OrganizationRules#findUnresolvedManagers}, is a reference into the employee store — a different lifecycle —
 * and is therefore reported as a diagnostic rather than gating a save. Blocking on it would deadlock a fresh
 * install: the tree could not be saved until the employees existed, while the employee importer rejects any record
 * whose `organizationUnitID` is not already in the tree.
 *
 * @class OrganizationRules
 * @singleton
 * @public
 */
class OrganizationRules {

    static #instance = null;

    /**
     * @constructor
     * @returns {OrganizationRules}
     */
    constructor() {
        if ( !OrganizationRules.#instance ) {
            OrganizationRules.#instance = this;
        }
        return OrganizationRules.#instance;
    }

    /* Public interface */

    /**
     * The IDs of every unit with no parent. `getTopManagerID` and the whole structural-supervisor derivation assume
     * exactly one. Pure.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<string>}
     * @public
     */
    findRootUnits( structure ) {
        return Object.entries( structure || {} )
            .filter( ( [ , unit ] ) => !unit || unit.parent === null || unit.parent === undefined || unit.parent === "" )
            .map( ( [ rawID, unit ] ) => ( unit && unit.id ) || rawID );
    }

    /**
     * Every place the `parent` and `children` links disagree. The graph builder reads the two independently, so a
     * mismatch silently yields a half-connected tree rather than an error. Pure.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<{unitID: string, relatedID: string, code: string}>}
     * @public
     */
    findSymmetryBreaks( structure ) {
        const units = structure || {};
        const breaks = [];
        for ( const [ rawID, unit ] of Object.entries( units ) ) {
            const unitID = ( unit && unit.id ) || rawID;
            const children = ( unit && Array.isArray( unit.children ) ) ? unit.children : [];
            for ( const childID of children ) {
                const child = units[ childID ];
                if ( !child ) {
                    breaks.push( { unitID: unitID, relatedID: childID, code: "missing-child" } );
                } else if ( child.parent !== rawID ) {
                    breaks.push( { unitID: unitID, relatedID: childID, code: "child-parent-mismatch" } );
                }
            }
            const parentID = unit && unit.parent;
            if ( parentID ) {
                const parent = units[ parentID ];
                if ( !parent ) {
                    breaks.push( { unitID: unitID, relatedID: parentID, code: "missing-parent" } );
                } else if ( !( Array.isArray( parent.children ) ? parent.children : [] ).includes( rawID ) ) {
                    breaks.push( { unitID: unitID, relatedID: parentID, code: "parent-missing-child" } );
                }
            }
        }
        return breaks;
    }

    /**
     * Every unit that sits on a parent cycle. `RoleResolver#subManagerDepth` recurses with no visited set, so a
     * cycle is a stack overflow at login rather than a diagnosable error. Pure.
     * <br/>
     * The returned array contains raw map keys, not the `id`-or-key values that the other rules report.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<string>}
     * @public
     */
    findCycles( structure ) {
        const units = structure || {};
        const cyclic = new Set();
        for ( const startID of Object.keys( units ) ) {
            const seen = new Set();
            let cursor = startID;
            while ( cursor && units[ cursor ] ) {
                if ( seen.has( cursor ) ) {
                    cyclic.add( cursor );
                    break;
                }
                seen.add( cursor );
                cursor = units[ cursor ].parent;
            }
        }
        return Array.from( cyclic ).sort();
    }

    /**
     * Every unit whose `managerID` names no employee, or names a terminated one. A manager-less unit is legal and is
     * not reported — `RoleResolver#subManagerDepth` recurses through it as transparent. Pure.
     * <br/>
     * Reported, never blocking — see the class note.
     *
     * @method
     * @param {Object} structure
     * @param {Array<Employee>} employees
     * @returns {Array<{unitID: string, managerID: string, code: string}>}
     * @public
     */
    findUnresolvedManagers( structure, employees ) {
        const byID = new Map();
        ( Array.isArray( employees ) ? employees : [] ).forEach( ( employee ) => {
            if ( employee && employee.employeeID ) {
                byID.set( String( employee.employeeID ), employee );
            }
        } );

        const findings = [];
        for ( const [ rawID, unit ] of Object.entries( structure || {} ) ) {
            const unitID = ( unit && unit.id ) || rawID;
            const managerID = unit && unit.managerID;
            if ( !managerID ) {
                continue;
            }
            const manager = byID.get( String( managerID ) );
            if ( !manager ) {
                findings.push( { unitID: unitID, managerID: String( managerID ), code: "manager-not-found" } );
            } else if ( manager.employmentStatus === "terminated" ) {
                findings.push( { unitID: unitID, managerID: String( managerID ), code: "manager-terminated" } );
            }
        }
        return findings;
    }

}

const instance = new OrganizationRules();
module.exports.instance = Object.freeze( instance );
