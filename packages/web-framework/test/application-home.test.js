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
 * The application shell's home (CA-584): the setting itself, as the server reads it, and the shell page that tells the
 * browser where it is.
 *
 * Until 1.63.0 the shell was always at `/`, so an application with a public site of its own could not keep `/` for it:
 * every sign-in, sign-out, refused sign-in and unknown address was sent there. The redirects, routes and client are
 * covered end to end in `web-server.application-home.test.js`, and the browser's half in
 * `ti-framework.application-home.test.js`.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const exceptions = require( "@ti-engine/core/exceptions" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );
const TiWebAppManager = require( "#web-app-manager" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );

const FRAMEWORK_STATIC = path.resolve( __dirname, "..", "bin", "static" );

describe( "TiWebServer.resolveApplicationHome", () => {

    it( "is / when nothing names a home, as before 1.63.0", () => {
        for ( const application of [ undefined, null, {}, { classPath: "app.js" }, { home: "" }, { home: "   " }, { home: "/" } ] ) {
            assert.deepEqual( TiWebServer.resolveApplicationHome( application ), { home: "/", error: null }, JSON.stringify( application ) );
        }
    } );

    it( "ends a home with a slash, so the not-found page and the sign-in answers are addresses under it", () => {
        assert.deepEqual( TiWebServer.resolveApplicationHome( { home: "/studio" } ), { home: "/studio/", error: null } );
        assert.deepEqual( TiWebServer.resolveApplicationHome( { home: "/studio/" } ), { home: "/studio/", error: null } );
        assert.deepEqual( TiWebServer.resolveApplicationHome( { home: " /staff/area " } ), { home: "/staff/area/", error: null } );
        assert.deepEqual( TiWebServer.resolveApplicationHome( { home: "/a-b_c.d~e/" } ), { home: "/a-b_c.d~e/", error: null } );
    } );

    it( "refuses anything that is not a plain path on this site", () => {
        // Each is written into a Location header, an HX-Redirect header and the shell page: none may leave the site,
        // carry a query or fragment of its own, or climb out of itself.
        const refused = [ "studio", "//evil.example/", "https://evil.example/", "/a/../b", "/a/./b", "/a//b", "/a?x=1", "/a#x", "/a b", "/a\\b", "/a%2Fb", "/a\"b", 42, [ "/a" ] ];
        for ( const home of refused ) {
            const resolved = TiWebServer.resolveApplicationHome( { home: home } );
            assert.equal( resolved.home, "/", `${ JSON.stringify( home ) } falls back to /` );
            assert.match( resolved.error || "", /application\.home|TI_WEB_APPLICATION_HOME/, `${ JSON.stringify( home ) } is refused with a reason` );
        }
    } );

    it( "refuses a home inside the framework's own routes, which it would shadow or be shadowed by", () => {
        // The review pass: `/app` put the shell over `GET /app` (Express matches `/app` at the route `/app/`), and
        // `/static/` would put it over the assets.
        for ( const home of [ "/app", "/app/studio/", "/static/", "/login/", "/logout", "/language/", "/me", "/health",
            "/csrf-token", "/admin/", "/service/", "/.well-known/", "/_ti/", "/APP/" ] ) {
            const resolved = TiWebServer.resolveApplicationHome( { home: home } );
            assert.match( resolved.error || "", /framework/, `${ home } is refused as the framework's` );
        }
        assert.equal( TiWebServer.resolveApplicationHome( { home: "/apps/" } ).error, null, "a segment that only begins like one is fine" );
        assert.equal( TiWebServer.resolveApplicationHome( { home: "/studio/app/" } ).error, null, "and so is one further down" );
    } );

    it( "stops the server from being constructed with a refused home, rather than putting the shell at /", () => {
        // A typo falling back to `/` would put the shell over the very site the home was moved off.
        assert.throws( () => new TiWebServer( "ti-home-refused", { application: { home: "studio" } } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
    } );

} );

describe( "TI_WEB_APPLICATION_HOME", () => {

    it( "sets application.home, trimmed, and keeps the rest of application", () => {
        const config = { application: { classPath: "app.js" } };
        applyWebConfigEnvOverrides( config, { TI_WEB_APPLICATION_HOME: " /studio/ " } );
        assert.deepEqual( config.application, { classPath: "app.js", home: "/studio/" } );
    } );

    it( "creates application when the configuration has none", () => {
        const config = {};
        applyWebConfigEnvOverrides( config, { TI_WEB_APPLICATION_HOME: "/studio/" } );
        assert.deepEqual( config.application, { home: "/studio/" } );
    } );

    it( "leaves application alone when unset", () => {
        const config = {};
        applyWebConfigEnvOverrides( config, {} );
        assert.equal( config.application, undefined, "an empty application must not appear, or a server would look for a manager" );
    } );

} );

describe( "the shell page names its home", () => {

    class Harness extends TiWebAppManager {
        constructor() {
            super( "application-home-test" );
            this.setEnabledAuthMethods( [ "local" ] );
        }
    }

    it( "writes <meta name=\"ti-home\"> into the shell when the home is not /", async () => {
        const html = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", { home: "/studio/" } );
        assert.match( html, /<meta name="ti-home" content="\/studio\/"\/>/ );
        assert.equal( html.match( /name="ti-home"/g ).length, 1 );
    } );

    it( "writes it into the not-found page too, which is a shell page", async () => {
        const html = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/not-found", { home: "/studio/" } );
        assert.match( html, /<meta name="ti-home" content="\/studio\/"\/>/ );
    } );

    it( "writes nothing at the default home, so the page is the page of 1.62", async () => {
        const plain = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", {} );
        const atRoot = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", { home: "/" } );
        assert.doesNotMatch( plain, /ti-home/ );
        assert.equal( atRoot, plain );
    } );

    it( "writes nothing into a screen, which is swapped into a page that has it already", async () => {
        const html = await new Harness().assembleHtmlView( { user: { roles: [] } }, [ FRAMEWORK_STATIC ], "/app/about", { view: "about", isPartial: true, home: "/studio/" } );
        assert.doesNotMatch( html, /ti-home/ );
    } );

} );

// The review pass: the pattern a home must match is written three times, and cannot be one constant. The browser's copy
// is in a plain script that requires nothing, and the manager's is checked by a public method any caller can hand a home.
// A copy that drifted would refuse quietly: the tag left out, or ignored, and the shell back at `/`. So they are pinned.
describe( "the home pattern, in its three places", () => {

    const fs = require( "node:fs" );
    const read = ( ...parts ) => fs.readFileSync( path.join( __dirname, "..", ...parts ), "utf8" );
    const PATTERN = String.raw`/^\/(?:(?!\.{1,2}\/)[A-Za-z0-9._~-]+\/)*$/`;

    it( "is the same pattern in the server, the manager and the browser", () => {
        assert.ok( read( "bin", "web-server.js" ).includes( `const RE_APPLICATION_HOME = ${ PATTERN };` ), "web-server.js" );
        assert.ok( read( "bin", "web-app-manager.js" ).includes( `const RE_APPLICATION_HOME = ${ PATTERN };` ), "web-app-manager.js" );
        assert.ok( read( "bin", "static", "scripts", "ti-framework.js" ).includes( `${ PATTERN }.test( content )` ), "ti-framework.js" );
    } );

    it( "keeps the manager from writing a home that is not a plain path, whoever hands it one", async () => {
        class Harness extends TiWebAppManager {
            constructor() {
                super( "application-home-pattern-test" );
                this.setEnabledAuthMethods( [ "local" ] );
            }
        }
        for ( const home of [ "//evil.example/", "/a/../", "/a\"onload=\"x/" ] ) {
            const html = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", { home: home } );
            assert.doesNotMatch( html, /ti-home/, home );
        }
    } );

} );
