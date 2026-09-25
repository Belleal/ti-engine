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
 * Every word the login screen shows goes through the label directive (CA-179).
 *
 * The login screen is the one screen every user sees, and the first. It was also the one that stayed in English in
 * a Bulgarian deployment. Its greeting, the "or continue with" divider, both input placeholders and the no-method
 * message were literal text that no catalogue could reach. The buttons and field labels beside them WERE translated,
 * which is why nobody noticed.
 *
 * This is a sweep, not a list, because the next string added to these files will not be one of those six. Every
 * text run and every user-visible attribute must be labelled. Every label must keep its English as the element's own
 * content, because a consuming application loads its own catalogue and never this package's. And every key must
 * exist here in both languages.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const FRAGMENTS = path.join( __dirname, "..", "bin", "static", "fragments" );
const LOGIN_FILES = [
    path.join( FRAGMENTS, "frame-login.html" ),
    path.join( FRAGMENTS, "components", "component-login-brand.html" ),
    path.join( FRAGMENTS, "components", "component-login-extra.html" )
];
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

/**
 * Attributes whose value a user reads or hears, so each needs a matching `x-text-label:<attribute>`.
 *
 * @type {string[]}
 */
const VISIBLE_ATTRIBUTES = [ "placeholder", "aria-label", "title", "alt" ];

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
 * Returns the value of a double-quoted attribute on a tag, or `null` when the tag does not carry it.
 *
 * @method
 * @param {string} tag
 * @param {string} name
 * @returns {string|null}
 * @private
 */
function attributeOf( tag, name ) {
    const match = new RegExp( `\\s${ name }="([^"]*)"` ).exec( tag );
    return match ? match[ 1 ] : null;
}

/**
 * Walks a fragment and reports every problem with how its visible text is labelled.
 *
 * @method
 * @param {string} html
 * @returns {{unlabelled: string[], withoutFallback: string[], keys: string[]}}
 * @private
 */
function auditLabels( html ) {
    const unlabelled = [];
    const withoutFallback = [];
    const keys = [];
    const open = [];

    for ( const token of tokenize( html ) ) {
        if ( token.type === "open" ) {
            const key = attributeOf( token.tag, "x-text-label" );
            if ( key !== null ) {
                keys.push( key );
            }
            for ( const attribute of VISIBLE_ATTRIBUTES ) {
                const value = attributeOf( token.tag, attribute );
                if ( value === null ) {
                    continue;
                }
                const attributeKey = attributeOf( token.tag, `x-text-label:${ attribute }` );
                if ( attributeKey === null ) {
                    unlabelled.push( `${ attribute }="${ value }"` );
                } else {
                    keys.push( attributeKey );
                    if ( value.trim().length === 0 ) {
                        withoutFallback.push( attributeKey );
                    }
                }
            }
            if ( !token.selfClosing ) {
                open.push( { name: token.name, key: key, isMark: /\bti-login-brand-mark\b/.test( attributeOf( token.tag, "class" ) || "" ), text: "" } );
            }
        } else if ( token.type === "close" ) {
            const index = open.map( ( element ) => element.name ).lastIndexOf( token.name );
            if ( index >= 0 ) {
                const element = open[ index ];
                if ( element.key !== null && element.text.trim().length === 0 ) {
                    withoutFallback.push( element.key );
                }
                open.length = index;
            }
        } else if ( /\p{L}/u.test( token.text ) ) {
            // The mark is the one exemption: a single letter drawn as a logo, not a word to translate.
            const parent = open[ open.length - 1 ];
            if ( parent && ( parent.key !== null || parent.isMark ) ) {
                parent.text += token.text;
            } else {
                unlabelled.push( token.text.trim() );
            }
        }
    }
    return { unlabelled: unlabelled, withoutFallback: withoutFallback, keys: keys };
}

/**
 * Resolves a dotted key against the framework's catalogue.
 *
 * @method
 * @param {string} key
 * @returns {Object|undefined}
 * @private
 */
function labelAt( key ) {
    return key.split( "." ).reduce( ( node, part ) => ( node && node[ part ] !== undefined ) ? node[ part ] : undefined, labels );
}

describe( "every string on the login screen goes through the label directive", () => {

    for ( const file of LOGIN_FILES ) {
        const name = path.basename( file );
        const audit = auditLabels( fs.readFileSync( file, "utf8" ) );

        it( `${ name }: no visible text or attribute is literal`, () => {
            assert.deepEqual( audit.unlabelled, [], "each of these reaches the screen in English whatever the language" );
        } );

        it( `${ name }: every label keeps its English as the fallback`, () => {
            // Without it, a consuming application renders an empty element: it loads its own catalogue, never
            // this one, and the directive falls back to the element's own text or attribute.
            assert.deepEqual( audit.withoutFallback, [] );
        } );

        it( `${ name }: every key exists here in English and Bulgarian`, () => {
            for ( const key of audit.keys ) {
                const label = labelAt( key );
                assert.ok( label, `missing label ${ key }` );
                assert.ok( label.en && label.en.length > 0, `${ key } has no English` );
                assert.ok( label.bg && label.bg.length > 0, `${ key } has no Bulgarian` );
            }
        } );
    }

    it( "the audit finds what it is looking for, so an empty result means something", () => {
        // Guard the guard: a scanner that saw no text at all would pass every assertion above.
        const audit = auditLabels( "<div><span>Literal</span><input placeholder=\"Type\"/><em x-text-label=\"k\"></em></div>" );

        assert.deepEqual( audit.unlabelled, [ "Literal", "placeholder=\"Type\"" ] );
        assert.deepEqual( audit.withoutFallback, [ "k" ] );

        // And on the real fragment, through both forms of the directive.
        const keys = auditLabels( fs.readFileSync( LOGIN_FILES[ 0 ], "utf8" ) ).keys;
        assert.ok( keys.includes( "interface.default.login.error-sign-in-failed" ), "a text label must be found" );
        assert.ok( keys.includes( "interface.default.login.username-placeholder" ), "an attribute label must be found" );
    } );

} );

describe( "a labelled placeholder — behaviour", () => {

    /**
     * Runs the registered `text-label` directive over an element's attribute, against a given labels catalogue.
     *
     * @method
     * @param {Object} catalogue
     * @param {string} key
     * @param {string} attribute
     * @param {string} fallback The attribute's own value, which is what the directive falls back to.
     * @returns {string} The attribute's value after the directive has run.
     * @private
     */
    function renderAttributeLabel( catalogue, key, attribute, fallback ) {
        const { stores, directives } = loadTiFramework();
        stores.tiApplication.configuration = { labels: catalogue };

        const attributes = { [ attribute ]: fallback };
        const element = {
            textContent: "",
            getAttribute: ( name ) => ( Object.prototype.hasOwnProperty.call( attributes, name ) ? attributes[ name ] : null ),
            setAttribute: ( name, value ) => {
                attributes[ name ] = value;
            }
        };
        directives[ "text-label" ]( element, { value: attribute, expression: key }, { effect: ( fn ) => fn() } );

        return attributes[ attribute ];
    }

    const KEY = "interface.default.login.username-placeholder";
    const fragment = fs.readFileSync( LOGIN_FILES[ 0 ], "utf8" );
    const fallback = attributeOf( ( /<input id="ti-username"[^>]*>/.exec( fragment ) || [ "" ] )[ 0 ], "placeholder" );

    it( "keeps the fragment's own placeholder where the key does not resolve, which is every consuming application", () => {
        assert.ok( fallback && fallback.length > 0, "the fragment must supply a placeholder for this to test anything" );
        assert.equal( renderAttributeLabel( {}, KEY, "placeholder", fallback ), fallback );
    } );

    it( "translates it where the key is loaded", () => {
        const catalogue = { interface: { default: { login: { "username-placeholder": "Въведете потребителското си име" } } } };

        assert.equal( renderAttributeLabel( catalogue, KEY, "placeholder", fallback ), "Въведете потребителското си име" );
    } );

} );
