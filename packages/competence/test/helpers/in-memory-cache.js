/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Minimal in-memory stand-in for `@ti-engine/core/cache`'s Redis-backed JSON store, sufficient for the
 * `DataManager` and `CompetenceFramework` access patterns the test suites exercise. Supports the subset of JSON
 * paths used in production: `$` (root), a single key (e.g. `"1"` or `"2026-H2"`), and a path array
 * (`[cycleID, managerID]`). Wildcard paths like `*.uuid` are NOT supported because the Phase 2 suites do not need
 * them — extend this helper if a later phase introduces a new access pattern.
 */

const cache = require( "@ti-engine/core/cache" );

function deepClone( value ) {
    return value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );
}

function deepMerge( target, source ) {
    for ( const [ k, v ] of Object.entries( source ) ) {
        if ( v && typeof v === "object" && !Array.isArray( v ) && target[ k ] && typeof target[ k ] === "object" && !Array.isArray( target[ k ] ) ) {
            deepMerge( target[ k ], v );
        } else {
            target[ k ] = deepClone( v );
        }
    }
}

function resolvePath( root, path ) {
    if ( root === undefined || root === null ) return undefined;
    if ( path === undefined || path === null || path === "$" ) return root;
    const parts = Array.isArray( path ) ? path : String( path ).split( "." );
    let cursor = root;
    for ( const part of parts ) {
        if ( cursor && typeof cursor === "object" && Object.prototype.hasOwnProperty.call( cursor, part ) ) {
            cursor = cursor[ part ];
        } else {
            return undefined;
        }
    }
    return cursor;
}

class InMemoryCache {
    constructor() {
        this.storage = {};
    }

    get isOperational() {
        return true;
    }

    setJSON( key, value /*, path, expiry */ ) {
        this.storage[ key ] = deepClone( value );
        return Promise.resolve();
    }

    editJSON( key, update ) {
        if ( !this.storage[ key ] || typeof this.storage[ key ] !== "object" ) {
            this.storage[ key ] = {};
        }
        deepMerge( this.storage[ key ], update );
        return Promise.resolve();
    }

    getJSON( key, path ) {
        const root = this.storage[ key ];
        const resolved = resolvePath( root, path );
        if ( resolved === undefined ) return Promise.resolve( null );
        // Match Redis-JSON behaviour: return single results inside an array wrapper.
        return Promise.resolve( [ deepClone( resolved ) ] );
    }
}

/**
 * Installs an `InMemoryCache` instance in place of the real `cache.instance` for the duration of a test process.
 * Returns the stub so tests can introspect/clear it directly when needed. Idempotent — calling it twice replaces
 * the stub with a fresh one.
 */
function installInMemoryCache() {
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
