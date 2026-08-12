declare const _exports: {
    mountMediaRoutes: typeof mountMediaRoutes;
    normalizePrefix: typeof normalizePrefix;
    DEFAULT_MAX_AGE: string;
};
export = _exports;
/**
 * Registers the legacy media prefixes.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ root: string, prefixes: string[], maxAge?: string }} media
 * @returns {Object} The server, for chaining.
 */
declare function mountMediaRoutes(server: Object, media: {
    root: string;
    prefixes: string[];
    maxAge?: string;
}): Object;
/**
 * Normalizes a URL prefix to a rooted path with no trailing slash, or null when it is not usable.
 *
 * @param {string} prefix
 * @returns {string|null}
 */
declare function normalizePrefix(prefix: string): string | null;
