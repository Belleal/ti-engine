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

const CacheProvider = require( "#cache-provider" );

/**
 * A {@link CacheProvider} that connects to nothing, used to drive {@link CommonMemoryCache} in tests.
 * <br/>
 * NOTE: The one behavior it reproduces faithfully is the ORDERING that matters: like the real Redis client, it
 * notifies its connection observers from inside `initialize()` and only then resolves. That is what makes the cache
 * operational before capability reconciliation runs, and therefore what makes the rollback on a failed reconciliation
 * testable at all.
 * <br/>
 * NOTE: What it declares and what it recorded are statics, because the cache singleton keeps its backend private -
 * a test cannot reach the instance, but it can reach the class.
 *
 * @class StubCacheProvider
 * @extends CacheProvider
 * @public
 */
class StubCacheProvider extends CacheProvider {

    /** Capabilities the next `capabilities` read will report. Set this before calling `initialize()`. */
    static declaredCapabilities = [];
    /** How many times `shutDown()` has been called, across every instance. */
    static shutDownCalls = 0;
    /** How many times this class has been constructed - evidence that configuration selected it. */
    static constructions = 0;

    #observers = [];
    #connectionIdentifier;

    /**
     * @constructor
     * @param {string} connectionIdentifier The identifier under which this backend's connection is observed.
     */
    constructor( connectionIdentifier ) {
        super();

        this.#connectionIdentifier = connectionIdentifier;
        StubCacheProvider.constructions++;
    }

    /**
     * Property returning whatever the test asked this backend to declare.
     *
     * @property
     * @returns {string[]}
     * @override
     * @public
     */
    get capabilities() {
        return StubCacheProvider.declaredCapabilities;
    }

    /**
     * Used to "connect", notifying observers before resolving exactly as the Redis client does.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    initialize() {
        this.#observers.forEach( ( observer ) => observer.onConnectionRecovered( this.#connectionIdentifier ) );
        return Promise.resolve();
    }

    /**
     * Used to record that the cache asked this backend to close.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    shutDown() {
        StubCacheProvider.shutDownCalls++;
        return Promise.resolve();
    }

    /**
     * Used to register a {@link ConnectionObserver} that `initialize()` will notify.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The observer to notify.
     * @override
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        this.#observers.push( connectionObserver );
    }

}

module.exports = StubCacheProvider;
