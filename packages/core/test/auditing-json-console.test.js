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
const { describe, it } = require( "node:test" );

// Settings are read from the environment once, when config loads, and frozen after, so they are set before anything
// from core is required. A minimum level of 0 lets DEFAULT and DEBUG entries through to be checked.
process.env.TI_AUDITING_LOG_USES_JSON = "true";
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "true";
process.env.TI_AUDITING_LOG_MIN_LEVEL = "0";

const auditing = require( "#auditing" ).instance;
const logger = require( "#logger" );

// Every severity, with the level a log platform that ignores the numeric `severity` has to be given instead.
const LEVELS = [
    [ "DEFAULT", "debug" ],
    [ "DEBUG", "debug" ],
    [ "INFO", "info" ],
    [ "NOTICE", "info" ],
    [ "WARNING", "warn" ],
    [ "ERROR", "error" ],
    [ "CRITICAL", "error" ],
    [ "ALERT", "error" ],
    [ "EMERGENCY", "error" ]
];

/**
 * Logs one entry and returns what reached each console stream. `auditing.log` swallows anything thrown on the way,
 * so a failure there shows up here as a missing line rather than as an exception.
 */
const capture = ( t, message, severity, data ) => {
    const stdout = [];
    const stderr = [];
    t.mock.method( console, "log", ( line ) => { stdout.push( line ); } );
    t.mock.method( console, "error", ( line ) => { stderr.push( line ); } );
    try {
        auditing.log( message, severity, "main", data );
    } finally {
        t.mock.restoreAll();
    }
    return { stdout, stderr };
};

describe( "console logging in JSON mode", () => {

    for ( const [ severityName, level ] of LEVELS ) {
        it( `gives ${ severityName } the level '${ level }'`, ( t ) => {
            const { stdout, stderr } = capture( t, `a ${ severityName } entry`, logger.logSeverity[ severityName ] );
            const lines = stdout.concat( stderr );

            assert.equal( lines.length, 1 );
            assert.equal( JSON.parse( lines[ 0 ] ).level, level );
        } );
    }

    it( "keeps the numeric severity GCloud reads, and the rest of the entry", ( t ) => {
        const { stderr } = capture( t, "The probe failed.", logger.logSeverity.ERROR, { cause: "fetch failed" } );
        const entry = JSON.parse( stderr[ 0 ] );

        assert.equal( entry.severity, 500 );
        assert.equal( entry.message, "The probe failed." );
        assert.equal( entry.thread, "main" );
        assert.deepEqual( entry.data, { cause: "fetch failed" } );
        assert.equal( typeof entry.timestamp, "number" );
        assert.match( entry._id, /-main-.*-error-/ );
    } );

    it( "still writes warnings and worse to stderr, and everything else to stdout", ( t ) => {
        for ( const [ severityName ] of LEVELS ) {
            const severity = logger.logSeverity[ severityName ];
            const { stdout, stderr } = capture( t, `a ${ severityName } entry`, severity );
            const expected = ( severity >= logger.logSeverity.WARNING ) ? [ 0, 1 ] : [ 1, 0 ];

            assert.deepEqual( [ stdout.length, stderr.length ], expected, severityName );
        }
    } );

    it( "writes an entry as one line, a multi-line stack in its data included", ( t ) => {
        // A platform that records every printed line as an event of its own, as Cloudflare's container logs do, would
        // otherwise split one entry into many: the text format became a dozen `info` events for a single error there.
        const error = new Error( "Something broke." );
        const { stderr } = capture( t, "An entry with a stack.", logger.logSeverity.ERROR, { stack: error.stack } );

        assert.equal( stderr.length, 1 );
        assert.equal( stderr[ 0 ].includes( "\n" ), false );
        assert.equal( JSON.parse( stderr[ 0 ] ).data.stack, error.stack );
    } );

} );
