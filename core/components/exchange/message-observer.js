/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const exceptions = require( "#exceptions" );

/**
 * An abstract class that allows the child class to observe and take action on various events related to
 * message exchange connections and messages.
 *
 * @class MessageObserver
 * @abstract
 * @public
 */
class MessageObserver {

    /**
     * @constructor
     */
    constructor() {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageObserver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /**
     * Will be invoked by a {@link MessageHandler} when a connection is disrupted.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionDisrupted( identifier ) { }

    /**
     * Will be invoked by a {@link MessageHandler} when a connection is recovered.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionRecovered( identifier ) { }

    /**
     * Will be invoked by every {@link MessageHandler} once a message enters its logic for processing.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @virtual
     * @public
     */
    onMessage( identifier, message ) { }

}

module.exports = MessageObserver;
