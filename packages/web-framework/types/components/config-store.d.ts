export = ConfigStore;
declare const _exported: Readonly<ConfigStore>;
export { _exported as instance };
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
declare class ConfigStore {
    #private;
    /**
     * Returns the current envelope `{ value, version, updatedAt, updatedBy, changeSetID }` for a configuration
     * document, or `null` if it has never been written.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<Object|null>}
     * @public
     */
    getCurrent(configKey: string): Promise<Object | null>;
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
    seedIfEmpty(configKey: string, defaultValue: Object): Promise<Object>;
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
    saveChangeSet(edits: Array<{
        configKey: string;
        value: Object;
        expectedVersion: number;
    }>, meta: {
        adminID: string;
        note?: string;
    }): Promise<{
        changeSetID: string;
        versions: Record<string, number>;
    }>;
    /**
     * Returns all history entries for a document, ascending by version.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<Array<Object>>}
     * @public
     */
    listHistory(configKey: string): Promise<Array<Object>>;
    /**
     * Returns a single history snapshot entry for a document version, or `null`.
     *
     * @method
     * @param {string} configKey
     * @param {number} version
     * @returns {Promise<Object|null>}
     * @public
     */
    getVersion(configKey: string, version: number): Promise<Object | null>;
    /**
     * Returns a change-set record by id, or `null`.
     *
     * @method
     * @param {string} changeSetID
     * @returns {Promise<Object|null>}
     * @public
     */
    getChangeSet(changeSetID: string): Promise<Object | null>;
    /**
     * Returns every change-set record, most-recent first (the cross-document audit feed).
     *
     * @method
     * @returns {Promise<Array<Object>>}
     * @public
     */
    listChangeSets(): Promise<Array<Object>>;
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
    restoreChangeSet(changeSetID: string, meta: {
        adminID: string;
        note?: string;
    }): Promise<{
        changeSetID: string;
        versions: Record<string, number>;
    }>;
    /**
     * Reads a whole JSON document at the `$` root and unwraps RedisJSON's array result.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Object|null>}
     * @private
     */
    private #readJSON;
    /**
     * @method
     * @param {string} key
     * @param {Object} value
     * @returns {Promise}
     * @private
     */
    private #writeJSON;
}
