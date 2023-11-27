/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ConnectionObserver = require( "#connection-observer" );
const Redis = require( "ioredis" );
const tools = require( "#tools" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const _ = require( "lodash" );

/**
 * Enum for listing all used Redis cache commands.
 *
 * @readonly
 * @enum {string}
 */
let cacheCommandsEnum = tools.enum( {
    ADD_TO_SET: [ "sadd", "add to set", "https://redis.io/commands/sadd" ],
    DELETE_VALUE: [ "del", "delete value", "https://redis.io/commands/del" ],
    EXPIRE: [ "expire", "expire", "https://redis.io/commands/expire" ],
    GET_ALL_FROM_SET: [ "smembers", "get all set members", "https://redis.io/commands/smembers" ],
    GET_VALUE: [ "get", "get value", "https://redis.io/commands/get" ],
    HASH_GET: [ "hget", "hash get", "https://redis.io/commands/hget" ],
    HASH_GET_ALL: [ "hgetall", "hash get all", "https://redis.io/commands/hgetall" ],
    HASH_REMOVE: [ "hdel", "hash remove", "https://redis.io/commands/hdel" ],
    HASH_SET: [ "hset", "", "https://redis.io/commands/hset" ],
    HASH_SET_MANY: [ "hmset", "", "https://redis.io/commands/hmset" ],
    IS_SET_MEMBER: [ "sismember", "", "https://redis.io/commands/sismember" ],
    JSON_ARRAY_APPEND: [ "json.arrappend", "", "https://redis.io/commands/json.arrappend" ],
    JSON_GET: [ "json.get", "", "https://redis.io/commands/json.get" ],
    JSON_SET: [ "json.set", "", "https://redis.io/commands/json.set" ],
    KEYS: [ "keys", "", "https://redis.io/commands/keys" ],
    LIST_PUSH: [ "lpush", "list push", "https://redis.io/commands/lpush" ],
    LIST_POP_TAIL_BLOCKING: [ "brpop", "list pop tail blocking", "https://redis.io/commands/brpop" ],
    LIST_POP_TAIL_PUSH_HEAD_BLOCKING: [ "brpoplpush", "list pop tail push head blocking", "https://redis.io/commands/brpoplpush" ],
    LIST_REMOVE: [ "lrem", "list remove", "https://redis.io/commands/lrem" ],
    SET_VALUE: [ "set", "set value", "https://redis.io/commands/set" ],
    UNION_OF_SETS: [ "sunion", "union of sets", "https://redis.io/commands/sunion" ]
} );

/**
 * Enum for listing the Redis key override modes.
 *
 * @readonly
 * @enum {string}
 */
let cacheOverrideModeEnum = tools.enum( {
    DEFAULT: [ "", "default", "Standard Redis behaviour when setting new key." ],
    NX: [ "nx", "nx", "Sets the key only if it does not already exist." ],
    XX: [ "xx", "xx", "Sets the key only if it already exists." ]
} );

/**
 * @typedef {string} TiRedisCommand
 */
module.exports.cacheCommands = cacheCommandsEnum;
/**
 * @typedef {string} TiRedisOverrideMode
 */
module.exports.cacheOverrideMode = cacheOverrideModeEnum;

/**
 * Used to create a Redis Cache client.
 *
 * @class RedisClient
 * @public
 */
class RedisClient {

    #clientIdentifier;
    #retryMaxInterval = 1000;
    #retryMaxAttempts = undefined;
    #redisClient = undefined;
    #serverInfo = {};
    #serverFeatures = {};
    #connectionObservers = [];

    /**
     * @constructor
     * @param {string} identifier
     * @param {string} host
     * @param {number} port
     * @param {string} authKey
     * @param {string} user
     * @param {number} defaultDB
     * @param {boolean} autoRetryUnfulfilled
     * @param {number} maxRetries
     */
    constructor( identifier, host, port, authKey, user, defaultDB, autoRetryUnfulfilled, maxRetries ) {
        this.#clientIdentifier = identifier || "redis-client-" + tools.getUUID();

        let retryStrategy = ( attempt ) => {
            let result = Math.min( attempt * 50, this.#retryMaxInterval );

            if ( this.#retryMaxAttempts != null && attempt > this.#retryMaxAttempts ) {
                logger.log( "In Redis retry strategy: reached max attempts for command retry. Aborting...", logger.logSeverity.WARNING, { attempts: attempt } );
                result = exceptions.raise( exceptions.exceptionCode.E_COM_RETRY_ATTEMPTS_EXCEEDED );
            }

            return result;
        };

        let reconnectOnError = ( error ) => {
            logger.log( `In Redis reconnect on error strategy: ${ error.message }`, logger.logSeverity.ERROR, error );
            return !!error.message.includes( "READONLY" );
        };

        let options = {
            port: port,
            host: host,
            username: user,
            password: authKey,
            db: defaultDB,
            autoResendUnfulfilledCommands: autoRetryUnfulfilled,
            maxRetriesPerRequest: maxRetries,
            retryStrategy: retryStrategy,
            reconnectOnError: reconnectOnError
        };

        /** @type Redis */
        this.#redisClient = new Redis( options );

        this.#redisClient.on( "ready", () => {
            logger.log( `Connection to Redis server ${ host }:${ port } (re)established by client '${ this.identifier }' and is ready to be used.`, logger.logSeverity.INFO );

            // notify all connection observers about this event:
            _.forEach( this.#connectionObservers, ( connectionObservers ) => {
                connectionObservers.onConnectionRecovered( this.#clientIdentifier );
            } );

            // fetch the server information and store it:
            this.#redisClient.info().then( ( result ) => {
                this.#serverInfo = {};
                if ( _.isString( result ) ) {
                    let rawData = _.split( result, "\r\n" );
                    _.forEach( rawData, ( entry ) => {
                        let details = _.split( entry, ":" );
                        if ( !_.startsWith( details[ 0 ], "#" ) && details[ 0 ] !== "" && details[ 0 ] ) {
                            if ( _.isNaN( _.toNumber( details[ 1 ] ) ) ) {
                                this.#serverInfo[ details[ 0 ] ] = details[ 1 ];
                            } else {
                                this.#serverInfo[ details[ 0 ] ] = _.toNumber( details[ 1 ] );
                            }
                        }
                    } );
                }
                return this.#redisClient.module( "LIST" );
            } ).then( ( result ) => {
                this.#serverFeatures = {};
                if ( _.isArray( result ) ) {
                    _.forEach( result, ( entry ) => {
                        this.#serverFeatures[ entry[ 1 ] ] = entry[ 3 ];
                    } );
                }
            } ).catch( ( error ) => {
                logger.log( `Failed to fetch server information by client '${ this.identifier }'!`, logger.logSeverity.WARNING, error );
            } );
        } );
        this.#redisClient.on( "error", ( error ) => {
            logger.log( `Error received in Redis client '${ this.identifier }'.`, logger.logSeverity.ERROR, error );

            // notify all connection observers about this event:
            _.forEach( this.#connectionObservers, ( connectionObservers ) => {
                connectionObservers.onConnectionDisrupted( this.#clientIdentifier );
            } );
        } );
        this.#redisClient.on( "reconnecting", ( info ) => {
            if ( info.attempt > 1 ) {
                logger.log( `Client '${ this.identifier }' reconnecting to Redis server after ${ info.delay } ms. This is attempt ${ info.attempt }.`, logger.logSeverity.DEBUG );
            }
        } );
    }

    /* Public interface */

    /**
     * Used to return the Redis client identifier.
     *
     * @property
     * @return {string}
     * @public
     */
    get identifier() {
        return this.#clientIdentifier;
    }

    /**
     * Used to return the Redis server version.
     *
     * @property
     * @return {number}
     * @public
     */
    get serverVersion() {
        return this.#serverInfo[ "redis_version" ];
    }

    /**
     * Verify if Redis server supports JSON data types.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isJSONSupported() {
        return !_.isNil( this.#serverFeatures[ "ReJSON" ] );
    }

    /**
     * Used to register a new {@link ConnectionObserver} for events related to the Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        if ( connectionObserver instanceof ConnectionObserver ) {
            this.#connectionObservers.push( connectionObserver );
        } else {
            logger.log( `Attempting to add '${ connectionObserver.constructor.name }' as connection observer but it's not a child-class of 'ConnectionObserver'!`, logger.logSeverity.WARNING );
        }
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
     * <br/>
     * WARNING: This will reserve the client connection until a result is received.
     *
     * @method
     * @param {string} command
     * @param {Array} commandArguments
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
    callCommand( commandArguments ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient[ "call" ].apply( this.#redisClient, commandArguments ).then( ( result ) => {
                resolve( result );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

/**
 * Create and return a new Redis client.
 *
 * @method
 * @param {string} identifier
 * @param {string} host
 * @param {number} [port=6379]
 * @param {string} [authKey=undefined]
 * @param {string} [user="default"]
 * @param {number} [defaultDB=0]
 * @param {boolean} [autoRetryUnfulfilled=true]
 * @param {number} [maxRetries=20]
 * @return {RedisClient}
 * @public
 */
module.exports.createRedisClient = ( identifier, host, port = 6379, authKey = undefined, user = "default", defaultDB = 0, autoRetryUnfulfilled = true, maxRetries = 20 ) => {
    return Object.freeze( new RedisClient( identifier, host, port, authKey, user, defaultDB, autoRetryUnfulfilled, maxRetries ) );
};
