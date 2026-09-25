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
 * The login screen's application-extension slot, and the app-specific panel it replaced (CA-129).
 *
 * `frame-login.html` used to carry a "Test user" pill panel whose profile list was a literal array of ONE consuming
 * application's employee IDs (22, 20, 11, 1, 3, 4, 8, 9) and role codes, hardcoded in framework source and rendered
 * on every deployment's login screen. It had been marked TEMPORARY since it was written, in both the fragment and
 * `ti-framework.js`, and nothing removed it because nothing could: the login screen is rendered before sign-in, so
 * no application fragment is in play and an application had no other way to reach it.
 *
 * The slot is that way. The `login` fragment declares a `component-login-extra` component, the framework ships that
 * component EMPTY, and `#locateStaticFile` searches the static content paths in reverse so an application's copy of
 * the same relative path wins. No new API, and the framework keeps owning the login page rather than an application
 * overriding the whole file and forking the auth-method blocks with it.
 *
 * These assertions are about the shipped files rather than a rendered page: the panel's whole defect was that it
 * was IN the package, so the thing to pin is what the package contains. The employee-ID sweep is deliberately a
 * sweep — the next literal anybody hardcodes here will not be spelled the way this one was.
 */

// `#locateStaticFile` memoizes by relative path, so without this the framework's empty default would be cached and
// the application-override case below could never resolve a different file. Read in the constructor, hence set here
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
const EXTRA_COMPONENT = path.join( STATIC_ROOT, "fragments", "components", "component-login-extra.html" );
const FRAMEWORK_SCRIPT = path.join( STATIC_ROOT, "scripts", "ti-framework.js" );
const FRAMEWORK_STYLES = path.join( STATIC_ROOT, "scripts", "ti-framework.css" );
const APP_MANAGER = path.join( path.resolve( __dirname, ".." ), "bin", "web-app-manager.js" );

const read = ( file ) => fs.readFileSync( file, "utf8" );

// Paired comment delimiters, longest opener first so `<!--` is never mistaken for anything shorter.
const BLOCK_COMMENTS = [ { open: "<!--", close: "-->" }, { open: "/*", close: "*/" } ];

/**
 * Removes paired block comments by scanning with `indexOf`.
 *
 * Deliberately not a regex. The obvious spelling — `/<!--[\s\S]*?-->/g` — is *polynomial* on file contents: when a
 * closer is missing the engine rescans to end of input from every opener. Measured on this machine at 1000 → 8000
 * openers: 2.6ms → 168.4ms, a 64x rise for 8x the input, which is quadratic and is what CodeQL reports as
 * `js/polynomial-redos`. This scan visits each character once.
 *
 * An unterminated comment runs to end of input, which is what HTML and JavaScript both do with one.
 */
function stripBlockComments( source ) {
    let kept = "";
    let at = 0;
    while ( at < source.length ) {
        let opensAt = -1;
        let delimiter = null;
        for ( const candidate of BLOCK_COMMENTS ) {
            const found = source.indexOf( candidate.open, at );
            if ( found >= 0 && ( opensAt < 0 || found < opensAt ) ) {
                opensAt = found;
                delimiter = candidate;
            }
        }
        if ( opensAt < 0 ) {
            return kept + source.slice( at );
        }
        kept += source.slice( at, opensAt );
        const closesAt = source.indexOf( delimiter.close, opensAt + delimiter.open.length );
        at = ( closesAt < 0 ) ? source.length : closesAt + delimiter.close.length;
    }
    return kept;
}

/**
 * Drops whole-line `//` comments, and only whole-line ones — a `//` later in a line may be inside a string or a URL,
 * and cutting from there would silently discard real code this file is supposed to be searching.
 *
 * Split per line rather than matched with `/^\s*\/\/.*$/gm`: in that spelling `\s` matches a newline, so `^\s*`
 * backtracks across lines from every line start. Measured at 2000 → 16000 lines: 7.2ms → 421.4ms, 58x for 8x the
 * input. Anchored against a single line with horizontal whitespace only, there is nothing to backtrack over.
 */
function stripFullLineComments( source ) {
    return source.split( "\n" ).map( ( line ) => ( /^[ \t]*\/\//.test( line ) ? "" : line ) ).join( "\n" );
}

/**
 * Strips comments so a rule that only *mentions* the panel — this test's own subject matter, or a changelog-style
 * note — cannot be mistaken for the panel still shipping.
 */
const withoutComments = ( source ) => stripFullLineComments( stripBlockComments( source ) );

describe( "the login screen carries an application-extension slot", () => {

    it( "declares the placeholder element in the fragment", () => {
        assert.match( read( LOGIN_FRAGMENT ), /<ti-component-login-extra-placeholder>\s*<\/ti-component-login-extra-placeholder>/ );
    } );

    it( "registers the component on the login fragment descriptor, or the placeholder is never replaced", () => {
        // `#replaceComponentPlaceholders` only resolves components a fragment declares; an undeclared placeholder is
        // left in the served HTML as an unknown element that renders nothing and reports nothing.
        // Membership, not the whole list: the descriptor also declares the brand slot (CA-179).
        const descriptor = /this\.#fragments\[ 'login' \] = \{([\s\S]*?)\};/.exec( read( APP_MANAGER ) );
        assert.ok( descriptor, "no login fragment descriptor found" );
        const list = /components:\s*\[([^\]]*)]/.exec( descriptor[ 1 ] );
        assert.ok( list, "the login fragment descriptor declares no components" );
        assert.ok( list[ 1 ].split( "," ).map( ( entry ) => entry.trim() ).includes( "\"component-login-extra\"" ) );
    } );

    it( "ships the component, and ships it empty", () => {
        // The framework's copy is the fallback that makes the placeholder a no-op when no application supplies one.
        // It must exist — a missing file rejects with E_WEB_INVALID_REQUEST_URI and takes the login page with it —
        // and it must contribute no markup, or every consumer inherits whatever it contains.
        assert.ok( fs.existsSync( EXTRA_COMPONENT ), "the framework must ship the empty default component" );
        assert.equal( withoutComments( read( EXTRA_COMPONENT ) ).trim(), "" );
    } );

} );

describe( "no application-specific identity picker ships in the framework", () => {

    it( "the login fragment holds no test-user panel", () => {
        const html = withoutComments( read( LOGIN_FRAGMENT ) );
        assert.doesNotMatch( html, /ti-login-test/ );
        assert.doesNotMatch( html, /tiLoginTestUserPanel/ );
    } );

    it( "the framework script neither defines nor registers the panel", () => {
        const script = withoutComments( read( FRAMEWORK_SCRIPT ) );
        assert.doesNotMatch( script, /configureLoginTestUserPanel/ );
        assert.doesNotMatch( script, /tiLoginTestUserPanel/ );
    } );

    it( "the framework script does not read or write the identity cookie", () => {
        // The cookie is the actual mechanism — an application's `augmentSession` reads `ti-test-user` to choose the
        // acting employee. Naming it here would mean the framework still owns half the feature.
        assert.doesNotMatch( withoutComments( read( FRAMEWORK_SCRIPT ) ), /ti-test-user/ );
    } );

    it( "the framework stylesheet carries no rules for it", () => {
        assert.doesNotMatch( withoutComments( read( FRAMEWORK_STYLES ) ), /\.ti-login-test/ );
    } );

    it( "no consuming application's employee identifiers are hardcoded in the login surface", () => {
        // The sweep, not the eight literals: a `{ employeeID: "…" }` object anywhere in the framework's client code
        // is an application's data in the framework's package, whichever IDs it happens to name.
        for ( const file of [ LOGIN_FRAGMENT, FRAMEWORK_SCRIPT, EXTRA_COMPONENT ] ) {
            assert.doesNotMatch( withoutComments( read( file ) ), /employeeID/, `${ path.basename( file ) } names an application's employee identity` );
        }
    } );

} );

describe( "the slot resolves an application's component in preference to the empty default", () => {

    // A stand-in for a consuming application's static content directory, holding only the one file it overrides.
    const appStatic = fs.mkdtempSync( path.join( os.tmpdir(), "ti-login-slot-" ) );
    const APP_PANEL = "APPLICATION SUPPLIED THIS";
    fs.mkdirSync( path.join( appStatic, "fragments", "components" ), { recursive: true } );
    fs.writeFileSync( path.join( appStatic, "fragments", "components", "component-login-extra.html" ),
                      `<div class="app-login-extra">${ APP_PANEL }</div>` );
    after( () => fs.rmSync( appStatic, { recursive: true, force: true } ) );

    class Harness extends TiWebAppManager {
        constructor() {
            super( "login-extra-slot-test" );
        }
    }

    const render = ( staticContentPaths ) => {
        const manager = new Harness();
        manager.setEnabledAuthMethods( [ "local" ] );
        return manager.assembleHtmlView( null, staticContentPaths, "/app", { csrfToken: "test-token", nonce: "test-nonce" } );
    };

    it( "renders nothing into the slot when only the framework supplies the component", async () => {
        const html = await render( [ STATIC_ROOT ] );
        assert.doesNotMatch( html, /ti-component-login-extra-placeholder/, "an unreplaced placeholder means the component was never resolved" );
        assert.doesNotMatch( html, /ti-login-test/, "the removed panel must not come back through the slot" );
    } );

    it( "renders the application's component when its static path is present", async () => {
        // The reverse-order search is the whole mechanism: the application path is passed last and must win over the
        // framework's own. If this ever regresses, every consumer's login screen silently loses its extension.
        const html = await render( [ STATIC_ROOT, appStatic ] );
        assert.match( html, new RegExp( APP_PANEL ) );
        assert.doesNotMatch( html, /ti-component-login-extra-placeholder/ );
    } );

    it( "leaves the auth-method gating alone either way", async () => {
        // The slot is spliced before `transformHtml` runs its marker stripping, so a mistake in one could silently
        // disable the other — and a login page with no sign-in form is a worse outage than a missing dev panel.
        const html = await render( [ STATIC_ROOT, appStatic ] );
        assert.match( html, /action="\/login\/local"/, "the enabled local form must survive the splice" );
        assert.doesNotMatch( html, /login\/openid-azure/, "a disabled provider must still be stripped" );
    } );

} );
