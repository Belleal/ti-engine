/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the catch-all content resolver. Two §8 invariants live here: an alias 301s to the canonical path, and a
 * NON-PUBLIC RESPONSE NEVER CARRIES PUBLIC CACHE HEADERS -- an authenticated body served from a CDN to an anonymous
 * visitor is the single most likely way gated content leaks, so the header policy is keyed on the record's
 * visibility (not on what was rendered) and a gated teaser is private too.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const { cacheHeadersFor, viewerFromRequest, contentHandler } = require( "#content-routes" );

function post( id, path, extra ) {
    return Object.assign( {
        id: id, type: "post", path: path, lang: "en", title: "T",
        visibility: "public", status: "published", world: "anarandaris", form: "song", seo: { description: "D" }
    }, extra || {} );
}

function fakeResponse() {
    return {
        headers: {}, statusCode: null, body: null, redirectedTo: null, redirectStatus: null, contentType: null,
        set( name, value ) { this.headers[ name ] = value; return this; },
        status( code ) { this.statusCode = code; return this; },
        type( value ) { this.contentType = value; return this; },
        send( body ) { this.body = body; return this; },
        redirect( code, url ) { this.redirectStatus = code; this.redirectedTo = url; return this; }
    };
}

function fakeRequest( path, session ) {
    return { path: path, session: session || {} };
}

describe( "content-routes — cache headers (the leak-prevention invariant)", () => {

    it( "gives a public record edge-cacheable headers", () => {
        const headers = cacheHeadersFor( post( "a", "/a/" ) );
        assert.match( headers[ "Cache-Control" ], /^public,/ );
        assert.ok( headers[ "Cache-Control" ].includes( "s-maxage=600" ) );
        assert.equal( headers.Vary, undefined );
    } );

    it( "never gives a non-public record public cache headers", () => {
        for ( const visibility of [ "authenticated", "role:beta", "role:__none__" ] ) {
            const headers = cacheHeadersFor( post( "a", "/a/", { visibility: visibility } ) );
            assert.equal( headers[ "Cache-Control" ], "private, no-store" );
            assert.equal( headers.Vary, "Cookie" );
            assert.ok( !headers[ "Cache-Control" ].includes( "public" ) );
        }
    } );

    it( "treats a missing or unrecognised visibility as non-public", () => {
        const bare = post( "a", "/a/" );
        delete bare.visibility;
        assert.equal( cacheHeadersFor( bare )[ "Cache-Control" ], "private, no-store" );
        assert.equal( cacheHeadersFor( post( "a", "/a/", { visibility: "bogus" } ) )[ "Cache-Control" ], "private, no-store" );
    } );

} );

describe( "content-routes — viewerFromRequest", () => {

    it( "maps an anonymous request to an unauthenticated viewer with no roles", () => {
        assert.deepEqual( viewerFromRequest( fakeRequest( "/" ) ), { authenticated: false, roles: [] } );
    } );

    it( "maps a session user to an authenticated viewer carrying their roles", () => {
        const viewer = viewerFromRequest( fakeRequest( "/", { user: { roles: [ "admin", "beta" ] } } ) );
        assert.equal( viewer.authenticated, true );
        assert.deepEqual( viewer.roles, [ "admin", "beta" ] );
    } );

    it( "tolerates a session user with no roles array", () => {
        assert.deepEqual( viewerFromRequest( fakeRequest( "/", { user: {} } ) ), { authenticated: true, roles: [] } );
    } );

} );

describe( "content-routes — catch-all resolution", () => {

    const repository = new ContentRepository( buildIndex( [
        post( "pub", "/pub/" ),
        post( "gated", "/gated/", { visibility: "authenticated", teaser: "A glimpse." } ),
        post( "deny", "/deny/", { visibility: "role:__none__" } ),
        post( "aliased", "/canonical/", { aliases: [ "/old/" ] } )
    ] ) );
    const handler = contentHandler( repository, { baseUrl: "https://anarandaris.com" } );

    it( "renders a public record with a 200 and public cache headers", () => {
        const res = fakeResponse();
        handler( fakeRequest( "/pub/" ), res, () => assert.fail( "should not fall through" ) );
        assert.equal( res.statusCode, 200 );
        assert.match( res.headers[ "Cache-Control" ], /^public,/ );
        assert.ok( String( res.body ).includes( "<!DOCTYPE html>" ) );
    } );

    it( "301s an alias to the canonical path", () => {
        const res = fakeResponse();
        handler( fakeRequest( "/old/" ), res, () => assert.fail( "should not fall through" ) );
        assert.equal( res.redirectStatus, 301 );
        assert.equal( res.redirectedTo, "/canonical/" );
    } );

    it( "falls through to the framework 404 on a miss", () => {
        let fellThrough = false;
        handler( fakeRequest( "/nope/" ), fakeResponse(), () => { fellThrough = true; } );
        assert.equal( fellThrough, true );
    } );

    it( "treats a hidden record as a miss, even for an admin", () => {
        let fellThrough = false;
        handler( fakeRequest( "/deny/", { user: { roles: [ "admin" ] } } ), fakeResponse(), () => { fellThrough = true; } );
        assert.equal( fellThrough, true );
    } );

    it( "renders a gated record in teaser mode with private headers for an anonymous visitor", () => {
        const res = fakeResponse();
        handler( fakeRequest( "/gated/" ), res, () => assert.fail( "should not fall through" ) );
        assert.equal( res.statusCode, 200 );
        assert.equal( res.headers[ "Cache-Control" ], "private, no-store" );
        assert.equal( res.headers.Vary, "Cookie" );
    } );

    it( "passes the render mode through: teaser for a denied viewer, full once authorised", () => {
        const modes = [];
        const spyHandler = contentHandler( repository, {
            baseUrl: "https://anarandaris.com",
            renderPage: ( record, context ) => { modes.push( context.mode ); return "<html></html>"; }
        } );
        spyHandler( fakeRequest( "/gated/" ), fakeResponse(), () => {} );
        spyHandler( fakeRequest( "/gated/", { user: { roles: [] } } ), fakeResponse(), () => {} );
        assert.deepEqual( modes, [ "teaser", "full" ] );
    } );

    it( "renders a markdown body through the markdown renderer", () => {
        const repo = new ContentRepository( buildIndex( [
            post( "md", "/md/", { body: "Hello *there*.", bodyFormat: "markdown" } )
        ] ) );
        const res = fakeResponse();
        contentHandler( repo, { baseUrl: "https://anarandaris.com" } )( fakeRequest( "/md/" ), res, () => assert.fail( "should not fall through" ) );
        assert.ok( String( res.body ).includes( "<em>there</em>" ), "markdown should be rendered, not dropped or escaped" );
    } );

    it( "escapes raw HTML embedded in a markdown body (the renderer runs with html:false)", () => {
        const repo = new ContentRepository( buildIndex( [
            post( "md", "/md/", { body: "before <script>alert(1)</script> after", bodyFormat: "markdown" } )
        ] ) );
        const res = fakeResponse();
        contentHandler( repo, { baseUrl: "https://anarandaris.com" } )( fakeRequest( "/md/" ), res, () => assert.fail( "should not fall through" ) );
        assert.ok( !String( res.body ).includes( "<script>" ), "raw HTML in markdown must not reach the page" );
        assert.ok( String( res.body ).includes( "&lt;script&gt;" ) );
    } );

    it( "does NOT emit a bodyFormat:'html' body — its sanitiser runs at import, and the importer does not exist yet", () => {
        const repo = new ContentRepository( buildIndex( [
            post( "legacy", "/legacy/", { body: "<p>legacy</p><script>alert(1)</script>", bodyFormat: "html" } )
        ] ) );
        const res = fakeResponse();
        contentHandler( repo, { baseUrl: "https://anarandaris.com" } )( fakeRequest( "/legacy/" ), res, () => assert.fail( "should not fall through" ) );
        const body = String( res.body );
        assert.equal( res.statusCode, 200, "the record still serves" );
        assert.ok( !body.includes( "<script>" ), "unsanitised legacy markup must not be emitted" );
        assert.ok( !body.includes( "<p>legacy</p>" ), "the html body is withheld entirely, not partially rendered" );
    } );

    it( "leaves teaser mode showing the teaser, never the body", () => {
        const repo = new ContentRepository( buildIndex( [
            post( "g", "/g/", { visibility: "authenticated", teaser: "A glimpse.", body: "Full secret text.", bodyFormat: "markdown" } )
        ] ) );
        const res = fakeResponse();
        contentHandler( repo, { baseUrl: "https://anarandaris.com" } )( fakeRequest( "/g/" ), res, () => assert.fail( "should not fall through" ) );
        const body = String( res.body );
        assert.ok( body.includes( "A glimpse." ) );
        assert.ok( !body.includes( "Full secret text." ), "a gated teaser must not leak the body" );
    } );

    it( "gives the render function the resolved record and repository", () => {
        let seen = null;
        const spyHandler = contentHandler( repository, {
            baseUrl: "https://anarandaris.com",
            renderPage: ( record, context ) => { seen = { id: record.id, hasRepo: !!context.repository, viewer: context.viewer }; return "x"; }
        } );
        spyHandler( fakeRequest( "/pub/" ), fakeResponse(), () => {} );
        assert.equal( seen.id, "pub" );
        assert.equal( seen.hasRepo, true );
        assert.equal( seen.viewer.authenticated, false );
    } );

} );
