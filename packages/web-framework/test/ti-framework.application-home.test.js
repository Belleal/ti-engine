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
 * Where the shell goes when it gives up on a screen (CA-584), with the real `ti-framework.js` in a sandbox.
 *
 * Two fallbacks leave the shell for its start page: a screen name that is not one, and the newest screen's own request
 * failing. Both went to `/`, which on an application whose home is elsewhere is somebody else's page. The server writes
 * the home into the shell page as `<meta name="ti-home">` when it is not `/`, and the shell goes there.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The shell in a sandbox, its page naming `home` in `<meta name="ti-home">` (no tag when `null`), with HTMX whose
 * requests the test fails, and a log of where the shell sends the browser.
 *
 * @method
 * @param {string|null} home
 * @returns {{tiApplication: Object, failNewest: function(): void, departures: string[]}}
 * @private
 */
function shell( home ) {
    const { stores, sandbox } = loadTiFramework();
    const departures = [];
    const rejections = [];
    sandbox.document.querySelector = ( selector ) => ( selector === "meta[name=\"ti-home\"]" && home !== null ) ? { content: home, getAttribute: () => home } : null;
    sandbox.document.getElementById = () => null;
    sandbox.htmx = {
        trigger: () => {},
        ajax: () => new Promise( ( resolve, reject ) => rejections.push( reject ) )
    };
    sandbox.history = { pushState: () => {} };
    sandbox.location = {
        pathname: "/studio/",
        search: "",
        set href( url ) {
            departures.push( url );
        }
    };
    return {
        tiApplication: stores.tiApplication,
        failNewest: () => rejections[ rejections.length - 1 ](),
        departures: departures
    };
}

const settled = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "the shell's start page is its home (CA-584)", () => {

    it( "leaves for the home when asked for a screen that is not one", () => {
        const page = shell( "/studio/" );
        page.tiApplication.openScreen( "../admin" );
        assert.deepEqual( page.departures, [ "/studio/" ] );
    } );

    it( "leaves for the home when the newest screen fails", async () => {
        const page = shell( "/studio/" );
        page.tiApplication.openScreen( "reports" );
        page.failNewest();
        await settled();
        assert.deepEqual( page.departures, [ "/studio/" ] );
    } );

    it( "leaves for / on a page that names no home, as before 1.63.0", async () => {
        const page = shell( null );
        page.tiApplication.openScreen( "../admin" );
        page.tiApplication.openScreen( "reports" );
        page.failNewest();
        await settled();
        assert.deepEqual( page.departures, [ "/", "/" ] );
    } );

    it( "goes nowhere a tag could point off the site: an address that is not a plain path here is /", () => {
        for ( const home of [ "//evil.example/", "https://evil.example/", "javascript:alert(1)", "/a/../b/", "/a?x=1", "", "studio/" ] ) {
            const page = shell( home );
            page.tiApplication.openScreen( "../admin" );
            assert.deepEqual( page.departures, [ "/" ], JSON.stringify( home ) );
        }
    } );

} );
