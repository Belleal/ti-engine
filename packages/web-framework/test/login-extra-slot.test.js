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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const STATIC_ROOT = path.join( path.resolve( __dirname, ".." ), "bin", "static" );
const LOGIN_FRAGMENT = path.join( STATIC_ROOT, "fragments", "frame-login.html" );
const EXTRA_COMPONENT = path.join( STATIC_ROOT, "fragments", "components", "component-login-extra.html" );
const FRAMEWORK_SCRIPT = path.join( STATIC_ROOT, "scripts", "ti-framework.js" );
const FRAMEWORK_STYLES = path.join( STATIC_ROOT, "scripts", "ti-framework.css" );
const APP_MANAGER = path.join( path.resolve( __dirname, ".." ), "bin", "web-app-manager.js" );

const read = ( file ) => fs.readFileSync( file, "utf8" );

/**
 * Strips comments so a rule that only *mentions* the panel — this test's own subject matter, or a changelog-style
 * note — cannot be mistaken for the panel still shipping.
 */
const withoutComments = ( source ) => source
    .replace( /<!--[\s\S]*?-->/g, "" )
    .replace( /\/\*[\s\S]*?\*\//g, "" )
    .replace( /^\s*\/\/.*$/gm, "" );

describe( "the login screen carries an application-extension slot", () => {

    it( "declares the placeholder element in the fragment", () => {
        assert.match( read( LOGIN_FRAGMENT ), /<ti-component-login-extra-placeholder>\s*<\/ti-component-login-extra-placeholder>/ );
    } );

    it( "registers the component on the login fragment descriptor, or the placeholder is never replaced", () => {
        // `#replaceComponentPlaceholders` only resolves components a fragment declares; an undeclared placeholder is
        // left in the served HTML as an unknown element that renders nothing and reports nothing.
        const descriptor = /this\.#fragments\[ 'login' \] = \{([\s\S]*?)\};/.exec( read( APP_MANAGER ) );
        assert.ok( descriptor, "no login fragment descriptor found" );
        assert.match( descriptor[ 1 ], /components:\s*\[\s*"component-login-extra"\s*]/ );
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
