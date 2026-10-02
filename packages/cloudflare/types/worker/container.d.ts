declare const _exports: {
    STATE_ADDRESS: string;
    CONTAINER_PORT: number;
    PLATFORM_SETTINGS: Record<string, string>;
    containerEnvironment: typeof containerEnvironment;
    IDENTITY_PROVIDER_HOSTS: Record<string, string[]>;
    INTERCEPTED_HTTPS_SETTINGS: Record<string, string>;
    allowedHosts: typeof allowedHosts;
    sleepAfter: typeof sleepAfter;
    createBroker: typeof createBroker;
    containerSetup: typeof containerSetup;
    outboundByHost: typeof outboundByHost;
};
export = _exports;
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
declare function containerEnvironment(env: Object, options?: {
    prefixes?: string[];
    defaults?: Record<string, string>;
    settings?: Record<string, string>;
}): Record<string, string>;
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
declare function allowedHosts(environment: Record<string, string>): string[];
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
declare function sleepAfter(value: any, fallback: string): string;
export type Broker = {
    /**
     * The path the container sends to, at the state address.
     */
    path: string;
    /**
     * The URL the container sends to: the state address and the path.
     */
    address: string;
    /**
     * Whether an outbound request is this call.
     */
    matches: (request: Request) => boolean;
    /**
     * Makes the call, and returns its answer.
     */
    forward: (request: Request) => Promise<Response>;
};
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
declare function createBroker(options: {
    path: string;
    url: string;
    contentType?: string;
}): Broker;
export type EnvironmentOptions = {
    /**
     * The application's own setting prefixes, besides the framework's `TI`.
     */
    prefixes?: string[];
    /**
     * The bindings the container always receives, with their defaults.
     */
    defaults?: Record<string, string>;
    /**
     * The application's own fixed values.
     */
    settings?: Record<string, string>;
};
export type ContainerFields = {
    /**
     * {@link CONTAINER_PORT}.
     */
    defaultPort: number;
    /**
     * Always `false`: everything not listed is denied.
     */
    enableInternet: boolean;
    /**
     * Whether HTTPS meets the allowlist, intercepted and re-signed.
     */
    interceptHttps: boolean;
    /**
     * The hosts the container may reach.
     */
    allowedHosts: string[];
    /**
     * The container's environment.
     */
    envVars: Record<string, string>;
    /**
     * How long the container stays awake without a request.
     */
    sleepAfter: string;
};
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
declare function containerSetup(options: {
    egress?: "brokered" | "intercepted";
    environment?: EnvironmentOptions;
    sleepAfter: string | {
        setting: string;
        fallback: string;
    };
}): (env: Object) => ContainerFields;
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
declare function outboundByHost(options: {
    state: (database: any) => (request: Request) => Promise<Response>;
    database?: string;
    brokers?: Broker[];
}): Record<string, (request: Request, env: Object) => Promise<Response>>;
