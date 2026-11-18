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
        const at = ( home ) => TiWebServer.resolveApplicationHome( { classPath: "app.js", home: home } );
        assert.deepEqual( at( "/studio" ), { home: "/studio/", error: null } );
        assert.deepEqual( at( "/studio/" ), { home: "/studio/", error: null } );
        assert.deepEqual( at( " /staff/area " ), { home: "/staff/area/", error: null } );
        assert.deepEqual( at( "/a-b_c.d~e/" ), { home: "/a-b_c.d~e/", error: null } );
    } );

    it( "refuses a home off / with no web application manager to serve the shell there", () => {
        // CodeRabbit on #226: `TI_WEB_APPLICATION_HOME` alone creates `application` without a `classPath`, and the shell
        // route then threw on its first request, reading the release of a manager that was never made.
        assert.match( TiWebServer.resolveApplicationHome( { home: "/studio/" } ).error || "", /classPath/ );
        assert.equal( TiWebServer.resolveApplicationHome( { home: "/" } ).error, null, "`/` keeps the behaviour of 1.62" );
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
            const resolved = TiWebServer.resolveApplicationHome( { classPath: "app.js", home: home } );
            assert.match( resolved.error || "", /framework/, `${ home } is refused as the framework's` );
        }
        assert.equal( TiWebServer.resolveApplicationHome( { classPath: "app.js", home: "/apps/" } ).error, null, "a segment that only begins like one is fine" );
        assert.equal( TiWebServer.resolveApplicationHome( { classPath: "app.js", home: "/studio/app/" } ).error, null, "and so is one further down" );
    } );

    it( "stops the server from being constructed with a refused home, rather than putting the shell at /", () => {
        // A typo falling back to `/` would put the shell over the very site the home was moved off. The variable is
        // cleared for the test: inherited, it would replace the home being refused (CodeRabbit on #226).
        const inherited = process.env.TI_WEB_APPLICATION_HOME;
        delete process.env.TI_WEB_APPLICATION_HOME;
        try {
            assert.throws( () => new TiWebServer( "ti-home-refused", { application: { home: "studio" } } ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        } finally {
            if ( inherited !== undefined ) {
                process.env.TI_WEB_APPLICATION_HOME = inherited;
            }
        }
    } );

} );

// CodeRabbit on #226: the shell is routed before the OpenID callbacks, so a home at a callback's path would answer the
// provider's redirect with the shell, and sign-in through that provider could never complete.
describe( "TiWebServer.homeCollision", () => {

    it( "refuses a home whose shell or not-found page is a callback's path", () => {
        assert.match( TiWebServer.homeCollision( "/auth/return/", [ "/auth/return" ] ) || "", /callback/ );
        assert.match( TiWebServer.homeCollision( "/auth/return/", [ "/Auth/Return/" ] ) || "", /callback/, "as Express matches: any case, either slash" );
        assert.match( TiWebServer.homeCollision( "/auth/", [ "/auth/not-found" ] ) || "", /callback/ );
    } );

    it( "reads a long run of slashes in linear time", () => {
        // CodeQL (alert 27) on #226: `/\/+$/` tried every start in a run of slashes; 100k of them before a letter took
        // 1947 ms in Node 26 here, 50k took 504 ms.
        const started = Date.now();
        assert.equal( TiWebServer.homeCollision( "/studio/", [ "/".repeat( 100000 ) + "a" ] ), null );
        assert.ok( Date.now() - started < 200, `${ Date.now() - started } ms` );
    } );

    it( "lets a callback beside or below the home be", () => {
        assert.equal( TiWebServer.homeCollision( "/auth/", [ "/auth/return" ] ), null );
        assert.equal( TiWebServer.homeCollision( "/studio/", [ "/login/azure-callback", null, "" ] ), null );
        assert.equal( TiWebServer.homeCollision( "/", [ "/" ] ), null, "the default home is the framework's own, as in 1.62" );
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

// The pattern a home must match is written three times, and cannot be one constant: the browser's copy is in a plain
// script that requires nothing, and the manager's guards a public method any caller can hand a home. A copy that drifted
// would refuse quietly, the tag left out or ignored and the shell back at `/`. So one table of homes is put through all
// three, and each must accept and refuse the same ones (the review pass, and CodeRabbit on #226, which asked for the
// behaviour to be compared rather than the source).
describe( "the home pattern, in its three places", () => {

    const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

    // Each already ends with `/`, as the server hands a home on; none is under a framework prefix, which only the server
    // checks.
    const HOMES = [
        [ "/studio/", true ], [ "/staff/area/", true ], [ "/a-b_c.d~e/", true ], [ "/x.y/", true ],
        [ "//evil.example/", false ], [ "/a/../", false ], [ "/a/./", false ], [ "/a//b/", false ], [ "/a?x=1/", false ],
        [ "/a#x/", false ], [ "/a b/", false ], [ "/a%2Fb/", false ], [ "/a\"onload=\"x/", false ], [ "studio/", false ],
        [ "https://evil.example/", false ]
    ];

    class Harness extends TiWebAppManager {
        constructor() {
            super( "application-home-pattern-test" );
            this.setEnabledAuthMethods( [ "local" ] );
        }
    }

    const serverAccepts = ( home ) => TiWebServer.resolveApplicationHome( { classPath: "app.js", home: home } ).error === null;
    const managerAccepts = async ( home ) => /<meta name="ti-home" content="/.test( await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", { home: home } ) );
    const browserAccepts = ( home ) => {
        const { stores, sandbox } = loadTiFramework();
        const departures = [];
        sandbox.document.querySelector = ( selector ) => ( selector === "meta[name=\"ti-home\"]" ) ? { getAttribute: () => home } : null;
        sandbox.location = {
            pathname: "/", search: "", set href( url ) {
                departures.push( url );
            }
        };
        stores.tiApplication.openScreen( "../not-a-screen" );
        return departures[ 0 ] === home;
    };

    it( "is accepted and refused alike by the server, the manager and the browser", async () => {
        for ( const [ home, accepted ] of HOMES ) {
            assert.equal( serverAccepts( home ), accepted, `server: ${ home }` );
            assert.equal( await managerAccepts( home ), accepted, `manager: ${ home }` );
            assert.equal( browserAccepts( home ), accepted, `browser: ${ home }` );
        }
    } );

} );
