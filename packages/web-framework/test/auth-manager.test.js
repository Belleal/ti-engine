/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const AuthManager = require( "#auth-manager" );

// Ensure the constructor's env fallbacks (TI_GCLOUD_AUTH_CLIENT_ID / TI_AZURE_AUTH_CLIENT_ID) cannot
// mask an intentionally-unconfigured provider in these tests.
const OAUTH_ENV_KEYS = [ "TI_GCLOUD_AUTH_CLIENT_ID", "TI_AZURE_AUTH_CLIENT_ID" ];

describe( "AuthManager — enabled-but-unconfigured OpenID providers", () => {

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

    it( "boots without throwing and drops an enabled Google provider that has no client ID, keeping local", async () => {
        const auth = new AuthManager( { enabledMethods: [ "local", "openid-google" ], oauth2: { google: { clientID: "" } } } );
        await auth.initialize();
        assert.equal( auth.isAuthEnabled( "openid-google" ), false );
        assert.equal( auth.isAuthEnabled( "local" ), true );
    } );

    it( "drops an unconfigured Azure provider too", async () => {
        const auth = new AuthManager( { enabledMethods: [ "local", "openid-azure" ], oauth2: { azure: {} } } );
        await auth.initialize();
        assert.equal( auth.isAuthEnabled( "openid-azure" ), false );
        assert.equal( auth.isAuthEnabled( "local" ), true );
    } );

    it( "leaves a local-only configuration untouched", async () => {
        const auth = new AuthManager( { enabledMethods: [ "local" ], oauth2: {} } );
        await auth.initialize();
        assert.equal( auth.isAuthEnabled( "local" ), true );
    } );

} );
