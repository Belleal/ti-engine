/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The container's liveness probe.
 *
 * It used to be an inline `node -e` in the Dockerfile that hardcoded `require('http')` and an `http://` URL. The
 * image bakes TI_WEB_USE_TLS=false so it worked — until the image was run with TLS on, which is supported
 * (a mounted certificate, rather than terminating at a proxy). The probe then spoke plain HTTP to a TLS listener,
 * failed every single time, and Docker marked a perfectly healthy container unhealthy: a restart loop for a server
 * that was answering correctly.
 *
 * The probe is run here as the container runs it — a child process, exit code only.
 */

const { describe, it, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const http = require( "node:http" );
const https = require( "node:https" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { execFileSync, spawn, spawnSync } = require( "node:child_process" );

const PROBE = path.join( path.resolve( __dirname, ".." ), "bin", "healthcheck.js" );

/**
 * Runs the probe exactly as the HEALTHCHECK does, and resolves with its exit code.
 * <br/>
 * Asynchronous by necessity, not by taste: the servers under test live in this process, so a synchronous spawn
 * would block the very event loop that has to accept the child's connection — every probe would time out and the
 * suite would "prove" the probe broken.
 *
 * @param {Object} env Environment overrides — the two variables the probe reads.
 * @returns {Promise<number>}
 */
function probe( env ) {
    return new Promise( ( resolve, reject ) => {
        const child = spawn( process.execPath, [ PROBE ], { env: { ...process.env, ...env }, stdio: "ignore" } );
        child.on( "error", reject );
        child.on( "close", ( code ) => resolve( code ) );
    } );
}

/** @returns {boolean} whether a certificate can be generated on this machine. */
function opensslAvailable() {
    return spawnSync( "openssl", [ "version" ], { encoding: "utf8" } ).status === 0;
}

let plainServer;
let plainPort;

before( async () => {
    plainServer = http.createServer( ( request, response ) => {
        response.writeHead( request.url === "/health" ? 200 : 404 );
        response.end();
    } );
    await new Promise( ( resolve ) => plainServer.listen( 0, "127.0.0.1", resolve ) );
    plainPort = plainServer.address().port;
} );

after( () => {
    if ( plainServer ) plainServer.close();
} );

describe( "Container healthcheck", () => {

    it( "reports healthy against a plain-HTTP server with TLS off", async () => {
        assert.equal( await probe( { TI_WEB_USE_TLS: "false", TI_WEB_PORT: String( plainPort ) } ), 0 );
    } );

    it( "reports unhealthy when nothing is listening", async () => {
        assert.equal( await probe( { TI_WEB_USE_TLS: "false", TI_WEB_PORT: "1" } ), 1 );
    } );

    it( "reports unhealthy on a non-200 answer", async () => {
        const server = http.createServer( ( request, response ) => {
            response.writeHead( 503 );
            response.end();
        } );
        await new Promise( ( resolve ) => server.listen( 0, "127.0.0.1", resolve ) );
        try {
            assert.equal( await probe( { TI_WEB_USE_TLS: "false", TI_WEB_PORT: String( server.address().port ) } ), 1 );
        } finally {
            server.close();
        }
    } );

    it( "actually switches transport when TLS is on", async () => {
        // The regression, provable without a certificate: the SAME plain-HTTP server, the SAME port, only the
        // variable differs. An HTTPS client cannot complete a handshake against it, so a probe that switched
        // transport must fail here. The old hardcoded-http one-liner returned 0 for both, which is precisely how it
        // reported success while being wrong.
        assert.equal( await probe( { TI_WEB_USE_TLS: "false", TI_WEB_PORT: String( plainPort ) } ), 0 );
        assert.equal( await probe( { TI_WEB_USE_TLS: "true", TI_WEB_PORT: String( plainPort ) } ), 1 );
    } );

    it( "reads the flag the way the server does", async () => {
        // `tools.toBool`: unset and false/0/no/N are false, everything else is true. The probe imports that same
        // function rather than reimplementing it, and these pin the values an operator actually types.
        for ( const off of [ "false", "FALSE", "0", "no", "N", "" ] ) {
            assert.equal( await probe( { TI_WEB_USE_TLS: off, TI_WEB_PORT: String( plainPort ) } ), 0, `'${ off }' must mean plain HTTP` );
        }
        for ( const on of [ "true", "TRUE", "1", "yes" ] ) {
            assert.equal( await probe( { TI_WEB_USE_TLS: on, TI_WEB_PORT: String( plainPort ) } ), 1, `'${ on }' must mean HTTPS` );
        }
    } );

    it( "reports healthy against a real TLS server with a self-signed certificate", async ( t ) => {
        // The case the fix exists for. Skipped rather than failed where no certificate can be generated — the
        // transport-switch test above still covers the branch everywhere.
        if ( !opensslAvailable() ) {
            t.skip( "openssl is unavailable, so no throwaway certificate can be generated" );
            return;
        }
        const dir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-healthcheck-" ) );
        try {
            const keyPath = path.join( dir, "key.pem" );
            const certPath = path.join( dir, "cert.pem" );
            execFileSync( "openssl", [
                "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                "-keyout", keyPath, "-out", certPath,
                "-days", "1", "-subj", "/CN=localhost"
            ], { stdio: "ignore" } );

            const server = https.createServer(
                { key: fs.readFileSync( keyPath ), cert: fs.readFileSync( certPath ) },
                ( request, response ) => {
                    response.writeHead( request.url === "/health" ? 200 : 404 );
                    response.end();
                }
            );
            await new Promise( ( resolve ) => server.listen( 0, "127.0.0.1", resolve ) );
            try {
                assert.equal( await probe( { TI_WEB_USE_TLS: "true", TI_WEB_PORT: String( server.address().port ) } ), 0,
                    "a self-signed loopback certificate must not read as a dead container" );
            } finally {
                server.close();
            }
        } finally {
            fs.rmSync( dir, { recursive: true, force: true } );
        }
    } );

} );

describe( "Dockerfile wiring", () => {

    const dockerfile = fs.readFileSync( path.join( path.resolve( __dirname, ".." ), "Dockerfile" ), "utf8" );

    it( "runs the probe script rather than an inline one-liner", () => {
        assert.match( dockerfile, /HEALTHCHECK[\s\S]*?CMD \[\s*"node",\s*"bin\/healthcheck\.js"\s*\]/ );
    } );

    it( "hardcodes no scheme in the healthcheck", () => {
        const healthcheck = /HEALTHCHECK[\s\S]*?(?=\n[A-Z]|$)/.exec( dockerfile )[ 0 ];
        assert.equal( /http:\/\//.test( healthcheck ), false, "the scheme belongs to TI_WEB_USE_TLS, not the Dockerfile" );
        assert.equal( /require\('http'\)/.test( healthcheck ), false );
    } );

} );
