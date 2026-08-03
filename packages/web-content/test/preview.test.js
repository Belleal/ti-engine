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

    // Redirects mount as ONE decode-aware route with a table behind it, not one Express route per rule -- a literal
    // non-ASCII route path can never match the encoded request Express receives. So the tests drive it the way
    // Express does: give the handler a request path and see what comes back.
    function collect( redirects ) {
        const routes = [];
        const server = { registerRoute( method, path, handler ) { routes.push( { method, path, handler } ); return this; } };
        mountRedirects( server, redirects );
        return routes;
    }

    function follow( redirects, requestPath ) {
        const routes = collect( redirects );
        if ( routes.length === 0 ) {
            return null;
        }
        let captured = null;
        let fellThrough = false;
        routes[ 0 ].handler(
            { path: requestPath },
            { redirect( status, url ) { captured = { status: status, url: url }; } },
            () => { fellThrough = true; }
        );
        return fellThrough ? null : captured;
    }

    it( "registers a rule and answers 301 by default", () => {
        assert.deepEqual( follow( [ { from: "/feed/", to: "/rss.xml" } ], "/feed/" ), { status: 301, url: "/rss.xml" } );
    } );

    it( "falls through for a path with no rule, instead of claiming it", () => {
        // It is registered as a catch-all, so anything it does not own has to reach the content resolver behind it.
        assert.equal( follow( [ { from: "/feed/", to: "/rss.xml" } ], "/something-else/" ), null );
    } );

    it( "fires for a Cyrillic source, which an Express route path cannot", () => {
        // The request arrives percent-encoded. Registering `/категория/` as a route would never match it, and
        // storing the encoded form matches only the hex case the client happens to send.
        const rule = [ { from: "/категория/", to: "/writings/" } ];
        assert.deepEqual( follow( rule, "/%D0%BA%D0%B0%D1%82%D0%B5%D0%B3%D0%BE%D1%80%D0%B8%D1%8F/" ), { status: 301, url: "/writings/" } );
        assert.deepEqual( follow( rule, "/%d0%ba%d0%b0%d1%82%d0%b5%d0%b3%d0%be%d1%80%d0%b8%d1%8f/" ), { status: 301, url: "/writings/" } );
    } );

    it( "carries a query string, which an alias cannot", () => {
        assert.equal( follow( [ { from: "/writings/page/2/", to: "/writings/?page=2" } ], "/writings/page/2/" ).url, "/writings/?page=2" );
    } );

    it( "refuses an absolute or protocol-relative target — that would be an open redirect", () => {
        assert.deepEqual( collect( [ { from: "/a/", to: "https://evil.example" } ] ), [] );
        assert.deepEqual( collect( [ { from: "/a/", to: "//evil.example" } ] ), [] );
    } );

    it( "refuses the shapes that only LOOK site-relative", () => {
        // A browser folds a backslash into a slash, so `/\evil.example` resolves to https://evil.example/ while a
        // naive `indexOf( "//" )` check reads it as a rooted path. Validation resolves the target instead of
        // pattern-matching, so every variant of this fails at once.
        for ( const hostile of [ "/\\evil.example", "/\\\\evil.example", "/\\/evil.example", "https:/\\evil.example" ] ) {
            assert.deepEqual( collect( [ { from: "/a/", to: hostile } ] ), [], `accepted hostile target ${ JSON.stringify( hostile ) }` );
        }
    } );

    it( "still accepts the ordinary site-relative targets", () => {
        for ( const good of [ "/rss.xml", "/writings/?page=2", "/a/b/c/", "/a#frag" ] ) {
            assert.equal( collect( [ { from: "/x/", to: good } ] ).length, 1, `rejected valid target ${ good }` );
        }
    } );

    it( "refuses a source that is not a rooted path, and tolerates junk", () => {
        assert.deepEqual( collect( [ { from: "a/", to: "/b/" } ] ), [] );
        assert.deepEqual( collect( [ null, {}, { from: "/a/" }, { to: "/b/" } ] ), [] );
        assert.deepEqual( collect( undefined ), [] );
    } );

    it( "honours an explicit permanent-or-temporary status", () => {
        const rules = [ { from: "/a/", to: "/b/", status: 302 }, { from: "/c/", to: "/d/", status: 999 } ];
        assert.equal( follow( rules, "/a/" ).status, 302 );
        assert.equal( follow( rules, "/c/" ).status, 301, "an unrecognised status falls back to a permanent redirect" );
    } );

} );

/*
 * A percent-encoded request path.
 *
 * Express hands the handler the raw path, so a browser asking for a Cyrillic URL arrives as `%D0%BD…`. The index is
 * an exact Map lookup against literal characters, so before this the alias could not match -- silently, since the
 * content file looks correct and nothing throws.
 */
describe( "request paths arrive percent-encoded", () => {

    const { decodePath } = require( "#content-routes" );

    it( "decodes a non-ASCII path to the form records are authored in", () => {
        assert.equal( decodePath( "/bg/%D0%BD%D0%B0%D1%87%D0%B0%D0%BB%D0%BE/" ), "/bg/начало/" );
    } );

    it( "decodes either hex case, because the client chooses it", () => {
        // Yoast emitted lowercase, browsers send uppercase. Storing one encoded form would match only one of them.
        assert.equal( decodePath( "/%D0%B1%D0%BB%D0%BE%D0%B3/" ), decodePath( "/%d0%b1%d0%bb%d0%be%d0%b3/" ) );
    } );

    it( "leaves an encoded slash alone, so a slug cannot address a different record", () => {
        // decodeURIComponent would turn this into "/a/b/" and change which path is being asked for.
        assert.equal( decodePath( "/a%2Fb/" ), "/a%2Fb/" );
    } );

    it( "returns a malformed sequence unchanged rather than throwing", () => {
        // decodeURI raises URIError on these; uncaught, a hostile request would be a 500 instead of a 404.
        assert.doesNotThrow( () => decodePath( "/%E0%A4%A" ) );
        assert.equal( decodePath( "/%E0%A4%A" ), "/%E0%A4%A" );
    } );

    it( "leaves an ordinary ASCII path untouched", () => {
        assert.equal( decodePath( "/writings/some-post/" ), "/writings/some-post/" );
    } );

} );

/*
 * The home route.
 *
 * The failure this covers is the loudest-looking silent one on the whole site: with no published record at `/`, the
 * root used to fall through to the framework's application shell, which answers 200 with a login screen. A reader
 * sees a foreign page where the home page belongs, and a crawler records a successful response for the single most
 * important URL on the site.
 */
describe( "the home route claims / for content", () => {

    const { mountHomeRoute } = require( "#routes" );

    function request( repository, options ) {
        const routes = [];
        const server = { registerRoute( method, path, handler ) { routes.push( handler ); return this; } };
        mountHomeRoute( server, Object.assign( { repository: repository, site: {}, labels: {} }, options || {} ) );
        let status = null, body = "", fellThrough = false;
        routes[ 0 ](
            { path: "/", query: {}, session: {} },
            {
                locals: {}, set() { return this; }, type() { return this; },
                status( code ) { status = code; return this; },
                send( out ) { body = String( out ); return this; }
            },
            () => { fellThrough = true; }
        );
        return { status: status, body: body, fellThrough: fellThrough };
    }

    const published = new ContentRepository( buildIndex( [ page( "home", { path: "/" } ) ] ) );
    const draftOnly = new ContentRepository( buildIndex( [ page( "home", { path: "/", status: "draft" } ) ] ) );

    it( "serves the home record when one is published", () => {
        const result = request( published );
        assert.equal( result.status, 200 );
        assert.equal( result.fellThrough, false );
    } );

    it( "answers its own 404 when the home record is a draft, not the application shell", () => {
        const result = request( draftOnly );
        assert.equal( result.status, 404, "the site root must not answer 200 with somebody else's page" );
        assert.equal( result.fellThrough, false );
    } );

    it( "answers 404 when no record claims / at all", () => {
        assert.equal( request( new ContentRepository( buildIndex( [] ) ) ).status, 404 );
    } );

    it( "still falls through for a genuine hybrid that opts out", () => {
        assert.equal( request( draftOnly, { notFound: false } ).fellThrough, true );
    } );

} );
