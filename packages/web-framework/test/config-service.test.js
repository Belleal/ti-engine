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

const ALPHA = { $id: "https://ti.test/alpha.json", type: "object", properties: { n: { type: "integer" } }, required: [ "n" ], additionalProperties: false };
const BETA = { $id: "https://ti.test/beta.json", type: "object", properties: { aRef: { type: "integer" } }, required: [ "aRef" ], additionalProperties: false };
// Cross-document semantic validator: beta.aRef must equal the (pending or current) alpha.n.
const betaMatchesAlpha = ( value, context ) => context.getConfig( "alpha" ).then( ( a ) => ( a && value.aRef !== a.n ) ? [ { path: ".aRef", message: "aRef must equal alpha.n" } ] : [] );

let cacheStub;
let store;
let ConfigRegistry;
let ConfigService;
let service;

before( () => {
    cacheStub = installInMemoryCache();
    store = require( "#config-store" ).instance;
    ConfigRegistry = require( "#config-registry" );
    ConfigService = require( "#config-service" );
} );

beforeEach( async () => {
    cacheStub.storage = {};
    const registry = new ConfigRegistry();
    registry.register( "alpha", { schema: ALPHA } );
    registry.register( "beta", { schema: BETA, validators: [ betaMatchesAlpha ] } );
    service = new ConfigService( { store: store, registry: registry } );
    service.registerEditor( "combo", {
        documents: [ "alpha", "beta" ],
        compose: ( docs ) => ( { n: docs.alpha ? docs.alpha.n : null, aRef: docs.beta ? docs.beta.aRef : null } ),
        decompose: ( edited ) => ( { alpha: { n: edited.n }, beta: { aRef: edited.aRef } } )
    } );
    await store.seedIfEmpty( "alpha", { n: 5 } );
    await store.seedIfEmpty( "beta", { aRef: 5 } );
} );

describe( "ConfigService — applyEdits (document level)", () => {

    it( "commits a valid multi-document edit as one change-set (cross-doc context sees pending values)", async () => {
        const result = await service.applyEdits( [
            { configKey: "alpha", value: { n: 7 }, expectedVersion: 1 },
            { configKey: "beta", value: { aRef: 7 }, expectedVersion: 1 }
        ], { adminID: "admin:1", note: "bump" } );

        assert.equal( result.ok, true );
        assert.deepEqual( result.versions, { alpha: 2, beta: 2 } );
        assert.deepEqual( ( await store.getCurrent( "alpha" ) ).value, { n: 7 } );
        assert.deepEqual( ( await store.getCurrent( "beta" ) ).value, { aRef: 7 } );
    } );

    it( "blocks a cross-document-invalid edit and writes nothing", async () => {
        const result = await service.applyEdits( [ { configKey: "beta", value: { aRef: 9 }, expectedVersion: 1 } ], { adminID: "admin:1" } );
        assert.equal( result.ok, false );
        assert.ok( result.errors.beta && result.errors.beta.length >= 1 );
        assert.equal( ( await store.getCurrent( "beta" ) ).version, 1, "no write on validation failure" );
        assert.deepEqual( ( await store.getCurrent( "beta" ) ).value, { aRef: 5 } );
    } );

    it( "blocks a schema-invalid edit and writes nothing", async () => {
        const result = await service.applyEdits( [ { configKey: "alpha", value: { n: "x" }, expectedVersion: 1 } ], { adminID: "admin:1" } );
        assert.equal( result.ok, false );
        assert.ok( result.errors.alpha.some( ( e ) => e.code === "schema" ) );
        assert.equal( ( await store.getCurrent( "alpha" ) ).version, 1 );
    } );

    it( "rejects on a version conflict (valid content, stale expectedVersion)", async () => {
        await assert.rejects( service.applyEdits( [ { configKey: "alpha", value: { n: 8 }, expectedVersion: 0 } ], { adminID: "admin:1" } ) );
    } );

} );

describe( "ConfigService — composite editor (entity level)", () => {

    it( "composes a view + current versions from the spanned documents", async () => {
        const view = await service.composeView( "combo" );
        assert.deepEqual( view.rows, { n: 5, aRef: 5 } );
        assert.deepEqual( view.versions, { alpha: 1, beta: 1 } );
    } );

    it( "saves an editor edit by decomposing + routing through applyEdits", async () => {
        const result = await service.saveEditorEdit( "combo", { n: 10, aRef: 10 }, { adminID: "admin:1" }, { alpha: 1, beta: 1 } );
        assert.equal( result.ok, true );
        const view = await service.composeView( "combo" );
        assert.deepEqual( view.rows, { n: 10, aRef: 10 } );
        assert.deepEqual( view.versions, { alpha: 2, beta: 2 } );
    } );

    it( "surfaces cross-document validation errors from an editor edit (no write)", async () => {
        const result = await service.saveEditorEdit( "combo", { n: 5, aRef: 6 }, { adminID: "admin:1" }, { alpha: 1, beta: 1 } );
        assert.equal( result.ok, false );
        assert.ok( result.errors.beta );
        assert.deepEqual( ( await service.composeView( "combo" ) ).rows, { n: 5, aRef: 5 } );
    } );

    it( "rejects invalid editor registration and unknown editors", async () => {
        assert.throws( () => service.registerEditor( "bad", { documents: [], compose: () => ( {} ), decompose: () => ( {} ) } ) );
        await assert.rejects( service.composeView( "nope" ) );
        await assert.rejects( service.saveEditorEdit( "nope", {}, { adminID: "admin:1" } ) );
    } );

} );
