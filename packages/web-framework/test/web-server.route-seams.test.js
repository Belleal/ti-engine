/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Unit tests for the route-registration seams added in 1.17.0 (registerRoute / addUnprotectedRoute).
 *
 * Following the framework's testing convention, the live TiWebServer is NOT instantiated (it needs a broker,
 * config, and a listening socket). Instead the two seams delegate to pure, static helper methods on TiWebServer
 * that carry all the logic worth pinning: `normalizeRegistrableMethod` (which verbs registerRoute will accept) and
 * `isRouteInList` (the exact matching behavior that decides whether addUnprotectedRoute's pattern makes a path
 * unprotected). The thin `#webServer[verb](...)` dispatch and the array push are trusted Express/array passthroughs.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const TiWebServer = require( "#web-server" );

describe( "TiWebServer.normalizeRegistrableMethod (registerRoute verb allowlist)", () => {

    it( "normalizes case and surrounding whitespace to a lower-case verb", () => {
        assert.equal( TiWebServer.normalizeRegistrableMethod( "GET" ), "get" );
        assert.equal( TiWebServer.normalizeRegistrableMethod( " Post " ), "post" );
        assert.equal( TiWebServer.normalizeRegistrableMethod( "DELETE" ), "delete" );
    } );

    it( "accepts every supported route-scoped verb", () => {
        for ( const verb of [ "get", "post", "put", "patch", "delete", "options", "head", "all" ] ) {
            assert.equal( TiWebServer.normalizeRegistrableMethod( verb ), verb );
        }
    } );

    it( "rejects `use` — global middleware mounting is deliberately excluded", () => {
        assert.equal( TiWebServer.normalizeRegistrableMethod( "use" ), null );
    } );

    it( "rejects non-routing Express methods and unknown verbs", () => {
        assert.equal( TiWebServer.normalizeRegistrableMethod( "set" ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( "listen" ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( "getx" ), null );
    } );

    it( "rejects empty / non-string input", () => {
        assert.equal( TiWebServer.normalizeRegistrableMethod( "" ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( null ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( undefined ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( 123 ), null );
    } );

    it( "rejects a non-string whose toString() yields a valid verb, rather than coercing it", () => {
        // These all stringify to "get". Coercing them would register a route and quietly bypass the
        // E_GEN_INVALID_ARGUMENT_TYPE that registerRoute raises for a method it does not accept.
        assert.equal( TiWebServer.normalizeRegistrableMethod( [ "get" ] ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( { toString: () => "get" } ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( { toString: () => " GET " } ), null );
        assert.equal( TiWebServer.normalizeRegistrableMethod( new String( "get" ) ), null );
    } );

} );

describe( "TiWebServer.isRouteInList (addUnprotectedRoute matching)", () => {

    it( "matches a string pattern only on exact equality", () => {
        assert.ok( TiWebServer.isRouteInList( [ "/health" ], "/health" ) );
        assert.ok( !TiWebServer.isRouteInList( [ "/health" ], "/health/" ) );
        assert.ok( !TiWebServer.isRouteInList( [ "/health" ], "/other" ) );
    } );

    it( "tests a RegExp pattern against the path", () => {
        assert.ok( TiWebServer.isRouteInList( [ /^\/login\/[^/]+$/i ], "/login/local" ) );
        assert.ok( !TiWebServer.isRouteInList( [ /^\/login\/[^/]+$/i ], "/login/" ) );
        assert.ok( TiWebServer.isRouteInList( [ /^\/bg\//i ], "/BG/nachalo" ), "case-insensitive" );
    } );

    it( "returns true on the first match in a mixed list, false when none match", () => {
        const patterns = [ "/health", /^\/static\/.+\.[a-z0-9]+$/i ];
        assert.ok( TiWebServer.isRouteInList( patterns, "/health" ) );
        assert.ok( TiWebServer.isRouteInList( patterns, "/static/app.css" ) );
        assert.ok( !TiWebServer.isRouteInList( patterns, "/2026/03/20/slug/" ) );
    } );

    it( "returns false for an empty pattern list", () => {
        assert.ok( !TiWebServer.isRouteInList( [], "/anything" ) );
    } );

    it( "resets lastIndex so a global-flagged RegExp matches consistently across calls", () => {
        const globalPattern = /^\/x\//g;
        assert.ok( TiWebServer.isRouteInList( [ globalPattern ], "/x/one" ) );
        // Without the defensive lastIndex reset, the second test would resume from a non-zero index and miss.
        assert.ok( TiWebServer.isRouteInList( [ globalPattern ], "/x/two" ) );
    } );

    it( "supports the site's public-by-default inversion pattern", () => {
        // The standalone site marks everything except /admin/* as unprotected (build-spec.md §4).
        const publicExceptAdmin = /^\/(?!admin\/).*$/;
        assert.ok( TiWebServer.isRouteInList( [ publicExceptAdmin ], "/2026/03/20/the-sounds-of-anarandaris/" ) );
        assert.ok( TiWebServer.isRouteInList( [ publicExceptAdmin ], "/bg/" ) );
        assert.ok( !TiWebServer.isRouteInList( [ publicExceptAdmin ], "/admin/config" ) );
    } );

} );
