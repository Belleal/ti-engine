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
 * What a ti-engine application's container starts with on Cloudflare, and what it may reach (CA-362).
 * <br/>
 * On Cloudflare the application runs as a container behind a Worker. The container has no address of its own, and its
 * state lives in D1, behind the Worker: sessions and the configuration store reach it over the state protocol, at an
 * address the Worker intercepts ({@link STATE_ADDRESS}). Most of what a container needs to run that way is the same for
 * every application ({@link PLATFORM_SETTINGS}). What differs is which of the Worker's bindings it receives, and how it
 * reaches anything else.
 * <br/>
 * There are two ways out, and the container chooses between them, in one option of {@link containerSetup}. Both start
 * from `enableInternet = false`, which denies everything not listed:
 * - **Intercepted HTTPS**, for a container that makes HTTPS calls itself, such as an OpenID sign-in. The class sets
 *   `interceptHttps = true` and allows the identity providers' hosts ({@link allowedHosts}), and Node trusts the CA
 *   Cloudflare re-signs that traffic with ({@link INTERCEPTED_HTTPS_SETTINGS}).
 * - **Brokered by the Worker**, for a container that should reach nothing but the state address. It sends a call, such
 *   as Turnstile's `siteverify`, over plain HTTP to the state address, and the Worker makes it ({@link createBroker}).
 * <br/>
 * It knows nothing of the applications that use it. Every application gets the framework's own settings, `TI_*`, and
 * names its own prefix, settings and calls through options.
 * <br/>
 * NOTE: Runs in the Workers runtime, so it requires nothing, not even another module of this package, and uses only the
 * `Request`, `Response`, `URL` and `fetch` globals both Workers and Node provide.
 *
 * @module container
 */

/**
 * Where the container reaches the state service, and every other call the Worker answers for it. An address, not a
 * hostname: with the internet off, the container gets no DNS in production. So a name like `state.internal` never
 * resolves, and the application exits at boot. That shows only once deployed, because wrangler's local runtime does
 * resolve such names. Nothing listens here: Cloudflare's egress layer hands out this address for an intercepted
 * virtual host, and the Worker's `outboundByHost` handler for it answers.
 *
 * @type {string}
 * @public
 */
const STATE_ADDRESS = "11.0.0.1";

/**
 * The port the application listens on inside the container. It is the container class's `defaultPort`, and
 * `TI_WEB_PORT` in {@link PLATFORM_SETTINGS}, so the two cannot disagree. A mismatch would surface at the first request,
 * not at deploy.
 *
 * @type {number}
 * @public
 */
const CONTAINER_PORT = 3000;

/**
 * What a ti-engine application on Cloudflare is, applied over whatever the Worker's variables say. No variable can turn
 * the container into a Redis deployment, move its port, or send its state anywhere but the Worker.
 *
 * @type {Object<string, string>}
 * @public
 */
const PLATFORM_SETTINGS = Object.freeze( {
    TI_WEB_HOST: "0.0.0.0",
    TI_WEB_PORT: String( CONTAINER_PORT ),
    // The Worker terminates TLS. Inside the sandbox this hop is not on a network at all.
    TI_WEB_USE_TLS: "false",

    // Sessions and the configuration store: the state protocol, answered by the Worker from D1. No token: the binding is
    // the authentication, and core refuses a bearer token on plain HTTP to a non-loopback host anyway.
    TI_MEMORY_CACHE_PROVIDER: "http",
    TI_MEMORY_CACHE_STATE_URL: `http://${ STATE_ADDRESS }`,
    // Declared, so a service that could not apply an edit atomically is refused at boot, not found out by a lost write.
    TI_MEMORY_CACHE_REQUIRED_CAPABILITIES: "json-documents,atomic-json-edit",

    // One instance with nothing to talk to. Off, it also removes the only consumer of the cache primitives the HTTP
    // provider does not implement.
    TI_MESSAGE_EXCHANGE_ENABLED: "false",
    // The health heartbeat is a state write every second the container is awake, for an orchestrator this deployment
    // does not have: a D1 write a second, billed.
    TI_SERVICE_HEALTH_CHECK_ENABLED: "false",
    // Cloudflare records every line a container prints as its own event. In JSON a log entry is one event, with a
    // `level` Cloudflare reads (core 1.16.0); the text format made a dozen `info` events of a single error.
    TI_AUDITING_LOG_USES_JSON: "true"
} );

/**
 * The prefix of the framework's own settings (`TI_WEB_*`, `TI_MEMORY_CACHE_*` and the rest). Every binding that
 * carries it reaches the container.
 *
 * @type {string}
 * @private
 */
const FRAMEWORK_PREFIX = "TI";

/**
 * A prefix an application can name for settings of its own: capitals and digits, in words joined by single
 * underscores, without the underscore that separates it from a setting's name.
 *
 * @type {RegExp}
 * @private
 */
const PREFIX = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * The options {@link containerEnvironment} takes.
 *
 * @type {string[]}
 * @private
 */
const ENVIRONMENT_OPTIONS = Object.freeze( [ "prefixes", "defaults", "settings" ] );

/**
 * The hosts an OpenID sign-in reaches from the server, by the web-framework sign-in method that uses them: discovery,
 * token, keys and userinfo. The authorization endpoint is visited by the browser, not the container, so it is not here.
 *
 * @type {Object<string, string[]>}
 * @public
 */
const IDENTITY_PROVIDER_HOSTS = Object.freeze( {
    "openid-azure": Object.freeze( [ "login.microsoftonline.com", "graph.microsoft.com" ] ),
    "openid-google": Object.freeze( [ "accounts.google.com", "oauth2.googleapis.com", "openidconnect.googleapis.com", "www.googleapis.com" ] )
} );

/**
 * The web-framework setting each method's discovery URL can be pointed elsewhere with, such as a sovereign cloud or a
 * test tenant. That URL's host must then be reachable too.
 *
 * @type {Object<string, string>}
 * @private
 */
const DISCOVERY_URL_SETTINGS = Object.freeze( {
    "openid-azure": "TI_AZURE_AUTH_DISCOVERY_URL",
    "openid-google": "TI_GCLOUD_AUTH_DISCOVERY_URL"
} );

/**
 * A plain host name, as DNS has it, or an IPv4 address: labels of letters, digits and hyphens, joined by single dots.
 * URL gives a hostname in lower case, but keeps characters no host has, `*` among them, and decodes `%2a` into one.
 * `@cloudflare/containers` reads `*` in an allowed host as a glob, so a discovery URL at `*.example.com` would let
 * every subdomain through, and one at `*` every host.
 *
 * @type {RegExp}
 * @private
 */
const HOST_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/**
 * What a container whose class sets `interceptHttps = true` needs in its environment. Cloudflare re-signs intercepted
 * HTTPS with its own CA, and Node must trust it, or every call through the allowlist fails its certificate check. Node
 * reads the file at start, and a missing file is a warning, not a failure.
 *
 * @type {Object<string, string>}
 * @public
 */
const INTERCEPTED_HTTPS_SETTINGS = Object.freeze( {
    NODE_EXTRA_CA_CERTS: "/etc/cloudflare/certs/cloudflare-containers-ca.crt"
} );

/**
 * A duration `@cloudflare/containers` can parse, and above zero. The library takes `^\d+[smh]$` and throws on anything
 * else; zero it accepts, as a cold start for every request.
 *
 * @type {RegExp}
 * @private
 */
const SLEEP_AFTER = /^0*[1-9][0-9]*[smh]$/;

/**
 * The options {@link createBroker} takes.
 *
 * @type {string[]}
 * @private
 */
const BROKER_OPTIONS = Object.freeze( [ "path", "url", "contentType" ] );

/**
 * The ways a container may reach beyond the state address, as {@link containerSetup} names them:
 * - `brokered`: nothing but the state address, where the Worker answers, and makes any call the container needs
 *   ({@link createBroker});
 * - `intercepted`: HTTPS to the identity providers of the sign-in methods its environment enables, intercepted and
 *   re-signed by Cloudflare ({@link allowedHosts}, {@link INTERCEPTED_HTTPS_SETTINGS}).
 *
 * @type {string[]}
 * @private
 */
const EGRESS_MODES = Object.freeze( [ "brokered", "intercepted" ] );

/**
 * The options {@link containerSetup} takes.
 *
 * @type {string[]}
 * @private
 */
const SETUP_OPTIONS = Object.freeze( [ "egress", "environment", "sleepAfter" ] );

/**
 * What {@link containerSetup}'s `sleepAfter` takes when the timer is read from a binding.
 *
 * @type {string[]}
 * @private
 */
const SLEEP_AFTER_SETTING_OPTIONS = Object.freeze( [ "setting", "fallback" ] );

/**
 * The options {@link outboundByHost} takes.
 *
 * @type {string[]}
 * @private
 */
const OUTBOUND_OPTIONS = Object.freeze( [ "state", "database", "brokers" ] );

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 * @private
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && Array.isArray( value ) === false;
}

/**
 * Refuses an options object that is not one, or that names an option there is not.
 *
 * @param {string} caller The function the options are for, to name in the error.
 * @param {*} options
 * @param {string[]} known
 * @throws {TypeError} If the options are malformed.
 * @private
 */
function checkOptions( caller, options, known ) {
    if ( isPlainObject( options ) === false ) {
        throw new TypeError( `${ caller }: the options must be an object.` );
    }
    for ( const key of Object.keys( options ) ) {
        if ( known.includes( key ) === false ) {
            throw new TypeError( `${ caller }: '${ key }' is not an option. The options are ${ known.join( ", " ) }.` );
        }
    }
}

/**
 * Refuses a map of settings that is not one, or whose values are not all strings: a container's environment is
 * strings, and anything else would reach it as whatever its text happens to be.
 *
 * @param {string} option The option's name, to name in the error.
 * @param {*} values
 * @throws {TypeError} If the map is malformed.
 * @private
 */
function checkSettings( option, values ) {
    if ( isPlainObject( values ) === false ) {
        throw new TypeError( `containerEnvironment: '${ option }' must be an object mapping a setting's name to its value.` );
    }
    for ( const [ name, value ] of Object.entries( values ) ) {
        if ( typeof value !== "string" ) {
            throw new TypeError( `containerEnvironment: the value of ${ name } in '${ option }' must be a string, as a container's environment is.` );
        }
    }
}

/**
 * Builds the container's environment from the Worker's bindings. It is assembled at every start rather than baked into
 * the image, because secrets exist only as the Worker's bindings.
 * <br/>
 * Each layer goes over the one before:
 * 1. every string binding named `TI_<NAME>`, the framework's own settings, and `<PREFIX>_<NAME>` for each of
 *    `prefixes`, the application's own;
 * 2. `defaults`: each named binding when it is a non-blank string, and its default otherwise, so the container always
 *    receives it;
 * 3. {@link PLATFORM_SETTINGS}, which no variable can override;
 * 4. `settings`, the application's own fixed values, which win over everything, the platform included.
 *
 * Only strings pass: a binding that is not one (D1, a Durable Object namespace, a JSON variable) never reaches the
 * container. A malformed option is refused where it is written, rather than discovered as a setting that never
 * arrives.
 *
 * @method
 * @param {Object} env The Worker's bindings.
 * @param {Object} [options]
 * @param {string[]} [options.prefixes] The application's own setting prefixes, besides the framework's `TI`: `[ "APP" ]`
 * passes `APP_*` through too.
 * @param {Object<string, string>} [options.defaults] The bindings the container always receives: name → its value when
 * the binding is absent, blank or not a string.
 * @param {Object<string, string>} [options.settings] The application's own fixed values.
 * @returns {Object<string, string>} A new object each time.
 * @throws {TypeError} If an option is malformed.
 * @public
 */
function containerEnvironment( env, options ) {
    const given = ( options === undefined || options === null ) ? {} : options;
    checkOptions( "containerEnvironment", given, ENVIRONMENT_OPTIONS );
    const { prefixes = [], defaults = {}, settings = {} } = given;
    if ( Array.isArray( prefixes ) === false || prefixes.some( ( prefix ) => typeof prefix !== "string" || PREFIX.test( prefix ) === false ) ) {
        throw new TypeError( `containerEnvironment: 'prefixes' must be a list of setting prefixes such as "APP", in capitals and without the trailing underscore: ${ JSON.stringify( prefixes ) }` );
    }
    checkSettings( "defaults", defaults );
    checkSettings( "settings", settings );

    // Built from prefixes the check above confines to capitals, digits and underscores, so nothing in it is a pattern.
    const passedThrough = new RegExp( `^(${ [ FRAMEWORK_PREFIX, ...prefixes ].join( "|" ) })_[A-Z0-9_]+$` );
    const bindings = isPlainObject( env ) ? env : {};
    const environment = {};
    for ( const [ name, value ] of Object.entries( bindings ) ) {
        if ( typeof value === "string" && passedThrough.test( name ) === true ) {
            environment[ name ] = value;
        }
    }
    for ( const [ name, fallback ] of Object.entries( defaults ) ) {
        const value = bindings[ name ];
        environment[ name ] = ( typeof value === "string" && value.trim() !== "" ) ? value : fallback;
    }
    return Object.assign( environment, PLATFORM_SETTINGS, settings );
}

/**
 * The hosts the container may reach: the state address, and the identity providers of the sign-in methods its
 * environment enables (`TI_WEB_AUTH_METHODS`), with the host of a discovery URL pointed elsewhere when it is a plain
 * host name. Everything else is refused by the default deny the container class sets up with `enableInternet = false`.
 * <br/>
 * An HTTPS call meets this list only when the class sets `interceptHttps = true`, and the environment carries
 * {@link INTERCEPTED_HTTPS_SETTINGS}. Without them, it falls to the internet setting, which is off.
 *
 * @method
 * @param {Object<string, string>} environment The container's, as {@link containerEnvironment} built it.
 * @returns {string[]} Each host once, the state address first.
 * @public
 */
function allowedHosts( environment ) {
    const settings = isPlainObject( environment ) ? environment : {};
    const hosts = new Set( [ STATE_ADDRESS ] );
    const methods = String( settings.TI_WEB_AUTH_METHODS || "" ).split( "," ).map( ( method ) => method.trim() ).filter( Boolean );
    for ( const method of methods ) {
        ( IDENTITY_PROVIDER_HOSTS[ method ] || [] ).forEach( ( host ) => hosts.add( host ) );
        const discoveryUrl = settings[ DISCOVERY_URL_SETTINGS[ method ] ];
        if ( typeof discoveryUrl === "string" && discoveryUrl.length > 0 ) {
            try {
                const host = new URL( discoveryUrl ).hostname;
                // Only a plain host name: the library would read anything else, `*` above all, as a pattern for more
                // hosts than this one. The sign-in then fails as plainly as with a malformed URL.
                if ( HOST_NAME.test( host ) === true ) {
                    hosts.add( host );
                }
            } catch {
                // A malformed URL fails the sign-in itself, with the framework's own message. The allowlist need not
                // guess at it.
            }
        }
    }
    return [ ...hosts ];
}

/**
 * How long the container stays awake without a request: `value` when `@cloudflare/containers` can use it, and
 * `fallback` otherwise. The library parses the value on every renewal, inside the Durable Object's start-up. A value it
 * cannot parse throws there, and the container never starts; zero it accepts, as a cold start for every request. So
 * neither is ever passed on.
 *
 * @method
 * @param {*} value A setting's value, such as `2m`. Surrounding spaces are ignored.
 * @param {string} fallback The value when `value` is unusable.
 * @returns {string}
 * @throws {TypeError} If the fallback itself is not a value the library can use.
 * @public
 */
function sleepAfter( value, fallback ) {
    if ( typeof fallback !== "string" || SLEEP_AFTER.test( fallback ) === false ) {
        throw new TypeError( `sleepAfter: the fallback must be a duration @cloudflare/containers can use, such as "10m": ${ JSON.stringify( fallback ) }` );
    }
    const candidate = String( value || "" ).trim();
    return SLEEP_AFTER.test( candidate ) ? candidate : fallback;
}

/**
 * A call the container makes through the Worker.
 *
 * @typedef {Object} Broker
 * @property {string} path The path the container sends to, at the state address.
 * @property {string} address The URL the container sends to: the state address and the path.
 * @property {(request: Request) => boolean} matches Whether an outbound request is this call.
 * @property {(request: Request) => Promise<Response>} forward Makes the call, and returns its answer.
 */

/**
 * A call the container cannot make itself, made by the Worker on its behalf. With the internet off, the container has
 * no DNS and no HTTPS of its own. So it sends the request over plain HTTP to the state address, the one address proven
 * to be intercepted, on a path of its own. The Worker's handler for that address recognises it (`matches`) and makes the
 * call (`forward`).
 * <br/>
 * Narrow on purpose: one path, POST only, one URL and never a redirect from it, and of the container's headers only the
 * content type. The body is passed on byte for byte and never looked into, since a secret may travel in it, and nothing
 * here logs it. A URL that cannot be reached, or that redirects, answers 502, which the container should refuse as
 * unverifiable: refusing is visible, and accepting unchecked is not.
 *
 * @method
 * @param {Object} options
 * @param {string} options.path The path the container sends to, at the state address. It cannot be under `/v1/`,
 * where the state protocol is.
 * @param {string} options.url The HTTPS URL the Worker sends the call to.
 * @param {string} [options.contentType] The content type the call is sent with. Without it, the container's own.
 * @returns {Broker}
 * @throws {TypeError} If an option is malformed.
 * @public
 */
function createBroker( options ) {
    checkOptions( "createBroker", options, BROKER_OPTIONS );
    const { path, url, contentType } = options;
    if ( typeof path !== "string" || path.startsWith( "/" ) === false || path === "/" || /[?#]/.test( path ) === true || /^\/v1(\/|$)/.test( path ) === true ) {
        throw new TypeError( `createBroker: 'path' must be a path of its own, starting with "/", without a query, and not under /v1/, where the state protocol is: ${ JSON.stringify( path ) }` );
    }
    let target;
    try {
        target = new URL( url );
    } catch {
        target = null;
    }
    if ( typeof url !== "string" || target === null || target.protocol !== "https:" ) {
        throw new TypeError( `createBroker: 'url' must be an https URL: ${ JSON.stringify( url ) }` );
    }
    if ( contentType !== undefined && ( typeof contentType !== "string" || contentType.trim() === "" ) ) {
        throw new TypeError( "createBroker: 'contentType' must be a content type, when given." );
    }

    return Object.freeze( {
        path: path,
        address: `http://${ STATE_ADDRESS }${ path }`,
        matches( request ) {
            return new URL( request.url ).pathname === path;
        },
        async forward( request ) {
            if ( request.method !== "POST" ) {
                return new Response( null, { status: 405, headers: { "allow": "POST" } } );
            }
            const type = contentType || request.headers.get( "content-type" );
            try {
                const answer = await fetch( url, {
                    method: "POST",
                    headers: type ? { "content-type": type } : {},
                    // As bytes: decoded as text, a body that is not UTF-8 would go out changed.
                    body: await request.arrayBuffer(),
                    // Workers refuses "error", so a redirect comes back here, and goes no further.
                    redirect: "manual"
                } );
                if ( answer.status >= 300 && answer.status < 400 ) {
                    // Followed, it would carry the body, and any secret in it, to a URL this broker was never given.
                    if ( answer.body !== null ) {
                        await answer.body.cancel();
                    }
                    return new Response( null, { status: 502 } );
                }
                return answer;
            } catch {
                return new Response( null, { status: 502 } );
            }
        }
    } );
}

/**
 * What {@link containerEnvironment} takes: the application's own prefixes, defaults and settings.
 *
 * @typedef {Object} EnvironmentOptions
 * @property {string[]} [prefixes] The application's own setting prefixes, besides the framework's `TI`.
 * @property {Object<string, string>} [defaults] The bindings the container always receives, with their defaults.
 * @property {Object<string, string>} [settings] The application's own fixed values.
 */

/**
 * The fields {@link containerSetup} gives a container class, as `@cloudflare/containers` reads them.
 *
 * @typedef {Object} ContainerFields
 * @property {number} defaultPort {@link CONTAINER_PORT}.
 * @property {boolean} enableInternet Always `false`: everything not listed is denied.
 * @property {boolean} interceptHttps Whether HTTPS meets the allowlist, intercepted and re-signed.
 * @property {string[]} allowedHosts The hosts the container may reach.
 * @property {Object<string, string>} envVars The container's environment.
 * @property {string} sleepAfter How long the container stays awake without a request.
 */

/**
 * The reader of {@link containerSetup}'s sleep timer, checked once: a fixed duration, or the binding it is read from.
 *
 * @param {*} value The option as given.
 * @returns {(env: Object) => string}
 * @throws {TypeError} If the option is malformed.
 * @private
 */
function sleepAfterReader( value ) {
    if ( typeof value === "string" ) {
        if ( SLEEP_AFTER.test( value ) === false ) {
            throw new TypeError( `containerSetup: 'sleepAfter' must be a duration @cloudflare/containers can use, such as "2m": ${ JSON.stringify( value ) }` );
        }
        return () => value;
    }
    if ( isPlainObject( value ) === true ) {
        checkOptions( "containerSetup: 'sleepAfter'", value, SLEEP_AFTER_SETTING_OPTIONS );
        const { setting, fallback } = value;
        if ( typeof setting !== "string" || setting.trim() === "" ) {
            throw new TypeError( `containerSetup: 'sleepAfter.setting' must name the binding the timer is read from: ${ JSON.stringify( setting ) }` );
        }
        if ( typeof fallback !== "string" || SLEEP_AFTER.test( fallback ) === false ) {
            throw new TypeError( `containerSetup: 'sleepAfter.fallback' must be a duration @cloudflare/containers can use, such as "10m": ${ JSON.stringify( fallback ) }` );
        }
        return ( env ) => sleepAfter( isPlainObject( env ) ? env[ setting ] : undefined, fallback );
    }
    throw new TypeError( `containerSetup: 'sleepAfter' must be a duration such as "2m", or { setting, fallback } to read it from a binding: ${ JSON.stringify( value ) }` );
}

/**
 * The fields of a container class, from one description: what the container runs as, what it may reach, what it is
 * told, and how long it stays awake. The description is checked here, when the Worker's module loads, so a malformed
 * one fails the deploy rather than the container's start. The function returned builds the fields from the Worker's
 * bindings as each container starts:
 *
 * ```js
 * const setup = containerSetup( { egress: "brokered", environment: { prefixes: [ "APP" ] }, sleepAfter: "2m" } );
 *
 * export class ApplicationContainer extends Container {
 *     constructor( ctx, env, options ) {
 *         super( ctx, env, options );
 *         Object.assign( this, setup( env ) );
 *     }
 * }
 * ```
 *
 * The way out is one choice, because it is three settings that must agree. Both start from `enableInternet = false`,
 * which denies everything not listed:
 * - `brokered`, unless stated: the allowlist is the state address alone, and HTTPS is not intercepted. The container
 *   reaches nothing a handler of the Worker's does not answer ({@link createBroker}).
 * - `intercepted`: HTTPS is intercepted, and the allowlist is the state address and the identity providers of the
 *   sign-in methods the environment enables ({@link allowedHosts}). The environment carries the CA Node must trust
 *   ({@link INTERCEPTED_HTTPS_SETTINGS}), under the application's own settings.
 * <br/>
 * The class stays the application's own, under the name its `wrangler.jsonc` gives it, because
 * `@cloudflare/containers` keeps a class's outbound handlers under that name ({@link outboundByHost}).
 *
 * @method
 * @param {Object} options
 * @param {"brokered"|"intercepted"} [options.egress] The way out: `brokered` unless stated.
 * @param {EnvironmentOptions} [options.environment] What {@link containerEnvironment} builds the environment from.
 * @param {string|{setting: string, fallback: string}} options.sleepAfter How long the container stays awake without a
 * request: a duration such as `2m`, or the binding it is read from, with the duration used when that binding's value
 * is one the library could not use. It decides the bill more than traffic does, so it is stated, never defaulted.
 * @returns {(env: Object) => ContainerFields} Builds new fields each time.
 * @throws {TypeError} If an option is malformed.
 * @public
 */
function containerSetup( options ) {
    checkOptions( "containerSetup", options, SETUP_OPTIONS );
    const { egress = "brokered", environment, sleepAfter: sleep } = options;
    if ( EGRESS_MODES.includes( egress ) === false ) {
        throw new TypeError( `containerSetup: 'egress' must be one of ${ EGRESS_MODES.join( ", " ) }: ${ JSON.stringify( egress ) }` );
    }
    // Checked as given, so a malformed environment is refused now, not as each container starts.
    containerEnvironment( {}, environment );
    const given = ( environment === undefined || environment === null ) ? {} : environment;
    const intercepted = ( egress === "intercepted" );
    const environmentOptions = ( intercepted === true )
        ? Object.assign( {}, given, { settings: Object.assign( {}, INTERCEPTED_HTTPS_SETTINGS, given.settings ) } )
        : given;
    const readSleepAfter = sleepAfterReader( sleep );

    return function setup( env ) {
        const envVars = containerEnvironment( env, environmentOptions );
        return {
            defaultPort: CONTAINER_PORT,
            enableInternet: false,
            interceptHttps: intercepted,
            allowedHosts: ( intercepted === true ) ? allowedHosts( envVars ) : [ STATE_ADDRESS ],
            envVars: envVars,
            sleepAfter: readSleepAfter( env )
        };
    };
}

/**
 * @param {*} value
 * @returns {boolean} Whether the value is a broker, as {@link createBroker} makes one.
 * @private
 */
function isBroker( value ) {
    return isPlainObject( value ) && typeof value.path === "string" && typeof value.matches === "function" && typeof value.forward === "function";
}

/**
 * The Worker's answers at the state address, for a container class's `outboundByHost`: each broker's call on its own
 * path, and the state service for everything else. The state service is built over the database binding the first
 * time it is needed, and again only for another binding.
 *
 * ```js
 * ApplicationContainer.outboundByHost = outboundByHost( {
 *     state: ( database ) => createD1StateService( database ),
 *     brokers: [ siteverify ]
 * } );
 * ```
 *
 * Set it on the class the Worker exports. `@cloudflare/containers` keeps these handlers under the name of the class
 * they are set on, and looks them up by the name of the class a container runs as. Set on a parent class, they would
 * never be found: the container would never reach its state, and the application would exit at boot.
 * <br/>
 * The state service is passed in, not required here. It is `@ti-engine/core`'s, and the Worker should run the same
 * release of it as the container's client, which is the application's to choose.
 *
 * @method
 * @param {Object} options
 * @param {(database: *) => (request: Request) => Promise<Response>} options.state Builds the state service over the
 * database binding, such as `( database ) => createD1StateService( database )`.
 * @param {string} [options.database] The database binding's name: `DB` unless stated.
 * @param {Broker[]} [options.brokers] The calls the Worker makes for the container, each on a path of its own.
 * @returns {Object<string, (request: Request, env: Object) => Promise<Response>>} Keyed by {@link STATE_ADDRESS} alone.
 * @throws {TypeError} If an option is malformed.
 * @public
 */
function outboundByHost( options ) {
    checkOptions( "outboundByHost", options, OUTBOUND_OPTIONS );
    const { state, database = "DB", brokers = [] } = options;
    if ( typeof state !== "function" ) {
        throw new TypeError( "outboundByHost: 'state' must build the state service over the database binding, such as ( database ) => createD1StateService( database )." );
    }
    if ( typeof database !== "string" || database.trim() === "" ) {
        throw new TypeError( `outboundByHost: 'database' must be the database binding's name: ${ JSON.stringify( database ) }` );
    }
    if ( Array.isArray( brokers ) === false || brokers.some( ( broker ) => isBroker( broker ) === false ) ) {
        throw new TypeError( "outboundByHost: 'brokers' must be a list of brokers, as createBroker makes them." );
    }
    const paths = brokers.map( ( broker ) => broker.path );
    if ( new Set( paths ).size !== paths.length ) {
        throw new TypeError( `outboundByHost: no two brokers can answer the same path: ${ JSON.stringify( paths ) }` );
    }

    const services = new WeakMap();
    const serviceOver = ( binding ) => {
        // A binding is an object. Anything else cannot be remembered, and the state service makes of it what it will.
        if ( binding === null || typeof binding !== "object" ) {
            return state( binding );
        }
        let service = services.get( binding );
        if ( service === undefined ) {
            service = state( binding );
            services.set( binding, service );
        }
        return service;
    };

    return Object.freeze( {
        [ STATE_ADDRESS ]: ( request, env ) => {
            const broker = brokers.find( ( candidate ) => candidate.matches( request ) === true );
            if ( broker !== undefined ) {
                return broker.forward( request );
            }
            return serviceOver( isPlainObject( env ) ? env[ database ] : undefined )( request );
        }
    } );
}

module.exports = {
    STATE_ADDRESS: STATE_ADDRESS,
    CONTAINER_PORT: CONTAINER_PORT,
    PLATFORM_SETTINGS: PLATFORM_SETTINGS,
    containerEnvironment: containerEnvironment,
    IDENTITY_PROVIDER_HOSTS: IDENTITY_PROVIDER_HOSTS,
    INTERCEPTED_HTTPS_SETTINGS: INTERCEPTED_HTTPS_SETTINGS,
    allowedHosts: allowedHosts,
    sleepAfter: sleepAfter,
    createBroker: createBroker,
    containerSetup: containerSetup,
    outboundByHost: outboundByHost
};
