/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const ConfigRegistry = require( "#config-registry" );

const SCHEMA = {
    $id: "https://ti-engine.test/widget.json",
    type: "object",
    properties: { n: { type: "integer" }, ref: { type: "string" } },
    required: [ "n" ],
    additionalProperties: false
};

// Semantic validators: one sync (n must be even), one async + context-aware (ref must be known).
const evenValidator = ( value ) => ( value && typeof value.n === "number" && value.n % 2 !== 0 ) ? [ { path: ".n", message: "n must be even", code: "even" } ] : [];
const refValidator = ( value, context ) => Promise.resolve(
    ( context && Array.isArray( context.knownRefs ) && value.ref && !context.knownRefs.includes( value.ref ) ) ? [ { path: ".ref", message: "unknown ref" } ] : []
);

let registry;
beforeEach( () => {
    registry = new ConfigRegistry();
    registry.register( "widget", { schema: SCHEMA, validators: [ evenValidator, refValidator ], defaultValue: { n: 0 }, metadata: { label: "Widget", group: "test" } } );
} );

describe( "ConfigRegistry — registration", () => {

    it( "tracks registered documents, metadata, and defaults", () => {
        assert.equal( registry.has( "widget" ), true );
        assert.deepEqual( registry.list(), [ "widget" ] );
        assert.deepEqual( registry.metadataFor( "widget" ), { label: "Widget", group: "test" } );
        assert.deepEqual( registry.getDefault( "widget" ), { n: 0 } );
    } );

    it( "rejects an invalid registration", () => {
        assert.throws( () => registry.register( "", { schema: SCHEMA } ) );
        assert.throws( () => registry.register( "x", {} ) );
    } );

} );

describe( "ConfigRegistry — validation pipeline", () => {

    it( "passes a fully valid value", async () => {
        const result = await registry.validate( "widget", { n: 2, ref: "a" }, { knownRefs: [ "a" ] } );
        assert.equal( result.valid, true );
        assert.deepEqual( result.errors, [] );
    } );

    it( "reports JSON-Schema errors with a data path", async () => {
        const result = await registry.validate( "widget", { n: "x" } );
        assert.equal( result.valid, false );
        assert.ok( result.errors.some( ( e ) => e.code === "schema" && e.path === ".n" ), "expected a schema error at .n" );
    } );

    it( "reports additionalProperties violations", async () => {
        const result = await registry.validate( "widget", { n: 2, extra: true } );
        assert.equal( result.valid, false );
        assert.ok( result.errors.some( ( e ) => e.code === "schema" ) );
    } );

    it( "runs semantic validators (sync + async, context-aware)", async () => {
        const odd = await registry.validate( "widget", { n: 3 }, { knownRefs: [] } );
        assert.ok( odd.errors.some( ( e ) => e.code === "even" ) );

        const badRef = await registry.validate( "widget", { n: 2, ref: "zzz" }, { knownRefs: [ "a" ] } );
        assert.ok( badRef.errors.some( ( e ) => e.message === "unknown ref" && e.code === "semantic" ) );
    } );

    it( "aggregates schema and semantic errors together", async () => {
        const result = await registry.validate( "widget", { n: 3, ref: "zzz" }, { knownRefs: [ "a" ] } );
        assert.equal( result.valid, false );
        assert.ok( result.errors.length >= 2, "expected both the 'even' and 'unknown ref' issues" );
    } );

    it( "rejects validating an unregistered document", async () => {
        await assert.rejects( registry.validate( "nope", {} ) );
    } );

} );
