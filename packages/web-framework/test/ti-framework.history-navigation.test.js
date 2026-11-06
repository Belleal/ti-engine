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
 * Covers the browser's Back and Forward opening the screen the address names (CA-570).
 * <br/>
 * The shell pushes an address with no state when it opens a screen, so Back from one changed the address and left the
 * screen on show, with the sidebar lit for the address and the screen for another. Back to an entry HTMX pushed itself
 * (`hx-push-url`, as the landing Dashboard does) made HTMX reload the whole page, since it keeps no snapshot
 * (`historyCacheSize` 0). Measured in Chromium on HTMX 2.0.11 with the application's Organization screen, which keeps its
 * folded teams for the page: after Back it was open and at the top again, whichever of the two Back was.
 * <br/>
 * The real script runs in the sandbox, with the page's `load` event fired and HTMX's own `onpopstate` standing in for
 * the one HTMX sets when the document has been parsed.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The shell with HTMX's handler in place, the way the browser has it once the page has loaded, on the address it was
 * loaded at.
 *
 * @method
 * @param {string} [start] - The address the page was loaded at.
 * @returns {{tiApplication: Object, sandbox: Object, documentListeners: Map, log: Array<Array<string>>, navigate: function( string, Object ): void}}
 * @private
 */
function shell( start = "/app/dashboard" ) {
    const at = ( address ) => {
        const [ pathname, search ] = address.split( "?" );
        return { pathname: pathname, search: search ? "?" + search : "", href: address };
    };
    const { stores, sandbox, windowListeners, documentListeners } = loadTiFramework( {
        beforeRun: ( box ) => {
            box.location = at( start );
            box.document.readyState = "loading";
        }
    } );
    const log = [];
    const content = { id: "ti-content", contains: () => false };
    sandbox.document.getElementById = ( id ) => ( id === "ti-content" ? content : null );
    sandbox.htmx = {
        trigger: () => {},
        ajax: ( verb, url ) => {
            log.push( [ "ajax", url ] );
            return new Promise( () => {} );
        }
    };
    sandbox.history = { pushState: ( state, title, url ) => log.push( [ "pushState", url ] ) };
    // HTMX sets its handler when the document has been parsed, before the `load` event the framework waits for.
    sandbox.onpopstate = ( event ) => log.push( [ "htmx", event.state && event.state.htmx ? "restore" : "other" ] );
    ( windowListeners.get( "load" ) || [] ).forEach( ( listener ) => listener() );
    stores.tiApplication.closeNavigation = () => log.push( [ "closeNavigation" ] );
    return {
        tiApplication: stores.tiApplication,
        sandbox: sandbox,
        documentListeners: documentListeners,
        log: log,
        // As the browser does on Back or Forward: the address first, then the event, with the entry's state.
        navigate: ( address, state = null ) => {
            sandbox.location = at( address );
            sandbox.onpopstate( { state: state } );
        }
    };
}

describe( "the browser's Back and Forward open the screen the address names (CA-570)", () => {

    it( "loads the screen of the address the history moved to, and pushes nothing", () => {
        const page = shell();

        page.navigate( "/app/employees-list?employeeID=3" );

        assert.deepEqual( page.log, [ [ "closeNavigation" ], [ "ajax", "/app/employees-list?employeeID=3" ] ] );
        assert.equal( page.tiApplication.currentScreen, "employees-list", "so the sidebar and the title follow the screen shown" );
    } );

    it( "does the same for an entry HTMX pushed, which it would have reloaded the page for", () => {
        const page = shell( "/app/employees-list" );

        page.navigate( "/app/dashboard", { htmx: true } );

        assert.deepEqual( page.log, [ [ "closeNavigation" ], [ "ajax", "/app/dashboard" ] ], "HTMX's handler is not reached" );
    } );

    it( "leaves an address that names no screen to HTMX, as before", () => {
        const page = shell();

        page.navigate( "/" );
        page.navigate( "/", { htmx: true } );

        assert.deepEqual( page.log, [ [ "htmx", "other" ], [ "htmx", "restore" ] ] );
    } );

    it( "resets the screen's title and replaces what an earlier screen set, as opening a screen does", () => {
        const page = shell();
        page.tiApplication.screenTitleOverride = "An evaluation's name";
        page.tiApplication.screenTitleIsLabel = true;

        page.navigate( "/app/reports" );

        assert.equal( page.tiApplication.screenTitleOverride, "" );
        assert.equal( page.tiApplication.screenTitleIsLabel, false );
    } );

    it( "still pushes the address of a screen the shell opens itself", () => {
        const page = shell();

        page.tiApplication.openScreen( "reports?x=1" );

        assert.deepEqual( page.log, [ [ "closeNavigation" ], [ "pushState", "/app/reports?x=1" ], [ "ajax", "/app/reports?x=1" ] ] );
    } );

    it( "loads nothing for a move between two fragments of the screen on show", () => {
        const page = shell();
        page.tiApplication.openScreen( "guide" );
        page.log.length = 0;

        page.navigate( "/app/guide" );

        assert.deepEqual( page.log, [ [ "htmx", "other" ] ], "an anchor link's entry is the same screen, and its place in it is the browser's" );
        page.navigate( "/app/dashboard" );
        assert.deepEqual( page.log.slice( 1 ), [ [ "closeNavigation" ], [ "ajax", "/app/dashboard" ] ], "and a move to another address still opens its screen" );
    } );

    it( "knows the address HTMX pushed for a screen it swapped in itself", () => {
        const page = shell();
        ( page.documentListeners.get( "htmx:pushedIntoHistory" ) || [] ).forEach( ( listener ) => listener( { detail: { path: "/app/reports" } } ) );

        page.navigate( "/app/reports" );
        page.navigate( "/app/dashboard" );

        assert.deepEqual( page.log, [ [ "htmx", "other" ], [ "closeNavigation" ], [ "ajax", "/app/dashboard" ] ] );
    } );

    it( "installs at once on a page that has loaded already, and waits for the load of one that has not", () => {
        const calls = [];
        const loaded = loadTiFramework( {
            beforeRun: ( box ) => {
                box.document.readyState = "complete";
                box.location = { pathname: "/", search: "", href: "/" };
                box.onpopstate = () => calls.push( "htmx" );
            }
        } );
        loaded.sandbox.onpopstate( { state: null } );
        assert.deepEqual( calls, [ "htmx" ], "in front of HTMX's handler, which it passes an address that names no screen on to" );
        assert.equal( ( loaded.windowListeners.get( "load" ) || [] ).length, 0, "and nothing waits for a load that has happened" );

        const loading = loadTiFramework( { beforeRun: ( box ) => {
            box.document.readyState = "loading";
        } } );
        assert.equal( loading.windowListeners.get( "load" ).length, 1 );
    } );
} );
