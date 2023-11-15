/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const config = require( "#config" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const redis = require( "#redis-integration" );

/**
 * Used to create a Redis Cache client wrapped in a specialized message memory cache interface.
 *
 * @class MessageMemoryCache
 * @public
 */
class MessageMemoryCache {

    #redisClient = null;

    /**
     * @constructor
     * @param {string} identifier The connection identifier for the Redis connection.
     */
    constructor( identifier ) {
        let host = config.getSetting( config.setting.MEMORY_CACHE_REDIS_HOST );
        let port = config.getSetting( config.setting.MEMORY_CACHE_REDIS_PORT );
        let db = config.getSetting( config.setting.MEMORY_CACHE_REDIS_DB );
        let authKey = config.getSetting( config.setting.MEMORY_CACHE_AUTH_KEY );
        let user = config.getSetting( config.setting.MEMORY_CACHE_USER );
        this.#redisClient = redis.createRedisClient( identifier, host, port, authKey, user, db );
    }

    /* Public interface */

    /**
     * Used to register a new {@link ConnectionObserver} for events related to the Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        this.#redisClient.addConnectionObserver( connectionObserver );
    }

    /**
     * Used to send a message to the specified route.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The destination queue for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise<number>} Will return the destination queue length after adding the current message to it.
     * @public
     */
    sendMessage( message, queue ) {
        return new Promise( ( resolve, reject ) => {
            let command = [ redis.cacheCommands.LIST_PUSH, queue, tools.stringifyJSON( message ) ];
            this.#redisClient.executeCommands( [ command ] ).then( ( results ) => {
                results = results[ 0 ];
                resolve( ( results && results.length > 1 ) ? results[ 1 ] : undefined );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to store a message payload.
     *
     * @method
     * @param {Object} payload
     * @param {string} storeLocation
     * @returns {Promise<string>} Will return an unique ID of the storage location for the payload.
     * @public
     */
    storeMessagePayload( payload, storeLocation ) {
        return new Promise( ( resolve, reject ) => {
            if ( payload ) {
                let storeID = tools.getUUID();
                let command = [ redis.cacheCommands.HASH_SET, storeLocation, storeID, tools.stringifyJSON( payload ) ];
                this.#redisClient.executeCommands( [ command ] ).then( () => {
                    resolve( storeID );
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            } else {
                resolve();
            }
        } );
    }

    /**
     * Used to receive a message from the specified queue.
     *
     * @method
     * @param {string} queue
     * @returns {Promise<Message>}
     * @public
     */
    receiveMessage( queue ) {
        return new Promise( ( resolve, reject ) => {
            this.#redisClient.blockingCommand( redis.cacheCommands.LIST_POP_TAIL_BLOCKING, [ queue, 0 ] ).then( ( results ) => {
                results = ( results && results.length > 1 ) ? results[ 1 ] : undefined;
                resolve( tools.parseJSON( results ) );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to retrieve a message payload by its store ID.
     *
     * @method
     * @param {Message} message
     * @param {string} storeLocation
     * @returns {Promise<Message>} Will return the message with its payload populated if such is found.
     * @public
     */
    retrieveMessagePayload( message, storeLocation ) {
        return new Promise( ( resolve, reject ) => {
            if ( message.payload ) {
                let command1 = [ redis.cacheCommands.HASH_GET, storeLocation, message.payload ];
                let command2 = [ redis.cacheCommands.HASH_REMOVE, storeLocation, message.payload ];
                this.#redisClient.executeCommands( [ command1, command2 ] ).then( ( results ) => {
                    results = results[ 0 ];
                    message.payload = ( results && results.length > 1 ) ? tools.parseJSON( results[ 1 ] ) : undefined;
                    resolve( message );
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            } else {
                resolve( message );
            }
        } );
    }

}

/**
 * Used to create a new message memory cache.
 *
 * @method
 * @param {string} identifier The connection identifier for the Redis connection.
 * @returns {MessageMemoryCache}
 * @public
 */
module.exports.create = ( identifier ) => {
    return Object.freeze( new MessageMemoryCache( identifier ) );
};
