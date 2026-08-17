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

const { describe, it, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const express = require( "express" );
const AuthManager = require( "#auth-manager" );

// The constructor's env fallbacks must not leak into these assertions:
const OAUTH_ENV_KEYS = [ "TI_AZURE_AUTH_CLIENT_ID", "TI_AZURE_AUTH_CALLBACK_URL" ];

describe( "AuthManager.toCallbackPath — reducing a configured OAuth2 callback to an Express route path", () => {

    it( "returns a path-only callback unchanged", () => {
        assert.equal( AuthManager.toCallbackPath( "/login/azure-callback" ), "/login/azure-callback" );
    } );

    it( "reduces an absolute callback URL to its path", () => {
        assert.equal( AuthManager.toCallbackPath( "https://specto.example.net/login/azure-callback" ), "/login/azure-callback" );
    } );

    it( "preserves a multi-segment path from an absolute callback URL", () => {
        assert.equal( AuthManager.toCallbackPath( "https://example.net/competence/login/azure-callback" ), "/competence/login/azure-callback" );
    } );

    it( "drops any query string and fragment", () => {
        assert.equal( AuthManager.toCallbackPath( "https://example.net/login/azure-callback?x=1#frag" ), "/login/azure-callback" );
    } );

    it( "reduces a protocol-relative callback URL to its path", () => {
        assert.equal( AuthManager.toCallbackPath( "//example.net/login/azure-callback" ), "/login/azure-callback" );
    } );

    it( "adds the leading slash to a bare relative callback", () => {
        assert.equal( AuthManager.toCallbackPath( "login/azure-callback" ), "/login/azure-callback" );
    } );

    it( "trims surrounding whitespace", () => {
        assert.equal( AuthManager.toCallbackPath( "  https://example.net/login/azure-callback  " ), "/login/azure-callback" );
    } );

    it( "returns null when there is no usable callback value", () => {
        assert.equal( AuthManager.toCallbackPath( "" ), null );
        assert.equal( AuthManager.toCallbackPath( "   " ), null );
        assert.equal( AuthManager.toCallbackPath( undefined ), null );
        assert.equal( AuthManager.toCallbackPath( null ), null );
    } );

    it( "returns null for a value that cannot be parsed as a URL at all", () => {
        assert.equal( AuthManager.toCallbackPath( "http://" ), null );
    } );

    it( "produces a value Express can register as a route, where the raw absolute URL cannot", () => {
        const app = express();
        const noop = ( request, response ) => response.end();

        // This is the regression being guarded: under Express 5 (path-to-regexp v8) the ':' of the scheme opens a
        // parameter name, so registering the absolute URL as a route path throws at startup.
        assert.throws( () => {
            app.get( "https://specto.example.net/login/azure-callback", noop );
        }, /Missing parameter name/ );

        assert.doesNotThrow( () => {
            app.get( AuthManager.toCallbackPath( "https://specto.example.net/login/azure-callback" ), noop );
        } );
    } );

} );

describe( "AuthManager.getOAuth2CallbackPath — the route path for an enabled provider", () => {

    let saved;

    beforeEach( () => {
        saved = {};
        OAUTH_ENV_KEYS.forEach( ( key ) => {
            saved[ key ] = process.env[ key ];
            delete process.env[ key ];
        } );
    } );

    afterEach( () => {
        OAUTH_ENV_KEYS.forEach( ( key ) => {
            if ( saved[ key ] === undefined ) {
                delete process.env[ key ];
            } else {
                process.env[ key ] = saved[ key ];
            }
        } );
    } );

    it( "reduces an absolute Azure callback URL to a route path while the callback URL itself is left as configured", () => {
        const auth = new AuthManager( {
            enabledMethods: [ "openid-azure" ],
            oauth2: { azure: { clientID: "client-id", callbackUrl: "https://specto.example.net/login/azure-callback" } }
        } );
        assert.equal( auth.getOAuth2CallbackPath( "openid-azure" ), "/login/azure-callback" );
        assert.equal( auth.getOAuth2CallbackUrl( "openid-azure" ), "https://specto.example.net/login/azure-callback" );
    } );

    it( "passes a path-only Azure callback through unchanged", () => {
        const auth = new AuthManager( {
            enabledMethods: [ "openid-azure" ],
            oauth2: { azure: { clientID: "client-id", callbackUrl: "/login/azure-callback" } }
        } );
        assert.equal( auth.getOAuth2CallbackPath( "openid-azure" ), "/login/azure-callback" );
    } );

    it( "raises for a provider that is not enabled", () => {
        const auth = new AuthManager( { enabledMethods: [ "local" ], oauth2: {} } );
        assert.throws( () => auth.getOAuth2CallbackPath( "openid-azure" ) );
    } );

} );
