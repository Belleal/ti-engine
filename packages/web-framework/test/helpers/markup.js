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

/*
 * A linear scanner for the framework's fragments, shared by the tests that sweep their markup: the sign-in labels
 * (`frame-login.labels`) and what a feedback picture keeps (`picture-keep.fragments`). One scanner, so a fix to how a
 * tag or a quote is read reaches both (the review pass of CA-551 found a second one written beside this).
 */

/**
 * Elements with no closing tag.
 *
 * @type {Set<string>}
 */
const VOID_ELEMENTS = new Set( [ "area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr" ] );

/**
 * Splits a fragment into opening tags, closing tags and text runs in one linear pass, skipping comments.
 * <br/>
 * The scan uses `indexOf` and a quote-aware walk to each tag's end, not an HTML regex. A pattern such as
 * `<(\w+)([^>]*)>` has overlapping quantifiers, which CodeQL reports as `js/polynomial-redos`. A tag ends at the first
 * `>` outside a quoted attribute value, so an attribute holding `>` cannot cut it short.
 *
 * @method
 * @param {string} html
 * @returns {Array<{type: string, name?: string, tag?: string, selfClosing?: boolean, text?: string}>}
 * @private
 */
function tokenize( html ) {
    const tokens = [];
    let at = 0;
    while ( at < html.length ) {
        const opensAt = html.indexOf( "<", at );
        if ( opensAt < 0 ) {
            tokens.push( { type: "text", text: html.slice( at ) } );
            break;
        }
        if ( opensAt > at ) {
            tokens.push( { type: "text", text: html.slice( at, opensAt ) } );
        }
        if ( html.startsWith( "<!--", opensAt ) ) {
            const closesAt = html.indexOf( "-->", opensAt + 4 );
            at = ( closesAt < 0 ) ? html.length : closesAt + 3;
            continue;
        }
        let quote = null;
        let endsAt = opensAt + 1;
        for ( ; endsAt < html.length; endsAt++ ) {
            const character = html[ endsAt ];
            if ( quote !== null ) {
                if ( character === quote ) {
                    quote = null;
                }
            } else if ( character === "\"" || character === "'" ) {
                quote = character;
            } else if ( character === ">" ) {
                break;
            }
        }
        const tag = html.slice( opensAt + 1, endsAt );
        at = endsAt + 1;
        if ( tag.startsWith( "/" ) ) {
            tokens.push( { type: "close", name: tag.slice( 1 ).trim().toLowerCase() } );
        } else {
            const name = ( /^[A-Za-z][\w-]*/.exec( tag ) || [ "" ] )[ 0 ].toLowerCase();
            tokens.push( { type: "open", name: name, tag: tag, selfClosing: tag.endsWith( "/" ) || VOID_ELEMENTS.has( name ) } );
        }
    }
    return tokens;
}

/**
 * Returns the value of an attribute on a tag, in either quote style, or `null` when the tag does not carry it.
 * <br/>
 * Both quotes, because reading only double quotes let a literal `placeholder='…'` pass the sweep unnoticed. They are
 * two alternatives rather than a backreference to the opening quote: neither can run past its own closing quote, so
 * the match stays linear. The name is escaped, although every caller passes a constant.
 *
 * @method
 * @param {string} tag
 * @param {string} name
 * @returns {string|null}
 * @private
 */
function attributeOf( tag, name ) {
    const escaped = name.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" );
    const match = new RegExp( `\\s${ escaped }=(?:"([^"]*)"|'([^']*)')` ).exec( tag );
    if ( !match ) {
        return null;
    }
    return ( match[ 1 ] !== undefined ) ? match[ 1 ] : match[ 2 ];
}

module.exports = { VOID_ELEMENTS: VOID_ELEMENTS, tokenize: tokenize, attributeOf: attributeOf };
