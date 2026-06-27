/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const roleResolver = require( "#role-resolver" );
const configurationLoader = require( "#configuration-loader" );

const EMPLOYEE = configurationLoader.roleCode.EMPLOYEE;
const MANAGER = configurationLoader.roleCode.MANAGER;
const SUPERVISOR = configurationLoader.roleCode.SUPERVISOR;

describe( "RoleResolver.subManagerDepth", () => {
    it( "returns 0 for a leaf unit (no children)", () => {
        assert.equal( roleResolver.instance.subManagerDepth( { id: "u", children: [] } ), 0 );
    } );

    it( "returns 1 when children have managers but no deeper managers (the seeded Engineering case)", () => {
        const engineering = { id: "1-1", managerID: "20", children: [
            { id: "1-1-1", managerID: "8", children: [] },
            { id: "1-1-2", managerID: "11", children: [] }
        ] };
        assert.equal( roleResolver.instance.subManagerDepth( engineering ), 1 );
    } );

    it( "returns 2 when a manager-led unit has a manager-led child (qualifying)", () => {
        const tree = { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [
                { id: "c", managerID: "C", children: [] }
            ] }
        ] };
        assert.equal( roleResolver.instance.subManagerDepth( tree ), 2 );
    } );

    it( "treats manager-less intermediate units as transparent", () => {
        const tree = { id: "a", managerID: "A", children: [
            { id: "b", children: [
                { id: "c", managerID: "C", children: [
                    { id: "d", managerID: "D", children: [] }
                ] }
            ] }
        ] };
        assert.equal( roleResolver.instance.subManagerDepth( tree ), 2 );
    } );
} );

describe( "RoleResolver.isAutoSupervisor", () => {
    it( "is true for the top manager regardless of subtree", () => {
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: true, reportsToTopManager: false, managedSubtrees: [] } ), true );
    } );

    it( "is false for a direct report whose subtree is only 1 management level deep", () => {
        const managed = [ { id: "1-1", managerID: "20", children: [
            { id: "1-1-1", managerID: "8", children: [] },
            { id: "1-1-2", managerID: "11", children: [] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: true, managedSubtrees: managed } ), false );
    } );

    it( "is true for a direct report with a >=2-level-deep subtree", () => {
        const managed = [ { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [ { id: "c", managerID: "C", children: [] } ] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: true, managedSubtrees: managed } ), true );
    } );

    it( "is false when deep enough but NOT a direct report of the top manager", () => {
        const managed = [ { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [ { id: "c", managerID: "C", children: [] } ] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: false, managedSubtrees: managed } ), false );
    } );
} );

describe( "RoleResolver.resolveRoles", () => {
    it( "always includes EMPLOYEE", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( {} ), [ EMPLOYEE ] );
    } );

    it( "adds MANAGER when isUnitManager", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { isUnitManager: true } ), [ EMPLOYEE, MANAGER ] );
    } );

    it( "adds SUPERVISOR via auto status", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { isUnitManager: true, isAutoSupervisor: true } ), [ EMPLOYEE, MANAGER, SUPERVISOR ] );
    } );

    it( "adds SUPERVISOR via a manual grant without management", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { hasSupervisorGrant: true } ), [ EMPLOYEE, SUPERVISOR ] );
    } );
} );

describe( "RoleResolver guards", () => {
    it( "subManagerDepth returns 0 for null", () => {
        assert.equal( roleResolver.instance.subManagerDepth( null ), 0 );
    } );

    it( "subManagerDepth returns 0 for undefined", () => {
        assert.equal( roleResolver.instance.subManagerDepth( undefined ), 0 );
    } );

    it( "subManagerDepth returns 0 when children is missing", () => {
        assert.equal( roleResolver.instance.subManagerDepth( { id: "x" } ), 0 );
    } );

    it( "isAutoSupervisor returns false for null", () => {
        assert.equal( roleResolver.instance.isAutoSupervisor( null ), false );
    } );

    it( "isAutoSupervisor returns false when managedSubtrees is not an array", () => {
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: true, managedSubtrees: undefined } ), false );
    } );

    it( "resolveRoles yields EMPLOYEE-only for null ctx", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( null ), [ EMPLOYEE ] );
    } );
} );
