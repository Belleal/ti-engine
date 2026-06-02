/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let store;
let cacheStub;

before( () => {
    cacheStub = installInMemoryCache();
    store = require( "#config-store" ).instance;
} );

beforeEach( () => {
    cacheStub.storage = {};
} );

describe( "ConfigStore — seeding", () => {

    it( "seeds version 1 from defaults and is idempotent", async () => {
        const seeded = await store.seedIfEmpty( "labels", { a: 1 } );
        assert.equal( seeded.version, 1 );
        assert.equal( seeded.updatedBy, "system:seed" );
        assert.deepEqual( seeded.value, { a: 1 } );

        const again = await store.seedIfEmpty( "labels", { a: 999 } );
        assert.equal( again.version, 1, "second seed must not overwrite" );
        assert.deepEqual( again.value, { a: 1 } );

        const history = await store.listHistory( "labels" );
        assert.equal( history.length, 1 );
        assert.equal( history[ 0 ].version, 1 );
    } );

    it( "getCurrent returns null for an unknown document", async () => {
        assert.equal( await store.getCurrent( "nope" ), null );
    } );

} );

describe( "ConfigStore — saving a change-set", () => {

    it( "bumps version, records history, and writes a change-set record", async () => {
        await store.seedIfEmpty( "labels", { a: 1 } );
        const result = await store.saveChangeSet( [ { configKey: "labels", value: { a: 2 }, expectedVersion: 1 } ], { adminID: "admin:1", note: "tweak" } );

        assert.equal( result.versions.labels, 2 );
        const current = await store.getCurrent( "labels" );
        assert.deepEqual( current.value, { a: 2 } );
        assert.equal( current.version, 2 );
        assert.equal( current.updatedBy, "admin:1" );
        assert.equal( current.changeSetID, result.changeSetID );

        const history = await store.listHistory( "labels" );
        assert.deepEqual( history.map( ( h ) => h.version ), [ 1, 2 ] );
        assert.equal( history[ 1 ].note, "tweak" );

        const record = await store.getChangeSet( result.changeSetID );
        assert.equal( record.adminID, "admin:1" );
        assert.deepEqual( record.documents, [ { configKey: "labels", version: 2 } ] );
    } );

    it( "commits a multi-document edit under one shared change-set id", async () => {
        await store.seedIfEmpty( "dictA", { x: 1 } );
        await store.seedIfEmpty( "dictB", { y: 1 } );
        const result = await store.saveChangeSet( [
            { configKey: "dictA", value: { x: 2 }, expectedVersion: 1 },
            { configKey: "dictB", value: { y: 2 }, expectedVersion: 1 }
        ], { adminID: "admin:1" } );

        assert.deepEqual( result.versions, { dictA: 2, dictB: 2 } );
        const a = await store.getCurrent( "dictA" );
        const b = await store.getCurrent( "dictB" );
        assert.equal( a.changeSetID, b.changeSetID );
        const record = await store.getChangeSet( result.changeSetID );
        assert.equal( record.documents.length, 2 );
    } );

    it( "rejects a stale write (optimistic lock) without partial application", async () => {
        await store.seedIfEmpty( "c", { v: 1 } );
        await assert.rejects(
            store.saveChangeSet( [ { configKey: "c", value: { v: 2 }, expectedVersion: 0 } ], { adminID: "admin:1" } ),
            ( err ) => err.data != null && err.data.reason === "version-conflict"
        );
        const current = await store.getCurrent( "c" );
        assert.equal( current.version, 1, "conflicting save must not change the document" );
        assert.deepEqual( current.value, { v: 1 } );
    } );

    it( "rejects invalid input and duplicate keys in one change-set", async () => {
        await assert.rejects( store.saveChangeSet( [], { adminID: "admin:1" } ) );
        await assert.rejects( store.saveChangeSet( [ { configKey: "x", value: {}, expectedVersion: 0 } ], {} ) );
        await assert.rejects( store.saveChangeSet( [
            { configKey: "dup", value: { n: 1 }, expectedVersion: 0 },
            { configKey: "dup", value: { n: 2 }, expectedVersion: 0 }
        ], { adminID: "admin:1" } ) );
    } );

} );

describe( "ConfigStore — restore", () => {

    it( "restores a prior change-set's snapshot as a new forward version", async () => {
        await store.seedIfEmpty( "labels", { a: 1 } );
        const v2 = await store.saveChangeSet( [ { configKey: "labels", value: { a: 2 }, expectedVersion: 1 } ], { adminID: "admin:1" } );
        await store.saveChangeSet( [ { configKey: "labels", value: { a: 3 }, expectedVersion: 2 } ], { adminID: "admin:1" } );

        const restored = await store.restoreChangeSet( v2.changeSetID, { adminID: "admin:2" } );
        assert.equal( restored.versions.labels, 4 );
        const current = await store.getCurrent( "labels" );
        assert.deepEqual( current.value, { a: 2 }, "restore moves forward to the historic snapshot" );
        assert.equal( current.version, 4 );
        assert.equal( current.updatedBy, "admin:2" );
    } );

    it( "rejects restoring an unknown change-set", async () => {
        await assert.rejects( store.restoreChangeSet( "does-not-exist", { adminID: "admin:1" } ) );
    } );

} );

describe( "ConfigStore — change-set feed", () => {

    it( "lists change-sets most-recent first", async () => {
        await store.seedIfEmpty( "labels", { a: 1 } );
        const first = await store.saveChangeSet( [ { configKey: "labels", value: { a: 2 }, expectedVersion: 1 } ], { adminID: "admin:1", note: "first" } );
        await new Promise( ( resolve ) => setTimeout( resolve, 5 ) ); // ensure distinct ISO timestamps
        const second = await store.saveChangeSet( [ { configKey: "labels", value: { a: 3 }, expectedVersion: 2 } ], { adminID: "admin:1", note: "second" } );

        const feed = await store.listChangeSets();
        assert.equal( feed.length, 2 );
        assert.equal( feed[ 0 ].changeSetID, second.changeSetID );
        assert.equal( feed[ 1 ].changeSetID, first.changeSetID );
    } );

} );
