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

const http = require( "node:http" );

/**
 * Applies an RFC 7386 JSON merge patch.
 * <br/>
 * NOTE: This is what RedisJSON's JSON.MERGE does, and what the D1 handler is specified to do with SQLite's
 * `json_patch`. The stub implements the same semantics so that a test written against it stays true of the real thing.
 *
 * @method
 * @param {*} target
 * @param {*} patch
 * @returns {*}
 */
function mergePatch( target, patch ) {
    if ( patch === null || typeof patch !== "object" || Array.isArray( patch ) === true ) {
        return patch;
    }

    let result = ( target !== null && typeof target === "object" && Array.isArray( target ) === false ) ? { ...target } : {};
    Object.keys( patch ).forEach( ( key ) => {
        if ( patch[ key ] === null ) {
            delete result[ key ];
        } else {
            result[ key ] = mergePatch( result[ key ], patch[ key ] );
        }
    } );

    return result;
}

/**
 * Reads the value a path addresses, or undefined if any segment is missing.
 *
 * @method
 * @param {*} document
 * @param {string[]} segments
 * @returns {*}
 */
function readAtPath( document, segments ) {
    let current = document;
    for ( const segment of segments ) {
        if ( current === null || typeof current !== "object" ) {
            return undefined;
        }
        current = current[ segment ];
    }
    return current;
}

/**
 * Writes a value at the path, creating intermediate objects, and returns the (possibly new) document root.
 *
 * @method
 * @param {*} document
 * @param {string[]} segments
 * @param {*} value
 * @returns {*}
 */
function writeAtPath( document, segments, value ) {
    if ( segments.length === 0 ) {
        return value;
    }

    let root = ( document !== null && typeof document === "object" ) ? document : {};
    let current = root;
    for ( let i = 0; i < segments.length - 1; i++ ) {
        if ( current[ segments[ i ] ] === null || typeof current[ segments[ i ] ] !== "object" ) {
            current[ segments[ i ] ] = {};
        }
        current = current[ segments[ i ] ];
    }
    current[ segments[ segments.length - 1 ] ] = value;

    return root;
}

/**
 * Translates a Redis-style key glob into a regular expression.
 *
 * @method
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegExp( pattern ) {
    let escaped = String( pattern ).replace( /[.+^${}()|[\]\\]/g, "\\$&" );
    return new RegExp( "^" + escaped.replace( /\*/g, ".*" ).replace( /\?/g, "." ) + "$" );
}

/**
 * An in-memory implementation of the state protocol that {@link HttpCacheProvider} speaks.
 * <br/>
 * NOTE: This is the whole reason the provider is named for its transport rather than for D1. The contract is an HTTP
 * protocol, so the test suite can hold up its own end of it without Cloudflare, wrangler, or a database — and a change
 * that breaks the protocol breaks here, in this package, rather than at deploy time.
 * <br/>
 * NOTE: Every handler completes synchronously inside one request callback, which is how it models a single SQL
 * statement. The document merge in particular must never become a read followed by a separate write; that is the
 * property {@link TiCacheCapability.ATOMIC_JSON_EDIT} is claiming.
 *
 * @method
 * @returns {Promise<Object>} The listening server, its base URL, the backing stores and a request log.
 * @public
 */
function startStubStateServer() {
    let values = new Map();
    let hashes = new Map();
    let documents = new Map();
    let expiries = new Map();
    let requestLog = [];
    let failures = new Map();
    let redirects = new Map();
    let truncations = new Set();
    let transportBroken = false;
    // Lets an expiry test move time instead of waiting for it. Sleeping for a real TTL would make the suite slow and
    // flaky for no extra confidence.
    let clockOffset = 0;

    const now = () => Date.now() + clockOffset;
    // A NUL separator, because a hash name or a field may legitimately contain any printable character.
    const fieldKey = ( hash, field ) => `${ hash }\u0000${ field }`;

    const hasExpired = ( key ) => expiries.has( key ) && expiries.get( key ) <= now();

    /**
     * Drops anything the key addresses if its deadline has passed, and reports whether it did.
     */
    const purge = ( key ) => {
        if ( hasExpired( key ) === false ) {
            return false;
        }
        expiries.delete( key );
        values.delete( key );
        hashes.delete( key );
        documents.delete( key );
        return true;
    };

    const purgeField = ( hash, field ) => {
        let key = fieldKey( hash, field );
        if ( hasExpired( key ) === false ) {
            return false;
        }
        expiries.delete( key );
        let fields = hashes.get( hash );
        if ( fields ) {
            fields.delete( field );
        }
        return true;
    };

    const liveKeys = () => {
        let keys = [ ...new Set( [ ...values.keys(), ...hashes.keys(), ...documents.keys() ] ) ];
        return keys.filter( ( key ) => purge( key ) === false );
    };

    // The method each path answers. A router that dispatched on the path alone would accept `GET /v1/values/get` and
    // `POST /v1/health`, so a provider that sent the wrong verb would pass against this stub and fail against a real
    // service.
    const routes = new Map( [
        [ "/v1/health", "GET" ],
        [ "/v1/keys/match", "POST" ],
        [ "/v1/keys/expire", "POST" ],
        [ "/v1/values/set", "POST" ],
        [ "/v1/values/get", "POST" ],
        [ "/v1/values/delete", "POST" ],
        [ "/v1/hashes/set", "POST" ],
        [ "/v1/hashes/get", "POST" ],
        [ "/v1/hashes/delete", "POST" ],
        [ "/v1/documents/set", "POST" ],
        [ "/v1/documents/get", "POST" ],
        [ "/v1/documents/merge", "POST" ]
    ] );

    const respond = ( response, status, body ) => {
        response.writeHead( status, { "content-type": "application/json" } );
        response.end( JSON.stringify( body ) );
    };

    const server = http.createServer( ( request, response ) => {
        let chunks = [];
        request.on( "data", ( chunk ) => chunks.push( chunk ) );
        request.on( "end", () => {
            // A genuine transport failure - the socket dies with no response - rather than an error status. The two
            // are handled differently by the provider on purpose, and only this one takes the cache out of service.
            // The server keeps listening, so recovery is a flag flip rather than a re-bind on the same port.
            if ( transportBroken === true ) {
                request.socket.destroy();
                return;
            }

            let path = request.url;
            let payload = ( chunks.length > 0 ) ? JSON.parse( Buffer.concat( chunks ).toString( "utf8" ) ) : {};
            requestLog.push( { path: path, method: request.method, payload: payload, headers: request.headers } );

            // Headers and the start of a chunked body, then the socket dies. The delay matters: undici does not
            // hand back a Response until the body begins arriving, so destroying the socket immediately fails the
            // `fetch()` call itself and never exercises the body-read path. With it, the caller gets a Response
            // reading 200 and ok, and only `text()` rejects - a transport failure wearing a success.
            if ( truncations.has( path ) === true ) {
                truncations.delete( path );
                response.writeHead( 200, { "content-type": "application/json", "transfer-encoding": "chunked" } );
                response.write( '{"value": "partial' );
                setTimeout( () => request.socket.destroy(), 60 );
                return;
            }

            // Lets a test prove the provider refuses a redirect rather than resending this body somewhere else.
            if ( redirects.has( path ) === true ) {
                let location = redirects.get( path );
                redirects.delete( path );
                response.writeHead( 307, { location: location, "content-type": "application/json" } );
                response.end( JSON.stringify( { error: "redirected by the test" } ) );
                return;
            }

            // Lets a test drive the error branches without taking the whole server down.
            if ( failures.has( path ) === true ) {
                let status = failures.get( path );
                failures.delete( path );
                respond( response, status, { error: "forced by the test" } );
                return;
            }

            if ( routes.has( path ) === false ) {
                respond( response, 404, { error: `no handler for '${ path }'` } );
                return;
            }
            if ( request.method !== routes.get( path ) ) {
                respond( response, 405, { error: `'${ path }' answers ${ routes.get( path ) }, not ${ request.method }` } );
                return;
            }

            switch ( path ) {
                case "/v1/health":
                    respond( response, 200, { ok: true } );
                    break;

                case "/v1/keys/match": {
                    let expression = globToRegExp( payload.pattern );
                    respond( response, 200, { keys: liveKeys().filter( ( key ) => expression.test( key ) ) } );
                    break;
                }

                case "/v1/keys/expire":
                    expiries.set(
                        ( payload.hash ) ? fieldKey( payload.hash, payload.key ) : payload.key,
                        now() + ( payload.seconds * 1000 )
                    );
                    respond( response, 200, { ok: true } );
                    break;

                case "/v1/values/set":
                    values.set( payload.key, payload.value );
                    expiries.delete( payload.key );
                    if ( payload.expiration !== undefined ) {
                        expiries.set( payload.key, now() + ( payload.expiration * 1000 ) );
                    }
                    respond( response, 200, { ok: true } );
                    break;

                case "/v1/values/get":
                    purge( payload.key );
                    respond( response, 200, { value: values.has( payload.key ) ? values.get( payload.key ) : null } );
                    break;

                case "/v1/values/delete":
                    expiries.delete( payload.key );
                    respond( response, 200, { deleted: values.delete( payload.key ) } );
                    break;

                case "/v1/hashes/set": {
                    let fields = hashes.get( payload.key ) || new Map();
                    fields.set( payload.field, payload.value );
                    hashes.set( payload.key, fields );
                    expiries.delete( fieldKey( payload.key, payload.field ) );
                    respond( response, 200, { ok: true } );
                    break;
                }

                case "/v1/hashes/get": {
                    purge( payload.key );
                    purgeField( payload.key, payload.field );
                    let fields = hashes.get( payload.key );
                    let value = ( fields && fields.has( payload.field ) ) ? fields.get( payload.field ) : null;
                    respond( response, 200, { value: value } );
                    break;
                }

                case "/v1/hashes/delete": {
                    purgeField( payload.key, payload.field );
                    let fields = hashes.get( payload.key );
                    respond( response, 200, { deleted: ( fields ) ? fields.delete( payload.field ) : false } );
                    break;
                }

                case "/v1/documents/set": {
                    purge( payload.key );
                    let existing = documents.has( payload.key ) ? documents.get( payload.key ) : undefined;
                    let addressed = readAtPath( existing, payload.path );
                    // 1 sets only if absent, 2 only if present; 0 always.
                    if ( ( payload.overrideMode === 1 && addressed !== undefined ) || ( payload.overrideMode === 2 && addressed === undefined ) ) {
                        respond( response, 200, { ok: true, skipped: true } );
                        break;
                    }
                    documents.set( payload.key, writeAtPath( existing, payload.path, JSON.parse( payload.value ) ) );
                    respond( response, 200, { ok: true } );
                    break;
                }

                case "/v1/documents/get": {
                    purge( payload.key );
                    let addressed = readAtPath( documents.get( payload.key ), payload.path );
                    respond( response, 200, { value: ( addressed === undefined ) ? null : JSON.stringify( addressed ) } );
                    break;
                }

                case "/v1/documents/merge": {
                    purge( payload.key );
                    let existing = documents.has( payload.key ) ? documents.get( payload.key ) : undefined;
                    let merged = mergePatch( readAtPath( existing, payload.path ), JSON.parse( payload.value ) );
                    documents.set( payload.key, writeAtPath( existing, payload.path, merged ) );
                    respond( response, 200, { ok: true } );
                    break;
                }

                default:
                    respond( response, 404, { error: `no handler for '${ path }'` } );
            }
        } );
    } );

    return new Promise( ( resolve ) => {
        server.listen( 0, "127.0.0.1", () => {
            resolve( {
                server: server,
                baseUrl: `http://127.0.0.1:${ server.address().port }`,
                values: values,
                expiries: expiries,
                hashes: hashes,
                documents: documents,
                requestLog: requestLog,
                failNext: ( path, status ) => failures.set( path, status ),
                redirectNext: ( path, location ) => redirects.set( path, location ),
                breakTransportAfterHeaders: ( path ) => truncations.add( path ),
                breakTransport: ( flag ) => { transportBroken = flag; },
                advanceClock: ( milliseconds ) => { clockOffset += milliseconds; }
            } );
        } );
    } );
}

module.exports.startStubStateServer = startStubStateServer;
module.exports.mergePatch = mergePatch;
