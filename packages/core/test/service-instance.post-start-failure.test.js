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

"use strict";

/*
 * A start that fails after onStart has finished rejects start() (CA-560).
 *
 * 1.21.0 put the roster join in front of the health report's scheduling. The first version resolved start() from inside
 * the join's callback, so a throw while scheduling left start() waiting forever, where before it rejected. The
 * scheduling is made to throw here by replacing node-schedule's `scheduleJob`, which the instance looks up at call time.
 */

const assert = require( "node:assert/strict" );
const { after, before, describe, it } = require( "node:test" );
const schedule = require( "node-schedule" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// Far longer than a start against an in-process stub takes, far shorter than the test's own timeout.
const PATIENCE_MS = 3000;

let stub = null;
let consumer = null;
const scheduleJob = schedule.scheduleJob;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
    process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "true";
    process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";

    const ServiceConsumer = require( "#service-consumer" );
    class FailingConsumer extends ServiceConsumer {}
    consumer = new FailingConsumer( "post-start-failure", { services: [] } );
} );

after( async () => {
    schedule.scheduleJob = scheduleJob;
    if ( consumer ) {
        await consumer.stop().catch( () => {} );
    }
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "a start that fails while scheduling the health report", () => {

    it( "rejects start() instead of leaving it waiting", { timeout: 10000 }, async () => {
        schedule.scheduleJob = () => {
            throw new Error( "scheduling failed" );
        };
        const outcome = await Promise.race( [
            consumer.start().then( () => "resolved", ( error ) => error ),
            new Promise( ( resolve ) => setTimeout( () => resolve( "still waiting" ), PATIENCE_MS ) )
        ] );
        assert.notEqual( outcome, "still waiting", `start() had not settled after ${ PATIENCE_MS } ms` );
        assert.notEqual( outcome, "resolved", "start() resolved although scheduling threw" );
        // start() raises what it caught as a TiException, which carries the original error's message.
        assert.match( JSON.stringify( outcome ), /scheduling failed/ );
    } );

} );
