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
 * `.ti-sidebar` overflow — the entries past the fold, and how they were lost.
 *
 * The sidebar is a `height: 100vh` flex column and a consuming application appends its own sections as direct
 * children. It used to declare `overflow: hidden`, so once those sections exceeded the viewport the excess was
 * clipped and there was no way for a visitor to reach it. Measured against real Chromium with competence's 21
 * entries at 1440x800: 1094px of content in an 800px box, and a mouse wheel over the sidebar moved it 0px.
 *
 * What went under the fold included `.ti-sidebar-foot`, which carries the theme toggle and the user menu — and the
 * user menu is where sign-out lives. That held at every height tested: the footer's bottom edge landed at 1082px
 * whether the viewport was 640px or 1080px, because the column never compressed, it was simply cut. On a 1080px
 * monitor only the last section label visibly broke, which is why this read as a cosmetic squash for so long.
 *
 * The one element that did compress is `.ti-sidebar-section-label`. Alone among the children it declares no
 * `min-height`, so it absorbed the whole of the column's shrink and clipped its own text — 25px down to 14px,
 * which is what made "QUICK LINKS" unreadable while the entries above it looked untouched.
 *
 * These assertions pin the CSS contract that fixes it. They are deliberately about declarations rather than
 * rendered geometry: the suite is `node --test` with no DOM, and the alternative — asserting nothing and trusting
 * the stylesheet — is what let the original defect ship.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const styles = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" );

const withoutComments = styles.replace( /\/\*[\s\S]*?\*\//g, "" );

/**
 * Resolves the declarations that actually apply to `selector`, in cascade order.
 *
 * The stylesheet declares `.ti-sidebar` twice — a legacy rule and the app-shell rule several hundred lines later —
 * so reading the first block found would assert against a rule the browser overrides. This walks every block whose
 * selector list is exactly `selector` and lets later declarations win, which is what the browser does at equal
 * specificity, and is what makes these assertions catch a *later* rule reintroducing the defect.
 *
 * `overflow` is expanded because the shorthand is the regression: `overflow: hidden` sets `overflow-y` back to
 * hidden without ever naming it.
 */
function declarations( selector ) {
    const escaped = selector.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" );
    const pattern = new RegExp( "(?:^|\\}|\\*\\/)\\s*" + escaped + "\\s*\\{([^}]*)\\}", "g" );
    const resolved = {};
    let found = false;
    let block;
    while ( ( block = pattern.exec( withoutComments ) ) !== null ) {
        found = true;
        for ( const declaration of block[ 1 ].split( ";" ) ) {
            const at = declaration.indexOf( ":" );
            if ( at < 0 ) { continue; }
            const property = declaration.slice( 0, at ).trim();
            const value = declaration.slice( at + 1 ).trim();
            if ( !property ) { continue; }
            if ( property === "overflow" ) {
                resolved[ "overflow-x" ] = value;
                resolved[ "overflow-y" ] = value;
            }
            resolved[ property ] = value;
        }
    }
    assert.ok( found, `no rule found for selector "${ selector }"` );
    return resolved;
}

/**
 * Asserts the effective value of one property on one selector.
 */
function assertDeclares( selector, property, expected, message ) {
    const value = declarations( selector )[ property ];
    assert.ok( value !== undefined, `${ selector } declares no ${ property }` );
    if ( expected instanceof RegExp ) {
        assert.match( value, expected, message );
    } else {
        assert.equal( value, expected, message );
    }
}

describe( ".ti-sidebar scrolls its overflow instead of clipping it", () => {

    it( "declares a vertical scroller, after the whole cascade", () => {
        // Resolved rather than read from one block: `overflow: hidden` in any later `.ti-sidebar` rule would put
        // the defect straight back, and would not mention overflow-y while doing it.
        assertDeclares( ".ti-sidebar", "overflow-y", "auto", "the sidebar must scroll, or entries past the fold are unreachable" );
    } );

    it( "keeps the horizontal axis clipped", () => {
        // Not cosmetic: a scroller on one axis forces the other to compute to a non-visible value, so leaving
        // overflow-x unstated would hand the sidebar a horizontal scrollbar rather than the clip it has always had.
        assertDeclares( ".ti-sidebar", "overflow-x", "hidden" );
    } );

    it( "carries no vertical padding of its own", () => {
        // The padding moved onto the pinned rows. Inside the scrollport it sits *above* the sticky brand and
        // *below* the sticky footer, and the list scrolls visibly through both gaps.
        //
        // The shorthand has to be resolved rather than pattern-matched: the value this replaced was
        // `padding: var(--s-3) 0 var(--s-3)`, whose *horizontal* zero satisfies a naive "contains 0" test while
        // both vertical sides are 12px — which is the gap in question.
        const resolved = declarations( ".ti-sidebar" );
        const vertical = {};
        if ( resolved.padding !== undefined ) {
            // `var(--x)` contains no spaces in this stylesheet, so splitting on whitespace is safe here.
            const sides = resolved.padding.trim().split( /\s+/ );
            vertical.top = sides[ 0 ];
            vertical.bottom = sides.length >= 3 ? sides[ 2 ] : sides[ 0 ];
        }
        if ( resolved[ "padding-top" ] !== undefined ) { vertical.top = resolved[ "padding-top" ]; }
        if ( resolved[ "padding-bottom" ] !== undefined ) { vertical.bottom = resolved[ "padding-bottom" ]; }

        for ( const [ side, value ] of Object.entries( vertical ) ) {
            assert.match( value, /^0[a-z%]*$/, `padding-${ side }: ${ value } on .ti-sidebar is a bleed-through gap inside the scrollport` );
        }
    } );

} );

describe( "nothing in the sidebar column is allowed to shrink", () => {

    it( "pins flex-shrink on every child", () => {
        assertDeclares( ".ti-sidebar > *", "flex-shrink", "0" );
    } );

    it( "matches every child rather than the section label alone", () => {
        // The label is the only child that squashed, but the children belong to the consuming application: a
        // rule naming `.ti-sidebar-section-label` would not cover the next unfloored element someone adds.
        assert.ok( styles.includes( ".ti-sidebar > *" ), "the shrink guard must be on the universal child selector" );
    } );

} );

describe( "the brand and the footer stay on screen while the list scrolls", () => {

    for ( const [ selector, edge ] of [ [ ".ti-sidebar-brand", "top" ], [ ".ti-sidebar-foot", "bottom" ] ] ) {

        it( `${ selector } is sticky to its ${ edge }`, () => {
            assertDeclares( selector, "position", "sticky", `${ selector } must be sticky or it scrolls out of reach` );
            assertDeclares( selector, edge, "0", `${ selector } must pin to ${ edge }: 0` );
        } );

        it( `${ selector } paints an opaque background`, () => {
            // `--sidebar-bg` is translucent in the glass theme, so a pinned row painted with it alone lets the
            // scrolling list show through. Compositing it over `--bg-app` reproduces the sidebar's own rendered
            // colour while being fully opaque, and is a no-op where `--sidebar-bg` is already solid.
            assertDeclares(
                selector,
                "background",
                /linear-gradient\(\s*var\(--sidebar-bg\)\s*,\s*var\(--sidebar-bg\)\s*\)\s*,\s*var\(--bg-app\)/,
                `${ selector } needs an opaque background or the list bleeds through it`
            );
        } );

    }

    it( "the footer still falls to the bottom when the list is short enough to fit", () => {
        // `margin-top: auto` is what does that, and sticky only takes over once there is no free space to
        // distribute. Dropping it would strand the footer directly under the last entry on a short sidebar.
        assertDeclares( ".ti-sidebar-foot", "margin-top", "auto" );
    } );

} );

describe( "the collapse button survives the sidebar becoming a scroller", () => {

    it( "is sticky rather than absolute", () => {
        // An absolutely positioned child of a scroll container scrolls with the content, so the button slid out
        // of view the moment the list moved.
        assertDeclares( ".ti-sidebar-collapse-btn", "position", "sticky" );
    } );

    it( "keeps the overhang past the sidebar edge that `right: -12px` used to give it", () => {
        assertDeclares( ".ti-sidebar-collapse-btn", "align-self", "flex-end" );
        assertDeclares( ".ti-sidebar-collapse-btn", "margin-right", "-12px" );
    } );

    it( "takes no vertical space in the column", () => {
        // It was out of flow before; without the negative margin it would push the brand down by its own height.
        assertDeclares( ".ti-sidebar-collapse-btn", "margin-bottom", "-22px" );
    } );

} );
