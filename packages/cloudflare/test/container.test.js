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
 * What a ti-engine application's container starts with on Cloudflare, and what it may reach (CA-362).
 *
 * None of this fails anywhere but in production. A setting the container never receives, a platform setting a
 * variable can override, a sleep timer the library cannot parse, or a call that cannot leave the container: each
 * passes every local run, because wrangler's local runtime resolves names and reaches the internet, and each surfaces
 * deployed, as a container that exits at boot, never starts, or refuses every sign-in or sign-up.
 */

const { afterEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const { pathToFileURL } = require( "node:url" );
const {
    STATE_ADDRESS, CONTAINER_PORT, PLATFORM_SETTINGS, containerEnvironment, IDENTITY_PROVIDER_HOSTS,
    INTERCEPTED_HTTPS_SETTINGS, allowedHosts, sleepAfter, createBroker
} = require( "#container" );

const realFetch = globalThis.fetch;

afterEach( () => {
    globalThis.fetch = realFetch;
} );

/**
 * Stands in for the Workers runtime's `fetch`, and records each call.
 *
 * @param {function(): Response} answer
 * @returns {Object[]}
 */
function stubFetch( answer ) {
    const calls = [];
    globalThis.fetch = async ( url, init ) => {
        calls.push( { url: String( url ), method: init.method, headers: Object.assign( {}, init.headers ), body: init.body } );
        return answer();
    };
    return calls;
}

describe( "container — the platform", () => {

    it( "is what every ti-engine application on Cloudflare runs as", () => {
        // A change here changes every application's container the moment it takes the release. It changes on purpose.
        assert.deepEqual( PLATFORM_SETTINGS, {
            TI_WEB_HOST: "0.0.0.0",
            TI_WEB_PORT: "3000",
            TI_WEB_USE_TLS: "false",
            TI_MEMORY_CACHE_PROVIDER: "http",
            TI_MEMORY_CACHE_STATE_URL: "http://11.0.0.1",
            TI_MEMORY_CACHE_REQUIRED_CAPABILITIES: "json-documents,atomic-json-edit",
            TI_MESSAGE_EXCHANGE_ENABLED: "false",
            TI_SERVICE_HEALTH_CHECK_ENABLED: "false",
            TI_AUDITING_LOG_USES_JSON: "true"
        } );
        assert.ok( Object.isFrozen( PLATFORM_SETTINGS ) );
    } );

    it( "puts the state at an address, which needs no DNS, and the application on the class's port", () => {
        assert.match( STATE_ADDRESS, /^\d+\.\d+\.\d+\.\d+$/ );
        assert.equal( PLATFORM_SETTINGS.TI_MEMORY_CACHE_STATE_URL, `http://${ STATE_ADDRESS }` );
        assert.equal( PLATFORM_SETTINGS.TI_WEB_PORT, String( CONTAINER_PORT ) );
    } );

} );

describe( "container — the environment", () => {

    // competence's: every setting an operator gives the Worker, for the application to read.
    const PASS_THROUGH = /^(TI|COMPETENCE)_[A-Z0-9_]+$/;

    it( "passes through the string bindings the pattern names, and nothing else", () => {
        const environment = containerEnvironment( {
            TI_WEB_AUTH_ADMINS: "boris@example.com",
            TI_WEB_COOKIE_SECRET: "secret-from-the-store",
            COMPETENCE_TEST_USER_ENABLED: "false",
            DB: { prepare: () => null },
            CONTAINER: { idFromName: () => null },
            UNRELATED: "not for the container",
            ti_lowercase: "not a setting",
            TI_NOT_A_STRING: 42,
            TI_AN_OBJECT: { a: 1 }
        }, { passThrough: PASS_THROUGH } );
        assert.equal( environment.TI_WEB_AUTH_ADMINS, "boris@example.com" );
        assert.equal( environment.TI_WEB_COOKIE_SECRET, "secret-from-the-store" );
        assert.equal( environment.COMPETENCE_TEST_USER_ENABLED, "false" );
        for ( const name of [ "DB", "CONTAINER", "UNRELATED", "ti_lowercase", "TI_NOT_A_STRING", "TI_AN_OBJECT" ] ) {
            assert.equal( name in environment, false, name );
        }
        assert.ok( Object.values( environment ).every( ( value ) => typeof value === "string" ), "a container's environment is strings" );
    } );

    it( "passes nothing through without a pattern", () => {
        assert.deepEqual( containerEnvironment( { TI_WEB_AUTH_ADMINS: "boris@example.com" } ), PLATFORM_SETTINGS );
        assert.deepEqual( containerEnvironment( undefined ), PLATFORM_SETTINGS );
    } );

    it( "gives each default when its binding is absent, blank or not a string, and the binding otherwise", () => {
        const defaults = { TI_WEB_AUTH_METHODS: "openid-azure", TI_SITE_ALLOW_INDEXING: "false", TI_WEB_COOKIE_SECRET: "" };
        const unset = containerEnvironment( {}, { defaults } );
        assert.equal( unset.TI_WEB_AUTH_METHODS, "openid-azure" );
        assert.equal( unset.TI_SITE_ALLOW_INDEXING, "false" );
        assert.equal( unset.TI_WEB_COOKIE_SECRET, "", "empty, never undefined" );
        for ( const blank of [ "", "  ", 42, true, { a: 1 } ] ) {
            assert.equal( containerEnvironment( { TI_WEB_AUTH_METHODS: blank }, { defaults } ).TI_WEB_AUTH_METHODS, "openid-azure", JSON.stringify( blank ) );
        }
        // A binding is taken as it is, defaulted or passed through: the container reads it, not this.
        const set = containerEnvironment( { TI_WEB_AUTH_METHODS: " local ", TI_SITE_ALLOW_INDEXING: "true" }, { defaults } );
        assert.equal( set.TI_WEB_AUTH_METHODS, " local " );
        assert.equal( set.TI_SITE_ALLOW_INDEXING, "true" );
    } );

    it( "receives a default's binding without a pattern, as an application that lists its variables does", () => {
        // The Boris Khan site's: five bindings, each always present, and nothing else of the Worker's.
        const defaults = {
            TI_WEB_COOKIE_SECRET: "", TI_WEB_AUTH_METHODS: "", TI_WEB_AUTH_ADMINS: "", TI_SITE_ALLOW_INDEXING: "false",
            TI_SITE_TURNSTILE_SECRET: ""
        };
        const environment = containerEnvironment(
            { TI_SITE_ALLOW_INDEXING: "true", TI_SITE_TURNSTILE_SECRET: "the-secret", TI_UNLISTED: "x", DB: {} },
            { defaults, settings: { TI_SITE_TURNSTILE_VERIFY_URL: "http://11.0.0.1/turnstile/v0/siteverify" } }
        );
        assert.deepEqual( environment, Object.assign( {}, PLATFORM_SETTINGS, {
            TI_WEB_COOKIE_SECRET: "", TI_WEB_AUTH_METHODS: "", TI_WEB_AUTH_ADMINS: "", TI_SITE_ALLOW_INDEXING: "true",
            TI_SITE_TURNSTILE_SECRET: "the-secret", TI_SITE_TURNSTILE_VERIFY_URL: "http://11.0.0.1/turnstile/v0/siteverify"
        } ) );
    } );

    it( "puts the platform over every variable and default, so none can change what the deployment is", () => {
        const environment = containerEnvironment( {
            TI_MEMORY_CACHE_PROVIDER: "redis",
            TI_MEMORY_CACHE_STATE_URL: "http://somewhere.else",
            TI_WEB_PORT: "8080",
            TI_WEB_USE_TLS: "true",
            TI_MESSAGE_EXCHANGE_ENABLED: "true",
            TI_SERVICE_HEALTH_CHECK_ENABLED: "true"
        }, { passThrough: PASS_THROUGH, defaults: { TI_AUDITING_LOG_USES_JSON: "false" } } );
        assert.deepEqual( environment, PLATFORM_SETTINGS );
    } );

    it( "puts the application's own settings over everything, the platform included", () => {
        const environment = containerEnvironment( { COMPETENCE_DATA_STORE: "redis" }, {
            passThrough: PASS_THROUGH,
            settings: Object.assign( { COMPETENCE_DATA_STORE: "d1" }, INTERCEPTED_HTTPS_SETTINGS )
        } );
        assert.equal( environment.COMPETENCE_DATA_STORE, "d1" );
        assert.equal( environment.NODE_EXTRA_CA_CERTS, "/etc/cloudflare/certs/cloudflare-containers-ca.crt" );
        // Code, reviewed, may move what a variable may not.
        assert.equal( containerEnvironment( {}, { settings: { TI_WEB_PORT: "8080" } } ).TI_WEB_PORT, "8080" );
    } );

    it( "builds a new environment each time, sharing nothing with the options or the platform", () => {
        const settings = { TI_EXTRA: "a" };
        const first = containerEnvironment( {}, { settings } );
        first.TI_EXTRA = "changed";
        first.TI_WEB_PORT = "1";
        assert.equal( containerEnvironment( {}, { settings } ).TI_EXTRA, "a" );
        assert.equal( PLATFORM_SETTINGS.TI_WEB_PORT, "3000" );
    } );

    // A container starts with whatever this returns, so a malformed option is refused where it is written, rather
    // than discovered as a setting that never arrives.
    const refusals = [
        [ "options that are not an object", "TI_" ],
        [ "an unknown option", { passthrough: PASS_THROUGH } ],
        [ "a pattern that is a string", { passThrough: "^TI_" } ],
        [ "a pattern that is a list", { passThrough: [ "TI_WEB_PORT" ] } ],
        [ "a global pattern, which remembers where it last matched", { passThrough: /^TI_/g } ],
        [ "a sticky pattern", { passThrough: /^TI_/y } ],
        [ "defaults that are not an object", { defaults: [ "TI_WEB_PORT" ] } ],
        [ "a default that is not a string", { defaults: { TI_SITE_ALLOW_INDEXING: false } } ],
        [ "settings that are not an object", { settings: "TI_WEB_PORT=3000" } ],
        [ "a setting that is not a string", { settings: { TI_WEB_PORT: 3000 } } ]
    ];

    for ( const [ name, options ] of refusals ) {
        it( `refuses ${ name }`, () => {
            assert.throws( () => containerEnvironment( {}, options ), TypeError );
        } );
    }

} );

describe( "container — the hosts it may reach", () => {

    const hostsFor = ( environment ) => allowedHosts( environment ).sort();

    it( "is the state address alone without an OpenID sign-in", () => {
        for ( const methods of [ undefined, "", "local", " local " ] ) {
            assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: methods } ), [ STATE_ADDRESS ], String( methods ) );
        }
        assert.deepEqual( hostsFor( {} ), [ STATE_ADDRESS ] );
    } );

    it( "adds each enabled identity provider's server-side hosts, and no other provider's", () => {
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-azure" } ), [ STATE_ADDRESS, "graph.microsoft.com", "login.microsoftonline.com" ].sort() );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "local, openid-google" } ), [ STATE_ADDRESS, ...IDENTITY_PROVIDER_HOSTS[ "openid-google" ] ].sort() );
        assert.equal( hostsFor( { TI_WEB_AUTH_METHODS: "openid-azure,openid-google" } ).length, 1 + 2 + 4 );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-unknown" } ), [ STATE_ADDRESS ] );
    } );

    it( "adds a discovery document's host for an enabled method, once, and ignores one that is not a URL", () => {
        // Whole lists compared, not membership: an extra host is as wrong as a missing one.
        const azure = [ STATE_ADDRESS, ...IDENTITY_PROVIDER_HOSTS[ "openid-azure" ] ];
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-azure", TI_AZURE_AUTH_DISCOVERY_URL: "https://login.microsoftonline.us/tenant/v2.0/.well-known/openid-configuration" } ),
            [ ...azure, "login.microsoftonline.us" ].sort() );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-google", TI_GCLOUD_AUTH_DISCOVERY_URL: "https://accounts.example.com/.well-known/openid-configuration" } ),
            [ STATE_ADDRESS, ...IDENTITY_PROVIDER_HOSTS[ "openid-google" ], "accounts.example.com" ].sort() );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "local", TI_AZURE_AUTH_DISCOVERY_URL: "https://login.microsoftonline.us/x" } ), [ STATE_ADDRESS ], "only for an enabled method" );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-azure", TI_AZURE_AUTH_DISCOVERY_URL: "not a url" } ), azure.sort(), "a URL that is not one adds nothing" );
        assert.deepEqual( hostsFor( { TI_WEB_AUTH_METHODS: "openid-azure", TI_AZURE_AUTH_DISCOVERY_URL: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration" } ),
            azure.sort(), "each host once" );
    } );

    it( "names the hosts as frozen lists, and the setting intercepted HTTPS needs", () => {
        assert.ok( Object.isFrozen( IDENTITY_PROVIDER_HOSTS ) );
        assert.ok( Object.values( IDENTITY_PROVIDER_HOSTS ).every( ( hosts ) => Object.isFrozen( hosts ) ) );
        assert.deepEqual( INTERCEPTED_HTTPS_SETTINGS, { NODE_EXTRA_CA_CERTS: "/etc/cloudflare/certs/cloudflare-containers-ca.crt" } );
        assert.ok( Object.isFrozen( INTERCEPTED_HTTPS_SETTINGS ) );
    } );

} );

describe( "container — the sleep timer", () => {

    it( "takes a value the library can use, trimmed, and the fallback for anything else", () => {
        for ( const value of [ "2m", "10m", "1h", "30s", "90s" ] ) {
            assert.equal( sleepAfter( value, "10m" ), value );
        }
        assert.equal( sleepAfter( " 2m ", "10m" ), "2m" );
        for ( const value of [ undefined, null, "", "  ", "0m", "0", "5", 5, "2 m", "2min", "2M", "-1m", "1.5m", "m" ] ) {
            assert.equal( sleepAfter( value, "10m" ), "10m", JSON.stringify( value ) );
        }
    } );

    it( "passes on exactly what `@cloudflare/containers` can parse, above zero", async () => {
        // The library parses the value on every renewal, inside the Durable Object, after the constructor has run: a value
        // it cannot parse throws there, and the container never starts. Zero it accepts, as a cold start per request.
        const entry = require.resolve( "@cloudflare/containers" );
        const { parseTimeExpression } = await import( pathToFileURL( path.join( path.dirname( entry ), "lib", "helpers.js" ) ).href );
        const parsesAboveZero = ( value ) => {
            try {
                return parseTimeExpression( value ) > 0;
            } catch {
                return false;
            }
        };
        for ( const value of [ "2m", "10m", "1h", "30s", "0m", "0s", "00m", "2 m", "2min", "2M", "1.5m", "-1m", "", "s", "999h", "007m" ] ) {
            assert.equal( sleepAfter( value, "10m" ) === value, parsesAboveZero( value ), `'${ value }'` );
            assert.ok( parsesAboveZero( sleepAfter( value, "10m" ) ), `'${ value }' resolved to '${ sleepAfter( value, "10m" ) }'` );
        }
    } );

    it( "refuses a fallback the library could not use", () => {
        for ( const fallback of [ undefined, "", "0m", "2min", 120 ] ) {
            assert.throws( () => sleepAfter( "2m", fallback ), TypeError, JSON.stringify( fallback ) );
        }
    } );

} );

describe( "container — a call the Worker makes for the container", () => {

    const SITEVERIFY_PATH = "/turnstile/v0/siteverify";
    const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    // The Boris Khan site's: Turnstile's `siteverify`, which the container cannot reach itself.
    const siteverify = () => createBroker( { path: SITEVERIFY_PATH, url: SITEVERIFY, contentType: "application/x-www-form-urlencoded" } );
    const atState = ( pathname ) => `http://${ STATE_ADDRESS }${ pathname }`;

    it( "tells the container where to send it: its path at the state address", () => {
        const broker = siteverify();
        assert.equal( broker.path, SITEVERIFY_PATH );
        assert.equal( broker.address, atState( SITEVERIFY_PATH ) );
    } );

    it( "recognises the container's request by its path alone", () => {
        const broker = siteverify();
        assert.equal( broker.matches( new Request( atState( SITEVERIFY_PATH ), { method: "POST" } ) ), true );
        assert.equal( broker.matches( new Request( atState( SITEVERIFY_PATH + "?x=1" ) ) ), true );
        assert.equal( broker.matches( new Request( atState( "/v1/values/get" ), { method: "POST" } ) ), false );
        assert.equal( broker.matches( new Request( atState( SITEVERIFY_PATH + "/" ) ) ), false );
    } );

    it( "forwards a POST's body to the URL, and returns the answer as it came", async () => {
        const calls = stubFetch( () => Response.json( { "success": true, "action": "capture" }, { status: 200 } ) );
        const response = await siteverify().forward( new Request( atState( SITEVERIFY_PATH ), {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-other": "not passed on" },
            body: "secret=the-secret&response=a-token"
        } ) );
        assert.deepEqual( await response.json(), { "success": true, "action": "capture" } );
        // The content type is the one the broker names, and no other header of the container's goes out.
        assert.deepEqual( calls, [ {
            url: SITEVERIFY, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
            body: "secret=the-secret&response=a-token"
        } ] );
    } );

    it( "passes on the container's own content type when it names none", async () => {
        const calls = stubFetch( () => new Response( "ok" ) );
        const broker = createBroker( { path: "/hooks/notify", url: "https://hooks.example.com/notify" } );
        await broker.forward( new Request( atState( "/hooks/notify" ), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" } ) );
        await broker.forward( new Request( atState( "/hooks/notify" ), { method: "POST", body: new Uint8Array( [ 1 ] ) } ) );
        assert.deepEqual( calls.map( ( call ) => call.headers ), [ { "content-type": "application/json" }, {} ] );
    } );

    it( "refuses anything but a POST, and sends nothing out", async () => {
        const calls = stubFetch( () => new Response( "ok" ) );
        for ( const method of [ "GET", "PUT", "DELETE" ] ) {
            const response = await siteverify().forward( new Request( atState( SITEVERIFY_PATH ), { method: method, body: method === "GET" ? undefined : "x" } ) );
            assert.equal( response.status, 405, method );
            assert.equal( response.headers.get( "allow" ), "POST" );
        }
        assert.equal( calls.length, 0 );
    } );

    it( "answers 502 when the URL cannot be reached, which the container refuses as unverifiable", async () => {
        stubFetch( () => {
            throw new TypeError( "fetch failed" );
        } );
        const response = await siteverify().forward( new Request( atState( SITEVERIFY_PATH ), { method: "POST", body: "secret=s&response=t" } ) );
        assert.equal( response.status, 502 );
    } );

    // One broker is one operation at the state address; anything looser is a proxy the container could steer.
    const refusals = [
        [ "options that are not an object", SITEVERIFY_PATH ],
        [ "an unknown option", { path: SITEVERIFY_PATH, url: SITEVERIFY, method: "GET" } ],
        [ "a missing path", { url: SITEVERIFY } ],
        [ "a path that is not rooted", { path: "turnstile/v0/siteverify", url: SITEVERIFY } ],
        [ "a path with a query", { path: "/turnstile?x=1", url: SITEVERIFY } ],
        [ "the state protocol's paths", { path: "/v1/values/get", url: SITEVERIFY } ],
        [ "the state protocol's root", { path: "/v1", url: SITEVERIFY } ],
        [ "the root", { path: "/", url: SITEVERIFY } ],
        [ "a missing URL", { path: SITEVERIFY_PATH } ],
        [ "a URL that is not one", { path: SITEVERIFY_PATH, url: "challenges.cloudflare.com/turnstile" } ],
        [ "a URL that is not HTTPS", { path: SITEVERIFY_PATH, url: "http://challenges.cloudflare.com/turnstile/v0/siteverify" } ],
        [ "an empty content type", { path: SITEVERIFY_PATH, url: SITEVERIFY, contentType: "" } ]
    ];

    for ( const [ name, options ] of refusals ) {
        it( `refuses ${ name }`, () => {
            assert.throws( () => createBroker( options ), TypeError );
        } );
    }

} );
