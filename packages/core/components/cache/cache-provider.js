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

/** @import ConnectionObserver from "#connection-observer" */

/**
 * An abstract class that defines the storage behavior required by the {@link CommonMemoryCache}.
 * <br/>
 * NOTE: This sets the contract between the cache and whatever actually holds the values. It has to be inherited and
 * implemented with the specifics of a given backend. For a working example please see the {@link RedisCacheProvider} class.
 * <br/>
 * NOTE: Implementations must NOT check whether the cache is operational. {@link CommonMemoryCache} performs that check
 * once, before it delegates, so every backend inherits the same guard instead of restating it in each of its methods.
 *
 * @class CacheProvider
 * @abstract
 * @public
 */
class CacheProvider {

    /**
     * @constructor
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor() {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === CacheProvider ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

    /**
     * Property returning the optional behaviors this backend provides.
     * <br/>
     * NOTE: Some capabilities can only be established once a connection exists — RedisJSON, for example, is a server-side
     * module that has to be probed. Read this after {@link CacheProvider#initialize} has resolved, never before.
     *
     * @property
     * @returns {string[]} Values drawn from {@link TiCacheCapability}.
     * @abstract
     * @public
     */
    get capabilities() {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + ".capabilities" } );
    }

    /**
     * Used to verify whether this backend provides a given capability.
     *
     * @method
     * @param {string} capability A value from {@link TiCacheCapability}.
     * @returns {boolean}
     * @public
     */
    hasCapability( capability ) {
        return this.capabilities.indexOf( capability ) !== -1;
    }

    /**
     * Used to initialize the backend and establish whatever connection it requires.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    initialize() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.initialize.name } ) );
    }

    /**
     * Used to gracefully shut the backend down.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    shutDown() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.shutDown.name } ) );
    }

    /**
     * Used to register a new {@link ConnectionObserver} for events related to the backend connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @abstract
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.addConnectionObserver.name } );
    }

    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.KEY_PATTERN_MATCH}
     * @abstract
     * @public
     */
    matchKeys( pattern ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.matchKeys.name } ) );
    }

    /**
     * Used to set a specific string value.
     *
     * @method
     * @param {string} key
     * @param {string} value
     * @param {number} [expiration] Expiration value is in seconds.
     * @returns {Promise<string>}
     * @abstract
     * @public
     */
    setValue( key, value, expiration ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.setValue.name } ) );
    }

    /**
     * Used to set multiple string values.
     *
     * @method
     * @param {Object} keyValues
     * @param {string} [prefix]
     * @param {number} [expiration] Expiration value is in seconds.
     * @returns {Promise}
     * @abstract
     * @public
     */
    setValues( keyValues, prefix, expiration ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.setValues.name } ) );
    }

    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @returns {Promise}
     * @abstract
     * @public
     */
    getValue( key ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.getValue.name } ) );
    }

    /**
     * Used to get multiple string values.
     *
     * @method
     * @param {string[]} keys
     * @param {string} [prefix]
     * @returns {Promise}
     * @abstract
     * @public
     */
    getValues( keys, prefix ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.getValues.name } ) );
    }

    /**
     * Used to delete a value / item.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @abstract
     * @public
     */
    deleteValue( key ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.deleteValue.name } ) );
    }

    /**
     * Used to set expiration in seconds to an existing key.
     *
     * @method
     * @param {string} key
     * @param {number} seconds
     * @param {string} [name] If a field in a hash set is to be expired instead, the name of that set.
     * @returns {Promise<number>}
     * @requires {TiCacheCapability.KEY_EXPIRY}
     * @abstract
     * @public
     */
    expireValue( key, seconds, name ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.expireValue.name } ) );
    }

    /**
     * Used to add the specified values to a list.
     *
     * @method
     * @param {string} listName
     * @param {Object[]} values
     * @returns {Promise<number>}
     * @requires {TiCacheCapability.LISTS}
     * @abstract
     * @public
     */
    listPushValue( listName, values ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.listPushValue.name } ) );
    }

    /**
     * Used to add the specified value to a set.
     *
     * @method
     * @param {string} key
     * @param {string|Object} value
     * @returns {Promise}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    addToSet( key, value ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.addToSet.name } ) );
    }

    /**
     * Used to add multiple values to multiple sets in one transactional request.
     *
     * @method
     * @param {string[]} keys
     * @param {string[]} values
     * @returns {Promise}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    addToSetMulti( keys, values ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.addToSetMulti.name } ) );
    }

    /**
     * Used to verify whether a value is a member of a set.
     *
     * @method
     * @param {string} setName
     * @param {string|Object} value
     * @returns {Promise<boolean>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    isSetMember( setName, value ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.isSetMember.name } ) );
    }

    /**
     * Used to fetch all members of a set.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    membersOfSet( key ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.membersOfSet.name } ) );
    }

    /**
     * Used to fetch the union of the provided sets.
     *
     * @method
     * @param {string[]} keys
     * @returns {Promise<Array>}
     * @requires {TiCacheCapability.SETS}
     * @abstract
     * @public
     */
    unionOfSets( keys ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.unionOfSets.name } ) );
    }

    /**
     * Used to set a single field in a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} name
     * @param {string|Object} value
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashSetField( key, name, value ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.hashSetField.name } ) );
    }

    /**
     * Used to set multiple fields in a hash set.
     *
     * @method
     * @param {string} key
     * @param {Object} fields
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashSetFields( key, fields ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.hashSetFields.name } ) );
    }

    /**
     * Used to fetch a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashGetField( key, field ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.hashGetField.name } ) );
    }

    /**
     * Used to delete a single field from a hash set.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @returns {Promise}
     * @requires {TiCacheCapability.HASH_FIELDS}
     * @abstract
     * @public
     */
    hashDeleteField( key, field ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.hashDeleteField.name } ) );
    }

    /**
     * Used to store a JSON document, or a branch of one.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @param {number} [overrideMode=0] 0 allows full override; 1 sets only if absent; 2 sets only if present.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    setJSON( key, value, path = "$", overrideMode = 0 ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.setJSON.name } ) );
    }

    /**
     * Used to fetch a JSON document, or a branch of one.
     * <br/>
     * NOTE: The two built-in backends answer this in different shapes, and a caller must not paper over it by
     * unwrapping `result[ 0 ]`: Redis answers RedisJSON's **list of matches** (`[ value ]`, `[]` for a missing path),
     * HTTP answers **the value itself**. The unwrap is right for Redis and truncates any stored array over HTTP — a
     * competency baseline read back as its first code (CA-178). Use {@link CacheProvider#getJSONValue} for one shape.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<Object>}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    getJSON( key, path = "$" ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.getJSON.name } ) );
    }

    /**
     * Used to fetch the value at a path of a JSON document — the value itself, whatever the backend.
     * <br/>
     * The one shape both backends agree on: the addressed value, or `null` when the key or the path is absent.
     * <br/>
     * A wildcard is where they differ, because it is RedisJSON's feature and not the state protocol's. On Redis, a `*`
     * anywhere in the path answers its first match — what every caller that took `result[ 0 ]` had. Over HTTP a
     * segment is a literal key (`design/state-protocol.md`), so `*` names a key spelled `*`; the one exception is the
     * D1 service's partitioned documents, which answer the first match for a `*` at an entity position and refuse one
     * anywhere else with a 400. A caller that reads by wildcard is therefore portable only across those positions.
     *
     * @method
     * @param {string} key
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise<*>} The addressed value, or `null`.
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    getJSONValue( key, path = "$" ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.getJSONValue.name } ) );
    }

    /**
     * Used to merge a value into an existing JSON document at the given path.
     * <br/>
     * NOTE: Callers rely on this being applied atomically by the backend when {@link TiCacheCapability.ATOMIC_JSON_EDIT}
     * is declared — two concurrent edits to different paths of the same document must both survive. A backend that can
     * only read-modify-write must NOT declare that capability, because the loss is silent: nothing throws, and one of
     * the two writes is simply gone.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    editJSON( key, value, path = "$" ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.editJSON.name } ) );
    }

    /**
     * Used to append a value to an array inside a JSON document.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string|string[]} [path="$"] A dot-separated JSONPath string, or an array of literal key segments.
     * @returns {Promise}
     * @requires {TiCacheCapability.JSON_DOCUMENTS}
     * @abstract
     * @public
     */
    arrayAppendJSON( key, value, path = "$" ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.arrayAppendJSON.name } ) );
    }
}

module.exports = CacheProvider;
