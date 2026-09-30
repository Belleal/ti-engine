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
const exceptions = require( "@ti-engine/core/exceptions" );
const logger = require( "@ti-engine/core/logger" );
const webHandlers = require( "#web-handlers" );

// Values a log line must never contain. The authorization code, the state and the PKCE verifier are what an
// attacker holding the log would need; the whole point of moving the diagnosis into the log is defeated if it
// takes the secrets with it.
const CODE = "authorization-code-SECRET";
const STATE = "issued-state-SECRET";
const VERIFIER = "pkce-verifier-SECRET";
const NONCE = "nonce-SECRET";
const SECRETS = [ CODE, STATE, VERIFIER, NONCE ];

let logged = [];
let originalLog;

beforeEach( () => {
    logged = [];
    originalLog = logger.log;
    logger.log = ( message, severity ) => {
        logged.push( { message: String( message ), severity: severity } );
    };
} );

afterEach( () => {
    logger.log = originalLog;
} );

function mockRequest( { query = {}, oidc = undefined, host = "app.example.com" } = {} ) {
    const headers = { host: host, accept: "text/html" };
    return {
        method: "GET",
        originalUrl: "/login/google-callback",
        query: query,
        session: ( oidc === undefined ) ? {} : { oidc: oidc },
        get: ( name ) => headers[ String( name ).toLowerCase() ]
    };
}

// A response double that fails loudly if the handler writes to it directly — which is the old behaviour this
// change removes. Every refusal must travel through `next( … )` so it presents like all the other sign-in
// failures.
function strictResponse() {
    return {
        status: () => { throw new Error( "the handler wrote a status directly instead of calling next()" ); },
        end: () => { throw new Error( "the handler ended the response directly instead of calling next()" ); },
        redirect: () => { throw new Error( "the handler redirected on a refusal" ); }
    };
}

function refusalFrom( request, instance = { authorize: () => assert.fail( "authorize() must not run on a refused callback" ) } ) {
    let captured;
    webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-google" )( request, strictResponse(), ( error ) => {
        captured = error;
    } );
    return captured;
}

describe( "authorizedOAuth2CallbackHandler — a callback that cannot be completed", () => {

    it( "refuses a callback carrying no authorization code, naming the provider's own error", () => {
        const error = refusalFrom( mockRequest( { query: { error: "access_denied", state: STATE }, oidc: { codeVerifier: VERIFIER, state: STATE } } ) );

        assert.equal( error.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_QUERY );
        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
        assert.equal( logged.length, 1 );
        assert.equal( logged[ 0 ].severity, logger.logSeverity.WARNING );
        assert.match( logged[ 0 ].message, /no authorization code/i );
        assert.match( logged[ 0 ].message, /access_denied/, "the provider's error is the useful part and is not sensitive" );
    } );

    it( "refuses a callback whose session carries no OAuth state, and names the host it arrived on", () => {
        // The case that used to be undiagnosable: the sign-in began on another hostname, so the host-scoped
        // session cookie never reached this callback.
        const error = refusalFrom( mockRequest( { query: { code: CODE, state: STATE }, host: "other.example.com" } ) );

        assert.equal( error.code, exceptions.exceptionCode.E_SEC_INVALID_EXPIRED_SESSION );
        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
        assert.match( logged[ 0 ].message, /session carries no OAuth state/i );
        assert.match( logged[ 0 ].message, /other\.example\.com/, "the host is what identifies a cross-hostname sign-in" );
        assert.match( logged[ 0 ].message, /host-scoped/i, "the log has to say why the host matters, or it is just a hostname" );
    } );

    it( "prefers the forwarded host, which behind a proxy is the one the visitor actually used", () => {
        const request = mockRequest( { query: { code: CODE } } );
        const headers = { host: "internal:8080", "x-forwarded-host": "competence.example.com" };
        request.get = ( name ) => headers[ String( name ).toLowerCase() ];

        refusalFrom( request );

        assert.match( logged[ 0 ].message, /competence\.example\.com/ );
        assert.doesNotMatch( logged[ 0 ].message, /internal:8080/ );
    } );

    it( "refuses a callback whose state does not match the one issued", () => {
        const error = refusalFrom( mockRequest( { query: { code: CODE, state: "a-different-state" }, oidc: { codeVerifier: VERIFIER, state: STATE, nonce: NONCE } } ) );

        assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
        assert.match( logged[ 0 ].message, /state does not match/i );
    } );

    it( "refuses a session holding a verifier but no expected state, rather than skipping the check", () => {
        // The previous guard was `oidc.state && state !== oidc.state`, so an absent expected state disabled the
        // comparison entirely. An unverifiable callback is not a callback to trust.
        const error = refusalFrom( mockRequest( { query: { code: CODE, state: STATE }, oidc: { codeVerifier: VERIFIER } } ) );

        assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
    } );

    it( "never writes the authorization code, state, verifier or nonce to the log", () => {
        const requests = [
            mockRequest( { query: { error: "access_denied" }, oidc: { codeVerifier: VERIFIER, state: STATE, nonce: NONCE } } ),
            mockRequest( { query: { code: CODE, state: STATE } } ),
            mockRequest( { query: { code: CODE, state: "mismatched" }, oidc: { codeVerifier: VERIFIER, state: STATE, nonce: NONCE } } )
        ];
        for ( const request of requests ) {
            refusalFrom( request );
        }

        assert.equal( logged.length, 3 );
        for ( const entry of logged ) {
            for ( const secret of SECRETS ) {
                assert.ok( !entry.message.includes( secret ), `a log line leaked a secret: ${ entry.message }` );
            }
        }
    } );

    it( "cannot be made to forge a log line through the provider error", () => {
        // This endpoint is unprotected and takes any query string, and query parameters are percent-decoded before
        // they reach the handler — so `%0A` arrives as a real newline. The console appender writes one line per
        // entry, so an unescaped newline here ends the line and everything after it reads as a separate, entirely
        // attacker-written log entry.
        const forged = "access_denied\n2026-09-15, 12:00:00 (UTC): ti-competence - NOTICE - Sign-in succeeded for admin";
        const error = refusalFrom( mockRequest( { query: { error: forged } } ) );

        assert.equal( logged.length, 1 );
        assert.ok( !logged[ 0 ].message.includes( "\n" ), "a log line must not be splittable by external input" );
        assert.match( logged[ 0 ].message, /\\u000a/, "the newline should still be visible as an escape, not silently dropped" );
        assert.match( logged[ 0 ].message, /access_denied/, "the real error must survive, or the log loses its point" );
        // The same value is echoed in the error payload, so it is sanitized at the source rather than at each use.
        assert.ok( !String( error.providerError || "" ).includes( "\n" ) );
    } );

    it( "cannot be made to forge a log line through the host headers", () => {
        const request = mockRequest( { query: { code: CODE } } );
        const headers = { host: "ok.example.com", "x-forwarded-host": "evil\r\n2026-09-15, 12:00:00 (UTC): forged - NOTICE - nothing to see" };
        request.get = ( name ) => headers[ String( name ).toLowerCase() ];

        refusalFrom( request );

        assert.ok( !logged[ 0 ].message.includes( "\n" ) );
        assert.ok( !logged[ 0 ].message.includes( "\r" ) );
    } );

    it( "caps how much external text one field can put in the log", () => {
        const error = refusalFrom( mockRequest( { query: { error: "A".repeat( 5000 ) } } ) );

        assert.ok( logged[ 0 ].message.length < 500, "one field must not be able to flood the log" );
        assert.match( logged[ 0 ].message, /A{100}\.\.\./ );
        assert.ok( error );
    } );

    it( "lets a well-formed callback through to the authorization step", () => {
        let authorizedWith;
        const instance = {
            authorize: ( method, url, oidc ) => {
                authorizedWith = { method: method, url: String( url ), oidc: oidc };
                return new Promise( () => {} ); // never settles; the handler's own path beyond this is covered elsewhere
            }
        };
        const request = mockRequest( { query: { code: CODE, state: STATE }, oidc: { codeVerifier: VERIFIER, state: STATE, nonce: NONCE } } );

        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-google" )( request, strictResponse(), ( error ) => {
            assert.fail( `a valid callback was refused: ${ error && error.message }` );
        } );

        assert.equal( authorizedWith.method, "openid-google" );
        assert.equal( authorizedWith.oidc.codeVerifier, VERIFIER );
        assert.equal( logged.length, 0, "a successful callback logs no refusal" );
    } );

} );

describe( "authorizedOAuth2CallbackHandler — a sign-in that fails once the callback has been checked", () => {

    // What `openid-client` throws when the token endpoint answers with an OAuth error: a plain Error carrying the
    // provider's `error` and `error_description`. The auth manager raises it as-is, so it arrives here as
    // E_GEN_JS_INTERNAL_ERROR — the `?error=1000` a visitor lands on.
    function providerError( error, description ) {
        const failure = new Error( "server responded with an error in the response body" );
        failure.name = "ResponseBodyError";
        failure.code = "OAUTH_RESPONSE_BODY_ERROR";
        failure.error = error;
        failure.error_description = description;
        failure.status = 401;
        return exceptions.raise( failure );
    }

    function failureFrom( instance, session = {} ) {
        const request = mockRequest( { query: { code: CODE, state: STATE }, oidc: { codeVerifier: VERIFIER, state: STATE, nonce: NONCE } } );
        Object.assign( request.session, session );
        return new Promise( ( resolve ) => {
            webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-google" )( request, strictResponse(), resolve );
        } );
    }

    it( "logs the provider's refusal of the code exchange at WARNING, not only the error handler's DEBUG", async () => {
        // A production Worker holding the wrong client secret: Google answered `invalid_client` on every sign-in,
        // the visitor landed on `?error=1000`, and the only line naming why was the error handler's DEBUG — below a
        // production log level, so nothing at all (CA-315).
        const error = await failureFrom( { authorize: () => Promise.reject( providerError( "invalid_client", "The provided client secret is invalid." ) ) } );

        assert.equal( error.code, exceptions.exceptionCode.E_GEN_JS_INTERNAL_ERROR, "what the visitor sees is unchanged" );
        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
        assert.equal( logged.length, 1 );
        assert.equal( logged[ 0 ].severity, logger.logSeverity.WARNING );
        assert.match( logged[ 0 ].message, /openid-google/ );
        assert.match( logged[ 0 ].message, /invalid_client/ );
        assert.match( logged[ 0 ].message, /The provided client secret is invalid\./ );
        assert.match( logged[ 0 ].message, /client ID and secret/, "invalid_client is a deployment's configuration, so the line says where to look" );
        assert.ok( logged[ 0 ].message.includes( error.id ), "the reference ties the line to the failed request" );
    } );

    it( "logs a failure that never reached the provider, by its own message", async () => {
        // No secret at all: `openid-client` refuses to build the token request, and says so.
        const error = await failureFrom( { authorize: () => Promise.reject( exceptions.raise( new TypeError( "\"metadata.client_secret\" must be a string" ) ) ) } );

        assert.equal( error.code, exceptions.exceptionCode.E_GEN_JS_INTERNAL_ERROR );
        assert.equal( logged.length, 1 );
        assert.equal( logged[ 0 ].severity, logger.logSeverity.WARNING );
        assert.match( logged[ 0 ].message, /metadata\.client_secret/ );
    } );

    it( "logs a session store that fails while the signed-in session is being written, by what it says went wrong", async () => {
        // The shape core's HTTP cache provider rejects with: the account is in `details`, and the description only
        // says that a cache is unavailable, which is true of every such failure.
        const unreachable = exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE, {
            details: "The state service at 'http://11.0.0.1' could not be reached for '/v1/hashes/del': connect ECONNREFUSED 11.0.0.1:80"
        } );
        const error = await failureFrom( { authorize: () => Promise.resolve( { asJSON: () => ( {} ) } ) }, {
            regenerate: ( callback ) => callback( unreachable )
        } );

        assert.equal( error.httpCode, exceptions.httpCode.C_401 );
        assert.equal( logged.length, 1 );
        assert.equal( logged[ 0 ].severity, logger.logSeverity.WARNING );
        assert.match( logged[ 0 ].message, /could not be reached for '\/v1\/hashes\/del'/ );
        assert.match( logged[ 0 ].message, /ECONNREFUSED/, "the cause is the end of the account, so a cap sized for an OAuth error code cut it off" );
    } );

    it( "still bounds an error's own account, which can quote a response body", async () => {
        await failureFrom( { authorize: () => Promise.reject( exceptions.raise( new Error( "B".repeat( 5000 ) ) ) ) } );

        assert.equal( logged.length, 1 );
        assert.ok( logged[ 0 ].message.length < 600 );
    } );

    it( "adds nothing to a refusal, which is logged where it is decided", async () => {
        // The unverified e-mail, a domain outside the provider's list and the application's augmentSession each log
        // their own WARNING, saying more than this line could; a second line would only repeat it.
        const refusal = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "refused" }, exceptions.httpCode.C_401 );
        const error = await failureFrom( { authorize: () => Promise.reject( refusal ) } );

        assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
        assert.equal( logged.length, 0 );
    } );

    it( "cannot be made to forge a log line, or to flood it, through the provider's description", async () => {
        const forged = "bad\n2026-09-30, 12:00:00 (UTC): ti-competence - NOTICE - Sign-in succeeded for admin" + "A".repeat( 5000 );
        await failureFrom( { authorize: () => Promise.reject( providerError( "invalid_grant", forged ) ) } );

        assert.equal( logged.length, 1 );
        assert.ok( !logged[ 0 ].message.includes( "\n" ) );
        assert.ok( logged[ 0 ].message.length < 600, "one field must not be able to flood the log" );
    } );

    it( "never writes the authorization code, state, verifier or nonce to the log", async () => {
        await failureFrom( { authorize: () => Promise.reject( providerError( "invalid_grant", "Bad Request" ) ) } );

        assert.equal( logged.length, 1 );
        for ( const secret of SECRETS ) {
            assert.ok( !logged[ 0 ].message.includes( secret ), `a log line leaked a secret: ${ logged[ 0 ].message }` );
        }
    } );

} );

describe( "authorizedOAuth2CallbackHandler — how a refusal reaches the visitor", () => {

    function mockErrorResponse() {
        const captured = { status: null, redirectedTo: null, body: undefined, headers: null };
        return {
            captured: captured,
            redirect: ( code, target ) => { captured.status = code; captured.redirectedTo = target; },
            status: ( code ) => { captured.status = code; return { send: ( body ) => { captured.body = body; } }; },
            set: ( headers ) => { captured.headers = headers; }
        };
    }

    it( "lands an HTML sign-in attempt back on the login page instead of a blank 400", () => {
        // This is the whole point of the change: `response.status(400).end()` rendered nothing at all. Routed
        // through the error handler, a browser gets the login page carrying the reason.
        const error = refusalFrom( mockRequest( { query: { code: CODE, state: STATE } } ) );

        const headers = { accept: "text/html" };
        const request = {
            method: "GET",
            session: { language: "en" },
            originalUrl: "/login/google-callback",
            get: ( name ) => headers[ String( name ).toLowerCase() ],
            accepts: ( type ) => ( type === "html" ) ? type : false
        };
        const response = mockErrorResponse();
        webHandlers.defaultErrorHandler()( error, request, response, () => {} );

        assert.equal( response.captured.status, 303 );
        assert.equal( response.captured.redirectedTo, "/?error=" + exceptions.exceptionCode.E_SEC_INVALID_EXPIRED_SESSION );
    } );

    it( "gives a non-HTML client the standard 401 payload rather than an empty body", () => {
        const error = refusalFrom( mockRequest( { query: { code: CODE, state: STATE } } ) );

        const headers = { accept: "application/json" };
        const request = {
            method: "GET",
            session: { language: "en" },
            originalUrl: "/login/google-callback",
            get: ( name ) => headers[ String( name ).toLowerCase() ],
            accepts: () => false
        };
        const response = mockErrorResponse();
        webHandlers.defaultErrorHandler()( error, request, response, () => {} );

        assert.equal( response.captured.status, 401 );
        assert.ok( response.captured.body, "the body must carry something a client can act on" );
    } );

} );
