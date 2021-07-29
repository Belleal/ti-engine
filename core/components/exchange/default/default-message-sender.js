/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageSender = require( "#message-sender" );
const _ = require( "lodash" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );
const memoryCache = require( "#message-memory-cache" );

/**
 * The default {@link MessageSender} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageSender
 * @extends MessageSender
 * @public
 */
class DefaultMessageSender extends MessageSender {

    #memoryCache;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        super( identifier );
    }

    /**
     * Used to perform the actual sending of a message.
     * NOTE: The default message exchange works with lightweight messages (i.e. will keep the payloads stored in Redis while exchanging).
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} route The route to destination for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise}
     * @override
     * @public
     */
    onSend( message, route ) {
        return new Promise( ( resolve, reject ) => {
            this.#memoryCache.storeMessagePayload( message.payload, config.getSetting( config.setting.MESSAGE_EXCHANGE_STORE ) ).then( ( storeID ) => {
                let lightweightMessage = _.cloneDeep( message );
                lightweightMessage.payload = storeID;
                return this.#memoryCache.sendMessage( lightweightMessage, route );
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
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
            //this.isAvailable = true;
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
}

module.exports = DefaultMessageSender;
