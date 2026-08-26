/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Static wiring guard for the Work Sites screen (CA-109).
 *
 * CA-108 shipped two wiring defects on a new admin screen that no test would have caught: the fragment's key
 * collided with Configuration's, and then sidebarNavMapping still pointed at "administration" so Configuration
 * highlighted instead. Both were found by a human clicking the screen. This closes that class.
 *
 * The mapping rule, stated once: sidebarNavMapping decides which sidebar ITEM highlights. A SUB-screen maps to its
 * parent's key; a TOP-LEVEL item maps to itself. Work Sites is top-level.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const LANGUAGES = [ "en", "bg" ];
const labels = require( "../bin/localization/competence-labels.json" );

const read = ( ...parts ) => fs.readFileSync( path.join( PACKAGE_ROOT, ...parts ), "utf8" );
const application = read( "bin", "competence-web-application.js" );
const sidebar = read( "bin", "static", "fragments", "components", "component-sidebar.html" );
const fragment = read( "bin", "static", "fragments", "frame-work-sites.html" );
const script = read( "bin", "static", "scripts", "competence-user-interface.js" );

describe( "Work Sites screen wiring", () => {

    it( "registers the fragment, admin-gated", () => {
        assert.match( application, /this\.addFragment\( "work-sites", \{[\s\S]{0,240}?roles: \[ "admin" \]/ );
        assert.match( application, /path: "fragments\/frame-work-sites\.html"/ );
    } );

    it( "maps the sidebar entry to its OWN key, not to administration", () => {
        assert.match( application, /"work-sites": "work-sites"/ );
        assert.equal( /"work-sites": "administration"/.test( application ), false,
            "mapping a top-level screen to administration highlights Configuration instead — the CA-108 bug" );
    } );

    it( "has a sidebar button that opens it", () => {
        assert.match( sidebar, /hx-get="\/app\/work-sites"/ );
        assert.match( sidebar, /active = 'work-sites'/ );
    } );

    it( "binds the fragment to its Alpine component, which exists", () => {
        assert.match( fragment, /x-data="competenceWorkSites"/ );
        assert.match( script, /function configureWorkSites\(\)/ );
    } );

    it( "stays CSP-clean", () => {
        assert.equal( /\sstyle="/.test( fragment ), false, "inline styles are forbidden under Alpine CSP mode" );
        assert.equal( /\?\./.test( fragment ), false, "optional chaining is rejected by the CSP expression evaluator" );
        assert.equal( /\b(Array|Object)\./.test( fragment ), false, "builtins are unavailable inside CSP template expressions" );
    } );

    it( "carries en and bg for every label key it references", () => {
        const keys = [ ...fragment.matchAll( /x-text-label="([^"]+)"/g ) ].map( ( m ) => m[ 1 ] );
        assert.ok( keys.length > 0, "the fragment references no labels at all — did the selector change?" );
        for ( const key of keys ) {
            const leaf = key.split( "." ).reduce( ( node, part ) => ( node || {} )[ part ], labels );
            assert.ok( leaf, `${ key } is missing from competence-labels.json` );
            for ( const language of LANGUAGES ) {
                assert.ok( leaf[ language ] && leaf[ language ].trim().length > 0, `${ key }.${ language } is empty` );
            }
        }
    } );

} );
