export = ConfigService;
import type ConfigChangeNotifier from "#config-change-notifier";
import type ConfigRegistry from "#config-registry";
import type ConfigStore from "#config-store";
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
declare class ConfigService {
    #private;
    /**
     * @constructor
     * @param {Object} [options]
     * @param {ConfigStore} [options.store] Defaults to the ConfigStore singleton.
     * @param {ConfigRegistry} [options.registry] Defaults to the ConfigRegistry singleton.
     * @param {ConfigChangeNotifier} [options.notifier] Defaults to the ConfigChangeNotifier singleton.
     */
    constructor(options?: {
        store?: ConfigStore;
        registry?: ConfigRegistry;
        notifier?: ConfigChangeNotifier;
    });
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
    applyEdits(edits: Array<{
        configKey: string;
        value: Object;
        expectedVersion: number;
    }>, meta: {
        adminID: string;
        note?: string;
    }): Promise<{
        ok: true;
        changeSetID: string;
        versions: Record<string, number>;
    } | {
        ok: false;
        errors: Record<string, any[]>;
    }>;
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
    registerEditor(editorKey: string, definition: {
        documents: string[];
        compose: (configs: Object) => any;
        decompose: (editedView: any, currentDocs: Object) => Record<string, Object>;
        metadata?: Object;
    }): ConfigService;
    /**
     * @method
     * @param {string} editorKey
     * @returns {boolean}
     * @public
     */
    hasEditor(editorKey: string): boolean;
    /**
     * @method
     * @returns {string[]}
     * @public
     */
    listEditors(): string[];
    /**
     * Loads the editor's documents and composes them into a view. Returns the view plus the current per-document
     * versions, which the client must echo back on save for optimistic locking.
     *
     * @method
     * @param {string} editorKey
     * @returns {Promise<{rows: *, versions: Object<string, number>}>}
     * @public
     */
    composeView(editorKey: string): Promise<{
        rows: any;
        versions: Record<string, number>;
    }>;
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
    saveEditorEdit(editorKey: string, editedView: any, meta: Object, expectedVersions?: Record<string, number>): Promise<Object>;
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
    restoreChangeSet(changeSetID: string, meta: {
        adminID: string;
        note?: string;
    }): Promise<Object>;
    /**
     * @method
     * @param {string} configKey
     * @returns {Promise<Object|null>} The current envelope for a configuration document.
     * @public
     */
    getCurrent(configKey: string): Promise<Object | null>;
    /**
     * @method
     * @param {string} configKey
     * @returns {Promise<Array<Object>>} The document's version history (ascending), each a full snapshot entry.
     * @public
     */
    getHistory(configKey: string): Promise<Array<Object>>;
    /**
     * @method
     * @param {string} changeSetID
     * @returns {Promise<Object|null>} A single change-set record.
     * @public
     */
    getChange(changeSetID: string): Promise<Object | null>;
    /**
     * @method
     * @returns {Promise<Array<Object>>} The cross-document audit feed (change-sets, most-recent first).
     * @public
     */
    listChanges(): Promise<Array<Object>>;
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
    exportBundle(meta?: {
        adminID?: string;
    }): Promise<{
        exportedAt: string;
        exportedBy: (string | null);
        documents: Array<{
            configKey: string;
            path: (string | null);
            version: number;
            value: Object;
        }>;
    }>;
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
    seedDefault(configKey: string, defaultValue: Object): Promise<Object>;
    /**
     * Subscribes a listener to `config:changed` events (delegates to the change notifier). Returns an unsubscribe fn.
     *
     * @method
     * @param {(configs: Object) => void} listener
     * @returns {() => void}
     * @public
     */
    onConfigChanged(listener: (configs: Object) => void): () => void;
}
declare namespace ConfigService {
    export { instance };
}
declare const instance: ConfigService;
