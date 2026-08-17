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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );

const baseConfig = () => ( {
    host: "127.0.0.1",
    port: 3000,
    useTLS: true,
    tlsCertPath: "bin/tls/localhost+2.pem",
    tlsKeyPath: "bin/tls/localhost+2-key.pem",
    cookies: { path: "/", httpOnly: true }
} );

describe( "applyWebConfigEnvOverrides", () => {

    it( "leaves config untouched when no TI_WEB_* vars are set", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, {} );
        assert.deepEqual( config, baseConfig() );
    } );

    it( "overrides host, port (as Number), and useTLS (as bool via toBool)", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_HOST: "0.0.0.0", TI_WEB_PORT: "8080", TI_WEB_USE_TLS: "false" } );
        assert.equal( config.host, "0.0.0.0" );
        assert.equal( config.port, 8080 );
        assert.equal( typeof config.port, "number" );
        assert.equal( config.useTLS, false );
    } );

    it( "treats TI_WEB_USE_TLS=true as boolean true", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_USE_TLS: "true" } );
        assert.equal( config.useTLS, true );
    } );

    it( "ignores a non-integer TI_WEB_PORT, leaving the configured port", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_PORT: "not-a-number" } );
        assert.equal( config.port, 3000 );
    } );

    it( "overrides TLS cert/key paths", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_TLS_CERT_PATH: "/certs/tls.crt", TI_WEB_TLS_KEY_PATH: "/certs/tls.key" } );
        assert.equal( config.tlsCertPath, "/certs/tls.crt" );
        assert.equal( config.tlsKeyPath, "/certs/tls.key" );
    } );

    it( "sets cookies.secret and creates cookies object if absent", () => {
        const config = { host: "127.0.0.1" };
        applyWebConfigEnvOverrides( config, { TI_WEB_COOKIE_SECRET: "s3cr3t" } );
        assert.equal( config.cookies.secret, "s3cr3t" );
    } );

    it( "replaces auth.enabledMethods from a comma-separated TI_WEB_AUTH_METHODS (trimmed, empties dropped)", () => {
        const config = { auth: { enabledMethods: [ "local", "openid-google" ], admins: [ "x" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_METHODS: " openid-azure , local ,, " } );
        assert.deepEqual( config.auth.enabledMethods, [ "openid-azure", "local" ] );
        assert.deepEqual( config.auth.admins, [ "x" ], "other auth settings are preserved" );
    } );

    it( "creates the auth object when TI_WEB_AUTH_METHODS is set on a config without one", () => {
        const config = { host: "127.0.0.1" };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_METHODS: "openid-azure" } );
        assert.deepEqual( config.auth.enabledMethods, [ "openid-azure" ] );
    } );

    it( "replaces trustedOrigins from a comma-separated TI_WEB_TRUSTED_ORIGINS (trimmed, empties dropped)", () => {
        const config = {};
        applyWebConfigEnvOverrides( config, { TI_WEB_TRUSTED_ORIGINS: " https://a.example , https://b.example ,, " } );
        assert.deepEqual( config.trustedOrigins, [ "https://a.example", "https://b.example" ] );
    } );

    it( "returns the same config object reference", () => {
        const config = baseConfig();
        assert.equal( applyWebConfigEnvOverrides( config, {} ), config );
    } );

    it( "tolerates a null/non-object config", () => {
        assert.equal( applyWebConfigEnvOverrides( null, { TI_WEB_HOST: "0.0.0.0" } ), null );
    } );

    it( "replaces auth.admins from a comma-separated TI_WEB_AUTH_ADMINS (trimmed, empties dropped)", () => {
        const config = { auth: { enabledMethods: [ "openid-google" ], admins: [ "old@example.com" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: " one@example.com , two@example.com ,, " } );
        assert.deepEqual( config.auth.admins, [ "one@example.com", "two@example.com" ] );
        assert.deepEqual( config.auth.enabledMethods, [ "openid-google" ], "other auth settings are preserved" );
    } );

    it( "creates the auth object when TI_WEB_AUTH_ADMINS is set on a config without one", () => {
        const config = { host: "127.0.0.1" };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: "admin@example.com" } );
        assert.deepEqual( config.auth.admins, [ "admin@example.com" ] );
    } );

    it( "leaves a configured auth.admins untouched when TI_WEB_AUTH_ADMINS is absent", () => {
        const config = { auth: { admins: [ "keep@example.com" ] } };
        applyWebConfigEnvOverrides( config, {} );
        assert.deepEqual( config.auth.admins, [ "keep@example.com" ] );
    } );

    it( "clears auth.admins when TI_WEB_AUTH_ADMINS is set to an empty string", () => {
        const config = { auth: { admins: [ "gone@example.com" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: "" } );
        assert.deepEqual( config.auth.admins, [], "an explicitly empty value means no admins, not 'keep the default'" );
    } );

    it( "overrides the static cache maxAge (as Number) and immutable (as bool), creating staticCache if absent", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_MAX_AGE: "31536000", TI_WEB_STATIC_IMMUTABLE: "true" } );
        assert.equal( config.staticCache.maxAge, 31536000 );
        assert.equal( typeof config.staticCache.maxAge, "number" );
        assert.equal( config.staticCache.immutable, true );
    } );

    it( "ignores a non-integer or negative TI_WEB_STATIC_MAX_AGE, leaving the configured value", () => {
        const config = { staticCache: { maxAge: 600 } };
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_MAX_AGE: "1y" } );
        assert.equal( config.staticCache.maxAge, 600 );
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_MAX_AGE: "-1" } );
        assert.equal( config.staticCache.maxAge, 600 );
    } );

    it( "accepts TI_WEB_STATIC_MAX_AGE=0 as an explicit revalidate-every-use", () => {
        const config = { staticCache: { maxAge: 31536000 } };
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_MAX_AGE: "0" } );
        assert.equal( config.staticCache.maxAge, 0 );
    } );

    it( "turns immutable back off via TI_WEB_STATIC_IMMUTABLE=false", () => {
        const config = { staticCache: { maxAge: 31536000, immutable: true } };
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_IMMUTABLE: "false" } );
        assert.equal( config.staticCache.immutable, false );
        assert.equal( config.staticCache.maxAge, 31536000, "other static cache settings are preserved" );
    } );

    it( "replaces staticCache.immutablePaths from a comma-separated TI_WEB_STATIC_IMMUTABLE_PATHS (trimmed, empties dropped)", () => {
        const config = { staticCache: { immutablePaths: [ "/fonts/" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_IMMUTABLE_PATHS: " /fonts/ , /vendor/ ,, " } );
        assert.deepEqual( config.staticCache.immutablePaths, [ "/fonts/", "/vendor/" ] );
    } );

    it( "clears staticCache.immutablePaths when TI_WEB_STATIC_IMMUTABLE_PATHS is set to an empty string", () => {
        const config = { staticCache: { immutablePaths: [ "/fonts/" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_STATIC_IMMUTABLE_PATHS: "" } );
        assert.deepEqual( config.staticCache.immutablePaths, [], "an explicitly empty value means no long-lived paths" );
    } );

    it( "leaves staticCache untouched when no TI_WEB_STATIC_* vars are set", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, {} );
        assert.equal( config.staticCache, undefined );
    } );

    describe( "TI_WEB_AUTH_LOCAL_USERS_PATH", () => {

        it( "sets the local users file path", () => {
            const config = applyWebConfigEnvOverrides( { auth: {} }, { TI_WEB_AUTH_LOCAL_USERS_PATH: "/run/secrets/local-users.json" } );
            assert.equal( config.auth.local.usersPath, "/run/secrets/local-users.json" );
        } );

        it( "creates the auth and local blocks when absent", () => {
            const config = applyWebConfigEnvOverrides( {}, { TI_WEB_AUTH_LOCAL_USERS_PATH: "/tmp/users.json" } );
            assert.equal( config.auth.local.usersPath, "/tmp/users.json" );
        } );

        it( "leaves the configured value untouched when the variable is absent", () => {
            const config = applyWebConfigEnvOverrides( { auth: { local: { usersPath: "configured.json" } } }, {} );
            assert.equal( config.auth.local.usersPath, "configured.json" );
        } );

        it( "an explicitly empty value clears the path, which disables the directory", () => {
            const config = applyWebConfigEnvOverrides( { auth: { local: { usersPath: "configured.json" } } }, { TI_WEB_AUTH_LOCAL_USERS_PATH: "" } );
            assert.equal( config.auth.local.usersPath, "" );
        } );

    } );

} );
