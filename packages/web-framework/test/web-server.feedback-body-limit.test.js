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
 * Send Feedback alone takes a body larger than 1 MB (1.58.0, CA-544): a picture of the screen rides on it in base64, up
 * to 1,333,336 characters. Every other request keeps the 1 MB limit, Send Feedback has a limit of its own, and its body
 * is read only once the request is known to come from someone signed in (the review pass): before, anyone could make
 * the server read and parse 1.5 MB.
 *
 * A real server with no broker, a local user signed in through the real sign-in form.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const PASSWORD = "body-limit-pass-1";
const USERS = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "ti-feedback-body-" ) ), "users.json" );

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
cacheStub.hashSetField = ( name, field, value ) => {
    hashes.set( name, ( hashes.get( name ) || new Map() ).set( field, JSON.parse( JSON.stringify( value ) ) ) );
    return Promise.resolve();
};
cacheStub.hashGetField = ( name, field ) => Promise.resolve( hashes.has( name ) && hashes.get( name ).has( field ) ? JSON.parse( JSON.stringify( hashes.get( name ).get( field ) ) ) : null );
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

// A body of about this many bytes, as JSON with the text a picture's base64 would be.
const bodyOf = ( bytes ) => JSON.stringify( { kind: "problem", text: "Broken.", picture: "data:image/webp;base64," + "A".repeat( bytes ) } );

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

describe( "the body a request may carry", () => {

    const server = new TiWebServer( "ti-feedback-body-limit-test", {
        application: { classPath: path.relative( process.cwd(), path.join( __dirname, "helpers", "feedback-app.js" ) ) }
    } );
    let url;
    const signedIn = new Jar();

    before( async () => {
        await server.start();
        url = server.serverUrl;
        signedIn.keep( await fetch( `${ url }/csrf-token` ) );
        const login = await fetch( `${ url }/login/local`, {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: signedIn.header, "x-xsrf-token": signedIn.token, Origin: url },
            body: new URLSearchParams( { username: "tester", password: PASSWORD } )
        } );
        signedIn.keep( login );
        assert.equal( login.status, 303 );
        assert.equal( login.headers.get( "location" ), "/", "signed in" );
        // The session is a new one after sign-in, and so is its token, which a page asks for as a script does.
        signedIn.keep( await fetch( `${ url }/csrf-token`, { headers: { Cookie: signedIn.header } } ) );
    } );

    after( () => server.stop() );

    // As a browser: the cookies each answer sets are sent with the next request.
    const post = ( route, body, jar = null ) => fetch( `${ url }${ route }`, {
        method: "POST",
        redirect: "manual",
        headers: Object.assign( { "Content-Type": "application/json", Accept: "application/json", Origin: url }, jar ? { Cookie: jar.header, "x-xsrf-token": jar.token } : {} ),
        body: body
    } ).then( ( response ) => jar ? jar.keep( response ) : response );

    it( "lets someone signed in send the largest picture, which every other request would refuse", async () => {
        const largest = bodyOf( 1333336 );
        assert.ok( Buffer.byteLength( largest ) > 1024 * 1024, "over the 1 MB every other request keeps" );
        const feedback = await post( "/app/send-feedback", largest, signedIn );
        // Read whole and handed to Send Feedback, which refuses it for what it is: no image, only its size.
        const answer = await feedback.json();
        assert.equal( feedback.status, 422, JSON.stringify( answer ).slice( 0, 300 ) );
        assert.equal( answer.exception.data.details, "error.feedback.picture" );

        const other = await post( "/app/save-something", largest, signedIn );
        assert.equal( other.status, 413 );
    } );

    it( "gives Send Feedback a limit of its own", async () => {
        const response = await post( "/app/send-feedback", bodyOf( 1600 * 1024 ), signedIn );
        assert.equal( response.status, 413, await response.text() );
    } );

    it( "reads nothing of an anonymous body: it is refused before, however large or malformed", async () => {
        // A malformed body read first is a 400; refused first, it is never read.
        const malformed = "{" + "x".repeat( 1400 * 1024 );
        const response = await post( "/app/send-feedback", malformed );
        assert.notEqual( response.status, 400, "the body was read" );
        assert.ok( [ 303, 401, 403 ].includes( response.status ), `refused as anonymous, not ${ response.status }` );
        assert.equal( ( await post( "/APP/Send-Feedback/", malformed ) ).status, response.status, "as Express matches the route" );
    } );

} );
