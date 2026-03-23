/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );
const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const { DirectedGraph } = require( "graphology" );


/**
 * Used to create and/or return an Organization Manager singleton instance.
 *
 * @class OrganizationManager
 * @singleton
 * @public
 */
class OrganizationManager {

    static #instance = null;

    #organizationChart = null;

    /**
     * @constructor
     * @return {OrganizationManager}
     */
    constructor() {
        if ( !OrganizationManager.#instance ) {
            OrganizationManager.#instance = this;
        }
        return OrganizationManager.#instance;
    }

    /* Public interface */

    toUnitNodeID = ( unitID ) => {
        return `unit:${ unitID }`;
    }

    toEmployeeNodeID = ( employeeID ) => {
        return `employee:${ employeeID }`;
    }

    /**
     * Builds and stores an organization chart graph from organization units and employees.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    buildOrganizationChart() {
        return new Promise( ( resolve, reject ) => {
            dataManager.instance.fetchEmployees().then( ( employees ) => {
                const graph = new DirectedGraph();

                // Add organization unit nodes.
                Object.entries( configurationLoader.configOrganizationStructure || {} ).forEach( ( [ rawUnitID, unit ] ) => {
                    const unitID = String( unit?.id || rawUnitID || "" ).trim();
                    if ( !unitID ) return;

                    const parent = unit?.parent ? String( unit.parent ).trim() : "";
                    graph.mergeNode( this.toUnitNodeID( unitID ), {
                        nodeType: "organizationUnit",
                        id: unitID,
                        type: String( unit?.type || "" ).trim(),
                        name: String( unit?.displayName || unit?.name || unitID ).trim(),
                        description: String( unit?.description || "" ).trim(),
                        managerID: String( unit?.managerID || "" ).trim(),
                        parent: parent || null
                    } );
                } );

                // Add hierarchy edges (parent -> child).
                Object.entries( configurationLoader.configOrganizationStructure || {} ).forEach( ( [ rawUnitID, unit ] ) => {
                    const unitID = String( unit?.id || rawUnitID || "" ).trim();
                    const parentID = String( unit?.parent || "" ).trim();
                    if ( !unitID || !parentID ) return;

                    const parentNodeID = this.toUnitNodeID( parentID );
                    const childNodeID = this.toUnitNodeID( unitID );
                    if ( graph.hasNode( parentNodeID ) && graph.hasNode( childNodeID ) ) {
                        graph.mergeEdgeWithKey(
                            `organization-unit-child:${ parentID }->${ unitID }`,
                            parentNodeID,
                            childNodeID,
                            { relation: "organizationUnitChild" }
                        );
                    }
                } );

                // Add employee nodes and membership edges (unit -> employee).
                employees.forEach( ( employee ) => {
                    const employeeID = String( employee?.employeeID || "" ).trim();
                    if ( !employeeID ) return;

                    const organizationUnitID = String( employee?.personal?.organizationUnitID || "" ).trim();
                    const employeeNodeID = this.toEmployeeNodeID( employeeID );
                    graph.mergeNode( employeeNodeID, {
                        nodeType: "employee",
                        id: employeeID,
                        name: String( employee?.personal?.name || "" ).trim(),
                        position: String( employee?.personal?.position || "" ).trim(),
                        organizationUnitID: organizationUnitID
                    } );

                    const unitNodeID = this.toUnitNodeID( organizationUnitID );
                    if ( organizationUnitID && graph.hasNode( unitNodeID ) ) {
                        graph.mergeEdgeWithKey(
                            `organization-unit-member:${ organizationUnitID }->${ employeeID }`,
                            unitNodeID,
                            employeeNodeID,
                            { relation: "organizationUnitMember" }
                        );
                    }
                } );

                this.#organizationChart = graph;

                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Resolves the manager ID for the provided employee.
     *
     * @method
     * @param {Employee} employee
     * @returns {string}
     * @public
     */
    resolveManagerIDForEmployee( employee ) {
        const employeeID = String( employee?.employeeID || "" ).trim();
        if ( !employeeID ) {
            return "";
        }

        const unitNodeID = this.toUnitNodeID( employee?.personal?.organizationUnitID );

        if ( this.#organizationChart && this.#organizationChart.hasNode( unitNodeID ) ) {
            let currentUnitNodeID = unitNodeID;
            const visited = new Set();

            while ( currentUnitNodeID && !visited.has( currentUnitNodeID ) && this.#organizationChart.hasNode( currentUnitNodeID ) ) {
                visited.add( currentUnitNodeID );
                const managerID = String( this.#organizationChart.getNodeAttribute( currentUnitNodeID, "managerID" ) || "" ).trim();
                if ( managerID && managerID !== employeeID ) {
                    return managerID;
                } else {
                    currentUnitNodeID = this.#organizationChart.inNeighbors( currentUnitNodeID ).find( ( neighborNodeID ) => {
                        if ( !this.#organizationChart.hasNode( neighborNodeID ) ) return false;
                        if ( this.#organizationChart.getNodeAttribute( neighborNodeID, "nodeType" ) !== "organizationUnit" ) return false;
                        const edgeKey = this.#organizationChart.edge( neighborNodeID, currentUnitNodeID );
                        return edgeKey && this.#organizationChart.getEdgeAttribute( edgeKey, "relation" ) === "organizationUnitChild";
                    } ) || "";
                }
            }
        }

        return "";
    }

    /**
     * Resolves organization-unit and manager display data for an employee.
     *
     * @method
     * @param {Employee} employee
     * @returns {{organizationUnitName: string, managerID: string, managerName: string}}
     * @public
     */
    resolveEmployeeOrganizationContext( employee ) {
        const organizationUnitID = String( employee?.personal?.organizationUnitID || "" ).trim();
        const unitNodeID = this.toUnitNodeID( organizationUnitID );
        const managerID = String( this.resolveManagerIDForEmployee( employee ) || "" ).trim();
        const managerNodeID = this.toEmployeeNodeID( managerID );

        let unitName = "";
        let managerName = "";

        if ( this.#organizationChart ) {
            if ( this.#organizationChart.hasNode( unitNodeID ) ) {
                unitName = String( this.#organizationChart.getNodeAttribute( unitNodeID, "name" ) || "" ).trim();
            }
            if ( managerID && this.#organizationChart.hasNode( managerNodeID ) ) {
                managerName = String( this.#organizationChart.getNodeAttribute( managerNodeID, "name" ) || "" ).trim();
            }
        }

        return {
            organizationUnitName: unitName,
            managerID: managerID,
            managerName: managerName
        };
    }

}

const instance = new OrganizationManager();
module.exports.instance = Object.freeze( instance );