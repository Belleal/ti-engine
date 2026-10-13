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
 * Covers the shared components at the end of `ti-framework.css` (1.51.0, CA-479).
 * <br/>
 * They lived in an application's own stylesheet, loaded right after this one, until they moved here unchanged. These
 * tests hold what made the move safe: the section comes after the rules it extends, so the cascade is the one the
 * application had; every token it reads is defined by the framework or given a fallback; it repeats no rule the file
 * already has; and it names no application.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const SCRIPTS = path.join( __dirname, "..", "bin", "static", "scripts" );
const read = ( name ) => fs.readFileSync( path.join( SCRIPTS, name ), "utf8" );
const withoutComments = ( css ) => css.replace( /\/\*[\s\S]*?\*\//g, "" );

const stylesheet = read( "ti-framework.css" );
const SECTION_TITLE = "Shared components (1.51.0, CA-479)";
const sectionStart = stylesheet.lastIndexOf( "/*", stylesheet.indexOf( SECTION_TITLE ) );
const base = withoutComments( stylesheet.slice( 0, sectionStart ) );
const section = withoutComments( stylesheet.slice( sectionStart ) );

// Custom properties a component takes as its input, set on the element that uses it rather than by a theme.
const COMPONENT_INPUTS = new Set( [ "--value", "--share", "--tone", "--tone-soft", "--ti-meter-h" ] );

/**
 * Lists the rules of a stylesheet as normalised "selector { declarations }" strings.
 *
 * @method
 * @param {string} css - The stylesheet, comments removed.
 * @returns {string[]}
 * @private
 */
function rules( css ) {
    return [ ...css.matchAll( /([^{}]+)\{([^{}]*)\}/g ) ].map( ( match ) => `${ match[ 1 ].trim().replace( /\s+/g, " " ) } { ${ match[ 2 ].trim().replace( /\s+/g, " " ) } }` );
}

describe( "the shared components in ti-framework.css", () => {

    it( "defines every component an application builds its screens from", () => {
        for ( const selector of [ ".tone-accent", ".ti-stack-2", ".ti-meter", ".ti-meter-fill", ".ti-stat", ".ti-steps", ".ti-legend", ".ti-dot",
            ".ti-segmented", ".ti-chip", ".ti-drawer", ".ti-drawer-scrim", ".ti-banner", ".ti-kbd", ".ti-action-bar", ".ti-sidebar-item-badge" ] ) {
            assert.match( section, new RegExp( `${ selector.replace( ".", "\\." ) }[\\s,{.:]` ), selector );
        }
    } );

    it( "comes after the rules it extends, so the cascade is the one it had in a stylesheet loaded after this one", () => {
        for ( const selector of [ ".ti-btn", ".ti-tag", ".ti-status-pill", ".ti-empty-state" ] ) {
            assert.ok( base.includes( `${ selector } {` ) || base.includes( `${ selector}{` ), `${ selector } is defined above the section` );
            assert.ok( section.includes( selector ), `${ selector } is extended in the section` );
        }
        // The last section of the file: a rule added after it would sit between the base rules and their extensions.
        assert.equal( stylesheet.indexOf( "/* ====", stylesheet.indexOf( SECTION_TITLE ) ), -1 );
    } );

    it( "reads only tokens the framework defines, a fallback stands in for, or a component takes as its input", () => {
        const themes = [ "ti-framework.css", "ti-theme-daylight.css", "ti-theme-black-glass.css" ].map( read ).join( "\n" );
        const defined = new Set( [ ...themes.matchAll( /(--[\w-]+)\s*:/g ) ].map( ( match ) => match[ 1 ] ) );
        const unresolved = [ ...section.matchAll( /var\(\s*(--[\w-]+)\s*(,)?/g ) ]
            .filter( ( match ) => !match[ 2 ] && !defined.has( match[ 1 ] ) && !COMPONENT_INPUTS.has( match[ 1 ] ) )
            .map( ( match ) => match[ 1 ] );
        assert.deepEqual( [ ...new Set( unresolved ) ], [] );
    } );

    it( "repeats no rule the stylesheet already has", () => {
        // .ti-sr-only and .ti-spacer arrived twice, word for word; a second copy would let the two drift apart.
        const above = new Set( rules( base ) );
        assert.deepEqual( rules( section ).filter( ( rule ) => above.has( rule ) ), [] );
    } );

    it( "names no application, in its rules or its comments", () => {
        const text = stylesheet.slice( sectionStart );
        assert.doesNotMatch( text, /competence|my evaluation|cycle setup/i );
        assert.doesNotMatch( text, /[Ѐ-ӿ]/, "no application's own labels" );
    } );

} );
