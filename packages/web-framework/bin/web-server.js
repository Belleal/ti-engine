/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ServiceConsumer = require( "@ti-engine/core/service-consumer" );
const exceptions = require( "@ti-engine/core/exceptions" );
const logger = require( "@ti-engine/core/logger" );
const { randomBytes } = require( "node:crypto" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const _ = require( "lodash" );
const express = require( "express" );
const helmet = require( "helmet" );
const session = require( "express-session" );
const cookieParser = require( "cookie-parser" );
const webHandlers = require( "#web-handlers" );
const SessionStore = require( "#session-store" );
const AuthManager = require( "#auth-manager" );
const authMethod = require( "#auth-manager" ).authMethod;
const authorization = require( "#authorization" );
const adminConfigHandlers = require( "#admin-config-handlers" );
const configService = require( "#config-service" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );

/** @typedef {import("node:http").Server} NodeServer */

/**
 * @typedef {ServiceConfiguration} TiWebServiceConfiguration
 * @property {ApiConfig} api
 * @property {TiWebApplicationConfig} application
 * @property {SettingsAuth} auth
 * @property {SettingsCookies} cookies
 * @property {string} host
 * @property {TiLocalizationLanguage} language
 * @property {number} port
 * @property {string} publicPath
 * @property {number} requestTimeout
 * @property {SettingsStaticCache} staticCache
 * @property {string} tlsCertPath
 * @property {string} tlsKeyPath
 * @property {boolean} useTLS
 */

/**
 * @typedef {Object} TiWebApplicationConfig
 * @property {string} classPath
 */

/**
 * @typedef {Object} ApiConfig
 * @property {boolean} endpointEnabled
 * @property {ApiInventory} inventory
 * @property {number} requestTimeout
 */

/**
 * @typedef {Object} SettingsAuth
 * @property {string[]} enabledMethods
 * @property {Object} local
 * @property {Object} oauth2
 * @property {SettingsOAuth2Client} [oauth2.azure]
 * @property {SettingsOAuth2Client} [oauth2.google]
 */

/**
 * @typedef {Object} SettingsOAuth2Client
 * @property {string} [clientID]
 * @property {string} [clientSecret]
 * @property {string} [callbackUrl]
 * @property {string} [discoveryUrl]
 * @property {boolean} [isPublic]
 * @property {TiTokenEndpointAuthMethod} [tokenEndpointAuthMethod]
 */

/**
 * @typedef {Object} SettingsStaticCache
 * @property {number} maxAge The `max-age` for `/static` responses, in SECONDS (not a duration string). `0` means every use is revalidated.
 * @property {boolean} immutable Whether to add `immutable`. Only correct when the `/static` filenames are content-addressed.
 * @property {string[]} immutablePaths Path prefixes under `/static` that are served long-lived and `immutable` regardless of the two settings above.
 */

/**
 * @typedef {Object} SettingsCookies
 * @property {string} secret
 * @property {string} path
 * @property {boolean} httpOnly
 * @property {"lax"|"strict"|"none"} sameSite
 * @property {number} maxAge
 */

/**
 * @typedef {Record<string, Record<string, ServiceAddress>>} ApiInventory
 */

const webServerConfig = require( "#web-server-config" );

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
const RE_STATIC_UNPROTECTED = /^\/static\/(?:[^/]+\/)*[^/]+\.[^/]+$/i;

/**
 * Default unprotected `/.well-known/` route matcher. See {@link RE_STATIC_UNPROTECTED} for the ReDoS rationale.
 *
 * @type {RegExp}
 */
const RE_WELL_KNOWN_UNPROTECTED = /^\/\.well-known\/(?:[^/]+\/)*[^/]+\.[^/]+$/i;

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
class TiWebServer extends ServiceConsumer {

    #webServer;
    #netServer;
    #serverUrl = "";
    #isShuttingDown = false;
    #staticContentPaths = [];
    #allowedHosts = [];
    #unprotectedRoutes = [];
    #webAppManager;
    #authManager;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {TiWebServiceConfiguration} serviceConfig The JSON configuration for this service. Note that the configuration provided will be merged with the default web server configuration, and it will override any conflicting properties.
     * @throws {TiException.E_GEN_JS_INTERNAL_ERROR} If the web application manager cannot be loaded.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, applyWebConfigEnvOverrides( _.merge( {}, webServerConfig, ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : {} ) ) );

        // Include the current host in the list of allowed hosts:
        this.#allowedHosts.push( this.serviceConfig.host );

        // Add the default and custom public paths to the list of static content:
        this.#staticContentPaths.push( path.join( __dirname, "static" ) );
        let customStaticContentPath = path.normalize( path.isAbsolute( this.serviceConfig.publicPath ) ? this.serviceConfig.publicPath : path.join( process.cwd(), this.serviceConfig.publicPath ) );
        if ( fs.existsSync( customStaticContentPath ) === false ) {
            logger.log( `Public path '${ customStaticContentPath }' does not exist. Static routes will resolve with 404 until path is created.`, logger.logSeverity.WARNING );
        } else {
            this.#staticContentPaths.push( customStaticContentPath );
        }

        this.#authManager = new AuthManager( this.serviceConfig.auth );

        // If there is a web application configuration, create the web application manager:
        if ( this.serviceConfig.application ) {
            try {
                const webApplicationConstructor = require( path.join( process.cwd(), this.serviceConfig.application.classPath ) );
                this.#webAppManager = new webApplicationConstructor();
            } catch ( error ) {
                logger.log( `Failed to load web application manager from '${ this.serviceConfig.application.classPath }'`, logger.logSeverity.ERROR, error );
                throw exceptions.raise( error );
            }
        }
    }

    /* Public interface */

    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {TiWebServiceConfiguration}
     * @override
     * @public
     */
    get serviceConfig() {
        return super.serviceConfig;
    }

    /**
     * Property returning if the web server is currently shutting down.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isShuttingDown() {
        return this.#isShuttingDown;
    }

    /**
     * Property returning the list of static content directories.
     *
     * @property
     * @returns {string[]}
     * @public
     */
    get staticContentPaths() {
        return this.#staticContentPaths;
    }

    /**
     * Property returning the server URL.
     *
     * @property
     * @returns {string}
     * @public
     */
    get serverUrl() {
        return this.#serverUrl;
    }

    /**
     * Property returning the {@link TiWebAppManager} instance.
     *
     * @property
     * @returns {TiWebAppManager}
     * @public
     */
    get webAppManager() {
        return this.#webAppManager;
    }

    /**
     * Starts the web server.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart() {
        return new Promise( ( resolve, reject ) => {
            super.onStart().then( () => {
                // Create and configure the web server:
                this.#webServer = express();
                this.#webServer.set( "trust proxy", true );

                // Create and configure the net server for HTTPS if enabled in the service config:
                let netServerOptions = {};
                const timeoutCandidates = [
                    this.serviceConfig.api.requestTimeout,
                    this.serviceConfig.requestTimeout
                ].filter( ( value ) => Number.isFinite( value ) );
                const resolvedRequestTimeout = timeoutCandidates.length ? Math.max( ...timeoutCandidates ) : undefined;
                if ( this.serviceConfig.useTLS === true ) {
                    if ( !this.serviceConfig.tlsKeyPath || !this.serviceConfig.tlsCertPath ) {
                        // Abort initialization if there is something wrong with the TLS key or cert paths:
                        return reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
                            tlsKeyPath: this.serviceConfig.tlsKeyPath,
                            tlsCertPath: this.serviceConfig.tlsCertPath
                        }, exceptions.httpCode.C_500 ) );
                    }
                    netServerOptions.key = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsKeyPath ) );
                    netServerOptions.cert = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsCertPath ) );

                    this.#webServer.use( webHandlers.httpRedirectHandler( this ) );
                    this.#netServer = require( "node:https" ).createServer( netServerOptions, this.#webServer );
                } else {
                    this.#netServer = require( "node:http" ).createServer( netServerOptions, this.#webServer );
                }
                if ( Number.isFinite( resolvedRequestTimeout ) ) {
                    this.#netServer.requestTimeout = resolvedRequestTimeout;
                    this.#netServer.headersTimeout = resolvedRequestTimeout + 100;
                    if ( typeof this.#netServer.keepAliveTimeout === "number" ) {
                        this.#netServer.keepAliveTimeout = resolvedRequestTimeout + 1000;
                    }
                }

                // Set up security and session middlewares first:
                this.#webServer.use( webHandlers.nonceGenerationHandler() );
                // Helmet's built-in Content-Security-Policy is intentionally disabled here because a per-request,
                // nonce-based CSP is enforced on the very next line by webHandlers.cspHeaderHandler() (see
                // components/web-handlers.js) — Helmet's static config cannot express per-response nonces. Every other
                // Helmet header (HSTS, X-Content-Type-Options, X-Frame-Options, …) still applies. This is a deliberate
                // architecture, not missing CSP; do not enable Helmet's static CSP here, as that would drop the nonce.
                // codeql[js/insecure-helmet-configuration]
                this.#webServer.use( helmet( { contentSecurityPolicy: false } ) );
                this.#webServer.use( webHandlers.cspHeaderHandler() );
                this.#webServer.use( express.json( { limit: "1mb" } ) );
                this.#webServer.use( express.urlencoded( { extended: false, limit: "100kb" } ) );
                this.#webServer.use( cookieParser() );
                this.#webServer.use( session( {
                    secret: this.serviceConfig.cookies.secret || randomBytes( 32 ).toString( "base64" ),
                    resave: false,
                    saveUninitialized: false,
                    cookie: {
                        path: this.serviceConfig.cookies.path,
                        httpOnly: this.serviceConfig.cookies.httpOnly,
                        secure: "auto",
                        sameSite: this.serviceConfig.cookies.sameSite,
                        maxAge: this.serviceConfig.cookies.maxAge
                    },
                    unset: "destroy",
                    store: new SessionStore()
                } ) );
                this.#webServer.use( webHandlers.csrfInitHandler( this ) );
                this.#webServer.use( webHandlers.originRefererValidationHandler( this ) );
                this.#webServer.use( webHandlers.csrfProtectionHandler() );

                // Set up the web server routes:
                this.#webServer.use( webHandlers.onShutDownHandler( this ) );
                this.#webServer.use( webHandlers.resourceProtectionHandler( this ) );
                this.#webServer.use( "/.well-known", express.static( path.join( this.#staticContentPaths[ 0 ], ".well-known" ), { dotfiles: "allow" } ) );

                // Static content routes are registered in reverse order to ensure that custom assets can override the default ones and be served first:
                const staticCachePolicy = TiWebServer.resolveStaticCachePolicy( this.serviceConfig.staticCache );
                staticCachePolicy.warnings.forEach( ( warning ) => logger.log( warning, logger.logSeverity.WARNING ) );
                _.forEachRight( this.#staticContentPaths, ( staticContentPath ) => {
                    // `Cache-Control` is written per file rather than through express.static's `maxAge`/`immutable`
                    // options, because the policy is not uniform across the tree (see resolveStaticCachePolicy). A
                    // header set here wins: `send` emits its "headers" event BEFORE its own `Cache-Control` block,
                    // which then skips a header that is already present. `ETag`/`Last-Modified` are still added by
                    // `send`, so the revalidating default costs a conditional request answered with a 304, not a
                    // re-download.
                    this.#webServer.use( "/static", express.static( staticContentPath, {
                        setHeaders: ( response, filePath ) => {
                            response.setHeader( "Cache-Control", TiWebServer.staticCacheControlFor( staticContentPath, filePath, staticCachePolicy ) );
                        }
                    } ) );
                } );

                // Set up the web application routes:
                this.defineWebApplicationRoutes();

                // API service proxy route (protected by auth middleware):
                if ( this.serviceConfig.api.endpointEnabled === true ) {
                    this.#webServer.post( "/service/:version/:name", webHandlers.serviceCallHandler( this ) );
                }

                // Set up error handling middleware:
                this.#webServer.all( "*splat", webHandlers.invalidRouteHandler() );
                this.#webServer.use( webHandlers.defaultErrorHandler() );

                // Set up the unprotected routes:
                this.defineUnprotectedRoutes();

                return this.#authManager.initialize();
            } ).then( () => {
                // Hand the web application manager the effective enabled auth methods (after any unconfigured OpenID
                // providers were dropped) so the login page only renders providers a user can actually complete.
                if ( this.#webAppManager && typeof this.#webAppManager.setEnabledAuthMethods === "function" ) {
                    this.#webAppManager.setEnabledAuthMethods( this.#authManager.getEnabledMethods() );
                }
                return this.#beginListening( this.#netServer, this.serviceConfig.port, this.serviceConfig.host );
            } ).then( ( server ) => {
                if ( server.listening === true ) {
                    this.#serverUrl = `http${ this.serviceConfig.useTLS === true ? "s" : "" }://${ server.address().address }:${ server.address().port }`;
                    logger.log( `Web server started at address '${ this.#serverUrl }' within instance '${ ServiceConsumer.instanceID }'.`, logger.logSeverity.NOTICE );
                } else {
                    logger.log( `Web server is not listening for requests after startup within instance '${ ServiceConsumer.instanceID }'.`, logger.logSeverity.WARNING );
                }
                resolve();
            } ).catch( ( error ) => {
                logger.log( `Error while trying to start web server within instance '${ ServiceConsumer.instanceID }'!`, logger.logSeverity.ERROR, error );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Shuts down the web server.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStop() {
        return new Promise( ( resolve, reject ) => {
            this.#isShuttingDown = true;

            super.onStop().then( () => {
                return this.#endListening( this.#netServer );
            } ).then( () => {
                logger.log( `Web server stopped successfully.`, logger.logSeverity.NOTICE );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to report health status of the service instance for external monitoring.
     * This is a scheduled job that will be executed at SERVICE_HEALTH_CHECK_INTERVAL time.
     *
     * @method
     * @override
     * @public
     */
    reportHealthy() {
        super.reportHealthy();
    }

    /**
     * Used to verify the session of a request.
     *
     * @method
     * @param {TiSession} session
     * @returns {boolean}
     * @public
     */
    verifySession( session ) {
        // TODO: Implement this!
        return Boolean( session && session.user );
    }

    /**
     * Hook for the application to augment the freshly-authenticated session (e.g. derive domain roles from an
     * identity store or the org chart). Runs synchronously, once per login, before the framework's additive `admin`
     * role is applied. The default is a no-op. Any test-user role injection is an override of whatever the app derives.
     *
     * @method
     * @virtual
     * @param {TiSession} session
     * @param {Object} [request] Optional Express request object that can be used to read body/cookies/query data.
     * @returns {TiSession}
     * @public
     */
    augmentSession( session, request ) {
        return session;
    }

    /**
     * Used to authenticate a user via the specified auth method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {Object} [authDetails={}]
     * @returns {Promise}
     * @public
     */
    authenticate( authMethod, authDetails = {} ) {
        return this.#authManager.authenticate( authMethod, authDetails );
    }

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
    authorize( authMethod, currentUrl, oidc ) {
        return this.#authManager.authorize( authMethod, currentUrl, oidc );
    }

    /**
     * Used to get a service mapping if such exists.
     *
     * @method
     * @param {string} serviceVersion
     * @param {string} serviceName
     * @returns {ServiceAddress}
     * @public
     */
    getServiceAddress( serviceVersion, serviceName ) {
        let serviceAddress = undefined;
        if ( this.serviceConfig.api && this.serviceConfig.api.inventory ) {
            serviceAddress = ( this.serviceConfig.api.inventory[ serviceVersion ] ) ? this.serviceConfig.api.inventory[ serviceVersion ][ serviceName ] : undefined;
        }
        return serviceAddress;
    }

    /**
     * Used to check if the specified hostname is allowed to access the web server.
     *
     * @method
     * @param {string} hostname
     * @returns {boolean}
     * @public
     */
    isAllowedHost( hostname ) {
        return this.#allowedHosts.includes( hostname );
    }

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
    isUnprotectedRoute( route ) {
        const pathOnly = String( route || "" ).split( "?" )[ 0 ];
        return TiWebServer.isRouteInList( this.#unprotectedRoutes, pathOnly );
    }

    /**
     * Used to define the web application routes.
     * <br/>
     * NOTE: Override this to define custom web application routes. Remember to call the base method if you want to preserve the default behavior as well.
     *
     * @method
     * @virtual
     * @public
     */
    defineWebApplicationRoutes() {
        this.#webServer.get( "/", webHandlers.webAppHandler( this ) );
        this.#webServer.get( "/not-found", webHandlers.webAppHandler( this ) );
        this.#webServer.get( "/app", webHandlers.webAppHandler( this ) );
        this.#webServer.get( "/app/:view", webHandlers.webAppHandler( this ) );
        this.#webServer.post( "/app/:service", webHandlers.webAppHandler( this ) );
        this.#webServer.get( "/login/:method", webHandlers.authenticationHandler( this ) );
        this.#webServer.post( "/login/:method", webHandlers.authenticationHandler( this ) );
        this.#webServer.post( "/logout", webHandlers.logoutHandler() );
        this.#webServer.get( "/health", webHandlers.healthHandler() );
        this.#webServer.get( "/me", webHandlers.userInformationHandler() );
        // NOTE: A callback is registered by its path, never by the configured value verbatim — that value is commonly
        // the absolute URL registered with the identity provider, which Express cannot parse as a route pattern.
        [ authMethod.OPENID_GOOGLE, authMethod.OPENID_AZURE ].forEach( ( method ) => {
            if ( this.#authManager.isAuthEnabled( method ) === true ) {
                const callbackPath = this.#authManager.getOAuth2CallbackPath( method );
                if ( callbackPath ) {
                    this.#webServer.get( callbackPath, webHandlers.authorizedOAuth2CallbackHandler( this, method ) );
                } else {
                    logger.log( `Authentication method '${ method }' is enabled but its callback URL yields no usable route path; its callback endpoint was not registered and sign-in through it will fail.`, logger.logSeverity.WARNING );
                }
            }
        } );

        // Admin configuration-management API. Gated by the admin role; these paths are not in the unprotected-routes
        // list, so they also inherit the server's global authentication + CSRF middleware.
        const requireAdmin = authorization.requireAdmin;
        const service = configService.instance;
        this.#webServer.get( "/admin/config/editors", requireAdmin, adminConfigHandlers.listEditors( service ) );
        this.#webServer.get( "/admin/config/editors/:editorKey", requireAdmin, adminConfigHandlers.composeView( service ) );
        this.#webServer.post( "/admin/config/editors/:editorKey", requireAdmin, adminConfigHandlers.saveEditorEdit( service ) );
        this.#webServer.get( "/admin/config/documents/:configKey", requireAdmin, adminConfigHandlers.getCurrent( service ) );
        this.#webServer.get( "/admin/config/documents/:configKey/history", requireAdmin, adminConfigHandlers.getHistory( service ) );
        this.#webServer.get( "/admin/config/changes", requireAdmin, adminConfigHandlers.listChanges( service ) );
        this.#webServer.get( "/admin/config/changes/:changeSetID", requireAdmin, adminConfigHandlers.getChange( service ) );
        this.#webServer.post( "/admin/config/changes/:changeSetID/restore", requireAdmin, adminConfigHandlers.restoreChangeSet( service ) );
        this.#webServer.get( "/admin/config/export", requireAdmin, adminConfigHandlers.exportBundle( service ) );
    }

    /**
     * Used to define the unprotected routes (i.e., routes that do not require authentication).
     * <br/>
     * NOTE: Override this to define custom unprotected routes. Remember to call the base method if you want to preserve the default behavior as well.
     *
     * @method
     * @virtual
     * @public
     */
    defineUnprotectedRoutes() {
        this.#unprotectedRoutes.push( "/" );
        this.#unprotectedRoutes.push( "/not-found" );
        this.#unprotectedRoutes.push( "/app" );
        this.#unprotectedRoutes.push( "/app/enter" );
        this.#unprotectedRoutes.push( "/app/config" );
        this.#unprotectedRoutes.push( /^\/login\/[^/]+$/i );
        this.#unprotectedRoutes.push( "/logout" );
        this.#unprotectedRoutes.push( "/health" );
        this.#unprotectedRoutes.push( RE_STATIC_UNPROTECTED );
        this.#unprotectedRoutes.push( RE_WELL_KNOWN_UNPROTECTED );
    }

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
    registerRoute( method, path, ...handlers ) {
        const verb = TiWebServer.normalizeRegistrableMethod( method );
        if ( verb === null ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { method: method } );
        }
        if ( !this.#webServer ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_NOT_INITIALIZED, { detail: "registerRoute() called before the Express app was created; call it from a defineWebApplicationRoutes() override." } );
        }
        this.#webServer[ verb ]( path, ...handlers );
        return this;
    }

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
    addUnprotectedRoute( pattern ) {
        if ( _.isString( pattern ) || _.isRegExp( pattern ) ) {
            this.#unprotectedRoutes.push( pattern );
        } else {
            logger.log( `Ignored an invalid unprotected-route pattern of type '${ typeof pattern }'; expected a string or RegExp.`, logger.logSeverity.WARNING );
        }
        return this;
    }

    /* Static interface */

    /**
     * The Express routing verbs that {@link TiWebServer#registerRoute} will register. Deliberately limited to
     * route-scoped methods — `use` (global middleware mounting) is intentionally excluded; add a dedicated seam if
     * middleware mounting is ever needed.
     *
     * @type {Set<string>}
     * @private
     */
    static #REGISTRABLE_METHODS = new Set( [ "get", "post", "put", "patch", "delete", "options", "head", "all" ] );

    /**
     * The default `/static` cache policy: revalidate every use, with a long-lived exception for web fonts.
     * <br/>
     * The default used to be `max-age=1y, immutable`, which was wrong for every consumer that does not hash its asset
     * filenames — and none of them do by default, since the framework's own assets ship under stable names
     * (`/static/scripts/ti-framework.js`, the theme sheets, …). `immutable` promises that the bytes behind THIS URL
     * will never change, and browsers honour it so completely that not even a manual reload revalidates: a deployed
     * CSS or JS fix would simply never reach anyone who had already visited, for up to a year, with no way to tell
     * them otherwise. Revalidating is the only default that is true for a stable filename; `send` still attaches an
     * `ETag`/`Last-Modified`, so the cost is a conditional request answered with a 304, not a re-download.
     * <br/>
     * A consumer that fingerprints its filenames (`app.a1b2c3.css`) makes the promise true and should opt back in via
     * `staticCache: { maxAge: 31536000, immutable: true }`.
     * <br/>
     * NOTE: These defaults deliberately live here rather than in `web-server.json`, because the constructor merges the
     * service config with `_.merge`, which merges arrays BY INDEX — a consumer's `immutablePaths: []` could then never
     * clear a default entry. Absent from the config file, an explicitly empty array means exactly that.
     *
     * @type {Object}
     * @private
     */
    static #STATIC_CACHE_DEFAULTS = Object.freeze( {
        maxAge: 0,
        immutable: false,
        // Fonts are the one genuinely content-addressed-in-practice class under `/static`: a released `.woff2` is an
        // artifact, not something that gets edited in place, and its filename already carries the family, weight and
        // style. Configurable, because that is a statement about how a given deployment manages its font files.
        immutablePaths: Object.freeze( [ "/fonts/" ] )
    } );

    /**
     * The `max-age` applied to a path matched by `staticCache.immutablePaths`, in seconds (one year — the longest
     * value any cache treats as meaningful, and the conventional pairing for `immutable`).
     *
     * @type {number}
     * @private
     */
    static #IMMUTABLE_MAX_AGE = 31536000;

    /**
     * Normalizes an `immutablePaths` entry to a rooted, slash-terminated prefix (`fonts` -> `/fonts/`), or null when
     * it is not usable. The trailing slash is what keeps `/fonts` from also matching `/fonts-legacy/a.woff2`.
     *
     * @method
     * @static
     * @param {string} entry
     * @returns {string|null}
     * @private
     */
    static #normalizeImmutablePath( entry ) {
        if ( typeof entry !== "string" || entry.trim() === "" ) {
            return null;
        }
        const trimmed = entry.trim();
        const rooted = trimmed.startsWith( "/" ) ? trimmed : "/" + trimmed;
        return rooted.endsWith( "/" ) ? rooted : rooted + "/";
    }

    /**
     * Derives the served path of a static file (the part after the `/static` mount, always slash-separated) from the
     * directory it is served out of and its absolute location on disk. A file resolving outside the root yields a
     * `/../`-prefixed path, which matches no normalized prefix and therefore falls back to the default policy.
     *
     * @method
     * @static
     * @param {string} rootPath
     * @param {string} filePath
     * @returns {string}
     * @private
     */
    static #toServedPath( rootPath, filePath ) {
        // Split on the platform separator only: on POSIX a backslash is a legal filename character, not a delimiter.
        return "/" + path.relative( String( rootPath || "" ), String( filePath || "" ) ).split( path.sep ).join( "/" );
    }

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
    static resolveStaticCachePolicy( staticCache ) {
        const defaults = TiWebServer.#STATIC_CACHE_DEFAULTS;
        const config = _.isObjectLike( staticCache ) ? staticCache : {};
        const warnings = [];

        let maxAge = defaults.maxAge;
        if ( config.maxAge !== undefined ) {
            if ( Number.isInteger( config.maxAge ) && config.maxAge >= 0 ) {
                maxAge = config.maxAge;
            } else {
                warnings.push( `Ignored an invalid 'staticCache.maxAge' value of '${ config.maxAge }'; it must be a whole, non-negative number of seconds (a duration string such as '1y' is not accepted). Using ${ defaults.maxAge } instead.` );
            }
        }

        let immutable = defaults.immutable;
        if ( config.immutable !== undefined ) {
            if ( typeof config.immutable === "boolean" ) {
                immutable = config.immutable;
            } else {
                warnings.push( `Ignored a non-boolean 'staticCache.immutable' value of '${ config.immutable }'. Using ${ defaults.immutable } instead.` );
            }
        }
        if ( immutable === true && maxAge === 0 ) {
            warnings.push( `Ignored 'staticCache.immutable' because 'staticCache.maxAge' is 0 — a response that is stale on arrival cannot also promise never to change. Set a positive 'staticCache.maxAge' (and hash your asset filenames) to serve '/static' as immutable.` );
            immutable = false;
        }

        let immutablePaths = defaults.immutablePaths.slice();
        if ( config.immutablePaths !== undefined ) {
            if ( Array.isArray( config.immutablePaths ) ) {
                immutablePaths = [];
                config.immutablePaths.forEach( ( entry ) => {
                    const normalized = TiWebServer.#normalizeImmutablePath( entry );
                    if ( normalized === null ) {
                        warnings.push( `Ignored an invalid 'staticCache.immutablePaths' entry of type '${ typeof entry }'; expected a non-empty path prefix such as '/fonts/'.` );
                    } else {
                        immutablePaths.push( normalized );
                    }
                } );
            } else {
                warnings.push( `Ignored a non-array 'staticCache.immutablePaths' value of type '${ typeof config.immutablePaths }'. Using the default [ ${ defaults.immutablePaths.join( ", " ) } ] instead.` );
            }
        }

        return { maxAge: maxAge, immutable: immutable, immutablePaths: immutablePaths, warnings: warnings };
    }

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
    static staticCacheControlFor( rootPath, filePath, policy ) {
        const resolved = _.isObjectLike( policy ) ? policy : {};
        const immutablePaths = Array.isArray( resolved.immutablePaths ) ? resolved.immutablePaths : [];
        const servedPath = TiWebServer.#toServedPath( rootPath, filePath );

        if ( immutablePaths.some( ( prefix ) => servedPath.startsWith( prefix ) ) === true ) {
            return `public, max-age=${ TiWebServer.#IMMUTABLE_MAX_AGE }, immutable`;
        }

        const maxAge = ( Number.isInteger( resolved.maxAge ) && resolved.maxAge >= 0 ) ? resolved.maxAge : 0;
        if ( maxAge === 0 ) {
            return "public, max-age=0, must-revalidate";
        }
        return ( resolved.immutable === true ) ? `public, max-age=${ maxAge }, immutable` : `public, max-age=${ maxAge }`;
    }

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
    static normalizeRegistrableMethod( method ) {
        if ( typeof method !== "string" ) {
            return null;
        }
        const verb = method.trim().toLowerCase();
        return TiWebServer.#REGISTRABLE_METHODS.has( verb ) ? verb : null;
    }

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
    static isRouteInList( patterns, pathOnly ) {
        for ( let idx = 0; idx < patterns.length; idx++ ) {
            const pattern = patterns[ idx ];
            let matched;
            if ( _.isRegExp( pattern ) ) {
                // Avoid stateful RegExp behavior when 'g' or 'y' flags are present:
                pattern.lastIndex = 0;
                matched = pattern.test( pathOnly );
            } else {
                matched = ( pattern === pathOnly );
            }
            if ( matched === true ) {
                return true;
            }
        }
        return false;
    }

    /* Private interface */

    /**
     * Used to start listening for requests on the specified port and host and on the specified server.
     *
     * @method
     * @param {NodeServer} server The server instance to listen on.
     * @param {number} port The port to listen on.
     * @param {string} host The host to listen on.
     * @returns {Promise<NodeServer>}
     * @private
     */
    #beginListening( server, port, host ) {
        return new Promise( ( resolve, reject ) => {
            server.once( "error", ( error ) => {
                reject( exceptions.raise( error ) );
            } );
            server.once( "listening", () => {
                resolve( server );
            } );
            server.listen( port, host );
        } );
    }

    /**
     * Used to stop listening for requests on the specified server.
     *
     * @method
     * @param {NodeServer} server The server instance to stop listening on.
     * @returns {Promise}
     * @private
     */
    #endListening( server ) {
        return new Promise( ( resolve, reject ) => {
            if ( !server ) {
                resolve();
            } else {
                // Close all connections after a short delay to allow all requests to complete:
                setTimeout( () => {
                    if ( typeof server.closeIdleConnections === "function" ) {
                        server.closeIdleConnections();
                    }
                    if ( typeof server.closeAllConnections === "function" ) {
                        server.closeAllConnections();
                    }
                }, 1000 );

                server.close( ( error ) => {
                    if ( error ) {
                        reject( exceptions.raise( error ) );
                    } else {
                        resolve();
                    }
                } );
            }
        } );
    }

}

module.exports = TiWebServer;
// Exported for unit testing of the ReDoS-hardened matchers; not part of the customization surface.
module.exports.RE_STATIC_UNPROTECTED = RE_STATIC_UNPROTECTED;
module.exports.RE_WELL_KNOWN_UNPROTECTED = RE_WELL_KNOWN_UNPROTECTED;