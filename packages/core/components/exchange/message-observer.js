/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ConnectionObserver = require( "#connection-observer" );
const exceptions = require( "#exceptions" );

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

    /**
     * @constructor
     */
    constructor() {
        super();

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageObserver ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /**
     * Needs to be invoked by the message handler once a message enters its logic for processing.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @virtual
     * @public
     */
    onMessage( identifier, message ) {
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