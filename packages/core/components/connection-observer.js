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
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
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