/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const exceptions = require( "#exceptions" );

/**
 * An abstract class that allows the child class to observe and take action on various events related to external connections.
 *
 * @class ConnectionObserver
 * @abstract
 * @public
 */
class ConnectionObserver {

    /**
     * @constructor
     */
    constructor() {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === ConnectionObserver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionDisrupted( identifier ) { }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionRecovered( identifier ) { }

}

module.exports = ConnectionObserver;
