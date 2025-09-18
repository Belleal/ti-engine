/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { randomBytes } = require( "node:crypto" );
const URL = require( "node:url" ).URL;
const helmet = require( "helmet" );
const authMethod = require( "#auth-manager" ).authMethod;

/**
 * Express middleware callback.
 *
 * @callback ExpressHandler
 * @param {*} request
 * @param {*} response
 * @param {function( Error | null )} next
 * @returns {void}
 */

/**
 * Express middleware callback with an error.
 *
 * @callback ExpressErrorHandler
 * @param {Error} error
 * @param {*} request
 * @param {*} response
 * @param {function( Error | null )} next
 * @returns {void}
 */

/**
 * Handler for requests that are received while the web server is shutting down.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.onShutDownHandler = ( instance ) => {
    return ( request, response, next ) => {
        if ( !instance.isShuttingDown ) {
            next();
        } else {
            response.set( "Connection", "close" );
            response.status( exceptions.httpCode.C_503 ).end();
        }
    };
};

/**
 * Handler that verifies if the requested resource requires authentication or is freely accessible.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.resourceProtectionHandler = ( instance ) => {
    return ( request, response, next ) => {
        if ( instance.isUnprotectedRoute( request.url ) || instance.verifySession( request.session ) ) {
            next();
        } else {
            response.status( exceptions.httpCode.C_403 ).end();
        }
    };
};

/**
 * Handler for server-side authentication.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.authenticationHandler = ( instance ) => {
    return ( request, response, next ) => {
        const method = request.params.method;
        if ( method === authMethod.LOCAL ) {
            const username = String( ( request.body && request.body.username ) || "" ).trim();
            const password = String( ( request.body && request.body.password ) || "" );
            instance.authenticate( authMethod.LOCAL, { username: username, password: password } ).then( ( result ) => {
                if ( result === true ) {
                    request.session.regenerate( ( error ) => {
                        if ( error ) {
                            next( error );
                        } else {
                            request.session.user = { id: `local:${ username }`, name: username };
                            request.session.save( ( error ) => {
                                if ( error ) {
                                    next( error );
                                } else {
                                    response.redirect( exceptions.httpCode.C_303, "/app/enter" );
                                }
                            } );
                        }
                    } );
                } else {
                    response.status( exceptions.httpCode.C_401 ).end();
                }
            } ).catch( ( error ) => {
                next( error );
            } );
        } else if ( method === authMethod.OPENID_GOOGLE ) {
            const host = request.get( "host" );
            const scheme = request.secure || ( String( request.get( "x-forwarded-proto" ) ).toLowerCase() === "https" ) ? "https" : "http";
            instance.authenticate( authMethod.OPENID_GOOGLE, { baseUrl: `${ scheme }://${ host }` } ).then( ( redirectTo ) => {
                response.redirect( redirectTo );
            } ).catch( ( error ) => {
                next( error );
            } );
        } else {
            response.status( exceptions.httpCode.C_401 ).end();
        }
    };
};

/**
 * Used to handle the callback from the Google OpenID authentication.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.googleCallbackHandler = () => {
    return ( request, response, next ) => {
        request.session.user = { id: `google:${ request.query.id }`, name: request.query.name };
        request.session.save( ( error ) => {
            if ( error ) {
                next( error );
            } else {
                response.redirect( exceptions.httpCode.C_303, "/app/enter" );
            }
        } );
    };
};

/**
 * Handler for server-side logout.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.logoutHandler = () => {
    return ( request, response, next ) => {
        const done = ( error ) => {
            response.redirect( "/" );
        };
        if ( request.session ) {
            request.session.destroy( done );
        } else {
            done();
        }
    };
};

/**
 * Handler for retrieving authenticated user information.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.userInformationHandler = () => {
    return ( request, response, next ) => {
        if ( request.session && request.session.user ) {
            response.status( exceptions.httpCode.C_200 ).send( { isSuccessful: true, user: request.session.user } );
        } else {
            response.status( exceptions.httpCode.C_401 ).send( { isSuccessful: false } );
        }
    };
};

/**
 * Handler for redirecting HTTP requests to HTTPS. Also works behind proxies using X-Forwarded-Proto.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.httpRedirectHandler = ( instance ) => {
    return ( request, response, next ) => {
        const xfProto = String( request.get ? request.get( "x-forwarded-proto" ) : ( request.headers[ "x-forwarded-proto" ] || "" ) ).toLowerCase();
        const isSecure = request.secure === true || xfProto === "https";
        if ( isSecure ) {
            next();
        } else {
            if ( instance.isAllowedHost( request.hostname ) !== true ) {
                response.status( exceptions.httpCode.C_404 ).end();
            } else {
                const host = request.get ? request.get( "host" ) : request.headers.host;
                const location = new URL( request.url, "https://" + host );
                response.set( "Cache-Control", "no-store" );
                response.redirect( exceptions.httpCode.C_308, location );
            }
        }
    }
};

/**
 * Handler for processing of API service calls.
 * <br/>
 * NOTE: This will send a new {@link ServiceCall} to the microservice network handled by the ti-engine.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.serviceCallHandler = ( instance ) => {
    return ( request, response, next ) => {
        let serviceAddress = instance.getServiceAddress( request.params.version, request.params.name );
        if ( !serviceAddress ) {
            let exception = exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI );
            exception.httpCode = exceptions.httpCode.C_404;
            next( exception );
        } else {
            request.setTimeout( instance.serviceConfig.api.requestTimeout );
            instance.callService( serviceAddress, request.body || {}, {
                authToken: request.sessionID,
            } ).then( ( result ) => {
                response.status( result.isSuccessful ? exceptions.httpCode.C_200 : ( ( result.exception && result.exception.httpCode ) ? result.exception.httpCode : exceptions.httpCode.C_400 ) ).send( result );
            } ).catch( ( error ) => {
                next( error );
            } );
        }
    };
};

/**
 * Handler to intercept and handle all remaining requests to invalid URLs.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.invalidRouteHandler = () => {
    return ( request, response, next ) => {
        logger.log( `Received request to an invalid route: "${ request.originalUrl }"`, logger.logSeverity.ERROR, exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI ) );
        response.status( exceptions.httpCode.C_404 ).send( {
            isSuccessful: false
        } );
    };
};

/**
 * Handler to intercept any errors that have not been resolved by previous middleware. Should be the last in the sequence.
 *
 * @method
 * @returns {ExpressErrorHandler}
 * @public
 */
module.exports.defaultErrorHandler = () => {
    return ( error, request, response, next ) => {
        let exception = exceptions.raise( error );
        logger.log( "Received request caused an exception.", logger.logSeverity.ERROR, exception );
        response.status( exception.httpCode || exceptions.httpCode.C_500 ).send( {
            isSuccessful: false,
            exception: exception.asJSON( false )
        } );
    };
};

/**
 * Handler for generating a nonce for CSP.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.nonceGenerationHandler = () => {
    return ( request, response, next ) => {
        if ( request.method === "GET" || request.method === "HEAD" ) {
            try {
                const nonce = randomBytes( 16 ).toString( "base64" );
                request.cspNonce = nonce;
                request.nonce = request.nonce || nonce;
                response.locals = response.locals || {};
                response.locals.cspNonce = nonce;
                response.locals.nonce = response.locals.nonce || nonce;
                next();
            } catch ( error ) {
                next( error );
            }
        } else {
            next();
        }
    };
};

/**
 * Handler for setting the Content-Security-Policy header.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.cspHeaderHandler = () => {
    return ( request, response, next ) => {
        const nonce = response?.locals?.cspNonce;

        // Build script-src directive:
        const scriptSrc = [ "'strict-dynamic'", "'self'", "https:" ];
        if ( nonce ) {
            scriptSrc.push( `'nonce-${ nonce }'` );
        }

        // Build style-src-elem directive:
        const styleSrcElem = [ "'self'", "https:" ];
        if ( nonce ) {
            styleSrcElem.push( `'nonce-${ nonce }'` );
        }

        // Build directives object:
        const directives = {
            defaultSrc: [ "'self'" ],
            scriptSrc: scriptSrc,
            styleSrc: [ "'self'", "https:" ],
            styleSrcElem: styleSrcElem,
            imgSrc: [ "'self'", "data:", "https:" ],
            connectSrc: [ "'self'", "https:", "ws:", "wss:" ],
            fontSrc: [ "'self'", "https:", "data:" ],
            objectSrc: [ "'none'" ],
            frameAncestors: [ "'self'" ]
        };

        const csp = helmet.contentSecurityPolicy( {
            useDefaults: true,
            directives
        } );
        return csp( request, response, next );
    };
};

/**
 * Handler for requests that should be processed by the web application manager.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.webAppHandler = ( instance ) => {
    return ( request, response, next ) => {
        if ( request.method !== "GET" && request.method !== "HEAD" ) {
            next();
        } else {
            const resLocals = ( response && response.locals ) || {};
            const nonce = request.cspNonce || request.nonce || resLocals.cspNonce || resLocals.nonce;
            // HEAD: set headers only:
            if ( request.method === "HEAD" ) {
                response.set( "Cache-Control", "no-store" );
                response.set( "Content-Type", "text/html; charset=utf-8" );
                response.status( exceptions.httpCode.C_200 ).end();
            } else {
                // GET: load and render:
                instance.webAppManager.getHtmlFragment( request.session, instance.fullPublicPath, request.path, { nonce: nonce } ).then( ( fileData ) => {
                    response.set( "Cache-Control", "no-store" );
                    response.set( "Content-Type", "text/html; charset=utf-8" );
                    response.status( exceptions.httpCode.C_200 ).send( fileData );
                } ).catch( ( error ) => {
                    let exception = exceptions.raise( error );
                    exception.httpCode = exceptions.httpCode.C_404;
                    next( exception );
                } );
            }
        }
    };
};