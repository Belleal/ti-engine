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
 * Every exception code has a message, in every language core ships.
 *
 * An exception reaches a person as `localization.getLabel( exception.label, <session language> )`, and a missing
 * entry renders as the not-found placeholder instead of a message. Two gaps did exactly that: no code had a
 * Bulgarian message, so every error in a Bulgarian deployment read "!!! label not found !!!" (CA-198), and
 * `E_APP_RESOURCE_ALREADY_EXISTS` (5006, the 409 a conflicting save answers with) had no message in any language
 * since it was added. The catalogue and the code table are separate files, so nothing kept them in step.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "../utils/exceptions.js" );
const labels = require( "../bin/localization/labels.json" );

const LANGUAGES = [ "en", "bg" ];
const CODES = Object.keys( exceptions.exceptionCode ).filter( ( name ) => /^E_/.test( name ) ).map( ( name ) => [ name, exceptions.exceptionCode[ name ] ] );

describe( "exception messages", () => {

    it( "finds the code table", () => {
        // Guards the filter above: an empty table would make every case below pass vacuously.
        assert.ok( CODES.length >= 40, `found ${ CODES.length } codes` );
    } );

    for ( const language of LANGUAGES ) {
        it( `has a '${ language }' message for every code`, () => {
            const missing = CODES.filter( ( [ , code ] ) => {
                const entry = labels.system.exceptions[ String( code ) ];
                return !entry || typeof entry[ language ] !== "string" || entry[ language ].trim() === "";
            } ).map( ( [ name, code ] ) => `${ name } (${ code })` );
            assert.deepEqual( missing, [] );
        } );
    }

    it( "has no message for a code that does not exist", () => {
        const known = new Set( CODES.map( ( [ , code ] ) => String( code ) ) );
        assert.deepEqual( Object.keys( labels.system.exceptions ).filter( ( code ) => !known.has( code ) ), [] );
    } );

} );
