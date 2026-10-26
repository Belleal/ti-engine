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
 * A cache backend that cannot list a hash leaves service calls as they were (CA-560).
 *
 * 1.21.0 reads a domain's roster of running instances with `hashGetAll`, which is new in the cache contract. A backend
 * written for the earlier contract - an application's own, or `HttpCacheProvider`, which leaves it abstract - rejects
 * it as an abstract method call. Passed on, that refused every service call. The roster now counts every domain as
 * having a running instance there, which is how every domain counted before 1.21.0.
 */

const assert = require( "node:assert/strict" );
const { after, before, describe, it } = require( "node:test" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

let stub = null;
let consumer = null;
let cache = null;
let exceptions = null;
let serviceRoster = null;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
    process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
    process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";

    cache = require( "#cache" );
    exceptions = require( "#exceptions" );
    serviceRoster = require( "#service-roster" );
    const ServiceConsumer = require( "#service-consumer" );
    class QuietConsumer extends ServiceConsumer {}
    consumer = new QuietConsumer( "roster-without-hash-get-all", { services: [] } );
    await consumer.start();
} );

after( async () => {
    if ( consumer ) {
        await consumer.stop();
    }
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "the roster on a cache backend without hashGetAll", () => {

    it( "is read on a backend that rejects hashGetAll as abstract", async () => {
        await assert.rejects( cache.instance.hashGetAll( "any" ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL );
    } );

    it( "counts the domain as having a running instance, as before 1.21.0", async () => {
        assert.equal( await serviceRoster.isLive( "any-domain" ), true );
        assert.equal( await serviceRoster.isLive( "another-domain" ), true, "only the first answer would have been right" );
    } );

} );
