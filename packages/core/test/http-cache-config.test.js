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

const assert = require( "node:assert" );
const { before, describe, it } = require( "node:test" );

// A token bound for a remote host over plain HTTP, with no opt-in: the configuration this file exists to refuse.
process.env.TI_MEMORY_CACHE_PROVIDER = "http";
process.env.TI_MEMORY_CACHE_STATE_URL = "http://state.example.com";
process.env.TI_MEMORY_CACHE_STATE_AUTH_TOKEN = "a-test-token";

let HttpCacheProvider = null;
let exceptions = null;

before( () => {
    HttpCacheProvider = require( "#http-cache-provider" );
    exceptions = require( "#exceptions" );
} );

describe( "HttpCacheProvider — where a bearer token may travel", () => {

    it( "refuses plain HTTP to a remote host", () => {
        assert.throws(
            () => HttpCacheProvider.verifyCredentialTransport( "http://state.example.com", false ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
                assert.match( error.data.details, /would travel unencrypted/ );
                return true;
            }
        );
    } );

    it( "allows HTTPS anywhere", () => {
        HttpCacheProvider.verifyCredentialTransport( "https://state.example.com", false );
    } );

    it( "allows plain HTTP that never leaves the machine", () => {
        // The suites in this package point a token at a loopback stub; refusing this would make the protocol
        // untestable without TLS, for no gain - nothing is on a wire.
        [ "http://localhost:8080", "http://127.0.0.1:8080", "http://127.5.5.5", "http://[::1]:8080" ].forEach( ( url ) => {
            HttpCacheProvider.verifyCredentialTransport( url, false );
        } );
    } );

    it( "allows plain HTTP elsewhere only on an explicit opt-in", () => {
        HttpCacheProvider.verifyCredentialTransport( "http://state.internal", true );
        assert.throws( () => HttpCacheProvider.verifyCredentialTransport( "http://state.internal", false ) );
    } );

    it( "refuses to construct at all when the configuration would leak the token", () => {
        // The wiring, not just the rule: a deployment configured this way stops here rather than at the first
        // request, and stops before a single header has been sent.
        assert.throws(
            () => new HttpCacheProvider( "test-cache" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
                assert.match( error.data.details, /stateAuthToken/ );
                return true;
            }
        );
    } );

} );

describe( "HttpCacheProvider — configuration that would break a timer", () => {

    it( "refuses a delay that is not a positive whole number of milliseconds", () => {
        // `AbortSignal.timeout` throws a RangeError SYNCHRONOUSLY on a bad delay, so an unparseable setting would
        // not reject the promise a caller is awaiting - it would throw straight out of the method.
        [ "abc", NaN, 0, -1, 1.5, Infinity, 2147483648 ].forEach( ( value ) => {
            assert.throws(
                () => HttpCacheProvider.validateDelay( value, "memoryCache.stateTimeout" ),
                ( error ) => {
                    assert.equal( error.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
                    assert.match( error.data.details, /memoryCache\.stateTimeout/ );
                    return true;
                },
                `expected '${ value }' to be refused`
            );
        } );
    } );

    it( "accepts a usable delay, including one given as a string by the environment", () => {
        assert.equal( HttpCacheProvider.validateDelay( 5000, "x" ), 5000 );
        assert.equal( HttpCacheProvider.validateDelay( "5000", "x" ), 5000 );
        assert.equal( HttpCacheProvider.validateDelay( 2147483647, "x" ), 2147483647 );
    } );

    it( "refuses a state URL that is not a URL, and trims the trailing slash from one that is", () => {
        assert.equal( HttpCacheProvider.normalizeBaseUrl( "http://state.internal//" ), "http://state.internal" );
        assert.throws(
            () => HttpCacheProvider.normalizeBaseUrl( "state.internal" ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
                return true;
            }
        );
    } );

} );
