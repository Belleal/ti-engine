export = RedisCacheProvider;
import CacheProvider = require("#cache-provider");
import type ConnectionObserver from "#connection-observer";
/**
 * A {@link CacheProvider} backed by Redis, optionally with the RedisJSON module.
 * <br/>
 * NOTE: This holds every Redis-specific detail in the engine's cache path — the command names, the
 * '[ error, value ]' result shape, and the JSONPath encoding. Nothing above it should know that Redis is what is
 * storing the values.
 *
 * @class RedisCacheProvider
 * @extends CacheProvider
 * @public
 */
declare class RedisCacheProvider extends CacheProvider {
    #private;
    /**
     * @constructor
     * @param {string} connectionIdentifier The identifier under which this backend's connection is observed.
     */
    constructor(connectionIdentifier: string);
    /**
     * Decodes one entry of a `multi(...).exec()` result into the value it carries.
     * <br/>
     * NOTE: Exposed for testing. The provider builds its own Redis client in its constructor, so `getValues` cannot be
     * driven without a live server — this is one of the pure halves of it, and it is where the defect was.
     *
     * @method
     * @param {Array} [result] One `[ error, value ]` entry.
     * @returns {*} The parsed value, or `undefined` when there is none.
     * @public
     */
    static decodeCommandValue(result?: any[]): any;
    /**
     * Maps a set of requested keys onto the values a `multi(...).exec()` returned for them, using `null` for a miss.
     * <br/>
     * NOTE: Exposed for testing, for the same reason as {@link RedisCacheProvider.decodeCommandValue}.
     *
     * @method
     * @param {string[]} keys The keys that were requested, in command order.
     * @param {Array} [rawResults] The `multi(...).exec()` result.
     * @returns {Object} A null-prototype map of key to value, `null` where the key was absent.
     * @public
     */
    static mapCommandValues(keys: string[], rawResults?: any[]): Object;
    /**
     * Property returning the connection identifier of this backend.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier(): string;
    /**
     * Property returning the optional behaviors this backend provides.
     * <br/>
     * NOTE: The JSON capabilities depend on the RedisJSON module being installed on the server, which is only known
     * after the client has connected — so this is accurate from {@link RedisCacheProvider#initialize} onward and
     * reports no JSON support before that.
     *
     * @property
     * @returns {string[]}
     * @override
     * @public
     */
    get capabilities(): string[];
    /**
     * Used to initialize the backend and connect to the Redis server.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    initialize(): Promise<any>;
    /**
     * Used to gracefully shut the Redis connection down.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    shutDown(): Promise<any>;
    /**
     * Used to register a new {@link ConnectionObserver} for events related to the underlying Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @override
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
     * Used to fetch the value at a path of a JSON variable — the value, not RedisJSON's list of matches.
     * <br/>
     * NOTE: A JSONPath read answers every match: `[ value ]` where the path exists, `[]` where it does not, and `null`
     * when the key does not. This reduces that to the value (the first match for a wildcard), so a caller never
     * unwraps `result[ 0 ]` itself — which is right here and wrong for any stored array over HTTP (CA-178).
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<*>} The addressed value, or `null`.
     * @public
     */
    getJSONValue(key: string, path?: string | string[]): Promise<any>;
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
