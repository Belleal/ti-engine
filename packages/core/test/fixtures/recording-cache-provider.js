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
const { cacheCapability } = require( "#cache-capability" );

/**
 * A {@link CacheProvider} that connects to nothing and records every write it is asked for, used to see what the
 * message tracer stores and where.
 * <br/>
 * NOTE: Every write method of the contract is recorded, not only the list push the tracer uses, so a test can tell
 * that nothing else was written - the bare repository key the tracer used to grow included.
 * <br/>
 * NOTE: What it declares and what it recorded are statics, because the cache singleton keeps its backend private.
 *
 * @class RecordingCacheProvider
 * @extends CacheProvider
 * @public
 */
class RecordingCacheProvider extends CacheProvider {

    /** Capabilities the next `capabilities` read will report. */
    static declaredCapabilities = [ cacheCapability.KEY_EXPIRY, cacheCapability.LISTS ];
    /** Every write asked for, in order: `{ method, args }`. */
    static writes = [];
    /** Write methods that record the call and then reject, as a backend that refuses the write does. */
    static refused = [];

    #observers = [];
    #connectionIdentifier;

    /**
     * @constructor
     * @param {string} connectionIdentifier The identifier under which this backend's connection is observed.
     */
    constructor( connectionIdentifier ) {
        super();

        this.#connectionIdentifier = connectionIdentifier;
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
        return RecordingCacheProvider.declaredCapabilities;
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

// The arguments are kept as given: a test that changes the message afterwards sees whether the tracer kept a copy.
[ "setValue", "setValues", "deleteValue", "expireValue", "listPushValue", "addToSet", "addToSetMulti", "hashSetField", "hashSetFields",
    "hashDeleteField", "setJSON", "editJSON", "arrayAppendJSON" ].forEach( ( method ) => {
    RecordingCacheProvider.prototype[ method ] = function( ...args ) {
        RecordingCacheProvider.writes.push( { method: method, args: args } );
        return RecordingCacheProvider.refused.includes( method ) ? Promise.reject( new Error( `${ method } refused` ) ) : Promise.resolve();
    };
} );

module.exports = RecordingCacheProvider;
