declare const _exports: {
    buildApplicationInfo: typeof buildApplicationInfo;
    readApplicationManifest: typeof readApplicationManifest;
};
export = _exports;
import type { TiApplicationInfo } from "#definitions";
/**
 * Builds the normalized application-information descriptor that backs the framework "About" screen.
 * <br/>
 * The function is PURE — everything it needs is injected — so the whole resolution order (manifest → environment
 * override) is unit-testable without touching the filesystem or `process.env`. The impure half, reading the
 * consuming application's manifest, is {@link readApplicationManifest}.
 * <br/>
 * Resolution order for the three overridable fields is manifest first, environment last:
 * - `TI_WEB_APP_NAME` overrides `manifest.displayName` / a display name derived from `manifest.name`;
 * - `TI_WEB_APP_VERSION` overrides `manifest.version`;
 * - `TI_WEB_APP_RELEASE_DATE` overrides `manifest.releaseDate`.
 * <br/>
 * The environment wins because it is how a container image stamps facts that its baked-in manifest cannot know —
 * most importantly the build/release date, for which `package.json` has no standard field at all.
 *
 * @method
 * @param {Object} [options]
 * @param {Object} [options.manifest] A `package.json`-shaped object for the consuming application.
 * @param {Object} [options.env] The environment source (injectable for testing).
 * @param {Array<{name: string, version: string}>} [options.components] Framework component versions to list.
 * @param {Object} [options.runtime] Runtime facts (node/platform/instance). Included verbatim when present; the
 * caller decides whether the current session is allowed to see them.
 * @returns {TiApplicationInfo}
 * @public
 */
declare function buildApplicationInfo(options?: {
    manifest?: Object;
    env?: Object;
    components?: Array<{
        name: string;
        version: string;
    }>;
    runtime?: Object;
}): TiApplicationInfo;
/**
 * Reads the consuming application's `package.json`. This is the one impure function in this module.
 * <br/>
 * NOTE: A missing or malformed manifest resolves to an empty object rather than throwing — an informational screen
 * must never be the reason a request fails, and {@link buildApplicationInfo} produces a usable (if sparse)
 * descriptor from `{}`.
 *
 * @method
 * @param {string} [directory=process.cwd()] The directory holding the manifest.
 * @returns {Object}
 * @public
 */
declare function readApplicationManifest(directory?: string): Object;
