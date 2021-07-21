/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageReceiver = require( "#message-receiver" );
const exceptions = require( "#exceptions" );
const memoryCache = require( "#message-memory-cache" );

/**
 * The default {@link MessageReceiver} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageReceiver
 * @public
 */
class DefaultMessageReceiver extends MessageReceiver {

    #memoryCache;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        super( identifier );
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
            this.#memoryCache = memoryCache.create();
            this.isAvailable = true;
            resolve();
        } );
    }

    /**
     * Used to shutdown and disable the communication behavior of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disable() {
        return new Promise( ( resolve, reject ) => {
            this.isAvailable = false;
            this.#memoryCache = null;
            resolve();
        } );
    }

}

module.exports = DefaultMessageReceiver;
