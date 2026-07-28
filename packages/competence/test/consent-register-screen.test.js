/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Static wiring guards for the Supervisor consent register screen (frame-consent-register.html). Mirrors the house
 * style of fragment-input-bindings.test.js and user-guide-build.test.js: no server/browser needed, just regex
 * assertions over the source files, so these run fast and fail loudly if the wiring regresses.
 *
 * What's guarded, and why:
 *   1. The fragment must be registered with the SUPERVISOR role requirement -- this is what makes the web-framework's
 *      verifyAccess() reject a direct URL hit from anyone else with a 403, not merely hide the sidebar entry.
 *   2. The sidebar entry must be gated to the same role (numeric code 3 = SUPERVISOR) -- otherwise the button would
 *      be shown to people the server then rejects, or hidden from the Supervisor who should see it.
 *   3. The fragment must stay CSP-clean: no inline style=, no optional chaining (both break under the Alpine CSP
 *      build used here), no nonexistent .ti-button class (a previous feature in this repo shipped that by mistake),
 *      and no ti-icon variant that isn't actually defined in ti-framework.css (e.g. "shield" renders silently blank).
 *   4. The Alpine component must unwrap the `.data` envelope every view response is wrapped in
 *      ({ isSuccessful, data } -- see web-handlers.js). Reading `result.cycles`/`result.rows`/`result.records`
 *      directly off the envelope silently yields empty state forever; this was caught during Task 8 review.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const WEB_APPLICATION_FILE = path.join( PACKAGE_ROOT, "bin", "competence-web-application.js" );
const SIDEBAR_FILE = path.join( PACKAGE_ROOT, "bin", "static", "fragments", "components", "component-sidebar.html" );
const FRAGMENT_FILE = path.join( PACKAGE_ROOT, "bin", "static", "fragments", "frame-consent-register.html" );
const UI_SCRIPT_FILE = path.join( PACKAGE_ROOT, "bin", "static", "scripts", "competence-user-interface.js" );
const CSS_FILE = path.join( path.resolve( PACKAGE_ROOT, ".." ), "web-framework", "bin", "static", "scripts", "ti-framework.css" );

function readValidIconTokens() {
    const css = fs.readFileSync( CSS_FILE, "utf8" );
    const tokens = new Set();
    const pattern = /\.ti-icon\.([a-z0-9-]+)\s*\{/g;
    let match;
    while ( ( match = pattern.exec( css ) ) !== null ) {
        tokens.add( match[ 1 ] );
    }
    return tokens;
}

describe( "Consent register screen (CA-###) — static wiring guards", () => {

    it( "the consent-register fragment is registered with the SUPERVISOR role requirement", () => {
        const source = fs.readFileSync( WEB_APPLICATION_FILE, "utf8" );
        const registration = /addFragment\(\s*"consent-register",\s*\{[^}]*?\}\s*\)/s.exec( source );
        assert.ok( registration, "expected an addFragment( \"consent-register\", {...} ) registration" );
        assert.match( registration[ 0 ], /roles:\s*\[\s*SUPERVISOR\s*\]/,
            "consent-register must be gated on SUPERVISOR — the register shows personal per-employee consent decisions" );
        assert.match( registration[ 0 ], /path:\s*"fragments\/frame-consent-register\.html"/,
            "registration must point at the fragment file under the fragments/ path prefix used by every other screen" );
        assert.doesNotMatch( registration[ 0 ], /title:\s*"interface\./,
            "the fragment title is spliced verbatim into the page <title> (see TiWebAppManager#transformHtml) with no " +
            "localization lookup — it must be plain text, like every other addFragment title, not a label key" );
    } );

    it( "the sidebar entry is gated to the same role (numeric role code 3 = SUPERVISOR)", () => {
        const markup = fs.readFileSync( SIDEBAR_FILE, "utf8" );
        const button = /<button hx-get="\/app\/consent-register"[\s\S]*?<\/button>/.exec( markup );
        assert.ok( button, "expected a sidebar button targeting /app/consent-register" );
        assert.match( button[ 0 ], /x-show="\$store\.tiApplication\.hasRole\(3\)"/,
            "sidebar entry must gate on hasRole(3) (SUPERVISOR), matching the fragment's role requirement" );
        assert.match( button[ 0 ], /x-text-label="interface\.navigation\.consent-register"/,
            "sidebar label must use the x-text-label directive (there is no label() helper on these components)" );
    } );

    it( "the fragment has no CSP violations: no inline style=, no optional chaining, no inline event handlers/scripts", () => {
        const markup = fs.readFileSync( FRAGMENT_FILE, "utf8" );
        assert.doesNotMatch( markup, /\sstyle\s*=\s*"/i, "no inline style= attributes are allowed under the Alpine CSP build" );
        assert.doesNotMatch( markup, /\?\./, "optional chaining is rejected by the CSP expression evaluator" );
        assert.doesNotMatch( markup, /\son[a-z]+\s*=\s*"/i, "no inline event-handler attributes (onclick=, etc.)" );
        assert.doesNotMatch( markup, /<script/i, "no inline <script> tags in a fragment" );
    } );

    it( "the fragment only uses real .ti-btn buttons — .ti-button does not exist in the framework CSS", () => {
        const markup = fs.readFileSync( FRAGMENT_FILE, "utf8" );
        assert.ok( !/\bti-button\b/.test( markup ),
            "found a reference to the nonexistent .ti-button class — buttons use .ti-btn (+ primary/ghost/danger/sm/lg/icon modifiers)" );
    } );

    it( "every ti-icon variant used by the fragment is actually defined in ti-framework.css", () => {
        const validTokens = readValidIconTokens();
        // Sanity-check the fixture itself, so this test would fail loudly (not silently pass vacuously) if the
        // framework CSS ever stopped defining these — check-clipboard is what the fragment uses; shield is the
        // known-nonexistent variant the Task 8 brief warned against.
        assert.ok( validTokens.has( "check-clipboard" ), "sanity check: check-clipboard must be a recognized icon variant" );
        assert.ok( !validTokens.has( "shield" ), "sanity check: shield must NOT exist (it renders silently blank)" );

        const markup = fs.readFileSync( FRAGMENT_FILE, "utf8" );
        const classAttrPattern = /class="([^"]*\bti-icon\b[^"]*)"/g;
        const offenders = [];
        let classMatch;
        while ( ( classMatch = classAttrPattern.exec( markup ) ) !== null ) {
            const tokens = classMatch[ 1 ].split( /\s+/ ).filter( ( token ) => token && token !== "ti-icon" );
            for ( const token of tokens ) {
                if ( !validTokens.has( token ) ) {
                    offenders.push( token );
                }
            }
        }
        assert.deepEqual( offenders, [], `unknown ti-icon class token(s) used in the fragment: ${ offenders.join( ", " ) }` );
    } );

    it( "the register/evidence loaders unwrap the JSON envelope's .data (the response is { isSuccessful, data })", () => {
        const source = fs.readFileSync( UI_SCRIPT_FILE, "utf8" );
        const factoryMatch = /const configureConsentRegister = \(\) => \{[\s\S]*?\n\};/.exec( source );
        assert.ok( factoryMatch, "expected to find the configureConsentRegister factory in competence-user-interface.js" );
        const factory = factoryMatch[ 0 ];
        assert.match( factory, /result\.data/, "the loaders must unwrap result.data, not read the envelope's top level" );
        assert.doesNotMatch( factory, /result\.cycles\b/, "must not read cycles directly off the envelope — use result.data.cycles" );
        assert.doesNotMatch( factory, /result\.counts\b/, "must not read counts directly off the envelope — use result.data.counts" );
        assert.doesNotMatch( factory, /result\.rows\b/, "must not read rows directly off the envelope — use result.data.rows" );
        assert.doesNotMatch( factory, /result\.records\b/, "must not read records directly off the envelope — use result.data.records" );
    } );

    it( "the required interface.consent / interface.navigation labels exist with both en and bg leaves", () => {
        const labels = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "localization", "competence-labels.json" ), "utf8" ) );
        const consentKeys = [
            "register-title", "register-intro", "count-granted", "count-declined", "count-not-asked",
            "column-employee", "column-decision", "column-decided", "column-version",
            "evidence-title", "evidence-intro", "evidence-superseded", "evidence-close"
        ];
        const missing = [];
        for ( const key of consentKeys ) {
            const label = labels.interface && labels.interface.consent && labels.interface.consent[ key ];
            if ( !label || !label.en || !label.bg ) {
                missing.push( `interface.consent.${ key }` );
            }
        }
        const navLabel = labels.interface && labels.interface.navigation && labels.interface.navigation[ "consent-register" ];
        if ( !navLabel || !navLabel.en || !navLabel.bg ) {
            missing.push( "interface.navigation.consent-register" );
        }
        assert.deepEqual( missing, [], `Missing consent-register labels (en + bg):\n  ${ missing.join( "\n  " ) }` );
    } );

} );
