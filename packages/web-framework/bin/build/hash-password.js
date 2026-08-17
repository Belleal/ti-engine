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

/**
 * Generates a password hash for a local-users file entry.
 *
 * Usage: npm run hash-password -w @ti-engine/web-framework
 *
 * The password is read from stdin, never from an argument: an argv value lands in shell history and is visible to
 * every other user on the machine through `ps`. Only the resulting hash is written to stdout — the password itself
 * is never echoed, logged, or written to a file by this tool.
 */

const directory = require( "#local-user-directory" );

let input = "";
process.stdin.setEncoding( "utf8" );
process.stdin.on( "data", ( chunk ) => {
    input += chunk;
} );
process.stdin.on( "end", () => {
    // Strip only the trailing newline a shell or editor adds; a password may legitimately contain spaces.
    const password = input.replace( /\r?\n$/, "" );
    if ( password.length === 0 ) {
        process.stderr.write( "hash-password: no password on stdin\n" );
        process.exit( 1 );
    }
    process.stdout.write( directory.hashPassword( password ) + "\n" );
} );
