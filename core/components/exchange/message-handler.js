/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ConnectionObserver = require( "#connection-observer" );
const _ = require( "lodash" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );

/**
 * An abstract class that defines a basic message handler behavior.
 * NOTE: This class and its children are designed to be used internally by classes extending the {@link MessageObserver} class.
 *
 * @class MessageHandler
 * @extends ConnectionObserver
 * @abstract
 * @public
 */
class MessageHandler extends ConnectionObserver {

    #isAvailable = false;
    #connectionIdentifier;
    #messageObservers = [];

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        super();

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageHandler ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#connectionIdentifier = identifier;
    }

    /* Public interface */

    /**
     * Indicates whether the message handler is currently available.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isAvailable() { return this.#isAvailable; }

    /**
     * Used to set the isAvailable flag.
     * NOTE: For use by implementing classes only!
     *
     * @property
     * @param {boolean} value
     * @public
     */
    set isAvailable( value ) { this.#isAvailable = value; }

    /**
     * Returns the connection identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier() { return this.#connectionIdentifier; }

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
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.enable.name } ) );
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
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.disable.name } ) );
    }

    /**
     * Used to register a new {@link MessageObserver} for events related to the messages passing through this handler.
     *
     * @method
     * @param {MessageObserver} messageObserver The {@link MessageObserver} that will be notified of any changes.
     * @public
     */
    addMessageObserver( messageObserver ) {
        const MessageObserver = require( "#message-observer" );

        if ( messageObserver instanceof MessageObserver ) {
            this.#messageObservers.push( messageObserver );
        } else {
            logger.log( `Attempting to add '${ messageObserver.constructor.name }' as message observer but it's not a child-class of 'MessageObserver'!`, logger.logSeverity.WARNING );
        }
    }

    /**
     * An event-triggered method that will notify any observers about a new message for handling.
     *
     * @method
     * @param {Message} message
     * @public
     */
    onMessage( message ) {
        _.forEach( this.#messageObservers, ( messageObserver ) => {
            messageObserver.onMessage( this.#connectionIdentifier, message );
        } );
    }

    /**
     * An event-triggered method that will notify any observers about primary connection recovered state.
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionRecovered( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    onConnectionRecovered( identifier ) {
        if ( this.#isAvailable === false ) {
            this.#isAvailable = true;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionRecovered( this.#connectionIdentifier );
            } );
        }
    }

    /**
     * An event-triggered method that will notify any observers about primary connection disrupted state.
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionDisrupted( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    onConnectionDisrupted( identifier ) {
        if ( this.#isAvailable === true ) {
            this.#isAvailable = false;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionDisrupted( this.#connectionIdentifier );
            } );
        }
    }

}

module.exports = MessageHandler;
