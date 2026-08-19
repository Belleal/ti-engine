/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationRules = require( "#organization-rules" );

// A well-formed two-level tree: root "1" (mgr 22) -> "1-1" (mgr 20) -> "1-1-1" (mgr 8).
function validTree() {
    return {
        "1": { id: "1", name: "Root", parent: null, children: [ "1-1" ], managerID: "22" },
        "1-1": { id: "1-1", name: "Engineering", parent: "1", children: [ "1-1-1" ], managerID: "20" },
        "1-1-1": { id: "1-1-1", name: "Platform", parent: "1-1", children: [], managerID: "8" }
    };
}

describe( "organizationRules.findRootUnits", () => {

    it( "finds exactly one root in a well-formed tree", () => {
        assert.deepEqual( organizationRules.instance.findRootUnits( validTree() ), [ "1" ] );
    } );

    it( "finds every root when there is more than one", () => {
        const tree = validTree();
        tree[ "2" ] = { id: "2", parent: null, children: [] };
        assert.deepEqual( organizationRules.instance.findRootUnits( tree ).sort(), [ "1", "2" ] );
    } );

    it( "returns an empty list when no unit is rooted", () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1-1";
        assert.deepEqual( organizationRules.instance.findRootUnits( tree ), [] );
    } );

} );

describe( "organizationRules.findSymmetryBreaks", () => {

    it( "reports nothing for a well-formed tree", () => {
        assert.deepEqual( organizationRules.instance.findSymmetryBreaks( validTree() ), [] );
    } );

    it( "reports a child that names a different parent", () => {
        const tree = validTree();
        tree[ "1-1-1" ].parent = "1";
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1" && b.relatedID === "1-1-1" && b.code === "child-parent-mismatch" ) );
    } );

    it( "reports a children entry naming a unit that does not exist", () => {
        const tree = validTree();
        tree[ "1-1" ].children.push( "ghost" );
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.relatedID === "ghost" && b.code === "missing-child" ) );
    } );

    it( "reports a parent that does not list this unit as a child", () => {
        const tree = validTree();
        tree[ "1-1" ].children = [];
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1-1" && b.relatedID === "1-1" && b.code === "parent-missing-child" ) );
    } );

    it( "reports a parent that does not exist", () => {
        const tree = validTree();
        tree[ "1-1" ].parent = "ghost";
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1" && b.relatedID === "ghost" && b.code === "missing-parent" ) );
    } );

} );

describe( "organizationRules.findCycles", () => {

    it( "reports nothing for an acyclic tree", () => {
        assert.deepEqual( organizationRules.instance.findCycles( validTree() ), [] );
    } );

    it( "detects a cycle and terminates", () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1-1";
        const cycles = organizationRules.instance.findCycles( tree );
        assert.ok( cycles.length > 0 );
    } );

    it( "detects a unit that is its own parent", () => {
        const tree = validTree();
        tree[ "1-1" ].parent = "1-1";
        assert.ok( organizationRules.instance.findCycles( tree ).includes( "1-1" ) );
    } );

} );

describe( "organizationRules.findUnresolvedManagers", () => {

    const EMPLOYEES = [
        { employeeID: "22", employmentStatus: "active" },
        { employeeID: "20", employmentStatus: "active" },
        { employeeID: "8", employmentStatus: "terminated" }
    ];

    it( "reports nothing when every manager resolves and is not terminated", () => {
        const tree = validTree();
        delete tree[ "1-1-1" ].managerID;
        assert.deepEqual( organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES ), [] );
    } );

    it( "reports a managerID naming nobody", () => {
        const tree = validTree();
        tree[ "1-1-1" ].managerID = "999";
        const findings = organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES );
        assert.deepEqual( findings, [ { unitID: "1-1-1", managerID: "999", code: "manager-not-found" } ] );
    } );

    it( "reports a manager who is terminated", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( validTree(), EMPLOYEES );
        assert.deepEqual( findings, [ { unitID: "1-1-1", managerID: "8", code: "manager-terminated" } ] );
    } );

    it( "treats a manager-less unit as legal", () => {
        const tree = { "1": { id: "1", parent: null, children: [] } };
        assert.deepEqual( organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES ), [] );
    } );

    it( "reports every unit against an empty employee list, which is the fresh-install state", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( validTree(), [] );
        assert.equal( findings.length, 3 );
        assert.ok( findings.every( ( f ) => f.code === "manager-not-found" ) );
    } );

} );
