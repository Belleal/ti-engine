/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const MessageReceiver = require( "#message-receiver" );
const memoryCache = require( "#message-memory-cache" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );

/** @import { Message } from "#definitions" */

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