/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * An admin screen that nothing links to does not exist.
 *
 * Registering a fragment (`addFragment`), writing its Alpine component and shipping its labels leaves a screen that
 * is complete in every respect except that no user can get to it — `/app/research-consent` shipped exactly like
 * that, reachable only by typing the URL. Nothing failed: the route resolved, the editor saved, the tests passed.
 *
 * There are two ways an admin screen is offered, and a screen must take one of them:
 *   - a sidebar button in the Administration section (`hx-get="/app/<key>"`), for the org-level screens; or
 *   - a card on the Configuration screen (`openEditor('<key>')`), for the competency-content editors.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const ROOT = path.resolve( __dirname, ".." );
const APPLICATION = path.join( ROOT, "bin", "competence-web-application.js" );
const SIDEBAR = path.join( ROOT, "bin", "static", "fragments", "components", "component-sidebar.html" );
const ADMIN_CONFIG = path.join( ROOT, "bin", "static", "fragments", "frame-admin-config.html" );

// `addFragment( "<key>", { title: ..., path: ..., roles: [ ... ] } )` — the option object carries no nested braces,
// so a brace-free body is enough to pair each key with its own options and not the next call's.
const FRAGMENT = /addFragment\(\s*"([^"]+)"\s*,\s*\{([^{}]*)\}/g;

function adminFragmentKeys() {
    const source = fs.readFileSync( APPLICATION, "utf8" );
    const keys = [];
    for ( const match of source.matchAll( FRAGMENT ) ) {
        if ( /roles\s*:\s*\[[^\]]*"admin"/.test( match[ 2 ] ) ) keys.push( match[ 1 ] );
    }
    return keys;
}

describe( "Admin screen reachability", () => {

    it( "every admin-gated fragment is offered by the sidebar or the Configuration screen", () => {
        const sidebar = fs.readFileSync( SIDEBAR, "utf8" );
        const adminConfig = fs.readFileSync( ADMIN_CONFIG, "utf8" );

        const unreachable = adminFragmentKeys().filter( ( key ) => {
            const inSidebar = sidebar.includes( `hx-get="/app/${ key }"` );
            const onConfigScreen = adminConfig.includes( `openEditor('${ key }')` );
            return !inSidebar && !onConfigScreen;
        } );

        assert.deepEqual( unreachable, [], `admin screens with no way in: ${ unreachable.join( ", " ) }` );
    } );

    it( "finds the admin fragments it is meant to be checking", () => {
        // Guards the guard: a parse that silently matches nothing would pass the test above forever.
        const keys = adminFragmentKeys();
        assert.ok( keys.length >= 8, `parsed ${ keys.length } admin fragments` );
        for ( const expected of [ "admin-config", "organization-structure", "research-consent", "work-sites" ] ) {
            assert.ok( keys.includes( expected ), `${ expected } is an admin fragment` );
        }
    } );

} );
