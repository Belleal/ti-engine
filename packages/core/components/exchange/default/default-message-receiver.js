/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
     */
    constructor( identifier, receiveQueue ) {
        super( identifier, receiveQueue );
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
            this.#memoryCache.initialize().then( () => {
                this.isReceiving = true;
                this.receive();
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
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
                this.isReceiving = false;
                this.#memoryCache = null;
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
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
            // NOTE: The method execution will block on this call until a message is received:
            this.#memoryCache.receiveMessage( this.receiveQueue ).then( ( lightweightMessage ) => {
                return this.#memoryCache.retrieveMessagePayload( lightweightMessage, config.getSetting( config.setting.MESSAGE_EXCHANGE_MESSAGE_STORE ) );
            } ).then( ( message ) => {
                resolve( message );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = DefaultMessageReceiver;