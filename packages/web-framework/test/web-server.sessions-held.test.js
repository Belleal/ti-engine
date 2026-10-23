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
 * `sessions.held` through a real `TiWebServer` (CA-557): the session store the server builds is the held one, so a
 * signed-in user's requests are answered from the process, and a sign-out still ends the session.
 * <br/>
 * `test/session-store.held.test.js` covers the store's rules against express-session; this covers the one thing it
 * cannot, the server handing the setting to the store it builds. A real server with no broker, a local user signed in
 * through the real sign-in form, the state store a stub that counts the session reads.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const PASSWORD = "held-sessions-pass-1";
const USERS = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "ti-held-sessions-" ) ), "users.json" );

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";
process.env.TI_WEB_AUTH_LOCAL_USERS_PATH = USERS;

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

const cacheStub = installInMemoryCache();
// The session store keeps sessions in hash fields, which the in-memory store leaves out: enough of them to sign in.
const hashes = new Map();
let sessionReads = 0;
cacheStub.hashSetField = ( name, field, value ) => {
    hashes.set( name, ( hashes.get( name ) || new Map() ).set( field, JSON.parse( JSON.stringify( value ) ) ) );
    return Promise.resolve();
};
cacheStub.hashGetField = ( name, field ) => {
    sessionReads++;
    return Promise.resolve( hashes.has( name ) && hashes.get( name ).has( field ) ? JSON.parse( JSON.stringify( hashes.get( name ).get( field ) ) ) : null );
};
cacheStub.hashDeleteField = ( name, field ) => {
    if ( hashes.has( name ) ) {
        hashes.get( name ).delete( field );
    }
    return Promise.resolve();
};
cacheStub.expireValue = () => Promise.resolve();

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

describe( "TiWebServer with sessions.held", () => {

    const server = new TiWebServer( "ti-held-sessions-test", {
        application: { classPath: path.relative( process.cwd(), path.join( __dirname, "helpers", "feedback-app.js" ) ) },
        sessions: { held: true }
    } );
    let url;
    const jar = new Jar();

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    it( "answers every request after sign-in from the process, and a sign-out ends the session", async () => {
        jar.keep( await fetch( `${ url }/csrf-token` ) );
        const login = await fetch( `${ url }/login/local`, {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.header, "x-xsrf-token": jar.token, Origin: url },
            body: new URLSearchParams( { username: "tester", password: PASSWORD } )
        } );
        jar.keep( login );
        assert.equal( login.status, 303 );
        jar.keep( await fetch( `${ url }/csrf-token`, { headers: { Cookie: jar.header } } ) );

        for ( let request = 0; request < 5; request++ ) {
            const me = await fetch( `${ url }/me`, { headers: { Cookie: jar.header } } );
            assert.equal( me.status, 200, "signed in" );
            assert.equal( ( await me.json() ).data.user.username, "tester" );
        }
        assert.equal( sessionReads, 0, "no session was read from the state store" );

        const logout = await fetch( `${ url }/logout`, { method: "POST", redirect: "manual", headers: { Cookie: jar.header, "x-xsrf-token": jar.token, Origin: url } } );
        assert.ok( logout.status < 400, `signed out, ${ logout.status }` );
        // Anonymous, `/me` is answered with the sign-in page; a held copy that outlived the sign-out would answer the user.
        const anonymous = await fetch( `${ url }/me`, { headers: { Cookie: jar.header } } );
        assert.match( anonymous.headers.get( "content-type" ), /text\/html/, "no longer the user's JSON" );
        assert.equal( ( await anonymous.text() ).includes( "tester" ), false, "the held copy did not outlive the sign-out" );
    } );

} );
