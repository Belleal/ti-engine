/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageHandler = require( "#message-handler" );
const exceptions = require( "#exceptions" );

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
     * Used to shutdown and disable the communication behavior of the handler.
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
            this.#preSend().then( () => {
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
     * NOTE: This method will be called automatically.
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
     * @returns {Promise}
     * @private
     */
    #preSend() {
        if ( this.isAvailable === true ) {
            return Promise.resolve();
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
