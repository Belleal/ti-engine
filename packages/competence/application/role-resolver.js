/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const configurationLoader = require( "#configuration-loader" );

/**
 * @typedef {Object} UnitSubtree
 * @property {string} id
 * @property {string} [managerID]
 * @property {Array<UnitSubtree>} [children]
 */

/**
 * @typedef {Object} SupervisorEligibilityContext
 * @property {boolean} isTopManager - The employee is the organization's top manager (root unit's manager).
 * @property {boolean} reportsToTopManager - The employee's resolved manager is the top manager.
 * @property {Array<UnitSubtree>} managedSubtrees - The org subtrees rooted at the units the employee manages.
 */

/**
 * @typedef {Object} EffectiveRolesContext
 * @property {boolean} [isUnitManager] - The employee manages at least one org unit.
 * @property {boolean} [isAutoSupervisor] - The employee is a structural (auto) supervisor.
 * @property {boolean} [hasSupervisorGrant] - The employee holds a manual supervisor grant.
 */

// A direct report of the top manager becomes an auto-supervisor only when their managed subtree contains at least
// this many further nested management levels (manager-of-managers chain).
const MIN_SUPERVISOR_SUBTREE_DEPTH = 2;

/**
 * Pure resolver for the competence app's org-derived roles. Performs no I/O — the caller injects the live graph
 * facts it needs (mirrors the {@link TaskResolver} pattern), keeping every rule unit-testable with plain objects.
 *
 * @class RoleResolver
 * @singleton
 * @public
 */
class RoleResolver {

    static #instance = null;

    /**
     * @constructor
     * @returns {RoleResolver}
     */
    constructor() {
        if ( !RoleResolver.#instance ) {
            RoleResolver.#instance = this;
        }
        return RoleResolver.#instance;
    }

    /**
     * The length of the longest chain of nested *manager-led* units strictly below `unitSubtree`. Manager-less
     * intermediate units are transparent (recursed through but not counted). Pure.
     *
     * @method
     * @param {UnitSubtree} unitSubtree
     * @returns {number}
     * @public
     */
    subManagerDepth( unitSubtree ) {
        if ( !unitSubtree || !Array.isArray( unitSubtree.children ) || unitSubtree.children.length === 0 ) {
            return 0;
        }
        let max = 0;
        for ( const child of unitSubtree.children ) {
            const below = this.subManagerDepth( child );
            const chain = ( child && child.managerID ) ? ( 1 + below ) : below;
            if ( chain > max ) {
                max = chain;
            }
        }
        return max;
    }

    /**
     * Whether the employee qualifies as a structural (auto) supervisor: the top manager, or a direct report of the
     * top manager whose managed subtree is at least {@link MIN_SUPERVISOR_SUBTREE_DEPTH} management levels deep. Pure.
     *
     * @method
     * @param {SupervisorEligibilityContext} ctx
     * @returns {boolean}
     * @public
     */
    isAutoSupervisor( ctx ) {
        if ( !ctx ) {
            return false;
        }
        if ( ctx.isTopManager === true ) {
            return true;
        }
        if ( ctx.reportsToTopManager !== true ) {
            return false;
        }
        const subtrees = Array.isArray( ctx.managedSubtrees ) ? ctx.managedSubtrees : [];
        const depth = subtrees.reduce( ( best, subtree ) => Math.max( best, this.subManagerDepth( subtree ) ), 0 );
        return depth >= MIN_SUPERVISOR_SUBTREE_DEPTH;
    }

    /**
     * Composes the effective numeric role codes for an employee. EMPLOYEE is always present; MANAGER and SUPERVISOR
     * are added per the flags (SUPERVISOR = auto status OR a manual grant). Pure.
     *
     * @method
     * @param {EffectiveRolesContext} ctx
     * @returns {number[]}
     * @public
     */
    resolveRoles( ctx ) {
        const roles = [ configurationLoader.roleCode.EMPLOYEE ];
        if ( ctx && ctx.isUnitManager === true ) {
            roles.push( configurationLoader.roleCode.MANAGER );
        }
        if ( ctx && ( ctx.isAutoSupervisor === true || ctx.hasSupervisorGrant === true ) ) {
            roles.push( configurationLoader.roleCode.SUPERVISOR );
        }
        return roles;
    }

}

const instance = new RoleResolver();
module.exports.instance = Object.freeze( instance );
