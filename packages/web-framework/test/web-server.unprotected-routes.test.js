/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * ReDoS hardening for the default unprotected static-asset route matchers (CodeQL js/redos, alerts #5/#6).
 *
 * The matchers run in isUnprotectedRoute() against the raw, attacker-controlled request path BEFORE any auth
 * check, so a catastrophically-backtracking pattern is a pre-auth denial-of-service vector. The original
 * `(?:.+\/)*` construct is ambiguous (the inner `.+` also matches "/"), producing exponential backtracking on a
 * path like `/static/a/a/…/a/x` with no trailing extension. The segment-anchored `(?:[^/]+\/)*` matches the same
 * real asset paths in linear time.
 *
 * These tests pin BOTH the matching contract (equivalence for realistic paths) and the linear-time property. The
 * pathological input below is sized so that the vulnerable pattern would not complete in any practical time — if
 * anyone reintroduces the ambiguous quantifier, this test hangs/times out rather than passing silently.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { RE_STATIC_UNPROTECTED, RE_WELL_KNOWN_UNPROTECTED } = require( "#web-server" );

function match( pattern, input ) {
    // Mirror isUnprotectedRoute(): reset lastIndex defensively and test the path only.
    pattern.lastIndex = 0;
    return pattern.test( input );
}

describe( "unprotected static-asset route matchers", () => {

    it( "matches the same realistic /static/ asset paths as before", () => {
        assert.ok( match( RE_STATIC_UNPROTECTED, "/static/app.css" ) );
        assert.ok( match( RE_STATIC_UNPROTECTED, "/static/js/app.js" ) );
        assert.ok( match( RE_STATIC_UNPROTECTED, "/static/a/b/c/style.min.css" ) );
        assert.ok( match( RE_STATIC_UNPROTECTED, "/STATIC/Logo.PNG" ), "case-insensitive" );
    } );

    it( "still rejects /static/ paths without a file extension or with a trailing slash", () => {
        assert.ok( !match( RE_STATIC_UNPROTECTED, "/static/nodot" ) );
        assert.ok( !match( RE_STATIC_UNPROTECTED, "/static/dir/" ) );
        assert.ok( !match( RE_STATIC_UNPROTECTED, "/static/" ) );
        assert.ok( !match( RE_STATIC_UNPROTECTED, "/other/app.css" ) );
    } );

    it( "matches realistic /.well-known/ asset paths", () => {
        assert.ok( match( RE_WELL_KNOWN_UNPROTECTED, "/.well-known/security.txt" ) );
        assert.ok( match( RE_WELL_KNOWN_UNPROTECTED, "/.well-known/acme-challenge/token.json" ) );
        assert.ok( !match( RE_WELL_KNOWN_UNPROTECTED, "/.well-known/no-extension" ) );
    } );

    it( "resolves a hostile deep path in linear time (ReDoS guard)", () => {
        // No trailing "<name>.<ext>" segment => no match; the vulnerable `(?:.+\/)*` would backtrack exponentially
        // over this input. 100000 segments is intractable for the ambiguous pattern but instant for the fixed one.
        const hostile = "/static/" + "a/".repeat( 100000 ) + "b";
        const start = process.hrtime.bigint();
        const result = match( RE_STATIC_UNPROTECTED, hostile );
        const elapsedMs = Number( process.hrtime.bigint() - start ) / 1e6;
        assert.equal( result, false );
        assert.ok( elapsedMs < 100, `expected linear-time matching, took ${ elapsedMs.toFixed( 1 ) }ms` );
    } );

    it( "resolves a hostile deep /.well-known/ path in linear time (ReDoS guard)", () => {
        const hostile = "/.well-known/" + "a/".repeat( 100000 ) + "b";
        const start = process.hrtime.bigint();
        const result = match( RE_WELL_KNOWN_UNPROTECTED, hostile );
        const elapsedMs = Number( process.hrtime.bigint() - start ) / 1e6;
        assert.equal( result, false );
        assert.ok( elapsedMs < 100, `expected linear-time matching, took ${ elapsedMs.toFixed( 1 ) }ms` );
    } );

} );
