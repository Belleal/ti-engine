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
 * The framework's texts reach an application that never copied them (CA-555).
 *
 * An application configures one labels path, its own, and web-framework's catalogue was never loaded unless the
 * application listed it. So a framework fragment's `x-text-label` keys and the texts the server reads (the user menu,
 * the notices, the sign-in link's e-mail) showed their English fallback in a Bulgarian deployment, key by key, unless
 * the application had copied each one. An application with no catalogue of its own lost every one of them, and its
 * `email-link` method was dropped at start for want of the notice's texts.
 *
 * Nothing here stubs `getLabel`: the suites read the real catalogue through core, as an application does.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );

// A Bulgarian deployment whose own catalogue carries one key of its own and one of the framework's, worded its way.
// Core reads both once, when its configuration loads, so they are set before anything is required.
const FIXTURE_DIRECTORY = fs.mkdtempSync( path.join( os.tmpdir(), "ti-framework-labels-" ) );
const FIXTURE_FILE = path.join( FIXTURE_DIRECTORY, "labels.json" );
const APPLICATION_MENU = { en: "Our profile", bg: "Нашият профил" };
fs.writeFileSync( FIXTURE_FILE, JSON.stringify( {
    interface: {
        application: { own: { en: "Own", bg: "Собствен" } },
        "user-menu": { profile: APPLICATION_MENU }
    }
} ) );
process.env.TI_LOCALIZATION_LANGUAGE = "bg";
process.env.TI_LOCALIZATION_LABELS_PATH = path.relative( process.cwd(), FIXTURE_FILE );

const { after, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const localization = require( "@ti-engine/core/localization" );
const TiWebAppManager = require( "#web-app-manager" );

const PACKAGE_ROOT = path.join( __dirname, ".." );
const CATALOGUE = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "localization", "web-server-labels.json" ), "utf8" ) );

after( () => fs.rmSync( FIXTURE_DIRECTORY, { recursive: true, force: true } ) );

// Every leaf of a catalogue as [ key, { language: text } ].
function leaves( tree, prefix = "" ) {
    return Object.entries( tree ).flatMap( ( [ name, value ] ) => {
        const key = prefix + name;
        const values = Object.values( value );
        return ( values.length > 0 && values.every( ( text ) => typeof text === "string" ) ) ? [ [ key, value ] ] : leaves( value, key + "." );
    } );
}

class Harness extends TiWebAppManager {
    constructor() {
        super( "framework-labels-test" );
    }
}

describe( "the framework's catalogue under the application's", () => {

    it( "resolves every framework key in every language the framework carries", () => {
        const all = leaves( CATALOGUE );
        assert.ok( all.length > 100, "the sweep read the catalogue" );
        for ( const [ key, texts ] of all ) {
            if ( key === "interface.user-menu.profile" ) {
                continue;
            }
            for ( const [ language, text ] of Object.entries( texts ) ) {
                assert.equal( localization.getLabel( key, language, null ), text, `${ key } in ${ language }` );
            }
        }
    } );

    it( "keeps the application's own wording for a framework key, and the application's own keys", () => {
        assert.equal( localization.getLabel( "interface.user-menu.profile", "bg" ), APPLICATION_MENU.bg );
        assert.equal( localization.getLabel( "interface.user-menu.profile", "en" ), APPLICATION_MENU.en );
        assert.equal( localization.getLabel( "interface.application.own", "bg" ), "Собствен" );
    } );

    it( "has the sign-in link's notice in the deployment's language, which the email-link method needs to start", () => {
        const system = localization.getSystemLanguage();
        assert.equal( system, "bg" );
        for ( const key of [ "interface.notice.sign-in-link.subject", "interface.notice.sign-in-link.text" ] ) {
            assert.equal( typeof localization.getLabel( key, system, null ), "string", key );
        }
    } );

    it( "puts the framework's texts in the browser's bundle, the application's wording winning, under a hash that covers both", () => {
        const manager = new Harness();
        const bundle = manager.getLabelsBundle( "bg" );
        const tree = JSON.parse( bundle.body );
        assert.equal( tree.interface[ "navigation-toggle" ].label, CATALOGUE.interface[ "navigation-toggle" ].label.bg );
        assert.equal( tree.interface.default.login[ "email-link-signed-in-already" ], CATALOGUE.interface.default.login[ "email-link-signed-in-already" ].bg );
        assert.equal( tree.interface[ "user-menu" ].profile, APPLICATION_MENU.bg );
        assert.equal( tree.interface.application.own, "Собствен" );
        assert.notEqual( manager.getLabelsBundle( "en" ).hash, bundle.hash );
    } );

    it( "names the user menu's entries in the session's language, the application's wording winning", () => {
        const config = JSON.stringify( new Harness().buildComponentsConfig( { language: "bg", user: { roles: [] } } ) );
        assert.ok( config.includes( JSON.stringify( CATALOGUE.interface[ "user-menu" ].logout.bg ) ), config );
        assert.ok( config.includes( JSON.stringify( APPLICATION_MENU.bg ) ), config );
        assert.ok( !config.includes( "\"Logout\"" ), "the English fallback is what an application without a copy showed" );
    } );

} );

describe( "every label key the framework itself uses", () => {

    // Each literal key a fragment binds with `x-text-label` (any attribute form) or a script reads with `getLabel( … )`
    // or a `label( … )` helper, in any quotes. A key built at run time, or held in a constant first, is not a literal at
    // the call and is not swept.
    const RE_FRAGMENT_KEY = /x-text-label(?::[\w-]+)?=(["'])([^"']+)\1/g;
    const RE_SCRIPT_KEY = /\b(?:getLabel|label)\(\s*(["'`])([a-z][\w.-]*)\1/g;

    // What a key must be found in: the framework's catalogue or core's, and nothing an application lays over them. A
    // swept key that only an application defined is exactly the defect: competence's own catalogue hid these three.
    const CORE_LABELS = JSON.parse( fs.readFileSync( path.join( path.dirname( require.resolve( "@ti-engine/core/localization" ) ), "..", "bin", "localization", "labels.json" ), "utf8" ) );
    const DEFINED = new Map( leaves( CORE_LABELS ).concat( leaves( CATALOGUE ) ) );
    const LANGUAGES = [ ...new Set( leaves( CATALOGUE ).flatMap( ( [ , texts ] ) => Object.keys( texts ) ) ) ];

    // Every file under a directory, `node_modules` and the vendored libraries in `lib` left out: their minified code may
    // well call a `label( "…" )` of its own.
    function walk( directory ) {
        return fs.readdirSync( directory, { withFileTypes: true } ).flatMap( ( entry ) => {
            const full = path.join( directory, entry.name );
            if ( entry.isDirectory() ) {
                return ( entry.name === "node_modules" || entry.name === "lib" ) ? [] : walk( full );
            }
            return [ full ];
        } );
    }

    function usedKeys() {
        const used = new Map();
        const collect = ( file, pattern ) => {
            for ( const match of fs.readFileSync( file, "utf8" ).matchAll( pattern ) ) {
                used.set( match[ 2 ], used.get( match[ 2 ] ) || path.relative( PACKAGE_ROOT, file ) );
            }
        };
        for ( const file of walk( path.join( PACKAGE_ROOT, "bin" ) ).concat( walk( path.join( PACKAGE_ROOT, "components" ) ) ) ) {
            if ( file.endsWith( ".html" ) ) {
                collect( file, RE_FRAGMENT_KEY );
            } else if ( file.endsWith( ".js" ) ) {
                collect( file, RE_SCRIPT_KEY );
            }
        }
        return used;
    }

    it( "is in the framework's catalogue or core's, in every language the framework carries (CA-577)", () => {
        // The sidebar's profile tooltip and the user menu's title read `interface.topbar.user-profile`, and the shell's
        // start failure and a message-less notice read `error.application.*`; no catalogue but competence's defined them,
        // so every other application showed English or "LABEL NOT FOUND" in their place.
        const used = usedKeys();
        assert.ok( used.size > 100, `the sweep found ${ used.size } keys` );
        assert.ok( LANGUAGES.includes( "en" ) && LANGUAGES.includes( "bg" ), `the sweep read the languages: ${ LANGUAGES }` );
        const missing = [];
        for ( const [ key, file ] of used ) {
            for ( const language of LANGUAGES ) {
                if ( typeof DEFINED.get( key )?.[ language ] !== "string" ) {
                    missing.push( `${ key } (${ language }), used in ${ file }` );
                }
            }
        }
        assert.deepEqual( missing, [] );
    } );

} );

describe( "whichever framework module an application reaches first", () => {

    it( "is required by every module of the package that reads labels", () => {
        // A sweep, not a list: a module added later that reads labels without laying the catalogue down first would
        // read framework keys before they are there whenever an application reaches it first.
        const files = [ "bin", "components" ].flatMap( ( directory ) => fs.readdirSync( path.join( PACKAGE_ROOT, directory ) )
            .filter( ( name ) => name.endsWith( ".js" ) ).map( ( name ) => path.join( directory, name ) ) );
        const readers = files.filter( ( file ) => /require\( "@ti-engine\/core\/localization" \)/.test( fs.readFileSync( path.join( PACKAGE_ROOT, file ), "utf8" ) ) );
        assert.ok( readers.length >= 5, readers.join( ", " ) );
        for ( const file of readers ) {
            if ( file === path.join( "components", "framework-labels.js" ) ) {
                continue;
            }
            assert.match( fs.readFileSync( path.join( PACKAGE_ROOT, file ), "utf8" ), /require\( "#framework-labels" \);/, file );
        }
    } );

    // Each is a module that reads labels. Loaded alone in a fresh process, each must have laid the catalogue down
    // before it reads one, or the module an application happens to require first decides whether the texts resolve.
    for ( const alias of [ "#web-app-manager", "#web-handlers", "#notification-service", "#email-link", "#feedback" ] ) {
        it( `lays the catalogue down when ${ alias } is the first one loaded`, () => {
            const probe = [
                `require( ${ JSON.stringify( alias ) } );`,
                "const localization = require( \"@ti-engine/core/localization\" );",
                "process.stdout.write( String( localization.getLabel( \"interface.notice.sign-in-link.subject\", \"bg\", null ) ) );"
            ].join( "\n" );
            const result = spawnSync( process.execPath, [ "-e", probe ], {
                cwd: PACKAGE_ROOT,
                encoding: "utf8",
                env: { ...process.env, TI_LOCALIZATION_LABELS_PATH: "", TI_AUDITING_LOG_CONSOLE_ENABLED: "false" }
            } );
            assert.equal( result.status, 0, result.stderr );
            assert.equal( result.stdout, CATALOGUE.interface.notice[ "sign-in-link" ].subject.bg );
        } );
    }

} );
