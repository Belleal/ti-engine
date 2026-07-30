/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Draft preview, and the redirects an alias cannot express.
 *
 * Preview widens what a draft can reach, so the tests are written from the leak side: a draft must stay out of every
 * listing even for the viewer allowed to preview it, must never be edge-cacheable however public its `visibility`
 * claims to be, and must never be indexable. Any one of those failing puts an unfinished page in front of the world,
 * and none of them would be noticed by looking at the page.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );
const { cacheHeadersFor, viewerFromRequest } = require( "#content-routes" );
const { shouldNoindex } = require( "#document" );
const { renderDocument } = require( "#page" );
const { mountRedirects } = require( "#routes" );

function page( id, extra ) {
    return Object.assign( {
        id: id, type: "page", path: "/" + id + "/", lang: "en", title: "T " + id,
        visibility: "public", status: "published", sections: [ { type: "prose", body: "x" } ]
    }, extra || {} );
}

const ANON = { authenticated: false, roles: [] };
const ADMIN = viewerFromRequest( { session: { user: { roles: [ "admin" ] } } } );
const BETA = viewerFromRequest( { session: { user: { roles: [ "beta" ] } } } );

const index = buildIndex( [ page( "live" ), page( "draft", { status: "draft" } ) ] );
const repository = new ContentRepository( index );

describe( "draft preview — who can open one", () => {

    it( "is a capability the application grants, not a role the repository infers", () => {
        assert.equal( ContentRepository.canPreview( ADMIN ), true );
        assert.equal( ContentRepository.canPreview( BETA ), false );
        assert.equal( ContentRepository.canPreview( ANON ), false );
        assert.equal( ContentRepository.canPreview( { roles: [ "admin" ] } ), false, "the role alone grants nothing" );
    } );

    it( "opens a draft by path for a previewer, and 404s for everyone else", () => {
        assert.equal( repository.resolve( "/draft/", ADMIN ).outcome, "visible" );
        assert.equal( repository.resolve( "/draft/", BETA ).outcome, "miss" );
        assert.equal( repository.resolve( "/draft/", ANON ).outcome, "miss" );
    } );

    it( "flags the result so the caller can refuse to cache or index it", () => {
        assert.equal( repository.resolve( "/draft/", ADMIN ).preview, true );
        assert.equal( repository.resolve( "/live/", ADMIN ).preview, undefined );
    } );

    it( "still refuses a hidden draft — preview is not a master key", () => {
        const guarded = new ContentRepository( buildIndex( [
            page( "secret", { status: "draft", visibility: "role:__none__" } )
        ] ) );
        assert.equal( guarded.resolve( "/secret/", ADMIN ).outcome, "miss" );
    } );

} );

describe( "draft preview — a draft reaches no listing, even for a previewer", () => {

    it( "is absent from list and count", () => {
        assert.deepEqual( repository.list( {}, ADMIN ).map( ( i ) => i.record.id ), [ "live" ] );
        assert.equal( repository.count( {}, ADMIN ), 1 );
    } );

    it( "is absent from getById and from a curated list", () => {
        assert.equal( repository.getById( "draft", ADMIN ), null );
        assert.deepEqual( repository.resolveIds( [ "draft", "live" ], ADMIN ).map( ( i ) => i.record.id ), [ "live" ] );
    } );

    it( "keeps every surface identical for a previewer and an anonymous visitor", () => {
        // Only direct path resolution differs. A listing is the surface most likely to be cached, so a draft
        // slipping into one would be invisible until someone saw it in the wild.
        assert.deepEqual( repository.list( {}, ADMIN ), repository.list( {}, ANON ) );
    } );

} );

describe( "draft preview — the response cannot leak", () => {

    it( "never carries public cache headers, however public the visibility says it is", () => {
        const headers = cacheHeadersFor( page( "draft", { status: "draft", visibility: "public" } ) );
        assert.equal( headers[ "Cache-Control" ], "private, no-store" );
        assert.equal( headers.Vary, "Cookie" );
    } );

    it( "still edge-caches a published public record", () => {
        assert.match( cacheHeadersFor( page( "live" ) )[ "Cache-Control" ], /^public,/ );
    } );

    it( "is noindex in every mode, teaser included", () => {
        const draft = page( "draft", { status: "draft" } );
        assert.equal( shouldNoindex( draft, "full" ), true );
        assert.equal( shouldNoindex( draft, "teaser" ), true, "a teaser of a draft is still a draft" );
    } );

    it( "shows a banner so a preview cannot be mistaken for the live page", () => {
        const out = renderDocument( page( "draft", { status: "draft" } ), { preview: true, baseUrl: "https://x.test", site: {} } );
        assert.ok( out.includes( "status-pill-label\">Draft preview" ) );
        assert.ok( out.includes( "noindex" ) );
        assert.ok( !renderDocument( page( "live" ), { baseUrl: "https://x.test", site: {} } ).includes( "Draft preview" ) );
    } );

} );

describe( "redirects — the escape hatch an alias cannot be", () => {

    function collect( redirects ) {
        const routes = [];
        const server = { registerRoute( method, path, handler ) { routes.push( { method, path, handler } ); return this; } };
        mountRedirects( server, redirects );
        return routes;
    }

    it( "registers a rule and answers 301 by default", () => {
        const routes = collect( [ { from: "/feed/", to: "/rss.xml" } ] );
        assert.equal( routes.length, 1 );
        let captured = null;
        routes[ 0 ].handler( {}, { redirect( status, url ) { captured = { status, url }; } } );
        assert.deepEqual( captured, { status: 301, url: "/rss.xml" } );
    } );

    it( "carries a query string, which an alias cannot", () => {
        const routes = collect( [ { from: "/writings/page/2/", to: "/writings/?page=2" } ] );
        let captured = null;
        routes[ 0 ].handler( {}, { redirect( status, url ) { captured = url; } } );
        assert.equal( captured, "/writings/?page=2" );
    } );

    it( "refuses an absolute or protocol-relative target — that would be an open redirect", () => {
        assert.deepEqual( collect( [ { from: "/a/", to: "https://evil.example" } ] ), [] );
        assert.deepEqual( collect( [ { from: "/a/", to: "//evil.example" } ] ), [] );
    } );

    it( "refuses a source that is not a rooted path, and tolerates junk", () => {
        assert.deepEqual( collect( [ { from: "a/", to: "/b/" } ] ), [] );
        assert.deepEqual( collect( [ null, {}, { from: "/a/" }, { to: "/b/" } ] ), [] );
        assert.deepEqual( collect( undefined ), [] );
    } );

    it( "honours an explicit permanent-or-temporary status", () => {
        const routes = collect( [ { from: "/a/", to: "/b/", status: 302 }, { from: "/c/", to: "/d/", status: 999 } ] );
        let first = null, second = null;
        routes[ 0 ].handler( {}, { redirect: ( s ) => { first = s; } } );
        routes[ 1 ].handler( {}, { redirect: ( s ) => { second = s; } } );
        assert.equal( first, 302 );
        assert.equal( second, 301, "an unrecognised status falls back to a permanent redirect" );
    } );

} );
