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

/**
 * Minimal in-memory stand-in for `@ti-engine/core/cache`'s Redis(JSON)-backed store, sufficient for the access
 * patterns the web-framework components exercise: whole-document `getJSON`/`setJSON` at the `$` root, string values
 * with an optional expiry (`setValue`/`getValue`), key-pattern listing via `matchKeys`, and `deleteValue`. `getJSON`
 * returns results inside an array wrapper to match RedisJSON's behaviour for a `$` path query. Extend this helper if a
 * later component needs more.
 * <br/>
 * Where the two real stores differ, this one behaves like the stricter. `deleteValue` removes a value and never a
 * JSON document, as on D1, whose `/v1/values/delete` reaches `state_values` alone: code that needs to delete what it
 * stored must store a value, and a test against this store fails if it does not. Documents live in `storage`, values in
 * `values`, each value as `{ value, expiration }` with the expiry in seconds as it was given.
 */

function clone( value ) {
    return value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );
}

class InMemoryCache {
    constructor() {
        this.storage = {};
        this.values = {};
        // The clock the expiries are measured against; a test can replace it.
        this.now = () => Date.now();
    }

    get isOperational() {
        return true;
    }

    // The instance lifecycle: `ServiceInstance#onStart` initializes the cache and `#stop` shuts it down, so a test
    // that starts a real server needs both.
    initialize() {
        return Promise.resolve();
    }

    shutDown() {
        return Promise.resolve();
    }

    setJSON( key, value /*, path = "$", overrideMode = 0 */ ) {
        this.storage[ key ] = clone( value );
        return Promise.resolve();
    }

    getJSON( key /*, path = "$" */ ) {
        if ( !Object.prototype.hasOwnProperty.call( this.storage, key ) ) return Promise.resolve( null );
        // RedisJSON returns a `$`-path query result inside an array wrapper.
        return Promise.resolve( [ clone( this.storage[ key ] ) ] );
    }

    setValue( key, value, expiration ) {
        // As both real stores do: a falsy value is not written.
        if ( value ) {
            this.values[ key ] = { value: clone( value ), expiration: expiration, expiresAt: expiration ? this.now() + expiration * 1000 : null };
        }
        return Promise.resolve( value );
    }

    getValue( key ) {
        const entry = this.#liveValue( key );
        // `undefined` for an absent key, as both real stores answer.
        return Promise.resolve( entry ? clone( entry.value ) : undefined );
    }

    deleteValue( key ) {
        const existed = this.#liveValue( key ) !== null;
        delete this.values[ key ];
        return Promise.resolve( existed ? 1 : 0 );
    }

    matchKeys( pattern ) {
        // Translate a Redis glob (only `*` is used by the store) into a regex.
        const escaped = pattern.replace( /[.+?^${}()|[\]\\]/g, "\\$&" ).replace( /\*/g, ".*" );
        const re = new RegExp( "^" + escaped + "$" );
        const live = Object.keys( this.values ).filter( ( k ) => this.#liveValue( k ) !== null );
        return Promise.resolve( [ ...Object.keys( this.storage ), ...live ].filter( ( k ) => re.test( k ) ) );
    }

    #liveValue( key ) {
        if ( !Object.prototype.hasOwnProperty.call( this.values, key ) ) return null;
        const entry = this.values[ key ];
        if ( entry.expiresAt !== null && entry.expiresAt <= this.now() ) {
            delete this.values[ key ];
            return null;
        }
        return entry;
    }
}

/**
 * Installs an `InMemoryCache` instance in place of the real `cache.instance` for the duration of a test process.
 * Returns the stub so tests can introspect/clear it directly. Idempotent — replaces the stub with a fresh one.
 */
function installInMemoryCache() {
    const cache = require( "@ti-engine/core/cache" );
    const stub = new InMemoryCache();
    Object.defineProperty( cache, "instance", {
        value: stub,
        configurable: true,
        writable: true,
        enumerable: true
    } );
    return stub;
}

module.exports = { InMemoryCache, installInMemoryCache };
