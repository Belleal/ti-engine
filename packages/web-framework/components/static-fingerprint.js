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

/**
 * Content fingerprints for the files under `/static`, and the rewrite that puts them into the HTML the application
 * serves.
 * <br/>
 * A `/static` URL names a file, not a version of it, so the only honest cache policy for it is to revalidate on every
 * use — which is what `/static` does by default, and why a page load used to cost one conditional request per script
 * and stylesheet. A URL that also carries a hash of the file's bytes names exactly one version, and may be cached for
 * good. This module computes that hash, and {@link fingerprintStaticReferences} appends it to every `/static`
 * reference in a served fragment as `?v=<hash>`; `TiWebServer` then answers a request whose `v` matches the file with
 * an `immutable` policy, and any other request with the unchanged revalidating one.
 * <br/>
 * A fingerprint is revalidated against the file's size and modification time before it is trusted, so an edited file
 * — in development, or a static tree replaced under a running process — gets a new URL at once rather than a
 * long-lived cache entry for bytes that are no longer served.
 *
 * @module static-fingerprint
 */

const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const path = require( "node:path" );

/**
 * Hex characters of the SHA-256 digest kept. 48 bits distinguish the versions of one file — the only collision that
 * matters — with a margin no release history will approach.
 *
 * @type {number}
 */
const FINGERPRINT_LENGTH = 12;

/**
 * A `/static` reference in a `src` or `href` attribute, with no query or fragment of its own. The path character class
 * excludes the quote characters, `?`, `#`, angle brackets and whitespace, so the match is linear and stops at the
 * attribute's end. A reference that already carries a query is left alone: it was written by someone who meant it.
 *
 * @type {RegExp}
 */
const RE_STATIC_REFERENCE = /\b(src|href)=(["'])\/static\/([^"'?#<>\s]+)\2/g;

/**
 * The fingerprint of each file computed so far, with the size and modification time it was computed for.
 *
 * @type {Map<string, {size: number, mtimeMs: number, fingerprint: string}>}
 */
const fingerprintsByFile = new Map();

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
function fingerprintOfFile( absolutePath, stat ) {
    try {
        const current = stat || fs.statSync( absolutePath );
        const known = fingerprintsByFile.get( absolutePath );
        if ( known && known.size === current.size && known.mtimeMs === current.mtimeMs ) {
            return known.fingerprint;
        }
        const fingerprint = crypto.createHash( "sha256" ).update( fs.readFileSync( absolutePath ) ).digest( "hex" ).slice( 0, FINGERPRINT_LENGTH );
        fingerprintsByFile.set( absolutePath, { size: current.size, mtimeMs: current.mtimeMs, fingerprint: fingerprint } );
        return fingerprint;
    } catch {
        return null;
    }
}

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
function resolveStaticFile( staticContentPaths, relativePath ) {
    let decoded;
    try {
        decoded = decodeURIComponent( relativePath );
    } catch {
        return null;
    }
    const roots = Array.isArray( staticContentPaths ) ? staticContentPaths : [];
    for ( let index = roots.length - 1; index >= 0; index-- ) {
        const root = path.resolve( roots[ index ] );
        const candidate = path.resolve( root, decoded );
        const relative = path.relative( root, candidate );
        // A reference is markup the application wrote, not request input, but `..` must still not reach outside the
        // tree: the result is read and hashed.
        if ( relative === "" || relative.startsWith( ".." ) || path.isAbsolute( relative ) ) {
            continue;
        }
        try {
            if ( fs.statSync( candidate ).isFile() ) {
                return candidate;
            }
        } catch {
            // Not in this directory; the next one may hold it.
        }
    }
    return null;
}

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
function fingerprintStaticReferences( html, staticContentPaths ) {
    return String( html ).replace( RE_STATIC_REFERENCE, ( match, attribute, quote, relativePath ) => {
        const file = resolveStaticFile( staticContentPaths, relativePath );
        const fingerprint = file ? fingerprintOfFile( file ) : null;
        return fingerprint ? `${ attribute }=${ quote }/static/${ relativePath }?v=${ fingerprint }${ quote }` : match;
    } );
}

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
function isCurrentFingerprint( absolutePath, requested, stat ) {
    if ( typeof requested !== "string" || requested.length !== FINGERPRINT_LENGTH ) {
        return false;
    }
    return fingerprintOfFile( absolutePath, stat ) === requested;
}

module.exports = {
    FINGERPRINT_LENGTH: FINGERPRINT_LENGTH,
    fingerprintOfFile: fingerprintOfFile,
    resolveStaticFile: resolveStaticFile,
    fingerprintStaticReferences: fingerprintStaticReferences,
    isCurrentFingerprint: isCurrentFingerprint
};
