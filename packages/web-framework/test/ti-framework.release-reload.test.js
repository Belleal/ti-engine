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
 * Covers how a page left open across a release learns of it, in the browser (CA-553), with the real `ti-framework.js`
 * in a sandbox:
 * - every request carries the page's release, and every answer is read for the server's;
 * - a tab coming back after half an hour hidden asks once, and reloads only when nothing would be lost;
 * - otherwise the banner shows, with Reload and a close button.
 * The server's half, a screen change answered with the page itself, is in `web-handlers.release-reload.test.js`.
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
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

const PAGE_RELEASE = "aaaaaaaaaaaaaaaa";
const NEWER_RELEASE = "bbbbbbbbbbbbbbbb";
const HALF_AN_HOUR = 30 * 60 * 1000;

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
 * The shell in a sandbox: a page of `release` (none when `null`), loaded in view or, with `hiddenAtLoad`, in a
 * background tab; a clock the test moves; a server that names `served` on every answer; and a record of what the page
 * asked for and how often it reloaded.
 *
 * @method
 * @param {{release?: (string|null), hiddenAtLoad?: boolean}} [options]
 * @returns {Object}
 * @private
 */
function shell( options = {} ) {
    const release = ( options.release === undefined ) ? PAGE_RELEASE : options.release;
    const clock = { now: 1_000_000 };
    const { stores, components, sandbox, documentListeners, capturingListeners } = loadTiFramework( {
        // Before the script runs: it reads the clock and the page's visibility as it loads.
        beforeRun: ( context ) => {
            context.Date = class extends Date {
                static now() {
                    return clock.now;
                }
            };
            context.document.visibilityState = options.hiddenAtLoad === true ? "hidden" : "visible";
        }
    } );
    const page = {
        tiApplication: stores.tiApplication,
        components: components,
        sandbox: sandbox,
        documentListeners: documentListeners,
        capturingListeners: capturingListeners,
        served: PAGE_RELEASE,
        requests: [],
        reloads: 0,
        clock: clock,
        fetchFails: false
    };
    sandbox.document.querySelector = ( selector ) => ( selector === "meta[name=\"ti-release\"]" && release !== null ) ? { content: release } : null;
    sandbox.document.activeElement = null;
    sandbox.htmx = { config: {} };
    sandbox.location.reload = () => {
        page.reloads++;
    };
    sandbox.fetch = ( url, init ) => {
        page.requests.push( { url: url, init: init } );
        if ( page.fetchFails ) {
            return Promise.reject( new TypeError( "Failed to fetch" ) );
        }
        const served = page.served;
        return Promise.resolve( {
            ok: true,
            status: 200,
            statusText: "OK",
            headers: {
                get: ( name ) => {
                    const header = String( name ).toLowerCase();
                    if ( header === "x-ti-release" ) {
                        return served;
                    }
                    return ( header === "content-type" ) ? "application/json" : null;
                }
            },
            json: () => Promise.resolve( { isSuccessful: true, data: {} } )
        } );
    };
    page.fire = ( type, event ) => ( documentListeners.get( type ) || [] ).forEach( ( listener ) => listener( event ) );
    /**
     * An HTMX request, through the listeners the shell put on the document: `htmx:configRequest` for its headers, then
     * `htmx:beforeSend`, then its XHR's `loadend` with the server's answer.
     */
    page.htmx = ( verb = "get", status = 200, answerHeaders = {} ) => {
        const headers = {};
        page.fire( "htmx:configRequest", { detail: { headers: headers, verb: verb } } );
        const loadend = [];
        const served = page.served;
        const xhr = {
            status: status,
            addEventListener: ( type, listener ) => {
                if ( type === "loadend" ) {
                    loadend.push( listener );
                }
            },
            getResponseHeader: ( name ) => {
                const header = String( name ).toLowerCase();
                if ( header === "x-ti-release" ) {
                    return served;
                }
                const found = Object.keys( answerHeaders ).find( ( key ) => key.toLowerCase() === header );
                return found ? answerHeaders[ found ] : null;
            }
        };
        page.fire( "htmx:beforeSend", { detail: { xhr: xhr, requestConfig: { verb: verb } } } );
        loadend.forEach( ( listener ) => listener() );
        return headers;
    };
    /** A touch of the page: a key or pointer press, or an input, on a target that may be anywhere. */
    page.touch = ( type = "input" ) => page.fire( type, { target: { closest: () => null } } );
    page.hide = () => {
        sandbox.document.visibilityState = "hidden";
        page.fire( "visibilitychange", {} );
    };
    page.show = () => {
        sandbox.document.visibilityState = "visible";
        page.fire( "visibilitychange", {} );
    };
    /** Hidden for `ms`, then back in view, and every answer settled. */
    page.awayFor = async ( ms ) => {
        page.hide();
        clock.now += ms;
        page.show();
        await settle();
    };
    return page;
}

describe( "every request names the page's release", () => {

    it( "on an HTMX request", () => {
        const page = shell();
        assert.equal( page.htmx()[ "X-Ti-Release" ], PAGE_RELEASE );
    } );

    it( "on a request through sendRequest", async () => {
        const page = shell();
        await page.tiApplication.sendRequest( "/app/data" );
        await page.tiApplication.sendRequest( "/app/save", "POST", { value: 1 } );
        assert.deepEqual( page.requests.map( ( request ) => request.init.headers[ "X-Ti-Release" ] ), [ PAGE_RELEASE, PAGE_RELEASE ] );
    } );

    it( "on neither, from a page that carries no release", async () => {
        // Its scripts are this release's, but the page cannot say so: a header naming nothing would read as another.
        const page = shell( { release: null } );
        assert.equal( "X-Ti-Release" in page.htmx(), false );
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( "X-Ti-Release" in page.requests[ 0 ].init.headers, false );
    } );

} );

describe( "every answer is read for the server's release", () => {

    it( "an HTMX answer from a newer release sets newRelease", () => {
        const page = shell();
        page.htmx();
        assert.equal( page.tiApplication.newRelease, false, "the same release is no news" );
        page.served = NEWER_RELEASE;
        page.htmx();
        assert.equal( page.tiApplication.newRelease, true );
    } );

    it( "a sendRequest answer from a newer release sets newRelease", async () => {
        const page = shell();
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, false );
        page.served = NEWER_RELEASE;
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, true );
    } );

    it( "an answer that names the page's own release again clears it", async () => {
        // The latest answer decides: one from an instance a rollout has since replaced is not news for good.
        const page = shell();
        page.served = NEWER_RELEASE;
        page.htmx();
        assert.equal( page.tiApplication.newRelease, true );
        page.served = PAGE_RELEASE;
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, false );
    } );

    it( "an answer that sends the page away is noted only if the page is still there three seconds later", () => {
        // Noted at once, the banner showed for the length of the navigation it announced. Never noted, a page whose
        // leaving was cancelled at an "unsaved changes" prompt stayed on the old release with nothing to say why.
        for ( const answerHeaders of [ { "HX-Redirect": "/app/screen" }, { "HX-Refresh": "true" } ] ) {
            const page = shell();
            const timers = [];
            page.sandbox.setTimeout = ( callback, delay ) => {
                timers.push( { callback: callback, delay: delay } );
                return timers.length;
            };
            page.served = NEWER_RELEASE;
            page.htmx( "get", 200, answerHeaders );
            assert.equal( page.tiApplication.newRelease, false, Object.keys( answerHeaders )[ 0 ] );
            const grace = timers.filter( ( timer ) => timer.delay === 3000 );
            assert.equal( grace.length, 1, Object.keys( answerHeaders )[ 0 ] );
            grace[ 0 ].callback();
            assert.equal( page.tiApplication.newRelease, true, Object.keys( answerHeaders )[ 0 ] );
        }
    } );

    it( "an answer that names no release is no news", async () => {
        // A proxy's error page, or a Worker's own answer, carries no header.
        const page = shell();
        page.served = null;
        page.htmx();
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, false );
    } );

    it( "a page that carries no release takes no note", async () => {
        const page = shell( { release: null } );
        page.served = NEWER_RELEASE;
        page.htmx();
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, false );
    } );

    it( "no answer reloads the page by itself", async () => {
        // A reload is for a return to the tab and, by the server's answer, a screen change; never a side effect of data.
        const page = shell();
        page.served = NEWER_RELEASE;
        page.htmx();
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.reloads, 0 );
    } );

} );

describe( "a tab coming back into view", () => {

    it( "after half an hour hidden asks once, and reloads an idle page on a newer release", async () => {
        const page = shell();
        page.served = NEWER_RELEASE;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.requests.length, 1 );
        assert.equal( page.requests[ 0 ].url, "/health" );
        assert.equal( page.requests[ 0 ].init.method, "HEAD", "no body: the cheapest answer every release gives" );
        assert.equal( page.requests[ 0 ].init.cache, "no-store" );
        // With the cookies, as every request of the page: behind a proxy that authenticates, a request without them is
        // sent to a sign-in page on another origin, and the check would never work there.
        assert.equal( page.requests[ 0 ].init.credentials, "same-origin" );
        assert.equal( page.reloads, 1 );
    } );

    it( "does nothing more when the release is the same", async () => {
        const page = shell();
        await page.awayFor( 2 * HALF_AN_HOUR );
        assert.equal( page.requests.length, 1 );
        assert.equal( page.reloads, 0 );
        assert.equal( page.tiApplication.newRelease, false );
    } );

    it( "counts a tab opened in the background as hidden since it loaded", async () => {
        // No visibilitychange says it was hidden: its first look, hours later, must still count as a return.
        const page = shell( { hiddenAtLoad: true } );
        page.served = NEWER_RELEASE;
        page.clock.now += 3 * HALF_AN_HOUR;
        page.show();
        await settle();
        assert.equal( page.requests.length, 1 );
        assert.equal( page.reloads, 1 );
    } );

    it( "asks nothing after less than half an hour", async () => {
        // No check on a timer, and none on every glance away: each would wake a container that sleeps when idle.
        const page = shell();
        page.served = NEWER_RELEASE;
        await page.awayFor( HALF_AN_HOUR - 1 );
        assert.equal( page.requests.length, 0 );
        assert.equal( page.reloads, 0 );
    } );

    it( "shows the banner instead when the screen was touched: a key, a pointer, an input or a change", async () => {
        // A choice made with a click raises no input, and a dialog moved out of the screen holds work as well: any touch,
        // anywhere on the page, counts.
        for ( const type of [ "keydown", "pointerdown", "input", "change" ] ) {
            const page = shell();
            page.served = NEWER_RELEASE;
            page.touch( type );
            await page.awayFor( HALF_AN_HOUR );
            assert.equal( page.reloads, 0, type );
            assert.equal( page.tiApplication.newRelease, true, type );
            assert.equal( page.components.tiComponentReleaseBanner().shown, true, type );
        }
    } );

    it( "hears a touch while capturing, so a handler that stops the event cannot hide it", () => {
        const page = shell();
        for ( const type of [ "keydown", "pointerdown", "input", "change" ] ) {
            const listeners = page.documentListeners.get( type ) || [];
            assert.ok( listeners.some( ( listener ) => page.capturingListeners.has( listener ) ), type );
        }
    } );

    it( "shows the banner again, closed before the tab was left", async () => {
        const page = shell();
        page.served = NEWER_RELEASE;
        await page.tiApplication.sendRequest( "/app/data" );
        const banner = page.components.tiComponentReleaseBanner();
        banner.close();
        page.touch();
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.reloads, 0 );
        assert.equal( banner.shown, true );
    } );

    it( "shows the banner instead when a field holds the focus", async () => {
        for ( const tagName of [ "INPUT", "TEXTAREA", "SELECT" ] ) {
            const page = shell();
            page.served = NEWER_RELEASE;
            page.sandbox.document.activeElement = { tagName: tagName };
            await page.awayFor( HALF_AN_HOUR );
            assert.equal( page.reloads, 0, tagName );
            assert.equal( page.tiApplication.newRelease, true, tagName );
        }
        const editable = shell();
        editable.served = NEWER_RELEASE;
        editable.sandbox.document.activeElement = { tagName: "DIV", isContentEditable: true };
        await editable.awayFor( HALF_AN_HOUR );
        assert.equal( editable.reloads, 0, "an editable element" );
    } );

    it( "reloads once a new screen is shown, which nobody has touched yet", async () => {
        const page = shell();
        page.touch( "pointerdown" );
        page.fire( "htmx:afterSwap", { detail: { target: { id: "ti-content" }, pathInfo: {} } } );
        page.served = NEWER_RELEASE;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.reloads, 1 );
    } );

    it( "keeps a screen touched when a panel loads inside it", async () => {
        // A nested frame loads inside a screen as well as at the landing: what was touched beside it is still there.
        const page = shell();
        page.touch( "input" );
        page.fire( "htmx:afterSwap", { detail: { target: { id: "", tagName: "TI-NESTED-FRAME-PLACEHOLDER" }, pathInfo: { requestPath: "/app/panel" } } } );
        page.served = NEWER_RELEASE;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.reloads, 0 );
    } );

    it( "keeps a touched screen through a write, which may have saved nothing that was typed", async () => {
        // A preview or a reminder is a write the server takes; the text typed beside it is still unsaved.
        const viaSendRequest = shell();
        viaSendRequest.touch();
        await viaSendRequest.tiApplication.sendRequest( "/app/preview", "POST", { value: 1 } );

        const viaHtmx = shell();
        viaHtmx.touch();
        viaHtmx.htmx( "post", 200 );

        const swappedElsewhere = shell();
        swappedElsewhere.touch();
        swappedElsewhere.fire( "htmx:afterSwap", { detail: { target: { id: "ti-sidebar" }, pathInfo: {} } } );

        for ( const page of [ viaSendRequest, viaHtmx, swappedElsewhere ] ) {
            page.served = NEWER_RELEASE;
            await page.awayFor( HALF_AN_HOUR );
            assert.equal( page.reloads, 0 );
        }
    } );

    it( "takes the answer to its question over anything noted before", async () => {
        // A rollout, or a rollback, can leave an earlier answer from another release that is no longer live.
        const page = shell();
        page.served = NEWER_RELEASE;
        await page.tiApplication.sendRequest( "/app/data" );
        assert.equal( page.tiApplication.newRelease, true );
        page.served = PAGE_RELEASE;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.reloads, 0 );
        assert.equal( page.tiApplication.newRelease, false );
        assert.equal( page.components.tiComponentReleaseBanner().shown, false );
    } );

    it( "asks nothing from a page that carries no release", async () => {
        const page = shell( { release: null } );
        page.served = NEWER_RELEASE;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.requests.length, 0 );
    } );

    it( "leaves the page as it is when the question fails", async () => {
        const page = shell();
        page.fetchFails = true;
        await page.awayFor( HALF_AN_HOUR );
        assert.equal( page.reloads, 0 );
        assert.equal( page.tiApplication.newRelease, false );
    } );

} );

describe( "the release banner", () => {

    it( "shows while a newer release is live, until it is closed", () => {
        const page = shell();
        const banner = page.components.tiComponentReleaseBanner();
        assert.equal( banner.shown, false );
        page.tiApplication.newRelease = true;
        assert.equal( banner.shown, true );
        banner.close();
        assert.equal( banner.shown, false );
    } );

    it( "reloads the page on Reload", () => {
        const page = shell();
        page.components.tiComponentReleaseBanner().reload();
        assert.equal( page.reloads, 1 );
    } );

    it( "reads its texts from the catalogue, in English and Bulgarian", () => {
        const component = read( "fragments", "components", "component-release-banner.html" );
        const keys = [ ...component.matchAll( /x-text-label(?::[\w-]+)?="([^"]+)"/g ) ].map( ( match ) => match[ 1 ] );
        assert.deepEqual( keys, [ "interface.release-banner.text", "interface.release-banner.reload", "interface.release-banner.close" ] );
        for ( const key of keys ) {
            const entry = key.split( "." ).reduce( ( node, part ) => node && node[ part ], labels );
            assert.ok( entry && entry.en && entry.bg, `${ key } has an English and a Bulgarian text` );
        }
    } );

    it( "is placed in the application frame, so an application that keeps its own topbar gets it", async () => {
        assert.match( read( "fragments", "frame-application.html" ), /<ti-component-release-banner-placeholder><\/ti-component-release-banner-placeholder>/ );
        class Harness extends TiWebAppManager {
            constructor() {
                super( "release-banner-test" );
            }
        }
        const frame = await new Harness().assembleHtmlView( { user: { userID: "u1", roles: [] } }, [ STATIC_ROOT ], "/app", { csrfToken: "t", nonce: "n" } );
        assert.match( frame, /x-data="tiComponentReleaseBanner"/ );
        assert.doesNotMatch( frame, /ti-component-release-banner-placeholder>/, "an unreplaced placeholder means the component was never resolved" );
    } );

    it( "is cloaked until Alpine has read whether it shows", () => {
        // Markup like any other: it showed on every page load until the script ran, and for good when it did not.
        const component = read( "fragments", "components", "component-release-banner.html" );
        assert.match( component, /<div class="ti-release-banner" x-show="shown" x-cloak>/ );
        const { declarations } = readCascade( read( "scripts", "ti-framework.css" ) );
        assert.equal( declarations( ".ti-release-banner[x-cloak]" ).display, "none" );
    } );

    it( "spans the content column, as the topbar does", () => {
        // `.ti-content` centres what it holds: a region with no width shrank to its text, a box in the middle of the page
        // (measured in Chromium).
        const { declarations } = readCascade( read( "scripts", "ti-framework.css" ) );
        assert.equal( declarations( ".ti-content" )[ "align-items" ], "center", "the column still centres its children" );
        assert.equal( declarations( ".ti-release-banner-region" ).width, "100%" );
        assert.equal( declarations( ".ti-release-banner-region" ).flex, "0 0 auto", "it never gives up height to the screen" );
    } );

    it( "never names its own placeholder tag in markup, where the placeholder search would find it first", () => {
        // The placeholder is found with indexOf on "<" plus the tag name, comments included.
        assert.ok( !read( "fragments", "components", "component-release-banner.html" ).includes( "<ti-component-release-banner-placeholder" ) );
        assert.equal( read( "fragments", "frame-application.html" ).split( "<ti-component-release-banner-placeholder" ).length - 1, 1 );
    } );

} );
