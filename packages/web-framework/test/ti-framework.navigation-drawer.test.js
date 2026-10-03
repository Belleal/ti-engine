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
 * Covers the sidebar as a drawer on a narrow screen (CA-406).
 * <br/>
 * The shell's two columns did not fit a phone: measured at 390x844, a 280px sidebar left the screen 110px. Below the
 * breakpoint the sidebar leaves its column and slides in over the screen from a menu button the topbar carries. The
 * store and the component run as real code in the sandbox: the state and the class the stylesheet draws from, the
 * media query, Escape, and the two ways a screen is opened. The stylesheet's rules are read from inside their `@media`
 * block, and its breakpoint is held to the script's.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );
const { readCascade } = require( "./helpers/stylesheet-cascade.js" );
const TiWebAppManager = require( "#web-app-manager" );

const STATIC_ROOT = path.join( __dirname, "..", "bin", "static" );
const read = ( ...parts ) => fs.readFileSync( path.join( STATIC_ROOT, ...parts ), "utf8" );
const component = read( "fragments", "components", "component-navigation-toggle.html" );
const topbar = read( "fragments", "components", "component-topbar.html" );
const script = read( "scripts", "ti-framework.js" );
const styles = read( "scripts", "ti-framework.css" ).replace( /\/\*[\s\S]*?\*\//g, "" );
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

/**
 * A focusable stand-in for an element, recording whether it was given the focus.
 *
 * @method
 * @returns {{focused: boolean, focus: function(): void}}
 * @private
 */
function focusable() {
    return {
        focused: false,
        focus() {
            this.focused = true;
        }
    };
}

/**
 * The shell in a sandbox with a window of the given width, a screen element, a sidebar whose entries can take the
 * focus, and the navigation toggle initialised as Alpine would.
 *
 * @method
 * @param {Object} [options]
 * @param {boolean} [options.narrow=true] Whether the window starts below the breakpoint.
 * @param {boolean} [options.activeEntry=true] Whether the sidebar marks an entry active.
 * @returns {Object}
 * @private
 */
function shell( { narrow = true, activeEntry = true } = {} ) {
    const { stores, components, sandbox, documentListeners } = loadTiFramework();
    const changeListeners = [];
    const query = {
        media: "",
        matches: narrow,
        addEventListener: ( type, listener ) => {
            if ( type === "change" ) {
                changeListeners.push( listener );
            }
        }
    };
    sandbox.matchMedia = ( text ) => {
        query.media = text;
        return query;
    };
    sandbox.htmx = { ajax: () => Promise.resolve() };
    sandbox.history = { pushState: () => {} };

    const screen = { id: "ti-content", inert: false };
    const entries = { active: focusable(), first: focusable() };
    sandbox.document.getElementById = ( id ) => ( id === "ti-content" ? screen : null );
    sandbox.document.querySelector = ( selector ) => {
        if ( selector === ".ti-sidebar .ti-sidebar-item.active" ) {
            return activeEntry ? entries.active : null;
        }
        return selector.startsWith( ".ti-sidebar " ) ? entries.first : null;
    };

    const toggle = components.tiComponentNavigationToggle();
    toggle.$refs = { toggle: focusable() };
    toggle.init();

    const dispatch = ( type, event ) => ( documentListeners.get( type ) || [] ).forEach( ( listener ) => listener( event ) );
    return {
        tiApplication: stores.tiApplication,
        frame: components.tiApplication(),
        toggle: toggle,
        html: sandbox.document.documentElement,
        screen: screen,
        entries: entries,
        query: query,
        resize: ( matches ) => {
            query.matches = matches;
            changeListeners.forEach( ( listener ) => listener() );
        },
        key: ( key ) => dispatch( "keydown", { key: key } ),
        htmx: ( target ) => dispatch( "htmx:beforeRequest", { detail: { target: target } } )
    };
}

/**
 * Whether the drawer is open: the store's flag, the class the stylesheet draws from and the inert screen, which must
 * all agree.
 *
 * @method
 * @param {Object} page
 * @returns {boolean}
 * @private
 */
function isOpen( page ) {
    const open = page.tiApplication.navigationOpen;
    assert.equal( page.html.classList.contains( "ti-navigation-open" ), open, "the store and the html class disagree" );
    assert.equal( page.screen.inert, open, "the screen is inert exactly while the drawer is open" );
    assert.equal( page.toggle.open, open, "the button's aria-expanded reads the store" );
    return open;
}

describe( "the sidebar drawer — the shell's state", () => {

    it( "is a drawer below the breakpoint only, and follows the window across it", () => {
        const page = shell();
        assert.equal( page.query.media, "(max-width: 900px)" );
        assert.equal( page.tiApplication.navigationDrawer, true );
        page.resize( false );
        assert.equal( page.tiApplication.navigationDrawer, false );
        page.resize( true );
        assert.equal( page.tiApplication.navigationDrawer, true );
        assert.equal( shell( { narrow: false } ).tiApplication.navigationDrawer, false );
    } );

    it( "opens and closes from the toggle, with the screen under it inert while it is open", () => {
        const page = shell();
        assert.equal( isOpen( page ), false );
        page.toggle.toggle();
        assert.equal( isOpen( page ), true );
        page.toggle.toggle();
        assert.equal( isOpen( page ), false );
    } );

    it( "moves the focus into the drawer as it opens: to the active entry, or else the first", () => {
        const page = shell();
        page.toggle.toggle();
        assert.equal( page.entries.active.focused, true );

        const unmarked = shell( { activeEntry: false } );
        unmarked.toggle.toggle();
        assert.equal( unmarked.entries.first.focused, true );
    } );

    it( "never opens while the sidebar is a column", () => {
        // An open drawer the stylesheet does not draw would leave the screen inert behind a sidebar in its column.
        const page = shell( { narrow: false } );
        page.toggle.toggle();
        assert.equal( isOpen( page ), false );
        assert.equal( page.entries.active.focused, false );
        page.tiApplication.openNavigation();
        assert.equal( isOpen( page ), false );
    } );

    it( "closes on Escape and gives the focus back to the toggle, and ignores every other key", () => {
        const page = shell();
        page.toggle.toggle();
        page.key( "Enter" );
        assert.equal( isOpen( page ), true );
        page.key( "Escape" );
        assert.equal( isOpen( page ), false );
        assert.equal( page.toggle.$refs.toggle.focused, true );
    } );

    it( "closes from the scrim the same way", () => {
        const page = shell();
        page.toggle.toggle();
        page.toggle.dismiss();
        assert.equal( isOpen( page ), false );
        assert.equal( page.toggle.$refs.toggle.focused, true );
    } );

    it( "closes when the window widens past the breakpoint, leaving the screen usable", () => {
        const page = shell();
        page.toggle.toggle();
        page.resize( false );
        assert.equal( isOpen( page ), false );
    } );

    it( "closes when the sidebar asks HTMX for a screen, and not for a request aimed elsewhere", () => {
        // The sidebar's entries load their screen straight into #ti-content through HTMX. Closing on the request, not
        // the swap, keeps the drawer from standing over the old screen while a sleeping container wakes.
        const page = shell();
        page.toggle.toggle();
        page.htmx( { id: "ti-content-panel" } );
        assert.equal( isOpen( page ), true );
        page.htmx( { id: "ti-content" } );
        assert.equal( isOpen( page ), false );
    } );

    it( "closes when a screen is opened through openScreen", () => {
        const page = shell();
        page.toggle.toggle();
        page.tiApplication.openScreen( "profile" );
        assert.equal( isOpen( page ), false );
    } );

    it( "keeps the collapsed state out of the drawer, and gives it back to the column", () => {
        // A visitor who collapsed the sidebar on a wide screen would otherwise get a drawer of bare icons.
        const page = shell();
        page.tiApplication.collapsed = true;
        assert.equal( page.frame.collapsed, false );
        page.resize( false );
        assert.equal( page.frame.collapsed, true );
    } );

} );

describe( "the sidebar drawer — the toggle's markup", () => {

    it( "reports whether the drawer is open, and is labelled in both languages the framework ships", () => {
        assert.match( component, /<span class="ti-navigation-toggle-slot" x-data="tiComponentNavigationToggle">/ );
        assert.match( component, /<button class="ti-btn icon ghost ti-navigation-toggle" type="button" x-ref="toggle"/ );
        assert.match( component, /x-on:click="toggle\(\)"/ );
        assert.match( component, /x-bind:aria-expanded="open \? 'true' : 'false'"/ );
        assert.match( component, /x-text-label:aria-label="interface.navigation-toggle.label" aria-label="Menu"/ );
        assert.deepEqual( labels.interface[ "navigation-toggle" ].label, { en: "Menu", bg: "Меню" } );
    } );

    it( "teleports its scrim to the body, where a topbar's backdrop filter cannot confine it", () => {
        assert.match( component, /<template x-teleport="body">\s*<div class="ti-navigation-scrim" x-on:click="dismiss\(\)" aria-hidden="true"><\/div>\s*<\/template>/ );
    } );

    it( "never names its own placeholder tag in markup, and the framework's topbar carries it once, first", () => {
        // The placeholder is found with indexOf on "<" plus the tag name, comments included.
        assert.ok( !component.includes( "<ti-component-navigation-toggle-placeholder" ) );
        assert.equal( topbar.split( "<ti-component-navigation-toggle-placeholder" ).length - 1, 1 );
        assert.ok( topbar.indexOf( "<ti-component-navigation-toggle-placeholder" ) < topbar.indexOf( "id=\"ti-topbar-info\"" ) );
    } );

    it( "is drawn inside the framework's topbar when the application shell is assembled", async () => {
        class Harness extends TiWebAppManager {
            constructor() {
                super( "navigation-drawer-test" );
            }
        }
        const html = await new Harness().assembleHtmlView( { user: { userID: "u1" } }, [ STATIC_ROOT ], "/app", { csrfToken: "t", nonce: "n" } );
        const topbarHtml = html.slice( html.indexOf( "<header id=\"ti-topbar\"" ), html.indexOf( "</header>" ) );

        assert.doesNotMatch( html, /ti-component-navigation-toggle-placeholder>/, "an unreplaced placeholder means the component was never resolved" );
        assert.match( topbarHtml, /class="ti-btn icon ghost ti-navigation-toggle"/ );
    } );

} );

describe( "the sidebar drawer — the stylesheet", () => {

    /**
     * The stylesheet's `@media` blocks, each as its condition and its body, braces matched rather than guessed.
     *
     * @method
     * @param {string} source
     * @returns {Array<{condition: string, body: string, start: number, end: number}>}
     * @private
     */
    function mediaBlocks( source ) {
        const blocks = [];
        const pattern = /@media\s*([^{]+)\{/g;
        let found;
        while ( ( found = pattern.exec( source ) ) !== null ) {
            let depth = 1;
            let at = pattern.lastIndex;
            while ( depth > 0 && at < source.length ) {
                depth += ( source[ at ] === "{" ) - ( source[ at ] === "}" );
                at++;
            }
            blocks.push( { condition: found[ 1 ].trim(), body: source.slice( pattern.lastIndex, at - 1 ), start: found.index, end: at } );
            pattern.lastIndex = at;
        }
        return blocks;
    }

    const blocks = mediaBlocks( styles );
    const drawerBlock = blocks.find( ( block ) => block.body.includes( ".ti-navigation-toggle" ) && block.condition.includes( "max-width" ) );
    const drawer = readCascade( drawerBlock ? drawerBlock.body : "" );
    const outside = readCascade( blocks.reduceRight( ( text, block ) => text.slice( 0, block.start ) + text.slice( block.end ), styles ) );
    const SHELL = ".ti-application:has(.ti-navigation-toggle)";

    it( "draws the drawer at the width the script treats as one", () => {
        assert.ok( drawerBlock, "no @media block holds the drawer" );
        const declared = /const NAVIGATION_DRAWER_QUERY = "([^"]+)";/.exec( script );
        assert.ok( declared, "ti-framework.js no longer names the drawer's query" );
        assert.equal( drawerBlock.condition, declared[ 1 ] );
    } );

    it( "turns the shell into one column, as tall as the visible part of the window", () => {
        drawer.assertDeclares( SHELL, "grid-template-columns", "minmax(0, 1fr)" );
        drawer.assertDeclares( SHELL, "height", "100dvh" );
    } );

    it( "keeps the drawer off the screen and out of the tab order until it opens", () => {
        drawer.assertDeclares( `${ SHELL } .ti-sidebar`, "position", "fixed" );
        drawer.assertDeclares( `${ SHELL } .ti-sidebar`, "transform", "translateX(-100%)" );
        drawer.assertDeclares( `${ SHELL } .ti-sidebar`, "visibility", "hidden" );
        drawer.assertDeclares( `html.ti-navigation-open ${ SHELL } .ti-sidebar`, "transform", "none" );
        drawer.assertDeclares( `html.ti-navigation-open ${ SHELL } .ti-sidebar`, "visibility", "visible" );
    } );

    it( "turns a shell into a drawer only where the page holds the toggle", () => {
        // An application whose own topbar predates the toggle keeps its sidebar in the column, cramped but reachable,
        // rather than hidden with nothing to open it.
        const unguarded = drawer.blocks.flatMap( ( block ) => block.selectors )
            .filter( ( selector ) => /\.ti-(application|sidebar)\b/.test( selector ) && !selector.includes( SHELL ) );
        assert.deepEqual( unguarded, [] );
    } );

    it( "shows the toggle and the scrim only on a narrow screen, and the collapse button never there", () => {
        assert.equal( outside.declarations( ".ti-navigation-toggle-slot" ).display, "none" );
        assert.equal( outside.declarations( ".ti-navigation-scrim" ).display, "none" );
        drawer.assertDeclares( ".ti-navigation-toggle-slot", "display", "inline-flex" );
        drawer.assertDeclares( "html.ti-navigation-open .ti-navigation-scrim", "display", "block" );
        drawer.assertDeclares( `${ SHELL } .ti-sidebar-collapse-btn`, "display", "none" );
    } );

    it( "lets the screen's name give way before the topbar's buttons", () => {
        // Measured at 390px: with a screen's own action in the topbar ("New cycle"), the title and subtitle kept their
        // width and pushed the action off the page.
        drawer.assertDeclares( `${ SHELL } #ti-topbar-info`, "min-width", "0" );
        drawer.assertDeclares( `${ SHELL } .ti-topbar-title`, "text-overflow", "ellipsis" );
        drawer.assertDeclares( `${ SHELL } .ti-topbar-title`, "overflow-x", "hidden" );
        drawer.assertDeclares( `${ SHELL } .ti-topbar-sub`, "display", "none" );
    } );

    it( "stacks the drawer over its scrim, both over the topbar and under a modal", () => {
        const drawerLayer = Number( drawer.declarations( `${ SHELL } .ti-sidebar` )[ "z-index" ] );
        const scrimLayer = Number( drawer.declarations( "html.ti-navigation-open .ti-navigation-scrim" )[ "z-index" ] );
        const topbarLayer = Number( outside.declarations( ".ti-topbar" )[ "z-index" ] );
        const modalLayer = Number( outside.declarations( ".ti-modal-backdrop" )[ "z-index" ] );
        assert.ok( topbarLayer < scrimLayer && scrimLayer < drawerLayer && drawerLayer < modalLayer,
            `topbar ${ topbarLayer } < scrim ${ scrimLayer } < drawer ${ drawerLayer } < modal ${ modalLayer }` );
    } );

    it( "keeps the drawer still under reduced motion", () => {
        const reduced = blocks.find( ( block ) => block.condition.includes( "prefers-reduced-motion" ) && block.body.includes( SHELL ) );
        assert.ok( reduced, "no reduced-motion block for the drawer" );
        readCascade( reduced.body ).assertDeclares( `${ SHELL } .ti-sidebar`, "transition", "none" );
    } );

} );
