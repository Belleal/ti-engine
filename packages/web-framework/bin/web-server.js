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

        // Enable trustProxy so secure cookies work correctly behind reverse proxies/load balancers:
        this.#webServer = require( "fastify" )( {
            trustProxy: true
        } );

        // TODO: Temp setup, move these to actual settings
        this.#webConfig.cookies = {
            secret: process.env.COOKIE_SECRET || randomBytes( 32 ).toString( "base64" ),
            setup: {
                path: "/",
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 7 // 7 days
            }
        };
        this.#webConfig.session = {
            secret: process.env.SESSION_SECRET || process.env.COOKIE_SECRET || randomBytes( 32 ).toString( "base64" )
        };
        this.#webConfig.oauth2 = {
            google: {
                clientID: process.env.GOOGLE_CLIENT_ID || "",
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
                callbackUrl: process.env.GOOGLE_CALLBACK_URL || ""
            }
        };
    }

    /* Public interface */

    /**
     * Executes custom logic on instance start.
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
                this.#webServer.register( require( "#common-routes" ) );

                // Start listening for requests:
                return this.#webServer.listen( { port: 3000, host: "0.0.0.0" } );
            } ).then( ( address ) => {
                logger.log( `Web server started at '${ address }' from '${ ServiceConsumer.instanceID }'.`, logger.logSeverity.NOTICE );
                resolve();
            } ).catch( ( error ) => {
                logger.log( `Error while trying to start web server from '${ ServiceConsumer.instanceID }'!`, logger.logSeverity.ERROR, error );
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
            contentSecurityPolicy: {
                useDefaults: true,
                // Content Security Policy directives:
                // - defaultSrc: Fallback for all resource types not explicitly listed; only allow same-origin.
                // - scriptSrc: Allow scripts from same-origin and any HTTPS origin; blocks inline scripts by default.
                // - styleSrc: Allow styles from same-origin and HTTPS; 'unsafe-inline' is permitted to support inline styles
                //   (consider removing in the future to improve security if you can move styles to external files with nonces/hashes).
                // - imgSrc: Allow images from same-origin, HTTPS, and data URIs (for small inline images like icons).
                // - connectSrc: Control where XHR/fetch/WebSocket connections can be made; restrict to same-origin and HTTPS APIs.
                // - fontSrc: Allow web fonts from same-origin, HTTPS, and data URIs.
                // - objectSrc: Disallow plugins such as <object>, <embed>, <applet> by setting to 'none'.
                // - frameAncestors: Restrict who can embed this site in frames/iframes; 'self' prevents clickjacking from other origins.
                directives: {
                    defaultSrc: [ "'self'" ],
                    // Alpine.js default build evaluates expressions using Function; this needs 'unsafe-eval'.
                    // If you switch to @alpinejs/csp build, you can remove 'unsafe-eval' here.
                    scriptSrc: [ "'self'", "https:", "'unsafe-eval'" ],
                    styleSrc: [ "'self'", "https:", "'unsafe-inline'" ],
                    imgSrc: [ "'self'", "data:", "https:" ],
                    // htmx may use WebSockets (hx-ws). Allow ws/wss for dev/prod respectively.
                    connectSrc: [ "'self'", "https:", "ws:", "wss:" ],
                    fontSrc: [ "'self'", "https:", "data:" ],
                    objectSrc: [ "'none'" ],
                    frameAncestors: [ "'self'" ]
                }
            }
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
            cookie: this.#webConfig.cookies.setup
            // For production deployments, consider configuring a persistent session store (e.g., Redis) here.
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
            callbackUri: this.#webConfig.oauth2.google.callbackUrl,
            cookie: this.#webConfig.cookies.setup,
            pkce: "S256"
            // Optionally, you can implement generateStateFunction/checkStateFunction for extra CSRF safety in the OAuth flow.
        } );
    }

}

module.exports = TiWebServer;