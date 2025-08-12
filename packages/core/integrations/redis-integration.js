/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
    ADD_TO_SET: [ "sadd", "add to set", "https://redis.io/docs/latest/commands/sadd/" ],
    DELETE_VALUE: [ "del", "delete value", "https://redis.io/docs/latest/commands/del/" ],
    EXPIRE: [ "expire", "expire", "https://redis.io/docs/latest/commands/expire/" ],
    GET_ALL_FROM_SET: [ "smembers", "get all set members", "https://redis.io/docs/latest/commands/smembers/" ],
    GET_VALUE: [ "get", "get value", "https://redis.io/docs/latest/commands/get/" ],
    HASH_GET: [ "hget", "hash get", "https://redis.io/docs/latest/commands/hget/" ],
    HASH_GET_ALL: [ "hgetall", "hash get all", "https://redis.io/docs/latest/commands/hgetall/" ],
    HASH_REMOVE: [ "hdel", "hash remove", "https://redis.io/docs/latest/commands/hdel/" ],
    HASH_SET: [ "hset", "", "https://redis.io/docs/latest/commands/hset/" ],
    HASH_SET_MANY: [ "hmset", "(deprecated) use HSET with multiple fields", "https://redis.io/docs/latest/commands/hmset/" ],
    IS_SET_MEMBER: [ "sismember", "", "https://redis.io/docs/latest/commands/sismember/" ],
    JSON_ARRAY_APPEND: [ "json.arrappend", "", "https://redis.io/docs/latest/commands/json.arrappend/" ],
    JSON_GET: [ "json.get", "", "https://redis.io/docs/latest/commands/json.get/" ],
    JSON_SET: [ "json.set", "", "https://redis.io/docs/latest/commands/json.set/" ],
    KEYS: [ "keys", "(warning: O(N), use SCAN where possible)", "https://redis.io/docs/latest/commands/keys/" ],
    LIST_PUSH: [ "lpush", "list push", "https://redis.io/docs/latest/commands/lpush/" ],
    LIST_POP_TAIL_BLOCKING: [ "brpop", "list pop tail blocking", "https://redis.io/docs/latest/commands/brpop/" ],
    LIST_POP_TAIL_PUSH_HEAD_BLOCKING: [ "brpoplpush", "list pop tail push head blocking", "https://redis.io/docs/latest/commands/brpoplpush/" ],
    LIST_REMOVE: [ "lrem", "list remove", "https://redis.io/docs/latest/commands/lrem/" ],
    SET_VALUE: [ "set", "set value", "https://redis.io/docs/latest/commands/set/" ],
    UNION_OF_SETS: [ "sunion", "union of sets", "https://redis.io/docs/latest/commands/sunion/" ]
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
 * <br/>
 * NOTE: This client is set to automatically resend all pending commands on connection recovery with no limit on the retry attempts.
 * This is done to avoid losing any pending commands in case of a connection failure. For a different behavior, use custom implementation.
 *
 * @class RedisClient
 * @public
 */
class RedisClient {

    #clientIdentifier;
    #retryMaxInterval = 1000;
    #retryMaxAttempts = undefined;
    #redisConnection = undefined;
    #redisClientID;
    #serverInfo = {};
    #serverFeatures = {};
    #connectionObservers = [];
    #messageHandlersByChannel = new Map();

    /**
     * @constructor
     * @param {string} identifier
     * @returns {RedisClient}
     */
    constructor( identifier ) {
        this.#clientIdentifier = identifier || "redis-client-" + tools.getUUID();
    }

    /* Public interface */

    /**
     * Used to return the Redis client identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get identifier() {
        return this.#clientIdentifier;
    }

    /**
     * Used to return the Redis client ID.
     *
     * @property
     * @returns {number}
     * @public
     */
    get clientID() {
        return this.#redisClientID;
    }

    /**
     * Used to return the Redis server version.
     *
     * @property
     * @returns {number}
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
        // Detect RedisJSON module variants (e.g., ReJSON, ReJSON2):
        return !_.isNil( this.#serverFeatures[ "ReJSON" ] ) || !_.isNil( this.#serverFeatures[ "ReJSON2" ] );
    }

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
    initialize( host, port, authKey, user, defaultDB, retryMaxIntervalMs = 1000, retryMaxAttempts = undefined ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#redisConnection ) {
                resolve();
            } else {
                this.#setupClient( host, port, authKey, user, defaultDB, retryMaxIntervalMs, retryMaxAttempts ).then( () => {
                    // Fetch the server information and store it:
                    return this.#fetchServerInfo();
                } ).then( () => {
                    return this.#getClientId();
                } ).then( ( clientID ) => {
                    // Store the client ID:
                    this.#redisClientID = clientID;

                    // Notify all connection observers about the initialization success:
                    _.forEach( this.#connectionObservers, ( connectionObservers ) => {
                        connectionObservers.onConnectionRecovered( this.#clientIdentifier );
                    } );

                    resolve();
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            }
        } );
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
     * @returns {Promise<*>}
     * @public
     */
    executeCommands( commands ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisConnection.multi( commands ).exec().then( ( results ) => {
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
     * @returns {Promise<*>}
     * @public
     */
    blockingCommand( command, commandArguments ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisConnection[ command ].apply( this.#redisConnection, commandArguments ).then( ( results ) => {
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
     * @returns {Promise<number>}
     * @public
     */
    publishCommand( channel, message ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisConnection.publish( channel, tools.stringifyJSON( message ) ).then( ( receivedBy ) => {
                resolve( receivedBy );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to subscribe to the specified channel for messages.
     * <br/>
     * NOTE: Call unsubscribeCommand(channel) to detach later.
     *
     * @method
     * @param {string} channel Unique identifier of the channel to subscribe to.
     * @param {function( Object )} messageHandler Will execute this handler every time a new message is received.
     * @returns {Promise}
     * @public
     */
    subscribeCommand( channel, messageHandler ) {
        return new Promise( ( resolve, reject ) => {
            // Avoid attaching multiple listeners to the same channel:
            if ( this.#messageHandlersByChannel.has( channel ) ) {
                logger.log( "Attempting to subscribe to message channel '" + channel + "' while already subscribed to it.", logger.logSeverity.WARNING );
                resolve();
            } else {
                const onMessage = ( subscribedChannel, message ) => {
                    if ( subscribedChannel === channel && typeof messageHandler === "function" ) {
                        messageHandler( tools.parseJSON( message ) );
                    }
                };

                this.#redisConnection.once( "subscribe", ( subscribedChannel ) => {
                    if ( subscribedChannel === channel ) {
                        logger.log( "Subscription to message channel '" + channel + "' successful.", logger.logSeverity.DEBUG );
                        resolve();
                    }
                } );

                this.#redisConnection.on( "message", onMessage );
                this.#messageHandlersByChannel.set( channel, onMessage );

                this.#redisConnection.subscribe( channel ).catch( ( error ) => {
                    // Cleanup partial state if subscribe fails:
                    const handler = this.#messageHandlersByChannel.get( channel );
                    if ( handler ) {
                        this.#redisConnection.off( "message", handler );
                        this.#messageHandlersByChannel.delete( channel );
                    }
                    reject( exceptions.raise( error ) );
                } );
            }
        } );
    }

    /**
     * Used to unsubscribe from a channel and remove its message handler.
     *
     * @method
     * @param {string} channel Unique identifier of the channel to unsubscribe from.
     * @returns {Promise}
     * @public
     */
    unsubscribeCommand( channel ) {
        return new Promise( ( resolve, reject ) => {
            const handler = this.#messageHandlersByChannel.get( channel );
            if ( handler ) {
                this.#redisConnection.off( "message", handler );
                this.#messageHandlersByChannel.delete( channel );
            }

            this.#redisConnection.unsubscribe( channel ).then( () => {
                resolve();
            } ).catch( ( error ) => {
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
            this.#redisConnection[ "call" ].apply( this.#redisConnection, commandArguments ).then( ( result ) => {
                resolve( result );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to gracefully close the Redis connection.
     * Attempts to quit(), then falls back to disconnect() on timeout.
     *
     * @method
     * @param {number} [timeoutMs=1000]
     * @returns {Promise}
     * @public
     */
    shutDown( timeoutMs = 1000 ) {
        return new Promise( ( resolve ) => {
            let finished = false;
            const done = () => {
                if ( !finished ) {
                    finished = true;
                    resolve();
                }
            };

            const timeout = setTimeout( () => {
                try {
                    this.#redisConnection.disconnect();
                } catch ( error ) {
                }
                done();
            }, timeoutMs );

            this.#redisConnection.quit().then( () => {
                clearTimeout( timeout );
                done();
            } ).catch( () => {
                clearTimeout( timeout );
                try {
                    this.#redisConnection.disconnect();
                } catch ( error ) {
                }
                done();
            } );
        } );
    }

    /* Private interface */

    /**
     * Used to set up the connection to Redis server.
     * <br/>
     * NOTE: This method will only resolve once the server sends a 'ready' event.
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
    #setupClient( host, port, authKey, user, defaultDB, retryMaxIntervalMs, retryMaxAttempts ) {
        return new Promise( ( resolve, reject ) => {
            try {
                this.#retryMaxInterval = retryMaxIntervalMs;
                this.#retryMaxAttempts = retryMaxAttempts;

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
                    autoResendUnfulfilledCommands: true,
                    maxRetriesPerRequest: null,
                    retryStrategy: retryStrategy,
                    reconnectOnError: reconnectOnError
                };

                /** @type Redis */
                this.#redisConnection = new Redis( options );

                this.#redisConnection.on( "ready", () => {
                    logger.log( `Connection to Redis server ${ host }:${ port } (re)established by client '${ this.identifier }' and is ready to be used.`, logger.logSeverity.INFO );
                    resolve();
                } );
                this.#redisConnection.on( "error", ( error ) => {
                    logger.log( `Error received in Redis client '${ this.identifier }'.`, logger.logSeverity.ERROR, error );

                    // Notify all connection observers about this event:
                    _.forEach( this.#connectionObservers, ( connectionObservers ) => {
                        connectionObservers.onConnectionDisrupted( this.#clientIdentifier );
                    } );
                } );
                this.#redisConnection.on( "reconnecting", ( info ) => {
                    if ( info.attempt > 1 ) {
                        logger.log( `Client '${ this.identifier }' reconnecting to Redis server after ${ info.delay } ms. This is attempt ${ info.attempt }.`, logger.logSeverity.DEBUG );
                    }
                } );
            } catch ( error ) {
                reject( exceptions.raise( error ) );
            }
        } );
    }

    /**
     * Used to fetch and store Redis server information.
     *
     * @method
     * @private
     */
    #fetchServerInfo() {
        return new Promise( ( resolve, reject ) => {
            this.#redisConnection.info().then( ( result ) => {
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
                return this.#redisConnection.module( "LIST" );
            } ).then( ( result ) => {
                this.#serverFeatures = {};
                if ( _.isArray( result ) ) {
                    _.forEach( result, ( entry ) => {
                        this.#serverFeatures[ entry[ 1 ] ] = entry[ 3 ];
                    } );
                }
                resolve();
            } ).catch( ( error ) => {
                logger.log( `Failed to fetch Redis server information by client '${ this.identifier }'!`, logger.logSeverity.WARNING, error );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to fetch and store the Redis client ID.
     *
     * @method
     * @returns {Promise<number>}
     * @private
     */
    #getClientId() {
        let commandArguments = [ "client", "id" ];
        return this.callCommand( commandArguments ).then( ( clientID ) => Number( clientID ) );
    }

}

/**
 * Create and return a new Redis client.
 *
 * @method
 * @param {string} identifier
 * @return {RedisClient}
 * @public
 */
module.exports.createRedisClient = ( identifier ) => {
    return Object.freeze( new RedisClient( identifier ) );
};