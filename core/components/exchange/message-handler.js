/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const exceptions = require( "#exceptions" );

/**
 * An abstract class that defines a basic message handler behavior.
 * NOTE: This class and its children are designed to be used internally by classes extending the {@link MessageObserver} class.
 *
 * @class MessageHandler
 * @abstract
 * @public
 */
class MessageHandler {

    #isAvailable = false;
    #connectionIdentifier;
    #connectionObservers;
    #messageObservers;

    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor( identifier ) {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageHandler ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#connectionIdentifier = identifier;
        this.#connectionObservers = [];
        this.#messageObservers = [];
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
     * NOTE: When implementing make sure to design the method in such a way that it allows its invocation during recovery event as defined in
     * the {@link #resetCommunication} method.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    enable() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.enable.name } ) );
    }

    /**
     * Used to shutdown and disable the communication behavior of the handler.
     * NOTE: When implementing make sure to design the method in such a way that it allows its invocation during recovery event as defined in
     * the {@link #resetCommunication} method.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    disable() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.disable.name } ) );
    }

    /**
     * Used to register a new {@link MessageObserver} for events related to the primary connection state.
     *
     * @method
     * @param {MessageObserver} messageObserver The {@link MessageObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver( messageObserver ) {
        this.#connectionObservers.push( messageObserver );
    }

    /**
     * Used to register a new {@link MessageObserver} for events related to the messages passing through this handler.
     *
     * @method
     * @param {MessageObserver} messageObserver The {@link MessageObserver} that will be notified of any changes.
     * @public
     */
    addMessageObserver( messageObserver ) {
        this.#messageObservers.push( messageObserver );
    }

    /* Private interface */

    /**
     * An event-triggered method that will notify any observers about primary connection recovered state.
     *
     * @method
     * @private
     */
    #onConnectionRecovered() {
        this.#isAvailable = true;
        _.forEach( this.#connectionObservers, ( messageObserver ) => {
            messageObserver.onConnectionRecovered( this.#connectionIdentifier );
        } );
    }

    /**
     * An event-triggered method that will notify any observers about primary connection disrupted state.
     *
     * @method
     * @private
     */
    #onConnectionDisrupted() {
        this.#isAvailable = false;
        _.forEach( this.#connectionObservers, ( messageObserver ) => {
            messageObserver.onConnectionDisrupted( this.#connectionIdentifier );
        } );
    }

    #onMessage( message ) {
        _.forEach( this.#messageObservers, ( messageObserver ) => {
            messageObserver.onMessage( this.#connectionIdentifier, message );
        } );
    }

}

module.exports = MessageHandler;
