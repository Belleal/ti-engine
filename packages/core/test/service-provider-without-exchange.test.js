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

const { after, before, describe, it } = require( "node:test" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// The provider's shape, separately from the consumer's because only one ServiceInstance may exist per process. A
// provider inherits the consumer's onStart and adds a second registration of its own - for incoming requests - which
// crashed the same way.
let stub = null;
let provider = null;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";

    const ServiceProvider = require( "#service-provider" );

    class QuietProvider extends ServiceProvider {}
    provider = new QuietProvider( "without-exchange-provider", { services: [] } );
} );

after( () => {
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "a ServiceProvider with the message exchange disabled", () => {

    it( "starts, through both the consumer's registration and its own", async () => {
        await provider.start();
    } );

    it( "stops", async () => {
        await provider.stop();
    } );

} );
