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
const http = require( "node:http" );
const os = require( "node:os" );
const path = require( "node:path" );
const { mountMediaRoutes, normalizePrefix } = require( "#media" );

const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-media-" ) );
const mediaRoot = path.join( tempDir, "public" );
let listener;

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
} );

after( () => {
    if ( listener ) {
        listener.close();
    }
    fs.rmSync( tempDir, { recursive: true, force: true } );
} );

/*
 * Raw `http.request`, NOT `fetch`. A traversal test is only a test if the hostile path reaches the server: fetch
 * builds a URL object and resolves dot-segments client-side, so `/wp-content/../outside.txt` leaves as
 * `/outside.txt` and never touches the media mount at all. The assertion below then passes because nothing was
 * tested -- the worst kind of green. Writing the path straight onto the request line is what puts it on the wire.
 */
const get = ( requestPath ) => {
    return new Promise( ( resolve, reject ) => {
        const request = http.request( {
            hostname: "127.0.0.1",
            port: listener.address().port,
            method: "GET",
            path: requestPath
        }, ( response ) => {
            let body = "";
            response.setEncoding( "utf8" );
            response.on( "data", ( chunk ) => { body += chunk; } );
            response.on( "end", () => resolve( {
                status: response.statusCode,
                body: body,
                location: response.headers.location,
                cacheControl: response.headers[ "cache-control" ]
            } ) );
        } );
        request.on( "error", reject );
        request.end();
    } );
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
            // Not just "the bytes did not appear" -- a 200 for any of these means the mount resolved something
            // outside its root, and the next file up the tree might not be a decoy.
            assert.notEqual( result.status, 200, `traversal resolved to a 200 via ${ hostile }` );
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
