/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Container liveness probe: ask the server whether it is still serving, and exit 0 only if it says yes.
 * <br/>
 * This replaced an inline `node -e` in the Dockerfile that hardcoded `require('http')` and an `http://` URL. The
 * image bakes `TI_WEB_USE_TLS=false`, so it worked — until the image was run with TLS on, which is supported
 * (a mounted certificate rather than terminating at a proxy). The probe then spoke plain HTTP to a TLS listener,
 * failed every time, and Docker reported a healthy container unhealthy, restarting it on a loop.
 * <br/>
 * The transport comes from the same variable and the same parser the server uses, so the two cannot drift:
 * `tools.toBool` treats an unset value and `false`/`0`/`no`/`N` as false, and anything else as true.
 * <br/>
 * <b>On certificates.</b> The obvious way to make a loopback TLS probe work is `rejectUnauthorized: false`, and
 * the obvious defence is that nothing can sit between a process and itself. Both are true and it is still the wrong
 * line to write: it is the snippet that gets copied out of a health probe and into a client that does cross a
 * network. So verification stays on and the trust anchor is narrowed instead — the server's own certificate, named
 * by `TI_WEB_TLS_CERT_PATH`, is passed as the sole CA, and the name to verify is read out of that certificate
 * rather than assumed to be `127.0.0.1` (a certificate issued for a public hostname is the normal case, and a probe
 * that reported "dead" because of the name on it would be repeating the bug this file exists to fix).
 * <br/>
 * When no certificate path is configured there is nothing to anchor to, and the probe degrades to establishing that
 * the port is accepting connections. That is weaker — it shows the listener is up, not that the application is
 * answering — but it is honest, and it is the only remaining option that neither disables verification nor kills a
 * container that is running perfectly well.
 */

const fs = require( "node:fs" );
const net = require( "node:net" );
const tools = require( "@ti-engine/core/tools" );

const HOST = "127.0.0.1";
const TIMEOUT_MS = 4000;   // below Docker's own --timeout, so a hung socket fails as unhealthy rather than being killed mid-probe
const port = process.env.TI_WEB_PORT || 3000;
const useTLS = tools.toBool( process.env.TI_WEB_USE_TLS );

const alive = () => process.exit( 0 );
const dead = () => process.exit( 1 );

/**
 * Reads the server's own certificate and works out what to trust and what name to verify against.
 *
 * @returns {{ca: Buffer, servername: (string|undefined)}|null} null when no certificate is configured or readable.
 */
function ownCertificate() {
    const certPath = process.env.TI_WEB_TLS_CERT_PATH;
    if ( !certPath ) {
        return null;
    }
    try {
        const pem = fs.readFileSync( certPath );
        const certificate = new ( require( "node:crypto" ).X509Certificate )( pem );
        // Connecting by IP verifies against an `IP Address:` entry, so a certificate that covers the loopback
        // address needs no SNI at all. Otherwise the first DNS name it carries is the name it can satisfy; failing
        // that, its common name.
        const names = String( certificate.subjectAltName || "" ).split( "," ).map( ( entry ) => entry.trim() );
        if ( names.includes( `IP Address:${ HOST }` ) ) {
            return { ca: pem, servername: undefined };
        }
        const dnsName = names.find( ( entry ) => entry.startsWith( "DNS:" ) );
        if ( dnsName ) {
            return { ca: pem, servername: dnsName.slice( "DNS:".length ) };
        }
        const commonName = /CN=([^\n,]+)/.exec( String( certificate.subject || "" ) );
        return { ca: pem, servername: commonName ? commonName[ 1 ].trim() : undefined };
    } catch {
        // Unreadable, or not a certificate. Nothing to anchor to.
        return null;
    }
}

/**
 * Last resort when TLS is on and no certificate is available to verify against: prove the port accepts connections.
 *
 * @returns {void}
 */
function probeSocket() {
    const socket = net.connect( { host: HOST, port: port } );
    socket.setTimeout( TIMEOUT_MS );
    socket.on( "connect", () => { socket.destroy(); alive(); } );
    socket.on( "timeout", () => { socket.destroy(); dead(); } );
    socket.on( "error", dead );
}

/**
 * @param {Object} extraOptions Merged into the request options — the CA and server name for the TLS case.
 * @returns {void}
 */
function probeHealthEndpoint( extraOptions ) {
    const transport = useTLS ? require( "node:https" ) : require( "node:http" );
    const request = transport.get( { host: HOST, port: port, path: "/health", ...extraOptions }, ( response ) => {
        response.resume();
        process.exit( response.statusCode === 200 ? 0 : 1 );
    } );
    request.setTimeout( TIMEOUT_MS, () => {
        request.destroy();
        dead();
    } );
    request.on( "error", dead );
}

if ( !useTLS ) {
    probeHealthEndpoint( {} );
} else {
    const trust = ownCertificate();
    if ( trust ) {
        probeHealthEndpoint( { ca: trust.ca, servername: trust.servername } );
    } else {
        probeSocket();
    }
}
