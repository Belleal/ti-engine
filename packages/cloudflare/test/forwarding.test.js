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
 * What the container is told about the visitor (CA-359; first in the Boris Khan site and competence, CA-351).
 *
 * web-framework turns Express's `trust proxy` on, so an application believes the forwarding headers that reach it:
 * `request.ip` is the first `X-Forwarded-For` entry, `request.hostname` follows `X-Forwarded-Host`, and the scheme
 * decides whether the session cookie is `Secure` and what OpenID callback is built. The Worker is the only way in, so
 * what these hold is that nothing a client claims survives it, and nothing else about the request changes.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { forContainer, FORWARDING_CLAIMS } = require( "#forwarding" );

// What the Boris Khan site's first scanner sent on every request, on 2026-10-02: `127.0.0.1` wherever a server might
// look. Some names in mixed case, as a client may send them.
const CLAIMS = {
    "X-Forwarded-For": "127.0.0.1, 10.0.0.1", "x-real-ip": "127.0.0.1", "x-originating-ip": "127.0.0.1",
    "x-client-ip": "127.0.0.1", "x-azure-clientip": "127.0.0.1", "x-azure-socketip": "127.0.0.1",
    "true-client-ip": "127.0.0.1", "x-host": "127.0.0.1", "x-forwarded": "127.0.0.1", "X-Forwarded-Host": "evil.example",
    "x-forwarded-proto": "http", "forwarded": "for=127.0.0.1;host=evil.example;proto=http"
};
const FROM_CLOUDFLARE = { "cf-connecting-ip": "203.0.113.9", "cf-ray": "abc123-CDG", "user-agent": "curl/8.7.1" };

describe( "forwarding — the request the container receives", () => {

    it( "replaces every claimed address, host and scheme with what Cloudflare saw", () => {
        const forwarded = forContainer( new Request( "https://app.example/writings/", { headers: { ...CLAIMS, ...FROM_CLOUDFLARE } } ) );
        // Express takes `request.ip` from the first X-Forwarded-For entry: it must be the connecting address alone.
        assert.equal( forwarded.headers.get( "x-forwarded-for" ), "203.0.113.9" );
        assert.equal( forwarded.headers.get( "x-forwarded-proto" ), "https" );
        const others = Object.keys( CLAIMS ).map( ( name ) => name.toLowerCase() ).filter( ( name ) => name !== "x-forwarded-for" && name !== "x-forwarded-proto" );
        assert.deepEqual( others.filter( ( name ) => forwarded.headers.has( name ) ), [] );
    } );

    it( "drops every name it lists", () => {
        const headers = Object.fromEntries( FORWARDING_CLAIMS.map( ( name ) => [ name, "127.0.0.1" ] ) );
        const forwarded = forContainer( new Request( "https://app.example/", { headers: headers } ) );
        const kept = FORWARDING_CLAIMS.filter( ( name ) => forwarded.headers.has( name ) );
        // The scheme is always stated, and nothing else on the list survives: there is no connecting address here.
        assert.deepEqual( kept, [ "x-forwarded-proto" ] );
        assert.equal( forwarded.headers.get( "x-forwarded-proto" ), "https" );
    } );

    it( "states the scheme of the URL actually requested, as a local run's plain HTTP", () => {
        const forwarded = forContainer( new Request( "http://localhost:8787/", { headers: { "x-forwarded-proto": "https" } } ) );
        assert.equal( forwarded.headers.get( "x-forwarded-proto" ), "http" );
    } );

    it( "claims no address at all when Cloudflare gives none, as in a local run", () => {
        const forwarded = forContainer( new Request( "http://localhost:8787/", { headers: { "x-forwarded-for": "127.0.0.1" } } ) );
        assert.equal( forwarded.headers.get( "x-forwarded-for" ), null );
    } );

    it( "passes everything else through, Cloudflare's own headers and the host included", () => {
        const forwarded = forContainer( new Request( "https://app.example/writings/", {
            headers: { ...CLAIMS, ...FROM_CLOUDFLARE, "accept-language": "bg", cookie: "connect.sid=abc" }
        } ) );
        assert.equal( forwarded.headers.get( "cf-connecting-ip" ), "203.0.113.9" );
        assert.equal( forwarded.headers.get( "cf-ray" ), "abc123-CDG" );
        assert.equal( forwarded.headers.get( "user-agent" ), "curl/8.7.1" );
        assert.equal( forwarded.headers.get( "accept-language" ), "bg" );
        assert.equal( forwarded.headers.get( "cookie" ), "connect.sid=abc" );
        // Cloudflare routed the request by its host, so it is one bound to this Worker.
        assert.equal( new URL( forwarded.url ).host, "app.example" );
    } );

    it( "keeps the method, the URL and a form's body", async () => {
        const forwarded = forContainer( new Request( "https://app.example/capture?x=1", {
            method: "POST",
            headers: { ...CLAIMS, ...FROM_CLOUDFLARE, "content-type": "application/x-www-form-urlencoded" },
            body: "email=reader%40example.com&consent=on"
        } ) );
        assert.equal( forwarded.method, "POST" );
        assert.equal( forwarded.url, "https://app.example/capture?x=1" );
        assert.equal( forwarded.headers.get( "content-type" ), "application/x-www-form-urlencoded" );
        assert.equal( await forwarded.text(), "email=reader%40example.com&consent=on" );
    } );

    it( "leaves the request it was given alone", () => {
        // A Worker may still need the original, as the key it stores the response under, and the runtime's own
        // request has immutable headers: changing them in place throws.
        const original = new Request( "https://app.example/", { headers: { ...CLAIMS, ...FROM_CLOUDFLARE } } );
        forContainer( original );
        assert.equal( original.headers.get( "x-forwarded-for" ), "127.0.0.1, 10.0.0.1" );
        assert.equal( original.headers.get( "x-forwarded-host" ), "evil.example" );
    } );

} );

describe( "forwarding — the claims", () => {

    it( "lists every forwarding header the scan sent, and none Cloudflare sets or routes by", () => {
        for ( const name of Object.keys( CLAIMS ) ) {
            assert.ok( FORWARDING_CLAIMS.includes( name.toLowerCase() ), `${ name } is not listed` );
        }
        for ( const name of [ "host", "cf-connecting-ip", "cf-ray", "cf-ipcountry" ] ) {
            assert.equal( FORWARDING_CLAIMS.includes( name ), false, `${ name } is listed` );
        }
    } );

    it( "is lower case and frozen", () => {
        assert.deepEqual( FORWARDING_CLAIMS.filter( ( name ) => name !== name.toLowerCase() ), [] );
        assert.ok( Object.isFrozen( FORWARDING_CLAIMS ) );
    } );

} );
