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
 * The sign-in card's heading slot, and the mark on the Microsoft button (CA-387).
 *
 * The login screen renders before sign-in, so an application reaches it only through the framework's slots, and both
 * of those sat outside the card: the brand slot above it (CA-179) and the extension slot below it (CA-129). A card
 * titled "Sign in", with a line on which account to use, was out of reach. The slot is the same mechanism as theirs:
 * declared on the `login` descriptor, shipped empty, resolved by the reverse-order static-path search.
 *
 * Where the placeholder sits is the point, so the tests pin it: the card's first child, before the error box and the
 * controls, which is the order a screen reader announces.
 */

// `#locateStaticFile` memoizes by relative path, so without this the framework's empty default would be cached and
// the application-override case below could never resolve a different file. Read in the constructor, hence set here.
process.env.TI_WEB_APP_STATIC_CACHE_DISABLED = "true";

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const TiWebAppManager = require( "#web-app-manager" );

const STATIC_ROOT = path.join( path.resolve( __dirname, ".." ), "bin", "static" );
const LOGIN_FRAGMENT = path.join( STATIC_ROOT, "fragments", "frame-login.html" );
const HEAD_COMPONENT = path.join( STATIC_ROOT, "fragments", "components", "component-login-card-head.html" );
const APP_MANAGER = path.join( path.resolve( __dirname, ".." ), "bin", "web-app-manager.js" );
const PLACEHOLDER = "<ti-component-login-card-head-placeholder></ti-component-login-card-head-placeholder>";
const CARD = "<div class=\"ti-login-card\">";

const read = ( file ) => fs.readFileSync( file, "utf8" );

/**
 * Removes HTML comments by scanning with `indexOf`, which visits each character once; a lazy regex over the file is
 * polynomial when a closer is missing. An unterminated comment runs to the end, as HTML's does.
 */
function withoutComments( html ) {
    let kept = "";
    let at = 0;
    while ( at < html.length ) {
        const opensAt = html.indexOf( "<!--", at );
        if ( opensAt < 0 ) {
            return kept + html.slice( at );
        }
        kept += html.slice( at, opensAt );
        const closesAt = html.indexOf( "-->", opensAt + 4 );
        at = ( closesAt < 0 ) ? html.length : closesAt + 3;
    }
    return kept;
}

/**
 * What the card holds before its error box, comments removed and whitespace trimmed: the heading, or nothing.
 */
function beforeTheControls( html ) {
    const plain = withoutComments( html );
    const card = plain.indexOf( CARD );
    const error = plain.indexOf( "<div id=\"ti-error\"" );
    assert.ok( card >= 0 && error > card, "the card and its error box, in that order" );
    return plain.slice( card + CARD.length, error ).trim();
}

describe( "the sign-in card carries a heading slot", () => {

    it( "places the placeholder as the card's first child, before the error box and the controls", () => {
        assert.equal( beforeTheControls( read( LOGIN_FRAGMENT ) ), PLACEHOLDER );
    } );

    it( "registers the component on the login fragment descriptor, or the placeholder is never replaced", () => {
        // `#replaceComponentPlaceholders` resolves only the components a fragment declares; an undeclared placeholder
        // stays in the served HTML as an unknown element that renders nothing and reports nothing.
        const descriptor = /this\.#fragments\[ 'login' \] = \{([\s\S]*?)\};/.exec( read( APP_MANAGER ) );
        assert.ok( descriptor, "no login fragment descriptor found" );
        const list = /components:\s*\[([^\]]*)]/.exec( descriptor[ 1 ] );
        assert.ok( list, "the login fragment descriptor declares no components" );
        const components = list[ 1 ].split( "," ).map( ( entry ) => entry.trim() );
        assert.ok( components.includes( "\"component-login-card-head\"" ), `declared: ${ components.join( ", " ) }` );
        assert.ok( components.includes( "\"component-login-brand\"" ) && components.includes( "\"component-login-extra\"" ), "the other two slots stay declared" );
    } );

    it( "ships the component, and ships it empty", () => {
        // The framework's copy is what makes the placeholder a no-op when no application supplies one. It must exist,
        // or the lookup rejects and takes the login page with it, and it must hold no markup, or every consumer
        // inherits it.
        assert.ok( fs.existsSync( HEAD_COMPONENT ), "the framework must ship the empty default component" );
        assert.equal( withoutComments( read( HEAD_COMPONENT ) ).trim(), "" );
    } );

} );

describe( "the slot resolves an application's heading inside the card", () => {

    // A stand-in for a consuming application's static content directory, holding only the one file it overrides.
    const appStatic = fs.mkdtempSync( path.join( os.tmpdir(), "ti-login-card-head-" ) );
    const APP_HEADING = "<h2 class=\"app-login-card-title\">APPLICATION TITLED THIS</h2>";
    fs.mkdirSync( path.join( appStatic, "fragments", "components" ), { recursive: true } );
    fs.writeFileSync( path.join( appStatic, "fragments", "components", "component-login-card-head.html" ), APP_HEADING );
    after( () => fs.rmSync( appStatic, { recursive: true, force: true } ) );

    class Harness extends TiWebAppManager {
        constructor() {
            super( "login-card-head-slot-test" );
        }
    }

    const render = ( staticContentPaths, methods ) => {
        const manager = new Harness();
        manager.setEnabledAuthMethods( methods || [ "local" ] );
        return manager.assembleHtmlView( null, staticContentPaths, "/app", { csrfToken: "test-token", nonce: "test-nonce" } );
    };

    it( "leaves the card as it was when only the framework supplies the component", async () => {
        const html = await render( [ STATIC_ROOT ] );
        assert.doesNotMatch( html, /ti-component-login-card-head-placeholder/, "an unreplaced placeholder means the component was never resolved" );
        assert.equal( beforeTheControls( html ), "" );
    } );

    it( "renders the application's heading inside the card, before the controls", async () => {
        // The application's path is passed last and must win over the framework's own; inside the card is where only
        // this slot can put anything.
        const html = await render( [ STATIC_ROOT, appStatic ] );
        assert.equal( beforeTheControls( html ), APP_HEADING );
        assert.doesNotMatch( html, /ti-component-login-card-head-placeholder/ );
    } );

    it( "leaves the auth-method gating alone", async () => {
        // The slot is spliced before `transformHtml` strips the auth-method markers; a login page with no sign-in
        // control is a worse outage than a missing heading.
        const html = await render( [ STATIC_ROOT, appStatic ] );
        assert.match( html, /action="\/login\/local"/, "the enabled local form must survive the splice" );
        assert.doesNotMatch( html, /login\/openid-azure/, "a disabled provider must still be stripped" );
    } );

    it( "names the Microsoft button Microsoft's way, with its four-square mark", async () => {
        // The people signing in know their work account as Microsoft's; the old Azure "A" named a product they never
        // see, and Microsoft's branding guidelines for "Sign in with Microsoft" ask for its logo.
        const html = await render( [ STATIC_ROOT ], [ "openid-azure" ] );
        const button = /<a href="\/login\/openid-azure"[\s\S]*?<\/a>/.exec( html );
        assert.ok( button, "the enabled provider's button" );
        for ( const fill of [ "#F25022", "#7FBA00", "#00A4EF", "#FFB900" ] ) {
            assert.match( button[ 0 ], new RegExp( `fill="${ fill }"` ) );
        }
        assert.doesNotMatch( button[ 0 ], /#0078D4/, "the Azure mark is gone" );
        assert.match( button[ 0 ], /x-text-label="interface\.default\.login\.sign-in-azure">Sign in with Microsoft</ );
    } );

} );
