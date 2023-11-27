/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
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
            return this.#postReceive( message );
        } ).then( ( message ) => {
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
