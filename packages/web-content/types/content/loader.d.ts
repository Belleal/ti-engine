declare const _exports: {
    buildIndex: typeof buildIndex;
};
export = _exports;
export type ContentIndex = {
    /**
     * Valid records keyed by id.
     */
    byId: Map<string, Object>;
    /**
     * Valid records keyed by their canonical path.
     */
    byPath: Map<string, Object>;
    /**
     * Records keyed by each alias (aliases shadowed by a real path removed).
     */
    byAlias: Map<string, Object>;
    /**
     * Valid records grouped by type.
     */
    byType: Map<string, Object[]>;
    /**
     * All valid, indexed records, in registration order.
     */
    all: Object[];
    /**
     * Records that failed schema validation.
     */
    invalid: Array<{
        id: (string | null);
        errors: string[];
    }>;
    /**
     * id / path / alias collisions.
     */
    conflicts: Array<{
        kind: string;
        key: string;
        ids: string[];
    }>;
};
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
declare function buildIndex(records: Object[]): ContentIndex;
