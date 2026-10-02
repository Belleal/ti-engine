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

/**
 * The request as the container should see it: claiming only what Cloudflare saw (CA-359; first CA-351).
 * <br/>
 * web-framework turns Express's `trust proxy` on, so an application believes the forwarding headers that reach it:
 * `request.ip` is the first `X-Forwarded-For` entry, `request.hostname` follows `X-Forwarded-Host`, and the scheme
 * decides whether the session cookie is `Secure` and what OpenID callback is built. The container sees plain HTTP from
 * the Worker, and `@cloudflare/containers` adds no forwarding header of its own. The Worker is the only way in, so it
 * is where those headers are made true.
 * <br/>
 * NOTE: Runs in the Workers runtime, so it requires nothing, not even another module of this package, and uses only the
 * `Headers`, `Request` and `URL` globals both Workers and Node provide.
 *
 * @module forwarding
 */

/**
 * Headers a client can send to claim an address, a host or a scheme it does not have. One scanner sent `127.0.0.1` in
 * eight of these on every request, hoping something trusts a "local" caller.
 * {@link forContainer} drops every one and then states the two it can vouch for.
 *
 * @type {string[]}
 * @public
 */
const FORWARDING_CLAIMS = Object.freeze( [
    "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-server",
    "x-forwarded", "x-real-ip", "x-client-ip", "x-originating-ip", "x-remote-ip", "x-remote-addr", "x-cluster-client-ip",
    "true-client-ip", "fastly-client-ip", "x-azure-clientip", "x-azure-socketip", "x-host", "x-original-url",
    "x-rewrite-url"
] );

/**
 * The request the container receives: the same request, with every forwarding claim ({@link FORWARDING_CLAIMS})
 * dropped, then `X-Forwarded-For` set to the address Cloudflare connected to, which a client cannot set, and
 * `X-Forwarded-Proto` to the scheme of the URL actually requested. With no connecting address, as in a local run, no
 * address is claimed at all. `Host` is left alone: Cloudflare routed the request by it, so it is a hostname bound to
 * this Worker.
 * <br/>
 * The request it is given is left as it is. A Worker may still need it, as the key it stores the response under, and
 * the runtime's own request has immutable headers.
 *
 * @method
 * @param {Request} request The request as the Worker received it.
 * @returns {Request}
 * @public
 */
function forContainer( request ) {
    const headers = new Headers( request.headers );
    for ( const name of FORWARDING_CLAIMS ) {
        headers.delete( name );
    }

    const client = request.headers.get( "cf-connecting-ip" );
    if ( client ) {
        headers.set( "x-forwarded-for", client );
    }
    headers.set( "x-forwarded-proto", new URL( request.url ).protocol.replace( ":", "" ) );

    return new Request( request, { headers: headers } );
}

module.exports = {
    forContainer: forContainer,
    FORWARDING_CLAIMS: FORWARDING_CLAIMS
};
