/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const MessageHandler = require( "#message-handler" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const config = require( "#config" );

/**
 * An abstract class that defines a basic message receiver behavior.
 *
 * @class MessageReceiver
 * @extends MessageHandler
 * @abstract
 * @public
 */
class MessageReceiver extends MessageHandler {

    #receiveQueue;
    #isReceiving = false;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @param {string} receiveQueue The queue from which the messages will be received.
     */
    constructor( identifier, receiveQueue ) {
        super( identifier );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageReceiver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#receiveQueue = receiveQueue;
    }

    /* Public interface */

    /**
     * Property returning the configured receiving queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    get receiveQueue() {
        return this.#receiveQueue;
    }

    /**
     * Indicates whether the receiver is currently receiving messages.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isReceiving() {
        return this.#isReceiving;
    }

    /**
     * Used to set the value of the {@link MessageReceiver#isReceiving} property.
     *
     * @property
     * @param {boolean} value
     * @public
     */
    set isReceiving( value ) {
        this.#isReceiving = value;
    }

    /**
     * Used to initialize and enable the communication capabilities of the handler.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    enable() {
        return super.enable();
    }

    /**
     * Used to shut down and disable the communication behavior of the handler.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    disable() {
        return super.disable();
    }

    /**
     * Used to receive messages.
     * <br/>
     * NOTE: This method will start a recursion of subsequent receive calls that will continue even if an individual message fetch fails.
     *
     * @method
     * @recursion
     * @public
     */
    receive() {
        if ( this.isReceiving === true ) {
            this.onReceive().then( ( message ) => {
                return this.#postReceive( message );
            } ).then( ( message ) => {
                this.notifyMessageObservers( message );
            } ).catch( ( error ) => {
                if ( error.code !== exceptions.exceptionCode.E_COM_MESSAGE_RECEIVER_UNAVAILABLE ) {
                    logger.log( `Error while trying to receive the next pending message from memory cache in receiver '${ this.connectionIdentifier }'! Resuming operation...`, logger.logSeverity.ERROR, error );
                }
            } ).finally( () => {
                this.receive();
            } );
        }
    }

    /**
     * Used to receive messages.
     * <br/>
     * NOTE: This method will be called automatically even if overridden.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise<Message>}
     * @abstract
     * @public
     */
    onReceive() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.onReceive.name } ) );
    }

    /* Private interface */

    /**
     * Used to process the received message before providing it to any {@link MessageObserver}.
     *
     * @method
     * @param {Message} message
     * @returns {Promise<Message>}
     * @private
     */
    #postReceive( message ) {
        return new Promise( ( resolve, reject ) => {
            if ( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED ) === true ) {
                let receivedHash = message.hash;
                delete message.hash;
                let currentHash = this.createMessageHash( message );
                if ( receivedHash && receivedHash === currentHash ) {
                    resolve( message );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_SEC_MESSAGE_TAMPERING_DETECTED, {
                        messageID: message.messageID,
                        receivedHash: receivedHash,
                        currentHash: currentHash
                    } ) );
                }
            } else {
                resolve( message );
            }
        } );
    }

}

module.exports = MessageReceiver;