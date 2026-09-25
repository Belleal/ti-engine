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

const CacheProvider = require( "#cache-provider" );
const _ = require( "lodash" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );
const tools = require( "#tools" );
const { cacheCapability } = require( "#cache-capability" );

/** @import ConnectionObserver from "#connection-observer" */
/** @import { TiHttpCacheSettings } from "#definitions" */

/**
 * The paths making up the state protocol, one per logical operation.
 * <br/>
 * NOTE: One path per operation rather than one endpoint carrying a command name, because the service on the other end
 * is a Cloudflare Worker outbound handler (see the site's 'deployment-architecture.md' §7) and the whole point of that
 * arrangement is that the container never composes a query. A path the handler recognises is the entire vocabulary the
 * container has; anything it does not recognise is a 404 rather than an instruction.
 *
 * @readonly
 * @enum {string}
 */
const statePath = Object.freeze( {
    HEALTH: "/v1/health",
    MATCH_KEYS: "/v1/keys/match",
    EXPIRE_KEY: "/v1/keys/expire",
    SET_VALUE: "/v1/values/set",
    GET_VALUE: "/v1/values/get",
    DELETE_VALUE: "/v1/values/delete",
    SET_HASH_FIELD: "/v1/hashes/set",
    GET_HASH_FIELD: "/v1/hashes/get",
    DELETE_HASH_FIELD: "/v1/hashes/delete",
    SET_DOCUMENT: "/v1/documents/set",
    GET_DOCUMENT: "/v1/documents/get",
    MERGE_DOCUMENT: "/v1/documents/merge"
} );

/**
 * Converts a JSONPath argument into an array of literal key segments for transport.
 * <br/>
 * NOTE: This deliberately does NOT produce a JSONPath string. RedisJSON wants '$["a"]' and SQLite wants '$."a"', and
 * a provider that picked one of those would be handing the state service a dialect to re-parse — which is how an
 * escaping bug gets in. Segments travel as data; quoting is the store's business, at the point where the store is
 * known. The root path is the empty array.
 *
 * @method
 * @param {string|string[]} path A dot-separated JSONPath string, or an array of literal key segments.
 * @returns {string[]}
 * @public
 */
function toPathSegments( path ) {
    if ( Array.isArray( path ) ) {
        return path.map( ( segment ) => String( segment ) );
    }
    if ( path === undefined || path === null || path === "$" || path === "" ) {
        return [];
    }

    let normalized = String( path );
    normalized = ( normalized.startsWith( "$." ) === true ) ? normalized.slice( 2 ) : normalized;
    normalized = ( normalized.startsWith( "$" ) === true ) ? normalized.slice( 1 ) : normalized;

    return normalized.split( "." ).filter( ( segment ) => segment.length > 0 );
}

/**
 * Encodes a value the way the Redis backend puts it on the wire.
 * <br/>
 * NOTE: `tools.stringifyJSON` serialises objects and passes scalars through untouched, which is safe over the Redis
 * protocol because every argument is coerced to a string on its way out. JSON is not so forgiving: a number would
 * arrive as a number and come back failing the `isString` test that decides whether a key exists, so a stored 42
 * would read back as absent. Coercing here keeps both backends storing and returning exactly the same thing.
 *
 * @method
 * @param {*} value
 * @returns {string}
 * @public
 */
function encodeValue( value ) {
    return String( tools.stringifyJSON( value ) );
}

/**
 * The largest delay both `AbortSignal.timeout` and `setInterval` handle without surprises.
 * <br/>
 * NOTE: `AbortSignal.timeout` accepts up to 4294967295, but `setInterval` silently wraps anything above this to 1ms -
 * a busy loop rather than a slow probe. The stricter of the two bounds is the safe one for both.
 *
 * @readonly
 */
const MAX_DELAY_MS = 2147483647;

/**
 * Validates a millisecond setting before anything tries to use it as a timer.
 * <br/>
 * NOTE: This exists because `AbortSignal.timeout` throws a RangeError SYNCHRONOUSLY on a bad delay. An unparseable
 * `TI_MEMORY_CACHE_STATE_TIMEOUT` therefore does not reject the promise a caller is awaiting - it throws out of the
 * method, breaking the contract every other failure in this class honours. Failing in the constructor instead means a
 * misconfigured deployment stops at startup, where somebody is watching.
 *
 * @method
 * @param {*} value
 * @param {string} settingName The setting to name in the exception, so the fix is obvious.
 * @returns {number}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the value is not a usable delay.
 * @public
 */
function validateDelay( value, settingName ) {
    let delay = Number( value );
    if ( Number.isInteger( delay ) === false || delay <= 0 || delay > MAX_DELAY_MS ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
            details: `The '${ settingName }' setting must be a positive whole number of milliseconds no greater than ${ MAX_DELAY_MS }; received '${ value }'.`
        } );
    }
    return delay;
}

/**
 * Strips trailing slashes from the configured base URL and rejects one that is not a URL at all.
 *
 * @method
 * @param {*} value
 * @returns {string}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the value cannot be parsed as a URL.
 * @public
 */
function normalizeBaseUrl( value ) {
    let candidate = String( value ).replace( /\/+$/, "" );
    try {
        void new URL( candidate );
    } catch {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
            details: `The 'memoryCache.stateUrl' setting is not a valid URL: '${ value }'.`
        } );
    }
    return candidate;
}

/**
 * Determines whether a hostname never leaves the machine.
 *
 * @method
 * @param {string} hostname
 * @returns {boolean}
 * @public
 */
function isLoopbackHost( hostname ) {
    let host = String( hostname ).replace( /^\[/, "" ).replace( /]$/, "" );
    return host === "localhost" || host === "::1" || /^127\./.test( host );
}

/**
 * Refuses to put a bearer token on a transport that cannot protect it.
 * <br/>
 * NOTE: The check applies only when a token is configured, which is what keeps the documented Cloudflare deployment
 * working untouched: there the container reaches its Worker over plain HTTP to a virtual hostname, and the binding
 * itself is the authentication, so no token is set and there is nothing to leak. A token plus plain HTTP to anywhere
 * that is not this machine is a credential on the wire, and that needs to be a deliberate choice rather than a typo
 * in an environment variable.
 *
 * @method
 * @param {string} baseUrl
 * @param {boolean} allowInsecure The operator's explicit opt-in, passed in rather than read here so the whole rule
 *                                can be tested without a differently configured process.
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If credentials would travel unprotected without an opt-in.
 * @public
 */
function verifyCredentialTransport( baseUrl, allowInsecure ) {
    let url = new URL( baseUrl );
    if ( url.protocol === "https:" || isLoopbackHost( url.hostname ) === true || allowInsecure === true ) {
        return;
    }

    throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
        details: `'memoryCache.stateAuthToken' is set, but 'memoryCache.stateUrl' is '${ baseUrl }' - a bearer token would travel unencrypted to a host that is not this machine. Use https, or set 'memoryCache.stateAllowInsecureAuth' if the transport is already protected by the platform.`
    } );
}

/**
 * A cache backend that keeps its state in an HTTP service rather than in a database client.
 * <br/>
 * NOTE: This exists because the site runs in a Cloudflare container, where the durable store (D1) is reachable only
 * through a Worker binding and therefore only over HTTP to a virtual hostname. No SDK and no credential live in the
 * image. That makes the provider a plain HTTP client, which is also why it is named for the transport rather than for
 * D1: what answers the protocol is the deployment's business, and a test can answer it with 'node:http'.
 * <br/>
 * NOTE: Only the methods the state store actually needs are implemented. Lists, sets and the multi-key batching are
 * left abstract on purpose — they are used exclusively by the message exchange, which is disabled in this deployment,
 * and a stub that silently returned nothing would be worse than the inherited exception that names the method.
 *
 * @class HttpCacheProvider
 * @extends CacheProvider
 * @public
 */
class HttpCacheProvider extends CacheProvider {

    #connectionIdentifier;
    #baseUrl;
    #authToken;
    #requestTimeout;
    #probeInterval;
    /** @type {ConnectionObserver[]} */
    #observers = [];
    #isConnected = false;
    #isShutDown = false;
    /** @type {NodeJS.Timeout} */
    #probeTimer = null;

    /**
     * @constructor
     * @param {string} connectionIdentifier The identifier under which this backend's connection is observed.
     * @param {TiHttpCacheSettings} [settings] Overrides for the configured `memoryCache.state*` settings. The
     * configured cache takes none; a store opened with {@link createCacheStore} names its own service this way, so an
     * application's records need not live wherever the framework's sessions do.
     */
    constructor( connectionIdentifier, settings = {} ) {
        super();

        const overrides = ( settings && typeof settings === "object" ) ? settings : {};
        const setting = ( name, key, fallback ) => ( overrides[ name ] !== undefined ) ? overrides[ name ] : config.getSetting( key, fallback );

        this.#connectionIdentifier = connectionIdentifier;
        this.#baseUrl = normalizeBaseUrl( setting( "stateUrl", config.setting.MEMORY_CACHE_STATE_URL, "http://state.internal" ) );
        this.#authToken = setting( "stateAuthToken", config.setting.MEMORY_CACHE_STATE_AUTH_TOKEN, null );
        this.#requestTimeout = validateDelay( setting( "stateTimeout", config.setting.MEMORY_CACHE_STATE_TIMEOUT, 5000 ), "memoryCache.stateTimeout" );
        this.#probeInterval = validateDelay( setting( "retryMaxInterval", config.setting.MEMORY_CACHE_RETRY_MAX_INTERVAL, 5000 ), "memoryCache.retryMaxInterval" );

        if ( this.#authToken ) {
            verifyCredentialTransport( this.#baseUrl, tools.toBool( setting( "stateAllowInsecureAuth", config.setting.MEMORY_CACHE_STATE_ALLOW_INSECURE_AUTH, false ) ) );
        }
    }

    /* Public interface */

    /**
     * Exposes {@link toPathSegments} so the wire format can be tested without a server.
     * <br/>
     * NOTE: A static rather than a named export, because this module's `module.exports` is the class itself and adding
     * named exports beside an export assignment makes the generated declaration file invalid.
     *
     * @method
     * @param {string|string[]} path
     * @returns {string[]}
     * @public
     */
    static toPathSegments( path ) {
        return toPathSegments( path );
    }

    /**
     * Exposes {@link validateDelay} so the refusal can be tested without a differently configured process.
     *
     * @method
     * @param {*} value
     * @param {string} settingName
     * @returns {number}
     * @public
     */
    static validateDelay( value, settingName ) {
        return validateDelay( value, settingName );
    }

    /**
     * Exposes {@link normalizeBaseUrl}, for the same reason.
     *
     * @method
     * @param {*} value
     * @returns {string}
     * @public
     */
    static normalizeBaseUrl( value ) {
        return normalizeBaseUrl( value );
    }

    /**
     * Exposes {@link verifyCredentialTransport}, whose rule is worth pinning in full.
     *
     * @method
     * @param {string} baseUrl
     * @param {boolean} allowInsecure
     * @public
     */
    static verifyCredentialTransport( baseUrl, allowInsecure ) {
        verifyCredentialTransport( baseUrl, allowInsecure );
    }


    /**
     * Returns the optional behaviors this backend provides.
     * <br/>
     * NOTE: {@link TiCacheCapability.ATOMIC_JSON_EDIT} is declared because the protocol's document merge is required to
     * be a single statement at the store — on D1 that is one UPDATE wrapping 'json_patch', which SQLite applies
     * atomically. A service that implements the merge as a read, a change and a write MUST NOT be pointed at by this
     * provider; see the site's 'deployment-architecture.md' §4.2 for what that costs.
     *
     * @property
     * @returns {string[]}
     * @override
     * @public
     */
    get capabilities() {
        return [
            cacheCapability.KEY_EXPIRY,
            cacheCapability.KEY_PATTERN_MATCH,
            cacheCapability.HASH_FIELDS,
            cacheCapability.JSON_DOCUMENTS,
            cacheCapability.ATOMIC_JSON_EDIT
        ];
    }

    /**
     * Verifies that the state service is reachable and announces the connection.
     * <br/>
     * NOTE: Observers are notified BEFORE the returned promise settles, matching the Redis client's ordering. The
     * cache singleton turns operational on that notification and validates capabilities once this resolves, so a
     * provider that resolved first would be briefly reachable while still reported as down.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    initialize() {
        return this.#fetchJSON( statePath.HEALTH, null ).then( () => {
            this.#markConnected();
        } ).catch( ( error ) => {
            // `#fetchJSON` rejects with a raised TiException, which keeps its account of what went wrong in
            // `data.details` and has no `message` at all. Reading `message` reported every failure as "undefined",
            // hiding the one fact this line exists to give: why the probe failed.
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE, {
                details: `The state service at '${ this.#baseUrl }' did not answer the health probe: ${ error?.data?.details || error?.message || String( error ) }`
            } );
        } );
    }

    /**
     * Stops the connection probe and marks the backend closed.
     * <br/>
     * NOTE: There is no socket to close — every call is a separate request — so the only resource to release is the
     * recovery timer, and the only state to set is the flag that stops a late response from re-announcing a connection
     * after shut down.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    shutDown() {
        this.#isShutDown = true;
        this.#isConnected = false;
        this.#stopProbing();
        return Promise.resolve();
    }

    /**
     * Registers an observer for this backend's connection events.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver
     * @override
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        this.#observers.push( connectionObserver );
    }

    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @override
     * @public
     */
    matchKeys( pattern ) {
        return this.#fetchJSON( statePath.MATCH_KEYS, { pattern: pattern } ).then( ( body ) => {
            return Array.isArray( body.keys ) ? body.keys : [];
        } );
    }

    /**
     * Used to set a specific string value.
     * <br/>
     * NOTE: A falsy value resolves without reaching the service, and the original value is handed back rather than
     * whatever the service answered. Both match the Redis backend exactly; callers depend on the return value being
     * what they passed in.
     *
     * @method
     * @param {string} key
     * @param {string} value
     * @param {number} [expiration] Expiration value is in seconds.
     * @returns {Promise<string>}
     * @override
     * @public
     */
    setValue( key, value, expiration ) {
        if ( !value ) {
            return Promise.resolve( value );
        }

        let payload = { key: key, value: encodeValue( value ) };
        if ( expiration ) {
            payload.expiration = expiration;
        }

        return this.#fetchJSON( statePath.SET_VALUE, payload ).then( () => value );
    }

    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @returns {Promise}
     * @override
     * @public
     */
    getValue( key ) {
        return this.#fetchJSON( statePath.GET_VALUE, { key: key } ).then( ( body ) => {
            // `undefined` rather than `null` for an absent key: that is what the Redis decoder returns, and
            // `web-framework` distinguishes the two when deciding whether a session exists.
            return _.isString( body.value ) ? tools.parseJSON( body.value ) : undefined;
        } );
    }

    /**
     * Used to delete a value / item.
     * <br/>
     * NOTE: This resolves the boolean the contract declares. The Redis backend resolves the raw command result - a
     * count, or undefined - which contradicts its own signature; nothing calls it, so there is no behaviour to
     * preserve and the declared contract wins.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @override
     * @public
     */
    deleteValue( key ) {
        return this.#fetchJSON( statePath.DELETE_VALUE, { key: key } ).then( ( body ) => {
            return tools.toBool( body.deleted );
        } );
    }

    /**
     * Used to set expiration in seconds to an existing key.
     * <br/>
     * NOTE: When "name" is given it is the hash the field belongs to, and "key" is the field within it. That argument
     * order reads backwards but it is the established one.
     *
     * @method
     * @param {string} key
     * @param {number} seconds
     * @param {string} [name] If a field in a hash set is to be expired instead, the name of that set.
     * @returns {Promise<number>}
     * @override
     * @public
     */
    expireValue( key, seconds, name ) {
        let payload = { key: key, seconds: seconds };
        if ( name ) {
            payload.hash = name;
        }

        return this.#fetchJSON( statePath.EXPIRE_KEY, payload ).then( () => seconds );
    }

    /**
     * Used to set a single field in a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} name
     * @param {string|Object} value
     * @returns {Promise}
     * @override
     * @public
     */
    hashSetField( key, name, value ) {
        return this.#fetchJSON( statePath.SET_HASH_FIELD, {
            key: key,
            field: name,
            value: encodeValue( value )
        } ).then( () => undefined );
    }

    /**
     * Used to fetch a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @override
     * @public
     */
    hashGetField( key, field ) {
        return this.#fetchJSON( statePath.GET_HASH_FIELD, { key: key, field: field } ).then( ( body ) => {
            return _.isString( body.value ) ? tools.parseJSON( body.value ) : null;
        } );
    }

    /**
     * Used to delete a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @override
     * @public
     */
    hashDeleteField( key, field ) {
        return this.#fetchJSON( statePath.DELETE_HASH_FIELD, { key: key, field: field } ).then( ( body ) => {
            return tools.toBool( body.deleted );
        } );
    }

    /**
     * Used to store a JSON document, or a branch of one.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @param {number} [overrideMode=0] 0 allows full override; 1 sets only if absent; 2 sets only if present.
     * @returns {Promise}
     * @override
     * @public
     */
    setJSON( key, value, path = "$", overrideMode = 0 ) {
        return this.#fetchJSON( statePath.SET_DOCUMENT, {
            key: key,
            path: toPathSegments( path ),
            value: encodeValue( value ),
            overrideMode: overrideMode
        } ).then( () => undefined );
    }

    /**
     * Used to fetch a JSON document, or a branch of one.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<Object>}
     * @override
     * @public
     */
    getJSON( key, path = "$" ) {
        return this.#fetchJSON( statePath.GET_DOCUMENT, {
            key: key,
            path: toPathSegments( path )
        } ).then( ( body ) => {
            return _.isString( body.value ) ? tools.parseJSON( body.value ) : null;
        } );
    }

    /**
     * Used to fetch the value at a path of a JSON document. The protocol already answers the value itself, so this is
     * {@link HttpCacheProvider#getJSON} under the name whose shape both backends share.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<*>} The addressed value, or `null`.
     * @override
     * @public
     */
    getJSONValue( key, path = "$" ) {
        return this.getJSON( key, path );
    }

    /**
     * Used to merge a value into an existing JSON document at the given path.
     * <br/>
     * NOTE: The service applies this as one statement. See {@link HttpCacheProvider#capabilities} for why that is a
     * requirement of the protocol rather than an implementation detail of whatever answers it.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise}
     * @override
     * @public
     */
    editJSON( key, value, path = "$" ) {
        return this.#fetchJSON( statePath.MERGE_DOCUMENT, {
            key: key,
            path: toPathSegments( path ),
            value: encodeValue( value )
        } ).then( () => undefined );
    }

    /* Private interface */

    /**
     * Performs one protocol request and returns the decoded response body.
     * <br/>
     * NOTE: A transport failure and an error status are treated differently on purpose. The first means the service is
     * unreachable and takes the whole cache out of operation through {@link ConnectionObserver#onConnectionDisrupted};
     * the second means the service answered and rejected this particular call, which says nothing about the next one.
     * Conflating them would let a single bad key mark the cache down.
     *
     * @method
     * @param {string} path One of {@link statePath}.
     * @param {Object} [payload] The request body; a null payload issues a GET.
     * @returns {Promise<Object>}
     */
    #fetchJSON( path, payload ) {
        let headers = { "accept": "application/json" };
        if ( this.#authToken ) {
            headers.authorization = `Bearer ${ this.#authToken }`;
        }

        let body = null;
        if ( payload !== null && payload !== undefined ) {
            body = JSON.stringify( payload );
            headers[ "content-type" ] = "application/json";
        }

        let options = {
            method: ( body === null ) ? "GET" : "POST",
            headers: headers,
            // A state service has no business redirecting. Following one would resend this body - and, on a 307 or
            // 308, this request's credentials - to a host the configuration never named. Every 3xx falls through to
            // the not-ok branch below instead.
            redirect: "manual",
            signal: AbortSignal.timeout( this.#requestTimeout )
        };
        if ( body !== null ) {
            options.body = body;
        }

        let asTransportFailure = ( error ) => {
            this.#markDisrupted();
            return exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE, {
                details: `The state service at '${ this.#baseUrl }' could not be reached for '${ path }': ${ HttpCacheProvider.#describeTransportError( error ) }`
            } );
        };

        return fetch( this.#baseUrl + path, options ).then( ( response ) => {
            // The body is read before anything at all is concluded from the response. A socket that dies part-way
            // through a body is as much a transport failure as one that never connected, and announcing recovery
            // first would leave this cache reporting itself operational over a connection that had just died - the
            // same shape of defect the capability check carried in 1.13.0.
            return response.text().then( ( text ) => ( { response: response, text: text } ), ( error ) => {
                throw asTransportFailure( error );
            } );
        }, ( error ) => {
            throw asTransportFailure( error );
        } ).then( ( answered ) => {
            // The service answered in full, so the connection is good even where the call is not.
            this.#markConnected();

            if ( answered.response.ok === false ) {
                throw exceptions.raise( exceptions.exceptionCode.E_GEN_JS_INTERNAL_ERROR, {
                    details: `The state service answered '${ path }' with HTTP ${ answered.response.status }: ${ answered.text.slice( 0, 200 ) }`
                } );
            }
            // An empty body is a valid acknowledgement for the write operations, which have nothing to return.
            return ( answered.text.length > 0 ) ? tools.parseJSON( answered.text ) : {};
        } );
    }

    /**
     * What a failed `fetch` actually says went wrong.
     * <br/>
     * `fetch` rejects with the bare message "fetch failed" for every network-level failure and puts the reason - a
     * DNS lookup that found nothing, a socket the other side closed - in `cause`. Reporting the message alone makes a
     * hostname that does not resolve indistinguishable from a service that is down.
     *
     * @method
     * @param {Error} error
     * @returns {string}
     */
    static #describeTransportError( error ) {
        const message = ( error && error.message ) || String( error );
        const cause = error && error.cause;
        const causeMessage = cause ? ( cause.message || cause.code || String( cause ) ) : "";
        return ( causeMessage && causeMessage !== message ) ? `${ message }: ${ causeMessage }` : message;
    }

    /**
     * Announces a working connection, once per transition.
     *
     * @method
     */
    #markConnected() {
        if ( this.#isShutDown === true ) {
            return;
        }

        this.#stopProbing();
        if ( this.#isConnected === false ) {
            this.#isConnected = true;
            this.#observers.forEach( ( observer ) => observer.onConnectionRecovered( this.#connectionIdentifier ) );
        }
    }

    /**
     * Announces a broken connection and starts probing for its return.
     * <br/>
     * NOTE: The probe is what makes recovery possible at all. Once the cache singleton is told the connection is
     * disrupted it stops passing calls through, so this provider would never see another request to discover the
     * service on — the Redis client is spared this because its own reconnect loop runs independently of commands.
     * This timer is that loop.
     *
     * @method
     */
    #markDisrupted() {
        if ( this.#isShutDown === true ) {
            return;
        }

        if ( this.#isConnected === true ) {
            this.#isConnected = false;
            this.#observers.forEach( ( observer ) => observer.onConnectionDisrupted( this.#connectionIdentifier ) );
        }

        if ( this.#probeTimer === null ) {
            this.#probeTimer = setInterval( () => {
                this.#fetchJSON( statePath.HEALTH, null ).catch( () => {
                    // Still down. The next tick tries again; `#fetchJSON` has already re-reported the disruption.
                } );
            }, this.#probeInterval );
            // Never hold the process open for a cache that is already down.
            this.#probeTimer.unref();
        }
    }

    /**
     * Stops the recovery probe if one is running.
     *
     * @method
     */
    #stopProbing() {
        if ( this.#probeTimer !== null ) {
            clearInterval( this.#probeTimer );
            this.#probeTimer = null;
        }
    }

}

module.exports = HttpCacheProvider;
