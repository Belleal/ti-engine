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
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const AuthManager = require( "#auth-manager" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const localUserDirectory = require( "#local-user-directory" );

// Ensure the constructor's env fallbacks (TI_GCLOUD_AUTH_CLIENT_ID / TI_AZURE_AUTH_CLIENT_ID) cannot
// mask an intentionally-unconfigured provider in these tests.
const OAUTH_ENV_KEYS = [ "TI_GCLOUD_AUTH_CLIENT_ID", "TI_AZURE_AUTH_CLIENT_ID" ];

// Writes a real local-users JSON file so `AuthManager#initialize` genuinely loads and reconciles it through
// `#loadLocalUserDirectory` — the only path that can ever set the private `#localDirectoryUsable` flag `true`.
// Seeding the directory directly via `localUserDirectory.reconcile(...)` and configuring `local: {}` (as this
// suite used to do) never exercises that load path at all, so a manager built that way is authenticating
// against Redis records left over from something else entirely — exactly the fail-open the whole-branch review
// found: `local: {}` is the precise configuration the framework logs as refusing every local sign-in.
function writeUsersFile( records ) {
    const dir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-local-users-" ) );
    const file = path.join( dir, "users.json" );
    fs.writeFileSync( file, JSON.stringify( records ) );
    return file;
}

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

    function adaRecord( overrides = {} ) {
        return Object.assign( {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        }, overrides );
    }

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
        const usersPath = writeUsersFile( [ adaRecord() ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: { usersPath: usersPath }, oauth2: {} } );
        await manager.initialize();
        await manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } );
    } );

    it( "rejects a directory user with the wrong password", async () => {
        installInMemoryCache();
        const usersPath = writeUsersFile( [ adaRecord() ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: { usersPath: usersPath }, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: "wrong" } ) );
    } );

    it( "rejects a disabled user even with the right password", async () => {
        installInMemoryCache();
        const usersPath = writeUsersFile( [ adaRecord( { disabled: true } ) ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: { usersPath: usersPath }, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } ) );
    } );

    // Regression coverage for the whole-branch review's Critical finding: `#loadLocalUserDirectory` used to
    // resolve (not reject) on both of these paths while merely logging that every local sign-in would be
    // refused, and `#authenticateLocal` consulted only `isAuthEnabled` before calling `findByUsername` — which
    // reads Redis directly. So a record reconciled by an EARLIER successful boot stayed live and still
    // authenticated on a LATER boot whose own load had just failed, contradicting the log line it printed on
    // its way out. Both branches below seed Redis directly first (simulating that earlier successful boot),
    // then boot a fresh manager under the failing configuration and prove the login is genuinely refused.
    it( "refuses every local login when 'usersPath' is unconfigured, even though Redis still holds records from an earlier successful boot", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ adaRecord() ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } ) );
    } );

    it( "refuses every local login when the users file cannot be read, even though Redis still holds records from an earlier successful boot", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ adaRecord() ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: { usersPath: "C:/definitely/not/here.json" }, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } ) );
    } );

} );

describe( "local authorization builds a usable session user", () => {

    const PLACEHOLDER_PASSWORD = "not-a-real-password";

    async function seedAda( overrides = {} ) {
        installInMemoryCache();
        const usersPath = writeUsersFile( [ Object.assign( {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada L",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        }, overrides ) ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: { usersPath: usersPath }, oauth2: {} } );
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

    it( "refuses to authorize a disabled record, even though authenticate() is never called first in this test", async () => {
        const manager = await seedAda( { disabled: true } );
        await assert.rejects( () => manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } ) );
    } );

    // Same fail-open shape as the authenticate() regression above, but through authorize(): it looks the
    // username up independently of authenticate(), so it needs the same #localDirectoryUsable gate or a stale
    // Redis record from an earlier successful boot would still mint a session User.
    it( "refuses to authorize when the local directory is not usable, even though Redis still holds a record from an earlier successful boot", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada L",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } ) );
    } );

} );
