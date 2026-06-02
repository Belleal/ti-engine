/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const cache = require( "@ti-engine/core/cache" );
const tools = require( "@ti-engine/core/tools" );
const exceptions = require( "@ti-engine/core/exceptions" );

const KEY_CURRENT = "ti:config:cur:";       // + configKey                  → current document envelope
const KEY_HISTORY = "ti:config:hist:";      // + configKey + ":" + version  → history snapshot entry
const KEY_CHANGESET = "ti:config:cs:";      // + changeSetID                → change-set record
const SEED_ACTOR = "system:seed";

/**
 * A versioned, change-set-aware configuration store backed by the common memory cache (RedisJSON).
 * <br/>
 * Each editable configuration is a *document* identified by a `configKey`. Every committed edit:
 *  - bumps the document's monotonic `version`,
 *  - writes a full **snapshot** to history (enabling restore),
 *  - and is correlated with the other documents written in the same logical edit via a shared **change-set** id,
 *    so a multi-document edit (and its restore) is treated as one unit even though storage is per-document.
 * <br/>
 * Optimistic locking: callers pass the `expectedVersion` they edited from; the save is rejected if any document
 * moved on in the meantime. This component is storage-only — schema/semantic validation is a separate pipeline
 * that must run *before* {@link ConfigStore#saveChangeSet}.
 * <br/>
 * NOTE: true cross-document atomicity is not provided (the cache exposes per-key commands only). All locks are
 * checked *before* any write, so the common conflict case is safe; a mid-write process failure can leave a
 * partially-applied change-set, detectable via the change-set record. Hardening (a Lua/MULTI write) is deferred.
 *
 * @class ConfigStore
 * @public
 */
class ConfigStore {

    /* Public interface */

    /**
     * Returns the current envelope `{ value, version, updatedAt, updatedBy, changeSetID }` for a configuration
     * document, or `null` if it has never been written.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<Object|null>}
     * @public
     */
    getCurrent( configKey ) {
        return this.#readJSON( KEY_CURRENT + configKey );
    }

    /**
     * Writes the default value as version 1 only if the document does not yet exist (idempotent bootstrap).
     * Resolves with the current envelope either way.
     *
     * @method
     * @param {string} configKey
     * @param {Object} defaultValue
     * @returns {Promise<Object>}
     * @public
     */
    seedIfEmpty( configKey, defaultValue ) {
        return this.getCurrent( configKey ).then( ( current ) => {
            if ( current ) return current;
            const timestamp = new Date().toISOString();
            const envelope = { value: defaultValue, version: 1, updatedAt: timestamp, updatedBy: SEED_ACTOR, changeSetID: null };
            const historyEntry = { version: 1, timestamp: timestamp, adminID: SEED_ACTOR, note: "seed from defaults", changeSetID: null, snapshot: defaultValue };
            return Promise.all( [
                this.#writeJSON( KEY_CURRENT + configKey, envelope ),
                this.#writeJSON( KEY_HISTORY + configKey + ":1", historyEntry )
            ] ).then( () => envelope );
        } );
    }

    /**
     * Commits an edit spanning one or more documents as a single change-set. All optimistic-lock checks run before
     * any write. Each edit: `{ configKey, value, expectedVersion }`.
     *
     * @method
     * @param {Array<{configKey: string, value: Object, expectedVersion: number}>} edits
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<{changeSetID: string, versions: Object<string, number>}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On bad input or a version conflict (see `details`).
     * @public
     */
    saveChangeSet( edits, meta ) {
        if ( !Array.isArray( edits ) || edits.length === 0 || !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-changeset-input" } ) );
        }
        const keys = edits.map( ( e ) => e.configKey );
        if ( new Set( keys ).size !== keys.length ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "duplicate-configKey-in-changeset" } ) );
        }

        return Promise.all( keys.map( ( key ) => this.getCurrent( key ) ) ).then( ( currents ) => {
            // Lock check across the whole set first — no writes until every document is confirmed unchanged.
            const conflicts = [];
            edits.forEach( ( edit, i ) => {
                const actual = currents[ i ] ? currents[ i ].version : 0;
                if ( edit.expectedVersion !== actual ) conflicts.push( { configKey: edit.configKey, expectedVersion: edit.expectedVersion, actualVersion: actual } );
            } );
            if ( conflicts.length ) {
                throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "version-conflict", conflicts: conflicts } );
            }

            const changeSetID = tools.getUUID();
            const timestamp = new Date().toISOString();
            const note = meta.note || "";
            const versions = {};
            const writes = [];
            edits.forEach( ( edit, i ) => {
                const newVersion = ( currents[ i ] ? currents[ i ].version : 0 ) + 1;
                versions[ edit.configKey ] = newVersion;
                const envelope = { value: edit.value, version: newVersion, updatedAt: timestamp, updatedBy: meta.adminID, changeSetID: changeSetID };
                const historyEntry = { version: newVersion, timestamp: timestamp, adminID: meta.adminID, note: note, changeSetID: changeSetID, snapshot: edit.value };
                writes.push( this.#writeJSON( KEY_CURRENT + edit.configKey, envelope ) );
                writes.push( this.#writeJSON( KEY_HISTORY + edit.configKey + ":" + newVersion, historyEntry ) );
            } );
            const changeSetRecord = {
                changeSetID: changeSetID,
                timestamp: timestamp,
                adminID: meta.adminID,
                note: note,
                documents: edits.map( ( edit ) => ( { configKey: edit.configKey, version: versions[ edit.configKey ] } ) )
            };
            writes.push( this.#writeJSON( KEY_CHANGESET + changeSetID, changeSetRecord ) );

            return Promise.all( writes ).then( () => ( { changeSetID: changeSetID, versions: versions } ) );
        } );
    }

    /**
     * Returns all history entries for a document, ascending by version.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<Array<Object>>}
     * @public
     */
    listHistory( configKey ) {
        return cache.instance.matchKeys( KEY_HISTORY + configKey + ":*" ).then( ( keys ) => {
            return Promise.all( ( keys || [] ).map( ( k ) => this.#readJSON( k ) ) );
        } ).then( ( entries ) => entries.filter( Boolean ).sort( ( a, b ) => a.version - b.version ) );
    }

    /**
     * Returns a single history snapshot entry for a document version, or `null`.
     *
     * @method
     * @param {string} configKey
     * @param {number} version
     * @returns {Promise<Object|null>}
     * @public
     */
    getVersion( configKey, version ) {
        return this.#readJSON( KEY_HISTORY + configKey + ":" + version );
    }

    /**
     * Returns a change-set record by id, or `null`.
     *
     * @method
     * @param {string} changeSetID
     * @returns {Promise<Object|null>}
     * @public
     */
    getChangeSet( changeSetID ) {
        return this.#readJSON( KEY_CHANGESET + changeSetID );
    }

    /**
     * Restores every document in a prior change-set to that change-set's snapshot, committing it as a *new*
     * change-set (restore is never destructive — it moves forward to a past state).
     *
     * @method
     * @param {string} changeSetID
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<{changeSetID: string, versions: Object<string, number>}>}
     * @public
     */
    restoreChangeSet( changeSetID, meta ) {
        if ( !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-restore-input" } ) );
        }
        return this.getChangeSet( changeSetID ).then( ( record ) => {
            if ( !record ) throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-changeset", changeSetID: changeSetID } );
            return Promise.all( record.documents.map( ( doc ) => {
                return Promise.all( [ this.getVersion( doc.configKey, doc.version ), this.getCurrent( doc.configKey ) ] ).then( ( [ historic, current ] ) => {
                    return { configKey: doc.configKey, value: historic ? historic.snapshot : null, expectedVersion: current ? current.version : 0 };
                } );
            } ) ).then( ( edits ) => {
                return this.saveChangeSet( edits, { adminID: meta.adminID, note: meta.note || ( "restored from change-set " + changeSetID ) } );
            } );
        } );
    }

    /* Private interface */

    /**
     * Reads a whole JSON document at the `$` root and unwraps RedisJSON's array result.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Object|null>}
     * @private
     */
    #readJSON( key ) {
        return cache.instance.getJSON( key ).then( ( result ) => ( Array.isArray( result ) ? ( result[ 0 ] ?? null ) : ( result ?? null ) ) );
    }

    /**
     * @method
     * @param {string} key
     * @param {Object} value
     * @returns {Promise}
     * @private
     */
    #writeJSON( key, value ) {
        return cache.instance.setJSON( key, value );
    }

}

const instance = new ConfigStore();
module.exports = ConfigStore;
module.exports.instance = Object.freeze( instance );
