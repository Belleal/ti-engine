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
const cache = require( "@ti-engine/core/cache" );

let dataManager;

before( () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
} );

beforeEach( () => {
    installInMemoryCache();
} );

describe( "DataManager — results-snapshots cache key", () => {

    it( "initialize() seeds the results-snapshots key as an empty object", async () => {
        delete process.env.COMPETENCE_PRELOAD_DATA;
        await dataManager.instance.initialize();
        const raw = await cache.instance.getJSON( "ti:competence:data:results-snapshots", "$" );
        assert.deepEqual( raw, [ {} ] );
    } );

} );

describe( "DataManager — results-snapshots accessors", () => {

    beforeEach( async () => {
        delete process.env.COMPETENCE_PRELOAD_DATA;
        await dataManager.instance.initialize();
    } );

    it( "saveResultsSnapshot persists and getResultsSnapshot returns it by cycleID", async () => {
        const snap = { cycleID: "2026-H2", schemaVersion: 1, chronoKey: 4053 };
        await dataManager.instance.saveResultsSnapshot( snap );
        const got = await dataManager.instance.getResultsSnapshot( "2026-H2" );
        assert.deepEqual( got, snap );
    } );

    it( "getResultsSnapshot returns null for an unknown cycleID", async () => {
        const got = await dataManager.instance.getResultsSnapshot( "1999-H1" );
        assert.equal( got, null );
    } );

    it( "saveResultsSnapshot rejects a snapshot without a cycleID", async () => {
        await assert.rejects( () => dataManager.instance.saveResultsSnapshot( { schemaVersion: 1 } ) );
    } );

    it( "getAllResultsSnapshots returns every snapshot sorted by chronoKey ascending", async () => {
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2027-H1", chronoKey: 4054 } );
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2026-H1", chronoKey: 4052 } );
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2026-H2", chronoKey: 4053 } );
        const all = await dataManager.instance.getAllResultsSnapshots();
        assert.deepEqual( all.map( ( s ) => s.cycleID ), [ "2026-H1", "2026-H2", "2027-H1" ] );
    } );

    it( "getAllResultsSnapshots returns [] when nothing is stored", async () => {
        const all = await dataManager.instance.getAllResultsSnapshots();
        assert.deepEqual( all, [] );
    } );

} );
