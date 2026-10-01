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
 * Covers the shell's busy state: the progress cursor and the turning hourglass shown while a request the user is
 * waiting on has been outstanding past a short delay (CA-345).
 * <br/>
 * A container scaled to zero takes a second or two to answer the first request after it wakes, and nothing on the
 * page changed in the meantime: a click on a sidebar entry left the old screen standing, and read as a frozen
 * application. The state counts `sendRequest` calls and HTMX requests alike, since screens arrive through HTMX and
 * their data through `sendRequest`, and shows only after the delay so that an ordinary click does not flicker.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );
const TiWebAppManager = require( "#web-app-manager" );

const STATIC_ROOT = path.join( __dirname, "..", "bin", "static" );
const read = ( ...parts ) => fs.readFileSync( path.join( STATIC_ROOT, ...parts ), "utf8" );
const component = read( "fragments", "components", "component-busy-indicator.html" );
const topbar = read( "fragments", "components", "component-topbar.html" );
const styles = read( "scripts", "ti-framework.css" ).replace( /\/\*[\s\S]*?\*\//g, "" );
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

const DELAY = 400;

/**
 * A clock the test moves by hand, standing in for the sandbox's timers.
 *
 * @method
 * @param {Object} sandbox
 * @returns {{advance: function( number ): void, pending: function(): number}}
 * @private
 */
function handClock( sandbox ) {
    let now = 0;
    let nextID = 1;
    const timers = new Map();
    sandbox.setTimeout = ( callback, delay ) => {
        const id = nextID++;
        timers.set( id, { at: now + delay, callback: callback } );
        return id;
    };
    sandbox.clearTimeout = ( id ) => {
        timers.delete( id );
    };
    return {
        advance: ( ms ) => {
            now += ms;
            [ ...timers.entries() ].sort( ( a, b ) => a[ 1 ].at - b[ 1 ].at ).forEach( ( [ id, timer ] ) => {
                if ( timer.at <= now ) {
                    timers.delete( id );
                    timer.callback();
                }
            } );
        },
        pending: () => timers.size
    };
}

/**
 * The shell in a sandbox whose `fetch` answers only when the test says so, and honours an abort as the browser does.
 *
 * @method
 * @returns {{tiApplication: Object, components: Object, html: Object, clock: Object, requests: Array<Object>, htmx: function( Object ): void}}
 * @private
 */
function shell() {
    const { stores, components, sandbox, documentListeners } = loadTiFramework();
    const clock = handClock( sandbox );
    const requests = [];
    sandbox.AbortController = AbortController;
    sandbox.fetch = ( url, options ) => new Promise( ( resolve, reject ) => {
        const request = {
            url: url,
            answer: ( body ) => resolve( { ok: true, statusText: "OK", headers: { get: () => "application/json" }, json: () => Promise.resolve( body ) } ),
            fail: ( error ) => reject( error )
        };
        if ( options && options.signal ) {
            options.signal.addEventListener( "abort", () => reject( Object.assign( new Error( "aborted" ), { name: "AbortError" } ) ) );
        }
        requests.push( request );
    } );
    return {
        tiApplication: stores.tiApplication,
        components: components,
        html: sandbox.document.documentElement,
        clock: clock,
        requests: requests,
        htmx: ( detail ) => ( documentListeners.get( "htmx:beforeSend" ) || [] ).forEach( ( listener ) => listener( { detail: detail } ) )
    };
}

/**
 * Lets every promise already settled run its reactions.
 *
 * @method
 * @returns {Promise<void>}
 * @private
 */
async function settle() {
    for ( let i = 0; i < 10; i++ ) {
        await new Promise( ( resolve ) => setImmediate( resolve ) );
    }
}

/**
 * Whether the shell shows that it is waiting: the store's flag, and the class the stylesheet keys off, which must
 * agree.
 *
 * @method
 * @param {Object} page
 * @returns {boolean}
 * @private
 */
function isBusy( page ) {
    const flagged = page.tiApplication.busy;
    assert.equal( page.html.classList.contains( "ti-busy" ), flagged, "the store and the html class disagree" );
    return flagged;
}

describe( "the shell's busy state — requests through sendRequest", () => {

    it( "never shows for a request that answers inside the delay", async () => {
        const page = shell();
        const done = page.tiApplication.sendRequest( "/app/data" );

        page.clock.advance( DELAY - 1 );
        page.requests[ 0 ].answer( { isSuccessful: true } );
        await done;
        await settle();
        assert.equal( page.clock.pending(), 0, "the delay must be cancelled, not left to run out on an idle shell" );
        page.clock.advance( 10 * DELAY );

        assert.equal( isBusy( page ), false );
    } );

    it( "gives the next request the whole delay, once the earlier ones have answered", async () => {
        // A delay left running from answered requests would show the hourglass for the next one almost at once.
        const page = shell();
        const first = page.tiApplication.sendRequest( "/app/screen" );
        page.clock.advance( 100 );
        const second = page.tiApplication.sendRequest( "/app/data" );
        page.clock.advance( 100 );
        page.requests[ 0 ].answer( { isSuccessful: true } );
        page.requests[ 1 ].answer( { isSuccessful: true } );
        await Promise.all( [ first, second ] );
        await settle();

        page.clock.advance( 150 );
        const next = page.tiApplication.sendRequest( "/app/other" );
        page.clock.advance( DELAY - 1 );
        assert.equal( isBusy( page ), false, "the next request has waited less than the delay" );
        page.clock.advance( 1 );
        assert.equal( isBusy( page ), true );

        page.requests[ 2 ].answer( { isSuccessful: true } );
        await next;
        await settle();
        assert.equal( isBusy( page ), false );
    } );

    it( "shows once a request has waited the delay, and stops when it answers", async () => {
        const page = shell();
        const done = page.tiApplication.sendRequest( "/app/data" );

        page.clock.advance( DELAY - 1 );
        assert.equal( isBusy( page ), false );
        page.clock.advance( 1 );
        assert.equal( isBusy( page ), true );

        page.requests[ 0 ].answer( { isSuccessful: true } );
        await done;
        await settle();
        assert.equal( isBusy( page ), false );
    } );

    it( "stays on until the last of overlapping requests answers, timed from the first", async () => {
        const page = shell();
        const first = page.tiApplication.sendRequest( "/app/screen" );
        page.clock.advance( 300 );
        const second = page.tiApplication.sendRequest( "/app/data", "POST", { value: 1 } );
        page.clock.advance( DELAY - 300 );
        assert.equal( isBusy( page ), true, "the wait is the user's, and started with the first request" );

        page.requests[ 0 ].answer( { isSuccessful: true } );
        await first;
        await settle();
        assert.equal( isBusy( page ), true, "one request is still outstanding" );

        page.requests[ 1 ].answer( { isSuccessful: true } );
        await second;
        await settle();
        assert.equal( isBusy( page ), false );
    } );

    it( "ends the wait for a request that fails, as for one that answers", async () => {
        const page = shell();
        const done = page.tiApplication.sendRequest( "/app/data" ).catch( ( error ) => error );
        page.clock.advance( DELAY );
        assert.equal( isBusy( page ), true );

        page.requests[ 0 ].fail( new TypeError( "Failed to fetch" ) );
        assert.equal( ( await done ).message, "Failed to fetch" );
        await settle();
        assert.equal( isBusy( page ), false );
    } );

    it( "counts out a GET aborted by the same GET sent again", async () => {
        // sendRequest aborts an outstanding GET when the same one is sent again; the aborted request settles too, and
        // must not be left counted.
        const page = shell();
        const superseded = page.tiApplication.sendRequest( "/app/data" ).catch( ( error ) => error );
        const latest = page.tiApplication.sendRequest( "/app/data" );
        assert.equal( ( await superseded ).name, "AbortError" );
        page.clock.advance( DELAY );
        assert.equal( isBusy( page ), true, "the request sent again is still outstanding" );

        page.requests[ 1 ].answer( { isSuccessful: true } );
        await latest;
        await settle();
        assert.equal( isBusy( page ), false );
    } );

} );

describe( "the shell's busy state — HTMX requests", () => {

    it( "counts a request from htmx:beforeSend until its XHR's loadend", () => {
        const page = shell();
        const xhr = new EventTarget();
        page.htmx( { xhr: xhr } );

        page.clock.advance( DELAY );
        assert.equal( isBusy( page ), true );
        xhr.dispatchEvent( new Event( "loadend" ) );
        assert.equal( isBusy( page ), false );
    } );

    it( "counts each request's end once, so one that ends twice cannot end another", () => {
        // `loadend` fires once per request in a browser; the listener is registered `once` all the same, because a
        // second call would end a different request that is still outstanding.
        const page = shell();
        const screen = new EventTarget();
        const data = new EventTarget();
        page.htmx( { xhr: screen } );
        page.htmx( { xhr: data } );
        page.clock.advance( DELAY );

        screen.dispatchEvent( new Event( "loadend" ) );
        screen.dispatchEvent( new Event( "loadend" ) );
        assert.equal( isBusy( page ), true, "the second request is still outstanding" );
        data.dispatchEvent( new Event( "loadend" ) );
        assert.equal( isBusy( page ), false );
    } );

    it( "counts nothing for an event that carries no request", () => {
        const page = shell();
        page.htmx( {} );
        page.clock.advance( 10 * DELAY );

        assert.equal( isBusy( page ), false );
        assert.equal( page.clock.pending(), 0 );
    } );

    it( "shares one wait with sendRequest: a screen, then its data", async () => {
        const page = shell();
        const screen = new EventTarget();
        page.htmx( { xhr: screen } );
        page.clock.advance( DELAY );
        // The screen's component asks for its data while the screen's own request is still settling.
        const data = page.tiApplication.sendRequest( "/app/data" );
        screen.dispatchEvent( new Event( "loadend" ) );
        assert.equal( isBusy( page ), true, "the data is still outstanding" );

        page.requests[ 0 ].answer( { isSuccessful: true } );
        await data;
        await settle();
        assert.equal( isBusy( page ), false );
    } );

} );

describe( "the busy indicator component", () => {

    it( "follows the shell's state", () => {
        const page = shell();
        const indicator = page.components.tiComponentBusyIndicator();
        const xhr = new EventTarget();

        assert.equal( indicator.busy, false );
        page.htmx( { xhr: xhr } );
        page.clock.advance( DELAY );
        assert.equal( indicator.busy, true );
        xhr.dispatchEvent( new Event( "loadend" ) );
        assert.equal( indicator.busy, false );
    } );

    it( "keeps its status region rendered, and writes the line into it only while busy", () => {
        // A live region announces text added to it. A region that is hidden, or a line that is always there, announces
        // nothing when the shell turns busy.
        assert.match( component, /<span class="ti-busy-indicator" role="status" x-data="tiComponentBusyIndicator">/ );
        assert.doesNotMatch( component, /class="ti-busy-indicator"[^>]*(x-show|x-if|hidden)/ );
        assert.match( component, /<template x-if="busy">\s*<span class="ti-sr-only" x-text-label="interface.busy-indicator.status">Working…<\/span>\s*<\/template>/ );
        assert.match( component, /<span class="ti-icon md hourglass ti-busy-indicator-glyph" aria-hidden="true"><\/span>/ );
    } );

    it( "is labelled in both languages the framework ships", () => {
        assert.deepEqual( labels.interface[ "busy-indicator" ].status, { en: "Working…", bg: "Обработва се…" } );
    } );

    it( "never names its own placeholder tag in markup, where the placeholder search would find it first", () => {
        // The placeholder is found with indexOf on "<" plus the tag name, comments included.
        assert.ok( !component.includes( "<ti-component-busy-indicator-placeholder" ) );
        assert.equal( topbar.split( "<ti-component-busy-indicator-placeholder" ).length - 1, 1 );
    } );

    it( "is drawn inside the framework's topbar when the application shell is assembled", async () => {
        class Harness extends TiWebAppManager {
            constructor() {
                super( "busy-indicator-test" );
            }
        }
        const html = await new Harness().assembleHtmlView( { user: { userID: "u1" } }, [ STATIC_ROOT ], "/app", { csrfToken: "t", nonce: "n" } );
        const topbarHtml = html.slice( html.indexOf( "<header id=\"ti-topbar\"" ), html.indexOf( "</header>" ) );

        assert.doesNotMatch( html, /ti-component-busy-indicator-placeholder>/, "an unreplaced placeholder means the component was never resolved" );
        assert.match( topbarHtml, /class="ti-busy-indicator" role="status"/ );
    } );

} );

describe( "the busy state's stylesheet", () => {

    /**
     * The declarations of the one rule whose selector list is exactly `selector`.
     *
     * @method
     * @param {string} selector
     * @returns {Object<string, string>}
     * @private
     */
    function rule( selector ) {
        const escaped = selector.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" ).replace( /\s+/g, "\\s+" );
        const found = new RegExp( "(?:^|})\\s*" + escaped + "\\s*\\{([^}]*)\\}" ).exec( styles );
        assert.ok( found, `no rule for ${ selector }` );
        const declarations = {};
        found[ 1 ].split( ";" ).forEach( ( declaration ) => {
            const at = declaration.indexOf( ":" );
            if ( at > 0 ) {
                declarations[ declaration.slice( 0, at ).trim() ] = declaration.slice( at + 1 ).trim();
            }
        } );
        return declarations;
    }

    it( "turns the cursor over every element, the button just clicked included", () => {
        assert.equal( rule( "html.ti-busy,\nhtml.ti-busy *" ).cursor, "progress !important" );
    } );

    it( "shows and turns the hourglass only while busy, in a slot that keeps its size", () => {
        assert.equal( rule( ".ti-busy-indicator-glyph" ).opacity, "0" );
        assert.equal( rule( "html.ti-busy .ti-busy-indicator-glyph" ).opacity, "1" );
        assert.match( rule( "html.ti-busy .ti-busy-indicator-glyph" ).animation, /^busyTurn / );
        assert.equal( rule( ".ti-busy-indicator" ).width, "36px" );
        assert.match( styles, /\.ti-icon\.hourglass\s*\{[^}]*mask-image:\s*url\(/ );
    } );

    it( "keeps the hourglass still under reduced motion", () => {
        const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec( styles.slice( styles.indexOf( "@keyframes busyTurn" ) ) );
        assert.ok( reduced, "no reduced-motion block after the hourglass's keyframes" );
        assert.match( reduced[ 1 ], /html\.ti-busy \.ti-busy-indicator-glyph\s*\{\s*animation:\s*none;/ );
    } );

    it( "hides the status line from sight without taking it out of the accessibility tree", () => {
        const srOnly = rule( ".ti-sr-only" );
        assert.notEqual( srOnly.display, "none" );
        assert.notEqual( srOnly.visibility, "hidden" );
        assert.equal( srOnly[ "clip-path" ], "inset(50%)" );
    } );

} );
