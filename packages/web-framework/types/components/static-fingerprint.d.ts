/// <reference types="node" />
declare const _exports: {
    FINGERPRINT_LENGTH: number;
    fingerprintOfFile: typeof fingerprintOfFile;
    resolveStaticFile: typeof resolveStaticFile;
    fingerprintStaticReferences: typeof fingerprintStaticReferences;
    isCurrentFingerprint: typeof isCurrentFingerprint;
};
export = _exports;
import fs = require("node:fs");
/**
 * Returns the content fingerprint of a file, computing it only when the file is new to this process or has changed
 * since it was last hashed.
 *
 * @method
 * @param {string} absolutePath
 * @param {fs.Stats} [stat] The file's stat when the caller already has one (express.static passes it to `setHeaders`).
 * @returns {string|null} The fingerprint, or null when the file cannot be read.
 * @public
 */
declare function fingerprintOfFile(absolutePath: string, stat?: fs.Stats): string | null;
/**
 * Resolves a path under `/static` to the file express.static would serve for it: the static directories are searched
 * last to first, because `TiWebServer` mounts them in reverse so that an application's file overrides the framework's
 * default of the same name. Hashing any other file would give an override the framework file's fingerprint.
 *
 * @method
 * @param {string[]} staticContentPaths The static directories, framework default first.
 * @param {string} relativePath The path after `/static/`.
 * @returns {string|null} The absolute path, or null when no directory holds the file or the path leaves its root.
 * @public
 */
declare function resolveStaticFile(staticContentPaths: string[], relativePath: string): string | null;
/**
 * Appends `?v=<fingerprint>` to every `/static` reference in an HTML fragment whose file can be found. A reference
 * whose file cannot be found is left as written, so it keeps the revalidating policy and fails the way it did before.
 *
 * @method
 * @param {string} html
 * @param {string[]} staticContentPaths The static directories, framework default first.
 * @returns {string}
 * @public
 */
declare function fingerprintStaticReferences(html: string, staticContentPaths: string[]): string;
/**
 * Whether a requested fingerprint names the file's current content — the condition for answering it as immutable.
 *
 * @method
 * @param {string} absolutePath
 * @param {*} requested The `v` query value of the request.
 * @param {fs.Stats} [stat]
 * @returns {boolean}
 * @public
 */
declare function isCurrentFingerprint(absolutePath: string, requested: any, stat?: fs.Stats): boolean;
