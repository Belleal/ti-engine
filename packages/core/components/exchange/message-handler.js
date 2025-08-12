/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ConnectionObserver = require( "#connection-observer" );
const _ = require( "lodash" );
const blake2 = require( "blake2" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const tools = require( "#tools" );
const config = require( "#config" );

/**
 * An abstract class that defines a basic message handler behavior.
 * <br/>
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
     * <br/>
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
     * <br/>
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
     * Used to shut down and disable the communication behavior of the handler.
     * <br/>
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
     * Used to create a security hash from the message.
     *
     * @method
     * @param {Message} message
     * @returns {string}
     * @public
     */
    createMessageHash( message ) {
        let transformed = tools.decomposeJSON( tools.decycle( message ) );
        let hash = blake2.createKeyedHash( "blake2b", Buffer.from( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY ) ) );
        hash.update( Buffer.from( transformed ) );
        return hash.digest( "hex" );
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
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionRecovered( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    onConnectionRecovered( identifier ) {
        if ( this.#isAvailable === false && identifier === this.#connectionIdentifier ) {
            this.#isAvailable = true;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionRecovered( this.#connectionIdentifier );
            } );
        }
    }

    /**
     * An event-triggered method that will notify any observers about primary connection disrupted state.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionDisrupted( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    onConnectionDisrupted( identifier ) {
        if ( this.#isAvailable === true && identifier === this.#connectionIdentifier ) {
            this.#isAvailable = false;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionDisrupted( this.#connectionIdentifier );
            } );
        }
    }

}

module.exports = MessageHandler;
