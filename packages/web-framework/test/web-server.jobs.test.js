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

/*
 * What runs the scheduled jobs (CA-486): the rule that decides the trigger.
 *
 * The `route` trigger answers `POST /_ti/jobs/run` outside sign-in, so a server the internet can reach must never
 * offer it: the server refuses to be constructed with it unless the deployment states it sits behind a Worker that
 * refuses the path. The route and the timer themselves are exercised against real servers in
 * `web-server.jobs-route.test.js` and `web-server.jobs-internal.test.js`, one per file because a process holds one
 * service instance.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );

describe( "TiWebServer.resolveJobsTrigger", () => {

    it( "is internal unless stated", () => {
        assert.deepEqual( TiWebServer.resolveJobsTrigger( undefined ), { trigger: "internal", error: null } );
        assert.deepEqual( TiWebServer.resolveJobsTrigger( {} ), { trigger: "internal", error: null } );
        assert.deepEqual( TiWebServer.resolveJobsTrigger( { trigger: "" } ), { trigger: "internal", error: null } );
    } );

    it( "takes off, and route behind a Worker", () => {
        assert.deepEqual( TiWebServer.resolveJobsTrigger( { trigger: "off" } ), { trigger: "off", error: null } );
        assert.deepEqual( TiWebServer.resolveJobsTrigger( { trigger: "route", behindWorker: true } ), { trigger: "route", error: null } );
    } );

    it( "refuses route without a Worker in front, and a trigger it does not know", () => {
        assert.match( TiWebServer.resolveJobsTrigger( { trigger: "route" } ).error, /TI_WEB_JOBS_BEHIND_WORKER/ );
        assert.match( TiWebServer.resolveJobsTrigger( { trigger: "route", behindWorker: "true" } ).error, /TI_WEB_JOBS_BEHIND_WORKER/, "a string is not a stated true" );
        assert.match( TiWebServer.resolveJobsTrigger( { trigger: "cron" } ).error, /Unknown jobs trigger 'cron'/ );
    } );

    it( "stops the server from being constructed with a refused trigger", () => {
        assert.throws( () => new TiWebServer( "ti-jobs-refused", { jobs: { trigger: "route" } } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
    } );

} );
