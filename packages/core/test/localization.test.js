/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
