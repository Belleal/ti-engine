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

// These two must be set before anything pulls in the configuration: it reads the environment once, at require time,
// and the cache singleton builds its backend when its own module is first required. Requiring in a different order
// would silently test the Redis backend instead.
const path = require( "path" );

process.env.TI_MEMORY_CACHE_PROVIDER = path.resolve( __dirname, "fixtures", "stub-cache-provider.js" );
process.env.TI_MEMORY_CACHE_REQUIRED_CAPABILITIES = "json-documents,atomic-json-edit";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const StubCacheProvider = require( "./fixtures/stub-cache-provider.js" );
const cache = require( "@ti-engine/core/cache" );
const { cacheCapability } = require( "#cache-capability" );

describe( "cache backend selection", () => {

    it( "constructs the backend named by configuration rather than the built-in Redis one", () => {
        // The singleton built its backend when the module above was required. One construction is the evidence that
        // 'memoryCache.provider' was honoured - with the default it would have been a RedisCacheProvider and this
        // counter would still be zero.
        assert.equal( StubCacheProvider.constructions, 1 );
    } );

    it( "reports the configured backend's capabilities through the cache", () => {
        StubCacheProvider.declaredCapabilities = [ cacheCapability.SETS ];
        assert.deepEqual( cache.instance.capabilities, [ cacheCapability.SETS ] );
    } );

} );

describe( "startup reconciliation — what a refused start leaves behind", () => {

    // These run in order on the one singleton, and the order is deliberate: the refusal is exercised first, from a
    // cache that has never started, and the success afterwards.

    it( "refuses to start when the backend lacks a required capability", async () => {
        StubCacheProvider.declaredCapabilities = [ cacheCapability.JSON_DOCUMENTS ];

        await assert.rejects( () => cache.instance.initialize(), ( error ) => error.code === 1006 );
    } );

    it( "leaves the cache non-operational and the backend shut down after refusing", async () => {
        // The regression that matters. The stub notifies its observers from inside initialize(), before resolving,
        // exactly as the Redis client does — so the cache IS operational at the moment reconciliation fails. Without
        // the rollback the singleton would sit here reporting a usable cache over a live connection, while whoever
        // called it has been told that startup failed.
        StubCacheProvider.declaredCapabilities = [ cacheCapability.JSON_DOCUMENTS ];
        const before = StubCacheProvider.shutDownCalls;

        await cache.instance.initialize().then(
            () => assert.fail( "expected the reconciliation to refuse" ),
            () => undefined
        );

        assert.equal( cache.instance.isOperational, false, "a refused start must not leave an operational cache" );
        assert.equal( StubCacheProvider.shutDownCalls, before + 1, "a refused start must close the backend" );
    } );

    it( "names the missing capability, not just that something was missing", async () => {
        StubCacheProvider.declaredCapabilities = [ cacheCapability.JSON_DOCUMENTS ];

        await cache.instance.initialize().then(
            () => assert.fail( "expected the reconciliation to refuse" ),
            ( error ) => assert.match( error.data.details, /atomic-json-edit/ )
        );
    } );

    it( "starts and stays operational once the backend provides everything required", async () => {
        StubCacheProvider.declaredCapabilities = [ cacheCapability.JSON_DOCUMENTS, cacheCapability.ATOMIC_JSON_EDIT ];
        const before = StubCacheProvider.shutDownCalls;

        await cache.instance.initialize();

        assert.equal( cache.instance.isOperational, true );
        assert.equal( StubCacheProvider.shutDownCalls, before, "a successful start must not close the backend" );
    } );

} );
