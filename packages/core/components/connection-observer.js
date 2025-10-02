/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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
     * @throws {Exception.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
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
     *
     */
    onConnectionDisrupted( identifier ) {
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
    }

}

module.exports = ConnectionObserver;