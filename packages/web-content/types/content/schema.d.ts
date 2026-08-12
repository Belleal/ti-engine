declare const _exports: {
    CONTENT_TYPES: string[];
    RELEASE_STATES: string[];
    SECTION_TYPES: string[];
    VISIBILITY_PATTERN: string;
    validateRecord: typeof validateRecord;
    validateCapture: typeof validateCapture;
};
export = _exports;
/**
 * Validates a content record against its type schema (envelope + type-specific).
 *
 * @param {Object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
declare function validateRecord(record: Object): {
    valid: boolean;
    errors: string[];
};
/**
 * Validates an email-capture record (preorder / newsletter / beta signup).
 *
 * @param {Object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
declare function validateCapture(record: Object): {
    valid: boolean;
    errors: string[];
};
