/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ioredis = require( "ioredis" );
const tools = require( "#tools" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );

/**
 * Enum for listing all used Redis cache commands.
 *
 * @readonly
 * @extends TiEnum
 * @enum {number}
 */
let cacheCommandsEnum = tools.enum( {
    ADD_TO_SET: [ "sadd", "add to set", "https://redis.io/commands/sadd" ],
    DELETE_VALUE: [ "del", "delete value", "https://redis.io/commands/del" ],
    GET_ALL_FROM_SET: [ "smembers", "get all set members", "https://redis.io/commands/smembers" ],
    GET_VALUE: [ "get", "get value", "https://redis.io/commands/get" ],
    HASH_GET: [ "hget", "hash get", "https://redis.io/commands/hget" ],
    HASH_GET_ALL: [ "hgetall", "hash get all", "https://redis.io/commands/hgetall" ],
    HASH_SET: [ "hset", "", "https://redis.io/commands/hset" ],
    HASH_SET_MANY: [ "hmset", "", "https://redis.io/commands/hmset" ],
    KEYS: [ "keys", "", "https://redis.io/commands/keys" ],
    LIST_PUSH: [ "lpush", "list push", "https://redis.io/commands/lpush" ],
    LIST_POP_TAIL_BLOCKING: [ "brpop", "list pop tail blocking", "https://redis.io/commands/brpop" ],
    LIST_POP_TAIL_PUSH_HEAD_BLOCKING: [ "brpoplpush", "list pop tail push head blocking", "https://redis.io/commands/brpoplpush" ],
    LIST_REMOVE: [ "lrem", "list remove", "https://redis.io/commands/lrem" ],
    SET_VALUE: [ "set", "set value", "https://redis.io/commands/set" ],
    UNION_OF_SETS: [ "sunion", "union of sets", "https://redis.io/commands/sunion" ]
} );

/**
 * @typedef {TiEnum} MemoryCacheCommand
 */
module.exports.cacheCommands = cacheCommandsEnum;

/**
 * Used to create a Redis Cache client.
 *
 * @class RedisClient
 * @public
 */
class RedisClient {

    #clientIdentifier = "default";
    #retryInterval = 1000;
    #retryMaxAttempts = undefined;
    #redisClient = undefined;

    /**
     * @constructor
     * @param {string} identifier
     * @param {string} host
     * @param {number} port
     * @param {string} authKey
     * @param {number} defaultDB
     * @param {boolean} autoRetryUnfulfilled
     * @param {number} maxRetries
     */
    constructor( identifier, host, port, authKey, defaultDB, autoRetryUnfulfilled, maxRetries ) {
        this.#clientIdentifier = identifier || this.#clientIdentifier;

        let options = {
            port: port,
            host: host,
            password: authKey,
            db: defaultDB,
            autoResendUnfulfilledCommands: autoRetryUnfulfilled,
            maxRetriesPerRequest: maxRetries,
            retryStrategy: this.#retryStrategy
        };

        /** @type Redis */
        this.#redisClient = new ioredis( options );

        this.#redisClient.on( "ready", () => {
            logger.log( `Connection to Redis server ${ host }:${ port } (re)established by client '${ this.identifier }' and is ready to be used.`, logger.logSeverity.INFO, {
                redis_version: this.#redisClient.serverInfo.redis_version,
                redis_mode: this.#redisClient.serverInfo.redis_mode,
                os: this.#redisClient.serverInfo.os,
                uptime_in_days: this.#redisClient.serverInfo.uptime_in_days,
                connected_clients: this.#redisClient.serverInfo.connected_clients,
                role: this.#redisClient.serverInfo.role,
                connected_slaves: this.#redisClient.serverInfo.connected_slaves
            } );
        } );
        this.#redisClient.on( "error", ( error ) => {
            logger.log( `Error received in Redis client '${ this.identifier }'.`, logger.logSeverity.ERROR, error );
        } );
        this.#redisClient.on( "reconnecting", ( info ) => {
            if ( info.attempt > 1 ) {
                logger.log( `Client '${ this.identifier }' reconnecting to Redis server after ${ info.delay } ms. This is attempt ${ info.attempt }.`, logger.logSeverity.DEBUG );
            }
        } );
    }

    /* Public interface */

    /**
     * @method
     * @return {string}
     * @public
     */
    get identifier() {
        return this.#clientIdentifier;
    }

    /**
     * Used to execute multiple commands within a Redis transaction.
     *
     * @method
     * @param {Array[]} commands
     * @return {Promise<*>}
     * @public
     */
    executeCommands( commands ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient.multi( commands ).exec().then( ( results ) => {
                resolve( results );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to send a new blocking command to Redis.
     * WARNING: This will reserve the client connection until a result is received.
     *
     * @method
     * @param {string} command
     * @param {string[]} commandArguments
     * @return {Promise<*>}
     * @public
     */
    blockingCommand( command, commandArguments ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient[ command ].apply( this.#redisClient, commandArguments ).then( ( results ) => {
                resolve( results );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to publish a message to the specified channel.
     *
     * @method
     * @param {string} channel
     * @param {(Object|string)} message
     * @return {Promise<number>}
     * @public
     */
    publishCommand( channel, message ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient.publish( channel, tools.stringifyJSON( message ) ).then( ( receivedBy ) => {
                resolve( receivedBy );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to subscribe to the specified channel for messages.
     *
     * @method
     * @param {string} channel
     * @param {function( Object )} messageHandler Will execute this handler every time a new message is received.
     * @return {Promise}
     * @public
     */
    subscribeCommand( channel, messageHandler ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient.on( "subscribe", ( channel, count ) => {
                logger.log( "Subscription to message channel '" + channel + "' successful.", logger.logSeverity.DEBUG );
                resolve();
            } );
            this.#redisClient.on( "message", ( channel, message ) => {
                if ( typeof ( messageHandler ) === "function" ) {
                    messageHandler( tools.parseJSON( message ) );
                }
            } );
            this.#redisClient.subscribe( channel ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /* Private interface */

    /**
     * Used to define the retry strategy of Redis commands to the server.
     *
     * @method
     * @param {number} attempts
     * @returns {number|Exception}
     * @private
     */
    #retryStrategy( attempts ) {
        let result = Math.min( attempts * 50, this.#retryInterval );

        if ( this.#retryMaxAttempts != null && attempts > this.#retryMaxAttempts ) {
            logger.log( "In Redis retry strategy: reached max attempts for command retry.", logger.logSeverity.WARNING, { attempts: attempts } );
            result = exceptions.raise( exceptions.exceptionCode.E_COM_RETRY_ATTEMPTS_EXCEEDED );
        }

        return result;
    }
}

/**
 * Create and return new Redis client.
 *
 * @method
 * @param {string} identifier
 * @param {string} host
 * @param {number} [port=6379]
 * @param {string} [authKey=undefined]
 * @param {number} [defaultDB=0]
 * @param {boolean} [autoRetryUnfulfilled=true]
 * @param {number} [maxRetries=20]
 * @return {RedisClient}
 * @public
 */
module.exports.createRedisClient = ( identifier, host, port = 6379, authKey = undefined, defaultDB = 0, autoRetryUnfulfilled = true, maxRetries = 20 ) => {
    return new RedisClient( identifier, host, port, authKey, defaultDB, autoRetryUnfulfilled, maxRetries );
};
