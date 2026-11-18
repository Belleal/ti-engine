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
 * An application whose shell is not at `/` (CA-584), on a real `TiWebServer`: `application.home` is `/studio`.
 *
 * An application with a public site of its own needs `/` for that site. Until 1.63.0 the shell was always there, and so
 * was every answer that sends the browser home: a sign-in, a sign-out, a refused sign-in, a language chosen, a screen
 * asked for without a session, and every unknown address's not-found page. Each is asked for here as a browser would,
 * and each must arrive under the home. One server per file, because core allows one ServiceInstance per process.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const PASSWORD = "application-home-pass-1";
const USERS = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "ti-application-home-" ) ), "users.json" );

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "local";
process.env.TI_WEB_AUTH_LOCAL_USERS_PATH = USERS;
// The home is the configuration's, `/studio`, written so that its normalization is tested too: an inherited override
// would replace it (CodeRabbit on #226). This process runs this file alone, so nothing needs restoring.
delete process.env.TI_WEB_APPLICATION_HOME;

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const localUserDirectory = require( "#local-user-directory" );
fs.writeFileSync( USERS, JSON.stringify( [ { username: "tester", email: "tester@example.com", name: "Tester", passwordHash: localUserDirectory.hashPassword( PASSWORD ) } ] ) );

const TiWebServer = require( "#web-server" );

const HOME = "/studio/";
const HTML = { accept: "text/html" };
const HTMX = { accept: "text/html", "hx-request": "true" };

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

describe( "TiWebServer with application.home /studio", () => {

    const server = new TiWebServer( "ti-application-home-test", {
        // Written without its trailing slash, as a person would: the server ends it with one.
        application: { classPath: path.relative( process.cwd(), path.join( __dirname, "helpers", "feedback-app.js" ) ), home: "/studio" },
        languages: [ "en", "bg" ]
    } );
    let url;

    const get = ( address, headers = HTML, jar = null ) => fetch( url + address, { redirect: "manual", headers: Object.assign( {}, headers, jar ? { cookie: jar.header } : {} ) } );

    /**
     * Signs in through the real sign-in form, as the browser would post it.
     *
     * @param {string} password
     * @returns {Promise<{jar: Jar, response: Response}>}
     */
    const signIn = async ( password ) => {
        const jar = new Jar();
        jar.keep( await fetch( `${ url }/csrf-token` ) );
        const response = jar.keep( await fetch( `${ url }/login/local`, {
            method: "POST",
            redirect: "manual",
            headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "text/html", cookie: jar.header, "x-xsrf-token": jar.token, origin: url },
            body: new URLSearchParams( { username: "tester", password: password } )
        } ) );
        return { jar: jar, response: response };
    };

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    it( "names its home", () => {
        assert.equal( server.applicationHome, HOME );
    } );

    it( "serves the shell at the home, with or without its slash, and the page names the home", async () => {
        for ( const address of [ "/studio/", "/studio" ] ) {
            const response = await get( address );
            assert.equal( response.status, 200, address );
            assert.match( await response.text(), /<meta name="ti-home" content="\/studio\/"\/>/, address );
        }
    } );

    it( "does not serve the shell at /, which is the application's to use", async () => {
        const response = await get( "/" );
        assert.notEqual( response.status, 200 );
        assert.equal( response.headers.get( "location" ), HOME, "an anonymous visitor to an address nobody serves is sent home" );
        assert.equal( await get( "/not-found" ).then( ( answer ) => answer.headers.get( "location" ) ), HOME );
    } );

    it( "sends a signed-in user home", async () => {
        const { response } = await signIn( PASSWORD );
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), HOME );
    } );

    it( "sends a refused sign-in home, with the reason", async () => {
        const { response } = await signIn( "not-the-password" );
        assert.equal( response.status, 303 );
        assert.match( response.headers.get( "location" ), /^\/studio\/\?error=\d+$/ );
    } );

    it( "sends a screen asked for without a session home: a navigation by 303, an HTMX request by HX-Redirect", async () => {
        const navigation = await get( "/app/dashboard" );
        assert.equal( navigation.status, 303 );
        assert.equal( navigation.headers.get( "location" ), HOME );
        const htmx = await get( "/app/dashboard", HTMX );
        assert.equal( htmx.headers.get( "hx-redirect" ), HOME );
    } );

    it( "sends an unknown address to the not-found page under the home, which is served", async () => {
        const { jar } = await signIn( PASSWORD );
        const unknown = await get( "/no-such-page", HTML, jar );
        assert.equal( unknown.status, 303 );
        assert.equal( unknown.headers.get( "location" ), "/studio/not-found" );
        const htmx = await get( "/no-such-page", HTMX, jar );
        assert.equal( htmx.headers.get( "hx-redirect" ), "/studio/not-found" );

        const page = await get( "/studio/not-found" );
        assert.equal( page.status, 200, "reachable without a session, like every not-found page" );
        const html = await page.text();
        assert.match( html, /<meta name="ti-home" content="\/studio\/"\/>/ );
        // The not-found view, not the shell at another address (CodeRabbit on #226): both answer 200 with the tag.
        assert.match( html, /id="ti-not-found"/ );
        assert.doesNotMatch( await ( await get( "/studio/" ) ).text(), /id="ti-not-found"/ );

        // Express answers `/studio/not-found/` at the same route, so a visitor without a session must reach it there as
        // well, not be sent home by the session check (CodeRabbit on #226).
        const alias = await get( "/studio/not-found/" );
        assert.equal( alias.status, 200 );
        assert.match( await alias.text(), /id="ti-not-found"/ );
    } );

    it( "sends a language choice home", async () => {
        const response = await get( "/language/bg" );
        assert.equal( response.status, 303 );
        assert.equal( response.headers.get( "location" ), HOME );
    } );

    it( "sends a sign-out home: a form by 303, the user menu's HTMX request by HX-Redirect", async () => {
        for ( const htmx of [ false, true ] ) {
            const { jar } = await signIn( PASSWORD );
            jar.keep( await fetch( `${ url }/csrf-token`, { headers: { cookie: jar.header } } ) );
            const response = await fetch( `${ url }/logout`, {
                method: "POST",
                redirect: "manual",
                headers: Object.assign( { cookie: jar.header, "x-xsrf-token": jar.token, origin: url }, htmx ? HTMX : HTML )
            } );
            if ( htmx ) {
                assert.equal( response.headers.get( "hx-redirect" ), HOME );
            } else {
                assert.equal( response.status, 303 );
                assert.equal( response.headers.get( "location" ), HOME );
            }
        }
    } );

} );
