/// <reference types="node" />
export = TiWebServer;
import ServiceConsumer = require("@ti-engine/core/service-consumer");
export type NodeServer = import("node:http").Server;
export type TiWebServiceConfiguration = ServiceConfiguration;
export type TiWebApplicationConfig = {
    classPath: string;
};
export type ApiConfig = {
    endpointEnabled: boolean;
    inventory: ApiInventory;
    requestTimeout: number;
};
export type SettingsAuth = {
    enabledMethods: string[];
    local: SettingsAuthLocal;
    oauth2: {
        azure?: SettingsOAuth2Client;
        google?: SettingsOAuth2Client;
    };
};
export type SettingsAuthLocal = {
    /**
     * Path to the JSON file of local user records (see `TI_WEB_AUTH_LOCAL_USERS_PATH`).
     * Local sign-in refuses everyone whenever this is absent, unreadable, or yields no usable records.
     */
    usersPath?: string;
};
export type SettingsOAuth2Client = {
    clientID?: string;
    clientSecret?: string;
    callbackUrl?: string;
    discoveryUrl?: string;
    isPublic?: boolean;
    tokenEndpointAuthMethod?: TiTokenEndpointAuthMethod;
};
export type SettingsStaticCache = {
    /**
     * The `max-age` for `/static` responses, in SECONDS (not a duration string). `0` means every use is revalidated.
     */
    maxAge: number;
    /**
     * Whether to add `immutable`. Only correct when the `/static` filenames are content-addressed.
     */
    immutable: boolean;
    /**
     * Path prefixes under `/static` that are served long-lived and `immutable` regardless of the two settings above.
     */
    immutablePaths: string[];
};
export type SettingsCookies = {
    secret: string;
    path: string;
    httpOnly: boolean;
    sameSite: "lax" | "strict" | "none";
    maxAge: number;
};
export type ApiInventory = Record<string, Record<string, ServiceAddress>>;
import type { TiAuthMethod, TiTokenEndpointAuthMethod } from "#auth-manager";
import type { TiSession } from "#definitions";
import type User from "#user";
import type TiWebAppManager from "#web-app-manager";
import type { ServiceAddress, ServiceConfiguration } from "@ti-engine/core/definitions";
/** @import { TiAuthMethod, TiTokenEndpointAuthMethod } from "#auth-manager" */
/** @import { TiSession } from "#definitions" */
/** @import User from "#user" */
/** @import TiWebAppManager from "#web-app-manager" */
/** @import { ServiceAddress, ServiceConfiguration } from "@ti-engine/core/definitions" */
/**
 * Default unprotected static-asset route matchers. The path segments are matched with `(?:[^/]+\/)*` rather than
 * `(?:.+\/)*`: the inner `[^/]+` cannot also consume the "/" delimiter, so the pattern is unambiguous and matches
 * in linear time. The previous `.+` form was ambiguous and backtracked exponentially on hostile request paths such
 * as `/static/a/a/…/a/x` (no trailing extension) — and these matchers run against the raw request path in
 * {@link TiWebServer#isUnprotectedRoute} BEFORE authentication, so that was a pre-auth denial-of-service vector
 * (CodeQL js/redos). The matched language for realistic asset paths is unchanged.
 *
 * @type {RegExp}
 */
declare const RE_STATIC_UNPROTECTED: RegExp;
/**
 * Default unprotected `/.well-known/` route matcher. See {@link RE_STATIC_UNPROTECTED} for the ReDoS rationale.
 *
 * @type {RegExp}
 */
declare const RE_WELL_KNOWN_UNPROTECTED: RegExp;
/**
 * A web server microservice based on the ti-engine.
 * <br/>
 * Note: The web server is fully functional and already comes with all the necessary fundamentals and security features. However, it is designed to be extended
 * with custom logic and functionality to fit your specific needs. Here is a list of methods that you can override to customize the web server behavior:
 * - {@link TiWebServer#defineWebApplicationRoutes} Override this to define custom web application routes. Remember to call the base method if you want to preserve the default behavior as well (recommended).
 * - {@link TiWebServer#defineUnprotectedRoutes} Override this to define unprotected routes. Remember to call the base method if you want to preserve the default behavior as well (recommended).
 * - {@link TiWebServer#verifySession} Override this to implement custom session verification logic.
 *
 * @class TiWebServer
 * @extends ServiceConsumer
 * @public
 */
declare class TiWebServer extends ServiceConsumer {
    #private;
    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {TiWebServiceConfiguration} serviceConfig The JSON configuration for this service. Note that the configuration provided will be merged with the default web server configuration, and it will override any conflicting properties.
     * @throws {TiException.E_GEN_JS_INTERNAL_ERROR} If the web application manager cannot be loaded.
     */
    constructor(serviceDomainName: string, serviceConfig: TiWebServiceConfiguration);
    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {TiWebServiceConfiguration}
     * @override
     * @public
     */
    get serviceConfig(): TiWebServiceConfiguration;
    /**
     * Property returning if the web server is currently shutting down.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isShuttingDown(): boolean;
    /**
     * Property returning the list of static content directories.
     *
     * @property
     * @returns {string[]}
     * @public
     */
    get staticContentPaths(): string[];
    /**
     * Property returning the server URL.
     *
     * @property
     * @returns {string}
     * @public
     */
    get serverUrl(): string;
    /**
     * Property returning the {@link TiWebAppManager} instance.
     *
     * @property
     * @returns {TiWebAppManager}
     * @public
     */
    get webAppManager(): TiWebAppManager;
    /**
     * Starts the web server.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart(): Promise<any>;
    /**
     * Shuts down the web server.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStop(): Promise<any>;
    /**
     * Used to report health status of the service instance for external monitoring.
     * This is a scheduled job that will be executed at SERVICE_HEALTH_CHECK_INTERVAL time.
     *
     * @method
     * @override
     * @public
     */
    reportHealthy(): void;
    /**
     * Used to verify the session of a request.
     *
     * @method
     * @param {TiSession} session
     * @returns {boolean}
     * @public
     */
    verifySession(session: TiSession): boolean;
    /**
     * Hook for the application to augment the freshly-authenticated session (e.g. derive domain roles from an
     * identity store or the org chart). Runs synchronously, once per login, before the framework's additive `admin`
     * role is applied. The default is a no-op. Any test-user role injection is an override of whatever the app derives.
     * <br/>
     * **Refusing a login.** Throwing from this hook refuses the sign-in: the framework destroys the freshly regenerated
     * session (so no usable session survives the refusal), the login handler raises `401`, and the error handler
     * redirects the browser to the login page with the exception code in `?error=`. Throw when the authenticated
     * identity cannot be mapped to an application principal; return the session unchanged to accept it.
     *
     * @method
     * @virtual
     * @param {TiSession} session
     * @param {Object} [request] Optional Express request object that can be used to read body/cookies/query data.
     * @returns {TiSession}
     * @public
     */
    augmentSession(session: TiSession, request?: Object): TiSession;
    /**
     * Used to authenticate a user via the specified auth method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {Object} [authDetails={}]
     * @returns {Promise}
     * @public
     */
    authenticate(authMethod: TiAuthMethod, authDetails?: Object): Promise<any>;
    /**
     * Used to set up user authorization according to the specified auth method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @returns {Promise<User>}
     * @public
     */
    authorize(authMethod: TiAuthMethod, currentUrl: URL, oidc: Object): Promise<User>;
    /**
     * Used to get a service mapping if such exists.
     *
     * @method
     * @param {string} serviceVersion
     * @param {string} serviceName
     * @returns {ServiceAddress}
     * @public
     */
    getServiceAddress(serviceVersion: string, serviceName: string): ServiceAddress;
    /**
     * Used to check if the specified hostname is allowed to access the web server.
     *
     * @method
     * @param {string} hostname
     * @returns {boolean}
     * @public
     */
    isAllowedHost(hostname: string): boolean;
    /**
     * Used to check if the specified route is unprotected (i.e., does not require authentication). The default unprotected routes are:
     * - /
     * - /static/...
     * - /.well-known/...
     * - /not-found
     * - /app
     * - /app/enter
     * - /app/config
     * - /logout
     * - /login/:method
     * <br/>
     * NOTE: You can define custom unprotected routes by overriding the {@link TiWebServer#defineUnprotectedRoutes} method.
     *
     * @method
     * @param {string} route
     * @returns {boolean}
     * @public
     */
    isUnprotectedRoute(route: string): boolean;
    /**
     * Used to define the web application routes.
     * <br/>
     * NOTE: Override this to define custom web application routes. Remember to call the base method if you want to preserve the default behavior as well.
     *
     * @method
     * @virtual
     * @public
     */
    defineWebApplicationRoutes(): void;
    /**
     * Used to define the unprotected routes (i.e., routes that do not require authentication).
     * <br/>
     * NOTE: Override this to define custom unprotected routes. Remember to call the base method if you want to preserve the default behavior as well.
     *
     * @method
     * @virtual
     * @public
     */
    defineUnprotectedRoutes(): void;
    /**
     * Registers a custom application route on the underlying Express app.
     * <br/>
     * NOTE: Call this from a {@link TiWebServer#defineWebApplicationRoutes} override AFTER invoking the base method,
     * so the framework's own routes keep priority and any catch-all route you add resolves last (it will still be
     * registered before the framework's own `*splat` 404 handler). It is only valid once the Express app exists —
     * i.e., from within {@link TiWebServer#defineWebApplicationRoutes}, which {@link TiWebServer#onStart} invokes.
     *
     * @method
     * @param {string} method One of the supported routing verbs: get, post, put, patch, delete, options, head, all.
     * @param {string|RegExp} path The route path or pattern.
     * @param {...Function} handlers One or more Express route handlers/middleware.
     * @returns {TiWebServer} This instance, to allow chaining.
     * @public
     */
    registerRoute(method: string, path: string | RegExp, ...handlers: Function[]): TiWebServer;
    /**
     * Adds a pattern to the unprotected-routes list — routes that bypass the authentication gate. A string is
     * matched exactly against the request path; a RegExp is tested against it. Consulted at request time by
     * {@link TiWebServer#isUnprotectedRoute}.
     * <br/>
     * NOTE: Call this from a {@link TiWebServer#defineUnprotectedRoutes} override AFTER invoking the base method, to
     * extend (rather than replace) the defaults.
     *
     * @method
     * @param {string|RegExp} pattern The exact path (string) or path matcher (RegExp) to treat as unprotected.
     * @returns {TiWebServer} This instance, to allow chaining.
     * @public
     */
    addUnprotectedRoute(pattern: string | RegExp): TiWebServer;
    /**
     * Resolves a `staticCache` configuration block into the policy the `/static` mounts apply, filling in
     * {@link TiWebServer.#STATIC_CACHE_DEFAULTS} per key and rejecting values that cannot be honored. Pure: problems
     * are returned as `warnings` rather than logged, so the caller decides how to surface them and a test can assert
     * on them. Static and exposed for unit testing — not part of the customization surface.
     * <br/>
     * `maxAge` is a whole number of SECONDS, mapping 1:1 onto the `Cache-Control` directive — express's `"1y"`-style
     * duration strings are NOT accepted, and are reported rather than silently reinterpreted as milliseconds.
     * <br/>
     * `immutable` is dropped (with a warning) when `maxAge` is 0, because a response that is stale on arrival yet
     * promises never to change is a contradiction. Dropping it fails safe: the misconfiguration costs a revalidation,
     * not a year of unreachable assets.
     *
     * @method
     * @static
     * @param {SettingsStaticCache} [staticCache] The configured block, if any.
     * @returns {{maxAge: number, immutable: boolean, immutablePaths: string[], warnings: string[]}}
     * @public
     */
    static resolveStaticCachePolicy(staticCache?: SettingsStaticCache): {
        maxAge: number;
        immutable: boolean;
        immutablePaths: string[];
        warnings: string[];
    };
    /**
     * Builds the `Cache-Control` value for one static file: the long-lived immutable policy when its served path sits
     * under a configured `immutablePaths` prefix (matched case-sensitively, so a case mismatch falls back to the safe
     * side), otherwise the policy's own `maxAge`/`immutable`. A `maxAge` of 0 is emitted as an explicit
     * `must-revalidate` rather than a bare `max-age=0`, matching what the sibling `web-content` package serves.
     * Pure and static; exposed for unit testing — not part of the customization surface.
     *
     * @method
     * @static
     * @param {string} rootPath The directory this `/static` mount serves.
     * @param {string} filePath The absolute path of the file being served.
     * @param {Object} policy A policy as returned by {@link TiWebServer.resolveStaticCachePolicy}.
     * @returns {string}
     * @public
     */
    static staticCacheControlFor(rootPath: string, filePath: string, policy: Object): string;
    /**
     * Normalizes an HTTP method to a lower-case Express routing verb, or returns null if it is not a supported,
     * registrable verb. Anything that is not a string is rejected outright rather than coerced — otherwise a value
     * whose `toString()` happens to yield a verb (`[ "get" ]`, `new String( "get" )`) would register a route and
     * bypass the `E_GEN_INVALID_ARGUMENT_TYPE` that {@link TiWebServer#registerRoute} raises for a bad method.
     * Pure and static; exposed for unit testing — not part of the customization surface.
     *
     * @method
     * @static
     * @param {string} method
     * @returns {string|null}
     * @public
     */
    static normalizeRegistrableMethod(method: string): string | null;
    /**
     * Tests a request path against a list of unprotected-route patterns (string exact-match or RegExp test),
     * returning true on the first match. A RegExp's `lastIndex` is reset defensively so a stateful 'g'/'y' flag
     * cannot cause a match to be skipped. Pure and static; shared by {@link TiWebServer#isUnprotectedRoute} and
     * exposed for unit testing — not part of the customization surface.
     *
     * @method
     * @static
     * @param {Array<string|RegExp>} patterns
     * @param {string} pathOnly The request path with any query string already stripped.
     * @returns {boolean}
     * @public
     */
    static isRouteInList(patterns: Array<string | RegExp>, pathOnly: string): boolean;
}
declare namespace TiWebServer {
    export { RE_STATIC_UNPROTECTED };
    export { RE_WELL_KNOWN_UNPROTECTED };
}
