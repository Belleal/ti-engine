/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * Orchestrates validated, versioned configuration edits on top of {@link ConfigStore} and {@link ConfigRegistry}.
 *
 * Two layers:
 *  - **Document level** — {@link ConfigService#applyEdits}: validate every affected document (schema + semantic,
 *    with a cross-document context that sees the *pending* values of the same edit) and, only if all pass, commit
 *    them as one change-set. Validation failures return `{ ok:false, errors }` and write nothing; a version
 *    conflict from the store surfaces as a rejection.
 *  - **Entity level** — composite editors registered with `compose(docs)→view` / `decompose(edited, docs)→{key:value}`,
 *    so the UI edits a domain entity (e.g. a "competency") that is projected from, and scattered back into, several
 *    documents. {@link ConfigService#saveEditorEdit} decomposes the edit and routes it through `applyEdits`.
 *
 * @class ConfigService
 * @public
 */
class ConfigService {

    #store;
    #registry;
    #notifier;
    #editors = new Map();

    /**
     * @constructor
     * @param {Object} [options]
     * @param {ConfigStore} [options.store] Defaults to the ConfigStore singleton.
     * @param {ConfigRegistry} [options.registry] Defaults to the ConfigRegistry singleton.
     * @param {ConfigChangeNotifier} [options.notifier] Defaults to the ConfigChangeNotifier singleton.
     */
    constructor( options = {} ) {
        this.#store = options.store || require( "#config-store" ).instance;
        this.#registry = options.registry || require( "#config-registry" ).instance;
        this.#notifier = options.notifier || require( "#config-change-notifier" ).instance;
    }

    /* Public interface — document level */

    /**
     * Validates and commits a set of document edits atomically. Each edit: `{ configKey, value, expectedVersion }`.
     *
     * @method
     * @param {Array<{configKey: string, value: Object, expectedVersion: number}>} edits
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<{ok: true, changeSetID: string, versions: Object<string, number>} | {ok: false, errors: Object<string, Array>}>}
     * @public
     */
    applyEdits( edits, meta ) {
        if ( !Array.isArray( edits ) || edits.length === 0 || !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-apply-input" } ) );
        }

        // Cross-document validation context: a document being edited is seen at its *pending* value; others are read
        // from the store. This lets a validator on one document check against the post-edit state of its siblings.
        const pending = {};
        for ( const edit of edits ) {
            pending[ edit.configKey ] = edit.value;
        }
        const context = {
            getConfig: ( key ) => {
                if ( Object.prototype.hasOwnProperty.call( pending, key ) ) {
                    return Promise.resolve( clone( pending[ key ] ) );
                }
                return this.#store.getCurrent( key ).then( ( current ) => ( current ? current.value : null ) );
            }
        };

        return Promise.all( edits.map( ( edit ) => {
            return this.#registry.validate( edit.configKey, edit.value, context ).then( ( result ) => ( { configKey: edit.configKey, valid: result.valid, errors: result.errors } ) );
        } ) ).then( ( results ) => {
            const errorsByKey = {};
            for ( const result of results ) {
                if ( !result.valid ) {
                    errorsByKey[ result.configKey ] = result.errors;
                }
            }
            if ( Object.keys( errorsByKey ).length > 0 ) {
                return { ok: false, errors: errorsByKey };
            }
            return this.#store.saveChangeSet( edits, meta ).then( ( saved ) => {
                this.#notifier.publish( { changeSetID: saved.changeSetID, configKeys: Object.keys( saved.versions ), adminID: meta.adminID, timestamp: new Date().toISOString() } );
                return { ok: true, changeSetID: saved.changeSetID, versions: saved.versions };
            } );
        } );
    }

    /* Public interface — entity level (composite editors) */

    /**
     * Registers a composite editor over one or more documents.
     *
     * @method
     * @param {string} editorKey
     * @param {Object} definition
     * @param {string[]} definition.documents The configKeys this editor spans.
     * @param {function(Object): *} definition.compose Maps `{ [configKey]: value }` → a view for the UI.
     * @param {function(*, Object): Object<string, Object>} definition.decompose Maps `(editedView, currentDocs)` → the
     *        full new values for the documents that changed (`{ [configKey]: newValue }`).
     * @param {Object} [definition.metadata]
     * @returns {ConfigService} this (chainable)
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS}
     * @public
     */
    registerEditor( editorKey, definition ) {
        const { documents, compose, decompose, metadata = {} } = definition || {};
        if ( !editorKey || !Array.isArray( documents ) || documents.length === 0 || typeof compose !== "function" || typeof decompose !== "function" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-editor-registration", editorKey: editorKey } );
        }
        this.#editors.set( editorKey, { documents: documents.slice(), compose: compose, decompose: decompose, metadata: metadata || {} } );
        return this;
    }

    /**
     * @method
     * @param {string} editorKey
     * @returns {boolean}
     * @public
     */
    hasEditor( editorKey ) {
        return this.#editors.has( editorKey );
    }

    /**
     * @method
     * @returns {string[]}
     * @public
     */
    listEditors() {
        return Array.from( this.#editors.keys() );
    }

    /**
     * Loads the editor's documents and composes them into a view. Returns the view plus the current per-document
     * versions, which the client must echo back on save for optimistic locking.
     *
     * @method
     * @param {string} editorKey
     * @returns {Promise<{rows: *, versions: Object<string, number>}>}
     * @public
     */
    composeView( editorKey ) {
        const editor = this.#editors.get( editorKey );
        if ( !editor ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-editor", editorKey: editorKey } ) );
        }
        return this.#loadDocuments( editor.documents ).then( ( { docs, versions } ) => ( { rows: editor.compose( clone( docs ) ), versions: versions } ) );
    }

    /**
     * Applies an edit made against a composite editor: decompose the edited view into per-document new values, then
     * route through {@link ConfigService#applyEdits} (validate-all → atomic change-set). `expectedVersions` should be
     * the versions returned by {@link ConfigService#composeView} when the edit started.
     *
     * @method
     * @param {string} editorKey
     * @param {*} editedView
     * @param {Object} meta
     * @param {Object<string, number>} [expectedVersions]
     * @returns {Promise<Object>} The {@link ConfigService#applyEdits} result (or `{ ok:true, changeSetID:null }` if nothing changed).
     * @public
     */
    saveEditorEdit( editorKey, editedView, meta, expectedVersions = {} ) {
        const editor = this.#editors.get( editorKey );
        if ( !editor ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-editor", editorKey: editorKey } ) );
        }
        return this.#loadDocuments( editor.documents ).then( ( { docs, versions } ) => {
            const newValues = editor.decompose( editedView, clone( docs ) ) || {};
            const edits = Object.keys( newValues ).map( ( key ) => ( {
                configKey: key,
                value: newValues[ key ],
                expectedVersion: ( expectedVersions && expectedVersions[ key ] != null ) ? expectedVersions[ key ] : versions[ key ]
            } ) );
            if ( edits.length === 0 ) {
                return { ok: true, changeSetID: null, versions: {} };
            }
            return this.applyEdits( edits, meta );
        } );
    }

    /* Public interface — audit, history, and restore */

    /**
     * Restores a prior change-set through the validated path: rebuild edits from the change-set's historic snapshots
     * and route them through {@link ConfigService#applyEdits} — so the restore is **re-validated against the current
     * schemas/validators** (a snapshot valid when written may be invalid now) and emits `config:changed`. Returns the
     * `applyEdits` result (`{ ok:false, errors }` if a snapshot no longer validates; nothing is written then).
     *
     * @method
     * @param {string} changeSetID
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<Object>}
     * @public
     */
    restoreChangeSet( changeSetID, meta ) {
        if ( !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-restore-input" } ) );
        }
        return this.#store.getChangeSet( changeSetID ).then( ( record ) => {
            if ( !record ) {
                throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-changeset", changeSetID: changeSetID } );
            }
            return Promise.all( record.documents.map( ( doc ) => {
                return Promise.all( [ this.#store.getVersion( doc.configKey, doc.version ), this.#store.getCurrent( doc.configKey ) ] ).then( ( [ historic, current ] ) => ( {
                    configKey: doc.configKey,
                    value: historic ? historic.snapshot : null,
                    expectedVersion: current ? current.version : 0
                } ) );
            } ) ).then( ( edits ) => this.applyEdits( edits, { adminID: meta.adminID, note: meta.note || ( "restored from change-set " + changeSetID ) } ) );
        } );
    }

    /**
     * @method
     * @param {string} configKey
     * @returns {Promise<Object|null>} The current envelope for a configuration document.
     * @public
     */
    getCurrent( configKey ) {
        return this.#store.getCurrent( configKey );
    }

    /**
     * @method
     * @param {string} configKey
     * @returns {Promise<Array<Object>>} The document's version history (ascending), each a full snapshot entry.
     * @public
     */
    getHistory( configKey ) {
        return this.#store.listHistory( configKey );
    }

    /**
     * @method
     * @param {string} changeSetID
     * @returns {Promise<Object|null>} A single change-set record.
     * @public
     */
    getChange( changeSetID ) {
        return this.#store.getChangeSet( changeSetID );
    }

    /**
     * @method
     * @returns {Promise<Array<Object>>} The cross-document audit feed (change-sets, most-recent first).
     * @public
     */
    listChanges() {
        return this.#store.listChangeSets();
    }

    /* Private interface */

    /**
     * @method
     * @param {string[]} keys
     * @returns {Promise<{docs: Object<string, Object>, versions: Object<string, number>}>}
     * @private
     */
    #loadDocuments( keys ) {
        return Promise.all( keys.map( ( key ) => this.#store.getCurrent( key ) ) ).then( ( currents ) => {
            const docs = {};
            const versions = {};
            keys.forEach( ( key, index ) => {
                docs[ key ] = currents[ index ] ? currents[ index ].value : null;
                versions[ key ] = currents[ index ] ? currents[ index ].version : 0;
            } );
            return { docs: docs, versions: versions };
        } );
    }

}

function clone( value ) {
    return value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );
}

const instance = new ConfigService();
module.exports = ConfigService;
module.exports.instance = instance;
