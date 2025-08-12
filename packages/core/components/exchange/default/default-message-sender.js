/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
     * <br/>
     * NOTE: The default message exchange works with lightweight messages (i.e. will keep the payloads stored in Redis while exchanging).
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise}
     * @override
     * @public
     */
    onSend( message, queue ) {
        return new Promise( ( resolve, reject ) => {
            this.#memoryCache.storeMessagePayload( message.payload, config.getSetting( config.setting.MESSAGE_EXCHANGE_MESSAGE_STORE ) ).then( ( storeID ) => {
                let lightweightMessage = _.cloneDeep( message );
                lightweightMessage.payload = storeID;
                return this.#memoryCache.sendMessage( lightweightMessage, queue );
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
            resolve();
        } );
    }

    /**
     * Used to shut down and disable the communication behavior of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disable() {
        return new Promise( ( resolve, reject ) => {
            this.isAvailable = false;
            this.#memoryCache.shutDown().then( () => {
                this.#memoryCache = null;
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
}

module.exports = DefaultMessageSender;
