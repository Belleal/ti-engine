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
const exceptions = require( "#exceptions" );

/** @import { Message } from "#definitions" */

/**
 * An abstract class that allows the child class to observe and take action on message events.
 * <br/>
 * NOTE: This class inherits {@link ConnectionObserver} so it can also act in that capacity.
 *
 * @class MessageObserver
 * @extends ConnectionObserver
 * @abstract
 * @public
 */
class MessageObserver extends ConnectionObserver {

    #priority = 0;

    /**
     * @constructor
     * @param {number} [priority=0] The priority of this observer. Higher values indicate higher priority.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor( priority = 0 ) {
        super();

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageObserver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#priority = _.isNumber( priority ) ? priority : 0;
    }

    /**
     * Returns the priority of this observer.
     * <br/>
     * NOTE: Higher values indicate higher priority.
     *
     * @property
     * @returns {number}
     */
    get priority() {
        return this.#priority;
    }

    /**
     * Used to set the priority of this observer.
     * <br/>
     * NOTE: Higher values indicate higher priority.
     *
     * @property
     * @param {number} value
     */
    set priority( value ) {
        this.#priority = _.isNumber( value ) ? value : 0;
    }

    /**
     * Needs to be invoked by the message handler once a message enters its logic for processing.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @returns {Message} The message that was received.
     * @virtual
     * @public
     */
    onMessage( identifier, message ) {
        return message;
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
    onConnectionDisrupted( identifier ) {
        super.onConnectionDisrupted( identifier );
    }

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
    onConnectionRecovered( identifier ) {
        super.onConnectionRecovered( identifier );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionLost( identifier ) {
        super.onConnectionLost( identifier );
    }

}

module.exports = MessageObserver;