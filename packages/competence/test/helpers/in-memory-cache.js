/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Minimal in-memory stand-in for `@ti-engine/core/cache`'s Redis-backed JSON store, sufficient for the
 * `DataManager` and `CompetenceFramework` access patterns the test suites exercise. Supports the subset of JSON
 * paths used in production: `$` (root), a single key (e.g. `"1"` or `"2026-H2"`), and a path array
 * (`[cycleID, managerID]`). Wildcard paths like `*.uuid` are NOT supported because the Phase 2 suites do not need
 * them — extend this helper if a later phase introduces a new access pattern.
 *
 * `setJSON` honors `path` and `overrideMode` (NX/XX), matching RedisJSON `JSON.SET` semantics at a subpath: NX
 * writes only when the target path is currently absent (including the root-path case), XX only when it is already
 * present. This is what lets `DataManager.saveConsentDecision`'s NX text-registration write (CA-93) behave the same
 * way here as it does against real Redis.
 */

const cache = require( "@ti-engine/core/cache" );

function deepClone( value ) {
    return value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );
}

function isUnsafePropertyName( name ) {
    return name === "__proto__" || name === "constructor" || name === "prototype";
}

function deepMerge( target, source ) {
    for ( const [ k, v ] of Object.entries( source ) ) {
        // Skip prototype-polluting keys — a `__proto__`/`constructor`/`prototype` key would otherwise walk into and
        // corrupt Object.prototype for the whole process (CWE-1321). Inline literals at the sink, NOT the
        // isUnsafePropertyName helper: CodeQL does not recognize interprocedural sanitizers (CA-91 / 3.13.2), and
        // refactoring this to the helper is what reopened the alert once already.
        if ( k === "__proto__" || k === "constructor" || k === "prototype" ) continue;
        if ( v && typeof v === "object" && !Array.isArray( v ) && target[ k ] && typeof target[ k ] === "object" && !Array.isArray( target[ k ] ) ) {
            deepMerge( target[ k ], v );
        } else if ( v && typeof v === "object" && !Array.isArray( v ) ) {
            target[ k ] = Object.create( null );
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
    for ( let i = 0; i < parts.length; i++ ) {
        const part = parts[ i ];
        if ( part === "__proto__" || part === "constructor" || part === "prototype" ) return undefined;
        // Wildcard segment (e.g. `*.<evaluationID>`): search every value of the current object for the remaining
        // path and return the first match — matching Redis-JSON `$.*.<key>` semantics as used by fetchEvaluation.
        if ( part === "*" ) {
            if ( !cursor || typeof cursor !== "object" ) return undefined;
            const rest = parts.slice( i + 1 );
            for ( const value of Object.values( cursor ) ) {
                const found = resolvePath( value, rest.length ? rest : "$" );
                if ( found !== undefined ) return found;
            }
            return undefined;
        }
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
        this.storage = Object.create( null );
    }

    get isOperational() {
        return true;
    }

    setJSON( key, value, path = "$", overrideMode = 0 ) {
        if ( isUnsafePropertyName( key ) ) {
            return Promise.reject( new Error( `in-memory-cache setJSON: unsafe key "${ key }"` ) );
        }
        const rootExists = Object.prototype.hasOwnProperty.call( this.storage, key );
        // Root write ($): NX only fires if the key itself is absent, XX only if it is already present -- mirrors
        // RedisJSON JSON.SET's NX/XX semantics at the root path.
        if ( path === undefined || path === null || path === "$" ) {
            if ( ( overrideMode === 1 && rootExists ) || ( overrideMode === 2 && !rootExists ) ) {
                return Promise.resolve();
            }
            this.storage[ key ] = deepClone( value );
            return Promise.resolve();
        }

        // Subpath write: resolve the parent via the same traversal resolvePath() uses (no auto-vivification --
        // RedisJSON's JSON.SET rejects a write whose parent path does not already exist, so this helper does not
        // create intermediate structure the real store wouldn't).
        const parts = Array.isArray( path ) ? path : String( path ).split( "." );
        // Reject a prototype-polluting path segment outright, adjacent to the walk/assignment below, rather than
        // skipping it silently -- a test helper hitting `__proto__`/`constructor`/`prototype` here is a test bug to
        // surface loudly, not a case to tolerate (CWE-1321 / CodeQL js/prototype-polluting-assignment). The literals
        // are INLINE at the sink deliberately: CodeQL does not recognize interprocedural sanitizers (the CA-91
        // lesson, see the 3.13.2 changelog), so routing this through isUnsafePropertyName would leave the alert
        // open even though the behaviour is identical.
        for ( const part of parts ) {
            if ( part === "*" ) {
                return Promise.reject( new Error( `in-memory-cache setJSON: wildcard path segment is not supported for writes` ) );
            }
            if ( part === "__proto__" || part === "constructor" || part === "prototype" ) {
                return Promise.reject( new Error( `in-memory-cache setJSON: unsafe path segment '${ part }' for key "${ key }" (path ${ JSON.stringify( path ) })` ) );
            }
        }
        const leaf = parts[ parts.length - 1 ];
        if ( isUnsafePropertyName( leaf ) ) {
            return Promise.reject( new Error( `in-memory-cache setJSON: unsafe path leaf "${ leaf }"` ) );
        }
        const parentPath = parts.slice( 0, -1 );
        const parent = parentPath.length ? resolvePath( this.storage[ key ], parentPath ) : this.storage[ key ];
        if ( !parent || typeof parent !== "object" ) {
            return Promise.reject( new Error( `in-memory-cache setJSON: parent path does not exist for key "${ key }" (path ${ JSON.stringify( path ) })` ) );
        }
        if ( parent === Object.prototype || parent === Function.prototype ) {
            return Promise.reject( new Error( `in-memory-cache setJSON: unsafe parent object for key "${ key }" (path ${ JSON.stringify( path ) })` ) );
        }
        const leafExists = Object.prototype.hasOwnProperty.call( parent, leaf );
        if ( ( overrideMode === 1 && leafExists ) || ( overrideMode === 2 && !leafExists ) ) {
            return Promise.resolve();
        }
        parent[ leaf ] = deepClone( value );
        return Promise.resolve();
    }

    editJSON( key, update ) {
        if ( isUnsafePropertyName( key ) ) {
            return Promise.reject( new Error( `in-memory-cache editJSON: unsafe key "${ key }"` ) );
        }
        if ( !this.storage[ key ] || typeof this.storage[ key ] !== "object" ) {
            this.storage[ key ] = Object.create( null );
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
