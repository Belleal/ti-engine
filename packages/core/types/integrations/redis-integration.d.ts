export { cacheCommandsEnum as cacheCommands };
export { clientStatusEnum as clientStatus };
export { cacheOverrideModeEnum as cacheOverrideMode };
export declare var createRedisClient: (identifier: string) => RedisClient;
import ConnectionObserver = require("#connection-observer");
export type TiRedisCommand = string;
/**
 * Enum for listing all used Redis cache commands.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiRedisCommand
 */
declare let cacheCommandsEnum: import("../components/definitions.types").TiEnumOf<{
    ADD_TO_SET: string[];
    DELETE_VALUE: string[];
    EXPIRE: string[];
    GET_ALL_FROM_SET: string[];
    GET_VALUE: string[];
    HASH_GET: string[];
    HASH_GET_ALL: string[];
    HASH_REMOVE: string[];
    HASH_EXPIRE: string[];
    HASH_SET: string[];
    HASH_SET_MANY: string[];
    IS_SET_MEMBER: string[];
    JSON_ARRAY_APPEND: string[];
    JSON_GET: string[];
    JSON_MERGE: string[];
    JSON_MGET: string[];
    JSON_SET: string[];
    KEYS: string[];
    LIST_PUSH: string[];
    LIST_POP_TAIL_BLOCKING: string[];
    LIST_POP_TAIL_PUSH_HEAD_BLOCKING: string[];
    LIST_REMOVE: string[];
    SET_VALUE: string[];
    UNION_OF_SETS: string[];
}>;
export type TiRedisClientStatus = number;
/**
 * Enum for listing all client statuses.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiRedisClientStatus
 */
declare let clientStatusEnum: import("../components/definitions.types").TiEnumOf<{
    UNINITIALIZED: (string | number)[];
    CONNECTED: (string | number)[];
    CONNECTING: (string | number)[];
    DISRUPTED: (string | number)[];
    SHUTTING_DOWN: (string | number)[];
    DISCONNECTED: (string | number)[];
}>;
export type TiRedisOverrideMode = string;
/**
 * Enum for listing the Redis key override modes.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiRedisOverrideMode
 */
declare let cacheOverrideModeEnum: import("../components/definitions.types").TiEnumOf<{
    DEFAULT: string[];
    NX: string[];
    XX: string[];
}>;
/**
 * Used to create a Redis Cache client.
 * <br/>
 * NOTE: This client is set to automatically resend all pending commands on connection recovery with no limit on the retry attempts.
 * This is done to avoid losing any pending commands in case of a connection failure. For a different behavior, use custom implementation.
 *
 * @class RedisClient
 * @public
 */
declare class RedisClient {
    #private;
    /**
     * @constructor
     * @param {string} identifier
     * @returns {RedisClient}
     */
    constructor(identifier: string);
    /**
     * Used to return the Redis client identifier assigned internally.
     *
     * @property
     * @returns {string}
     * @public
     */
    get identifier(): string;
    /**
     * Used to return the client ID assigned by the Redis server.
     *
     * @property
     * @returns {number}
     * @public
     */
    get clientID(): number;
    /**
     * Used to return the Redis client status.
     *
     * @property
     * @returns {number}
     * @public
     */
    get clientStatus(): number;
    /**
     * Used to return the Redis server version.
     *
     * @property
     * @returns {number}
     * @public
     */
    get serverVersion(): number;
    /**
     * Verify if Redis server supports JSON data types.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isJSONSupported(): boolean;
    /**
     * Used to initialize the Redis client.
     *
     * @method
     * @param {string} host
     * @param {number} port
     * @param {string} authKey
     * @param {string} user
     * @param {number} defaultDB
     * @param {number} [retryMaxIntervalMs=1000] Optional max backoff interval.
     * @param {number|undefined} [retryMaxAttempts=undefined] Optional max (re)connection attempts before abort.
     * @public
     */
    initialize(host: string, port: number, authKey: string, user: string, defaultDB: number, retryMaxIntervalMs?: number, retryMaxAttempts?: number | undefined): Promise<any>;
    /**
     * Used to register a new {@link ConnectionObserver} for events related to the Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver(connectionObserver: ConnectionObserver): void;
    /**
     * Used to execute multiple commands within a Redis transaction.
     *
     * @method
     * @param {Array[]} commands
     * @returns {Promise<*>}
     * @public
     */
    executeCommands(commands: any[][]): Promise<any>;
    /**
     * Used to send a new blocking command to Redis.
     * <br/>
     * WARNING: This will reserve the client connection until a result is received.
     *
     * @method
     * @param {string} command
     * @param {Array} commandArguments
     * @returns {Promise<*>}
     * @public
     */
    blockingCommand(command: string, commandArguments: any[]): Promise<any>;
    /**
     * Used to publish a message to the specified channel.
     *
     * @method
     * @param {string} channel
     * @param {(Object|string)} message
     * @returns {Promise<number>}
     * @public
     */
    publishCommand(channel: string, message: (Object | string)): Promise<number>;
    /**
     * Used to subscribe to the specified channel for messages.
     * <br/>
     * NOTE: Call unsubscribeCommand(channel) to detach later.
     *
     * @method
     * @param {string} channel Unique identifier of the channel to subscribe to.
     * @param {(message: Object) => void} messageHandler Will execute this handler every time a new message is received.
     * @returns {Promise}
     * @public
     */
    subscribeCommand(channel: string, messageHandler: (message: Object) => void): Promise<any>;
    /**
     * Used to unsubscribe from a channel and remove its message handler.
     *
     * @method
     * @param {string} channel Unique identifier of the channel to unsubscribe from.
     * @returns {Promise}
     * @public
     */
    unsubscribeCommand(channel: string): Promise<any>;
    /**
     * Used to execute any Redis command in an unmanaged way.
     * <br/>
     * WARNING: Use this only if there is no other implemented function in this module and the command
     * you want to execute is not supported by the 'multi' Redis command (implemented in {@link RedisClient.executeCommands}).
     * Make sure to handle the result as it will be returned raw.
     *
     * @method
     * @param {string[]} commandArguments
     * @returns {Promise<Object>}
     * @public
     */
    callCommand(commandArguments: string[]): Promise<Object>;
    /**
     * Used to gracefully close the Redis connection.
     * Attempts to quit(), then falls back to disconnect() on timeout.
     *
     * @method
     * @param {number} [timeoutMs=1000]
     * @returns {Promise}
     * @public
     */
    shutDown(timeoutMs?: number): Promise<any>;
}
