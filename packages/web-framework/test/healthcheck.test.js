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
 * The container liveness probe every TiWebServer application shares.
 *
 * The shape it replaces is an inline `node -e` in a Dockerfile hardcoding `require('http')` and an `http://` URL:
 * fine while TLS is off, and the moment an image runs with TLS on it speaks plain HTTP to a TLS listener, fails
 * every single time, and Docker marks a perfectly healthy container unhealthy — a restart loop for a server that is
 * answering correctly.
 *
 * The probe is run here as a container runs it: a child process, exit code only.
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

/**
 * Generates a throwaway self-signed certificate carrying the given subjectAltName, runs `body` with it, and removes
 * it afterwards.
 *
 * @param {string} san e.g. "IP:127.0.0.1" or "DNS:competence.example.com".
 * @param {function({certPath: string, keyPath: string}): Promise<void>} body
 * @returns {Promise<void>}
 */
async function withCertificate( san, body ) {
    const dir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-healthcheck-" ) );
    try {
        const keyPath = path.join( dir, "key.pem" );
        const certPath = path.join( dir, "cert.pem" );
        execFileSync( "openssl", [
            "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", keyPath, "-out", certPath,
            "-days", "1", "-subj", "/CN=competence.example.com",
            "-addext", `subjectAltName=${ san }`
        ], { stdio: "ignore" } );
        await body( { certPath: certPath, keyPath: keyPath } );
    } finally {
        fs.rmSync( dir, { recursive: true, force: true } );
    }
}

/**
 * Serves /health over TLS with the given certificate for the duration of `body`.
 *
 * @param {{certPath: string, keyPath: string}} certificate
 * @param {function(number): Promise<void>} body Receives the listening port.
 * @returns {Promise<void>}
 */
async function withTlsServer( certificate, body ) {
    const server = https.createServer(
        { key: fs.readFileSync( certificate.keyPath ), cert: fs.readFileSync( certificate.certPath ) },
        ( request, response ) => {
            response.writeHead( request.url === "/health" ? 200 : 404 );
            response.end();
        }
    );
    await new Promise( ( resolve ) => server.listen( 0, "127.0.0.1", resolve ) );
    try {
        await body( server.address().port );
    } finally {
        server.close();
    }
}

let plainServer;
let plainPort;
let httpRequestsSeen = 0;

before( async () => {
    plainServer = http.createServer( ( request, response ) => {
        httpRequestsSeen += 1;
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

    it( "actually stops speaking HTTP when TLS is on", async () => {
        // The regression, provable without a certificate — and by evidence rather than by exit code, since the
        // no-certificate fallback would report a live listener either way. The same plain-HTTP server counts the
        // HTTP requests it serves: with TLS off it sees the probe, with TLS on it must not, because the probe is no
        // longer speaking that protocol. The old hardcoded-http one-liner sent a plain GET in both cases.
        httpRequestsSeen = 0;
        assert.equal( await probe( { TI_WEB_USE_TLS: "false", TI_WEB_PORT: String( plainPort ) } ), 0 );
        assert.equal( httpRequestsSeen, 1, "TLS off must reach /health over HTTP" );

        httpRequestsSeen = 0;
        await probe( { TI_WEB_USE_TLS: "true", TI_WEB_PORT: String( plainPort ) } );
        assert.equal( httpRequestsSeen, 0, "TLS on must never send a plain-HTTP request" );
    } );

    it( "reads the flag the way the server does", async () => {
        // `tools.toBool`: unset and false/0/no/N are false, everything else is true. The probe imports that same
        // function rather than reimplementing it, and these pin the values an operator actually types — again by
        // what reaches the HTTP server, which is the thing that differs.
        for ( const off of [ "false", "FALSE", "0", "no", "N", "" ] ) {
            httpRequestsSeen = 0;
            assert.equal( await probe( { TI_WEB_USE_TLS: off, TI_WEB_PORT: String( plainPort ) } ), 0, `'${ off }' must mean plain HTTP` );
            assert.equal( httpRequestsSeen, 1, `'${ off }' must mean plain HTTP` );
        }
        for ( const on of [ "true", "TRUE", "1", "yes" ] ) {
            httpRequestsSeen = 0;
            await probe( { TI_WEB_USE_TLS: on, TI_WEB_PORT: String( plainPort ) } );
            assert.equal( httpRequestsSeen, 0, `'${ on }' must not mean plain HTTP` );
        }
    } );

    it( "reports healthy against a TLS server, verifying against its own certificate", async ( t ) => {
        // The case the fix exists for, and the reason it is not `rejectUnauthorized: false`: verification stays on,
        // anchored to the certificate the deployment configured. Skipped rather than failed where no certificate can
        // be generated — the transport-switch test above covers the branch everywhere.
        if ( !opensslAvailable() ) {
            t.skip( "openssl is unavailable, so no throwaway certificate can be generated" );
            return;
        }
        await withCertificate( "IP:127.0.0.1", async ( certificate ) => {
            await withTlsServer( certificate, async ( tlsPort ) => {
                assert.equal( await probe( {
                    TI_WEB_USE_TLS: "true",
                    TI_WEB_PORT: String( tlsPort ),
                    TI_WEB_TLS_CERT_PATH: certificate.certPath
                } ), 0, "a self-signed loopback certificate must not read as a dead container" );
            } );
        } );
    } );

    it( "verifies a certificate issued for a hostname, not the loopback address", async ( t ) => {
        // The normal case: the certificate names the public hostname, and the probe still connects to 127.0.0.1.
        // The name to check is read out of the certificate rather than assumed, so this passes without weakening
        // anything — an earlier draft would have had to disable the identity check to survive it.
        if ( !opensslAvailable() ) {
            t.skip( "openssl is unavailable" );
            return;
        }
        await withCertificate( "DNS:competence.example.com", async ( certificate ) => {
            await withTlsServer( certificate, async ( tlsPort ) => {
                assert.equal( await probe( {
                    TI_WEB_USE_TLS: "true",
                    TI_WEB_PORT: String( tlsPort ),
                    TI_WEB_TLS_CERT_PATH: certificate.certPath
                } ), 0 );
            } );
        } );
    } );

    it( "refuses a certificate that is not the one it was told to trust", async ( t ) => {
        // The test that makes the two above mean something. The server presents one certificate and the probe is
        // anchored to a different one; if verification had been disabled this would pass, and the fix would be a
        // comment rather than a change.
        if ( !opensslAvailable() ) {
            t.skip( "openssl is unavailable" );
            return;
        }
        await withCertificate( "IP:127.0.0.1", async ( served ) => {
            await withCertificate( "IP:127.0.0.1", async ( unrelated ) => {
                await withTlsServer( served, async ( tlsPort ) => {
                    assert.equal( await probe( {
                        TI_WEB_USE_TLS: "true",
                        TI_WEB_PORT: String( tlsPort ),
                        TI_WEB_TLS_CERT_PATH: unrelated.certPath
                    } ), 1, "verification must be real, not nominal" );
                } );
            } );
        } );
    } );

    it( "falls back to a connection check when no certificate is configured", async ( t ) => {
        // Nothing to anchor to, so the probe cannot ask /health — but refusing to answer would restart a container
        // that is serving. It establishes that the port accepts connections instead, which is weaker and honest.
        if ( !opensslAvailable() ) {
            t.skip( "openssl is unavailable" );
            return;
        }
        await withCertificate( "IP:127.0.0.1", async ( certificate ) => {
            await withTlsServer( certificate, async ( tlsPort ) => {
                assert.equal( await probe( { TI_WEB_USE_TLS: "true", TI_WEB_PORT: String( tlsPort ) } ), 0 );
            } );
        } );
    } );

    it( "the fallback still reports a dead port as dead", async () => {
        assert.equal( await probe( { TI_WEB_USE_TLS: "true", TI_WEB_PORT: "1" } ), 1 );
    } );

} );

describe( "The probe never disables certificate verification", () => {

    it( "mentions rejectUnauthorized only in the comment explaining why it is not used", () => {
        const source = fs.readFileSync( PROBE, "utf8" );
        // CodeQL flagged the real thing as a high-severity alert when this was first written, and it was right:
        // this is the line that gets copied out of a health probe into a client that crosses a network. Verification
        // is narrowed to the server's own certificate instead.
        const code = source.replace( /\/\*[\s\S]*?\*\//g, "" );
        assert.equal( /rejectUnauthorized/.test( code ), false );
    } );

} );
