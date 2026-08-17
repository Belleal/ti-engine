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
 * Pure structural diff between a configuration document's file default and the value currently held in the store.
 * <br/>
 * The store seeds from a file default exactly once ({@link ConfigStore#seedIfEmpty}), so a release that changes a
 * config file changes nothing an already-seeded deployment serves. This module is the detection half of the remedy:
 * it answers "how does the shipped default differ from what this deployment is running", in terms legible enough for
 * an admin to judge whether applying it is safe.
 * <br/>
 * No I/O — the caller supplies both values.
 *
 * @module config-drift
 */

const { isDeepStrictEqual } = require( "node:util" );

const STATUS_IN_SYNC = "in-sync";
const STATUS_DRIFTED = "drifted";
const STATUS_ABSENT = "absent";
const STATUS_NO_DEFAULT = "no-default";

const KIND_ADDED = "added";
const KIND_REMOVED = "removed";
const KIND_CHANGED = "changed";

/**
 * @typedef {Object} ConfigDriftEntry
 * @property {string} path Dot/bracket data path, matching the dialect used for schema validation issues.
 * @property {string} kind One of "added", "removed", "changed".
 * @property {number} [addedMembers] For a primitive array: how many members the file default adds.
 * @property {number} [removedMembers] For a primitive array: how many members the file default drops.
 */

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && !Array.isArray( value );
}

/**
 * @param {*} value
 * @returns {boolean} True for an array holding no objects (a code list, a set of flags, …).
 */
function isPrimitiveArray( value ) {
    return Array.isArray( value ) && value.every( ( item ) => item === null || typeof item !== "object" );
}

/**
 * @param {string} base
 * @param {string} key
 * @returns {string} The child path, numeric keys in bracket notation.
 */
function joinPath( base, key ) {
    return ( /^\d+$/.test( key ) ) ? `${ base }[${ key }]` : `${ base }.${ key }`;
}

/**
 * Recursive worker. Appends to `entries` in place.
 *
 * @param {*} fileValue
 * @param {*} storedValue
 * @param {string} path
 * @param {ConfigDriftEntry[]} entries
 */
function diffValue( fileValue, storedValue, path, entries ) {
    if ( isPlainObject( fileValue ) && isPlainObject( storedValue ) ) {
        const keys = new Set( [ ...Object.keys( fileValue ), ...Object.keys( storedValue ) ] );
        for ( const key of keys ) {
            const childPath = joinPath( path, key );
            const inFile = Object.prototype.hasOwnProperty.call( fileValue, key );
            const inStored = Object.prototype.hasOwnProperty.call( storedValue, key );
            if ( inFile && !inStored ) {
                entries.push( { path: childPath, kind: KIND_ADDED } );
            } else if ( !inFile && inStored ) {
                entries.push( { path: childPath, kind: KIND_REMOVED } );
            } else {
                diffValue( fileValue[ key ], storedValue[ key ], childPath, entries );
            }
        }
        return;
    }

    // A list of codes is a set, not a sequence: report which members moved, and treat a pure reorder as no change.
    // This is what turns "role-family-competencies changed" into the far more useful "QE +27 codes".
    // <br/>
    // Set semantics also mean MULTIPLICITY is ignored — `[ "A", "A" ]` and `[ "A" ]` compare as in-sync even though
    // applying would replace one with the other. That is deliberate for a list of codes, where a repeated member is
    // a data error rather than a meaningful difference, and it is unreachable for the documents shipped here: the
    // array-valued competence schemas all declare `uniqueItems`, so a duplicate cannot pass validation on save. A
    // consumer whose arrays are genuinely multisets should not model them as primitive arrays for this diff.
    if ( isPrimitiveArray( fileValue ) && isPrimitiveArray( storedValue ) ) {
        const storedMembers = new Set( storedValue );
        const fileMembers = new Set( fileValue );
        const addedMembers = fileValue.filter( ( item ) => !storedMembers.has( item ) ).length;
        const removedMembers = storedValue.filter( ( item ) => !fileMembers.has( item ) ).length;
        if ( addedMembers > 0 || removedMembers > 0 ) {
            entries.push( { path: path, kind: KIND_CHANGED, addedMembers: addedMembers, removedMembers: removedMembers } );
        }
        return;
    }

    if ( !isDeepStrictEqual( fileValue, storedValue ) ) {
        entries.push( { path: path, kind: KIND_CHANGED } );
    }
}

/**
 * Diffs a document's registered file default against its stored value.
 *
 * @method
 * @param {*} fileDefault The value registered with {@link ConfigRegistry#register}; `undefined` when none was.
 * @param {*} storedValue The value currently in the store; `null`/`undefined` when never written.
 * @returns {{status: string, entries: ConfigDriftEntry[], counts: {added: number, removed: number, changed: number}}}
 * @public
 */
module.exports.diffDocument = ( fileDefault, storedValue ) => {
    if ( fileDefault === undefined ) {
        return { status: STATUS_NO_DEFAULT, entries: [], counts: { added: 0, removed: 0, changed: 0 } };
    }
    if ( storedValue === undefined || storedValue === null ) {
        return { status: STATUS_ABSENT, entries: [], counts: { added: 0, removed: 0, changed: 0 } };
    }

    const entries = [];
    diffValue( fileDefault, storedValue, "", entries );

    const counts = { added: 0, removed: 0, changed: 0 };
    for ( const entry of entries ) {
        counts[ entry.kind ] += 1;
    }
    return { status: ( entries.length > 0 ) ? STATUS_DRIFTED : STATUS_IN_SYNC, entries: entries, counts: counts };
};
