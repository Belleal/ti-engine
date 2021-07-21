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
     */
    constructor() {
        let host = config.getSetting( config.setting.MESSAGE_EXCHANGE_REDIS_HOST );
        let port = config.getSetting( config.setting.MESSAGE_EXCHANGE_REDIS_PORT );
        let db = config.getSetting( config.setting.MESSAGE_EXCHANGE_REDIS_DB );
        let authKey = config.getSetting( config.setting.MESSAGE_EXCHANGE_AUTH_KEY );
        this.#redisClient = redis.createRedisClient( "message-exchange", host, port, authKey, db );
    }

    /* Public interface */

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
            let storeID = tools.getUUID();
            let command = [ redis.cacheCommands.HASH_SET, storeLocation, storeID, tools.stringifyJSON( payload ) ];
            this.#redisClient.executeCommands( [ command ] ).then( () => {
                resolve( storeID );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to receive a message from the specified queue.
     *
     * @method
     * @param {string} receiveQueue
     * @param {string} processingQueue
     * @returns {Promise<Message>}
     * @public
     */
    receiveMessage( receiveQueue, processingQueue ) {
        return new Promise( ( resolve, reject ) => {
            let command;
            let commandArguments = [ receiveQueue ];
            if ( processingQueue ) {
                command = redis.cacheCommands.LIST_POP_TAIL_PUSH_HEAD_BLOCKING;
                commandArguments.push( processingQueue );
            } else {
                command = redis.cacheCommands.LIST_POP_TAIL_BLOCKING;
            }
            commandArguments.push( 0 );

            this.#redisClient.blockingCommand( command, commandArguments ).then( ( results ) => {
                results = results[ 0 ];
                resolve( ( results && results.length > 1 ) ? tools.parseJSON( results[ 1 ] ) : undefined );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

/**
 * Used to create a new message memory cache.
 *
 * @method
 * @returns {MessageMemoryCache}
 * @public
 */
module.exports.create = () => {
    return Object.freeze( new MessageMemoryCache() );
};