/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const MessageHandler = require( "#message-handler" );
const exceptions = require( "#exceptions" );
const config = require( "#config" );

/**
 * An abstract class that defines a basic message sender behavior.
 *
 * @class MessageSender
 * @extends MessageHandler
 * @abstract
 * @public
 */
class MessageSender extends MessageHandler {

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        super( identifier );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageSender ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

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
     * Used to send a {@link Message} via this message handler.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise}
     * @public
     */
    send( message, queue ) {
        return new Promise( ( resolve, reject ) => {
            this.#preSend( message ).then( ( message ) => {
                return this.onSend( message, queue );
            } ).then( () => {
                return this.#postSend();
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to perform the actual sending of a message.
     * <br/>
     * NOTE: This method will be called automatically even if overridden.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise<*>}
     * @abstract
     * @public
     */
    onSend( message, queue ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.onSend.name } ) );
    }

    /* Private interface */

    /**
     * Used to do pre-send verifications and checks.
     *
     * @method
     * @param {Message} message
     * @returns {Promise<Message>}
     * @private
     */
    #preSend( message ) {
        if ( this.isAvailable === true ) {
            if ( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED ) === true ) {
                message.hash = this.createMessageHash( message );
            }

            return Promise.resolve( message );
        } else {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_COM_MESSAGE_SENDER_UNAVAILABLE ) );
        }
    }

    /**
     * Used to execute post- successful send logic.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #postSend() {
        return Promise.resolve();
    }

}

module.exports = MessageSender;
