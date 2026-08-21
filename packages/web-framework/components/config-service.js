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

const exceptions = require( "@ti-engine/core/exceptions" );
const configDrift = require( "#config-drift" );

/** @import ConfigChangeNotifier from "#config-change-notifier" */
/** @import ConfigRegistry from "#config-registry" */
/** @import ConfigStore from "#config-store" */

/**
 * Orchestrates validated, versioned configuration edits on top of {@link ConfigStore} and {@link ConfigRegistry}.
 *
 * Two layers:
 *  - **Document level** — {@link ConfigService#applyEdits}: validate every affected document (schema + semantic,
 *    with a cross-document {@link ValidatorContext} whose `getConfig` sees the *pending* values of the same edit —
 *    letting a validator check a sibling document's post-edit state — while `getStoredConfig` always returns the
 *    committed value, even for the document currently under validation) and, only if all pass, commit them as one
 *    change-set. Validation failures return `{ ok:false, errors }` and write nothing; a version conflict from the
 *    store surfaces as a rejection.
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

        // Cross-document validation context: a document being edited is seen at its *pending* value via getConfig —
        // even when that document is the one currently under validation, so calling getConfig on "yourself" just
        // hands back the same incoming value already passed as the validator's first argument, not its prior state.
        // This lets a validator on one document check against the post-edit state of its siblings. getStoredConfig
        // is the counterpart: it always resolves the committed value, so a validator that must compare its own
        // document against its previous state (e.g. detecting an edit that should have bumped a version marker)
        // uses that instead.
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
            },
            // Always the committed value, even for a document inside this edit batch. A validator comparing its own
            // document against its previous state must use this; getConfig would hand back the pending value it is
            // currently validating.
            getStoredConfig: ( key ) => this.#store.getCurrent( key ).then( ( current ) => ( current ? current.value : null ) )
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
     * @param {(configs: Object) => *} definition.compose Maps `{ [configKey]: value }` → a view for the UI.
     * @param {(editedView: *, currentDocs: Object) => Object.<string, Object>} definition.decompose Maps `(editedView, currentDocs)` → the
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

    /**
     * Builds a downloadable snapshot of the current live configuration — for every registered document, its repo file
     * `path` (from registration metadata, if provided), current `version`, and `value`. This is the one-way export
     * *out* of the store; an admin downloads it and commits the files to git. The store remains the live truth.
     *
     * @method
     * @param {Object} [meta]
     * @param {string} [meta.adminID]
     * @returns {Promise<{exportedAt: string, exportedBy: (string|null), documents: Array<{configKey: string, path: (string|null), version: number, value: Object}>}>}
     * @public
     */
    exportBundle( meta = {} ) {
        const keys = this.#registry.list();
        return Promise.all( keys.map( ( configKey ) => {
            return this.#store.getCurrent( configKey ).then( ( current ) => {
                const metadata = this.#registry.metadataFor( configKey ) || {};
                return {
                    configKey: configKey,
                    path: metadata.path || null,
                    version: current ? current.version : 0,
                    value: current ? current.value : null
                };
            } );
        } ) ).then( ( documents ) => ( {
            exportedAt: new Date().toISOString(),
            exportedBy: meta.adminID || null,
            documents: documents
        } ) );
    }

    /* Public interface — drift against file defaults */

    /**
     * Compares a document's registered file default against the value currently in the store. This is how a
     * configuration change shipped in a release becomes visible on a deployment that was seeded before it — the
     * store seeds only once, so a later file change is otherwise invisible.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<{configKey: string, status: string, counts: Object, entries: Array, storedVersion: number, editable: boolean, driftTracked: boolean, label: string}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the document is not registered.
     * @public
     */
    getDrift( configKey ) {
        if ( !this.#registry.has( configKey ) ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-config", configKey: configKey } ) );
        }
        const metadata = this.#registry.metadataFor( configKey ) || {};
        return this.#store.getCurrent( configKey ).then( ( current ) => {
            const diff = configDrift.diffDocument( this.#registry.getDefault( configKey ), current ? current.value : null );
            return {
                configKey: configKey,
                status: diff.status,
                counts: diff.counts,
                entries: diff.entries,
                storedVersion: current ? current.version : 0,
                editable: metadata.editable !== false,
                driftTracked: metadata.driftTracked !== false,
                label: metadata.label || configKey
            };
        } );
    }

    /**
     * Drift summaries for every registered document. This still computes each document's full entry list internally
     * (it delegates to {@link ConfigService#getDrift} per document) — the saving is in the response shape, not the
     * computation: `entries` is omitted here to keep the payload small enough for a landing screen and a startup log,
     * where only the counts are shown.
     *
     * @method
     * @returns {Promise<Array<Object>>}
     * @public
     */
    listDrift() {
        return Promise.all( this.#registry.list().map( ( configKey ) => {
            return this.getDrift( configKey ).then( ( drift ) => ( {
                configKey: drift.configKey,
                status: drift.status,
                counts: drift.counts,
                storedVersion: drift.storedVersion,
                editable: drift.editable,
                driftTracked: drift.driftTracked,
                label: drift.label
            } ) );
        } ) );
    }

    /**
     * Applies the registered file defaults for the given documents, as a single validated change-set.
     * <br/>
     * Routing through {@link ConfigService#applyEdits} is deliberate: the application is schema- and
     * semantically validated, versioned, correlated into one change-set, added to the audit feed, and restorable —
     * and, because a validator sees its siblings at their *pending* value, interdependent documents applied
     * together validate against each other rather than against the stale stored state.
     *
     * @method
     * @param {string[]} configKeys
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<{ok: true, changeSetID: string, versions: Object}|{ok: false, errors: Object}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On bad input, an unknown key, or a key with no default.
     * @public
     */
    applyDefaults( configKeys, meta ) {
        if ( !Array.isArray( configKeys ) || configKeys.length === 0 || !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-apply-defaults-input" } ) );
        }
        const keys = Array.from( new Set( configKeys ) );
        const unknown = keys.filter( ( key ) => !this.#registry.has( key ) );
        if ( unknown.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-config", configKeys: unknown } ) );
        }
        const withoutDefault = keys.filter( ( key ) => this.#registry.getDefault( key ) === undefined );
        if ( withoutDefault.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "no-default", configKeys: withoutDefault } ) );
        }

        return Promise.all( keys.map( ( key ) => this.#store.getCurrent( key ) ) ).then( ( currents ) => {
            const edits = keys.map( ( key, index ) => ( {
                configKey: key,
                value: this.#registry.getDefault( key ),
                expectedVersion: currents[ index ] ? currents[ index ].version : 0
            } ) );
            return this.applyEdits( edits, { adminID: meta.adminID, note: meta.note || "applied file defaults" } );
        } );
    }

    /**
     * Seeds a document's default value into the store only if it has never been written (idempotent bootstrap).
     * Used by an application to bring its file defaults into the store at startup before serving live config.
     *
     * @method
     * @param {string} configKey
     * @param {Object} defaultValue
     * @returns {Promise<Object>} The current envelope.
     * @public
     */
    seedDefault( configKey, defaultValue ) {
        return this.#store.seedIfEmpty( configKey, defaultValue );
    }

    /**
     * Subscribes a listener to `config:changed` events (delegates to the change notifier). Returns an unsubscribe fn.
     *
     * @method
     * @param {(configs: Object) => void} listener
     * @returns {() => void}
     * @public
     */
    onConfigChanged( listener ) {
        return this.#notifier.subscribe( listener );
    }

    /* Private interface */

    /**
     * @method
     * @param {string[]} keys
     * @returns {Promise<{docs: Object<string, Object>, versions: Object<string, number>}>}
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
ConfigService.instance = instance;
