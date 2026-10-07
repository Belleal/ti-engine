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
 * Covers the rule that only the newest screen lands in `#ti-content` (CA-463).
 * <br/>
 * HTMX keeps no order between requests made by different elements, so an answer still on its way when a newer screen
 * was opened used to land after it. Measured in Chromium on HTMX 2.0.11:
 * - the landing placeholder's `/app/dashboard` pushed its URL over the screen opened before it arrived. That screen
 *   started under the Dashboard's URL, and one that reads its mode from the URL as it starts loaded the wrong one;
 * - of two sidebar entries clicked in a row, the slower answer won;
 * - HTMX queued a second `openScreen` behind the first, which then started under the second's URL.
 * <br/>
 * Aborting the older request has a cost of its own: HTMX rejects an aborted request's promise as it does a failed
 * one's, and `openScreen` leaves for the start page when its promise is rejected. So the older screen's abort reloaded
 * the whole application, which only the newest screen's own failure may do.
 * <br/>
 * The real script runs in the sandbox. An HTMX request is a Node `EventTarget` standing in for its XHR, and every abort,
 * URL push and request goes into one log, so the order between them is what is asserted.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The shell with a `#ti-content`, a stubbed HTMX, history and location, and one log of what reaches them.
 *
 * @method
 * @returns {{tiApplication: Object, content: Object, body: Object, element: function( string, boolean ): Object, send: function( Object, Object, string ): EventTarget, fail: function( Object ): void, log: Array<Array<string>>}}
 * @private
 */
function shell() {
    const { stores, sandbox, documentListeners } = loadTiFramework();
    const log = [];
    const inside = new Set();
    const latest = new Map();
    const content = { id: "ti-content", name: "#ti-content", contains: ( element ) => inside.has( element ) };
    // `openScreen`'s request names no source, so HTMX makes it from the document's body.
    const body = { name: "body" };
    const send = ( element, target, verb ) => {
        const xhr = new EventTarget();
        latest.set( element, xhr );
        const detail = { elt: element, xhr: xhr, target: target, requestConfig: { verb: verb } };
        ( documentListeners.get( "htmx:beforeSend" ) || [] ).forEach( ( listener ) => listener( { detail: detail } ) );
        return xhr;
    };
    // As a browser ends an XHR that did not load: `abort` or `error`, then `loadend`.
    const end = ( element, how ) => {
        if ( latest.has( element ) ) {
            latest.get( element ).dispatchEvent( new Event( how ) );
            latest.get( element ).dispatchEvent( new Event( "loadend" ) );
        }
    };
    sandbox.document.getElementById = ( id ) => ( id === "ti-content" ? content : null );
    sandbox.htmx = {
        trigger: ( element, name ) => {
            log.push( [ name, element.name ] );
            if ( name === "htmx:abort" ) {
                end( element, "abort" );
            }
        },
        // As HTMX 2.0.11 does: the request is sent before `ajax` returns, and its promise is rejected, with no reason,
        // when it is aborted as when it fails.
        ajax: ( verb, url ) => {
            log.push( [ "ajax", url ] );
            const xhr = send( body, content, verb );
            return new Promise( ( resolve, reject ) => {
                xhr.addEventListener( "abort", () => reject() );
                xhr.addEventListener( "error", () => reject() );
                xhr.addEventListener( "load", () => resolve() );
            } );
        }
    };
    sandbox.history = { pushState: ( state, title, url ) => log.push( [ "pushState", url ] ) };
    // Leaving the shell goes into the log too, so that a test can tell it from staying.
    sandbox.location = {
        pathname: "/app/dashboard",
        search: "",
        set href( url ) {
            log.push( [ "location", url ] );
        }
    };
    return {
        tiApplication: stores.tiApplication,
        content: content,
        body: body,
        element: ( name, isInside ) => {
            const element = { name: name };
            if ( isInside ) {
                inside.add( element );
            }
            return element;
        },
        send: send,
        fail: ( element ) => end( element, "error" ),
        log: log
    };
}

/**
 * The elements a log records as aborted, in order.
 *
 * @method
 * @param {Array<Array<string>>} log
 * @returns {Array<string>}
 * @private
 */
const aborted = ( log ) => log.filter( ( [ name ] ) => name === "htmx:abort" ).map( ( [ , element ] ) => element );

/**
 * The addresses a log records the shell leaving for, in order.
 *
 * @method
 * @param {Array<Array<string>>} log
 * @returns {Array<string>}
 * @private
 */
const departures = ( log ) => log.filter( ( [ name ] ) => name === "location" ).map( ( [ , url ] ) => url );

/**
 * Waits until every promise settled so far has run its handlers.
 *
 * @method
 * @returns {Promise<void>}
 * @private
 */
const settled = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "only the newest screen lands in #ti-content (CA-463)", () => {

    it( "openScreen aborts the landing placeholder's request before it pushes the new URL", () => {
        const page = shell();
        const placeholder = page.element( "landing placeholder", true );
        page.send( placeholder, placeholder, "get" );

        page.tiApplication.openScreen( "reports" );

        assert.deepEqual( page.log, [
            [ "htmx:abort", "landing placeholder" ],
            [ "pushState", "/app/reports" ],
            [ "ajax", "/app/reports" ]
        ] );
    } );

    it( "openScreen aborts the previous openScreen's request, which HTMX would otherwise queue the new one behind", () => {
        const page = shell();
        page.tiApplication.openScreen( "a" );

        page.tiApplication.openScreen( "b" );

        assert.deepEqual( page.log, [
            [ "pushState", "/app/a" ],
            [ "ajax", "/app/a" ],
            [ "htmx:abort", "body" ],
            [ "pushState", "/app/b" ],
            [ "ajax", "/app/b" ]
        ] );
    } );

    it( "a screen aborted for a newer one does not send the user to the start page", async () => {
        const page = shell();
        page.tiApplication.openScreen( "a" );
        page.tiApplication.openScreen( "a" );
        page.tiApplication.openScreen( "b" );
        page.send( page.element( "sidebar entry", false ), page.content, "get" );
        await settled();

        assert.deepEqual( aborted( page.log ), [ "body", "body", "body" ],
            "the same screen opened again, another screen, and a sidebar entry each aborted the screen before them" );
        assert.deepEqual( departures( page.log ), [], "and the user stayed, on the sidebar entry's screen" );
    } );

    it( "the newest screen's own failure still sends the user to the start page, once", async () => {
        const page = shell();
        page.tiApplication.openScreen( "a" );
        page.tiApplication.openScreen( "b" );
        const topbar = page.element( "topbar", false );
        page.send( topbar, topbar, "get" );

        page.fail( page.body );
        await settled();

        assert.deepEqual( departures( page.log ), [ "/" ],
            "for b, which failed: not for a, which b aborted, and a request landing elsewhere is no newer screen" );
    } );

    it( "a request aimed at #ti-content aborts every other GET still on its way there, and spares itself", () => {
        const page = shell();
        const placeholder = page.element( "landing placeholder", true );
        const panel = page.element( "panel inside the old screen", true );
        const save = page.element( "form inside the old screen", true );
        const topbar = page.element( "topbar", false );
        page.send( placeholder, placeholder, "get" );
        page.send( panel, page.element( "a box inside the old screen", true ), "get" );
        page.send( save, save, "post" );
        page.send( topbar, topbar, "get" );
        assert.deepEqual( aborted( page.log ), [], "nothing is aborted until a request aims at #ti-content" );

        page.send( page.element( "sidebar entry clicked first", false ), page.content, "get" );
        assert.deepEqual( aborted( page.log ), [ "landing placeholder", "panel inside the old screen" ],
            "the GETs made from inside the content it replaces" );

        page.send( page.element( "sidebar entry clicked second", false ), page.content, "get" );
        assert.deepEqual( aborted( page.log ), [ "landing placeholder", "panel inside the old screen", "sidebar entry clicked first" ],
            "and the screen still on its way: of two entries clicked in a row, the second wins" );
        assert.ok( !aborted( page.log ).includes( "form inside the old screen" ), "a POST is left to finish" );
        assert.ok( !aborted( page.log ).includes( "topbar" ), "a request landing outside the content is not the screen's" );
    } );

    it( "a request that lands anywhere else supersedes nothing", () => {
        const page = shell();
        page.send( page.element( "sidebar entry", false ), page.content, "get" );

        const panel = page.element( "panel inside the screen", true );
        page.send( panel, panel, "get" );

        assert.deepEqual( aborted( page.log ), [] );
    } );

    it( "forgets a request when its XHR ends, so one that has landed is never aborted", () => {
        const page = shell();
        const finished = page.send( page.element( "sidebar entry", false ), page.content, "get" );
        finished.dispatchEvent( new Event( "loadend" ) );

        page.tiApplication.openScreen( "dashboard" );

        assert.deepEqual( aborted( page.log ), [] );
    } );

    it( "keeps the newer request's entry when an older one from the same element ends after it was sent", () => {
        // HTMX can abort an element's request for a newer one of its own (`hx-sync` with `replace`), and the older
        // XHR's `loadend` then arrives once the newer request is already recorded.
        const page = shell();
        const entry = page.element( "sidebar entry", false );
        const older = page.send( entry, page.content, "get" );
        page.send( entry, page.content, "get" );
        older.dispatchEvent( new Event( "loadend" ) );

        page.tiApplication.openScreen( "dashboard" );

        assert.deepEqual( aborted( page.log ), [ "sidebar entry" ] );
    } );
} );
