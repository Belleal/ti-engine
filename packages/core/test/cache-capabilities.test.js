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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const CacheProvider = require( "#cache-provider" );
const cache = require( "@ti-engine/core/cache" );
const { cacheCapability: capability } = require( "#cache-capability" );

/**
 * A backend that declares a fixed capability set and implements nothing else, so the contract can be exercised without
 * a live server.
 */
class StubProvider extends CacheProvider {
    #declared;

    constructor( declared ) {
        super();
        this.#declared = declared;
    }

    get capabilities() {
        return this.#declared;
    }
}

describe( "CacheProvider — the contract", () => {

    it( "cannot be instantiated directly", () => {
        assert.throws( () => new CacheProvider(), ( error ) => error.code === 1001 );
    } );

    it( "can be instantiated through a subclass", () => {
        assert.doesNotThrow( () => new StubProvider( [] ) );
    } );

    it( "rejects a data method the subclass did not implement, rather than failing silently", async () => {
        const provider = new StubProvider( [ capability.SETS ] );
        await assert.rejects( () => provider.getValue( "key" ), ( error ) => error.code === 1002 );
        await assert.rejects( () => provider.setJSON( "key", {} ), ( error ) => error.code === 1002 );
    } );

    it( "names the offending subclass and method when an unimplemented method is called", async () => {
        // The name is what makes the failure actionable - without it the report says only that some abstract method
        // somewhere was called.
        const provider = new StubProvider( [] );
        await provider.hashGetField( "key", "field" ).then(
            () => assert.fail( "expected a rejection" ),
            ( error ) => assert.equal( error.data.name, "StubProvider.hashGetField" )
        );
    } );

    it( "reports a declared capability as present and an undeclared one as absent", () => {
        const provider = new StubProvider( [ capability.SETS, capability.HASH_FIELDS ] );
        assert.equal( provider.hasCapability( capability.SETS ), true );
        assert.equal( provider.hasCapability( capability.HASH_FIELDS ), true );
        assert.equal( provider.hasCapability( capability.JSON_DOCUMENTS ), false );
        assert.equal( provider.hasCapability( capability.ATOMIC_JSON_EDIT ), false );
    } );

} );

describe( "findMissingCapabilities — what gates startup", () => {

    it( "finds nothing missing when the backend provides everything required", () => {
        const missing = cache.findMissingCapabilities(
            [ capability.JSON_DOCUMENTS, capability.HASH_FIELDS ],
            [ capability.JSON_DOCUMENTS, capability.HASH_FIELDS, capability.SETS ]
        );
        assert.deepEqual( missing, [] );
    } );

    it( "finds nothing missing when nothing is required", () => {
        // This is the case that keeps every deployment predating capabilities behaving exactly as it did: the setting
        // defaults to empty, so the reconciliation can never be what stops an instance starting.
        assert.deepEqual( cache.findMissingCapabilities( [], [ capability.SETS ] ), [] );
        assert.deepEqual( cache.findMissingCapabilities( undefined, undefined ), [] );
    } );

    it( "reports a required capability the backend does not provide", () => {
        const missing = cache.findMissingCapabilities(
            [ capability.JSON_DOCUMENTS ],
            [ capability.SETS, capability.HASH_FIELDS ]
        );
        assert.deepEqual( missing, [ capability.JSON_DOCUMENTS ] );
    } );

    it( "separates an atomic JSON edit from plain JSON support", () => {
        // The distinction this whole mechanism exists for: a backend can store and read JSON documents while applying
        // a path edit as a read-modify-write, which loses one of two concurrent writes without raising anything.
        const missing = cache.findMissingCapabilities(
            [ capability.JSON_DOCUMENTS, capability.ATOMIC_JSON_EDIT ],
            [ capability.JSON_DOCUMENTS ]
        );
        assert.deepEqual( missing, [ capability.ATOMIC_JSON_EDIT ] );
    } );

    it( "reports every missing capability, not just the first", () => {
        const missing = cache.findMissingCapabilities(
            [ capability.LISTS, capability.SETS, capability.JSON_DOCUMENTS ],
            [ capability.SETS ]
        );
        assert.deepEqual( missing, [ capability.LISTS, capability.JSON_DOCUMENTS ] );
    } );

    it( "treats an absent capability list from the backend as providing nothing", () => {
        const missing = cache.findMissingCapabilities( [ capability.SETS ], undefined );
        assert.deepEqual( missing, [ capability.SETS ] );
    } );

} );
