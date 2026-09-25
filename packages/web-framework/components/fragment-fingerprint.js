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
 * Content addresses for the screens an application declares `immutable`, and the rewrite that puts them into the
 * HTML it serves.
 * <br/>
 * A screen fragment is served at a URL that names the screen, not a version of it. Since 1.39.0 it revalidates:
 * `private, no-cache` with an ETag, so a revisit is a 304. That saves the bytes but not the round trip. On a hosted
 * deployment the round trip is the whole cost: a User Guide chapter took 4-7 ms in the process and 0.6-0.9 s in the
 * browser (CA-183). A fragment whose markup is the same for every viewer until the next deployment can be named by
 * its content instead. `hx-get="/app/<id>"` gains `?v=<version>`, and a request whose `v` is the current version may
 * be kept by the browser for good.
 * <br/>
 * One version addresses every immutable fragment together. Chapters link to one another, so a per-fragment hash that
 * covered its links would contain the other chapters' hashes, a cycle with no fixed point. A per-fragment hash that
 * left the links out would go stale. If chapter B changed, the copy of chapter A cached for good would still link to
 * B's old address, and the browser would keep serving the old B from its cache. With one version, any change to any
 * member moves every address. A deployment that changes none of them keeps every cached copy.
 *
 * @module fragment-fingerprint
 */

const crypto = require( "node:crypto" );

/**
 * Hex characters of the version kept: 48 bits, the length `/static` fingerprints use, for the same reason. Only the
 * versions of one deployment history ever need telling apart.
 *
 * @type {number}
 */
const VERSION_LENGTH = 12;

/**
 * The markup tokens the rewrite needs to recognise, in one pass: a comment, a `<script>` or `<style>` element with
 * its raw text, or a start tag. Comments and raw text are matched only so they are skipped whole: a `<` inside them
 * is not a tag. Inside a start tag, a quoted value is consumed whole, so a `>` in Alpine's `x-show="a > b"` does not
 * end the tag. Each alternative inside the tag begins with a different character (a double quote, a single quote, or
 * neither), so nothing can match two ways and the pattern cannot backtrack out of control.
 *
 * @type {RegExp}
 */
const RE_MARKUP_TOKEN = /<!--[\s\S]*?-->|<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/\1\s*>|<[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>/gi;

/**
 * One attribute of a start tag: its name, then an optional value, double-quoted, single-quoted or bare.
 *
 * @type {RegExp}
 */
const RE_ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * A reference to a screen by the address `/app/:view` serves it at, with no query or fragment of its own. A reference
 * that carries a query is left alone, as `/static` fingerprinting leaves one: it was written by someone who meant it.
 *
 * @type {RegExp}
 */
const RE_SCREEN_PATH = /^\/app\/([\w-]+)$/;

/**
 * The attributes that name the URL a request is made to, and those that say which URL the address bar shows after it.
 * HTMX reads both spellings.
 */
const REQUEST_ATTRIBUTES = new Set( [ "hx-get", "data-hx-get" ] );
const HISTORY_ATTRIBUTES = new Set( [ "hx-push-url", "data-hx-push-url", "hx-replace-url", "data-hx-replace-url" ] );

/**
 * The SHA-256 of a fragment's markup, in hex.
 *
 * @method
 * @param {string} markup
 * @returns {string}
 * @public
 */
function digestOf( markup ) {
    return crypto.createHash( "sha256" ).update( String( markup ), "utf8" ).digest( "hex" );
}

/**
 * The version that addresses a set of fragments: a hash over every member's identifier and digest, in identifier
 * order, so it does not depend on the order they were registered in.
 *
 * @method
 * @param {Map<string, string>} digestsByIdentifier
 * @returns {string}
 * @public
 */
function versionOf( digestsByIdentifier ) {
    const lines = [ ...digestsByIdentifier.entries() ].sort( ( a, b ) => ( ( a[ 0 ] < b[ 0 ] ) ? -1 : ( ( a[ 0 ] > b[ 0 ] ) ? 1 : 0 ) ) ).map( ( [ identifier, digest ] ) => `${ identifier }:${ digest }` );
    return digestOf( lines.join( "\n" ) ).slice( 0, VERSION_LENGTH );
}

/**
 * Rewrites one start tag: an `hx-get` naming an addressed screen gains `?v=<version>`, and when it does, a history
 * attribute of the same tag that says `true` names the screen's plain path instead. HTMX pushes the URL it requested,
 * so without that the address bar would show the version. A value is re-quoted with double quotes only when it was
 * bare.
 *
 * @method
 * @param {string} tag
 * @param {Set<string>} identifiers
 * @param {string} version
 * @returns {string}
 */
function addressTag( tag, identifiers, version ) {
    const nameEnd = tag.search( /[\s/>]/ );
    const attributes = [ ...tag.slice( nameEnd ).matchAll( RE_ATTRIBUTE ) ].map( ( match ) => ( {
        start: nameEnd + match.index,
        end: nameEnd + match.index + match[ 0 ].length,
        name: match[ 1 ],
        value: ( match[ 2 ] !== undefined ) ? match[ 2 ] : ( ( match[ 3 ] !== undefined ) ? match[ 3 ] : match[ 4 ] ),
        quote: ( match[ 3 ] !== undefined ) ? "'" : "\""
    } ) );
    let screenPath = null;
    const edits = [];
    for ( const attribute of attributes ) {
        const screen = REQUEST_ATTRIBUTES.has( attribute.name.toLowerCase() ) ? RE_SCREEN_PATH.exec( attribute.value || "" ) : null;
        if ( screen && identifiers.has( screen[ 1 ] ) ) {
            screenPath = attribute.value;
            edits.push( { attribute: attribute, value: `${ screenPath }?v=${ version }` } );
        }
    }
    if ( screenPath === null ) {
        return tag;
    }
    for ( const attribute of attributes ) {
        if ( HISTORY_ATTRIBUTES.has( attribute.name.toLowerCase() ) && String( attribute.value ).trim() === "true" ) {
            edits.push( { attribute: attribute, value: screenPath } );
        }
    }
    // From the end, so each edit leaves the offsets of the ones before it intact.
    edits.sort( ( a, b ) => b.attribute.start - a.attribute.start );
    let rewritten = tag;
    for ( const { attribute, value } of edits ) {
        rewritten = `${ rewritten.slice( 0, attribute.start ) }${ attribute.name }=${ attribute.quote }${ value }${ attribute.quote }${ rewritten.slice( attribute.end ) }`;
    }
    return rewritten;
}

/**
 * Addresses every reference to an immutable screen in an HTML fragment: `hx-get="/app/<id>"` becomes
 * `hx-get="/app/<id>?v=<version>"` for every `<id>` in `identifiers`, and a `true` history attribute on the same tag
 * becomes the screen's plain path. Nothing else changes: other screens, references that carry a query, and anything
 * inside a comment, `<script>` or `<style>`.
 *
 * @method
 * @param {string} html
 * @param {Set<string>} identifiers The immutable fragments' identifiers.
 * @param {string} version The version that addresses them.
 * @returns {string}
 * @public
 */
function addressFragmentReferences( html, identifiers, version ) {
    const text = String( html );
    if ( !version || !identifiers || identifiers.size === 0 || !text.includes( "hx-get" ) ) {
        return text;
    }
    return text.replace( RE_MARKUP_TOKEN, ( token, rawTextElement ) => {
        if ( rawTextElement !== undefined || token.startsWith( "<!--" ) || !token.includes( "hx-get" ) ) {
            return token;
        }
        return addressTag( token, identifiers, version );
    } );
}

module.exports = {
    VERSION_LENGTH: VERSION_LENGTH,
    digestOf: digestOf,
    versionOf: versionOf,
    addressFragmentReferences: addressFragmentReferences
};
