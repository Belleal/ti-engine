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
 * A sign-out that completes while another request is still refreshing its roles (CA-587), on a real `TiWebServer`.
 *
 * The other request loaded the session before the sign-out destroyed it. Its asynchronous `refreshSession` (CA-585)
 * then changed the roles, and express-session wrote its copy back at the response's end: the session the person had just
 * ended was in the store again, and the old cookie signed them in. The store now refuses to bring back a destroyed ID
 * (`session-store.ended.test.js`); this is the race as a browser meets it. One server per file, because core allows one
 * ServiceInstance per process.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const PASSWORD = "sign-out-race-pass-1";
const USERS = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "ti-sign-out-race-" ) ), "users.json" );

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";
process.env.TI_WEB_AUTH_LOCAL_USERS_PATH = USERS;
delete process.env.TI_WEB_APPLICATION_HOME;

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

const cacheStub = installInMemoryCache();

const localUserDirectory = require( "#local-user-directory" );
fs.writeFileSync( USERS, JSON.stringify( [ { username: "tester", email: "tester@example.com", name: "Tester", passwordHash: localUserDirectory.hashPassword( PASSWORD ) } ] ) );

const TiWebServer = require( "#web-server" );

/**
 * A browser's cookies, kept across requests.
 */
class Jar {
    constructor() {
        this.cookies = new Map();
    }
    keep( response ) {
        for ( const line of response.headers.getSetCookie() ) {
            const [ pair ] = line.split( ";" );
            const index = pair.indexOf( "=" );
            this.cookies.set( pair.slice( 0, index ).trim(), pair.slice( index + 1 ).trim() );
        }
        return response;
    }
    get header() {
        return [ ...this.cookies ].map( ( [ name, value ] ) => `${ name }=${ value }` ).join( "; " );
    }
    get token() {
        return decodeURIComponent( this.cookies.get( "ti-xsrf-token" ) || "" );
    }
}

// An application whose roles come from a store: the refresh can be held at the test's word, and then changes the roles,
// which is what makes express-session write the session at the response's end.
class RolesFromAStore extends TiWebServer {

    constructor() {
        super( "ti-sign-out-race-test", {} );
        this.gate = null;
    }

    refreshSession( session ) {
        if ( this.gate === null ) {
            return undefined;
        }
        const gate = this.gate;
        this.gate = null;
        gate.entered();
        return gate.released.then( () => {
            session.user.roles = [ "approver" ];
        } );
    }

}

describe( "a sign-out while another request is still refreshing its roles", () => {

    const server = new RolesFromAStore();
    let url;

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    it( "stays signed out: the late request cannot write the ended session back", async () => {
        const jar = new Jar();
        jar.keep( await fetch( `${ url }/csrf-token` ) );
        jar.keep( await fetch( `${ url }/login/local`, {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar.header, "x-xsrf-token": jar.token, origin: url },
            body: new URLSearchParams( { username: "tester", password: PASSWORD } )
        } ) );
        jar.keep( await fetch( `${ url }/csrf-token`, { headers: { cookie: jar.header } } ) );
        const signedIn = await fetch( `${ url }/me`, { headers: { cookie: jar.header, accept: "application/json" } } );
        assert.equal( signedIn.status, 200, "signed in" );

        // A request whose refresh is still reading the store when the sign-out lands.
        let entered;
        let release;
        const reached = new Promise( ( resolve ) => {
            entered = resolve;
        } );
        server.gate = { entered: entered, released: new Promise( ( resolve ) => {
            release = resolve;
        } ) };
        const cookieBefore = jar.header;
        const late = fetch( `${ url }/me`, { headers: { cookie: cookieBefore, accept: "application/json" } } );
        await reached;

        const signOut = await fetch( `${ url }/logout`, { method: "POST", redirect: "manual", headers: { cookie: jar.header, "x-xsrf-token": jar.token, origin: url } } );
        assert.equal( signOut.status, 303, "signed out" );

        release();
        await ( await late ).text();

        const stored = cacheStub.hashes.get( "ti:web:sessions" );
        assert.equal( stored ? stored.size : 0, 0, "no session is left in the store" );
        const after = await fetch( `${ url }/me`, { headers: { cookie: cookieBefore, accept: "application/json" } } );
        assert.notEqual( after.status, 200, "the old cookie no longer signs anybody in" );
    } );

} );
