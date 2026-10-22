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
 * Every text a framework fragment binds or writes is either kept, or blanked on purpose and listed below with its
 * reason. A new binding is a decision: mark it, or add it here. Kept: what names no person and is no number or date,
 * as the picture's small print promises; only single texts are marked, and nothing an application may supply.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );
const { tokenize, attributeOf } = require( "./helpers/markup.js" );

const FRAGMENTS = path.join( __dirname, "..", "bin", "static", "fragments" );
const FILES = [
    ...fs.readdirSync( FRAGMENTS ).filter( ( file ) => file.endsWith( ".html" ) ),
    ...fs.readdirSync( path.join( FRAGMENTS, "components" ) ).filter( ( file ) => file.endsWith( ".html" ) ).map( ( file ) => `components/${ file }` )
].sort();

// What a mark may hold: text, and the inline elements that style part of it, such as a title's emphasis.
const INLINE = new Set( [ "span", "em", "strong", "b", "i", "br" ] );

/**
 * A fragment's elements and text runs, each with the elements it sits inside, from the shared linear scanner.
 * <br/>
 * A `<template>` is no element's ancestor here, as it is none on the page: Alpine puts its clones beside it, and the
 * picture skips it. A mark on a template would mark nothing that is drawn (the review pass).
 *
 * @param {string} html
 * @returns {{elements: Array<{name: string, tag: string, ancestors: string[]}>, texts: Array<{text: string, parent: (string|null), ancestors: string[]}>}}
 * @private
 */
function scan( html ) {
    const stack = [];
    const elements = [];
    const texts = [];
    const drawn = () => stack.filter( ( entry ) => entry.name !== "template" ).map( ( entry ) => entry.tag );
    for ( const token of tokenize( html ) ) {
        if ( token.type === "text" ) {
            const text = token.text.trim();
            if ( /\p{L}/u.test( text ) && !stack.some( ( entry ) => entry.name === "script" || entry.name === "style" ) ) {
                texts.push( { text: text, parent: stack.length > 0 ? stack[ stack.length - 1 ].tag : null, ancestors: drawn() } );
            }
        } else if ( token.type === "close" ) {
            const at = stack.map( ( entry ) => entry.name ).lastIndexOf( token.name );
            if ( at >= 0 ) {
                stack.length = at;
            }
        } else {
            elements.push( { name: token.name, tag: token.tag, ancestors: drawn() } );
            if ( !token.selfClosing ) {
                stack.push( { name: token.name, tag: token.tag } );
            }
        }
    }
    return { elements, texts };
}

const read = ( file ) => scan( fs.readFileSync( path.join( FRAGMENTS, file ), "utf8" ) );
// An element's bound text, in either quote style: one quote style alone let a binding pass unseen (the review pass).
const binding = ( tag ) => {
    const text = attributeOf( tag, "x-text" );
    return ( text !== null ) ? text : attributeOf( tag, "x-html" );
};
// A mark the picture reads: `data-ti-keep` itself (never `x-bind:data-ti-keep`, which is a decision taken at run time),
// or a catalogue label.
const hasKeep = ( tag ) => /\sdata-ti-keep(?=[\s=/]|$)/.test( tag );
// `x-text-label:aria-label` is another attribute, which keeps nothing drawn: the picture matches `[x-text-label]` alone.
const isMark = ( tag ) => hasKeep( tag ) || /\sx-text-label(?=[\s=/]|$)/.test( tag );
const isKept = ( item ) => item.ancestors.some( isMark );

// Blanked on purpose, by exact expression: each names, or may name, a person, or is a number or a date, which the
// picture's small print promises to blank. A new binding is a decision: mark it, or add it here with its reason.
const BLANKED = [
    [ "components/component-sidebar.html", "( ( $store.tiApplication.user && $store.tiApplication.user.name ) || '?' ).charAt( 0 ).toUpperCase()", "the signed-in person's initial" ],
    [ "components/component-sidebar.html", "( $store.tiApplication.user && $store.tiApplication.user.name ) || ''", "their name" ],
    [ "components/component-sidebar.html", "( $store.tiApplication.user && $store.tiApplication.user.email ) || ''", "their e-mail" ],
    [ "components/component-sidebar-flyout.html", "buttonConfig.title", "the user menu is left out of the picture whole (PICTURE_EXCLUDED)" ],
    [ "components/component-topbar.html", "screenTitle", "kept only while it is the screen's label (x-bind:data-ti-keep): an application's own title may name a person" ],
    [ "components/component-topbar.html", "$store.tiApplication.topbarSubtitle", "an application may name a person here" ],
    [ "components/component-notification-bar.html", "n.title || ''", "a notice may name a record or a person" ],
    [ "components/component-notification-bar.html", "n.message || ''", "a notice may name a record or a person" ],
    [ "components/component-notification-bar.html", "n.details || ''", "a notice may name a record or a person" ],
    [ "components/component-tooltip.html", "text", "an application's tooltip may hold anything" ],
    [ "frame-login.html", "email", "the address typed to sign in; the sign-in page is never pictured, as feedback needs a session" ],
    [ "frame-profile.html", "avatarInitial()", "the person's initial" ],
    [ "frame-profile.html", "profile.identity.name", "their name" ],
    [ "frame-profile.html", "profile.identity.badge.text", "their role" ],
    [ "frame-profile.html", "profile.identity.subtitle", "their e-mail" ],
    [ "frame-profile.html", "profile.identity.caption", "their record" ],
    [ "frame-profile.html", "tag.text", "their roles" ],
    [ "frame-profile.html", "section.title", "an application may add a section of its own" ],
    [ "frame-profile.html", "section.description", "an application may add a section of its own" ],
    [ "frame-profile.html", "item.label", "an application may add a section of its own" ],
    [ "frame-profile.html", "item.value", "their recorded values" ],
    [ "frame-about.html", "applicationInitial()", "the application's own text, which the framework cannot vouch for" ],
    [ "frame-about.html", "application.name", "the application's own text, which the framework cannot vouch for" ],
    [ "frame-about.html", "application.description", "the application's own text, which may hold a number" ],
    [ "frame-about.html", "versionTag()", "a version number" ],
    [ "frame-about.html", "releaseDateText()", "a date" ],
    [ "frame-about.html", "section.title", "an application may add a section of its own" ],
    [ "frame-about.html", "section.description", "an application may add a section of its own" ],
    [ "frame-about.html", "item.label", "an application may add a section of its own" ],
    [ "frame-about.html", "item.value", "an application may add a section of its own" ],
    [ "frame-whats-new.html", "updatedText", "a date and a version" ],
    [ "frame-whats-new.html", "note.title", "the application's own words, which may hold a number" ],
    [ "frame-whats-new.html", "note.text", "the application's own words, which may hold a number" ],
    [ "frame-whats-new.html", "releaseText( entry )", "a version and a date" ],
    [ "frame-send-feedback.html", "remainingText", "a number" ],
    [ "frame-feedback-inbox.html", "choice.text", "each status's count" ],
    [ "frame-feedback-inbox.html", "choice.name", "an option of a select, whose value the picture blanks anyway" ],
    [ "frame-feedback-inbox.html", "option.name", "an option of a select, whose value the picture blanks anyway" ],
    [ "frame-feedback-inbox.html", "senderText( item )", "who sent it" ],
    [ "frame-feedback-inbox.html", "dateText( item )", "when" ],
    [ "frame-feedback-inbox.html", "item.text", "what they wrote" ],
    [ "frame-feedback-inbox.html", "line.value", "their browser, version and screen" ]
];

describe( "a picture of the framework's own screens (CA-551)", () => {

    it( "keeps every text a fragment binds, or blanks it on purpose with a reason", () => {
        const used = new Map( BLANKED.map( ( entry ) => [ entry, 0 ] ) );
        const unkept = [];
        for ( const file of FILES ) {
            for ( const element of read( file ).elements ) {
                const expression = binding( element.tag );
                if ( expression === null || isMark( element.tag ) || isKept( element ) ) {
                    continue;
                }
                const entry = BLANKED.find( ( [ blankedFile, blanked ] ) => blankedFile === file && expression === blanked );
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

    it( "keeps every fixed word the framework writes itself, not only the bound ones", () => {
        // The sign-in page is never pictured: Send Feedback needs a session.
        const pictured = FILES.filter( ( file ) => !/(^|\/)(frame|component)-login/.test( file ) );
        const unkept = [];
        for ( const file of pictured ) {
            for ( const text of read( file ).texts ) {
                // Text inside a binding or a label is the fallback that binding replaces; the test above decides it. A
                // `{placeholder}` is filled by the server with markup of its own.
                const replaced = text.parent !== null && ( binding( text.parent ) !== null || /\sx-text-label=/.test( text.parent ) );
                if ( !replaced && !isKept( text ) && !/^\{[\w-]+\}$/.test( text.text ) ) {
                    unkept.push( `${ file }: ${ text.text.slice( 0, 60 ) }` );
                }
            }
        }
        assert.deepEqual( unkept, [] );
    } );

    it( "keeps no text that names a person", () => {
        const personal = /\buser\b|identity|sender|submittedAt|dateText|item\.text|\.value\b|e-?mail|topbarSubtitle|section\.|item\.label/;
        const leaks = [];
        for ( const file of FILES ) {
            for ( const element of read( file ).elements ) {
                const expression = binding( element.tag );
                if ( expression !== null && ( isMark( element.tag ) || isKept( element ) ) && personal.test( expression ) ) {
                    leaks.push( `${ file }: x-text="${ expression }"` );
                }
            }
        }
        assert.deepEqual( leaks, [] );
    } );

    it( "marks single texts, never a container, so nothing added inside one later is kept by accident", () => {
        // Inside a mark, only inline text: a mark on a panel, a list or a row would keep whatever is added to it later,
        // a name, an image or a typed value included (the review pass).
        const inside = [];
        for ( const file of FILES ) {
            for ( const element of read( file ).elements ) {
                if ( element.ancestors.some( hasKeep ) && !INLINE.has( element.name ) ) {
                    inside.push( `${ file }: <${ element.tag.slice( 0, 70 ) }` );
                }
            }
        }
        assert.deepEqual( inside, [] );
    } );

    it( "keeps the screen's title while it is the screen's label, and not once an application sets its own", () => {
        const { stores, components } = loadTiFramework();
        stores.tiApplication.configuration = { labels: { interface: { topbar: { dashboard: "Dashboard" } } } };
        stores.tiApplication.currentScreen = "dashboard";
        const topbar = components.tiComponentTopbar();
        const watchers = [];
        topbar.$watch = ( getter, callback ) => watchers.push( { getter, callback } );
        topbar.init();
        assert.equal( topbar.screenTitle, "Dashboard" );
        assert.equal( topbar.titleIsLabel, true );
        stores.tiApplication.screenTitleOverride = "Evaluation of Jane Doe";
        watchers.forEach( ( watcher ) => watcher.callback( watcher.getter() ) );
        assert.equal( topbar.screenTitle, "Evaluation of Jane Doe" );
        assert.equal( topbar.titleIsLabel, false, "an application's own title may name a person" );
        stores.tiApplication.setScreenTitle( "Results", { isLabel: true } );
        watchers.forEach( ( watcher ) => watcher.callback( watcher.getter() ) );
        assert.equal( topbar.titleIsLabel, true, "one the application declares a catalogue label is kept" );
        // And the fragment binds the mark to it: an inverted or misnamed binding would keep the person's name.
        const title = read( "components/component-topbar.html" ).elements.find( ( element ) => binding( element.tag ) === "screenTitle" );
        assert.equal( attributeOf( title.tag, "x-bind:data-ti-keep" ), "titleIsLabel ? '' : false" );
    } );

    it( "keeps the title of each of the framework's screens", () => {
        for ( const file of [ "frame-whats-new.html", "frame-send-feedback.html", "frame-feedback-inbox.html" ] ) {
            const titles = read( file ).elements.filter( ( element ) => element.name === "h1" && attributeOf( element.tag, "class" ) === "ti-page-title" );
            assert.ok( titles.length === 1 && isMark( titles[ 0 ].tag ), file );
        }
    } );

} );
