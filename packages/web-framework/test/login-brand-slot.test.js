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
 * The login screen's brand slot (CA-179).
 *
 * The brand block (a mark, a title and a line under it, above the sign-in card) used to be inline in
 * `frame-login.html`, and nothing an application shipped could reach it. The login screen renders before sign-in, so
 * no application fragment is in play, and the one seam it had, `component-login-extra`, sits BELOW the card. Every
 * consumer's login screen therefore opened with the framework's "T" and "Welcome back", and none of them could say
 * what the application was.
 *
 * It is now a component on the same mechanism as the extension slot: declared on the `login` descriptor, shipped
 * with a default, and resolved by the reverse-order static-path search so an application's copy wins. Unlike the
 * extension slot, the default is not empty — a login page with no heading at all is worse than a generic one — so
 * what these pin is that the default is the framework's generic block, and that an application's copy REPLACES it
 * rather than rendering beside it.
 */

// `#locateStaticFile` memoizes by relative path, so without this the framework's default would be cached and the
// application-override case below could never resolve a different file. Read in the constructor, hence set here
// rather than inside a test; `node --test` gives each file its own process, so this affects nothing else.
process.env.TI_WEB_APP_STATIC_CACHE_DISABLED = "true";

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const TiWebAppManager = require( "#web-app-manager" );

const STATIC_ROOT = path.join( path.resolve( __dirname, ".." ), "bin", "static" );
const LOGIN_FRAGMENT = path.join( STATIC_ROOT, "fragments", "frame-login.html" );
const BRAND_COMPONENT = path.join( STATIC_ROOT, "fragments", "components", "component-login-brand.html" );
const APP_MANAGER = path.join( path.resolve( __dirname, ".." ), "bin", "web-app-manager.js" );

const BRAND_PLACEHOLDER = "<ti-component-login-brand-placeholder></ti-component-login-brand-placeholder>";
const DEFAULT_GREETING = "x-text-label=\"interface.default.login.welcome\"";

const read = ( file ) => fs.readFileSync( file, "utf8" );

/**
 * Returns the component names the `login` fragment descriptor declares, read out of the manager's source.
 *
 * @method
 * @returns {string[]}
 * @private
 */
function declaredLoginComponents() {
    const descriptor = /this\.#fragments\[ 'login' \] = \{([\s\S]*?)\};/.exec( read( APP_MANAGER ) );
    assert.ok( descriptor, "no login fragment descriptor found" );
    const list = /components:\s*\[([^\]]*)]/.exec( descriptor[ 1 ] );
    assert.ok( list, "the login fragment descriptor declares no components" );
    return list[ 1 ].split( "," ).map( ( entry ) => entry.trim().replace( /^"|"$/g, "" ) ).filter( Boolean );
}

describe( "the login screen carries a brand slot", () => {

    it( "declares the placeholder above the sign-in card", () => {
        // Above, not merely somewhere: DOM order is the order a screen reader announces, so a brand moved into place
        // by CSS alone would still be read out after the sign-in controls.
        const html = read( LOGIN_FRAGMENT );
        const slotAt = html.indexOf( BRAND_PLACEHOLDER );
        const cardAt = html.indexOf( "class=\"ti-login-card\"" );

        assert.ok( slotAt >= 0, "the fragment must declare the brand placeholder" );
        assert.ok( cardAt > slotAt, "the brand placeholder must come before the sign-in card" );
    } );

    it( "registers the component on the login fragment descriptor, beside the extension slot", () => {
        // `#replaceComponentPlaceholders` only resolves components a fragment declares; an undeclared placeholder is
        // left in the served HTML as an unknown element that renders nothing and reports nothing.
        const components = declaredLoginComponents();

        assert.ok( components.includes( "component-login-brand" ), `declared: ${ components.join( ", " ) }` );
        assert.ok( components.includes( "component-login-extra" ), "the extension slot must stay declared" );
    } );

    it( "no longer carries the brand markup inline, where an application's brand would stack under it", () => {
        assert.doesNotMatch( read( LOGIN_FRAGMENT ), /class="ti-login-brand/ );
    } );

    it( "ships a default brand block, labelled", () => {
        // A missing default would reject with E_WEB_INVALID_REQUEST_URI and take the whole login page with it.
        assert.ok( fs.existsSync( BRAND_COMPONENT ), "the framework must ship the default component" );
        const html = read( BRAND_COMPONENT );

        assert.match( html, /class="ti-login-brand"/ );
        assert.ok( html.includes( DEFAULT_GREETING ), "the default greeting must go through the label directive" );
    } );

} );

describe( "the brand slot resolves an application's component in preference to the default", () => {

    // A stand-in for a consuming application's static content directory, holding only the files it overrides.
    const appStatic = fs.mkdtempSync( path.join( os.tmpdir(), "ti-login-brand-" ) );
    const APP_BRAND = "APPLICATION BRAND";
    const APP_EXTRA = "APPLICATION EXTRA";
    fs.mkdirSync( path.join( appStatic, "fragments", "components" ), { recursive: true } );
    fs.writeFileSync( path.join( appStatic, "fragments", "components", "component-login-brand.html" ),
                      `<div class="app-login-brand">${ APP_BRAND }</div>` );
    fs.writeFileSync( path.join( appStatic, "fragments", "components", "component-login-extra.html" ),
                      `<div class="app-login-extra">${ APP_EXTRA }</div>` );
    after( () => fs.rmSync( appStatic, { recursive: true, force: true } ) );

    class Harness extends TiWebAppManager {
        constructor() {
            super( "login-brand-slot-test" );
        }
    }

    const render = ( staticContentPaths ) => {
        const manager = new Harness();
        manager.setEnabledAuthMethods( [ "local" ] );
        return manager.assembleHtmlView( null, staticContentPaths, "/app", { csrfToken: "test-token", nonce: "test-nonce" } );
    };

    it( "renders the framework's default when only the framework supplies the component", async () => {
        const html = await render( [ STATIC_ROOT ] );

        assert.doesNotMatch( html, /ti-component-login-brand-placeholder/, "an unreplaced placeholder means the component was never resolved" );
        assert.ok( html.includes( DEFAULT_GREETING ), "the default brand block must render" );
    } );

    it( "renders the application's brand in place of the default, never beside it", async () => {
        const html = await render( [ STATIC_ROOT, appStatic ] );

        assert.match( html, new RegExp( APP_BRAND ) );
        assert.ok( !html.includes( DEFAULT_GREETING ), "the framework's greeting must not render next to the application's brand" );
        assert.doesNotMatch( html, /ti-component-login-brand-placeholder/ );
    } );

    it( "keeps the order brand, card, extension when an application supplies both components", async () => {
        const html = await render( [ STATIC_ROOT, appStatic ] );
        const brandAt = html.indexOf( APP_BRAND );
        const cardAt = html.indexOf( "class=\"ti-login-card\"" );
        const extraAt = html.indexOf( APP_EXTRA );

        assert.ok( brandAt >= 0 && cardAt >= 0 && extraAt >= 0, "all three parts must render" );
        assert.ok( brandAt < cardAt && cardAt < extraAt, `expected brand < card < extension, got ${ brandAt } / ${ cardAt } / ${ extraAt }` );
    } );

    it( "splices nothing into an application's own copy of the whole login fragment", async () => {
        // An application that forked `frame-login.html` before this slot existed has no placeholder in its copy. It
        // must keep rendering exactly what it wrote: no default brand stacked in, and no rejection for the component
        // the descriptor now declares.
        const forkStatic = fs.mkdtempSync( path.join( os.tmpdir(), "ti-login-fork-" ) );
        try {
            fs.mkdirSync( path.join( forkStatic, "fragments" ), { recursive: true } );
            fs.writeFileSync( path.join( forkStatic, "fragments", "frame-login.html" ), "<div id=\"ti-login\">FORKED LOGIN</div>" );
            const html = await render( [ STATIC_ROOT, forkStatic ] );

            assert.equal( html, "<div id=\"ti-login\">FORKED LOGIN</div>" );
        } finally {
            fs.rmSync( forkStatic, { recursive: true, force: true } );
        }
    } );

    it( "leaves the auth-method gating alone", async () => {
        // Both slots are spliced before `transformHtml` runs its marker stripping, so a mistake in one could silently
        // disable the other, and a login page with no sign-in form is a worse outage than a generic heading.
        const html = await render( [ STATIC_ROOT, appStatic ] );

        assert.match( html, /action="\/login\/local"/, "the enabled local form must survive the splice" );
        assert.doesNotMatch( html, /login\/openid-azure/, "a disabled provider must still be stripped" );
    } );

} );
