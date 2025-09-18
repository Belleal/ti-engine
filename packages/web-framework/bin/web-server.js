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
const http = require( "node:http" );
const https = require( "node:https" );
const fs = require( "node:fs" );
const _ = require( "lodash" );
const express = require( "express" );
const helmet = require( "helmet" );
const session = require( "express-session" );
const webHandlers = require( "#web-handlers" );
const SessionStore = require( "#session-store" );
const WebAppManager = require( "#web-app-manager" );
const AuthManager = require( "#auth-manager" );

/**
 * @typedef {ServiceConfiguration} WebServiceConfiguration
 * @property {ApiConfig} api
 * @property {SettingsAuth} auth
 * @property {SettingsCookies} cookies
 * @property {string} host
 * @property {number} port
 * @property {string} publicPath
 * @property {number} requestTimeout
 * @property {string} tlsCertPath
 * @property {string} tlsKeyPath
 * @property {boolean} useTLS
 */

/**
 * @typedef {Object} ApiConfig
 * @property {ApiInventory} inventory
 * @property {number} requestTimeout
 */

/**
 * @typedef {Object} SettingsAuth
 * @property {string[]} enabledMethods
 * @property {Object} oauth2
 */

/**
 * @typedef {Object} SettingsCookies
 * @property {string} secret
 */

/**
 * @typedef {Record<string, Record<string, ServiceAddress>>} ApiInventory
 */

/**
 * A web server microservice based on the ti-engine.
 *
 * @class TiWebServer
 * @public
 */
class TiWebServer extends ServiceConsumer {

    #webServer;
    #netServer;
    #serverUrl = "";
    #isShuttingDown = false;
    #fullPublicPath = "";
    #allowedHosts = [];
    #unprotectedRoutes = [];
    #webAppManager;
    #authManager;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {WebServiceConfiguration} serviceConfig The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );

        // Include the current host in the list of allowed hosts:
        this.#allowedHosts.push( this.serviceConfig.host );

        // Define the unprotected routes:
        this.#unprotectedRoutes.push( "/" );
        this.#unprotectedRoutes.push( "/app" );
        this.#unprotectedRoutes.push( /^\/app\/(?:.+\/)*[^\/]+$/i );
        this.#unprotectedRoutes.push( "/login" );
        this.#unprotectedRoutes.push( "/logout" );
        this.#unprotectedRoutes.push( /^\/static\/(?:.+\/)*[^\/]+\.[^\/]+$/i );
        this.#unprotectedRoutes.push( /^\/\.well-known\/(?:.+\/)*[^\/]+\.[^\/]+$/i );

        // Fast-fail if the public path is not provided:
        if ( !this.serviceConfig.publicPath || typeof this.serviceConfig.publicPath !== "string" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        }
        this.#fullPublicPath = path.normalize( path.isAbsolute( this.serviceConfig.publicPath ) ? this.serviceConfig.publicPath : path.join( process.cwd(), this.serviceConfig.publicPath ) );
        if ( fs.existsSync( this.#fullPublicPath ) === false ) {
            logger.log( `Public path '${ this.#fullPublicPath }' does not exist. Static routes will resolve with 404 until path is created.`, logger.logSeverity.WARNING );
        }

        this.#webAppManager = new WebAppManager( "web-application" );
        this.#authManager = new AuthManager( this.serviceConfig.auth );
    }

    /* Public interface */

    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {WebServiceConfiguration}
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
     * Property returning the full path to the public directory.
     *
     * @property
     * @returns {string}
     * @public
     */
    get fullPublicPath() {
        return this.#fullPublicPath;
    }

    /**
     * Property returning the {@link WebAppManager} instance.
     *
     * @property
     * @returns {WebAppManager}
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

                // Set up security and session middlewares first:
                this.#webServer.use( webHandlers.nonceGenerationHandler() );
                this.#webServer.use( helmet( {
                    contentSecurityPolicy: false
                } ) );
                this.#webServer.use( webHandlers.cspHeaderHandler() );
                this.#webServer.use( express.json() );
                this.#webServer.use( express.urlencoded( { extended: false } ) );
                this.#webServer.use( session( {
                    secret: this.serviceConfig.cookies.secret || randomBytes( 32 ).toString( "base64" ),
                    resave: false,
                    saveUninitialized: false,
                    cookie: {
                        path: this.serviceConfig.cookies.path,
                        httpOnly: this.serviceConfig.cookies.httpOnly,
                        secure: ( this.serviceConfig.useTLS === true ),
                        sameSite: this.serviceConfig.cookies.sameSite,
                        maxAge: this.serviceConfig.cookies.maxAge
                    },
                    unset: "destroy",
                    store: new SessionStore()
                } ) );

                // Create and configure the net server for HTTPS if enabled in the service config:
                let netServerOptions = {};
                const timeoutCandidates = [
                    this.serviceConfig.api.requestTimeout,
                    this.serviceConfig.requestTimeout
                ].filter( ( value ) => Number.isFinite( value ) );
                const resolvedRequestTimeout = timeoutCandidates.length ? Math.max( ...timeoutCandidates ) : undefined;
                if ( this.serviceConfig.useTLS === true ) {
                    if ( !this.serviceConfig.tlsKeyPath || !this.serviceConfig.tlsCertPath ) {
                        let exception = exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
                            tlsKeyPath: this.serviceConfig.tlsKeyPath,
                            tlsCertPath: this.serviceConfig.tlsCertPath
                        } );
                        exception.httpCode = exceptions.httpCode.C_500;
                        throw exception;
                    }
                    netServerOptions.key = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsKeyPath ) );
                    netServerOptions.cert = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsCertPath ) );

                    this.#webServer.use( webHandlers.httpRedirectHandler( this ) );
                    this.#netServer = https.createServer( netServerOptions, this.#webServer );
                } else {
                    this.#netServer = http.createServer( netServerOptions, this.#webServer );
                }
                if ( Number.isFinite( resolvedRequestTimeout ) ) {
                    this.#netServer.requestTimeout = resolvedRequestTimeout;
                    this.#netServer.headersTimeout = resolvedRequestTimeout + 100;
                    if ( typeof this.#netServer.keepAliveTimeout === "number" ) {
                        this.#netServer.keepAliveTimeout = resolvedRequestTimeout + 1000;
                    }
                }

                // Set up the web server routes:
                this.#webServer.use( webHandlers.onShutDownHandler( this ) );
                this.#webServer.use( webHandlers.resourceProtectionHandler( this ) );

                this.#webServer.get( "/", webHandlers.webAppHandler( this ) );
                this.#webServer.use( "/.well-known", express.static( path.join( this.#fullPublicPath, ".well-known" ), { dotfiles: "allow" } ) );
                this.#webServer.use( "/static", express.static( this.#fullPublicPath, { maxAge: "1y", immutable: true } ) );
                this.#webServer.use( "/app", webHandlers.webAppHandler( this ) );

                this.#webServer.post( "/login/:method", webHandlers.authenticationHandler( this ) );
                this.#webServer.post( "/logout", webHandlers.logoutHandler() );
                this.#webServer.get( "/me", webHandlers.userInformationHandler() );

                // API service proxy route (protected by auth middleware):
                this.#webServer.post( "/service/:version/:name", webHandlers.serviceCallHandler( this ) );

                this.#webServer.all( "*splat", webHandlers.invalidRouteHandler() );
                this.#webServer.use( webHandlers.defaultErrorHandler() );

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
     * Used to verify the local authentication of a request.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {boolean}
     * @public
     */
    localAuthentication( username, password ) {
        return this.#authManager.localAuthentication( username, password );
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

    /* Private interface */

    /**
     * Used to start listening for requests on the specified port and host and on the specified server.
     *
     * @method
     * @param {http.Server|https.Server} server The server instance to listen on.
     * @param {number} port The port to listen on.
     * @param {string} host The host to listen on.
     * @returns {Promise<http.Server|https.Server>}
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
     * @param {http.Server|https.Server} server The server instance to stop listening on.
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