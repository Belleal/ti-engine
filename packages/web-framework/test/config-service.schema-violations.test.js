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

/**
 * `listSchemaViolations` answers a question nothing asked before: does what the store already holds still satisfy
 * the schema this build ships?
 *
 * The store validates on the way in and not on the way out, so a release that tightens a schema leaves any
 * deployment seeded before it serving a document that can no longer be saved. FAMILIES below is the shape that
 * motivated this — a document requiring one key per role family and forbidding the rest, where adding a family to
 * the release makes every older store invalid.
 */

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

// Requires exactly these keys and forbids others: the shape of a per-family document after a family is added.
const FAMILIES = {
    $id: "https://ti.test/families.json",
    type: "object",
    required: [ "SE", "QE", "TC" ],
    additionalProperties: false,
    properties: {
        SE: { type: "object" },
        QE: { type: "object" },
        TC: { type: "object" }
    }
};

// A keyed map with no required list — the shape that stays valid however stale it gets.
const DICTIONARY = { $id: "https://ti.test/dictionary.json", type: "object", additionalProperties: { type: "object" } };

const alwaysComplains = () => Promise.resolve( [ { path: ".", message: "a semantic objection" } ] );

let cacheStub;
let store;
let ConfigRegistry;
let ConfigService;
let ConfigChangeNotifier;
let registry;
let service;

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
    registry.register( "families", { schema: FAMILIES, validators: [ alwaysComplains ], defaultValue: { SE: {}, QE: {}, TC: {} }, metadata: { label: "families" } } );
    registry.register( "dictionary", { schema: DICTIONARY, defaultValue: { "E1-1": {} }, metadata: { label: "dictionary" } } );
    service = new ConfigService( { store: store, registry: registry, notifier: new ConfigChangeNotifier() } );
} );

describe( "ConfigService — listSchemaViolations", () => {

    it( "reports nothing when nothing has been stored", async () => {
        // A clean install is not a broken one: a document that was never written is absent, not invalid.
        assert.deepEqual( await service.listSchemaViolations(), [] );
    } );

    it( "reports nothing when every stored document satisfies its schema", async () => {
        await store.seedIfEmpty( "families", { SE: {}, QE: {}, TC: {} } );
        await store.seedIfEmpty( "dictionary", { "E1-1": {} } );
        assert.deepEqual( await service.listSchemaViolations(), [] );
    } );

    it( "names the document and the missing key when the store predates a required one", async () => {
        // The store as a deployment seeded before TC existed would hold it.
        await store.seedIfEmpty( "families", { SE: {}, QE: {} } );
        const violations = await service.listSchemaViolations();
        assert.equal( violations.length, 1 );
        assert.equal( violations[ 0 ].configKey, "families" );
        assert.match( violations[ 0 ].errors[ 0 ].message, /required property 'TC'/ );
    } );

    it( "stays silent about a stale document that is still structurally valid", async () => {
        // The opposite failure mode, and the reason this is not the whole answer: a keyed map missing entries
        // validates perfectly. Drift is what reports that one.
        await store.seedIfEmpty( "families", { SE: {}, QE: {}, TC: {} } );
        await store.seedIfEmpty( "dictionary", {} );
        assert.deepEqual( await service.listSchemaViolations(), [] );
    } );

    it( "ignores the semantic validators", async () => {
        // `families` carries a validator that always objects. Schema-only is the point: a semantic rule may need a
        // context the caller has no reason to build, and several are about an edit rather than the document alone.
        await store.seedIfEmpty( "families", { SE: {}, QE: {}, TC: {} } );
        assert.deepEqual( await service.listSchemaViolations(), [] );
    } );

    it( "writes nothing — reconciling is the drift panel's job, under audit", async () => {
        await store.seedIfEmpty( "families", { SE: {}, QE: {} } );
        const before = await service.getCurrent( "families" );
        await service.listSchemaViolations();
        const after = await service.getCurrent( "families" );
        assert.deepEqual( after.value, before.value );
        assert.equal( after.version, before.version );
    } );

    it( "reports every offending document, not just the first", async () => {
        await store.seedIfEmpty( "families", { SE: {}, QE: {} } );
        await store.seedIfEmpty( "dictionary", [ "not", "an", "object" ] );
        const violations = await service.listSchemaViolations();
        assert.deepEqual( violations.map( ( v ) => v.configKey ).sort(), [ "dictionary", "families" ] );
    } );

} );

describe( "ConfigRegistry — validateSchema", () => {

    it( "returns valid for a conforming value without consulting the semantic validators", () => {
        assert.deepEqual( registry.validateSchema( "families", { SE: {}, QE: {}, TC: {} } ), { valid: true, errors: [] } );
    } );

    it( "reports a path and a message for each schema error", () => {
        const result = registry.validateSchema( "families", { SE: {}, QE: {}, EXTRA: {} } );
        assert.equal( result.valid, false );
        assert.ok( result.errors.length >= 1 );
        assert.ok( result.errors.every( ( issue ) => typeof issue.message === "string" && issue.code === "schema" ) );
    } );

    it( "throws for a document that is not registered", () => {
        assert.throws( () => registry.validateSchema( "nope", {} ) );
    } );

    it( "agrees with validate() on the schema half", async () => {
        // validate() delegates its schema step here, so the two must never disagree about what is admissible.
        const value = { SE: {}, QE: {} };
        const schemaOnly = registry.validateSchema( "families", value );
        const full = await registry.validate( "families", value, {} );
        const schemaIssues = full.errors.filter( ( issue ) => issue.code === "schema" );
        assert.deepEqual( schemaIssues, schemaOnly.errors );
    } );

} );
