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
 * Covers the label catalogue as the browser now receives it: out of `/app/config`, into a content-addressed bundle
 * (CA-174).
 * <br/>
 * `/app/config` is fetched `no-store` on every page load, and it used to carry the whole per-language catalogue — 410 KB
 * in English and 745 KB in Bulgarian for competence, three quarters of which the browser never read. The bundle's URL
 * ends in the hash of its bytes, which is the only thing that makes answering it `immutable` honest: the address can
 * never name anything else, so a browser that has it never needs to ask again.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const crypto = require( "node:crypto" );

const localization = require( "@ti-engine/core/localization" );
const TiWebAppManager = require( "#web-app-manager" );
const TiWebServer = require( "#web-server" );

class WebApp extends TiWebAppManager {
    constructor() {
        super( "labels-bundle-test" );
    }
}

// Leaves out one top-level group, the way competence leaves out competency descriptions and scope anchors.
class NarrowingWebApp extends TiWebAppManager {
    constructor( omitted ) {
        super( "labels-bundle-narrowing-test" );
        this.omitted = omitted;
    }

    getClientLabels( language ) {
        const labels = { ...super.getClientLabels( language ) };
        delete labels[ this.omitted ];
        return labels;
    }
}

const sha16 = ( text ) => crypto.createHash( "sha256" ).update( text ).digest( "hex" ).slice( 0, 16 );

describe( "TiWebAppManager#getLabelsBundle — a catalogue addressed by its own hash", () => {

    it( "serializes what getClientLabels returns and addresses it by the SHA-256 of those bytes", () => {
        const bundle = new WebApp().getLabelsBundle( "en" );
        assert.deepEqual( JSON.parse( bundle.body ), localization.getAllLabels( "en" ), "the default client catalogue is the whole one" );
        assert.equal( bundle.hash, sha16( bundle.body ) );
        assert.equal( bundle.url, `/app/labels/${ bundle.hash }` );
    } );

    it( "builds a language's catalogue once and hands back the same one afterwards", () => {
        const app = new WebApp();
        assert.equal( app.getLabelsBundle( "en" ), app.getLabelsBundle( "en" ) );
    } );

    it( "resolves an absent language the way getAllLabels does — the configured one", () => {
        const app = new WebApp();
        assert.deepEqual( JSON.parse( app.getLabelsBundle( undefined ).body ), localization.getAllLabels( undefined ) );
    } );

    it( "carries exactly what an application narrows it to, and the narrowing reaches the address", () => {
        const full = new WebApp().getLabelsBundle( "en" );
        const group = Object.keys( JSON.parse( full.body ) )[ 0 ];
        const narrowed = new NarrowingWebApp( group ).getLabelsBundle( "en" );
        assert.equal( Object.hasOwn( JSON.parse( narrowed.body ), group ), false, `'${ group }' is not sent to the browser` );
        assert.notEqual( narrowed.hash, full.hash, "different bytes, different address — a browser holding the old one must not keep using it" );
    } );

    it( "finds a catalogue it has built by hash, whichever language it was built for", () => {
        const app = new WebApp();
        const bundle = app.getLabelsBundle( "en" );
        assert.equal( app.findLabelsBundle( bundle.hash ), bundle );
        assert.equal( app.findLabelsBundle( "0000000000000000" ), null );
    } );

    it( "keeps a bounded number of catalogues, and still serves one beyond the bound", () => {
        // A session's language comes from its identity provider's claims, so it is not a closed set. Each language
        // here gets distinct content: languages the catalogue does not hold would otherwise all serialize alike.
        class PerLanguageWebApp extends TiWebAppManager {
            constructor() {
                super( "labels-bundle-bound-test" );
            }

            getClientLabels( language ) {
                return { language: String( language ) };
            }
        }
        const app = new PerLanguageWebApp();
        const bundles = Array.from( { length: 20 }, ( unused, index ) => app.getLabelsBundle( `x${ index }` ) );
        assert.ok( bundles.every( ( bundle ) => typeof bundle.body === "string" && bundle.hash.length === 16 ) );
        assert.equal( app.findLabelsBundle( bundles[ 19 ].hash ) === bundles[ 19 ], false, "past the bound a catalogue is built for the request, not held" );
        assert.equal( app.findLabelsBundle( bundles[ 0 ].hash ), bundles[ 0 ] );
    } );

    it( "hands out a URL the server routes and lists as unprotected — the sign-in page needs it first", () => {
        const { url } = new WebApp().getLabelsBundle( "en" );
        assert.match( url, TiWebServer.RE_LABELS_BUNDLE_UNPROTECTED );
    } );

} );

describe( "TiWebAppManager#processDataRequest( 'config' ) — the catalogue's address, not the catalogue", () => {

    it( "carries labelsBundle { hash, url } and no label tree", async () => {
        const app = new WebApp();
        const config = await app.processDataRequest( { language: "en" }, "config" );
        assert.equal( Object.hasOwn( config, "labels" ), false, "the tree no longer rides on a no-store response fetched every page load" );
        const bundle = app.getLabelsBundle( "en" );
        assert.deepEqual( config.labelsBundle, { hash: bundle.hash, url: bundle.url } );
        assert.ok( JSON.stringify( config ).length < 2048, `/app/config is ${ JSON.stringify( config ).length } bytes` );
    } );

    it( "points an anonymous caller at the configured language's catalogue", async () => {
        const app = new WebApp();
        const config = await app.processDataRequest( null, "config" );
        assert.equal( config.labelsBundle.hash, app.getLabelsBundle( undefined ).hash );
        assert.equal( config.auth.isAuthenticated, false );
    } );

} );
