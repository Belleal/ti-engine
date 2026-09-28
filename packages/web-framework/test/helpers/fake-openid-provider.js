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
 * An in-process OpenID Connect provider, so a test can drive `AuthManager` through the real `openid-client` —
 * discovery, the authorization-code grant, ID token validation and the `userinfo` fetch — without a network.
 * <br/>
 * It works by replacing `globalThis.fetch`, which is the one seam available: `openid-client` 6 is an ES module, so
 * under `require()` its namespace object cannot be patched (an assignment to one of its exports silently does
 * nothing), but the library it builds on resolves the global `fetch` at call time, on every request.
 * <br/>
 * The ID token is signed for real (RS256, with the key published at `jwks_uri`), because what is under test is what
 * the framework does with a token the library has accepted — a token it would reject tests nothing.
 */

const { generateKeyPairSync, createSign, randomUUID } = require( "node:crypto" );

const ISSUER = "https://idp.test";
const KEY_ID = "fake-openid-provider";

function toBase64Url( value ) {
    return Buffer.from( value ).toString( "base64url" );
}

function jsonResponse( body ) {
    return new Response( JSON.stringify( body ), { status: 200, headers: { "content-type": "application/json" } } );
}

/**
 * Installs the fake provider in place of `globalThis.fetch`.
 *
 * @method
 * @param {Object} options
 * @param {string} options.clientID The client ID the ID tokens are issued to.
 * @returns {{discoveryUrl: string, issue: function(Object): void, uninstall: function(): void}}
 *          `issue( { nonce, claims, userinfo } )` sets what the next grant returns: the ID token claims (merged over
 *          `iss`, `aud`, `iat`, `exp` and the given `nonce`) and the `userinfo` response.
 * @public
 */
function installFakeOpenIDProvider( { clientID } ) {
    const { privateKey, publicKey } = generateKeyPairSync( "rsa", { modulusLength: 2048 } );
    const jwk = Object.assign( publicKey.export( { format: "jwk" } ), { kid: KEY_ID, alg: "RS256", use: "sig" } );
    const metadata = {
        issuer: ISSUER,
        authorization_endpoint: `${ ISSUER }/authorize`,
        token_endpoint: `${ ISSUER }/token`,
        userinfo_endpoint: `${ ISSUER }/userinfo`,
        jwks_uri: `${ ISSUER }/jwks`,
        response_types_supported: [ "code" ],
        subject_types_supported: [ "public" ],
        id_token_signing_alg_values_supported: [ "RS256" ],
        token_endpoint_auth_methods_supported: [ "client_secret_post", "client_secret_basic" ],
        code_challenge_methods_supported: [ "S256" ]
    };
    const originalFetch = globalThis.fetch;
    let pending = null;

    const signIdToken = ( claims ) => {
        const header = toBase64Url( JSON.stringify( { alg: "RS256", typ: "JWT", kid: KEY_ID } ) );
        const payload = toBase64Url( JSON.stringify( claims ) );
        const signature = createSign( "RSA-SHA256" ).update( `${ header }.${ payload }` ).sign( privateKey ).toString( "base64url" );
        return `${ header }.${ payload }.${ signature }`;
    };

    globalThis.fetch = async ( input ) => {
        const url = new URL( typeof input === "string" ? input : input.url );
        if ( url.origin !== ISSUER ) {
            return originalFetch( input );
        }
        switch ( url.pathname ) {
            case "/.well-known/openid-configuration":
                return jsonResponse( metadata );
            case "/jwks":
                return jsonResponse( { keys: [ jwk ] } );
            case "/token": {
                const now = Math.floor( Date.now() / 1000 );
                const claims = Object.assign( { iss: ISSUER, aud: clientID, iat: now, exp: now + 300, nonce: pending.nonce }, pending.claims );
                return jsonResponse( { access_token: `access-${ randomUUID() }`, token_type: "Bearer", expires_in: 300, id_token: signIdToken( claims ) } );
            }
            case "/userinfo":
                return jsonResponse( pending.userinfo );
            default:
                return new Response( "Not found", { status: 404 } );
        }
    };

    return {
        discoveryUrl: `${ ISSUER }/.well-known/openid-configuration`,
        issue: ( next ) => {
            pending = next;
        },
        uninstall: () => {
            globalThis.fetch = originalFetch;
        }
    };
}

module.exports = { installFakeOpenIDProvider };
