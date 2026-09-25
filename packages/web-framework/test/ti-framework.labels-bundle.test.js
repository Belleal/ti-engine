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
 * Covers how the shell obtains its labels (CA-174): `/app/config` names the catalogue by URL, and the catalogue is
 * fetched with the browser's own cache in play.
 * <br/>
 * The trap this guards: `sendRequest` asks for `cache: "no-store"`, which is right for application data and would be
 * exactly wrong here — the catalogue is served `immutable` so that after the first load of a release the browser
 * answers it without a request. Routed through `sendRequest`, it would be downloaded on every page load, which is the
 * cost the whole change exists to remove.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * Loads the shell into a sandbox whose `fetch` answers from a table and records every call.
 *
 * @param {Object<string, Object>} answers URL → JSON body.
 * @returns {{tiApplication: Object, calls: Array<{url: string, options: Object}>}}
 */
function loadWithFetch( answers ) {
    const { stores, sandbox } = loadTiFramework();
    const calls = [];
    sandbox.fetch = ( url, options ) => {
        calls.push( { url: String( url ), options: options || {} } );
        const body = answers[ String( url ) ];
        return Promise.resolve( {
            ok: body !== undefined,
            statusText: body !== undefined ? "OK" : "Not Found",
            headers: { get: () => "application/json" },
            json: () => Promise.resolve( body )
        } );
    };
    return { tiApplication: stores.tiApplication, calls: calls };
}

/**
 * Lets every pending promise in the initialization chain settle.
 *
 * @returns {Promise<void>}
 */
async function settle() {
    for ( let i = 0; i < 20; i++ ) {
        await new Promise( ( resolve ) => setImmediate( resolve ) );
    }
}

describe( "tiApplication.init — the label catalogue by URL", () => {

    const LABELS = { interface: { topbar: { dashboard: "Dashboard" } } };
    const BUNDLE_URL = "/app/labels/0123456789abcdef";

    it( "fetches the catalogue the configuration points to, with the browser's cache in play", async () => {
        const { tiApplication, calls } = loadWithFetch( {
            "/app/config": { isSuccessful: true, data: { labelsBundle: { hash: "0123456789abcdef", url: BUNDLE_URL }, auth: { isAuthenticated: false } } },
            [ BUNDLE_URL ]: LABELS
        } );
        tiApplication.init();
        await settle();

        const labelsCall = calls.find( ( call ) => call.url === BUNDLE_URL );
        assert.ok( labelsCall, "the catalogue was requested by its URL" );
        assert.equal( labelsCall.options.cache, undefined, "no cache override: the immutable answer must be allowed to serve it" );
        assert.equal( calls.find( ( call ) => call.url === "/app/config" ).options.cache, "no-store", "the configuration itself is still fetched fresh" );
        assert.deepEqual( JSON.parse( JSON.stringify( tiApplication.configuration.labels ) ), LABELS );
        assert.equal( tiApplication.getLabel( "interface.topbar.dashboard", "FALLBACK" ), "Dashboard" );
        assert.equal( tiApplication.isInitialized, true );
    } );

    it( "is not initialized until the labels are in", async () => {
        let releaseLabels;
        const pendingLabels = new Promise( ( resolve ) => {
            releaseLabels = resolve;
        } );
        const json = ( body ) => ( { ok: true, statusText: "OK", headers: { get: () => "application/json" }, json: () => Promise.resolve( body ) } );
        const { stores, sandbox } = loadTiFramework();
        // The configuration answers at once; the catalogue only when released.
        sandbox.fetch = ( url ) => ( String( url ) === BUNDLE_URL )
            ? pendingLabels.then( () => json( LABELS ) )
            : Promise.resolve( json( { isSuccessful: true, data: { labelsBundle: { hash: "0123456789abcdef", url: BUNDLE_URL }, auth: { isAuthenticated: false } } } ) );

        stores.tiApplication.init();
        await settle();
        assert.equal( stores.tiApplication.isInitialized, false, "the configuration alone does not make the shell ready" );
        releaseLabels();
        await settle();
        assert.equal( stores.tiApplication.isInitialized, true );
    } );

    it( "uses labels a configuration still carries itself, without a second request", async () => {
        const { tiApplication, calls } = loadWithFetch( {
            "/app/config": { isSuccessful: true, data: { labels: LABELS, auth: { isAuthenticated: false } } }
        } );
        tiApplication.init();
        await settle();
        assert.deepEqual( calls.map( ( call ) => call.url ), [ "/app/config" ] );
        assert.equal( tiApplication.getLabel( "interface.topbar.dashboard", "FALLBACK" ), "Dashboard" );
        assert.equal( tiApplication.isInitialized, true );
    } );

} );
