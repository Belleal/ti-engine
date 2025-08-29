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
const express = require( "express" );
const helmet = require( "helmet" );
const session = require( "express-session" );
const SessionStore = require( "#session-store" );
const ServiceProvider = require( '@ti-engine/core/service-provider' )

/**
 * @typedef {Object} WebConfigMain
 * @property {SettingsCookies} cookies
 * @property {string} host
 * @property {number} port
 * @property {string} publicPath
 * @property {ServicesConfig} services
 * @property {SettingsSession} session
 * @property {string} tlsCertPath
 * @property {string} tlsKeyPath
 * @property {boolean} useTLS
 */

/**
 * @typedef {Object} ServicesConfig
 * @property {number} requestTimeout
 */

/**
 * @typedef {Object} SettingsCookies
 * @property {string} secret
 */

/**
 * @typedef {Object} SettingsSession
 * @property {string} secret
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
    #webConfig = {};
    #serverUrl = "";
    #isShuttingDown = false;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {WebConfigMain} serviceConfig The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );

        this.#webConfig.useTLS = ( serviceConfig.useTLS === true );
        this.#webConfig.tlsCertPath = serviceConfig.tlsCertPath || "bin/tls/cert.pem";
        this.#webConfig.tlsKeyPath = serviceConfig.tlsKeyPath || "bin/tls/key.pem";
        this.#webConfig.port = serviceConfig.port || 3000;
        this.#webConfig.host = serviceConfig.host || "0.0.0.0";
        this.#webConfig.publicPath = serviceConfig.publicPath || "bin/public";
        this.#webConfig.cookies = {
            secret: serviceConfig.cookies.secret || randomBytes( 32 ).toString( "base64" ),
            setup: {
                path: "/",
                httpOnly: true,
                secure: ( serviceConfig.useTLS === true ),
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 7 // 7 days
            }
        };
        this.#webConfig.session = {
            secret: serviceConfig.session.secret || serviceConfig.cookies.secret || randomBytes( 32 ).toString( "base64" )
        };
        this.#webConfig.oauth2 = {
            google: {
                clientID: process.env.TI_WEB_GOOGLE_CLIENT_ID || "",
                clientSecret: process.env.TI_WEB_GOOGLE_CLIENT_SECRET || "",
                callbackUrl: process.env.TI_WEB_GOOGLE_CALLBACK_URL || "/login/google/callback"
            }
        };
        // TODO: this is for testing. Implement real auth solution.
        this.#webConfig.localAuth = {
            enabled: true,
            username: "admin",
            password: "admin",
            passwordSha256: process.env.TI_WEB_LOCAL_PASSWORD_SHA256 || ""
        };
    }

    /* Public interface */

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
                    secret: this.#webConfig.cookies.secret,
                    resave: false,
                    saveUninitialized: false,
                    cookie: this.#webConfig.cookies.setup,
                    unset: "destroy",
                    store: new SessionStore()
                } ) );

                this.#webServer.use( this.#onShutDownHandler( this ) );
                this.#webServer.use( express.static( this.#webConfig.publicPath, {} ) );
                this.#webServer.use( this.#authenticationHandler( this ) );

                this.#webServer.get( "/", ( request, response ) => {
                    response.sendFile( path.join( process.cwd(), this.#webConfig.publicPath, "index.html" ) );
                } );
                this.#webServer.get( "/service/:version/:serviceURL", this.#serviceCallHandler( this ) );

                // Configure the web server for HTTPS if enabled in the service config:
                if ( this.#webConfig.useTLS === true ) {
                    let httpsOptions = undefined;
                    try {
                        httpsOptions = {
                            key: fs.readFileSync( path.join( process.cwd(), this.#webConfig.tlsKeyPath ) ),
                            cert: fs.readFileSync( path.join( process.cwd(), this.#webConfig.tlsCertPath ) )
                        };
                    } catch ( error ) {
                        logger.log( "Failed to read and load the TLS key/cert files.", logger.logSeverity.ERROR, error );
                        throw exceptions.raise( error );
                    }
                    this.#webServer.use( this.#httpRedirectHandler() );
                    this.#netServer = https.createServer( httpsOptions, this.#webServer );
                } else {
                    this.#netServer = http.createServer( this.#webServer );
                }

                // Start listening for requests:
                return this.#beginListening( this.#netServer, this.#webConfig.port, this.#webConfig.host );
            } ).then( ( server ) => {
                if ( server.listening === true ) {
                    this.#serverUrl = `http${ this.#webConfig.useTLS === true ? "s" : "" }://${ server.address().address }:${ server.address().port }`;
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
        return true;
    }

    /* Private interface */

    /**
     * Used to start listening for requests on the specified port and host.
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
            server.close( ( error ) => {
                if ( error ) {
                    reject( exceptions.raise( error ) );
                } else {
                    resolve();
                }
            } );
        } );
    }

    /**
     * Handler for requests that are received while the web server is shutting down.
     *
     * @method
     * @param {TiWebServer} instance
     * @returns {(function(*, *, *): void)|*}
     * @private
     */
    #onShutDownHandler( instance ) {
        return ( request, response, next ) => {
            if ( !instance.isShuttingDown ) {
                next();
            } else {
                response.set( "Connection", "close" );
                response.status( 503 ).send( {
                    isSuccessful: false
                } );
            }
        };
    }

    /**
     * Handler for requests that require authentication.
     *
     * @method
     * @param {TiWebServer} instance
     * @returns {(function(*, *, *): void)|*}
     * @private
     */
    #authenticationHandler( instance ) {
        return ( request, response, next ) => {
            if ( instance.verifySession( request.sessionID ) !== true ) {
                response.status( 403 ).json( {
                    isSuccessful: false
                } );
            } else {
                next();
            }
        };
    }

    /**
     * Handler for redirecting HTTP requests to HTTPS. Also works behind proxies using X-Forwarded-Proto.
     *
     * @method
     * @returns {(function(*, *, *): void)|*}
     * @private
     */
    #httpRedirectHandler() {
        return ( request, response, next ) => {
            const xfProto = String( request.get ? request.get( "x-forwarded-proto" ) : ( request.headers[ "x-forwarded-proto" ] || "" ) ).toLowerCase();
            const isSecure = request.secure === true || xfProto === "https";
            if ( isSecure ) {
                next();
            } else {
                const location = `https://${ request.headers.host }${ request.url }`;
                response.redirect( 301, location );
            }
        }
    }

    /**
     * Express middleware used to listen for and respond to HTTP(S) service calls.
     *
     * @method
     * @param {TiWebServer} instance
     * @param {APIGateway} options.apiGateway Reference to the parent class since an Express middleware is unable to use 'this' pointers.
     * @returns {function(*, *, *): void}
     * @private
     */
    #serviceCallHandler( instance ) {
        return ( request, response, next ) => {
            request.setTimeout( instance.serviceConfig.services.requestTimeout );

            instance.callService( {
                serviceAlias: "service1", // get the name of the first service - by default "service1"
                serviceDomainName: "ti-tester-service" // get the name of own service domain - by default "ti-tester-service"
            }, {}, {
                authToken: "dummy-auth" // use a dummy non-undefined value for auth token as expected by method 'verifyAccess' above
            } ).then( ( result ) => {
                logger.log( "Execution of service1 result:", logger.logSeverity.NOTICE, result );
                response.status( 200 ).json( {
                    isSuccessful: true
                } );
            } ).catch( ( error ) => {
                logger.log( "Execution of service1 error result:", logger.logSeverity.ERROR, error );
                next( error );
            } );

            // let serviceVersion = request.params.version;
            // let serviceURL = request.params.serviceURL;
            // let serviceAddress = options.apiGateway.getServiceAddress( serviceVersion, serviceURL );
            // if ( serviceAddress && typeof ( controller[ serviceAddress ] ) === "function" ) {
            //     // verify if this is a developer only service and request proper key if it is:
            //     if ( developerOnlyServices.indexOf( serviceURL ) > -1 && request.query.developerKey !== developerKey ) {
            //         let error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_DEVELOPER_ACCESS );
            //         error.httpCode = 403;
            //         next( error );
            //     } else {
            //         let serviceParams = request.body || {};
            //         controller[ serviceAddress ].apply( controller, [serviceParams] ).then( ( result ) => {
            //             let authToken;
            //             result = result || {};
            //             if ( result.createAuthToken === true && result.playerID ) {
            //                 delete result.createAuthToken;
            //                 authToken = options.apiGateway[ _createAuthToken ]( result.playerID );
            //             }
            //             response.json( {
            //                 isSuccessful: true,
            //                 authToken: authToken,
            //                 data: result
            //             } );
            //         } ).catch( ( error ) => {
            //             next( error );
            //         } );
            //     }
            // } else {
            //     next( exceptions.raise( exceptions.exceptionCode.E_COM_INVALID_API_MAPPING ) );
            // }
        };
    }

}

module.exports = TiWebServer;