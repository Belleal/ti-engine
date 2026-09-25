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
 * The service side of the state protocol ({@link HttpCacheProvider}'s other end, `design/state-protocol.md`), over a
 * Cloudflare D1 database.
 * <br/>
 * A container reaches it with plain HTTP to an address the Workers runtime intercepts; the handler runs in the Worker,
 * where the D1 binding exists. The container therefore composes no SQL and holds no credential: the paths below are
 * its entire vocabulary, answered with fixed statements, and anything else is a 404.
 * <br/>
 * **Partitioned documents.** A key named in the partition spec is still a document to the client — the same
 * `documents/get|set|merge` — but each of its entities is stored as its own row. An application collection kept as one
 * document is one row, which D1 caps at 2 MB (competence's evaluations reach it at roughly a hundred evaluations), and
 * every edit to one entity re-writes all of them. See `docs/superpowers/specs/2026-09-25-d1-state-service-design.md`.
 * <br/>
 * NOTE: Self-contained on purpose — no other core module, only the `Response`, `URL` and `TextEncoder` globals both
 * Workers and Node provide — so a Worker that bundles this pulls in nothing else from the package. `database` only has to look like a
 * D1 binding (`prepare().bind().first()/run()/all()` and `batch()`), which is what lets the test suite run it against
 * real SQLite through `node:sqlite`.
 *
 * @module d1-state-service
 */

/**
 * The method each path answers. A router dispatching on the path alone would accept `GET /v1/values/get`.
 *
 * @type {Map<string, string>}
 */
const ROUTES = new Map( [
    [ "/v1/health", "GET" ],
    [ "/v1/keys/match", "POST" ],
    [ "/v1/keys/expire", "POST" ],
    [ "/v1/values/set", "POST" ],
    [ "/v1/values/get", "POST" ],
    [ "/v1/values/delete", "POST" ],
    [ "/v1/hashes/set", "POST" ],
    [ "/v1/hashes/get", "POST" ],
    [ "/v1/hashes/delete", "POST" ],
    [ "/v1/documents/set", "POST" ],
    [ "/v1/documents/get", "POST" ],
    [ "/v1/documents/merge", "POST" ]
] );

/**
 * For comparing strings by their UTF-8 bytes, as SQLite's BINARY collation does (see `compareBinary`).
 *
 * @type {TextEncoder}
 */
const UTF8 = new TextEncoder();

/**
 * A request the service understood and refuses: answered with its status, never a 500.
 *
 * @class StateRequestError
 * @extends Error
 * @private
 */
class StateRequestError extends Error {

    /**
     * @constructor
     * @param {number} status
     * @param {string} message
     */
    constructor( status, message ) {
        super( message );
        this.status = status;
    }

}

/**
 * Wraps a value in the path's segments, so a nested merge-patch expresses the path without a path expression.
 * <br/>
 * For segments `[ "rec-1" ]` and value `{ email }`, this is `{ "rec-1": { email } }`. RFC 7386 merge-patch is
 * recursive and creates missing objects, so nesting reaches any depth, and SQLite's JSON path grammar — which has no
 * escape for a double quote inside a quoted label — never enters the picture.
 *
 * @method
 * @param {string[]} segments
 * @param {*} value
 * @returns {*}
 * @public
 */
function nestAtPath( segments, value ) {
    let nested = value;
    for ( let i = segments.length - 1; i >= 0; i-- ) {
        nested = { [ segments[ i ] ]: nested };
    }
    return nested;
}

/**
 * Builds a SQLite JSON path expression from literal key segments.
 * <br/>
 * Used only where a replace must reach inside a document — a merge-patch cannot replace, since it reads a null the
 * caller meant to store as "delete this key". A label is quoted, and what a quoted label does with a double quote, a
 * backslash or a control character depends on the SQLite version: on 3.45.1 a quote inside one was a bad path, and on
 * 3.51.2 a backslash starts an escape — `a\b` addressed a different key, so a read missed and `json_set` wrote a new key
 * beside the one it was aimed at, with nothing raised. Such a segment is refused, by name, rather than handed to a
 * grammar whose reading of it cannot be relied on; a merge needs no path expression and reaches any key.
 *
 * @method
 * @param {string[]} segments
 * @returns {string}
 * @throws {StateRequestError} 400 if a segment cannot be represented dependably.
 * @public
 */
function toSQLitePath( segments ) {
    const undependable = ( text ) => [ ...text ].some( ( character ) => character === "\"" || character === "\\" || character.codePointAt( 0 ) < 0x20 );
    return "$" + segments.map( ( segment ) => {
        if ( undependable( String( segment ) ) === true ) {
            throw new StateRequestError( 400, `A document path segment containing a double quote, a backslash or a control character has no dependable representation in SQLite's JSON path grammar: ${ JSON.stringify( segment ) }` );
        }
        return `."${ segment }"`;
    } ).join( "" );
}

/**
 * Translates a Redis-style key glob into a SQL LIKE pattern: `*` and `?` become `%` and `_`, and the LIKE wildcards
 * and the escape character are escaped, so a literal `%` in a key pattern matches a literal `%`. Paired with
 * `ESCAPE '\'`.
 *
 * @method
 * @param {string} pattern
 * @returns {string}
 * @public
 */
function globToLike( pattern ) {
    let translated = "";
    for ( const character of String( pattern ) ) {
        if ( character === "*" ) {
            translated += "%";
        } else if ( character === "?" ) {
            translated += "_";
        } else if ( character === "%" || character === "_" || character === "\\" ) {
            translated += "\\" + character;
        } else {
            translated += character;
        }
    }
    return translated;
}

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 * @private
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && Array.isArray( value ) === false;
}

/**
 * Whether two entity patterns could claim the same path: they overlap unless some position holds two different
 * literals.
 *
 * @param {string[]} first
 * @param {string[]} second
 * @returns {boolean}
 * @private
 */
function patternsOverlap( first, second ) {
    const common = Math.min( first.length, second.length );
    for ( let i = 0; i < common; i++ ) {
        if ( first[ i ] !== "*" && second[ i ] !== "*" && first[ i ] !== second[ i ] ) {
            return false;
        }
    }
    return true;
}

/**
 * Validates a partition spec and returns it as a map from key to entity patterns.
 * <br/>
 * A pattern is an array of segments — `"*"` for any key, or a literal — naming the depth at which one entity of the
 * document sits. Two patterns of one key must not overlap (they must differ in a literal somewhere), so that any path
 * is claimed by at most one of them.
 *
 * @method
 * @param {Object<string, string[][]>} [partitions]
 * @returns {Map<string, string[][]>}
 * @throws {TypeError} If the spec is malformed.
 * @public
 */
function normalizePartitions( partitions ) {
    const normalized = new Map();
    if ( partitions === undefined || partitions === null ) {
        return normalized;
    }
    if ( isPlainObject( partitions ) === false ) {
        throw new TypeError( "The partition spec must be an object mapping document keys to arrays of entity patterns." );
    }
    for ( const [ key, patterns ] of Object.entries( partitions ) ) {
        if ( Array.isArray( patterns ) === false || patterns.length === 0 ) {
            throw new TypeError( `The partition spec for '${ key }' must be a non-empty array of entity patterns.` );
        }
        const checked = patterns.map( ( pattern ) => {
            if ( Array.isArray( pattern ) === false || pattern.length === 0 || pattern.some( ( segment ) => typeof segment !== "string" || segment === "" ) ) {
                throw new TypeError( `An entity pattern for '${ key }' must be a non-empty array of non-empty strings: ${ JSON.stringify( pattern ) }` );
            }
            return Object.freeze( [ ...pattern ] );
        } );
        for ( let i = 0; i < checked.length; i++ ) {
            for ( let j = i + 1; j < checked.length; j++ ) {
                if ( patternsOverlap( checked[ i ], checked[ j ] ) === true ) {
                    throw new TypeError( `The entity patterns ${ JSON.stringify( checked[ i ] ) } and ${ JSON.stringify( checked[ j ] ) } for '${ key }' overlap: they must differ in a literal segment.` );
                }
            }
        }
        normalized.set( key, Object.freeze( checked ) );
    }
    return normalized;
}

/**
 * Whether a pattern agrees with a path over their common length. In the pattern `"*"` matches any segment; in the
 * path, `"*"` is a wildcard and matches only a `"*"` of the pattern.
 *
 * @param {string[]} pattern
 * @param {string[]} segments
 * @returns {boolean}
 * @private
 */
function agrees( pattern, segments ) {
    const common = Math.min( pattern.length, segments.length );
    for ( let i = 0; i < common; i++ ) {
        if ( segments[ i ] === "*" ) {
            if ( pattern[ i ] !== "*" ) {
                return false;
            }
        } else if ( pattern[ i ] !== "*" && pattern[ i ] !== segments[ i ] ) {
            return false;
        }
    }
    return true;
}

/**
 * Relates a path to a partitioned key's entity patterns.
 * <br/>
 * `above` — the path names a subtree over entities (`patterns` lists every pattern beneath it); `at` — one entity;
 * `below` — inside one entity (`inner` is the rest of the path); `outside` — nothing the spec can store.
 *
 * @method
 * @param {string[][]} patterns
 * @param {string[]} segments
 * @returns {{kind: string, patterns?: string[][], pattern?: string[], entity?: string[], inner?: string[]}}
 * @public
 */
function relate( patterns, segments ) {
    const agreeing = patterns.filter( ( pattern ) => agrees( pattern, segments ) );
    if ( agreeing.length === 0 ) {
        return { kind: "outside" };
    }
    // Non-overlapping patterns make this unique: a path as deep as a pattern that agrees with it has passed that
    // pattern's distinguishing literal, which every other pattern contradicts.
    const deep = agreeing.find( ( pattern ) => segments.length >= pattern.length );
    if ( deep !== undefined ) {
        return {
            kind: ( segments.length === deep.length ) ? "at" : "below",
            pattern: deep,
            entity: segments.slice( 0, deep.length ),
            inner: segments.slice( deep.length )
        };
    }
    return { kind: "above", patterns: agreeing };
}

/**
 * Refuses a key spelled `*` on the entity path. Stored, it would be an entity nobody can address: a read of that path
 * is a wildcard, and answers whichever entity comes first.
 *
 * @param {string[]} segments The path of the object holding the key.
 * @param {string} key
 * @throws {StateRequestError} 400 for `*`.
 * @private
 */
function refuseWildcardKey( segments, key ) {
    if ( key === "*" ) {
        throw new StateRequestError( 400, `A key spelled '*' cannot be stored on a partitioned document's entity path, where '*' reads as a wildcard: ${ JSON.stringify( [ ...segments, key ] ) }` );
    }
}

/**
 * Splits a value written at a path above the entity level into the entity rows it holds.
 * <br/>
 * An empty object leaves no row — the one way a partitioned document differs from a single one (design record §3.4).
 *
 * @method
 * @param {string[][]} patterns
 * @param {string[]} basePath
 * @param {*} value
 * @returns {Array<{segments: string[], value: *}>}
 * @throws {StateRequestError} 400 where the value does not fit the spec.
 * @public
 */
function decomposeValue( patterns, basePath, value ) {
    const rows = [];
    const walk = ( segments, node ) => {
        const relation = relate( patterns, segments );
        if ( relation.kind === "at" ) {
            rows.push( { segments: segments, value: node } );
            return;
        }
        if ( relation.kind !== "above" ) {
            throw new StateRequestError( 400, `Nothing can be stored at ${ JSON.stringify( segments ) }: no entity pattern admits it.` );
        }
        if ( isPlainObject( node ) === false ) {
            throw new StateRequestError( 400, `The value at ${ JSON.stringify( segments ) } must be an object: entities sit deeper.` );
        }
        for ( const [ key, child ] of Object.entries( node ) ) {
            refuseWildcardKey( segments, key );
            walk( [ ...segments, key ], child );
        }
    };
    walk( basePath, value );
    return rows;
}

/**
 * Splits a merge-patch, already nested at its path from the document's root, into per-entity operations.
 * <br/>
 * At an entity, `null` deletes the row and anything else is merged into it. Above one, an object recurses and `null`
 * deletes the subtree; anything else would replace a level the spec says holds entities, and is refused.
 *
 * @method
 * @param {string[][]} patterns
 * @param {Object} patch
 * @returns {Array<{op: string, segments: string[], value?: *}>} `op` is "patch", "delete" or "delete-subtree".
 * @throws {StateRequestError} 400 where the patch does not fit the spec.
 * @public
 */
function decomposePatch( patterns, patch ) {
    const operations = [];
    const walk = ( segments, node ) => {
        const relation = relate( patterns, segments );
        if ( relation.kind === "at" ) {
            operations.push( ( node === null ) ? { op: "delete", segments: segments } : { op: "patch", segments: segments, value: node } );
            return;
        }
        if ( relation.kind !== "above" ) {
            throw new StateRequestError( 400, `Nothing can be merged at ${ JSON.stringify( segments ) }: no entity pattern admits it.` );
        }
        if ( node === null ) {
            if ( segments.length === 0 ) {
                throw new StateRequestError( 400, "A merge cannot delete a partitioned document's root." );
            }
            operations.push( { op: "delete-subtree", segments: segments } );
            return;
        }
        if ( isPlainObject( node ) === false ) {
            throw new StateRequestError( 400, `The patch at ${ JSON.stringify( segments ) } must be an object or null: entities sit deeper.` );
        }
        for ( const [ key, child ] of Object.entries( node ) ) {
            refuseWildcardKey( segments, key );
            walk( [ ...segments, key ], child );
        }
    };
    walk( [], patch );
    return operations;
}

/**
 * Sets a value at a path in a tree built from null-prototype objects. Null prototypes because a key is data here: a
 * `__proto__` segment assigned with brackets onto `{}` would hit the inherited setter instead of creating a key.
 *
 * @param {Object} root
 * @param {string[]} segments
 * @param {*} value
 * @private
 */
function placeInTree( root, segments, value ) {
    let node = root;
    for ( let i = 0; i < segments.length - 1; i++ ) {
        if ( isPlainObject( node[ segments[ i ] ] ) === false ) {
            node[ segments[ i ] ] = Object.create( null );
        }
        node = node[ segments[ i ] ];
    }
    node[ segments[ segments.length - 1 ] ] = value;
}

/**
 * Walks a path inside a parsed JSON value, by object key only — the addressing the protocol's segments have.
 *
 * @param {*} value
 * @param {string[]} segments
 * @returns {*} The addressed value, or `undefined`.
 * @private
 */
function descend( value, segments ) {
    let node = value;
    for ( const segment of segments ) {
        if ( isPlainObject( node ) === false || Object.prototype.hasOwnProperty.call( node, segment ) === false ) {
            return undefined;
        }
        node = node[ segment ];
    }
    return node;
}

/**
 * The range of `path` values holding every entity row under a path, as `[ lower, upper )`.
 * <br/>
 * Every such row's path begins with the path's JSON array minus its closing bracket, plus a comma; `upper` is that
 * prefix with the comma raised to `-`, the next byte. Under SQLite's BINARY collation the half-open range holds exactly
 * the strings with that prefix, and it is a range over the primary key: measured on 3,000 rows, a `substr` comparison
 * visited all of them to answer ten, and D1 bills every row a query reads. A `LIKE` would also need `%` and `_`
 * escaped in keys.
 *
 * @param {string[]} segments At least one segment.
 * @returns {string[]} `[ lower, upper ]`.
 * @private
 */
function subtreeBounds( segments ) {
    const open = JSON.stringify( segments ).slice( 0, -1 );
    return [ open + ",", open + "-" ];
}

/**
 * Orders two strings as SQLite's BINARY collation does — by their UTF-8 bytes — so an order computed here agrees with
 * an `ORDER BY` there. JavaScript's `<` compares UTF-16 code units, which disagrees past the Basic Multilingual Plane.
 *
 * @param {string} first
 * @param {string} second
 * @returns {number}
 * @private
 */
function compareBinary( first, second ) {
    const a = UTF8.encode( first );
    const b = UTF8.encode( second );
    const common = Math.min( a.length, b.length );
    for ( let i = 0; i < common; i++ ) {
        if ( a[ i ] !== b[ i ] ) {
            return a[ i ] - b[ i ];
        }
    }
    return a.length - b.length;
}

/**
 * Builds the request handler.
 *
 * @method
 * @param {Object} database A D1 binding, or anything with the same `prepare()` / `batch()` shape.
 * @param {Object} [options]
 * @param {Function} [options.now] Returns epoch milliseconds; injectable so an expiry test can move time.
 * @param {Object<string, string[][]>} [options.partitions] The partition spec: document key → entity patterns.
 * @returns {(request: Request) => Promise<Response>} The handler: a protocol request in, its answer out.
 * @throws {TypeError} If the partition spec is malformed.
 * @public
 */
function createD1StateService( database, options = {} ) {
    const now = ( options && typeof options.now === "function" ) ? options.now : () => Date.now();
    const partitions = normalizePartitions( options && options.partitions );

    const json = ( body, status = 200 ) => new Response( JSON.stringify( body ), {
        status: status,
        headers: { "content-type": "application/json" }
    } );

    const firstValue = async ( statement, column ) => {
        const row = await statement.first();
        return ( row && row[ column ] !== undefined && row[ column ] !== null ) ? row[ column ] : null;
    };

    // D1 reports affected rows at `meta.changes`; the test adapter reports the same shape.
    const changesOf = ( result ) => ( result && result.meta && Number( result.meta.changes ) ) || 0;

    const parseDocument = ( text ) => {
        try {
            return JSON.parse( text );
        } catch {
            throw new StateRequestError( 400, "A document value must be JSON text." );
        }
    };

    const segmentsOf = ( payload ) => {
        const segments = ( payload.path === undefined || payload.path === null ) ? [] : payload.path;
        if ( Array.isArray( segments ) === false || segments.some( ( segment ) => typeof segment !== "string" ) ) {
            throw new StateRequestError( 400, "A document path must be an array of string segments." );
        }
        return segments;
    };

    /* Partitioned documents */

    const statements = {
        // The marker row, at path '[]', is what "the key exists" means: an emptied collection has no entity rows, and
        // RedisJSON still answers `{}` for its root.
        ensureMarker: ( key ) => database.prepare(
            "INSERT INTO state_partitions ( key, path, leaf, value ) VALUES ( ?1, '[]', NULL, '{}' ) ON CONFLICT ( key, path ) DO NOTHING"
        ).bind( key ),
        upsertEntity: ( key, segments, text ) => database.prepare(
            `INSERT INTO state_partitions ( key, path, leaf, value ) VALUES ( ?1, ?2, ?3, json( ?4 ) )
             ON CONFLICT ( key, path ) DO UPDATE SET value = excluded.value`
        ).bind( key, JSON.stringify( segments ), segments[ segments.length - 1 ], text ),
        insertEntityIfAbsent: ( key, segments, text ) => database.prepare(
            `INSERT INTO state_partitions ( key, path, leaf, value ) VALUES ( ?1, ?2, ?3, json( ?4 ) )
             ON CONFLICT ( key, path ) DO NOTHING`
        ).bind( key, JSON.stringify( segments ), segments[ segments.length - 1 ], text ),
        updateEntityIfPresent: ( key, segments, text ) => database.prepare(
            "UPDATE state_partitions SET value = json( ?3 ) WHERE key = ?1 AND path = ?2"
        ).bind( key, JSON.stringify( segments ), text ),
        // ONE statement per entity: RFC 7386 against the stored entity, or against `{}` for a new one - which is what
        // a merge into an absent target means. `json_patch` with a non-object patch returns the patch, so a marker
        // count or an array replaces as the RFC says.
        patchEntity: ( key, segments, text ) => database.prepare(
            `INSERT INTO state_partitions ( key, path, leaf, value ) VALUES ( ?1, ?2, ?3, json_patch( '{}', ?4 ) )
             ON CONFLICT ( key, path ) DO UPDATE SET value = json_patch( state_partitions.value, ?4 )`
        ).bind( key, JSON.stringify( segments ), segments[ segments.length - 1 ], text ),
        deleteEntity: ( key, segments ) => database.prepare(
            "DELETE FROM state_partitions WHERE key = ?1 AND path = ?2"
        ).bind( key, JSON.stringify( segments ) ),
        deleteSubtree: ( key, segments ) => ( segments.length === 0 )
            ? database.prepare( "DELETE FROM state_partitions WHERE key = ?1 AND path <> '[]'" ).bind( key )
            : database.prepare( "DELETE FROM state_partitions WHERE key = ?1 AND path >= ?2 AND path < ?3" ).bind( key, ...subtreeBounds( segments ) )
    };

    const readSubtree = async ( key, segments ) => {
        const result = ( segments.length === 0 )
            ? await database.prepare( "SELECT path, value FROM state_partitions WHERE key = ?1 AND path <> '[]' ORDER BY path" ).bind( key ).all()
            : await database.prepare( "SELECT path, value FROM state_partitions WHERE key = ?1 AND path >= ?2 AND path < ?3 ORDER BY path" ).bind( key, ...subtreeBounds( segments ) ).all();
        return ( result && result.results ) || [];
    };

    const markerExists = async ( key ) => ( await database.prepare( "SELECT 1 AS present FROM state_partitions WHERE key = ?1 AND path = '[]'" ).bind( key ).first() ) !== null;

    // Whether anything is stored under a path: one row at most, never the subtree.
    const subtreeExists = async ( key, segments ) => ( segments.length === 0 )
        ? markerExists( key )
        : ( await database.prepare( "SELECT 1 AS present FROM state_partitions WHERE key = ?1 AND path >= ?2 AND path < ?3 LIMIT 1" ).bind( key, ...subtreeBounds( segments ) ).first() ) !== null;

    const assemble = ( rows, depth ) => {
        const root = Object.create( null );
        for ( const row of rows ) {
            placeInTree( root, JSON.parse( row.path ).slice( depth ), JSON.parse( row.value ) );
        }
        return root;
    };

    const getPartitioned = async ( key, patterns, segments ) => {
        const relation = relate( patterns, segments );
        const wildcards = segments.map( ( segment, index ) => ( segment === "*" ) ? index : -1 ).filter( ( index ) => index >= 0 );
        if ( wildcards.length > 0 ) {
            // Answerable only where the spec has a `*` in the entity path: then it is an index lookup. Anything else
            // would be a scan the service does not do, and `null` would claim there was nothing to find.
            if ( relation.kind === "outside" || relation.kind === "above" ) {
                throw new StateRequestError( 400, `A wildcard can stand for an entity's key where the partition spec has one, and nowhere else: ${ JSON.stringify( segments ) }` );
            }
            if ( wildcards.some( ( index ) => index >= relation.pattern.length ) ) {
                throw new StateRequestError( 400, "A wildcard can stand for an entity's key, not for a key inside one." );
            }
        }
        if ( relation.kind === "outside" ) {
            return null;
        }

        if ( relation.kind === "above" ) {
            const rows = await readSubtree( key, segments );
            if ( rows.length === 0 ) {
                // The root of an existing collection is `{}`, as RedisJSON answers for an emptied document; any other
                // empty subtree has no row to be found by (§3.4).
                return ( segments.length === 0 && await markerExists( key ) === true ) ? "{}" : null;
            }
            return JSON.stringify( assemble( rows, segments.length ) );
        }

        let text;
        if ( wildcards.length === 0 ) {
            text = await firstValue( database.prepare( "SELECT value FROM state_partitions WHERE key = ?1 AND path = ?2" ).bind( key, JSON.stringify( relation.entity ) ), "value" );
        } else {
            // The first match in path order: what a RedisJSON wildcard read gave a caller that took `result[ 0 ]`. A
            // literal leaf is an index lookup — sorted here, because with `ORDER BY path` in the statement SQLite
            // chose the primary key instead and read every row of the key (measured). Otherwise the rows under the
            // literal segments before the first wildcard, a range read.
            const leaf = relation.entity[ relation.entity.length - 1 ];
            let rows;
            if ( leaf !== "*" ) {
                const result = await database.prepare( "SELECT path, value FROM state_partitions WHERE key = ?1 AND leaf = ?2" ).bind( key, leaf ).all();
                rows = ( ( result && result.results ) || [] ).sort( ( first, second ) => compareBinary( first.path, second.path ) );
            } else {
                rows = await readSubtree( key, relation.entity.slice( 0, relation.entity.indexOf( "*" ) ) );
            }
            const match = rows.find( ( row ) => {
                const path = JSON.parse( row.path );
                return path.length === relation.entity.length && relation.entity.every( ( segment, index ) => segment === "*" || segment === path[ index ] );
            } );
            text = match ? match.value : null;
        }
        if ( text === null ) {
            return null;
        }
        if ( relation.inner.length === 0 ) {
            return text;
        }
        const addressed = descend( JSON.parse( text ), relation.inner );
        return ( addressed === undefined ) ? null : JSON.stringify( addressed );
    };

    const setPartitioned = async ( key, patterns, segments, text, overrideMode ) => {
        const relation = relate( patterns, segments );
        if ( segments.includes( "*" ) === true ) {
            throw new StateRequestError( 400, "A wildcard cannot be written to." );
        }
        if ( relation.kind === "outside" ) {
            throw new StateRequestError( 400, `Nothing can be stored at ${ JSON.stringify( segments ) }: no entity pattern admits it.` );
        }

        if ( relation.kind === "above" ) {
            const rows = decomposeValue( patterns, segments, parseDocument( text ) );
            if ( overrideMode === 1 || overrideMode === 2 ) {
                const exists = await subtreeExists( key, segments );
                if ( ( overrideMode === 1 && exists === true ) || ( overrideMode === 2 && exists === false ) ) {
                    return { ok: true, skipped: true };
                }
            }
            await database.batch( [
                statements.ensureMarker( key ),
                statements.deleteSubtree( key, segments ),
                ...rows.map( ( row ) => statements.upsertEntity( key, row.segments, JSON.stringify( row.value ) ) )
            ] );
            return { ok: true };
        }

        if ( relation.kind === "at" ) {
            parseDocument( text );
            if ( overrideMode === 2 ) {
                const results = await database.batch( [ statements.updateEntityIfPresent( key, segments, text ) ] );
                return ( changesOf( results[ 0 ] ) === 0 ) ? { ok: true, skipped: true } : { ok: true };
            }
            const write = ( overrideMode === 1 ) ? statements.insertEntityIfAbsent( key, segments, text ) : statements.upsertEntity( key, segments, text );
            const results = await database.batch( [ statements.ensureMarker( key ), write ] );
            return ( overrideMode === 1 && changesOf( results[ 1 ] ) === 0 ) ? { ok: true, skipped: true } : { ok: true };
        }

        // Inside one entity: a replace, which only a path expression can say (see toSQLitePath). One statement, with
        // the override condition in its WHERE clause, so the test and the write cannot be separated.
        parseDocument( text );
        const entityPath = JSON.stringify( relation.entity );
        const condition = ( overrideMode === 1 ) ? " AND json_type( value, ?3 ) IS NULL" : ( overrideMode === 2 ) ? " AND json_type( value, ?3 ) IS NOT NULL" : "";
        const result = await database.prepare( `UPDATE state_partitions SET value = json_set( value, ?3, json( ?4 ) ) WHERE key = ?1 AND path = ?2${ condition }` )
            .bind( key, entityPath, toSQLitePath( relation.inner ), text ).run();
        if ( changesOf( result ) > 0 ) {
            return { ok: true };
        }
        // Nothing changed: the condition held the write back, or there is no entity to write inside. Asked only now,
        // so the write never depends on a read that another request could make stale.
        const present = await database.prepare( "SELECT 1 AS present FROM state_partitions WHERE key = ?1 AND path = ?2" ).bind( key, entityPath ).first();
        if ( present === null ) {
            throw new StateRequestError( 400, `There is no entity at ${ JSON.stringify( relation.entity ) } to write inside.` );
        }
        return { ok: true, skipped: true };
    };

    const mergePartitioned = async ( key, patterns, segments, text ) => {
        if ( segments.includes( "*" ) === true ) {
            throw new StateRequestError( 400, "A wildcard cannot be merged into." );
        }
        const operations = decomposePatch( patterns, nestAtPath( segments, parseDocument( text ) ) );
        // One batch: D1 runs it as a transaction, so a merge touching several entities lands whole or not at all, and
        // each entity's own write is a single `json_patch` statement.
        await database.batch( [
            statements.ensureMarker( key ),
            ...operations.map( ( operation ) => {
                if ( operation.op === "patch" ) {
                    return statements.patchEntity( key, operation.segments, JSON.stringify( operation.value ) );
                }
                return ( operation.op === "delete" ) ? statements.deleteEntity( key, operation.segments ) : statements.deleteSubtree( key, operation.segments );
            } )
        ] );
        return { ok: true };
    };

    /* The protocol */

    const operations = {
        "/v1/health": async () => {
            // A probe that only proved the Worker was running would report a healthy cache over an unreachable
            // database. Touching D1 is the whole point of the round trip.
            await database.prepare( "SELECT 1 AS ok" ).first();
            return json( { ok: true } );
        },

        "/v1/keys/match": async ( payload ) => {
            const like = globToLike( payload.pattern );
            const at = now();
            const result = await database.prepare(
                `SELECT key FROM state_values WHERE key LIKE ?1 ESCAPE '\\' AND ( expires_at IS NULL OR expires_at > ?2 )
                 UNION
                 SELECT key FROM state_documents WHERE key LIKE ?1 ESCAPE '\\' AND ( expires_at IS NULL OR expires_at > ?2 )
                 UNION
                 SELECT hash AS key FROM state_hash_fields WHERE hash LIKE ?1 ESCAPE '\\' AND ( expires_at IS NULL OR expires_at > ?2 )
                 UNION
                 SELECT key FROM state_partitions WHERE path = '[]' AND key LIKE ?1 ESCAPE '\\'`
            ).bind( like, at ).all();
            return json( { keys: ( ( result && result.results ) || [] ).map( ( row ) => row.key ) } );
        },

        "/v1/keys/expire": async ( payload ) => {
            if ( !payload.hash && partitions.has( payload.key ) === true ) {
                // An application collection does not expire. Ignoring the call would report success for a deadline
                // nothing will ever apply.
                throw new StateRequestError( 400, `'${ payload.key }' is a partitioned document, which does not expire.` );
            }
            const deadline = now() + ( payload.seconds * 1000 );
            if ( payload.hash ) {
                // The argument order reads backwards and is the established one: `key` is the field, `hash` the set.
                await database.prepare( "UPDATE state_hash_fields SET expires_at = ?3 WHERE hash = ?1 AND field = ?2" )
                    .bind( payload.hash, payload.key, deadline ).run();
            } else {
                // A top-level key is in one table or the other; setting both is cheaper than finding out which.
                await database.prepare( "UPDATE state_values SET expires_at = ?2 WHERE key = ?1" ).bind( payload.key, deadline ).run();
                await database.prepare( "UPDATE state_documents SET expires_at = ?2 WHERE key = ?1" ).bind( payload.key, deadline ).run();
            }
            return json( { ok: true } );
        },

        "/v1/values/set": async ( payload ) => {
            const deadline = ( payload.expiration !== undefined ) ? now() + ( payload.expiration * 1000 ) : null;
            await database.prepare(
                `INSERT INTO state_values ( key, value, expires_at ) VALUES ( ?1, ?2, ?3 )
                 ON CONFLICT ( key ) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
            ).bind( payload.key, payload.value, deadline ).run();
            return json( { ok: true } );
        },

        "/v1/values/get": async ( payload ) => {
            const value = await firstValue(
                database.prepare( "SELECT value FROM state_values WHERE key = ?1 AND ( expires_at IS NULL OR expires_at > ?2 )" ).bind( payload.key, now() ),
                "value"
            );
            return json( { value: value } );
        },

        "/v1/values/delete": async ( payload ) => {
            const result = await database.prepare( "DELETE FROM state_values WHERE key = ?1" ).bind( payload.key ).run();
            return json( { deleted: changesOf( result ) > 0 } );
        },

        "/v1/hashes/set": async ( payload ) => {
            await database.prepare(
                `INSERT INTO state_hash_fields ( hash, field, value, expires_at ) VALUES ( ?1, ?2, ?3, NULL )
                 ON CONFLICT ( hash, field ) DO UPDATE SET value = excluded.value, expires_at = NULL`
            ).bind( payload.key, payload.field, payload.value ).run();
            return json( { ok: true } );
        },

        "/v1/hashes/get": async ( payload ) => {
            const value = await firstValue(
                database.prepare( "SELECT value FROM state_hash_fields WHERE hash = ?1 AND field = ?2 AND ( expires_at IS NULL OR expires_at > ?3 )" )
                    .bind( payload.key, payload.field, now() ),
                "value"
            );
            return json( { value: value } );
        },

        "/v1/hashes/delete": async ( payload ) => {
            const result = await database.prepare( "DELETE FROM state_hash_fields WHERE hash = ?1 AND field = ?2" ).bind( payload.key, payload.field ).run();
            return json( { deleted: changesOf( result ) > 0 } );
        },

        "/v1/documents/set": async ( payload ) => {
            const segments = segmentsOf( payload );
            if ( partitions.has( payload.key ) === true ) {
                return json( await setPartitioned( payload.key, partitions.get( payload.key ), segments, payload.value, payload.overrideMode ) );
            }
            // A 400 here, as on every other path, rather than whatever SQLite says about malformed JSON as a 500.
            parseDocument( payload.value );

            if ( segments.length === 0 ) {
                // The whole document, which is how every caller in the engine uses `setJSON` today.
                if ( payload.overrideMode === 1 ) {
                    const result = await database.prepare(
                        "INSERT INTO state_documents ( key, value, expires_at ) VALUES ( ?1, json( ?2 ), NULL ) ON CONFLICT ( key ) DO NOTHING"
                    ).bind( payload.key, payload.value ).run();
                    return json( ( changesOf( result ) === 0 ) ? { ok: true, skipped: true } : { ok: true } );
                }
                if ( payload.overrideMode === 2 ) {
                    const result = await database.prepare( "UPDATE state_documents SET value = json( ?2 ) WHERE key = ?1" ).bind( payload.key, payload.value ).run();
                    return json( ( changesOf( result ) === 0 ) ? { ok: true, skipped: true } : { ok: true } );
                }
                await database.prepare(
                    `INSERT INTO state_documents ( key, value, expires_at ) VALUES ( ?1, json( ?2 ), NULL )
                     ON CONFLICT ( key ) DO UPDATE SET value = json( excluded.value )`
                ).bind( payload.key, payload.value ).run();
                return json( { ok: true } );
            }

            // A branch. The one place a path expression is unavoidable: a set REPLACES what the path addresses, and a
            // merge-patch cannot express that - it would read a null the caller meant to store as "delete this key".
            // Existence is `json_type`, which is SQL NULL only for an absent path: `json_extract` is NULL for a stored
            // JSON null too, and would let a set-if-absent overwrite one.
            const path = toSQLitePath( segments );
            const existing = await firstValue(
                database.prepare( "SELECT json_type( value, ?2 ) AS addressed FROM state_documents WHERE key = ?1" ).bind( payload.key, path ),
                "addressed"
            );
            if ( ( payload.overrideMode === 1 && existing !== null ) || ( payload.overrideMode === 2 && existing === null ) ) {
                return json( { ok: true, skipped: true } );
            }
            await database.prepare(
                `INSERT INTO state_documents ( key, value, expires_at ) VALUES ( ?1, json_set( '{}', ?2, json( ?3 ) ), NULL )
                 ON CONFLICT ( key ) DO UPDATE SET value = json_set( state_documents.value, ?2, json( ?3 ) )`
            ).bind( payload.key, path, payload.value ).run();
            return json( { ok: true } );
        },

        "/v1/documents/get": async ( payload ) => {
            const segments = segmentsOf( payload );
            if ( partitions.has( payload.key ) === true ) {
                return json( { value: await getPartitioned( payload.key, partitions.get( payload.key ), segments ) } );
            }

            const at = now();
            // `->` answers JSON text for whatever the path addresses, and SQL NULL only where there is nothing.
            // `json_extract` strips a string's quotes, and the provider parses what it gets: a stored "42" came back
            // as the number 42, and a stored "null" as absent.
            const statement = ( segments.length === 0 )
                ? database.prepare( "SELECT value AS addressed FROM state_documents WHERE key = ?1 AND ( expires_at IS NULL OR expires_at > ?2 )" ).bind( payload.key, at )
                : database.prepare( "SELECT value -> ?3 AS addressed FROM state_documents WHERE key = ?1 AND ( expires_at IS NULL OR expires_at > ?2 )" )
                    .bind( payload.key, at, toSQLitePath( segments ) );
            return json( { value: await firstValue( statement, "addressed" ) } );
        },

        "/v1/documents/merge": async ( payload ) => {
            const segments = segmentsOf( payload );
            if ( partitions.has( payload.key ) === true ) {
                return json( await mergePartitioned( payload.key, partitions.get( payload.key ), segments, payload.value ) );
            }

            // ONE statement, and no path expression in it. This is the operation `atomic-json-edit` claims: SQLite
            // applies a single statement atomically, so two records merged into one document at the same moment both
            // survive. Emulating it as a read and a write loses one of them, in silence.
            const patch = JSON.stringify( nestAtPath( segments, parseDocument( payload.value ) ) );
            await database.prepare(
                `INSERT INTO state_documents ( key, value, expires_at ) VALUES ( ?1, json_patch( '{}', ?2 ), NULL )
                 ON CONFLICT ( key ) DO UPDATE SET value = json_patch( state_documents.value, ?2 )`
            ).bind( payload.key, patch ).run();
            return json( { ok: true } );
        }
    };

    return async function handleStateRequest( request ) {
        const path = new URL( request.url ).pathname;

        if ( ROUTES.has( path ) === false ) {
            return json( { error: `no handler for '${ path }'` }, 404 );
        }
        if ( request.method !== ROUTES.get( path ) ) {
            return json( { error: `'${ path }' answers ${ ROUTES.get( path ) }, not ${ request.method }` }, 405 );
        }

        let payload = {};
        if ( request.method === "POST" ) {
            try {
                payload = await request.json();
            } catch {
                return json( { error: "the request body is not JSON" }, 400 );
            }
            if ( isPlainObject( payload ) === false ) {
                return json( { error: "the request body must be a JSON object" }, 400 );
            }
        }

        try {
            return await operations[ path ]( payload );
        } catch ( error ) {
            // The provider treats a status as an operation failure and leaves the connection up, which is right: the
            // service answered, and this one call did not work.
            return json( { error: error.message }, ( error instanceof StateRequestError ) ? error.status : 500 );
        }
    };
}

/**
 * Removes rows whose deadline has passed. Reads already hide them, so this is housekeeping rather than correctness —
 * but a session table nobody prunes grows without bound, and D1 bills by rows read. Partitioned rows never expire.
 *
 * @method
 * @param {Object} database
 * @param {Function} [now]
 * @returns {Promise<number>} How many rows were removed.
 * @public
 */
async function sweepExpired( database, now = Date.now ) {
    const at = now();
    let removed = 0;
    for ( const table of [ "state_values", "state_hash_fields", "state_documents" ] ) {
        const result = await database.prepare( `DELETE FROM ${ table } WHERE expires_at IS NOT NULL AND expires_at <= ?1` ).bind( at ).run();
        removed += ( result && result.meta && Number( result.meta.changes ) ) || 0;
    }
    return removed;
}

module.exports = {
    createD1StateService: createD1StateService,
    sweepExpired: sweepExpired,
    normalizePartitions: normalizePartitions,
    relate: relate,
    decomposeValue: decomposeValue,
    decomposePatch: decomposePatch,
    nestAtPath: nestAtPath,
    toSQLitePath: toSQLitePath,
    globToLike: globToLike
};
