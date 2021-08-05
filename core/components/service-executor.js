/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageObserver = require( "#message-observer" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * A class defining a service executor behavior.
 *
 * @class ServiceExecutor
 * @extends MessageObserver
 * @public
 */
class ServiceExecutor extends MessageObserver {

    /**
     * @constructor
     */
    constructor() {
        super();
    }

    /* Public interface */

    /**
     *
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @override
     * @public
     */
    onMessage( identifier, message ) {
        this.#processServiceCall( message ).then( ( serviceCall ) => {
            return messageDispatcher.sendResponse( serviceCall );
        } ).catch( ( error ) => {
            logger.log( `Failed to send service call response after processing! Service call ID was: '${ message.messageID }'`, logger.logSeverity.ERROR, error );
        } );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        super.onConnectionDisrupted( identifier );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered( identifier ) {
        super.onConnectionRecovered( identifier );
    }

    /* Private interface */

    /**
     * Used to process the actual service call.
     *
     * @method
     * @param {ServiceCall} serviceCall
     * @returns {Promise<ServiceCall>}
     * @private
     */
    #processServiceCall( serviceCall ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: implementation pending here...
            resolve( serviceCall );
        } );
    }

}

module.exports = ServiceExecutor;
