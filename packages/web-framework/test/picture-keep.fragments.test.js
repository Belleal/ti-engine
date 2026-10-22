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
 * What a picture sent with feedback keeps of the framework's own screens (1.58.2, CA-551). The picture blanks every
 * text drawn other than through `x-text-label` unless it, or an element around it, carries `data-ti-keep` (1.58.0,
 * CA-544). The framework's shell and screens marked nothing, so a picture of them blanked their own titles and
 * labels, and the reader could not tell which screen the feedback was about.
 *
 * Every text a framework fragment binds is either kept, or blanked on purpose and listed below with its reason. A new
 * binding is a decision: mark it, or add it here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const FRAGMENTS = path.join( __dirname, "..", "bin", "static", "fragments" );
const FILES = [
    ...fs.readdirSync( FRAGMENTS ).filter( ( file ) => file.endsWith( ".html" ) ),
    ...fs.readdirSync( path.join( FRAGMENTS, "components" ) ).filter( ( file ) => file.endsWith( ".html" ) ).map( ( file ) => `components/${ file }` )
].sort();

// Elements that never hold content, so never close.
const VOID_ELEMENTS = new Set( [ "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr" ] );

/**
 * The opening tags of a fragment, each with the tags it sits inside: enough structure to tell whether a binding is
 * inside a mark, without a parser the package does not depend on.
 *
 * @param {string} html
 * @returns {Array<{attributes: string, ancestors: string[]}>}
 * @private
 */
function openingTags( html ) {
    const source = html.replace( /<!--[\s\S]*?-->/g, "" );
    const pattern = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const stack = [];
    const tags = [];
    let match;
    while ( ( match = pattern.exec( source ) ) !== null ) {
        const [ , closing, name, attributes ] = match;
        const tag = name.toLowerCase();
        if ( closing ) {
            const at = stack.map( ( entry ) => entry.tag ).lastIndexOf( tag );
            if ( at >= 0 ) {
                stack.length = at;
            }
            continue;
        }
        tags.push( { attributes: attributes, ancestors: stack.map( ( entry ) => entry.attributes ) } );
        if ( !VOID_ELEMENTS.has( tag ) && !attributes.trim().endsWith( "/" ) ) {
            stack.push( { tag: tag, attributes: attributes } );
        }
    }
    return tags;
}

const binding = ( attributes ) => {
    const match = /\sx-(?:text|html)="([^"]*)"/.exec( attributes );
    return match ? match[ 1 ] : null;
};
const isMark = ( attributes ) => /\s(data-ti-keep|x-text-label)(?=[\s=/]|$)/.test( attributes );

// Blanked on purpose: each names, or may name, a person, or carries what they typed or when.
const BLANKED = [
    [ "components/component-sidebar.html", "user.name ) || '?' ).charAt( 0 )", "the signed-in person's initial" ],
    [ "components/component-sidebar.html", "$store.tiApplication.user.name ) || ''", "the signed-in person's name" ],
    [ "components/component-sidebar.html", "$store.tiApplication.user.email ) || ''", "their e-mail" ],
    [ "components/component-topbar.html", "$store.tiApplication.topbarSubtitle", "an application may name a person here" ],
    [ "components/component-notification-bar.html", "n.title || ''", "a notice may name a record or a person" ],
    [ "components/component-notification-bar.html", "n.message || ''", "a notice may name a record or a person" ],
    [ "components/component-notification-bar.html", "n.details || ''", "a notice may name a record or a person" ],
    [ "components/component-tooltip.html", "text", "an application's tooltip may hold anything" ],
    [ "frame-profile.html", "avatarInitial()", "the person's initial" ],
    [ "frame-profile.html", "profile.identity.name", "their name" ],
    [ "frame-profile.html", "profile.identity.badge.text", "their role" ],
    [ "frame-profile.html", "profile.identity.subtitle", "their e-mail" ],
    [ "frame-profile.html", "profile.identity.caption", "their record" ],
    [ "frame-profile.html", "tag.text", "their roles" ],
    [ "frame-profile.html", "item.value", "their recorded values" ],
    [ "frame-about.html", "item.value", "an application may contribute a section of its own" ],
    [ "frame-feedback-inbox.html", "senderText( item )", "who sent it" ],
    [ "frame-feedback-inbox.html", "dateText( item )", "when" ],
    [ "frame-feedback-inbox.html", "item.text", "what they wrote" ],
    [ "frame-feedback-inbox.html", "line.value", "their browser, version and screen" ],
    [ "frame-feedback-inbox.html", "choice.name", "an option of a select, whose value the picture blanks anyway" ],
    [ "frame-feedback-inbox.html", "option.name", "an option of a select, whose value the picture blanks anyway" ],
    [ "frame-login.html", "email", "the address typed to sign in; the sign-in page is never pictured, as feedback needs a session" ]
];

describe( "a picture of the framework's own screens (CA-551)", () => {

    it( "keeps every text a fragment binds, or blanks it on purpose with a reason", () => {
        const used = new Map( BLANKED.map( ( entry ) => [ entry, 0 ] ) );
        const unkept = [];
        for ( const file of FILES ) {
            for ( const tag of openingTags( fs.readFileSync( path.join( FRAGMENTS, file ), "utf8" ) ) ) {
                const expression = binding( tag.attributes );
                if ( expression === null || isMark( tag.attributes ) || tag.ancestors.some( isMark ) ) {
                    continue;
                }
                const entry = BLANKED.find( ( [ blankedFile, blanked ] ) => blankedFile === file && expression.includes( blanked ) );
                if ( entry ) {
                    used.set( entry, used.get( entry ) + 1 );
                } else {
                    unkept.push( `${ file }: x-text="${ expression }"` );
                }
            }
        }
        assert.deepEqual( unkept, [], "bound, neither kept nor listed as blanked" );
        assert.deepEqual( [ ...used ].filter( ( [ , count ] ) => count === 0 ).map( ( [ entry ] ) => `${ entry[ 0 ] }: ${ entry[ 1 ] }` ), [], "listed, and no longer bound" );
    } );

    it( "keeps no text that names a person", () => {
        const personal = /\buser\b|identity|sender|submittedAt|dateText|item\.text|\.value\b|e-?mail|topbarSubtitle/;
        const leaks = [];
        for ( const file of FILES ) {
            for ( const tag of openingTags( fs.readFileSync( path.join( FRAGMENTS, file ), "utf8" ) ) ) {
                const expression = binding( tag.attributes );
                if ( expression !== null && ( isMark( tag.attributes ) || tag.ancestors.some( isMark ) ) && personal.test( expression ) ) {
                    leaks.push( `${ file }: x-text="${ expression }"` );
                }
            }
        }
        assert.deepEqual( leaks, [] );
    } );

    it( "keeps the screen's title and each screen's head, so a picture says where it was taken", () => {
        const topbar = openingTags( fs.readFileSync( path.join( FRAGMENTS, "components", "component-topbar.html" ), "utf8" ) );
        assert.ok( topbar.some( ( tag ) => binding( tag.attributes ) === "screenTitle" && isMark( tag.attributes ) ) );
        for ( const file of [ "frame-whats-new.html", "frame-send-feedback.html", "frame-feedback-inbox.html" ] ) {
            const heads = openingTags( fs.readFileSync( path.join( FRAGMENTS, file ), "utf8" ) ).filter( ( tag ) => /class="ti-page-head"/.test( tag.attributes ) );
            assert.ok( heads.length === 1 && isMark( heads[ 0 ].attributes ), file );
        }
    } );

} );
