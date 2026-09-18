declare const _exported: Readonly<CommonMemoryCache>;
export { _exported as instance };
export declare var decodeCommandValue: typeof import("#redis-cache-provider").decodeCommandValue;
export declare var mapCommandValues: typeof import("#redis-cache-provider").mapCommandValues;
export { cacheCapability };
export { findMissingCapabilities };
export { createConfiguredProvider };
export { isCacheProviderClass };
import CacheProvider = require("#cache-provider");
import ConnectionObserver = require("#connection-observer");
import RedisCacheProvider = require("#redis-cache-provider");
import { cacheCapability } from "#cache-capability";
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
declare function isCacheProviderClass(candidate: any): boolean;
/**
 * Creates the cache backend named by the 'memoryCache.provider' setting.
 * <br/>
 * NOTE: The built-in name "redis" selects {@link RedisCacheProvider}. Any other value is treated as a module path
 * resolved against the process working directory, much as 'TI_INSTANCE_CLASS' already is, and must export a class
 * extending {@link CacheProvider}. Resolution uses `path.resolve` rather than `path.join` so that an absolute path is
 * taken as given instead of being appended to the working directory.
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
declare function createConfiguredProvider(connectionIdentifier: string): CacheProvider;
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
declare function findMissingCapabilities(required?: string[], available?: string[]): string[];
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
declare class CommonMemoryCache extends ConnectionObserver {
    #private;
    /**
     * @constructor
     * @return {CommonMemoryCache}
     */
    constructor();
    /**
     * Property returning the operational state of the cache.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isOperational(): boolean;
    /**
     * Property returning the connection identifier of the cache service.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier(): string;
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
    get capabilities(): string[];
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
    initialize(): Promise<any>;
    /**
     * Used to gracefully shut down the cache service.
     *
     * @method
     * @return {Promise}
     * @public
     */
    shutDown(): Promise<any>;
    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @throws {TiException.E_GEN_SYSTEM_CACHE_UNAVAILABLE} If the cache service is no longer available.
     * @override
     * @public
     */
    onConnectionLost(identifier: string): void;
    /**
     * Used to register a new {@link ConnectionObserver} for events related to the underlying backend connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver(connectionObserver: ConnectionObserver): void;
    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @public
     */
    matchKeys(pattern: string): Promise<any[]>;
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
    setValue(key: string, value: string, expiration?: number): Promise<string>;
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
    setValues(keyValues: Object, prefix?: string, expiration?: number): Promise<any>;
    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @return {Promise}
     * @public
     */
    getValue(key: string): Promise<any>;
    /**
     * Used to get multiple string values.
     *
     * @method
     * @param {string[]} keys
     * @param {string} [prefix]
     * @return {Promise}
     * @public
     */
    getValues(keys: string[], prefix?: string): Promise<any>;
    /**
     * Used to delete a value / item.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @public
     */
    deleteValue(key: string): Promise<boolean>;
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
    expireValue(key: string, seconds: number, name?: string): Promise<number>;
    /**
     * Used to add the specified values to a list.
     *
     * @method
     * @param {string} listName
     * @param {Object[]} values
     * @returns {Promise<number>}
     * @public
     */
    listPushValue(listName: string, values: Object[]): Promise<number>;
    /**
     * Used to add the specified value to a set.
     *
     * @method
     * @param {string} key
     * @param {string|Object} value
     * @returns {Promise}
     * @public
     */
    addToSet(key: string, value: string | Object): Promise<any>;
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
    addToSetMulti(keys: string[], values: string[]): Promise<any>;
    /**
     * Used to check if the provided value is a member of the specified set.
     *
     * @method
     * @param {string} setName
     * @param {string} value
     * @returns {Promise<boolean>}
     * @public
     */
    isSetMember(setName: string, value: string): Promise<boolean>;
    /**
     * Used to get all elements of a set.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Object[]>}
     * @public
     */
    membersOfSet(key: string): Promise<Object[]>;
    /**
     * Used to get a union of all elements in the list of sets.
     *
     * @method
     * @param {string[]} keys
     * @returns {Promise<Object[]>}
     * @public
     */
    unionOfSets(keys: string[]): Promise<Object[]>;
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
    hashSetField(key: string, name: string, value: any): Promise<any>;
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
    hashSetFields(key: string, fields: {
        name: string;
        value: any;
    }[]): Promise<any>;
    /**
     * Used to get a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise}
     * @public
     */
    hashGetField(key: string, field: string): Promise<any>;
    /**
     * Used to remove a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise<boolean>} Will return 'true' if the field was removed, 'false' otherwise.
     * @public
     */
    hashDeleteField(key: string, field: string): Promise<boolean>;
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
    setJSON(key: string, value: Object, path?: string | string[], overrideMode?: number): Promise<any>;
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
    getJSON(key: string, path?: string | string[]): Promise<Object>;
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
    editJSON(key: string, value: Object, path?: string | string[]): Promise<any>;
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
    arrayAppendJSON(key: string, value: Object, path?: string | string[]): Promise<any>;
}
