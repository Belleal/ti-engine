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

const assert = require( "node:assert/strict" );
const { after, before, describe, it } = require( "node:test" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// Only one ServiceInstance may exist per process, so the switch gets a file of its own. The heartbeat is scheduled on
// a one-second cron, so a second and a bit with the instance running is long enough for one to have been written.
const HEARTBEAT_WINDOW_MS = 1300;

let stub = null;
let consumer = null;
let config = null;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
    process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";

    config = require( "#config" );
    const ServiceConsumer = require( "#service-consumer" );

    class QuietConsumer extends ServiceConsumer {}
    consumer = new QuietConsumer( "health-check-off", { services: [] } );
} );

after( () => {
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

const heartbeatWrites = () => stub.requestLog.filter( ( entry ) => entry.path === "/v1/values/set" && String( entry.payload.key ).includes( ":health:" ) );

describe( "the health heartbeat, switched off from the environment", () => {

    it( "reads TI_SERVICE_HEALTH_CHECK_ENABLED", () => {
        // Before this, the switch lived only in core's own settings file, which no application can override.
        assert.equal( config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ENABLED, true ), false );
    } );

    it( "writes no heartbeat while the instance runs", async () => {
        await consumer.start();
        await new Promise( ( resolve ) => setTimeout( resolve, HEARTBEAT_WINDOW_MS ) );
        await consumer.stop();

        assert.deepEqual( heartbeatWrites(), [] );
    } );

} );
