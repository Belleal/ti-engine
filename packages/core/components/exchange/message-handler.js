/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const ConnectionObserver = require( "#connection-observer" );
const _ = require( "lodash" );
const crypto = require( "node:crypto" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const tools = require( "#tools" );
const config = require( "#config" );

/** @import { Message } from "#definitions" */
/** @import MessageObserver from "#message-observer" */

const OLD_DEFAULT_HASH_KEY = "23e7bdc7-a793-41f9-856e-6760332f0c73";
let keyWarningEmitted = false;

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
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
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
    get isAvailable() {
        return this.#isAvailable;
    }

    /**
     * Used to set the isAvailable flag.
     * <br/>
     * NOTE: For use by implementing classes only!
     *
     * @property
     * @param {boolean} value
     * @public
     */
    set isAvailable( value ) {
        this.#isAvailable = value;
    }

    /**
     * Returns the connection identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier() {
        return this.#connectionIdentifier;
    }

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
        const rawKey = config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY );
        let key = rawKey == null ? "" : String( rawKey );
        if ( keyWarningEmitted === false ) {
            keyWarningEmitted = true;
            if ( !key || key === OLD_DEFAULT_HASH_KEY ) {
                logger.log( "Message-exchange security hash is enabled but no private key is set ('securityHashKey' is missing or the published default). Set TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY to a private value, otherwise tamper protection is ineffective.", logger.logSeverity.WARNING );
            }
        }
        let transformed = tools.decomposeJSON( tools.decycle( message ) );
        let hmac = crypto.createHmac( "sha256", Buffer.from( key, "utf8" ) );
        hmac.update( Buffer.from( transformed ) );
        return hmac.digest( "hex" );
    }

    /**
     * Used to register a new {@link MessageObserver} for events related to the messages passing through this handler.
     *
     * @method
     * @param {MessageObserver} messageObserver The {@link MessageObserver} that will be notified of any changes.
     * @public
     */
    addMessageObserver( messageObserver ) {
        // Bound under a distinct name: `MessageObserver` at method scope would shadow the file-level type
        // import, leaving the documented parameter type unresolvable in the generated declarations.
        const MessageObserverClass = require( "#message-observer" );
        if ( messageObserver instanceof MessageObserverClass ) {
            this.#messageObservers.push( messageObserver );
            this.#messageObservers = _.orderBy( this.#messageObservers, [ "priority" ], [ "desc" ] );
        } else {
            logger.log( `Attempting to add '${ messageObserver.constructor.name }' as message observer but it's not a child-class of 'MessageObserver'!`, logger.logSeverity.WARNING );
        }
    }

    /**
     * An event-triggered method that will notify any observers about a new message for handling.
     * <br/>
     * NOTE: Each observer will be notified in the order of their priority via their {@link MessageObserver.onMessage} method. Additionally, the message will be
     * passed through each observer in the order of their priority. If the observer returns a modified message, it will be used instead of the original message!
     *
     * @method
     * @param {Message} message
     * @public
     */
    notifyMessageObservers( message ) {
        let modifiedMessage = message;
        _.forEach( this.#messageObservers, ( messageObserver ) => {
            modifiedMessage = messageObserver.onMessage( this.#connectionIdentifier, modifiedMessage );
        } );
    }

    /**
     * An event-triggered method that will notify any observers about the primary connection recovered state.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionRecovered( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
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
     * An event-triggered method that will notify any observers about the primary connection disrupted state.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionDisrupted( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     */
    onConnectionDisrupted( identifier ) {
        if ( this.#isAvailable === true && identifier === this.#connectionIdentifier ) {
            this.#isAvailable = false;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionDisrupted( this.#connectionIdentifier );
            } );
        }
    }

    /**
     * An event-triggered method that will notify any observers about the primary connection having been lost.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionLost( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     */
    onConnectionLost( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isAvailable = false;
            _.forEach( this.#messageObservers, ( messageObserver ) => {
                messageObserver.onConnectionLost( this.#connectionIdentifier );
            } );
        }
    }

}

module.exports = MessageHandler;