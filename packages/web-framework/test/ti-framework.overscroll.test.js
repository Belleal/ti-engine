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
 * The shell does not bounce at the end of a scroll (CA-354).
 *
 * Edge on Windows draws an elastic overscroll: scroll past the last line with a touchpad or a wheel and the page
 * stretches, then springs back. Chrome on Windows has no such effect, so the same page stood still in one browser and
 * bounced in the other. It happens where a scroll has nowhere left to go: at the end of the page's own scroller, which
 * hands what is left of the gesture to the document. `overscroll-behavior: none` turns the effect off and ends the
 * hand-over; `contain`, which the sidebar carried, ends only the hand-over and still lets the scroller itself bounce.
 *
 * Chromium on Linux, where these suites run, has no elastic overscroll to measure, so this pins the declarations: on
 * the document, on every scroller the stylesheet declares, and as a sweep, so that a scroller added later without it
 * fails here rather than bouncing in Edge.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { readCascade } = require( "./helpers/stylesheet-cascade" );

const styles = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" );
const { blocks, assertDeclares } = readCascade( styles );

// The shell's scrollers, as the screens use them: the page (`.ti-page-scrollable`, or `.ti-content.pane` where a page
// lays itself out as panes), the sidebar, and a modal's body.
const SHELL_SCROLLERS = Object.freeze( [ ".ti-page-scrollable", ".ti-content.pane", ".ti-sidebar", ".ti-modal-body" ] );

describe( "the shell does not bounce at the end of a scroll", () => {

    it( "turns the effect off on the document, on both the root and the body", () => {
        // The root's value is the viewport's. Both are named because engines have taken the viewport's value from
        // either, and this body propagates its `overflow: hidden` to the viewport.
        assertDeclares( "html", "overscroll-behavior", "none", "the document's own overscroll must be off" );
        assertDeclares( "body", "overscroll-behavior", "none", "the document's own overscroll must be off" );
    } );

    for ( const selector of SHELL_SCROLLERS ) {
        it( `turns it off on ${ selector }`, () => {
            assertDeclares( selector, "overscroll-behavior", "none", `${ selector } scrolls, and with anything but none it bounces in Edge or hands the bounce on` );
        } );
    }

    it( "leaves no scroller in the stylesheet without it", () => {
        // A sweep, not the list above: a scroller the shell gains later is caught here, before it bounces.
        const scrollers = blocks
            .filter( ( block ) => [ "overflow-x", "overflow-y" ].some( ( axis ) => /^(auto|scroll)$/.test( block.declarations[ axis ] || "" ) ) )
            .flatMap( ( block ) => block.selectors );
        assert.ok( scrollers.length > 0, "found no scroller at all, so the sweep is reading the stylesheet wrongly" );
        for ( const selector of scrollers ) {
            assertDeclares( selector, "overscroll-behavior", "none", `${ selector } scrolls without overscroll-behavior: none` );
        }
        assert.deepEqual( [ ...new Set( scrollers ) ].sort(), [ ...SHELL_SCROLLERS ].sort(), "a scroller was added or removed: name it in SHELL_SCROLLERS" );
    } );

} );
