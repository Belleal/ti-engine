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
const http = require( "node:http" );
const https = require( "node:https" );
const _ = require( "lodash" );
const express = require( "express" );
const helmet = require( "helmet" );
const session = require( "express-session" );
const SessionStore = require( "#session-store" );
const webHandlers = require( "#web-handlers" );

/**
 * @typedef {ServiceConfiguration} WebServiceConfiguration
 * @property {ApiConfig} api
 * @property {SettingsCookies} cookies
 * @property {string} host
 * @property {number} port
 * @property {string} publicPath
 * @property {number} requestTimeout
 * @property {SettingsSession} session
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
 * @typedef {Object} SettingsCookies
 * @property {string} secret
 */

/**
 * @typedef {Record<string, Record<string, ServiceAddress>>} ApiInventory
 */

/**
 * @typedef {Object} SettingsSession
 */

/**
 * A web server microservice based on the ti-engine.
 *
 * @class TiWebServer
 * @public
 */
class TiWebServer extends ServiceConsumer {

    #webServer = null;
    #netServer = null;
    #serverUrl = "";
    #isShuttingDown = false;
    #allowedHosts = [];
    #unprotectedRoutes = [];

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
        this.#unprotectedRoutes.push( /^\/static\/(?:.+\/)*[^\/]+\.[^\/]+$/i );
        this.#unprotectedRoutes.push( /^\/\.well-known\/(?:.+\/)*[^\/]+\.[^\/]+$/i );
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

                // Set up 'helmet' and 'session' middlewares first:
                this.#webServer.use( helmet( {
                    contentSecurityPolicy: {
                        useDefaults: true,
                        // Content Security Policy directives:
                        // - defaultSrc: Fallback for all resource types not explicitly listed; only allow same-origin.
                        // - scriptSrc: Allow scripts from same-origin and any HTTPS origin; blocks inline scripts by default.
                        // - styleSrc: Allow styles from same-origin and HTTPS; 'unsafe-inline' is permitted to support inline styles.
                        // - imgSrc: Allow images from same-origin, HTTPS, and data URIs (for small inline images like icons).
                        // - connectSrc: Control where XHR/fetch/WebSocket connections can be made; restrict to same-origin and HTTPS APIs.
                        // - fontSrc: Allow web fonts from same-origin, HTTPS, and data URIs.
                        // - objectSrc: Disallow plugins such as <object>, <embed>, <applet> by setting to 'none'.
                        // - frameAncestors: Restrict who can embed this site in frames/iframes; 'self' prevents clickjacking from other origins.
                        directives: {
                            defaultSrc: [ "'self'" ],
                            scriptSrc: [ "'self'", "https:", "'unsafe-eval'" ],
                            styleSrc: [ "'self'", "https:", "'unsafe-inline'" ],
                            imgSrc: [ "'self'", "data:", "https:" ],
                            connectSrc: [ "'self'", "https:", "ws:", "wss:" ],
                            fontSrc: [ "'self'", "https:", "data:" ],
                            objectSrc: [ "'none'" ],
                            frameAncestors: [ "'self'" ]
                        }
                    }
                } ) );
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
                let netServerOptions = {
                    requestTimeout: _.max( [ this.serviceConfig.api.requestTimeout, this.serviceConfig.requestTimeout ] )
                };
                if ( this.serviceConfig.useTLS === true ) {
                    try {
                        netServerOptions.key = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsKeyPath ) );
                        netServerOptions.cert = fs.readFileSync( path.join( process.cwd(), this.serviceConfig.tlsCertPath ) );
                    } catch ( error ) {
                        logger.log( "Failed to read and load the TLS key/cert files.", logger.logSeverity.ERROR, error );
                        throw exceptions.raise( error );
                    }
                    this.#webServer.use( webHandlers.httpRedirectHandler( this ) );
                    this.#netServer = https.createServer( netServerOptions, this.#webServer );
                } else {
                    this.#netServer = http.createServer( netServerOptions, this.#webServer );
                }

                // Set up the web server routes:
                this.#webServer.use( webHandlers.onShutDownHandler( this ) );
                this.#webServer.use( webHandlers.authenticationHandler( this ) );

                this.#webServer.get( "/", ( request, response ) => {
                    response.sendFile( path.join( process.cwd(), this.serviceConfig.publicPath, "index.html" ) );
                } );
                this.#webServer.use( "/.well-known", express.static( path.join( this.serviceConfig.publicPath, "/.well-known" ), { dotfiles: "allow" } ) );
                this.#webServer.use( "/static", express.static( this.serviceConfig.publicPath, {} ) );
                this.#webServer.post( "/service/:version/:name", webHandlers.serviceCallHandler( this ) );

                this.#webServer.all( "*splat", webHandlers.invalidRouteHandler() );
                this.#webServer.use( webHandlers.defaultErrorHandler() );

                // Start listening for requests:
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
     * Used to verify the session ID of a request.
     *
     * @method
     * @param {string} sessionID
     * @returns {boolean}
     * @public
     */
    verifySession( sessionID ) {
        // TODO: implement this!
        return false;
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
                result = pattern === pathOnly;
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
            // Close the server:
            server.close( ( error ) => {
                if ( error ) {
                    reject( exceptions.raise( error ) );
                } else {
                    resolve();
                }
            } );
            // Close all connections after a short delay to allow all requests to complete:
            setTimeout( () => {
                server.closeAllConnections();
            }, 1000 );
        } );
    }

}

module.exports = TiWebServer;