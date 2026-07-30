/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the terminal 404. Found by booting the site rather than by any unit test: without this handler an
 * unknown URL reaches the framework's invalidRouteHandler, which redirects to /not-found — and that page answers
 * 200. A crawler then records a success for a URL that does not exist, which is a soft 404: it pollutes the index
 * and hides broken links from the reports that would otherwise surface them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { notFoundHandler, mountContentRoutes } = require( "#routes" );

function fakeResponse() {
    return {
        headers: {}, statusCode: null, body: null, locals: { nonce: "N1" },
        set( name, value ) { this.headers[ name ] = value; return this; },
        status( code ) { this.statusCode = code; return this; },
        type() { return this; },
        send( body ) { this.body = body; return this; }
    };
}

describe( "routes — the terminal 404", () => {

    it( "answers 404, not a redirect to a page that answers 200", () => {
        const res = fakeResponse();
        notFoundHandler( { site: { title: "S" } } )( { path: "/no/such/page/" }, res );
        assert.equal( res.statusCode, 404 );
        assert.ok( String( res.body ).includes( "<!DOCTYPE html>" ) );
    } );

    it( "is never edge-cached", () => {
        const res = fakeResponse();
        notFoundHandler( {} )( { path: "/x" }, res );
        assert.equal( res.headers[ "Cache-Control" ], "private, no-store" );
    } );

    it( "renders the configured copy and stays noindex", () => {
        const res = fakeResponse();
        notFoundHandler( { labels: { notFoundTitle: "Nothing at this path", notFoundBody: "Try the beginning." } } )( { path: "/x" }, res );
        assert.ok( String( res.body ).includes( "Nothing at this path" ) );
        assert.ok( String( res.body ).includes( "Try the beginning." ) );
        assert.ok( String( res.body ).includes( "noindex" ) );
    } );

    it( "never says which kind of miss it was", () => {
        const res = fakeResponse();
        notFoundHandler( {} )( { path: "/x" }, res );
        const copy = String( res.body ).replace( /<[^>]+>/g, " " ).toLowerCase();
        for ( const leak of [ "draft", "unpublished", "hidden", "private", "gated" ] ) {
            assert.ok( !copy.includes( leak ), `404 copy must not mention "${ leak }"` );
        }
    } );

    it( "carries the request nonce so its scripts are not blocked", () => {
        const res = fakeResponse();
        notFoundHandler( { assets: { scripts: [ "/static/web-content.js" ] } } )( { path: "/x" }, res );
        assert.ok( String( res.body ).includes( "nonce=\"N1\"" ) );
    } );

    it( "registers for GET only, so the framework's POST service proxy is not shadowed", () => {
        const registered = [];
        const server = { registerRoute( method, path ) { registered.push( method + " " + String( path ) ); return this; } };
        mountContentRoutes( server, { repository: { list: () => [], resolve: () => ( { outcome: "miss" } ) } } );
        const catchAlls = registered.filter( ( entry ) => entry.includes( "splat" ) );
        assert.deepEqual( catchAlls, [ "get *splat" ] );
    } );

    it( "can be switched off for a consumer that wants the framework's behaviour", () => {
        const registered = [];
        const server = { registerRoute( method, path ) { registered.push( method + " " + String( path ) ); return this; } };
        mountContentRoutes( server, { repository: {}, notFound: false } );
        assert.equal( registered.filter( ( entry ) => entry.includes( "splat" ) ).length, 0 );
    } );

} );
