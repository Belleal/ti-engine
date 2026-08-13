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
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const localUserDirectory = require( "#local-user-directory" );

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

describe( "local authentication against the user directory", () => {

    const PLACEHOLDER_PASSWORD = "not-a-real-password";

    it( "rejects every local login when the directory is empty", async () => {
        installInMemoryCache();
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "someone", password: PLACEHOLDER_PASSWORD } ) );
    } );

    it( "no longer accepts the removed hardcoded admin/admin pair", async () => {
        installInMemoryCache();
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "admin", password: "admin" } ) );
    } );

    it( "accepts a directory user with the right password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } );
    } );

    it( "rejects a directory user with the wrong password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: "wrong" } ) );
    } );

    it( "rejects a disabled user even with the right password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: true
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } ) );
    } );

} );

describe( "local authorization builds a usable session user", () => {

    const PLACEHOLDER_PASSWORD = "not-a-real-password";

    async function seedAda() {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada L",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        return manager;
    }

    it( "carries the email, which is what lets an application resolve the identity", async () => {
        const manager = await seedAda();
        const user = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        assert.equal( user.email, "ada@example.com" );
        assert.equal( user.name, "Ada L" );
        assert.equal( user.username, "ada" );
    } );

    it( "uses a stable userID across logins, so an admin allowlist can match it", async () => {
        const manager = await seedAda();
        const first = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        const second = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        assert.equal( first.userID, second.userID );
        assert.equal( first.userID, "local:ada" );
    } );

} );
