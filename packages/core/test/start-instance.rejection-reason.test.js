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
 * What `start-instance` logs about the unhandled rejection that ends a process.
 *
 * The reason was logged as `"reason":{}`. `TiException` keeps everything in private fields, so it has no own
 * properties to serialize, and the handler converted only a plain `Error`. Every exception the framework raises is a
 * `TiException` — a state-service timeout included — so the one log line written as the container went down carried
 * no cause at all (R2H8-1).
 *
 * The process is real: `bin/start-instance.js` runs a service whose start leaves a `TiException` rejection unhandled,
 * with a cache backend that connects to nothing, and the test reads its output.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const { execFile } = require( "node:child_process" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );

function runRejectingInstance( usesJSON ) {
    return new Promise( ( resolve ) => {
        execFile( process.execPath, [ path.join( PACKAGE_ROOT, "bin", "start-instance.js" ) ], {
            cwd: PACKAGE_ROOT,
            timeout: 30000,
            env: Object.assign( {}, process.env, {
                TI_INSTANCE_NAME: "rejection-reason-test",
                TI_INSTANCE_CLASS: path.join( "test", "fixtures", "rejecting-service.js" ),
                TI_MEMORY_CACHE_PROVIDER: path.join( PACKAGE_ROOT, "test", "fixtures", "stub-cache-provider.js" ),
                TI_MESSAGE_EXCHANGE_ENABLED: "false",
                TI_SERVICE_HEALTH_CHECK_ENABLED: "false",
                TI_AUDITING_LOG_MIN_LEVEL: "0",
                TI_AUDITING_LOG_USES_JSON: String( usesJSON )
            } )
        }, ( error, stdout, stderr ) => {
            resolve( { code: error ? error.code : 0, output: `${ stdout }\n${ stderr }` } );
        } );
    } );
}

describe( "start-instance — an unhandled rejection", () => {

    it( "logs the exception's cause in JSON mode, not an empty object", async () => {
        const { code, output } = await runRejectingInstance( true );
        assert.equal( code, 1, "the process still fails fast" );
        const line = output.split( "\n" ).find( ( entry ) => entry.includes( "Unhandled promise rejection" ) );
        assert.ok( line, output );
        const reason = JSON.parse( line ).data.reason;
        assert.equal( reason.code, 5005 );
        assert.equal( reason.data.details, "the cause that used to be lost" );
        assert.match( reason.id, /\S/ );
    } );

    it( "logs the exception's cause in console mode too", async () => {
        const { output } = await runRejectingInstance( false );
        assert.match( output, /the cause that used to be lost/ );
    } );

} );
