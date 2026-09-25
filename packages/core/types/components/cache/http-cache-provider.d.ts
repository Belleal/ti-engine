/// <reference types="node" />
export = HttpCacheProvider;
import CacheProvider = require("#cache-provider");
import type ConnectionObserver from "#connection-observer";
import type { TiHttpCacheSettings } from "#definitions";
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
declare class HttpCacheProvider extends CacheProvider {
    #private;
    /**
     * @constructor
     * @param {string} connectionIdentifier The identifier under which this backend's connection is observed.
     * @param {TiHttpCacheSettings} [settings] Overrides for the configured `memoryCache.state*` settings. The
     * configured cache takes none; a store opened with {@link createCacheStore} names its own service this way, so an
     * application's records need not live wherever the framework's sessions do.
     */
    constructor(connectionIdentifier: string, settings?: TiHttpCacheSettings);
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
    static toPathSegments(path: string | string[]): string[];
    /**
     * Exposes {@link validateDelay} so the refusal can be tested without a differently configured process.
     *
     * @method
     * @param {*} value
     * @param {string} settingName
     * @returns {number}
     * @public
     */
    static validateDelay(value: any, settingName: string): number;
    /**
     * Exposes {@link normalizeBaseUrl}, for the same reason.
     *
     * @method
     * @param {*} value
     * @returns {string}
     * @public
     */
    static normalizeBaseUrl(value: any): string;
    /**
     * Exposes {@link verifyCredentialTransport}, whose rule is worth pinning in full.
     *
     * @method
     * @param {string} baseUrl
     * @param {boolean} allowInsecure
     * @public
     */
    static verifyCredentialTransport(baseUrl: string, allowInsecure: boolean): void;
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
    get capabilities(): string[];
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
    initialize(): Promise<any>;
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
    shutDown(): Promise<any>;
    /**
     * Registers an observer for this backend's connection events.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver
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
     * @override
     * @public
     */
    matchKeys(pattern: string): Promise<any[]>;
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
    setValue(key: string, value: string, expiration?: number): Promise<string>;
    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @returns {Promise}
     * @override
     * @public
     */
    getValue(key: string): Promise<any>;
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
    deleteValue(key: string): Promise<boolean>;
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
    expireValue(key: string, seconds: number, name?: string): Promise<number>;
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
    hashSetField(key: string, name: string, value: string | Object): Promise<any>;
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
    hashGetField(key: string, field: string): Promise<any>;
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
     * @override
     * @public
     */
    setJSON(key: string, value: Object, path?: string | string[], overrideMode?: number): Promise<any>;
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
    getJSON(key: string, path?: string | string[]): Promise<Object>;
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
    getJSONValue(key: string, path?: string | string[]): Promise<any>;
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
    editJSON(key: string, value: Object, path?: string | string[]): Promise<any>;
}
