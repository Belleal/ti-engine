/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageHandler = require( "#message-handler" );
const exceptions = require( "#exceptions" );

/**
 * An abstract class that defines a basic message receiver behavior.
 *
 * @class MessageReceiver
 * @abstract
 * @public
 */
class MessageReceiver extends MessageHandler {

    #receiveQueue;
    #processingQueue;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @param {string} receiveQueue The queue from which the messages will be received.
     * @param {string} [processingQueue=undefined] The queue in which the messages will be put for processing (if necessary).
     */
    constructor( identifier, receiveQueue, processingQueue = undefined ) {
        super( identifier );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageReceiver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#receiveQueue = receiveQueue;
        this.#processingQueue = processingQueue;
    }

    /**
     * Property returning the configured receive queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    get receiveQueue() { return this.#receiveQueue; }

    /**
     * Property returning the configured processing queue (if any).
     *
     * @property
     * @returns {string|undefined}
     * @public
     */
    get processingQueue() { return this.#processingQueue; }

}

module.exports = MessageReceiver;