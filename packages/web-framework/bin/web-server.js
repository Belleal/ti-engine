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
     * @throws {Exception.E_GEN_JS_INTERNAL_ERROR} If the web application manager cannot be loaded.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, _.merge( webServerConfig, ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : {} ) );

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
                        let exception = exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
                            tlsKeyPath: this.serviceConfig.tlsKeyPath,
                            tlsCertPath: this.serviceConfig.tlsCertPath
                        } );
                        exception.httpCode = exceptions.httpCode.C_500;
                        return reject( exception );
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
                this.#webServer.use( webHandlers.originRefererValidationHandler() );
                this.#webServer.use( webHandlers.csrfProtectionHandler() );

                // Set up the web server routes:
                this.#webServer.use( webHandlers.onShutDownHandler( this ) );
                this.#webServer.use( webHandlers.resourceProtectionHandler( this ) );
                this.#webServer.use( "/.well-known", express.static( path.join( this.#staticContentPaths[ 0 ], ".well-known" ), { dotfiles: "allow" } ) );
                _.forEach( this.#staticContentPaths, ( staticContentPath ) => {
                    this.#webServer.use( "/static", express.static( staticContentPath, { maxAge: "1y", immutable: true } ) );
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
     * @param {Object} session
     * @returns {boolean}
     * @public
     */
    verifySession( session ) {
        // TODO: Implement this!
        return Boolean( session && session.user );
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
     * Used to check if the specified route is unprotected (i.e., does not require authentication).
     * Unprotected routes are:
     * - /
     * - /static/...
     * - /.well-known/...
     *
     * @method
     * @param {string} route
     * @returns {boolean}
     * @public
     */
    isUnprotectedRoute( route ) {
        const pathOnly = String( route || "" ).split( "?" )[ 0 ];
        let result = false;
        for ( let idx = 0; idx < this.#unprotectedRoutes.length; idx++ ) {
            const pattern = this.#unprotectedRoutes[ idx ];
            if ( _.isRegExp( pattern ) ) {
                // Avoid stateful RegExp behavior when 'g' or 'y' flags are present:
                pattern.lastIndex = 0;
                result = pattern.test( pathOnly );
            } else {
                result = ( pattern === pathOnly );
            }
            if ( result ) {
                break;
            }
        }
        return result;
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
        this.#webServer.get( "/app/:view", webHandlers.webAppHandler( this ) );
        this.#webServer.get( "/login/:method", webHandlers.authenticationHandler( this ) );
        this.#webServer.post( "/login/:method", webHandlers.authenticationHandler( this ) );
        this.#webServer.post( "/logout", webHandlers.logoutHandler() );
        this.#webServer.get( "/me", webHandlers.userInformationHandler() );
        if ( this.#authManager.isAuthEnabled( authMethod.OPENID_GOOGLE ) ) {
            this.#webServer.get( this.#authManager.getOAuth2CallbackUrl( authMethod.OPENID_GOOGLE ), webHandlers.authorizedOAuth2CallbackHandler( this, authMethod.OPENID_GOOGLE ) );
        }
        if ( this.#authManager.isAuthEnabled( authMethod.OPENID_AZURE ) ) {
            this.#webServer.get( this.#authManager.getOAuth2CallbackUrl( authMethod.OPENID_AZURE ), webHandlers.authorizedOAuth2CallbackHandler( this, authMethod.OPENID_AZURE ) );
        }
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
        this.#unprotectedRoutes.push( /^\/login\/[^\/]+$/i );
        this.#unprotectedRoutes.push( "/logout" );
        this.#unprotectedRoutes.push( /^\/static\/(?:.+\/)*[^\/]+\.[^\/]+$/i );
        this.#unprotectedRoutes.push( /^\/\.well-known\/(?:.+\/)*[^\/]+\.[^\/]+$/i );
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