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

    /**
     * Used to convert an organization unit ID to a node ID.
     *
     * @method
     * @param {string} unitID
     * @returns {`unit:${string}`}
     * @public
     */
    toUnitNodeID = ( unitID ) => {
        return `unit:${ unitID }`;
    }

    /**
     * Used to convert an employee ID to a node ID.
     *
     * @method
     * @param {string} employeeID
     * @returns {`employee:${string}`}
     * @public
     */
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
                    const unitID = unit?.id || rawUnitID;
                    if ( !unitID ) {
                        return;
                    }

                    graph.mergeNode( this.toUnitNodeID( unitID ), {
                        nodeType: "organizationUnit",
                        id: unitID,
                        type: unit.type,
                        name: unit.name || unitID,
                        displayName: unit.displayName,
                        description: unit.description,
                        managerID: unit.managerID,
                        parent: unit.parent
                    } );
                } );

                // Add hierarchy edges (parent -> child).
                Object.entries( configurationLoader.configOrganizationStructure || {} ).forEach( ( [ rawUnitID, unit ] ) => {
                    const unitID = unit?.id || rawUnitID;
                    const parentID = unit?.parent;
                    if ( !unitID || !parentID ) {
                        return;
                    }

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
                    const employeeID = employee?.employeeID;
                    if ( !employeeID ) {
                        return;
                    }

                    const organizationUnitID = employee.personal?.organizationUnitID;
                    const employeeNodeID = this.toEmployeeNodeID( employeeID );
                    graph.mergeNode( employeeNodeID, {
                        nodeType: "employee",
                        id: employeeID,
                        name: employee.personal?.name,
                        careerPath: employee.personal?.careerPath,
                        level: employee.personal?.level,
                        stage: employee.personal?.stage,
                        startingDate: employee.personal?.startingDate,
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
     * @param {string} employeeID
     * @param {string} organizationUnitID
     * @returns {string}
     * @public
     */
    resolveManagerIDForEmployee( employeeID, organizationUnitID ) {
        if ( !employeeID || !organizationUnitID ) {
            return "";
        }

        const unitNodeID = this.toUnitNodeID( organizationUnitID );
        if ( this.#organizationChart && this.#organizationChart.hasNode( unitNodeID ) ) {
            let currentUnitNodeID = unitNodeID;
            const visited = new Set();

            while ( currentUnitNodeID && !visited.has( currentUnitNodeID ) && this.#organizationChart.hasNode( currentUnitNodeID ) ) {
                visited.add( currentUnitNodeID );
                const managerID = this.#organizationChart.getNodeAttribute( currentUnitNodeID, "managerID" );
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
     * @returns {{organizationUnitName: string, managerID: string, managerName: string}|null}
     * @public
     */
    resolveEmployeeOrganizationContext( employee ) {
        const organizationUnitID = employee?.personal?.organizationUnitID;
        if ( !organizationUnitID ) {
            return null;
        }

        const unitNodeID = this.toUnitNodeID( organizationUnitID );
        const managerID = this.resolveManagerIDForEmployee( employee.employeeID, organizationUnitID );
        const managerNodeID = this.toEmployeeNodeID( managerID );

        let unitName = "";
        let managerName = "";

        if ( this.#organizationChart ) {
            if ( this.#organizationChart.hasNode( unitNodeID ) ) {
                unitName = this.#organizationChart.getNodeAttribute( unitNodeID, "name" );
            }
            if ( managerID && this.#organizationChart.hasNode( managerNodeID ) ) {
                managerName = this.#organizationChart.getNodeAttribute( managerNodeID, "name" );
            }
        }

        return {
            organizationUnitName: unitName,
            managerID: managerID,
            managerName: managerName
        };
    }

    /**
     * Resolves the organization unit ID for the specified employee ID.
     *
     * @method
     * @param {string} employeeID
     * @returns {string}
     * @public
     */
    resolveOrganizationUnitIDForEmployee( employeeID ) {
        const employeeNodeID = this.toEmployeeNodeID( employeeID );
        if ( !employeeID || !this.#organizationChart || !this.#organizationChart.hasNode( employeeNodeID ) ) {
            return "";
        }

        return this.#organizationChart.getNodeAttribute( employeeNodeID, "organizationUnitID" );
    }

    /**
     * Resolves the display name for the specified employee ID.
     *
     * @method
     * @param {string} employeeID
     * @returns {string}
     * @public
     */
    resolveEmployeeName( employeeID ) {
        const employeeNodeID = this.toEmployeeNodeID( employeeID );
        if ( !employeeID || !this.#organizationChart || !this.#organizationChart.hasNode( employeeNodeID ) ) {
            return "";
        }

        return this.#organizationChart.getNodeAttribute( employeeNodeID, "name" );
    }

    /**
     * Resolves the parent unit names for the specified unit ID.
     * The resulting array is ordered from top parent to direct parent.
     *
     * @method
     * @param {string} unitID
     * @returns {Array<string>}
     * @public
     */
    resolveParentUnitNames( unitID ) {
        const unitNodeID = this.toUnitNodeID( unitID );
        if ( !unitID || !this.#organizationChart || !this.#organizationChart.hasNode( unitNodeID ) ) {
            return [];
        }

        const parentNames = [];
        const visited = new Set();
        let currentUnitNodeID = unitNodeID;
        while ( this.#organizationChart.hasNode( currentUnitNodeID ) && !visited.has( currentUnitNodeID ) ) {
            visited.add( currentUnitNodeID );
            const parentUnitID = this.#organizationChart.getNodeAttribute( currentUnitNodeID, "parent" );
            if ( !parentUnitID ) {
                break;
            }

            const parentNodeID = this.toUnitNodeID( parentUnitID );
            if ( !this.#organizationChart.hasNode( parentNodeID ) ) {
                break;
            }

            parentNames.unshift( this.#organizationChart.getNodeAttribute( parentNodeID, "name" ) || parentUnitID );
            currentUnitNodeID = parentNodeID;
        }

        return parentNames;
    }

    /**
     * Returns the organization chart subtree for the provided unit ID.
     *
     * @method
     * @param {string} rootUnitID
     * @returns {OrganizationUnit|null}
     * @public
     */
    getOrganizationUnitSubtree( rootUnitID ) {
        const rootNodeID = this.toUnitNodeID( rootUnitID );
        if ( !rootUnitID || !this.#organizationChart || !this.#organizationChart.hasNode( rootNodeID ) ) {
            return null;
        } else {
            return this.#buildUnitTree( rootNodeID );
        }
    }

    /* Private interface */

    /**
     * Used to build the organization chart subtree for the provided unit node ID.
     *
     * @method
     * @param {string} unitNodeID
     * @param {Set} visited
     * @returns {OrganizationUnit|null}
     * @private
     */
    #buildUnitTree( unitNodeID, visited = new Set() ) {
        if ( !unitNodeID || visited.has( unitNodeID ) || !this.#organizationChart.hasNode( unitNodeID ) ) {
            return null;
        }

        const nextVisited = new Set( visited );
        nextVisited.add( unitNodeID );

        const unitAttributes = this.#organizationChart.getNodeAttributes( unitNodeID );
        const childUnitNodeIDs = this.#organizationChart.outNeighbors( unitNodeID ).filter( ( neighborNodeID ) => {
            if ( !this.#organizationChart.hasNode( neighborNodeID ) ) return false;
            if ( this.#organizationChart.getNodeAttribute( neighborNodeID, "nodeType" ) !== "organizationUnit" ) return false;
            const edgeKey = this.#organizationChart.edge( unitNodeID, neighborNodeID );
            return edgeKey && this.#organizationChart.getEdgeAttribute( edgeKey, "relation" ) === "organizationUnitChild";
        } );
        const employeeNodeIDs = this.#organizationChart.outNeighbors( unitNodeID ).filter( ( neighborNodeID ) => {
            if ( !this.#organizationChart.hasNode( neighborNodeID ) ) return false;
            if ( this.#organizationChart.getNodeAttribute( neighborNodeID, "nodeType" ) !== "employee" ) return false;
            const edgeKey = this.#organizationChart.edge( unitNodeID, neighborNodeID );
            return edgeKey && this.#organizationChart.getEdgeAttribute( edgeKey, "relation" ) === "organizationUnitMember";
        } );

        const employees = employeeNodeIDs.map( ( employeeNodeID ) => {
            const employeeAttributes = this.#organizationChart.getNodeAttributes( employeeNodeID );
            return employeeAttributes ? {
                employeeID: employeeAttributes.id,
                name: employeeAttributes.name,
                careerPath: employeeAttributes.careerPath,
                level: employeeAttributes.level,
                stage: employeeAttributes.stage,
                startingDate: employeeAttributes.startingDate,
                organizationUnitID: employeeAttributes.organizationUnitID
            } : null;
        } );
        employees.sort( ( firstEmployee, secondEmployee ) => firstEmployee.name.localeCompare( secondEmployee.name ) );

        const children = childUnitNodeIDs
            .map( ( childNodeID ) => this.#buildUnitTree( childNodeID, nextVisited ) )
            .filter( Boolean )
            .sort( ( firstUnit, secondUnit ) => firstUnit.name.localeCompare( secondUnit.name ) );

        return {
            id: unitAttributes.id,
            type: unitAttributes.type,
            name: unitAttributes.displayName || unitAttributes.name,
            description: unitAttributes.description,
            managerID: unitAttributes.managerID,
            parent: unitAttributes.parent,
            employees: employees,
            children: children
        };
    }

}

const instance = new OrganizationManager();
module.exports.instance = Object.freeze( instance );