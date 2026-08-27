/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The work-sites composite editor (CA-109).
 *
 * Unlike role families, whose codes are fixed by schema and whose decompose ignores unknown ones, a work site's
 * whole purpose is to be added and removed by an admin. So the submitted list is the COMPLETE set: an omitted code
 * is a removal. That is only safe because workSitesReferentialIntegrity refuses to remove a site somebody is
 * assigned to — the editor deliberately does not repeat that check, so the rule has exactly one home.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const editors = require( "../application/config-editors" );

const DOCS = {
    "work-sites": {
        HQ: { id: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } },
        CL1: { id: "CL1", type: "client", name: { en: "Client Site", bg: "Клиентски обект" } }
    }
};

describe( "composeWorkSites", () => {

    it( "projects every site as an editable row", () => {
        const view = editors.composeWorkSites( DOCS );
        assert.equal( view.sites.length, 2 );
        const hq = view.sites.find( ( s ) => s.code === "HQ" );
        assert.deepEqual( hq, { code: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } } );
    } );

    it( "returns an empty list rather than throwing on an absent document", () => {
        assert.deepEqual( editors.composeWorkSites( {} ), { sites: [] } );
        assert.deepEqual( editors.composeWorkSites( null ), { sites: [] } );
    } );

} );

describe( "decomposeWorkSites", () => {

    it( "round-trips compose output unchanged", () => {
        const result = editors.decomposeWorkSites( editors.composeWorkSites( DOCS ), DOCS );
        assert.deepEqual( result[ "work-sites" ], DOCS[ "work-sites" ] );
    } );

    it( "adds a new site, stamping its id from its code", () => {
        // id must equal the key or workSiteIdMatchesKey blocks the save; deriving it removes the chance to disagree.
        const view = { sites: [ { code: "O3", type: "office", name: { en: "Plovdiv", bg: "Пловдив" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].O3.id, "O3" );
    } );

    it( "removes a site omitted from the submitted list", () => {
        const view = { sites: [ { code: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( Object.hasOwn( result[ "work-sites" ], "CL1" ), false );
    } );

    it( "renames and retypes in place", () => {
        const view = { sites: [ { code: "HQ", type: "client", name: { en: "Renamed", bg: "Преименуван" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].HQ.type, "client" );
        assert.equal( result[ "work-sites" ].HQ.name.en, "Renamed" );
    } );

    it( "keeps the stored side of a name the payload omits", () => {
        // A client that drops the read-only reference language must not blank it.
        const view = { sites: [ { code: "HQ", type: "office", name: { en: "Only EN" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].HQ.name.bg, "Централно управление" );
    } );

    it( "skips a row with no code rather than writing an empty key", () => {
        const result = editors.decomposeWorkSites( { sites: [ { code: "", type: "office", name: { en: "x", bg: "y" } } ] }, DOCS );
        assert.deepEqual( result[ "work-sites" ], {} );
    } );

    it( "trims a padded code before storing it as the key and the id", () => {
        // The CSV importer trims every cell before matching, so a padded key would be a site no import row could
        // ever equal — the same reason the client's own duplicate check in localIssues() trims before comparing.
        const view = { sites: [ { code: " O3 ", type: "office", name: { en: "Plovdiv", bg: "Пловдив" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( Object.hasOwn( result[ "work-sites" ], "O3" ), true );
        assert.equal( result[ "work-sites" ].O3.id, "O3" );
        assert.equal( Object.hasOwn( result[ "work-sites" ], " O3 " ), false );
    } );

    it( "skips a whitespace-only code rather than writing a padded key", () => {
        const result = editors.decomposeWorkSites( { sites: [ { code: "   ", type: "office", name: { en: "x", bg: "y" } } ] }, DOCS );
        assert.deepEqual( result[ "work-sites" ], {} );
    } );

    it( "accepts a bare array as well as the wrapped view", () => {
        const result = editors.decomposeWorkSites( [ { code: "HQ", type: "office", name: { en: "A", bg: "Б" } } ], DOCS );
        assert.equal( result[ "work-sites" ].HQ.name.en, "A" );
    } );

} );
