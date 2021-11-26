/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageReceiver = require( "#message-receiver" );
const memoryCache = require( "#message-memory-cache" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );

/**
 * The default {@link MessageReceiver} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageReceiver
 * @extends MessageReceiver
 * @public
 */
class DefaultMessageReceiver extends MessageReceiver {

    #memoryCache;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @param {string} receiveQueue The queue from which the messages will be received.
     * @param {string} [processingQueue=undefined] The queue in which the messages will be put for processing (if necessary).
     */
    constructor( identifier, receiveQueue, processingQueue = undefined ) {
        super( identifier, receiveQueue, processingQueue );
    }

    /**
     * Used to initialize and enable the communication capabilities of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    enable() {
        return new Promise( ( resolve, reject ) => {
            this.#memoryCache = memoryCache.create( this.connectionIdentifier );
            this.#memoryCache.addConnectionObserver( this );
            this.receive();
            resolve();
        } );
    }

    /**
     * Used to shutdown and disable the communication behavior of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disable() {
        return new Promise( ( resolve, reject ) => {
            this.isAvailable = false;
            this.#memoryCache = null;
            resolve();
        } );
    }

    /**
     * Used to receive messages.
     * <br/>
     * NOTE: The default message exchange works with lightweight messages (i.e. will keep the payloads stored in Redis while exchanging).
     *
     * @method
     * @returns {Promise<Message>}
     * @override
     * @public
     */
    onReceive() {
        return new Promise( ( resolve, reject ) => {
            this.#memoryCache.receiveMessage( this.receiveQueue ).then( ( lightweightMessage ) => {
                return this.#memoryCache.retrieveMessagePayload( lightweightMessage, config.getSetting( config.setting.MESSAGE_EXCHANGE_STORE ) );
            } ).then( ( message ) => {
                resolve( message );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = DefaultMessageReceiver;
