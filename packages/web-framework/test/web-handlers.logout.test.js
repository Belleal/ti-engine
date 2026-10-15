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
 * What signing out leaves behind in the browser (CA-498).
 *
 * The user menu signs out with an htmx POST whose answer is swapped into the page. Answered with a 303, htmx followed it
 * inside its XHR and swapped the sign-in page into the page the user was on, so that page never ended: its store still
 * held the signed-out user and `isAuthenticated: true`, and a component's watcher - removed with the old page, and
 * still firing 43 ms later - asked for data with no session. Measured in Chromium on an application built on this:
 * `GET /app/load-task-list` answered 401 in the console on every sign-out.
 *
 * An htmx sign-out is now answered with `HX-Redirect`, which htmx turns into a page load, so nothing of the session
 * stays in memory. A sign-out that is not htmx's - a plain form - still gets the 303 a browser follows itself.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const express = require( "express" );
const session = require( "express-session" );

const webHandlers = require( "#web-handlers" );

let server = null;
let base = null;

before( async () => {
    const app = express();
    // Wired as TiWebServer wires it: `secure: "auto"` marks the cookie Secure on HTTPS and still sets it on this plain-HTTP
    // test server.
    app.use( session( { secret: "test-only", resave: false, saveUninitialized: false, cookie: { path: "/", httpOnly: true, secure: "auto", sameSite: "lax" }, unset: "destroy" } ) );
    app.get( "/sign-in", ( request, response ) => {
        request.session.user = { userID: "u1" };
        response.send( "signed in" );
    } );
    app.get( "/who", ( request, response ) => response.send( ( request.session && request.session.user ) ? request.session.user.userID : "nobody" ) );
    app.post( "/logout", webHandlers.logoutHandler() );
    await new Promise( ( resolve ) => {
        server = app.listen( 0, "127.0.0.1", resolve );
    } );
    base = `http://127.0.0.1:${ server.address().port }`;
} );

after( () => server && server.close() );

/**
 * A session signed in, as the cookie a browser would send with it.
 *
 * @returns {Promise<string>}
 */
async function signedIn() {
    const response = await fetch( base + "/sign-in" );
    return response.headers.getSetCookie().map( ( header ) => header.split( ";" )[ 0 ] ).join( "; " );
}

/**
 * Signs out the way a page does, without following a redirect, so the answer itself can be read.
 *
 * @param {string} cookie
 * @param {Object<string, string>} [headers]
 * @returns {Promise<Response>}
 */
function signOut( cookie, headers = {} ) {
    return fetch( base + "/logout", { method: "POST", redirect: "manual", headers: Object.assign( { cookie: cookie }, headers ) } );
}

describe( "signing out (CA-498)", () => {

    it( "answers htmx with a page load, so nothing of the signed-in page stays in memory", async () => {
        const cookie = await signedIn();
        const response = await signOut( cookie, { "HX-Request": "true" } );
        assert.equal( response.status, 204 );
        assert.equal( response.headers.get( "hx-redirect" ), "/" );
        assert.equal( response.headers.get( "location" ), null, "a Location would be followed inside htmx's XHR, which is the defect" );
    } );

    it( "still ends the session when it answers htmx", async () => {
        const cookie = await signedIn();
        assert.equal( await ( await fetch( base + "/who", { headers: { cookie: cookie } } ) ).text(), "u1" );
        await signOut( cookie, { "HX-Request": "true" } );
        assert.equal( await ( await fetch( base + "/who", { headers: { cookie: cookie } } ) ).text(), "nobody" );
    } );

    it( "answers a plain form with the 303 a browser follows itself", async () => {
        const cookie = await signedIn();
        const response = await signOut( cookie );
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), "/" );
        assert.equal( response.headers.get( "hx-redirect" ), null );
        assert.equal( await ( await fetch( base + "/who", { headers: { cookie: cookie } } ) ).text(), "nobody" );
    } );

    it( "reads only htmx's own marker, and answers a request without a session the same way", async () => {
        assert.equal( ( await signOut( "", { "HX-Request": "false" } ) ).status, 303 );
        const response = await signOut( "", { "HX-Request": "true" } );
        assert.equal( response.status, 204 );
        assert.equal( response.headers.get( "hx-redirect" ), "/" );
    } );

} );
