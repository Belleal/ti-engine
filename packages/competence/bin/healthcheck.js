/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Container liveness probe: GET /health on the loopback interface, exit 0 on 200 and 1 on anything else.
 * <br/>
 * This was an inline `node -e` one-liner in the Dockerfile that hardcoded `require('http')` and an `http://` URL.
 * The image bakes `TI_WEB_USE_TLS=false`, so it worked — until somebody ran the image with TLS on, which is a
 * supported configuration (`TI_WEB_USE_TLS=true` with a mounted certificate, rather than terminating TLS at a
 * proxy). The probe then spoke plain HTTP to a TLS listener, failed every time, and Docker declared a perfectly
 * healthy container unhealthy — restarting it on a loop under any orchestrator configured to act on that.
 * <br/>
 * The scheme is taken from the same variable and the same parser the server itself uses, so the two cannot drift:
 * `tools.toBool` treats an unset value and `false`/`0`/`no`/`N` as false, and anything else as true.
 * <br/>
 * Certificate verification is deliberately off. This is a process talking to itself over loopback to ask whether it
 * is still serving; the certificate is commonly self-signed or issued for the external hostname rather than
 * 127.0.0.1, and a probe that fails on that reports "dead" for a server that is answering perfectly well. It
 * establishes liveness, not trust, and it reaches no further than the container.
 */

const tools = require( "@ti-engine/core/tools" );

const useTLS = tools.toBool( process.env.TI_WEB_USE_TLS );
const port = process.env.TI_WEB_PORT || 3000;
const transport = useTLS ? require( "node:https" ) : require( "node:http" );

const request = transport.get( {
    host: "127.0.0.1",
    port: port,
    path: "/health",
    rejectUnauthorized: false
}, ( response ) => {
    process.exit( response.statusCode === 200 ? 0 : 1 );
} );

// Below Docker's own --timeout, so a hung socket fails as unhealthy rather than being killed mid-probe.
request.setTimeout( 4000, () => {
    request.destroy();
    process.exit( 1 );
} );

request.on( "error", () => process.exit( 1 ) );
