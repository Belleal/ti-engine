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
 * The real script runs in the sandbox. An HTMX request is a Node `EventTarget` standing in for its XHR, and every abort,
 * URL push and request goes into one log, so the order between them is what is asserted.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The shell with a `#ti-content`, a stubbed HTMX and history, and one log of what reaches them.
 *
 * @method
 * @returns {{tiApplication: Object, content: Object, element: function( string, boolean ): Object, send: function( Object, Object, string ): EventTarget, log: Array<Array<string>>}}
 * @private
 */
function shell() {
    const { stores, sandbox, documentListeners } = loadTiFramework();
    const log = [];
    const inside = new Set();
    const latest = new Map();
    const content = { id: "ti-content", name: "#ti-content", contains: ( element ) => inside.has( element ) };
    sandbox.document.getElementById = ( id ) => ( id === "ti-content" ? content : null );
    sandbox.htmx = {
        // As in a browser, an aborted request ends: its XHR fires `loadend`.
        trigger: ( element, name ) => {
            log.push( [ name, element.name ] );
            if ( name === "htmx:abort" && latest.has( element ) ) {
                latest.get( element ).dispatchEvent( new Event( "loadend" ) );
            }
        },
        ajax: ( verb, url ) => {
            log.push( [ "ajax", url ] );
            return Promise.resolve();
        }
    };
    sandbox.history = { pushState: ( state, title, url ) => log.push( [ "pushState", url ] ) };
    return {
        tiApplication: stores.tiApplication,
        content: content,
        element: ( name, isInside ) => {
            const element = { name: name };
            if ( isInside ) {
                inside.add( element );
            }
            return element;
        },
        send: ( element, target, verb ) => {
            const xhr = new EventTarget();
            latest.set( element, xhr );
            const detail = { elt: element, xhr: xhr, target: target, requestConfig: { verb: verb } };
            ( documentListeners.get( "htmx:beforeSend" ) || [] ).forEach( ( listener ) => listener( { detail: detail } ) );
            return xhr;
        },
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
        const body = page.element( "body", false );
        page.send( body, page.content, "get" );

        page.tiApplication.openScreen( "b" );

        assert.deepEqual( page.log.slice( 0, 2 ), [ [ "htmx:abort", "body" ], [ "pushState", "/app/b" ] ] );
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
