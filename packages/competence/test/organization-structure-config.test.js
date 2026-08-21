/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

function validTree() {
    return {
        "1": { id: "1", name: "Root", type: "Organization", parent: null, children: [ "1-1" ], managerID: "22" },
        "1-1": { id: "1-1", name: "Engineering", type: "Department", parent: "1", children: [], managerID: "20" }
    };
}

// The validators take (value, context); none of the organization validators reads a sibling document, so an empty
// context is sufficient.
const CONTEXT = { getConfig: () => Promise.resolve( null ), getStoredConfig: () => Promise.resolve( null ) };

describe( "organization structure semantic validators", () => {

    it( "accepts a well-formed tree", async () => {
        assert.deepEqual( await validators.organizationSingleRoot( validTree(), CONTEXT ), [] );
        assert.deepEqual( await validators.organizationParentChildSymmetry( validTree(), CONTEXT ), [] );
        assert.deepEqual( await validators.organizationNoCycles( validTree(), CONTEXT ), [] );
    } );

    it( "rejects a tree with two roots", async () => {
        const tree = validTree();
        tree[ "2" ] = { id: "2", name: "Other", type: "Organization", parent: null, children: [] };
        const issues = await validators.organizationSingleRoot( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "single-root" );
    } );

    it( "rejects a tree with no root", async () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1";
        const issues = await validators.organizationSingleRoot( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "single-root" );
    } );

    it( "rejects broken parent/child symmetry", async () => {
        const tree = validTree();
        tree[ "1" ].children = [];
        const issues = await validators.organizationParentChildSymmetry( tree, CONTEXT );
        assert.ok( issues.length > 0 );
        assert.ok( issues.every( ( issue ) => issue.code === "symmetry" ) );
    } );

    it( "rejects a cycle", async () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1";
        tree[ "1-1" ].children = [ "1" ];
        const issues = await validators.organizationNoCycles( tree, CONTEXT );
        assert.ok( issues.length > 0 );
        assert.equal( issues[ 0 ].code, "cycle" );
    } );

    it( "accepts a tree whose every unit id equals its map key", async () => {
        assert.deepEqual( await validators.organizationIdMatchesKey( validTree(), CONTEXT ), [] );
    } );

    it( "rejects a unit whose id disagrees with its map key", async () => {
        const tree = validTree();
        tree[ "1-1" ].id = "1-2";
        const issues = await validators.organizationIdMatchesKey( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "id-key-mismatch" );
        assert.equal( issues[ 0 ].path, ".1-1" );
    } );

    it( "rejects a unit with no id at all", async () => {
        const tree = validTree();
        delete tree[ "1-1" ].id;
        const issues = await validators.organizationIdMatchesKey( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "id-key-mismatch" );
    } );

    it( "does not reject a dangling managerID — that is a diagnostic, not a gate", async () => {
        const tree = validTree();
        tree[ "1" ].managerID = "does-not-exist";
        assert.deepEqual( await validators.organizationSingleRoot( tree, CONTEXT ), [] );
        assert.deepEqual( await validators.organizationParentChildSymmetry( tree, CONTEXT ), [] );
        assert.deepEqual( await validators.organizationNoCycles( tree, CONTEXT ), [] );
    } );

} );
