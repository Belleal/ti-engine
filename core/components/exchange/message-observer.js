/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ConnectionObserver = require( "#connection-observer" );
const exceptions = require( "#exceptions" );

/**
 * An abstract class that allows the child class to observe and take action on message events.
 * NOTE: This class inherits {@link ConnectionObserver} so it can also act in that capacity.
 *
 * @class MessageObserver
 * @extends ConnectionObserver
 * @abstract
 * @public
 */
class MessageObserver extends ConnectionObserver {

    /**
     * @constructor
     */
    constructor() {
        super();

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageObserver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /**
     * Needs to be invoked by the message handler once a message enters its logic for processing.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @virtual
     * @public
     */
    onMessage( identifier, message ) { }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionDisrupted( identifier ) {
        super.onConnectionDisrupted( identifier );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionRecovered( identifier ) {
        super.onConnectionRecovered( identifier );
    }

}

module.exports = MessageObserver;
