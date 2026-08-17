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

const MessageSender = require( "#message-sender" );
const _ = require( "lodash" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );
const memoryCache = require( "#message-memory-cache" );

/** @import { Message } from "#definitions" */

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
     * NOTE: The default message exchange works with lightweight messages (i.e., will keep the payloads stored in Redis while exchanging).
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
            this.#memoryCache.initialize().then( () => {
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
                this.#memoryCache = null;
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
}

module.exports = DefaultMessageSender;