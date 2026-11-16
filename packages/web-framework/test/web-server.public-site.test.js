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
 * A public site with no sign-in method, on a real server (CA-573).
 *
 * Found while building one: the routes that sign people in were answered with nobody able to sign in, a path with a
 * malformed escape was answered with a 400 where a 404 was due, and a cookie (a session's, a token's, the clearing of
 * a dead token) went out on a response declared `public`. One server per file, because core allows one ServiceInstance per
 * process.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
// Explicitly none: the deployment enables no sign-in method.
process.env.TI_WEB_AUTH_METHODS = "";

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );

// A public site as web-content builds one: every path unprotected, its pages declared shareable by a cache.
class PublicSite extends TiWebServer {

    constructor() {
        super( "ti-public-site-test", {} );
    }

    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
        this.addUnprotectedRoute( /^\/.*$/ );
    }

    defineWebApplicationRoutes() {
        super.defineWebApplicationRoutes();
        this.registerRoute( "get", "/page", ( request, response ) => {
            response.setHeader( "Cache-Control", "public, max-age=0, s-maxage=3600" );
            response.type( "text/plain" ).send( "a page" );
        } );
        this.registerRoute( "get", "/download", ( request, response ) => {
            response.setHeader( "Cache-Control", "public, max-age=31536000, immutable" );
            response.type( "text/plain" ).send( "a file" );
        } );
        this.registerRoute( "get", "/private", ( request, response ) => {
            response.setHeader( "Cache-Control", "private, no-store" );
            response.type( "text/plain" ).send( "per visitor" );
        } );
    }

}

const JSON_ACCEPT = { accept: "application/json" };
const DEAD_TOKEN = { cookie: "ti-xsrf-token=a-token-whose-session-is-gone" };

function setCookies( response ) {
    return response.headers.getSetCookie();
}

describe( "a public site with no sign-in method", () => {

    const server = new PublicSite();
    let url;

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    it( "answers no sign-in or signed-in user route", async () => {
        for ( const path of [ "/login/local", "/login/openid-google", "/me" ] ) {
            const response = await fetch( url + path, { headers: JSON_ACCEPT, redirect: "manual" } );
            assert.equal( response.status, 404, path );
            assert.deepEqual( setCookies( response ), [], `${ path } must create no session` );
        }
    } );

    it( "keeps sign-out, which creates no session and ends one left from before", async () => {
        const tokenResponse = await fetch( url + "/csrf-token" );
        const jar = setCookies( tokenResponse ).map( ( cookie ) => cookie.split( ";" )[ 0 ] ).join( "; " );
        const token = decodeURIComponent( /ti-xsrf-token=([^;]+)/.exec( jar )[ 1 ] );
        const response = await fetch( url + "/logout", { method: "POST", headers: { cookie: jar, "x-xsrf-token": token }, redirect: "manual" } );
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), "/" );
    } );

    it( "keeps /csrf-token, which a public form asks for its token", async () => {
        const response = await fetch( url + "/csrf-token" );
        assert.equal( response.status, 204 );
        assert.ok( setCookies( response ).some( ( cookie ) => cookie.startsWith( "ti-xsrf-token=" ) ) );
    } );

    it( "answers a path with a malformed escape with the 404 every unknown path gets, not a 400", async () => {
        // The last three match a framework route with a parameter (`/app/:view`, `/language/:code`, `/login/:method`).
        for ( const path of [ "/bg/%E0%A4%A", "/%", "/a/%zz/b", "/app/%E0%A4%A", "/language/%zz", "/login/%" ] ) {
            const response = await fetch( url + path, { headers: JSON_ACCEPT, redirect: "manual" } );
            assert.equal( response.status, 404, path );
        }
    } );

    it( "clears a dead token cookie on a public page and a download, and keeps that response out of shared caches", async () => {
        const expected = { "/page": "private, max-age=0", "/download": "private, max-age=31536000, immutable" };
        for ( const [ path, cacheControl ] of Object.entries( expected ) ) {
            const response = await fetch( url + path, { headers: DEAD_TOKEN } );
            assert.equal( response.status, 200 );
            assert.ok( setCookies( response ).some( ( cookie ) => /^ti-xsrf-token=;/.test( cookie ) ), `${ path } clears the cookie` );
            assert.equal( response.headers.get( "cache-control" ), cacheControl, path );
        }
    } );

    it( "keeps a session's cookies off a shared cache, once a form has asked for a token", async () => {
        // The capture form's way to a token makes a session, and `rolling` re-sends its cookie on every response.
        const tokenResponse = await fetch( url + "/csrf-token" );
        const jar = setCookies( tokenResponse ).map( ( cookie ) => cookie.split( ";" )[ 0 ] ).join( "; " );
        assert.match( jar, /connect\.sid=/ );
        const page = await fetch( url + "/page", { headers: { cookie: jar } } );
        assert.ok( setCookies( page ).length > 0, "the session's cookie goes out with the page" );
        assert.equal( page.headers.get( "cache-control" ), "private, max-age=0" );
    } );

    it( "leaves a page public for a visitor without the cookie, and a private answer as it was declared", async () => {
        const page = await fetch( url + "/page" );
        assert.equal( page.headers.get( "cache-control" ), "public, max-age=0, s-maxage=3600" );
        assert.deepEqual( setCookies( page ), [] );
        const declared = await fetch( url + "/private", { headers: DEAD_TOKEN } );
        assert.equal( declared.headers.get( "cache-control" ), "private, no-store" );
    } );

} );

describe( "the Cache-Control a response that sets a cookie goes out with", () => {

    const { privateCacheControl } = require( "#web-handlers" );

    it( "drops what lets a shared cache store it and keeps what the browser may keep", () => {
        assert.equal( privateCacheControl( "public, max-age=0, s-maxage=3600" ), "private, max-age=0" );
        assert.equal( privateCacheControl( "public, max-age=31536000, immutable" ), "private, max-age=31536000, immutable" );
        assert.equal( privateCacheControl( "max-age=60, proxy-revalidate" ), "private, max-age=60" );
        assert.equal( privateCacheControl( [ "public", "s-maxage=60" ] ), "private, no-cache" );
        assert.equal( privateCacheControl( undefined ), "private, no-cache" );
    } );

    it( "leaves one already kept from shared caches, and not one that is private for named fields only", () => {
        assert.equal( privateCacheControl( "private, no-cache" ), null );
        assert.equal( privateCacheControl( "no-store" ), null );
        assert.equal( privateCacheControl( "Private , max-age=0" ), null );
        assert.equal( privateCacheControl( "public, s-maxage=600, private=\"x-user\"" ), "private, private=\"x-user\"" );
    } );

    it( "reads a comma inside a quoted field list as part of that list, not as the end of a directive", () => {
        assert.equal(
            privateCacheControl( "public, max-age=600, private=\"X-User, private, X-Role\"" ),
            "private, max-age=600, private=\"X-User, private, X-Role\""
        );
        assert.equal(
            privateCacheControl( "no-cache=\"Set-Cookie, no-store\", s-maxage=60" ),
            "private, no-cache=\"Set-Cookie, no-store\""
        );
        assert.equal( privateCacheControl( "private=\"a\\\", b\", public" ), "private, private=\"a\\\", b\"" );
    } );

} );
