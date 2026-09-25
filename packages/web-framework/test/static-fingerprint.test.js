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

/**
 * Covers content-fingerprinted `/static` references (CA-174).
 * <br/>
 * A `/static` URL names a file, not a version of it, so it can only be served revalidating — one conditional request
 * per script and stylesheet on every page load (10–11 per refresh, measured). A reference that also carries the hash of
 * the file's bytes names exactly one version, and only such a request is answered `immutable`: the rule this repository
 * learned twice is never to promise that for a URL that is not content-addressed.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const http = require( "node:http" );
const os = require( "node:os" );
const path = require( "node:path" );

const express = require( "express" );

const staticFingerprint = require( "#static-fingerprint" );
const TiWebServer = require( "#web-server" );

const IMMUTABLE_YEAR = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=0, must-revalidate";

// Two static roots, framework default first, as TiWebServer#staticContentPaths holds them.
const WORK = fs.mkdtempSync( path.join( os.tmpdir(), "ti-fingerprint-" ) );
const FRAMEWORK_ROOT = path.join( WORK, "framework" );
const APP_ROOT = path.join( WORK, "app" );
const ROOTS = [ FRAMEWORK_ROOT, APP_ROOT ];

const write = ( root, relative, content ) => {
    fs.mkdirSync( path.dirname( path.join( root, relative ) ), { recursive: true } );
    fs.writeFileSync( path.join( root, relative ), content );
};
const hashOf = ( content ) => crypto.createHash( "sha256" ).update( content ).digest( "hex" ).slice( 0, 12 );

write( FRAMEWORK_ROOT, "scripts/app.js", "console.log( 'framework' );" );
write( FRAMEWORK_ROOT, "scripts/shared.css", "body { color: red; }" );
write( APP_ROOT, "scripts/app.js", "console.log( 'application override' );" );

after( () => fs.rmSync( WORK, { recursive: true, force: true } ) );

describe( "staticFingerprint.fingerprintStaticReferences", () => {

    it( "appends the file's content hash to every /static src and href it can resolve", () => {
        const html = `<script src="/static/scripts/app.js"></script><link href='/static/scripts/shared.css' rel="stylesheet">`;
        const rewritten = staticFingerprint.fingerprintStaticReferences( html, ROOTS );
        assert.ok( rewritten.includes( `src="/static/scripts/app.js?v=${ hashOf( "console.log( 'application override' );" ) }"` ), rewritten );
        assert.ok( rewritten.includes( `href='/static/scripts/shared.css?v=${ hashOf( "body { color: red; }" ) }'` ), rewritten );
    } );

    it( "hashes the file express.static would serve — an application's override, not the framework file it shadows", () => {
        const rewritten = staticFingerprint.fingerprintStaticReferences( `<script src="/static/scripts/app.js"></script>`, ROOTS );
        assert.equal( rewritten.includes( hashOf( "console.log( 'framework' );" ) ), false );
    } );

    it( "leaves a reference it cannot resolve, or one that already has a query, exactly as written", () => {
        const html = `<script src="/static/scripts/missing.js"></script><img src="/static/scripts/shared.css?x=1"><a href="/elsewhere/a.js">`;
        assert.equal( staticFingerprint.fingerprintStaticReferences( html, ROOTS ), html );
    } );

    it( "refuses a reference that climbs out of the static tree", () => {
        write( WORK, "secret.txt", "not static" );
        assert.equal( staticFingerprint.resolveStaticFile( ROOTS, "../secret.txt" ), null );
        assert.equal( staticFingerprint.resolveStaticFile( ROOTS, "..%2Fsecret.txt" ), null );
    } );

    it( "gives an edited file a new fingerprint at once, rather than a cached one for bytes no longer served", () => {
        write( APP_ROOT, "scripts/edited.js", "one" );
        const before = staticFingerprint.fingerprintOfFile( path.join( APP_ROOT, "scripts/edited.js" ) );
        write( APP_ROOT, "scripts/edited.js", "two, longer" );
        const after = staticFingerprint.fingerprintOfFile( path.join( APP_ROOT, "scripts/edited.js" ) );
        assert.equal( before, hashOf( "one" ) );
        assert.equal( after, hashOf( "two, longer" ) );
    } );

} );

describe( "TiWebServer.staticResponseCacheControl", () => {

    const policy = TiWebServer.resolveStaticCachePolicy();
    const file = path.join( APP_ROOT, "scripts/app.js" );

    it( "is immutable only for the file's current fingerprint", () => {
        assert.equal( TiWebServer.staticResponseCacheControl( APP_ROOT, file, policy, hashOf( "console.log( 'application override' );" ) ), IMMUTABLE_YEAR );
    } );

    it( "falls back to the configured policy for no fingerprint, a stale one, or anything malformed", () => {
        for ( const requested of [ undefined, "", hashOf( "an older build" ), "not-a-hash", [ "array" ], 42 ] ) {
            assert.equal( TiWebServer.staticResponseCacheControl( APP_ROOT, file, policy, requested ), REVALIDATE, `for ${ JSON.stringify( requested ) }` );
        }
    } );

} );

describe( "a /static mount wired as TiWebServer wires it", () => {

    let server = null;
    let base = null;

    before( async () => {
        const app = express();
        const policy = TiWebServer.resolveStaticCachePolicy();
        [ ...ROOTS ].reverse().forEach( ( root ) => {
            app.use( "/static", express.static( root, {
                setHeaders: ( response, filePath, stat ) => {
                    response.setHeader( "Cache-Control", TiWebServer.staticResponseCacheControl( root, filePath, policy, response.req.query.v, stat ) );
                }
            } ) );
        } );
        await new Promise( ( resolve ) => {
            server = app.listen( 0, "127.0.0.1", resolve );
        } );
        base = `http://127.0.0.1:${ server.address().port }`;
    } );

    after( () => server && server.close() );

    const get = ( url ) => new Promise( ( resolve, reject ) => {
        http.get( url, ( response ) => {
            let body = "";
            response.on( "data", ( chunk ) => {
                body += chunk;
            } );
            response.on( "end", () => resolve( { status: response.statusCode, headers: response.headers, body: body } ) );
        } ).on( "error", reject );
    } );

    it( "serves the reference the rewrite produced as immutable, and the override's bytes", async () => {
        const reference = staticFingerprint.fingerprintStaticReferences( `<script src="/static/scripts/app.js"></script>`, ROOTS ).match( /src="([^"]+)"/ )[ 1 ];
        const response = await get( base + reference );
        assert.equal( response.status, 200 );
        assert.equal( response.headers[ "cache-control" ], IMMUTABLE_YEAR );
        assert.equal( response.body, "console.log( 'application override' );" );
    } );

    it( "serves a bare or stale reference revalidating, as before", async () => {
        assert.equal( ( await get( `${ base }/static/scripts/shared.css` ) ).headers[ "cache-control" ], REVALIDATE );
        assert.equal( ( await get( `${ base }/static/scripts/shared.css?v=000000000000` ) ).headers[ "cache-control" ], REVALIDATE );
    } );

} );
