export = CacheProvider;
import type ConnectionObserver from "#connection-observer";
/** @import ConnectionObserver from "#connection-observer" */
/**
 * An abstract class that defines the storage behavior required by the {@link CommonMemoryCache}.
 * <br/>
 * NOTE: This sets the contract between the cache and whatever actually holds the values. It has to be inherited and
 * implemented with the specifics of a given backend. For a working example please see the {@link RedisCacheProvider} class.
 * <br/>
 * NOTE: Implementations must NOT check whether the cache is operational. {@link CommonMemoryCache} performs that check
 * once, before it delegates, so every backend inherits the same guard instead of restating it in each of its methods.
 *
 * @class CacheProvider
 * @abstract
 * @public
 */
declare class CacheProvider {
    /**
     * @constructor
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor();
    /**
     * Property returning the optional behaviors this backend provides.
     * <br/>
     * NOTE: Some capabilities can only be established once a connection exists — RedisJSON, for example, is a server-side
     * module that has to be probed. Read this after {@link CacheProvider#initialize} has resolved, never before.
     *
     * @property
     * @returns {string[]} Values drawn from {@link TiCacheCapability}.
     * @abstract
     * @public
     */
    get capabilities(): string[];
    /**
     * Used to verify whether this backend provides a given capability.
     *
     * @method
     * @param {string} capability A value from {@link TiCacheCapability}.
     * @returns {boolean}
     * @public
     */
    hasCapability(capability: string): boolean;
    /**
     * Used to initialize the backend and establish whatever connection it requires.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    initialize(): Promise<any>;
    /**
     * Used to gracefully shut the backend down.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    shutDown(): Promise<any>;
    /**
     * Used to register a new {@link ConnectionObserver} for events related to the backend connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @abstract
     * @public
     */
    addConnectionObserver(connectionObserver: ConnectionObserver): void;
    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.KEY_PATTERN_MATCH}
     * @abstract
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
     * @returns {Promise<string>}
     * @abstract
     * @public
     */
    setValue(key: string, value: string, expiration?: number): Promise<string>;
    /**
     * Used to set multiple string values.
     *
     * @method
     * @param {Object} keyValues
     * @param {string} [prefix]
     * @param {number} [expiration] Expiration value is in seconds.
     * @returns {Promise}
     * @abstract
     * @public
     */
    setValues(keyValues: Object, prefix?: string, expiration?: number): Promise<any>;
    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @returns {Promise}
     * @abstract
     * @public
     */
    getValue(key: string): Promise<any>;
    /**
     * Used to get multiple string values.
     *
     * @method
     * @param {string[]} keys
     * @param {string} [prefix]
     * @returns {Promise}
     * @abstract
     * @public
     */
    getValues(keys: string[], prefix?: string): Promise<any>;
    /**
     * Used to delete a value / item.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @abstract
     * @public
     */
    deleteValue(key: string): Promise<boolean>;
    /**
     * Used to set expiration in seconds to an existing key.
     *
     * @method
     * @param {string} key
     * @param {number} seconds
     * @param {string} [name] If a field in a hash set is to be expired instead, the name of that set.
     * @returns {Promise<number>}
     * @requires {TiCacheCapability.KEY_EXPIRY}
     * @abstract
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
     * @requires {TiCacheCapability.LISTS}
     * @abstract
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
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    addToSet(key: string, value: string | Object): Promise<any>;
    /**
     * Used to add multiple values to multiple sets in one transactional request.
     *
     * @method
     * @param {string[]} keys
     * @param {string[]} values
     * @returns {Promise}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    addToSetMulti(keys: string[], values: string[]): Promise<any>;
    /**
     * Used to verify whether a value is a member of a set.
     *
     * @method
     * @param {string} setName
     * @param {string|Object} value
     * @returns {Promise<boolean>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    isSetMember(setName: string, value: string | Object): Promise<boolean>;
    /**
     * Used to fetch all members of a set.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    membersOfSet(key: string): Promise<any[]>;
    /**
     * Used to fetch the union of the provided sets.
     *
     * @method
     * @param {string[]} keys
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    unionOfSets(keys: string[]): Promise<any[]>;
    /**
     * Used to set a single field in a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} name
     * @param {string|Object} value
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashSetField(key: string, name: string, value: string | Object): Promise<any>;
    /**
     * Used to set multiple fields in a hash set.
     *
     * @method
     * @param {string} key
     * @param {Object} fields
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashSetFields(key: string, fields: Object): Promise<any>;
    /**
     * Used to fetch a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashGetField(key: string, field: string): Promise<any>;
    /**
     * Used to delete a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashDeleteField(key: string, field: string): Promise<any>;
    /**
     * Used to store a JSON document, or a branch of one.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @param {number} [overrideMode=0] 0 allows full override; 1 sets only if absent; 2 sets only if present.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    setJSON(key: string, value: Object, path?: string | string[], overrideMode?: number): Promise<any>;
    /**
     * Used to fetch a JSON document, or a branch of one.
     * <br/>
     * NOTE: The two built-in backends answer this in different shapes, and a caller must not paper over it by
     * unwrapping `result[ 0 ]`: Redis answers RedisJSON's **list of matches** (`[ value ]`, `[]` for a missing path),
     * HTTP answers **the value itself**. The unwrap is right for Redis and truncates any stored array over HTTP — a
     * competency baseline read back as its first code (CA-178). Use {@link CacheProvider#getJSONValue} for one shape.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<Object>}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    getJSON(key: string, path?: string | string[]): Promise<Object>;
    /**
     * Used to fetch the value at a path of a JSON document — the value itself, whatever the backend.
     * <br/>
     * The one shape both backends agree on: the addressed value, or `null` when the key or the path is absent.
     * <br/>
     * A wildcard is where they differ, because it is RedisJSON's feature and not the state protocol's. On Redis, a `*`
     * anywhere in the path answers its first match — what every caller that took `result[ 0 ]` had. Over HTTP a
     * segment is a literal key (`design/state-protocol.md`), so `*` names a key spelled `*`; the one exception is the
     * D1 service's partitioned documents, which answer the first match for a `*` at an entity position and refuse one
     * anywhere else with a 400. A caller that reads by wildcard is therefore portable only across those positions.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<*>} The addressed value, or `null`.
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    getJSONValue(key: string, path?: string | string[]): Promise<any>;
    /**
     * Used to merge a value into an existing JSON document at the given path.
     * <br/>
     * NOTE: Callers rely on this being applied atomically by the backend when {@link TiCacheCapability.ATOMIC_JSON_EDIT}
     * is declared — two concurrent edits to different paths of the same document must both survive. A backend that can
     * only read-modify-write must NOT declare that capability, because the loss is silent: nothing throws, and one of
     * the two writes is simply gone.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    editJSON(key: string, value: Object, path?: string | string[]): Promise<any>;
    /**
     * Used to append a value to an array inside a JSON document.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    arrayAppendJSON(key: string, value: Object, path?: string | string[]): Promise<any>;
}
