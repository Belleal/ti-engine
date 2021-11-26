/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageHandler = require( "#message-handler" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );

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
     * Property returning the configured receive queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    get receiveQueue() { return this.#receiveQueue; }

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
     * Used to shutdown and disable the communication behavior of the handler.
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
     * NOTE: This method will start a recursion of subsequent receives that will continue even if an individual message fetch fails.
     *
     * @method
     * @public
     */
    receive() {
        this.onReceive().then( ( message ) => {
            this.onMessage( message );
        } ).catch( ( error ) => {
            logger.log( `Error while trying to receive the next pending message from memory cache in receiver '${ this.connectionIdentifier }'! Resuming operation...`, logger.logSeverity.ERROR, error );
        } ).finally( () => {
            this.receive();
        } );
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

}

module.exports = MessageReceiver;
