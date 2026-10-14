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
 * The `route` trigger (CA-486): a scheduler outside the process, the Worker's cron on Cloudflare, posts to
 * `/_ti/jobs/run`, and the due jobs run before the answer. It is mounted before the session, because that request can
 * carry no cookie and no CSRF token. A real server with no broker (message exchange off, an in-memory cache).
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );
const jobScheduler = require( "#job-scheduler" );

async function listeningUrl( server ) {
    for ( let attempt = 0; attempt < 200; attempt++ ) {
        if ( server.serverUrl ) {
            return server.serverUrl;
        }
        await new Promise( ( resolve ) => setTimeout( resolve, 10 ) );
    }
    throw new Error( "the server never started listening" );
}

describe( "the route trigger", () => {

    let runs = 0;
    let server;

    before( async () => {
        jobScheduler.instance.registerJob( "route-test", { every: "day", at: "00:00", run: () => {
            runs += 1;
        } } );
        server = new TiWebServer( "ti-jobs-route", { jobs: { trigger: "route", behindWorker: true } } );
        await server.start();
    } );

    after( () => server.stop() );

    it( "runs the due jobs on POST /_ti/jobs/run, without a session or a CSRF token, and answers 204 once they ran", async () => {
        const response = await fetch( `${ await listeningUrl( server ) }/_ti/jobs/run`, { method: "POST", redirect: "manual" } );
        assert.equal( response.status, 204 );
        assert.equal( runs, 1 );
        assert.equal( response.headers.get( "set-cookie" ), null, "the tick touched the session" );
    } );

    it( "runs nothing more on a second tick in the same period", async () => {
        const response = await fetch( `${ server.serverUrl }/_ti/jobs/run`, { method: "POST", redirect: "manual" } );
        assert.equal( response.status, 204 );
        assert.equal( runs, 1 );
    } );

    it( "answers only POST", async () => {
        const response = await fetch( `${ server.serverUrl }/_ti/jobs/run`, { redirect: "manual" } );
        assert.notEqual( response.status, 204 );
    } );

} );
