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

/*
 * Content loader -- validates raw records through the schema and builds the lookup indexes the router and
 * repository consume. Pure: records in, index out. Reading sources from disk (front-matter / YAML parsing) is a
 * separate input stage layered on later; keeping the index build pure makes the deny-by-default and
 * conflict-reporting behavior fully unit-testable without touching the filesystem.
 *
 * Invalid records (schema failures -- e.g. a missing visibility) and conflicts (duplicate id/path, colliding or
 * path-shadowed aliases) are collected and returned for the caller to log; they are excluded from the served index
 * rather than throwing, so one bad record never takes the whole site down but also never silently serves.
 */

const { validateRecord } = require( "#schema" );

/**
 * @typedef {Object} ContentIndex
 * @property {Map<string, Object>} byId     Valid records keyed by id.
 * @property {Map<string, Object>} byPath   Valid records keyed by their canonical path.
 * @property {Map<string, Object>} byAlias  Records keyed by each alias (aliases shadowed by a real path removed).
 * @property {Map<string, Object[]>} byType Valid records grouped by type.
 * @property {Object[]} all                 All valid, indexed records, in registration order.
 * @property {Array<{ id: (string|null), errors: string[] }>} invalid  Records that failed schema validation.
 * @property {Array<{ kind: string, key: string, ids: string[] }>} conflicts  id / path / alias collisions.
 */

/**
 * Builds a {@link ContentIndex} from an array of raw records. Invalid or conflicting records are excluded from the
 * index and reported (never thrown); the first record wins any id/path collision.
 *
 * @param {Object[]} records
 * @returns {ContentIndex}
 */
function buildIndex( records ) {
    const byId = new Map();
    const byPath = new Map();
    const byAlias = new Map();
    const byType = new Map();
    const all = [];
    const invalid = [];
    const conflicts = [];

    const source = Array.isArray( records ) ? records : [];
    for ( const record of source ) {
        const result = validateRecord( record );
        if ( result.valid === false ) {
            invalid.push( { id: ( record && record.id ) || null, errors: result.errors } );
            continue;
        }
        if ( byId.has( record.id ) ) {
            conflicts.push( { kind: "id", key: record.id, ids: [ byId.get( record.id ).id, record.id ] } );
            continue;
        }
        if ( byPath.has( record.path ) ) {
            conflicts.push( { kind: "path", key: record.path, ids: [ byPath.get( record.path ).id, record.id ] } );
            continue;
        }
        byId.set( record.id, record );
        byPath.set( record.path, record );
        if ( byType.has( record.type ) === false ) {
            byType.set( record.type, [] );
        }
        byType.get( record.type ).push( record );
        all.push( record );
        for ( const alias of ( Array.isArray( record.aliases ) ? record.aliases : [] ) ) {
            if ( byPath.has( alias ) || byAlias.has( alias ) ) {
                conflicts.push( { kind: "alias", key: alias, ids: [ record.id ] } );
                continue;
            }
            byAlias.set( alias, record );
        }
    }

    // An alias that collides with a real path can never resolve -- the router prefers `path` -- so drop it and
    // report it rather than let it sit dead in the index. (A path registered after the alias is only known now.)
    for ( const alias of [ ...byAlias.keys() ] ) {
        if ( byPath.has( alias ) ) {
            conflicts.push( { kind: "alias-shadows-path", key: alias, ids: [ byAlias.get( alias ).id ] } );
            byAlias.delete( alias );
        }
    }

    return { byId: byId, byPath: byPath, byAlias: byAlias, byType: byType, all: all, invalid: invalid, conflicts: conflicts };
}

module.exports = {
    buildIndex: buildIndex
};
