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
 * The language a session starts in.
 *
 * Both sign-in paths set `session.language = user.language || serviceConfig.language`, and `web-server.json` shipped
 * `"language": "en"`. No identity provider puts a language on the user, so every session was English. A deployment
 * set to Bulgarian with `TI_LOCALIZATION_LANGUAGE` therefore turned English the moment anybody signed in, while its
 * login page — which asks core for labels with no language, and so gets the deployment's — stayed Bulgarian. That
 * is how competence's first Bulgarian deployment looked (CA-198), and nothing failed: English is a valid language.
 *
 * Core reads `TI_LOCALIZATION_LANGUAGE` once, when its configuration loads, so it is set before anything is required.
 */

process.env.TI_LOCALIZATION_LANGUAGE = "bg";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const webHandlers = require( "#web-handlers" );

const STATE = "issued-state";

function mockSession( initial = {} ) {
    const session = Object.assign( {}, initial );
    Object.defineProperties( session, {
        regenerate: { value: ( done ) => done() },
        save: { value: ( done ) => done() },
        destroy: { value: ( done ) => done() }
    } );
    return session;
}

function mockRequest( { query = {}, body = {}, params = {}, session = mockSession(), cookies = {} } = {} ) {
    const headers = { host: "app.example.com", accept: "text/html" };
    return {
        method: "GET",
        originalUrl: "/login/callback",
        query: query,
        body: body,
        params: params,
        session: session,
        cookies: cookies,
        get: ( name ) => headers[ String( name ).toLowerCase() ]
    };
}

function user( language ) {
    return {
        language: language,
        asJSON: () => ( { userID: "oauth2:1", username: "someone@example.com", email: "someone@example.com" } )
    };
}

function instance( { userLanguage, serviceLanguage, offered = [] } = {} ) {
    const serviceConfig = { auth: { admins: [] } };
    if ( serviceLanguage !== undefined ) {
        serviceConfig.language = serviceLanguage;
    }
    return {
        serviceConfig: serviceConfig,
        offeredLanguages: offered,
        authenticate: () => Promise.resolve(),
        authorize: () => Promise.resolve( user( userLanguage ) ),
        augmentSession: ( session ) => session
    };
}

// Runs a handler to its redirect and hands back the session it signed in, or fails on the error it passed on.
function signIn( handler, request ) {
    return new Promise( ( resolve, reject ) => {
        handler( request, { redirect: () => resolve( request.session ) }, ( error ) => reject( error || new Error( "next() without an error" ) ) );
    } );
}

function openIDSignIn( options = {} ) {
    const request = mockRequest( {
        query: { code: "code", state: STATE },
        session: mockSession( { oidc: { codeVerifier: "verifier", state: STATE, nonce: "nonce" } } ),
        cookies: options.cookies
    } );
    return signIn( webHandlers.authorizedOAuth2CallbackHandler( instance( options ), "openid-google" ), request );
}

function localSignIn( options = {} ) {
    const request = mockRequest( { params: { method: "local" }, body: { username: "someone", password: "password" }, cookies: options.cookies } );
    return signIn( webHandlers.authenticationHandler( instance( options ) ), request );
}

describe( "the language a session starts in", () => {

    for ( const [ name, run ] of [ [ "an OpenID sign-in", openIDSignIn ], [ "a local sign-in", localSignIn ] ] ) {

        describe( name, () => {

            it( "takes the deployment's language when neither the user nor the service configuration names one", async () => {
                assert.equal( ( await run() ).language, "bg" );
            } );

            it( "takes the service configuration's language when it names one", async () => {
                assert.equal( ( await run( { serviceLanguage: "en" } ) ).language, "en" );
            } );

            it( "takes the user's own language first", async () => {
                assert.equal( ( await run( { userLanguage: "de", serviceLanguage: "en" } ) ).language, "de" );
            } );

            it( "takes the language the visitor chose on the sign-in screen before anything else (CA-410)", async () => {
                const chose = { cookies: { "ti-language": "en" }, offered: [ "en", "bg" ] };
                assert.equal( ( await run( { ...chose, userLanguage: "de", serviceLanguage: "bg" } ) ).language, "en" );
            } );

            it( "ignores a choice the deployment does not offer, or any choice where it offers none", async () => {
                assert.equal( ( await run( { cookies: { "ti-language": "de" }, offered: [ "en", "bg" ] } ) ).language, "bg" );
                assert.equal( ( await run( { cookies: { "ti-language": "en" } } ) ).language, "bg" );
            } );

        } );

    }

    it( "is not fixed by the shipped configuration", () => {
        // A `language` here is merged into every consumer's configuration and names a language for every session,
        // which is exactly the default that turned the Bulgarian deployment English.
        const shipped = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "web-server.json" ), "utf8" ) );
        assert.equal( Object.hasOwn( shipped, "language" ), false );
    } );

} );
