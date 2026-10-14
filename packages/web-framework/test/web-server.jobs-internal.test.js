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
 * The `internal` trigger (CA-486): with no scheduler outside the process, a timer of its own runs a tick once the
 * instance has started and every 15 minutes after. A real server with no broker (message exchange off, an in-memory
 * cache).
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

describe( "the internal trigger", () => {

    let ran;
    const done = new Promise( ( resolve ) => {
        ran = resolve;
    } );
    let server;

    before( async () => {
        jobScheduler.instance.registerJob( "internal-test", { every: "day", at: "00:00", run: () => ran() } );
        server = new TiWebServer( "ti-jobs-internal", { jobs: { trigger: "internal" } } );
        await server.start();
    } );

    after( () => server.stop() );

    it( "runs the due jobs once the instance has started", async () => {
        let timer;
        const limit = new Promise( ( resolve, reject ) => {
            timer = setTimeout( () => reject( new Error( "the internal trigger did not run the job" ) ), 2000 );
        } );
        await Promise.race( [ done, limit ] );
        clearTimeout( timer );
    } );

    it( "does not serve the jobs route", async () => {
        const response = await fetch( `${ await listeningUrl( server ) }/_ti/jobs/run`, { method: "POST", redirect: "manual" } );
        assert.notEqual( response.status, 204 );
    } );

} );
