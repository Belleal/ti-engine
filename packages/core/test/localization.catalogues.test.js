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
 * A framework package's label catalogue laid under the application's (CA-555).
 *
 * An application configures one labels path, its own, so a framework text reached it only if it copied the key into
 * that file. A Bulgarian deployment that had not showed the framework's English fallback: competence's menu button
 * did from web-framework 1.47.0 until it copied the key, and an application with no catalogue at all lost every one.
 */

const path = require( "node:path" );
const os = require( "node:os" );
const fs = require( "node:fs" );

// The application's catalogue, configured before the module loads, as an application configures it.
const FIXTURE_DIRECTORY = fs.mkdtempSync( path.join( os.tmpdir(), "ti-labels-" ) );
const FIXTURE_FILE = path.join( FIXTURE_DIRECTORY, "labels.json" );
fs.writeFileSync( FIXTURE_FILE, JSON.stringify( {
    interface: {
        own: { en: "The application's", bg: "На приложението" },
        shared: { en: "Application wording", bg: "Думите на приложението" }
    }
} ) );
process.env.TI_LOCALIZATION_LABELS_PATH = path.relative( process.cwd(), FIXTURE_FILE );

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const localization = require( "../utils/localization.js" );
const coreLabels = require( "../bin/localization/labels.json" );

after( () => fs.rmSync( FIXTURE_DIRECTORY, { recursive: true, force: true } ) );

describe( "localization.addCatalogue", () => {

    it( "makes a package's texts resolve in an application that never copied them, in every language it carries", () => {
        assert.equal( localization.getLabel( "interface.menu", "bg", null ), null );
        localization.addCatalogue( { interface: { menu: { en: "Menu", bg: "Меню" } } } );
        assert.equal( localization.getLabel( "interface.menu", "en" ), "Menu" );
        assert.equal( localization.getLabel( "interface.menu", "bg" ), "Меню" );
    } );

    it( "keeps the application's own text for a key the package also carries", () => {
        localization.addCatalogue( { interface: { shared: { en: "Package wording", bg: "Думите на пакета" }, extra: { en: "Extra" } } } );
        assert.equal( localization.getLabel( "interface.shared", "bg" ), "Думите на приложението" );
        assert.equal( localization.getLabel( "interface.extra", "en" ), "Extra" );
    } );

    it( "lets a catalogue added later win over one added earlier, and over core's", () => {
        localization.addCatalogue( { interface: { order: { en: "first" } } } );
        localization.addCatalogue( { interface: { order: { en: "second" } } } );
        assert.equal( localization.getLabel( "interface.order", "en" ), "second" );
    } );

    it( "rebuilds a language's tree that was built before the catalogue was added", () => {
        // getAllLabels holds one tree per language; a held tree without the new layer is what a client bundle reads.
        assert.equal( localization.getAllLabels( "bg" ).interface.late, undefined );
        localization.addCatalogue( { interface: { late: { en: "Late", bg: "Късно" } } } );
        assert.equal( localization.getAllLabels( "bg" ).interface.late, "Късно" );
        assert.equal( localization.getAllLabels( "bg" ).interface.own, "На приложението" );
    } );

    it( "keeps core's own catalogue and the caller's object as they were", () => {
        const catalogue = { interface: { untouched: { en: "Untouched" } } };
        localization.addCatalogue( catalogue );
        catalogue.interface.untouched.en = "Changed after";
        assert.equal( localization.getLabel( "interface.untouched", "en" ), "Untouched" );
        assert.equal( Object.isFrozen( catalogue ), false );
        // `require` hands everybody the same JSON object: merged into, it would carry the package's texts for good.
        assert.equal( coreLabels.interface, undefined );
    } );

    it( "still resolves core's own labels", () => {
        assert.equal( localization.getLabel( "system.exceptions.0", "bg" ), coreLabels.system.exceptions[ "0" ].bg );
        assert.equal( localization.getAllLabels( "en" ).system.exceptions[ "0" ], coreLabels.system.exceptions[ "0" ].en );
    } );

    it( "refuses anything but a plain object", () => {
        for ( const value of [ null, undefined, "labels.json", [ { a: 1 } ], 42 ] ) {
            assert.throws( () => localization.addCatalogue( value ), TypeError );
        }
    } );

    it( "keeps the merged catalogue frozen", () => {
        const tree = localization.getAllLabels( "en" );
        assert.ok( Object.isFrozen( tree ) );
        assert.ok( Object.isFrozen( tree.interface ) );
    } );
} );
