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

const { after, before, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// The provider's shape, separately from the consumer's because only one ServiceInstance may exist per process. A
// provider inherits the consumer's onStart and adds a second registration of its own - for incoming requests - which
// crashed the same way.
let stub = null;
let provider = null;
let catalogWrites = null;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";

    const ServiceProvider = require( "#service-provider" );
    const cache = require( "#cache" );

    // The cache singleton is frozen, so the spy goes on its class. Registration writes each service to the catalog
    // with addToSet before binding its handler.
    catalogWrites = mock.method( Object.getPrototypeOf( cache.instance ), "addToSet" );

    // A service whose handler file loads. Without one, registration stops before the catalog and the test below
    // passes either way. The provider resolves the path from the working directory.
    const serviceFile = path.relative( process.cwd(), path.join( __dirname, "fixtures", "stub-service.js" ) );

    class QuietProvider extends ServiceProvider {}
    provider = new QuietProvider( "without-exchange-provider", {
        services: [ { serviceAlias: "echo", serviceFile: serviceFile, serviceVersion: 1 } ]
    } );
} );

after( () => {
    mock.restoreAll();
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "a ServiceProvider with the message exchange disabled", () => {

    it( "starts, through both the consumer's registration and its own", async () => {
        await provider.start();
    } );

    it( "registers none of its configured services", () => {
        // With no exchange it can receive no requests, so a catalog entry would advertise a service nobody can reach.
        assert.equal( catalogWrites.mock.callCount(), 0 );
    } );

    it( "stops", async () => {
        await provider.stop();
    } );

} );
