/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const configDrift = require( "#config-drift" );

const pathsOf = ( result, kind ) => result.entries.filter( ( e ) => e.kind === kind ).map( ( e ) => e.path ).sort();

describe( "config-drift — statuses", () => {

    it( "reports no-default when the file default is undefined", () => {
        const result = configDrift.diffDocument( undefined, { a: 1 } );
        assert.equal( result.status, "no-default" );
        assert.deepEqual( result.entries, [] );
    } );

    it( "reports absent when the document has never been stored", () => {
        assert.equal( configDrift.diffDocument( { a: 1 }, null ).status, "absent" );
        assert.equal( configDrift.diffDocument( { a: 1 }, undefined ).status, "absent" );
    } );

    it( "reports in-sync for deep-equal values", () => {
        const result = configDrift.diffDocument( { a: { b: [ 1, 2 ] } }, { a: { b: [ 1, 2 ] } } );
        assert.equal( result.status, "in-sync" );
        assert.deepEqual( result.counts, { added: 0, removed: 0, changed: 0 } );
    } );

} );

describe( "config-drift — object traversal", () => {

    it( "reports a key present only in the file default as added", () => {
        const result = configDrift.diffDocument( { a: 1, b: 2 }, { a: 1 } );
        assert.equal( result.status, "drifted" );
        assert.deepEqual( pathsOf( result, "added" ), [ ".b" ] );
    } );

    it( "reports a key present only in the store as removed", () => {
        const result = configDrift.diffDocument( { a: 1 }, { a: 1, b: 2 } );
        assert.deepEqual( pathsOf( result, "removed" ), [ ".b" ] );
    } );

    it( "recurses into nested objects and reports leaf paths", () => {
        const result = configDrift.diffDocument(
            { competencies: { "E1-1": { name: "New" }, "E1-48": { name: "QE" } } },
            { competencies: { "E1-1": { name: "Old" } } }
        );
        assert.deepEqual( pathsOf( result, "added" ), [ ".competencies.E1-48" ] );
        assert.deepEqual( pathsOf( result, "changed" ), [ ".competencies.E1-1.name" ] );
    } );

    it( "renders numeric keys in bracket notation, matching the registry path dialect", () => {
        const result = configDrift.diffDocument( { list: { "0": "a" } }, { list: {} } );
        assert.deepEqual( pathsOf( result, "added" ), [ ".list[0]" ] );
    } );

} );

describe( "config-drift — arrays", () => {

    it( "set-diffs an array of primitives and counts the members", () => {
        const result = configDrift.diffDocument( { QE: [ "A", "B", "C" ] }, { QE: [ "A" ] } );
        const entry = result.entries.find( ( e ) => e.path === ".QE" );
        assert.equal( entry.kind, "changed" );
        assert.equal( entry.addedMembers, 2 );
        assert.equal( entry.removedMembers, 0 );
    } );

    it( "treats a reordered primitive array as in-sync (order is not meaningful for code lists)", () => {
        assert.equal( configDrift.diffDocument( { QE: [ "A", "B" ] }, { QE: [ "B", "A" ] } ).status, "in-sync" );
    } );

    it( "compares an array of objects atomically", () => {
        const result = configDrift.diffDocument( { rows: [ { n: 1 } ] }, { rows: [ { n: 2 } ] } );
        assert.deepEqual( pathsOf( result, "changed" ), [ ".rows" ] );
        assert.equal( result.entries[ 0 ].addedMembers, undefined );
    } );

} );

describe( "config-drift — counts", () => {

    it( "counts each kind", () => {
        const result = configDrift.diffDocument( { a: 1, b: 2, c: 3 }, { a: 9, b: 2, d: 4 } );
        assert.deepEqual( result.counts, { added: 1, removed: 1, changed: 1 } );
    } );

} );
