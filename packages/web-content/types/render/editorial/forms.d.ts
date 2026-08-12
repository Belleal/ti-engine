declare const _exports: {
    renderCapture: typeof renderCapture;
    renderFormStatus: typeof renderFormStatus;
};
export = _exports;
/**
 * `capture` -- the email capture form. Hidden `purpose` / `edition` / `source` / `locale` inputs mirror the capture
 * schema so one endpoint serves every use.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
declare function renderCapture(section: Object, context: Object): import("../html.js").SafeString;
/**
 * A post-submit status block. Duplicate is deliberately gold rather than scarlet: a returning reader did nothing
 * wrong, and colouring it like an error tells them they did.
 *
 * @param {string} kind  success | duplicate | error
 * @param {string} [title]
 * @param {string} [body]
 * @returns {import("../html.js").SafeString}
 */
declare function renderFormStatus(kind: string, title?: string, body?: string): import("../html.js").SafeString;
