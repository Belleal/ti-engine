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

describe( "organizationSafeUnitIDs", () => {

    // The editors no longer corrupt a document when a unit is keyed `__proto__`, but the key would still reach the
    // store and force every later `units[ id ]` lookup against a plain object to be defensive about it. Refusing it
    // once here is the same trade as the UNSAFE_PATH_SEGMENTS guard on employee field paths (CA-91).

    const unit = ( id ) => ( { id: id, name: id, type: "Unit", parent: null, children: [] } );

    // Object.fromEntries, not an object literal: `{ "__proto__": x }` assigns the prototype and creates no key at
    // all, so a literal fixture would test nothing. fromEntries defines the property, which is what JSON.parse also
    // does when a stored document comes back from Redis — the shape this validator actually meets.
    const documentOf = ( ...ids ) => Object.fromEntries( ids.map( ( id ) => [ id, unit( id ) ] ) );

    it( "accepts ordinary unit identifiers", async () => {
        assert.deepEqual( await validators.organizationSafeUnitIDs( documentOf( "ROOT", "ENG" ) ), [] );
    } );

    it( "refuses a unit keyed __proto__", async () => {
        const issues = await validators.organizationSafeUnitIDs( documentOf( "__proto__" ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "unsafe-key" );
        assert.match( issues[ 0 ].message, /__proto__/ );
    } );

    it( "refuses constructor and prototype too", async () => {
        const issues = await validators.organizationSafeUnitIDs( documentOf( "constructor", "prototype" ) );
        assert.deepEqual( issues.map( ( issue ) => issue.path ).sort(), [ ".constructor", ".prototype" ] );
    } );

    it( "reports only the offending key when safe ones sit beside it", async () => {
        const issues = await validators.organizationSafeUnitIDs( documentOf( "ROOT", "__proto__" ) );
        assert.deepEqual( issues.map( ( issue ) => issue.path ), [ ".__proto__" ] );
    } );

    it( "tolerates an absent document", async () => {
        assert.deepEqual( await validators.organizationSafeUnitIDs( undefined ), [] );
    } );

} );
