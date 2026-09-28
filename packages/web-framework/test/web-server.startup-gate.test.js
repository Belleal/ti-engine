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
 * No request is served before the instance has finished starting.
 *
 * `TiWebServer#onStart` listens as its last step, and an application extends it the documented way —
 * `super.onStart().then( () => <its own initialization> )` — so the port was open, and requests were being served,
 * for as long as the application's own initialization took. competence builds its org chart there; a request in
 * that window found no chart, `verifySession` reported the signed-in user as unknown, and the framework destroyed
 * the session. On a host that sleeps an idle container and wakes it on the next request, that window is exactly
 * where the waking request lands — so the first person of the day was signed out on their first click (CA-187).
 *
 * This starts a real server with no broker (message exchange off, an in-memory cache) and an application whose
 * initialization finishes only when the test says so.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );

// An application that extends `onStart` the documented way, and finishes its own initialization on the test's word.
class SlowStartingServer extends TiWebServer {

    constructor() {
        super( "ti-startup-gate-test", {} );
        this.applicationReady = new Promise( ( resolve ) => {
            this.finishInitializing = resolve;
        } );
    }

    onStart() {
        return super.onStart().then( () => this.applicationReady );
    }

}

async function listeningUrl( server ) {
    for ( let attempt = 0; attempt < 200; attempt++ ) {
        if ( server.serverUrl ) {
            return server.serverUrl;
        }
        await new Promise( ( resolve ) => setTimeout( resolve, 10 ) );
    }
    throw new Error( "the server never started listening" );
}

describe( "a request that arrives while the instance is still starting", () => {

    const server = new SlowStartingServer();
    const started = server.start();

    after( () => server.stop() );

    it( "is held until the application has finished initializing, then served", async () => {
        const url = await listeningUrl( server );

        let answered = false;
        const held = fetch( `${ url }/me`, { redirect: "manual" } ).then( ( response ) => {
            answered = true;
            return response;
        } );

        // Long enough for any response the server was going to give on its own.
        await new Promise( ( resolve ) => setTimeout( resolve, 300 ) );
        assert.equal( answered, false, "the request was served before the application had initialized" );

        // The liveness probe answers throughout: a host probing it must not take a slow start for a hung process.
        const health = await fetch( `${ url }/health` );
        assert.equal( health.status, 200 );
        assert.equal( answered, false );

        server.finishInitializing();
        await started;
        const response = await held;
        assert.equal( answered, true );
        // Admitted and handled like any anonymous request, rather than merely not refused: a failure further down
        // the stack would not be a 503 either.
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), "/" );
    } );

    it( "is served at once after that", async () => {
        const response = await fetch( `${ server.serverUrl }/me`, { redirect: "manual" } );
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), "/" );
    } );

} );
