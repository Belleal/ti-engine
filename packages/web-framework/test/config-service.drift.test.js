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

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

// POOL is the applicability universe; SETS must stay within it. This mirrors the competence
// role-family-competencies / active-competency-sets pair that motivated the feature.
const POOL = { $id: "https://ti.test/pool.json", type: "object", additionalProperties: { type: "array", items: { type: "string" } } };
const SETS = { $id: "https://ti.test/sets.json", type: "object", additionalProperties: { type: "array", items: { type: "string" } } };

const setsWithinPool = ( value, context ) => context.getConfig( "pool" ).then( ( pool ) => {
    const issues = [];
    for ( const [ family, codes ] of Object.entries( value ) ) {
        const allowed = new Set( ( pool && pool[ family ] ) ? pool[ family ] : [] );
        for ( const code of codes ) {
            if ( !allowed.has( code ) ) issues.push( { path: `.${ family }`, message: `${ code } is outside the pool` } );
        }
    }
    return issues;
} );

let cacheStub;
let store;
let ConfigRegistry;
let ConfigService;
let ConfigChangeNotifier;
let registry;
let service;
let notifier;

before( () => {
    cacheStub = installInMemoryCache();
    store = require( "#config-store" ).instance;
    ConfigRegistry = require( "#config-registry" );
    ConfigService = require( "#config-service" );
    ConfigChangeNotifier = require( "#config-change-notifier" );
} );

beforeEach( () => {
    cacheStub.storage = {};
    registry = new ConfigRegistry();
    // The file defaults — what a new release ships.
    registry.register( "pool", { schema: POOL, defaultValue: { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] }, metadata: { label: "pool", editable: false } } );
    registry.register( "sets", { schema: SETS, validators: [ setsWithinPool ], defaultValue: { SE: [ "A" ], QE: [ "Q1" ] }, metadata: { label: "sets", editable: true } } );
    registry.register( "nodefault", { schema: POOL, metadata: { label: "nodefault" } } );
    notifier = new ConfigChangeNotifier();
    service = new ConfigService( { store: store, registry: registry, notifier: notifier } );
} );

describe( "ConfigService — getDrift / listDrift", () => {

    it( "reports absent for a document that was never seeded", async () => {
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "absent" );
        assert.equal( drift.storedVersion, 0 );
    } );

    it( "reports in-sync when the store matches the file default", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] } );
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "in-sync" );
        assert.equal( drift.storedVersion, 1 );
    } );

    it( "reports drift with entries, metadata and the stored version", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A" ] } );
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "drifted" );
        assert.equal( drift.label, "pool" );
        assert.equal( drift.editable, false );
        assert.equal( drift.storedVersion, 1 );
        const entry = drift.entries.find( ( e ) => e.path === ".QE" );
        assert.equal( entry.addedMembers, 2 );
    } );

    it( "reports no-default for a document registered without one", async () => {
        assert.equal( ( await service.getDrift( "nodefault" ) ).status, "no-default" );
    } );

    it( "rejects an unregistered configKey", async () => {
        // "unknown-config" is a live contract: admin-config-handlers.js maps this exact reason to HTTP 404, so a
        // rename here would silently change the API's status code with nothing failing.
        await assert.rejects(
            () => service.getDrift( "missing" ),
            ( err ) => err.data != null && err.data.reason === "unknown-config"
        );
    } );

    it( "fails closed when the store is unreachable, rather than reporting in-sync", async () => {
        // An unreadable store must never be mistaken for "the deployment matches the build" — that would report
        // everything as up to date at exactly the moment nothing can be verified.
        const brokenStore = { getCurrent: () => Promise.reject( new Error( "cache unavailable" ) ) };
        const brokenService = new ConfigService( { store: brokenStore, registry: registry, notifier: notifier } );
        await assert.rejects( () => brokenService.getDrift( "pool" ), /cache unavailable/ );
        await assert.rejects( () => brokenService.listDrift(), /cache unavailable/ );
    } );

    it( "listDrift covers every registered document and omits entries", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A" ] } );
        const all = await service.listDrift();
        assert.deepEqual( all.map( ( d ) => d.configKey ).sort(), [ "nodefault", "pool", "sets" ] );
        const pool = all.find( ( d ) => d.configKey === "pool" );
        assert.equal( pool.status, "drifted" );
        assert.equal( pool.entries, undefined );
        assert.equal( pool.counts.changed, 1 );
    } );

} );

describe( "ConfigService — driftTracked metadata flag", () => {

    it( "defaults to true when the document does not set it", async () => {
        // "pool" registers metadata without driftTracked.
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.driftTracked, true );
    } );

    it( "is false when the document opts out", async () => {
        registry.register( "customer-data", { schema: POOL, defaultValue: {}, metadata: { label: "org", driftTracked: false } } );
        const drift = await service.getDrift( "customer-data" );
        assert.equal( drift.driftTracked, false );
    } );

    it( "carries the flag through listDrift", async () => {
        registry.register( "customer-data", { schema: POOL, defaultValue: {}, metadata: { label: "org", driftTracked: false } } );
        const listed = await service.listDrift();
        const byKey = Object.fromEntries( listed.map( ( entry ) => [ entry.configKey, entry ] ) );
        assert.equal( byKey[ "pool" ].driftTracked, true );
        assert.equal( byKey[ "customer-data" ].driftTracked, false );
    } );

} );

describe( "ConfigService — applyDefaults", () => {

    it( "commits interdependent documents as one change-set, so cross-document validation sees pending values", async () => {
        // The pre-release state: QE has neither pool codes nor set codes.
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [ "A" ], QE: [] } );

        // Applying "sets" alone must fail — Q1 is not in the stored pool.
        const alone = await service.applyDefaults( [ "sets" ], { adminID: "admin:1" } );
        assert.equal( alone.ok, false );
        assert.ok( alone.errors.sets );

        // Applying both together succeeds, because the validator sees the pending pool.
        const together = await service.applyDefaults( [ "pool", "sets" ], { adminID: "admin:1", note: "release 2.0" } );
        assert.equal( together.ok, true );
        assert.deepEqual( ( await store.getCurrent( "pool" ) ).value, { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] } );
        assert.deepEqual( ( await store.getCurrent( "sets" ) ).value, { SE: [ "A" ], QE: [ "Q1" ] } );
    } );

    it( "publishes a config:changed event naming every applied document", async () => {
        await store.seedIfEmpty( "pool", { SE: [], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [], QE: [] } );
        let event = null;
        notifier.subscribe( ( received ) => { event = received; } );
        await service.applyDefaults( [ "pool", "sets" ], { adminID: "admin:1" } );
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        assert.deepEqual( event.configKeys.sort(), [ "pool", "sets" ] );
    } );

    it( "seeds an absent document, applying at expectedVersion 0", async () => {
        const result = await service.applyDefaults( [ "pool" ], { adminID: "admin:1" } );
        assert.equal( result.ok, true );
        assert.equal( result.versions.pool, 1 );
    } );

    it( "writes nothing when validation fails", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [ "A" ], QE: [] } );
        const result = await service.applyDefaults( [ "sets" ], { adminID: "admin:1" } );
        assert.equal( result.ok, false );
        assert.equal( ( await store.getCurrent( "sets" ) ).version, 1, "the stored document is untouched" );
    } );

    it( "refuses a document with no registered default", async () => {
        // Same contract concern as "unknown-config" above: "no-default" is what admin-config-handlers.js and any
        // future caller key off of, not just an arbitrary rejection.
        await assert.rejects(
            () => service.applyDefaults( [ "nodefault" ], { adminID: "admin:1" } ),
            ( err ) => err.data != null && err.data.reason === "no-default"
        );
    } );

    it( "rejects empty input or a missing adminID", async () => {
        await assert.rejects( () => service.applyDefaults( [], { adminID: "admin:1" } ) );
        await assert.rejects( () => service.applyDefaults( [ "pool" ], {} ) );
    } );

    it( "deduplicates repeated keys rather than failing the change-set", async () => {
        const result = await service.applyDefaults( [ "pool", "pool" ], { adminID: "admin:1" } );
        assert.equal( result.ok, true );
    } );

} );
