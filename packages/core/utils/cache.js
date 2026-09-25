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
const ConnectionObserver = require( "#connection-observer" );
const HttpCacheProvider = require( "#http-cache-provider" );
const RedisCacheProvider = require( "#redis-cache-provider" );
const _ = require( "lodash" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );
const path = require( "path" );
const { cacheCapability } = require( "#cache-capability" );

/** @import { TiHttpCacheSettings } from "#definitions" */

/**
 * Determines whether a value is a class extending {@link CacheProvider}, without constructing it.
 * <br/>
 * NOTE: A `typeof === "function"` test is not enough, and constructing first to ask `instanceof` afterwards is worse.
 * An arrow function passes the `typeof` test but is not a constructor, so `new` on it throws a raw TypeError instead
 * of the documented exception; and an unrelated class would have its constructor RUN - arbitrary code from a
 * misconfigured path - before anything rejected it. Walking the prototype chain answers the question without
 * executing anything.
 *
 * @method
 * @param {*} candidate The value exported by the configured provider module.
 * @returns {boolean}
 * @public
 */
function isCacheProviderClass( candidate ) {
    return typeof candidate === "function" && candidate.prototype instanceof CacheProvider;
}

/**
 * The backends that ship with the engine, by the name a deployment configures them under.
 * <br/>
 * NOTE: A null-prototype object rather than a literal, so that a provider configured as "constructor" or "toString"
 * is treated as the module path it is instead of matching something inherited from Object.prototype.
 *
 * @readonly
 * @type {Object<string, typeof CacheProvider>}
 */
const builtInProviders = Object.assign( Object.create( null ), {
    http: HttpCacheProvider,
    redis: RedisCacheProvider
} );

/**
 * Creates the cache backend named by the 'memoryCache.provider' setting.
 * <br/>
 * NOTE: The built-in names are "redis" for {@link RedisCacheProvider} and "http" for {@link HttpCacheProvider}. Any
 * other value is treated as a module path resolved against the process working directory, much as 'TI_INSTANCE_CLASS'
 * already is, and must export a class extending {@link CacheProvider}. Resolution uses `path.resolve` rather than
 * `path.join` so that an absolute path is taken as given instead of being appended to the working directory.
 * <br/>
 * NOTE: This runs while the singleton is being constructed, which is to say at require time. A bad provider name
 * therefore fails the process immediately rather than at the first cache call - which is the point: a deployment
 * pointed at a backend that does not exist should not reach the code that assumes one.
 *
 * @method
 * @param {string} connectionIdentifier The identifier under which the backend's connection is observed.
 * @returns {CacheProvider}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the configured module does not export a {@link CacheProvider}.
 * @public
 */
function createConfiguredProvider( connectionIdentifier ) {
    let selected = config.getSetting( config.setting.MEMORY_CACHE_PROVIDER, "redis" );

    if ( builtInProviders[ selected ] !== undefined ) {
        return new builtInProviders[ selected ]( connectionIdentifier );
    }

    let ProviderClass;
    try {
        ProviderClass = require( path.resolve( process.cwd(), selected ) );
    } catch ( error ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
            details: `Could not load the cache provider configured as '${ selected }': ${ error.message }`
        } );
    }

    if ( isCacheProviderClass( ProviderClass ) === false ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
            details: `The cache provider configured as '${ selected }' does not export a class extending CacheProvider.`
        } );
    }

    return new ProviderClass( connectionIdentifier );
}

/**
 * Determines which of the required capabilities a backend does not provide.
 * <br/>
 * NOTE: This lives outside the class, and is exported, for the same reason the Redis decoders are: it is the pure half
 * of the reconciliation, and the half that decides whether an instance starts.
 *
 * @method
 * @param {string[]} [required] Capabilities the application declared it needs.
 * @param {string[]} [available] Capabilities the backend reports it provides.
 * @returns {string[]} The required capabilities that are absent, in the order they were required.
 * @public
 */
function findMissingCapabilities( required, available ) {
    let provided = new Set( Array.isArray( available ) ? available : [] );
    return _.filter( Array.isArray( required ) ? required : [], ( capability ) => provided.has( capability ) === false );
}

/**
 * Used to create and/or return a Common Memory Cache singleton instance.
 * <br/>
 * NOTE: This owns the cache's operational state and the connection observation around it; where the values actually
 * live is the {@link CacheProvider}'s business. Every method here checks that the cache is usable and then delegates,
 * which is why no provider repeats that check.
 *
 * @class CommonMemoryCache
 * @extends ConnectionObserver
 * @singleton
 * @public
 */
class CommonMemoryCache extends ConnectionObserver {

    static #instance = null;
    /** @type CacheProvider */
    #provider = null;
    #isOperational = false;
    #connectionIdentifier = "system-cache";
    /** @type {string[]|null} Null for the configured cache, which reads 'memoryCache.requiredCapabilities'. */
    #requiredCapabilities = null;

    /**
     * @constructor
     * @param {Object} [store] Given, this is an independent store rather than the configured singleton — which is what
     * {@link createCacheStore} passes. Omitted, the configured cache is created once and returned ever after.
     * @param {string} store.connectionIdentifier
     * @param {CacheProvider} store.provider
     * @param {string[]} [store.requiredCapabilities]
     * @return {CommonMemoryCache}
     */
    constructor( store ) {
        super();

        if ( store && store.provider ) {
            this.#connectionIdentifier = store.connectionIdentifier;
            this.#provider = store.provider;
            this.#requiredCapabilities = Array.isArray( store.requiredCapabilities ) ? [ ...store.requiredCapabilities ] : [];
            this.#provider.addConnectionObserver( this );
            return this;
        }

        if ( !CommonMemoryCache.#instance ) {
            this.#provider = createConfiguredProvider( this.#connectionIdentifier );
            this.#provider.addConnectionObserver( this );

            CommonMemoryCache.#instance = this;
        }
        return CommonMemoryCache.#instance;
    }

    /* Public interface */

    /**
     * Property returning the operational state of the cache.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isOperational() {
        return this.#isOperational;
    }

    /**
     * Property returning the connection identifier of the cache service.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier() {
        return this.#connectionIdentifier;
    }

    /**
     * Property returning the optional behaviors the configured backend provides.
     * <br/>
     * NOTE: Accurate only once {@link CommonMemoryCache#initialize} has resolved — some capabilities cannot be
     * established until the backend has connected.
     *
     * @property
     * @returns {string[]} Values drawn from {@link TiCacheCapability}.
     * @public
     */
    get capabilities() {
        return this.#provider.capabilities;
    }

    /**
     * Used to initialize the cache service.
     * <br/>
     * NOTE: Once the backend is connected, the capabilities it reports are reconciled against the
     * 'memoryCache.requiredCapabilities' setting, and startup fails if any of them is missing. That is deliberate: a
     * backend silently lacking a behavior the application depends on is otherwise discovered from inside a request,
     * long after the deployment that introduced it.
     * <br/>
     * NOTE: A failed reconciliation rolls the cache back to non-operational and shuts the backend down before it
     * rejects, so a refused startup never leaves a usable cache behind.
     *
     * @method
     * @returns {Promise}
     * @throws {TiException.E_GEN_FEATURE_UNSUPPORTED} If the backend does not provide every required capability.
     * @public
     */
    initialize() {
        return this.#provider.initialize().then( () => {
            try {
                this.#verifyRequiredCapabilities();
            } catch ( error ) {
                // The backend is already connected and this cache already operational by the time the check runs:
                // the Redis client notifies its connection observers from inside its "ready" handler, before
                // `initialize()` resolves, and `onConnectionRecovered` sets `#isOperational` to true. Rejecting
                // without undoing that would leave the singleton reporting an operational cache over a live
                // connection while its caller has been told that startup failed - `ServiceInstance.onStart` only
                // propagates the rejection, and `shutDown()` is reached from `stop()`, which a failed start never
                // gets to. So the rollback belongs here, where the failure is raised.
                this.#isOperational = false;
                return this.#provider.shutDown().catch( () => {
                    // A backend that cannot close cleanly must not replace the reason startup was refused.
                } ).then( () => {
                    throw error;
                } );
            }
        } );
    }

    /**
     * Used to gracefully shut down the cache service.
     *
     * @method
     * @return {Promise}
     * @public
     */
    shutDown() {
        return this.#provider.shutDown();
    }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isOperational = false;
        }
    }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isOperational = true;
        }
    }

    /**
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @throws {TiException.E_GEN_SYSTEM_CACHE_UNAVAILABLE} If the cache service is no longer available.
     * @override
     * @public
     */
    onConnectionLost( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isOperational = false;
            // TODO: implement forced shut down of the service instance instead of crashing it outright
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE );
        }
    }

    /**
     * Used to register a new {@link ConnectionObserver} for events related to the underlying backend connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        this.#provider.addConnectionObserver( connectionObserver );
    }

    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @public
     */
    matchKeys( pattern ) {
        return this.#guarded( () => this.#provider.matchKeys( pattern ) );
    }

    /**
     * Used to set a specific string value.
     *
     * @method
     * @param {string} key
     * @param {string} value
     * @param {number} [expiration] Expiration value is in seconds.
     * @return {Promise<string>}
     * @public
     */
    setValue( key, value, expiration ) {
        return this.#guarded( () => this.#provider.setValue( key, value, expiration ) );
    }

    /**
     * Used to set multiple string values.
     *
     * @method
     * @param {Object} keyValues
     * @param {string} [prefix]
     * @param {number} [expiration]
     * @return {Promise}
     * @public
     */
    setValues( keyValues, prefix, expiration ) {
        return this.#guarded( () => this.#provider.setValues( keyValues, prefix, expiration ) );
    }

    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @return {Promise}
     * @public
     */
    getValue( key ) {
        return this.#guarded( () => this.#provider.getValue( key ) );
    }

    /**
     * Used to get multiple string values.
     *
     * @method
     * @param {string[]} keys
     * @param {string} [prefix]
     * @return {Promise}
     * @public
     */
    getValues( keys, prefix ) {
        return this.#guarded( () => this.#provider.getValues( keys, prefix ) );
    }

    /**
     * Used to delete a value / item.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @public
     */
    deleteValue( key ) {
        return this.#guarded( () => this.#provider.deleteValue( key ) );
    }

    /**
     * Used to set expiration in seconds to an existing key.
     * <br/>
     * NOTE: For performance optimization reasons, only use this only if the Redis command does not itself support the 'EX' argument.
     *
     * @method
     * @param {string} key
     * @param {number} seconds
     * @param {string} [name] If you need to expire a field in a hash set instead, provide the name of the set here.
     * @returns {Promise<number>} This will resolve with the seconds as provided initially by the caller.
     * @public
     */
    expireValue( key, seconds, name ) {
        return this.#guarded( () => this.#provider.expireValue( key, seconds, name ) );
    }

    /**
     * Used to add the specified values to a list.
     *
     * @method
     * @param {string} listName
     * @param {Object[]} values
     * @returns {Promise<number>}
     * @public
     */
    listPushValue( listName, values ) {
        return this.#guarded( () => this.#provider.listPushValue( listName, values ) );
    }

    /**
     * Used to add the specified value to a set.
     *
     * @method
     * @param {string} key
     * @param {string|Object} value
     * @returns {Promise}
     * @public
     */
    addToSet( key, value ) {
        return this.#guarded( () => this.#provider.addToSet( key, value ) );
    }

    /**
     * Used to add multiple values to multiple sets in one transactional request.
     * <br/>
     * NOTE: The two arrays of keys and values must have correct index relations (i.e., first pair on keys[0] and values[0] and so on)!
     *
     * @method
     * @param {string[]} keys
     * @param {string[]} values
     * @returns {Promise}
     * @public
     */
    addToSetMulti( keys, values ) {
        return this.#guarded( () => this.#provider.addToSetMulti( keys, values ) );
    }

    /**
     * Used to check if the provided value is a member of the specified set.
     *
     * @method
     * @param {string} setName
     * @param {string} value
     * @returns {Promise<boolean>}
     * @public
     */
    isSetMember( setName, value ) {
        return this.#guarded( () => this.#provider.isSetMember( setName, value ) );
    }

    /**
     * Used to get all elements of a set.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Object[]>}
     * @public
     */
    membersOfSet( key ) {
        return this.#guarded( () => this.#provider.membersOfSet( key ) );
    }

    /**
     * Used to get a union of all elements in the list of sets.
     *
     * @method
     * @param {string[]} keys
     * @returns {Promise<Object[]>}
     * @public
     */
    unionOfSets( keys ) {
        return this.#guarded( () => this.#provider.unionOfSets( keys ) );
    }

    /**
     * Used to set a single hash field.
     *
     * @method
     * @deprecated
     * @param {string} key
     * @param {string} name
     * @param {*} value
     * @returns {Promise}
     * @public
     */
    hashSetField( key, name, value ) {
        return this.#guarded( () => this.#provider.hashSetField( key, name, value ) );
    }

    /**
     * Used to set multiple hash fields.
     *
     * @method
     * @deprecated
     * @param {string} key
     * @param {Object[]} fields
     * @param {string} fields[].name
     * @param {*} fields[].value
     * @returns {Promise}
     * @public
     */
    hashSetFields( key, fields ) {
        return this.#guarded( () => this.#provider.hashSetFields( key, fields ) );
    }

    /**
     * Used to get a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise}
     * @public
     */
    hashGetField( key, field ) {
        return this.#guarded( () => this.#provider.hashGetField( key, field ) );
    }

    /**
     * Used to remove a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise<boolean>} Will return 'true' if the field was removed, 'false' otherwise.
     * @public
     */
    hashDeleteField( key, field ) {
        return this.#guarded( () => this.#provider.hashDeleteField( key, field ) );
    }

    /**
     * Used to store a JSON variable.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments (use the array form when key names may contain dots or other special characters).
     * @param {number} [overrideMode=0] By default this allows full override for existing keys.
     * Option 1 will set the key only if it doesn't already exist. Option 2 will set it only if it already exists.
     * @returns {Promise}
     * @public
     */
    setJSON( key, value, path = "$", overrideMode = 0 ) {
        return this.#guarded( () => this.#provider.setJSON( key, value, path, overrideMode ) );
    }

    /**
     * Used to fetch a JSON variable.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments (use the array form when key names may contain dots or other special characters).
     * @returns {Promise<Object>}
     * @public
     */
    getJSON( key, path = "$" ) {
        return this.#guarded( () => this.#provider.getJSON( key, path ) );
    }

    /**
     * Used to fetch the value at a path of a JSON document — the addressed value or `null`, in the same shape from
     * every backend. Prefer it to {@link CommonMemoryCache#getJSON}, whose answer is a list of matches from Redis and
     * the bare value over HTTP (CA-178).
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<*>}
     * @public
     */
    getJSONValue( key, path = "$" ) {
        return this.#guarded( () => this.#provider.getJSONValue( key, path ) );
    }

    /**
     * Used to update/edit an existing JSON variable.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments (use the array form when key names may contain dots or other special characters).
     * @returns {Promise}
     * @public
     */
    editJSON( key, value, path = "$" ) {
        return this.#guarded( () => this.#provider.editJSON( key, value, path ) );
    }

    /**
     * Used to add an item to a JSON array. That array needs to exist already.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments (use the array form when key names may contain dots or other special characters).
     * @returns {Promise}
     * @public
     */
    arrayAppendJSON( key, value, path = "$" ) {
        return this.#guarded( () => this.#provider.arrayAppendJSON( key, value, path ) );
    }

    /* Private interface */

    /**
     * Used to reject an operation when the cache is not usable, and to delegate it to the backend when it is.
     * <br/>
     * NOTE: This exists so the check lives in exactly one place. It previously stood at the head of all twenty-one
     * data methods, which is twenty-one chances for a new method to be added without it.
     *
     * @method
     * @param {function(): Promise} operation
     * @returns {Promise}
     */
    #guarded( operation ) {
        return ( this.#isOperational === true )
            ? operation()
            : Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
    }

    /**
     * Used to reconcile what the application requires against what the backend reports it can do.
     *
     * @method
     * @throws {TiException.E_GEN_FEATURE_UNSUPPORTED} If any required capability is absent.
     */
    #verifyRequiredCapabilities() {
        let required = ( this.#requiredCapabilities !== null ) ? this.#requiredCapabilities : config.getSetting( config.setting.MEMORY_CACHE_REQUIRED_CAPABILITIES, [] );
        if ( _.isEmpty( required ) === true ) {
            return;
        }

        let missing = findMissingCapabilities( required, this.#provider.capabilities );
        if ( missing.length > 0 ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED, {
                details: `The configured cache backend '${ this.#provider.constructor.name }' does not provide the required ${ ( missing.length === 1 ) ? "capability" : "capabilities" }: ${ missing.join( ", " ) }.`
            } );
        }
    }

}

const instance = new CommonMemoryCache();
module.exports.instance = Object.freeze( instance );

/**
 * Opens an independent store: its own backend, connection observation and capability check, beside — never instead
 * of — the configured cache.
 * <br/>
 * The configured cache is where the framework keeps sessions and the configuration store. An application whose own
 * records belong somewhere else — competence keeps its organization in D1 behind a Worker while a Redis install keeps
 * everything in Redis — opens a store for them here rather than following wherever the sessions went (CA-176).
 * <br/>
 * NOTE: The store is not connected yet: call {@link CommonMemoryCache#initialize} on it, and
 * {@link CommonMemoryCache#shutDown} when done. Only the built-in HTTP backend takes settings of its own; "redis"
 * opens a second connection with the configured Redis settings.
 *
 * @method
 * @param {string} connectionIdentifier The identifier under which the store's connection is observed and logged.
 * @param {Object} [options]
 * @param {string} [options.provider="http"] "http" or "redis".
 * @param {TiHttpCacheSettings} [options.settings] For "http": the service to reach, overriding the configured one.
 * @param {string[]} [options.requiredCapabilities] Capabilities the store must provide, checked when it initializes.
 * @returns {CommonMemoryCache}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the provider is not a built-in one.
 * @public
 */
function createCacheStore( connectionIdentifier, options = {} ) {
    const name = ( options && typeof options.provider === "string" ) ? options.provider : "http";
    if ( builtInProviders[ name ] === undefined ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
            details: `A cache store can use the 'http' or 'redis' backend, not '${ name }'.`
        } );
    }
    const provider = ( name === "http" )
        ? new HttpCacheProvider( connectionIdentifier, options.settings )
        : new builtInProviders[ name ]( connectionIdentifier );
    // Frozen like the configured instance: callers share a store the way they share that one.
    return Object.freeze( new CommonMemoryCache( {
        connectionIdentifier: connectionIdentifier,
        provider: provider,
        requiredCapabilities: options.requiredCapabilities
    } ) );
}

module.exports.createCacheStore = createCacheStore;

// Re-exported from the Redis backend, where these now live along with the rest of the Redis-specific decoding. They
// stay on this module because it is the published entry point and removing them would break any consumer that reaches
// for them - including this package's own `cache-get-values` suite.
module.exports.decodeCommandValue = RedisCacheProvider.decodeCommandValue;
module.exports.mapCommandValues = RedisCacheProvider.mapCommandValues;

// Re-exported so a consumer can name a capability without reaching past this module's exports map.
module.exports.cacheCapability = cacheCapability;

// Exported for testing, per the notes on the functions themselves.
module.exports.findMissingCapabilities = findMissingCapabilities;
module.exports.createConfiguredProvider = createConfiguredProvider;
module.exports.isCacheProviderClass = isCacheProviderClass;
