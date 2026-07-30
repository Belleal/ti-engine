/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Legacy media mounts -- serving a migrated media library at the URLs it already has.
 *
 * The framework mounts an application's public directory at `/static` only, but a migrated site's media is
 * referenced by its original absolute paths (`/wp-content/uploads/2026/05/cover.webp`) from inside imported content,
 * from other people's links, and from search results. Rewriting those references is not an option: an inbound link
 * from someone else's page cannot be rewritten, so the path has to keep working.
 *
 * THE ON-DISK TREE MIRRORS THE URL. A request for `/wp-content/uploads/x.webp` is served from
 * `<root>/wp-content/uploads/x.webp`. That is what "copied verbatim, identical paths" means in the migration plan,
 * and it is why no URL rewriting happens here: there is nothing to translate.
 *
 * Directory traversal is handled by `express.static`/`send`, which refuses any resolved path outside the root --
 * this module adds `dotfiles: "deny"` so a stray `.env` or `.git` under the media root can never be served either,
 * and `index: false` so a directory URL lists nothing.
 */

const express = require( "express" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const logger = require( "@ti-engine/core/logger" );

// Long enough to be worth caching, short enough that a re-uploaded file with the same name is picked up without a
// purge. Deliberately not `immutable`: a media library is not content-addressed, so a year-long unrevalidatable
// cache turns a corrected image into a year-long support problem.
const DEFAULT_MAX_AGE = "30d";

/**
 * Registers the legacy media prefixes.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ root: string, prefixes: string[], maxAge?: string }} media
 * @returns {Object} The server, for chaining.
 */
function mountMediaRoutes( server, media ) {
    const config = media || {};
    const root = config.root;
    const prefixes = Array.isArray( config.prefixes ) ? config.prefixes.filter( Boolean ) : [];

    if ( !root || prefixes.length === 0 ) {
        return server;
    }
    if ( path.isAbsolute( root ) === false ) {
        logger.log( `Media root '${ root }' is not an absolute path; legacy media will not be served.`, logger.logSeverity.ERROR );
        return server;
    }
    if ( fs.existsSync( root ) === false ) {
        // Not fatal: a deployment may legitimately carry no legacy media yet, and the content resolver will 404 the
        // paths in the meantime. But it is the kind of thing that must be visible in a log, not discovered later.
        logger.log( `Media root '${ root }' does not exist; legacy media paths will 404 until it is populated.`, logger.logSeverity.WARNING );
    }

    const serve = express.static( root, {
        // A miss falls through to the content resolver, which answers a proper 404 rather than a bare one.
        fallthrough: true,
        dotfiles: "deny",
        index: false,
        redirect: false,
        maxAge: config.maxAge || DEFAULT_MAX_AGE
    } );

    for ( const prefix of prefixes ) {
        const normalized = normalizePrefix( prefix );
        if ( normalized === null ) {
            logger.log( `Ignored media prefix '${ prefix }': it must be a rooted path such as '/wp-content'.`, logger.logSeverity.ERROR );
            continue;
        }
        // No URL rewriting: the tree under `root` mirrors the request path, so `express.static` resolves it directly.
        server.registerRoute( "get", normalized + "/*splat", serve );
    }

    return server;
}

/**
 * Normalizes a URL prefix to a rooted path with no trailing slash, or null when it is not usable.
 *
 * @param {string} prefix
 * @returns {string|null}
 */
function normalizePrefix( prefix ) {
    const value = String( prefix || "" ).trim();
    if ( value.indexOf( "/" ) !== 0 || value.indexOf( "//" ) === 0 ) {
        return null;
    }
    const trimmed = value.replace( /\/+$/, "" );
    return trimmed === "" ? null : trimmed;
}

module.exports = {
    mountMediaRoutes: mountMediaRoutes,
    normalizePrefix: normalizePrefix,
    DEFAULT_MAX_AGE: DEFAULT_MAX_AGE
};
