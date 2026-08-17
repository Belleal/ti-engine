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

/*
 * Unit tests for the `/static` cache policy (1.19.0).
 *
 * Following the framework's testing convention, the live TiWebServer is NOT instantiated (it needs a broker, config,
 * and a listening socket). Both halves of the policy are pure, static methods carrying all the logic worth pinning:
 * `resolveStaticCachePolicy` (what a `staticCache` block resolves to, and what it refuses) and
 * `staticCacheControlFor` (the header a given file ends up with). The `setHeaders` wiring in onStart is a trusted
 * express.static passthrough.
 *
 * The header these produce is the whole point of the change: an `immutable` response is one browsers will not
 * revalidate even on a manual reload, so it must never be the answer for a URL whose bytes can change.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const TiWebServer = require( "#web-server" );

// Built with path.join so the separators are whatever the running platform actually hands to express.static:
const ROOT = path.join( path.sep === "\\" ? "C:\\srv" : "/srv", "app", "static" );
const fileAt = ( ...segments ) => path.join( ROOT, ...segments );

const DEFAULT_POLICY = TiWebServer.resolveStaticCachePolicy();
const REVALIDATE = "public, max-age=0, must-revalidate";
const IMMUTABLE_YEAR = "public, max-age=31536000, immutable";

describe( "TiWebServer.resolveStaticCachePolicy", () => {

    it( "defaults to revalidate-every-use, which is the only policy true for a stable filename", () => {
        const policy = TiWebServer.resolveStaticCachePolicy();
        assert.equal( policy.maxAge, 0 );
        assert.equal( policy.immutable, false );
        assert.deepEqual( policy.warnings, [] );
    } );

    it( "carves out /fonts/ as long-lived by default", () => {
        assert.deepEqual( TiWebServer.resolveStaticCachePolicy().immutablePaths, [ "/fonts/" ] );
    } );

    it( "treats a null / non-object / absent block as 'no configuration', not as an error", () => {
        for ( const input of [ undefined, null, "yes", 42 ] ) {
            const policy = TiWebServer.resolveStaticCachePolicy( input );
            assert.equal( policy.maxAge, 0 );
            assert.deepEqual( policy.warnings, [] );
        }
    } );

    it( "honors a fingerprinting consumer's opt-in to immutable", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 31536000, immutable: true } );
        assert.equal( policy.maxAge, 31536000 );
        assert.equal( policy.immutable, true );
        assert.deepEqual( policy.warnings, [] );
    } );

    it( "honors a positive maxAge without immutable", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 600 } );
        assert.equal( policy.maxAge, 600 );
        assert.equal( policy.immutable, false );
    } );

    it( "drops immutable when maxAge is 0, because a response stale on arrival cannot promise never to change", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { immutable: true } );
        assert.equal( policy.immutable, false, "the contradiction resolves to the safe side" );
        assert.equal( policy.warnings.length, 1 );
        assert.match( policy.warnings[ 0 ], /immutable/ );
    } );

    it( "rejects a duration string for maxAge rather than reinterpreting it as milliseconds", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: "1y" } );
        assert.equal( policy.maxAge, 0, "falls back to the safe default" );
        assert.equal( policy.warnings.length, 1 );
        assert.match( policy.warnings[ 0 ], /seconds/ );
    } );

    it( "rejects a negative or fractional maxAge", () => {
        assert.equal( TiWebServer.resolveStaticCachePolicy( { maxAge: -1 } ).maxAge, 0 );
        assert.equal( TiWebServer.resolveStaticCachePolicy( { maxAge: -1 } ).warnings.length, 1 );
        assert.equal( TiWebServer.resolveStaticCachePolicy( { maxAge: 1.5 } ).maxAge, 0 );
        assert.equal( TiWebServer.resolveStaticCachePolicy( { maxAge: 1.5 } ).warnings.length, 1 );
    } );

    it( "accepts an explicit maxAge of 0 without warning", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 0 } );
        assert.equal( policy.maxAge, 0 );
        assert.deepEqual( policy.warnings, [] );
    } );

    it( "rejects a non-boolean immutable instead of taking a truthy string as consent", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 31536000, immutable: "true" } );
        assert.equal( policy.immutable, false );
        assert.equal( policy.warnings.length, 1 );
    } );

    it( "normalizes immutablePaths entries to rooted, slash-terminated prefixes", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { immutablePaths: [ "fonts", "/vendor", "/build/" ] } );
        assert.deepEqual( policy.immutablePaths, [ "/fonts/", "/vendor/", "/build/" ] );
        assert.deepEqual( policy.warnings, [] );
    } );

    it( "lets an explicitly empty immutablePaths clear the default carve-out", () => {
        // This is why the defaults live on the class and not in web-server.json: lodash merges arrays by index, so a
        // default entry in the config file could never be cleared by a consumer supplying an empty array.
        const policy = TiWebServer.resolveStaticCachePolicy( { immutablePaths: [] } );
        assert.deepEqual( policy.immutablePaths, [] );
        assert.deepEqual( policy.warnings, [] );
    } );

    it( "drops unusable immutablePaths entries with a warning, keeping the usable ones", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { immutablePaths: [ "/fonts/", "", 7, null, "  " ] } );
        assert.deepEqual( policy.immutablePaths, [ "/fonts/" ] );
        assert.equal( policy.warnings.length, 4 );
    } );

    it( "falls back to the default carve-out when immutablePaths is not an array", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { immutablePaths: "/fonts/" } );
        assert.deepEqual( policy.immutablePaths, [ "/fonts/" ] );
        assert.equal( policy.warnings.length, 1 );
    } );

    it( "does not hand out a reference to the shared defaults", () => {
        const first = TiWebServer.resolveStaticCachePolicy();
        first.immutablePaths.push( "/mutated/" );
        assert.deepEqual( TiWebServer.resolveStaticCachePolicy().immutablePaths, [ "/fonts/" ] );
    } );

} );

describe( "TiWebServer.staticCacheControlFor", () => {

    it( "serves a stable-named asset revalidating by default", () => {
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "scripts", "ti-framework.js" ), DEFAULT_POLICY ), REVALIDATE );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "anarand.css" ), DEFAULT_POLICY ), REVALIDATE );
    } );

    it( "serves a font under the carve-out as long-lived and immutable", () => {
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts", "spectral-500.woff2" ), DEFAULT_POLICY ), IMMUTABLE_YEAR );
    } );

    it( "matches an immutable prefix at any depth beneath it", () => {
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts", "subset", "a.woff2" ), DEFAULT_POLICY ), IMMUTABLE_YEAR );
    } );

    it( "does not let a prefix leak past its own path segment", () => {
        // Without the normalized trailing slash, `/fonts` would also claim these:
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts-legacy", "a.woff2" ), DEFAULT_POLICY ), REVALIDATE );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts.css" ), DEFAULT_POLICY ), REVALIDATE );
    } );

    it( "matches case-sensitively, so a case mismatch falls to the revalidating side", () => {
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "Fonts", "a.woff2" ), DEFAULT_POLICY ), REVALIDATE );
    } );

    it( "applies a fingerprinting consumer's immutable policy to the whole tree", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 31536000, immutable: true } );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "app.a1b2c3.css" ), policy ), IMMUTABLE_YEAR );
    } );

    it( "emits a bare max-age when a positive maxAge carries no immutable promise", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 600 } );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "app.css" ), policy ), "public, max-age=600" );
    } );

    it( "still honors the carve-out when the default policy is a short max-age", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { maxAge: 600 } );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts", "a.woff2" ), policy ), IMMUTABLE_YEAR );
    } );

    it( "serves everything revalidating once the carve-out is cleared", () => {
        const policy = TiWebServer.resolveStaticCachePolicy( { immutablePaths: [] } );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "fonts", "a.woff2" ), policy ), REVALIDATE );
    } );

    it( "never promises immutability for a file resolving outside the served root", () => {
        const outside = path.join( ROOT, "..", "fonts", "a.woff2" );
        assert.equal( TiWebServer.staticCacheControlFor( ROOT, outside, DEFAULT_POLICY ), REVALIDATE );
    } );

    it( "tolerates a missing or malformed policy by falling back to revalidation", () => {
        for ( const policy of [ undefined, null, {}, { maxAge: "1y" }, { immutablePaths: "/fonts/" } ] ) {
            assert.equal( TiWebServer.staticCacheControlFor( ROOT, fileAt( "app.css" ), policy ), REVALIDATE );
        }
    } );

} );
