/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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

    it( "returns the same config object reference", () => {
        const config = baseConfig();
        assert.equal( applyWebConfigEnvOverrides( config, {} ), config );
    } );

    it( "tolerates a null/non-object config", () => {
        assert.equal( applyWebConfigEnvOverrides( null, { TI_WEB_HOST: "0.0.0.0" } ), null );
    } );

} );
