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

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        super( identifier );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageReceiver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

}

module.exports = MessageReceiver;
