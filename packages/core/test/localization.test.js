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

const path = require( "node:path" );
const os = require( "node:os" );
const fs = require( "node:fs" );

// Point the label catalogue at a fixture BEFORE requiring the localization module, which loads its configured
// paths once at module scope. The path is resolved against process.cwd(), so it has to be given relative to it.
const FIXTURE_DIRECTORY = fs.mkdtempSync( path.join( os.tmpdir(), "ti-labels-" ) );
const FIXTURE_FILE = path.join( FIXTURE_DIRECTORY, "labels.json" );
fs.writeFileSync( FIXTURE_FILE, JSON.stringify( {
    interface: {
        greeting: { en: "Hello", bg: "Здравей" },
        blank: { en: "", bg: "" },
        englishOnly: { en: "English only" }
    }
} ) );
process.env.TI_LOCALIZATION_LABELS_PATH = path.relative( process.cwd(), FIXTURE_FILE );

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const localization = require( "../utils/localization.js" );

after( () => fs.rmSync( FIXTURE_DIRECTORY, { recursive: true, force: true } ) );

describe( "localization.getLabel", () => {

    it( "resolves a label in the requested language", () => {
        assert.equal( localization.getLabel( "interface.greeting", "en" ), "Hello" );
        assert.equal( localization.getLabel( "interface.greeting", "bg" ), "Здравей" );
    } );

    it( "returns the visible placeholder for an unknown key when no fallback is given", () => {
        // Unchanged default behaviour: a missing label is loud, not silently blank.
        assert.match( localization.getLabel( "interface.missing", "en" ), /label not found/ );
    } );

    it( "returns the supplied fallback for an unknown key instead of the placeholder", () => {
        // This is what lets a framework-owned screen degrade to readable text inside a consuming application,
        // which loads only its own catalogue — without any caller hard-coding the placeholder string.
        assert.equal( localization.getLabel( "interface.missing", "en", "Account" ), "Account" );
    } );

    it( "applies the fallback per language, not per key", () => {
        // The key exists but the requested language does not — still a miss for this caller.
        assert.equal( localization.getLabel( "interface.englishOnly", "bg", "Резервен" ), "Резервен" );
        assert.equal( localization.getLabel( "interface.englishOnly", "en", "Резервен" ), "English only" );
    } );

    it( "prefers a present label over the fallback, including a deliberately empty one", () => {
        assert.equal( localization.getLabel( "interface.greeting", "en", "unused" ), "Hello" );
        assert.equal( localization.getLabel( "interface.blank", "en", "unused" ), "" );
    } );

    it( "still honours the fallback when the language is omitted and the system language applies", () => {
        assert.equal( localization.getLabel( "interface.greeting" ), "Hello" );
        assert.equal( localization.getLabel( "interface.missing", undefined, "Fallback" ), "Fallback" );
    } );

} );
