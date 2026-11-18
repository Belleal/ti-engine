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
 * Traces one message in a process of its own and prints what happened, as one line of JSON: whether the tracer's
 * initialize refused, and which writes it asked the cache for. The settings are read once, at require time, so each
 * combination of environment variables needs a process; message-tracer.settings.test.js runs one per case, with
 * `--report`. Without it - as `node --test` runs every file under test/, fixtures included - it does nothing.
 */

if ( !process.argv.includes( "--report" ) ) {
    return;
}

const path = require( "node:path" );

process.env.TI_MEMORY_CACHE_PROVIDER = path.resolve( __dirname, "recording-cache-provider.js" );
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";

const RecordingCacheProvider = require( "./recording-cache-provider.js" );
const cache = require( "@ti-engine/core/cache" );
const messageTracer = require( "#message-tracer" );

cache.instance.initialize().then( () => {
    return messageTracer.instance.initialize();
} ).then( () => {
    return null;
} ).catch( ( error ) => {
    return { code: error.code, details: error.data && error.data.details };
} ).then( ( refusal ) => {
    messageTracer.instance.recordTraceEntry( {
        chainID: "chain-1",
        destination: { route: "elsewhere" },
        messageID: "message-1",
        source: { instanceID: "ti-instance-1", route: "here" }
    }, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PENDING );
    process.stdout.write( JSON.stringify( {
        refusal: refusal,
        writes: RecordingCacheProvider.writes.map( ( write ) => ( { method: write.method, key: write.args[ 0 ], expiration: write.args[ 2 ] } ) )
    } ) + "\n" );
} );
