/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the legacy media mounts. A migrated site's media keeps its original URLs because inbound links from
 * other people's pages cannot be rewritten, so `/wp-content/uploads/...` has to keep resolving.
 *
 * The security assertions run over real HTTP against a real Express app rather than against a stub, because what is
 * being tested is precisely what `express.static` does with a hostile path -- a hand-rolled fake would prove nothing
 * about traversal or dotfile handling.
 */

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const express = require( "express" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { mountMediaRoutes, normalizePrefix } = require( "#media" );

const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-media-" ) );
const mediaRoot = path.join( tempDir, "public" );
let listener;
let base;

before( async () => {
    // The on-disk tree mirrors the URL: /wp-content/uploads/x.webp -> <root>/wp-content/uploads/x.webp
    fs.mkdirSync( path.join( mediaRoot, "wp-content", "uploads", "2026", "05" ), { recursive: true } );
    fs.writeFileSync( path.join( mediaRoot, "wp-content", "uploads", "2026", "05", "cover.webp" ), "IMAGEBYTES" );
    fs.writeFileSync( path.join( mediaRoot, "wp-content", ".env" ), "SECRET=leaked" );
    // A file OUTSIDE the media root — the target a traversal attempt would be reaching for.
    fs.writeFileSync( path.join( tempDir, "outside.txt" ), "SHOULD NEVER BE SERVED" );

    const app = express();
    const server = { registerRoute( method, routePath, ...handlers ) { app[ method ]( routePath, ...handlers ); return this; } };
    mountMediaRoutes( server, { root: mediaRoot, prefixes: [ "/wp-content", "/legacy-files/" ] } );
    // Stands in for the content resolver + terminal 404 that follow the media mounts.
    app.use( ( request, response ) => response.status( 404 ).send( "CONTENT 404" ) );

    await new Promise( ( resolve ) => {
        listener = app.listen( 0, "127.0.0.1", resolve );
    } );
    base = "http://127.0.0.1:" + listener.address().port;
} );

after( () => {
    if ( listener ) {
        listener.close();
    }
    fs.rmSync( tempDir, { recursive: true, force: true } );
} );

const get = async ( requestPath ) => {
    const response = await fetch( base + requestPath, { redirect: "manual" } );
    return { status: response.status, body: await response.text(), cacheControl: response.headers.get( "cache-control" ) };
};

describe( "media — serving legacy paths unchanged", () => {

    it( "serves a file at its original URL", async () => {
        const result = await get( "/wp-content/uploads/2026/05/cover.webp" );
        assert.equal( result.status, 200 );
        assert.equal( result.body, "IMAGEBYTES" );
    } );

    it( "caches, but never immutably — a re-uploaded file must be reachable without a purge", async () => {
        const result = await get( "/wp-content/uploads/2026/05/cover.webp" );
        assert.match( result.cacheControl, /max-age=\d+/ );
        assert.ok( !result.cacheControl.includes( "immutable" ) );
    } );

    it( "falls through to the content resolver for a media path that does not exist", async () => {
        const result = await get( "/wp-content/uploads/2026/05/missing.webp" );
        assert.equal( result.status, 404 );
        assert.equal( result.body, "CONTENT 404", "a miss must reach the proper 404, not a bare one" );
    } );

    it( "serves every configured prefix, trailing slash or not", async () => {
        fs.mkdirSync( path.join( mediaRoot, "legacy-files" ), { recursive: true } );
        fs.writeFileSync( path.join( mediaRoot, "legacy-files", "old.pdf" ), "PDFBYTES" );
        const result = await get( "/legacy-files/old.pdf" );
        assert.equal( result.status, 200 );
        assert.equal( result.body, "PDFBYTES" );
    } );

    it( "leaves paths outside the configured prefixes to the content resolver", async () => {
        const result = await get( "/2026/03/20/some-post/" );
        assert.equal( result.body, "CONTENT 404" );
    } );

} );

describe( "media — the boundaries that matter", () => {

    it( "refuses to escape the media root", async () => {
        for ( const hostile of [
            "/wp-content/../outside.txt",
            "/wp-content/uploads/../../../outside.txt",
            "/wp-content/%2e%2e/outside.txt",
            "/wp-content/..%2foutside.txt"
        ] ) {
            const result = await get( hostile );
            assert.ok( !result.body.includes( "SHOULD NEVER BE SERVED" ), `traversal succeeded via ${ hostile }` );
        }
    } );

    it( "refuses a dotfile that found its way under the media root", async () => {
        const result = await get( "/wp-content/.env" );
        assert.notEqual( result.status, 200 );
        assert.ok( !result.body.includes( "SECRET=leaked" ) );
    } );

    it( "lists nothing for a directory URL", async () => {
        const result = await get( "/wp-content/uploads/2026/05/" );
        assert.ok( !result.body.includes( "cover.webp" ), "a directory must not be indexed" );
    } );

} );

describe( "media — configuration is validated, not assumed", () => {

    function collectRoutes( media ) {
        const routes = [];
        const server = { registerRoute( method, routePath ) { routes.push( method + " " + routePath ); return this; } };
        mountMediaRoutes( server, media );
        return routes;
    }

    it( "registers nothing without a root or prefixes", () => {
        assert.deepEqual( collectRoutes( undefined ), [] );
        assert.deepEqual( collectRoutes( { root: mediaRoot } ), [] );
        assert.deepEqual( collectRoutes( { prefixes: [ "/wp-content" ] } ), [] );
    } );

    it( "refuses a relative root rather than resolving it against an unpredictable cwd", () => {
        assert.deepEqual( collectRoutes( { root: "public", prefixes: [ "/wp-content" ] } ), [] );
    } );

    it( "normalizes a prefix and rejects one that is not a rooted path", () => {
        assert.equal( normalizePrefix( "/wp-content/" ), "/wp-content" );
        assert.equal( normalizePrefix( "/wp-content" ), "/wp-content" );
        assert.equal( normalizePrefix( "wp-content" ), null );
        assert.equal( normalizePrefix( "//evil.example" ), null );
        assert.equal( normalizePrefix( "" ), null );
    } );

    it( "skips an unusable prefix but keeps the usable ones", () => {
        const routes = collectRoutes( { root: mediaRoot, prefixes: [ "not-rooted", "/wp-content" ] } );
        assert.deepEqual( routes, [ "get /wp-content/*splat" ] );
    } );

} );
