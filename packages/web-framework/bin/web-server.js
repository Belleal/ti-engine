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
const { randomBytes } = require( "crypto" );
const path = require( "path" );
const fs = require( "fs" );
const SessionStore = require( "#session-store" );

/**
 * A web server microservice based on the ti-engine.
 *
 * @class TiWebServer
 * @public
 */
class TiWebServer extends ServiceConsumer {

    #webServer = null;
    #webConfig = {};

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} serviceConfig The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );

        // Configure the web server for HTTPS if enabled in the service config:
        let httpsOptions = undefined;
        if ( serviceConfig.useTLS === true ) {
            try {
                httpsOptions = {
                    key: fs.readFileSync( path.join( process.cwd(), serviceConfig.tlsKeyPath ) ),
                    cert: fs.readFileSync( path.join( process.cwd(), serviceConfig.tlsCertPath ) )
                };
            } catch ( error ) {
                logger.log( "Failed to read and load the TLS key/cert files.", logger.logSeverity.ERROR, error );
                throw exceptions.raise( error );
            }
        }

        this.#webServer = require( "fastify" )( {
            // Enable trustProxy so secure cookies work correctly behind reverse proxies/load balancers:
            trustProxy: true,
            https: httpsOptions
        } );

        this.#webConfig.scheme = ( serviceConfig.useTLS === true ) ? "https" : "http";
        this.#webConfig.port = serviceConfig.port || 3000;
        this.#webConfig.host = serviceConfig.host || "0.0.0.0";
        this.#webConfig.publicPath = "packages/web-framework/bin/public";
        this.#webConfig.cookies = {
            secret: serviceConfig.cookies.secret || randomBytes( 32 ).toString( "base64" ),
            setup: {
                path: "/",
                httpOnly: true,
                secure: true,
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
                // Attach and configure the official plugins:
                this.#configurePlugins();

                // Configure the web server routes:
                this.#webServer.register( require( "#common-routes" ), { webConfig: this.#webConfig } );

                // Start listening for requests:
                return this.#webServer.listen( { port: this.#webConfig.port, host: this.#webConfig.host } );
            } ).then( ( address ) => {
                logger.log( `Web server started at '${ address }' within instance '${ ServiceConsumer.instanceID }'.`, logger.logSeverity.NOTICE );
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
            super.onStop().then( () => {
                return this.#webServer.close();
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

    /* Private interface */

    /**
     * Used to set up all official plugins for the web server.
     *
     * @method
     * @private
     */
    #configurePlugins() {
        // Step 1 - Security headers:
        this.#webServer.register( require( "@fastify/helmet" ), {
            global: true,
            contentSecurityPolicy: false
        } );

        // Generate a per-request CSP nonce and attach it to the request object:
        this.#webServer.addHook( "onRequest", ( request, reply, done ) => {
            try {
                request.cspNonce = randomBytes( 16 ).toString( "base64" );
            } catch ( e ) {
                request.cspNonce = "";
            }
            done();
        } );

        // Set a dynamic Content Security Policy header that includes the nonce for inline scripts:
        this.#webServer.addHook( "onSend", ( request, reply, payload, done ) => {
            try {
                const ct = String( reply.getHeader( "content-type" ) || "" ).toLowerCase();
                if ( ct.includes( "text/html" ) ) {
                    const nonce = request.cspNonce || "";
                    const csp =
                        "default-src 'self'; " +
                        "script-src 'self' https: 'unsafe-eval' 'nonce-" + nonce + "'; " +
                        "style-src 'self' https: 'unsafe-inline'; " +
                        "img-src 'self' https: data:; " +
                        "connect-src 'self' https: ws: wss:; " +
                        "font-src 'self' https: data:; " +
                        "object-src 'none'; " +
                        "frame-ancestors 'self'; " +
                        "base-uri 'self'";
                    reply.header( "Content-Security-Policy", csp );
                }
            } catch ( e ) {
                // no-op
            }
            done( null, payload );
        } );

        // Register the static file serving before routes that depend on it:
        this.#webServer.register( require( "@fastify/static" ), {
            root: path.join( process.cwd(), this.#webConfig.publicPath ),
            prefix: "/public/",
            decorateReply: true,
            serveDotFiles: false,
            maxAge: "1h"
        } );

        // Step 2 - Cookies (must be before session):
        this.#webServer.register( require( "@fastify/cookie" ), {
            secret: this.#webConfig.cookies.secret,
            hook: "onRequest",
            parseOptions: this.#webConfig.cookies.setup
        } );

        // Step 3 - Session (depends on cookies):
        this.#webServer.register( require( "@fastify/session" ), {
            secret: this.#webConfig.session.secret,
            cookieName: "sid",
            rolling: true,
            cookie: this.#webConfig.cookies.setup,
            store: new SessionStore()
        } );

        // Step 4 - CSRF protection (uses session):
        this.#webServer.register( require( "@fastify/csrf-protection" ), {
            sessionPlugin: "@fastify/session"
            // Defaults: looks for token in body._csrf, query._csrf, headers['x-csrf-token']
        } );

        // Step 5 - Auth utility (used to compose preHandlers):
        this.#webServer.register( require( "@fastify/auth" ) );

        // Step 6 - Google OAuth2 (requires cookie for state; routes added at /login/google and callback):
        const { GOOGLE_CONFIGURATION } = require( "@fastify/oauth2" );
        this.#webServer.register( require( "@fastify/oauth2" ), {
            name: "googleOAuth2",
            scope: [ "openid", "profile", "email" ],
            credentials: {
                client: {
                    id: this.#webConfig.oauth2.google.clientID,
                    secret: this.#webConfig.oauth2.google.clientSecret
                },
                auth: GOOGLE_CONFIGURATION
            },
            startRedirectPath: "/login/google",
            callbackUri: ( this.#webConfig.scheme + "://" + this.#webConfig.host + ":" + this.#webConfig.port ) + this.#webConfig.oauth2.google.callbackUrl,
            cookie: this.#webConfig.cookies.setup,
            pkce: "S256"
            // Optionally, you can implement generateStateFunction/checkStateFunction for extra CSRF safety in the OAuth flow.
        } );
    }

}

module.exports = TiWebServer;