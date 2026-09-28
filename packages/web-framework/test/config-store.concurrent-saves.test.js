/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * Two saves of one document at the same time.
 *
 * `saveChangeSet` checks every edit's `expectedVersion` against the stored version, then writes — but the read and
 * the write are separate store round trips. Two admins saving the same document at the same version both read
 * version N, both passed the check, and both wrote N + 1: one edit was silently lost, the history entry for N + 1 was
 * overwritten with the other admin's content, and restoring "the lost edit" from history brought back the wrong one
 * (competence pre-launch review R1H5-2, CA-192).
 *
 * The in-memory cache answers in microtasks, so starting both saves before awaiting either interleaves them exactly
 * as two requests against a real store would.
 */

const { describe, it, before, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { InMemoryCache, installInMemoryCache } = require( "./helpers/in-memory-cache" );

let store;
let cacheStub;

before( () => {
    cacheStub = installInMemoryCache();
    store = require( "#config-store" ).instance;
} );

beforeEach( () => {
    cacheStub.storage = {};
} );

afterEach( () => {
    // Puts back the prototype's `setJSON` if a test replaced it (see `misbehaveWrites`).
    delete cacheStub.setJSON;
} );

const save = ( configKey, value, expectedVersion, adminID ) => store.saveChangeSet( [ { configKey: configKey, value: value, expectedVersion: expectedVersion } ], { adminID: adminID } );

// Refuses some writes at once and holds others until `release()`, the way a remote store fails one request while
// another is still in flight. `decide( key, value )` answers "refuse", "hold" or nothing; a held write reaches the
// store only when it is released.
const misbehaveWrites = ( decide ) => {
    const held = [];
    const write = ( key, value ) => InMemoryCache.prototype.setJSON.call( cacheStub, key, value );
    cacheStub.setJSON = ( key, value ) => {
        const decision = decide( key, value );
        if ( decision === "refuse" ) {
            return Promise.reject( new Error( "write refused: " + key ) );
        }
        if ( decision === "hold" ) {
            return new Promise( ( resolve ) => held.push( () => resolve( write( key, value ) ) ) );
        }
        return write( key, value );
    };
    return { release: () => held.splice( 0 ).forEach( ( land ) => land() ) };
};

// Every step of a save against the in-memory cache is a microtask, so once this resolves, whatever could run has run.
const nothingLeftToRun = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "ConfigStore — concurrent saves", () => {

    it( "commits one of two saves at the same version and refuses the other as a conflict", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );

        const outcomes = await Promise.allSettled( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "labels", { owner: "bob" }, 1, "admin:bob" )
        ] );

        const committed = outcomes.filter( ( outcome ) => outcome.status === "fulfilled" );
        const refused = outcomes.filter( ( outcome ) => outcome.status === "rejected" );
        assert.equal( committed.length, 1, "both saves were committed at the same version" );
        assert.equal( refused.length, 1 );
        assert.equal( refused[ 0 ].reason.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS );
        assert.equal( refused[ 0 ].reason.data.reason, "version-conflict" );
    } );

    it( "keeps the committed save's content in both the document and its history entry", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );

        const outcomes = await Promise.allSettled( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "labels", { owner: "bob" }, 1, "admin:bob" )
        ] );
        const winner = ( outcomes[ 0 ].status === "fulfilled" ) ? "alice" : "bob";

        const current = await store.getCurrent( "labels" );
        assert.equal( current.version, 2 );
        assert.equal( current.value.owner, winner );
        assert.equal( ( await store.getVersion( "labels", 2 ) ).snapshot.owner, winner );
    } );

    it( "commits saves that follow one another, each against the version the last one left", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );

        const [ first, second ] = await Promise.all( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "labels", { owner: "bob" }, 2, "admin:bob" )
        ] );
        assert.equal( first.versions.labels, 2 );
        assert.equal( second.versions.labels, 3 );
        assert.equal( ( await store.getCurrent( "labels" ) ).value.owner, "bob" );
    } );

    it( "orders a change-set spanning two documents against a save of either one", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );
        await store.seedIfEmpty( "levels", { owner: "seed" } );

        const outcomes = await Promise.allSettled( [
            store.saveChangeSet( [
                { configKey: "labels", value: { owner: "alice" }, expectedVersion: 1 },
                { configKey: "levels", value: { owner: "alice" }, expectedVersion: 1 }
            ], { adminID: "admin:alice" } ),
            save( "levels", { owner: "bob" }, 1, "admin:bob" )
        ] );

        assert.equal( outcomes.filter( ( outcome ) => outcome.status === "fulfilled" ).length, 1 );
        const levels = await store.getCurrent( "levels" );
        assert.equal( levels.version, 2 );
        assert.equal( ( await store.getVersion( "levels", 2 ) ).snapshot.owner, levels.value.owner );
    } );

    it( "does not hold up a save of a different document", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );
        await store.seedIfEmpty( "levels", { owner: "seed" } );

        const [ labels, levels ] = await Promise.all( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "levels", { owner: "bob" }, 1, "admin:bob" )
        ] );
        assert.equal( labels.versions.labels, 2 );
        assert.equal( levels.versions.levels, 2 );
    } );

    it( "keeps serving saves after one fails", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );

        await assert.rejects( save( "labels", { owner: "stale" }, 7, "admin:alice" ) );
        const result = await save( "labels", { owner: "bob" }, 1, "admin:bob" );
        assert.equal( result.versions.labels, 2 );
    } );

} );

/*
 * A save whose writes fail part-way.
 *
 * A save's writes go out together, and its documents are held until the save settles. It used to settle at the first
 * refused write, with another write still in flight: the next save of the document read the version that write was
 * about to replace, passed its check, and was overwritten when the write landed. That is the edit CA-192 stopped
 * losing, lost again on the failure path, and a remote store refuses one request while another is in flight easily
 * enough: a timeout, a dropped connection.
 */
describe( "ConfigStore — a save whose writes fail part-way", () => {

    it( "does not admit the next save while the failed one still has a document write in flight", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );
        const writes = misbehaveWrites( ( key, value ) => {
            if ( key === "ti:config:hist:labels:2" && value.adminID === "admin:alice" ) return "refuse";
            if ( key === "ti:config:cur:labels" && value.updatedBy === "admin:alice" ) return "hold";
        } );

        const outcomes = Promise.allSettled( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "labels", { owner: "bob" }, 1, "admin:bob" )
        ] );
        await nothingLeftToRun();
        writes.release();
        const [ alice, bob ] = await outcomes;

        assert.equal( alice.status, "rejected" );
        assert.equal( bob.status, "rejected", "Bob's save was committed while Alice's document write was in flight, and her write then replaced his" );
        assert.equal( bob.reason.data.reason, "version-conflict" );
    } );

    it( "does not let the failed save's late history entry replace the next save's", async () => {
        await store.seedIfEmpty( "labels", { owner: "seed" } );
        const writes = misbehaveWrites( ( key, value ) => {
            if ( key === "ti:config:cur:labels" && value.updatedBy === "admin:alice" ) return "refuse";
            if ( key === "ti:config:hist:labels:2" && value.adminID === "admin:alice" ) return "hold";
        } );

        const outcomes = Promise.allSettled( [
            save( "labels", { owner: "alice" }, 1, "admin:alice" ),
            save( "labels", { owner: "bob" }, 1, "admin:bob" )
        ] );
        await nothingLeftToRun();
        writes.release();
        const [ alice, bob ] = await outcomes;

        assert.equal( alice.status, "rejected" );
        assert.equal( bob.status, "fulfilled" );
        assert.equal( ( await store.getCurrent( "labels" ) ).value.owner, "bob" );
        assert.equal( ( await store.getVersion( "labels", 2 ) ).snapshot.owner, "bob", "the history entry for the version Bob committed holds Alice's content" );
    } );

    it( "holds a document being seeded until both of its writes have settled", async () => {
        const writes = misbehaveWrites( ( key, value ) => {
            if ( key === "ti:config:hist:labels:1" && value.adminID === "system:seed" ) return "refuse";
            if ( key === "ti:config:cur:labels" && value.updatedBy === "system:seed" ) return "hold";
        } );

        const outcomes = Promise.allSettled( [
            store.seedIfEmpty( "labels", { owner: "seed" } ),
            save( "labels", { owner: "alice" }, 0, "admin:alice" )
        ] );
        await nothingLeftToRun();
        writes.release();
        const [ seeded, alice ] = await outcomes;

        assert.equal( seeded.status, "rejected" );
        assert.equal( alice.status, "rejected", "Alice's save created the document while the seed's write was in flight, and the defaults then replaced it" );
        assert.equal( alice.reason.data.reason, "version-conflict" );
    } );

} );
