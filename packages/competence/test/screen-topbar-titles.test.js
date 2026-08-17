/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Topbar screen-title guard.
 *
 * The topbar resolves its title from `interface.topbar.<screen>`, where `<screen>` is the fragment name passed to
 * `addFragment` (web-framework `ti-framework.js`, configureTopbar: `getLabel( "interface.topbar." + screen, "" )`).
 * The fallback is an EMPTY STRING, so a screen registered without a matching label renders with no title at all and
 * nothing anywhere reports the omission — it is only visible by opening the screen and noticing the blank.
 *
 * That is exactly how `consent-register` shipped titleless (CA-93) and how `evaluations-oversight` went titleless
 * from 3.12.0 until the same review caught it. This test closes the class: every registered fragment must have a
 * topbar label, in both languages.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const labels = require( "../bin/localization/competence-labels.json" );

/**
 * Every fragment name registered via `addFragment( "<name>", { … } )` in the web application.
 *
 * @returns {Array<string>}
 */
function registeredScreens() {
    const source = fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "competence-web-application.js" ), "utf8" );
    return [ ...source.matchAll( /addFragment\(\s*"([a-z0-9-]+)"/g ) ].map( ( match ) => match[ 1 ] );
}

describe( "Screen topbar titles", () => {

    it( "finds the registered screens (guards the extraction itself)", () => {
        const screens = registeredScreens();
        // If the addFragment call style ever changes, the regex would silently match nothing and every assertion
        // below would vacuously pass — so pin a floor and a couple of known members.
        assert.ok( screens.length >= 25, `expected at least 25 registered screens, found ${ screens.length }` );
        assert.ok( screens.includes( "consent-register" ), "consent-register must be registered" );
        // `dashboard` is deliberately NOT asserted here: it is the default landing screen and is not registered
        // through addFragment, so it never flows through this extraction.
        assert.ok( screens.includes( "competence-evaluation" ), "competence-evaluation must be registered" );
    } );

    it( "every registered screen has an interface.topbar entry with en + bg", () => {
        const topbar = ( labels.interface && labels.interface.topbar ) || {};
        const missing = [];
        const incomplete = [];

        for ( const screen of registeredScreens() ) {
            const entry = topbar[ screen ];
            if ( !entry ) {
                missing.push( screen );
                continue;
            }
            if ( !entry.en || !entry.bg ) {
                incomplete.push( screen );
            }
        }

        assert.deepEqual( missing, [], `screens registered with no interface.topbar label (they render with a blank topbar title): ${ missing.join( ", " ) }` );
        assert.deepEqual( incomplete, [], `interface.topbar entries missing an en or bg leaf: ${ incomplete.join( ", " ) }` );
    } );

} );
