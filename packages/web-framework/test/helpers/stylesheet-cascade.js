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

const assert = require( "node:assert/strict" );

/**
 * A stylesheet read the way the browser applies it to one selector at equal specificity: every block whose selector
 * list names that selector, in source order, later declarations winning.
 * <br/>
 * Reading the first block found would assert against a rule the browser overrides. The stylesheet declares
 * `.ti-sidebar` twice, a legacy rule and the app-shell rule several hundred lines later, and a later rule
 * reintroducing a defect is exactly what these assertions exist to catch. A selector is matched as a whole member of
 * a list, never as a substring: `.ti-sidebar` is not `.ti-sidebar-foot`, and `html` is not `html.ti-busy`.
 * <br/>
 * `overflow` is expanded into both axes because the shorthand is the usual regression: `overflow: hidden` puts
 * `overflow-y` back to hidden without ever naming it.
 * <br/>
 * The suites are `node --test` with no DOM, so this is about declarations, not rendered geometry. The alternative,
 * asserting nothing and trusting the stylesheet, is what let the sidebar's clipped footer ship.
 *
 * @method
 * @param {string} source - The stylesheet's text.
 * @returns {{ blocks: Array<{selectors: string[], declarations: Object<string, string>}>, declarations: function(string): Object<string, string>, assertDeclares: function(string, string, (string|RegExp), string=): void }}
 * @public
 */
function readCascade( source ) {
    const withoutComments = source.replace( /\/\*[\s\S]*?\*\//g, "" );

    // Innermost blocks only: the body may hold no brace, so a rule nested in `@media` is read as the rule it is and the
    // at-rule's own prelude never passes for a selector.
    const blocks = [];
    const pattern = /([^{};]+)\{([^{}]*)\}/g;
    let block;
    while ( ( block = pattern.exec( withoutComments ) ) !== null ) {
        const declared = {};
        for ( const declaration of block[ 2 ].split( ";" ) ) {
            const at = declaration.indexOf( ":" );
            if ( at < 0 ) {
                continue;
            }
            const property = declaration.slice( 0, at ).trim();
            const value = declaration.slice( at + 1 ).trim();
            if ( !property ) {
                continue;
            }
            if ( property === "overflow" ) {
                declared[ "overflow-x" ] = value;
                declared[ "overflow-y" ] = value;
            }
            declared[ property ] = value;
        }
        blocks.push( {
            selectors: block[ 1 ].split( "," ).map( ( selector ) => selector.trim().replace( /\s+/g, " " ) ).filter( Boolean ),
            declarations: declared
        } );
    }

    const declarations = ( selector ) => {
        const named = blocks.filter( ( each ) => each.selectors.includes( selector ) );
        assert.ok( named.length > 0, `no rule found for selector "${ selector }"` );
        return Object.assign( {}, ...named.map( ( each ) => each.declarations ) );
    };

    const assertDeclares = ( selector, property, expected, message ) => {
        const value = declarations( selector )[ property ];
        assert.ok( value !== undefined, `${ selector } declares no ${ property }` );
        if ( expected instanceof RegExp ) {
            assert.match( value, expected, message );
        } else {
            assert.equal( value, expected, message );
        }
    };

    return { blocks: blocks, declarations: declarations, assertDeclares: assertDeclares };
}

module.exports = { readCascade };
