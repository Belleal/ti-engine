/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

const path = require( "node:path" );
const fs = require( "node:fs" );

/** @import { TiApplicationInfo } from "#definitions" */

/**
 * Matches the leading npm scope of a package name (`@ti-engine/competence` → `competence`).
 *
 * @type {RegExp}
 */
const RE_PACKAGE_SCOPE = /^@[^/]+\//;

/**
 * Matches the trailing e-mail/URL suffix of a `package.json` author string
 * (`Boris Kostadinov <a@b.c> (https://d.e)` → `Boris Kostadinov`).
 *
 * @type {RegExp}
 */
const RE_AUTHOR_CONTACT = /\s*[<(][^>)]*[>)]/g;

/**
 * Turns an npm package name into a human-readable display name — the scope is dropped and each dash/underscore
 * separated word is capitalized (`@ti-engine/web-framework` → `Web Framework`). Used only when neither the manifest
 * nor the environment supplies an explicit display name.
 *
 * @method
 * @param {string} packageName
 * @returns {string}
 * @private
 */
function toDisplayName( packageName ) {
    const bare = String( packageName || "" ).replace( RE_PACKAGE_SCOPE, "" ).trim();
    if ( !bare ) {
        return "";
    }
    return bare
        .split( /[-_.\s]+/ )
        .filter( ( word ) => word.length > 0 )
        .map( ( word ) => word.charAt( 0 ).toUpperCase() + word.slice( 1 ) )
        .join( " " );
}

/**
 * Reduces a `package.json` author entry — either the string form or the object form — to a bare display name,
 * dropping the e-mail address and homepage that npm allows to be inlined in the string form.
 *
 * @method
 * @param {string|Object} author
 * @returns {string}
 * @private
 */
function toAuthorName( author ) {
    if ( author && typeof author === "object" ) {
        return String( author.name || "" ).trim();
    }
    return String( author || "" ).replace( RE_AUTHOR_CONTACT, "" ).trim();
}

/**
 * Reduces a `package.json` repository entry — either the string shorthand or the object form — to a plain URL,
 * stripping the `git+` prefix and `.git` suffix npm accepts so the result is browser-openable.
 *
 * @method
 * @param {string|Object} repository
 * @returns {string}
 * @private
 */
function toRepositoryUrl( repository ) {
    const raw = ( repository && typeof repository === "object" ) ? repository.url : repository;
    const url = String( raw || "" ).trim();
    if ( !url ) {
        return "";
    }
    return url.replace( /^git\+/, "" ).replace( /\.git$/, "" );
}

/**
 * Returns the trimmed string value of `value`, or `fallback` when it is absent or blank. Keeps the builder below
 * free of repeated `String( … ).trim() || …` noise while treating a whitespace-only manifest field as absent.
 *
 * @method
 * @param {*} value
 * @param {string} [fallback=""]
 * @returns {string}
 * @private
 */
function text( value, fallback = "" ) {
    const resolved = String( value === undefined || value === null ? "" : value ).trim();
    return resolved || fallback;
}

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
function buildApplicationInfo( options = {} ) {
    const manifest = ( options.manifest && typeof options.manifest === "object" ) ? options.manifest : {};
    const env = ( options.env && typeof options.env === "object" ) ? options.env : {};

    const packageName = text( manifest.name );
    const name = text( env.TI_WEB_APP_NAME, text( manifest.displayName, toDisplayName( packageName ) ) );
    const author = toAuthorName( manifest.author );
    const homepage = text( manifest.homepage, toRepositoryUrl( manifest.repository ) );

    const components = ( Array.isArray( options.components ) ? options.components : [] )
        .map( ( component ) => ( {
            name: text( component && component.name ),
            version: text( component && component.version )
        } ) )
        .filter( ( component ) => component.name.length > 0 );

    return {
        name: name,
        packageName: packageName,
        version: text( env.TI_WEB_APP_VERSION, text( manifest.version ) ),
        releaseDate: text( env.TI_WEB_APP_RELEASE_DATE, text( manifest.releaseDate ) ),
        description: text( manifest.description ),
        license: text( manifest.license ),
        homepage: homepage,
        author: author,
        components: components,
        runtime: ( options.runtime && typeof options.runtime === "object" ) ? { ...options.runtime } : null,
        sections: []
    };
}

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
function readApplicationManifest( directory = process.cwd() ) {
    try {
        const manifestPath = path.join( directory, "package.json" );
        const contents = fs.readFileSync( manifestPath, "utf8" );
        const parsed = JSON.parse( contents );
        return ( parsed && typeof parsed === "object" ) ? parsed : {};
    } catch {
        return {};
    }
}

module.exports = { buildApplicationInfo, readApplicationManifest };
