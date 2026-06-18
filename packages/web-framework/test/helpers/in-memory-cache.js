/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Minimal in-memory stand-in for `@ti-engine/core/cache`'s Redis(JSON)-backed store, sufficient for the access
 * patterns the web-framework `ConfigStore` exercises: whole-document `getJSON`/`setJSON` at the `$` root,
 * key-pattern listing via `matchKeys`, and `deleteValue`. `getJSON` returns results inside an array wrapper to
 * match RedisJSON's behaviour for a `$` path query. Extend this helper if a later component needs more.
 */

function clone( value ) {
    return value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );
}

class InMemoryCache {
    constructor() {
        this.storage = {};
    }

    get isOperational() {
        return true;
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

    deleteValue( key ) {
        const existed = Object.prototype.hasOwnProperty.call( this.storage, key );
        delete this.storage[ key ];
        return Promise.resolve( existed ? 1 : 0 );
    }

    matchKeys( pattern ) {
        // Translate a Redis glob (only `*` is used by the store) into a regex.
        const escaped = pattern.replace( /[.+?^${}()|[\]\\]/g, "\\$&" ).replace( /\*/g, ".*" );
        const re = new RegExp( "^" + escaped + "$" );
        return Promise.resolve( Object.keys( this.storage ).filter( ( k ) => re.test( k ) ) );
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
