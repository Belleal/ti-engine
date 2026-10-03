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
 * Covers where the sidebar flyout places its panel: the user menu, which holds Profile, About and sign-out (CA-408).
 * <br/>
 * The panel used to be placed once, in the `$nextTick` after it was opened. Alpine's `x-show` reveals an element on
 * the next animation frame, after that tick, so the measurement was of a panel still `display: none`: 0x0, which the
 * clamp to the window could not hold. The user menu opens upward from the bottom edge of a button pinned to the bottom
 * of the sidebar, so it opened below the window: measured in Chromium at 1280x844, 112px of its 124px were off the
 * page. The component now places the panel again whenever its size changes, and the clamp holds the panel's own
 * margin, which inside the phone drawer (CA-406) pushed it 12px past the window's edge. In a browser without
 * ResizeObserver it places the panel once more in the frame x-show reveals it in.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The user menu's flyout in a window of the given size, with the framework's own placement for it (`right-end`, no
 * offset), its button pinned to the bottom of a 280px sidebar, and a panel whose size the test sets.
 *
 * @method
 * @param {Object} [options]
 * @param {number} [options.width=1280] The window's width.
 * @param {number} [options.height=844] The window's height.
 * @param {number} [options.margin=20] The panel's computed `margin-left`.
 * @returns {Object}
 * @private
 */
function userMenu( { width = 1280, height = 844, margin = 20 } = {} ) {
    const { stores, components, sandbox } = loadTiFramework();
    sandbox.innerWidth = width;
    sandbox.innerHeight = height;
    sandbox.getComputedStyle = ( element ) => ( { marginLeft: element.marginLeft + "px" } );
    const observers = [];
    sandbox.ResizeObserver = class {
        constructor( callback ) {
            this.callback = callback;
            this.observed = [];
            this.disconnected = false;
            observers.push( this );
        }

        observe( element ) {
            this.observed.push( element );
        }

        disconnect() {
            this.disconnected = true;
        }
    };
    sandbox.CustomEvent = class {
        constructor( type ) {
            this.type = type;
        }
    };
    stores.tiComponentsConfig = { userProfileMenu: { placement: "right-end", offset: 0, fixed: true } };

    const panel = { scrollWidth: 0, scrollHeight: 0, marginLeft: margin, style: {} };
    const button = { getBoundingClientRect: () => ( { left: 12, right: 267, top: 788, bottom: 832, width: 255, height: 44 } ), setAttribute: () => {} };
    const flyout = components.tiComponentSidebarFlyout( "userProfileMenu" );
    // As Alpine runs it: `init` first, and the refs only once Alpine has walked into the component, before the tick.
    const ticks = [];
    flyout.$refs = {};
    flyout.$nextTick = ( callback ) => ticks.push( callback );
    flyout.init();
    flyout.$refs = { flyoutPanel: panel, flyoutButton: button };
    flyout.$nextTick = ( callback ) => callback();
    ticks.forEach( ( callback ) => callback() );

    return {
        flyout: flyout,
        panel: panel,
        sandbox: sandbox,
        observers: observers,
        // What x-show does a frame after `open`: the panel takes its size, which the observer reports.
        reveal: ( panelWidth, panelHeight ) => {
            panel.scrollWidth = panelWidth;
            panel.scrollHeight = panelHeight;
            observers.forEach( ( observer ) => observer.observed.includes( panel ) && observer.callback( [] ) );
        },
        // The panel as drawn: `left` plus its own margin.
        drawn: () => {
            const left = parseFloat( panel.style.left ) + margin;
            const top = parseFloat( panel.style.top );
            return { left: left, top: top, right: left + panel.scrollWidth, bottom: top + panel.scrollHeight };
        }
    };
}

describe( "the sidebar flyout's placement", () => {

    it( "is still unmeasured when open() places it, which is why that placement cannot be the last", () => {
        const menu = userMenu();
        menu.flyout.open();
        // The same numbers Chromium gave: the panel starts at the button's bottom edge, 12px above the window's.
        assert.equal( menu.panel.style.top, "832px" );
    } );

    it( "places the panel again once it has a size, inside the window", () => {
        const menu = userMenu();
        menu.flyout.open();
        menu.reveal( 243, 124 );
        const drawn = menu.drawn();
        assert.equal( drawn.bottom, 832, "it ends at the button's bottom edge, as right-end asks" );
        assert.ok( drawn.top >= 10 && drawn.bottom <= 844 - 10, `top ${ drawn.top }, bottom ${ drawn.bottom }` );
    } );

    it( "keeps the panel's own margin inside a phone's window", () => {
        // Inside the drawer the sidebar is most of a 390px window, so the panel cannot sit beside it and the clamp
        // decides where it goes. Without the margin in the clamp, it ended 12px past the window's right edge.
        const menu = userMenu( { width: 390 } );
        menu.flyout.open();
        menu.reveal( 220, 140 );
        assert.ok( menu.drawn().right <= 390 - 10, `the panel ends at ${ menu.drawn().right }` );
    } );

    it( "leaves a panel that fits beside the sidebar where it was", () => {
        const menu = userMenu();
        menu.flyout.open();
        menu.reveal( 243, 124 );
        assert.equal( menu.panel.style.left, "267px" );
    } );

    it( "watches the panel from the moment the component starts, and stops when it is destroyed", () => {
        const menu = userMenu();
        assert.equal( menu.observers.length, 1 );
        assert.deepEqual( menu.observers[ 0 ].observed, [ menu.panel ] );
        menu.flyout.destroy();
        assert.equal( menu.observers[ 0 ].disconnected, true );
    } );

    it( "asks for no extra frame when a ResizeObserver places the panel", () => {
        const menu = userMenu();
        const frames = [];
        menu.sandbox.requestAnimationFrame = ( callback ) => frames.push( callback );
        menu.flyout.open();
        assert.equal( frames.length, 0 );
    } );

    it( "places the panel inside the window in a browser without ResizeObserver, a frame after it appears", () => {
        // Measured in Chromium at 1280x844 with ResizeObserver removed: the user menu opened at y=832, 12px showing,
        // because nothing placed it again once x-show had revealed it.
        const bare = loadTiFramework();
        bare.sandbox.innerWidth = 1280;
        bare.sandbox.innerHeight = 844;
        bare.sandbox.getComputedStyle = () => ( { marginLeft: "0px" } );
        bare.sandbox.CustomEvent = class {
            constructor( type ) {
                this.type = type;
            }
        };
        // x-show asks for its frame before the tick that placed the panel runs, so its reveal comes first in that frame.
        const panel = { scrollWidth: 0, scrollHeight: 0, style: {} };
        const frames = [ () => {
            panel.scrollWidth = 243;
            panel.scrollHeight = 124;
        } ];
        bare.sandbox.requestAnimationFrame = ( callback ) => frames.push( callback );
        bare.stores.tiComponentsConfig = { userProfileMenu: { placement: "right-end", offset: 0, fixed: true } };
        const flyout = bare.components.tiComponentSidebarFlyout( "userProfileMenu" );
        flyout.$refs = { flyoutPanel: panel, flyoutButton: { getBoundingClientRect: () => ( { left: 12, right: 267, top: 788, bottom: 832, width: 255, height: 44 } ), setAttribute: () => {} } };
        flyout.$nextTick = ( callback ) => callback();
        assert.doesNotThrow( () => flyout.init() );
        assert.doesNotThrow( () => flyout.open() );
        assert.equal( flyout.isOpen, true );
        assert.equal( panel.style.top, "832px", "the tick still measures the hidden panel" );
        frames.forEach( ( frame ) => frame() );
        const top = Number.parseFloat( panel.style.top );
        assert.equal( top + panel.scrollHeight, 832, "it ends at the button's bottom edge, as right-end asks" );
        assert.ok( top >= 10 && top + panel.scrollHeight <= 844 - 10, `top ${ top }, bottom ${ top + panel.scrollHeight }` );
    } );

} );
