/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const URL = require( "node:url" ).URL;

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
            response.status( 503 ).send( {
                isSuccessful: false
            } );
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
            response.status( 403 ).send( {
                isSuccessful: false
            } );
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
        const username = String( ( request.body && request.body.username ) || "" ).trim();
        const password = String( ( request.body && request.body.password ) || "" );

        if ( instance.localAuthentication( username, password ) ) {
            request.session.user = { id: `local:${ username }`, name: username };
            response.redirect( "/" );
        } else {
            response.status( 401 ).send( {
                isSuccessful: false
            } );
        }
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
            response.status( 200 ).send( { isSuccessful: true, user: request.session.user } );
        } else {
            response.status( 401 ).send( { isSuccessful: false } );
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
                response.status( 404 ).end();
            } else {
                const location = new URL( request.url, "https://" + request.host );
                response.set( "Cache-Control", "no-store" );
                response.redirect( 308, location );
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
            exception.httpCode = 404;
            next( exception );
        } else {
            request.setTimeout( instance.serviceConfig.api.requestTimeout );
            instance.callService( serviceAddress, request.body || {}, {
                authToken: request.sessionID,
            } ).then( ( result ) => {
                response.status( result.isSuccessful ? 200 : ( ( result.exception && result.exception.httpCode ) ? result.exception.httpCode : 400 ) ).send( result );
            } ).catch( ( error ) => {
                next( error );
            } );
        }
    };
};

/**
 * Used to intercept and handle all requests to invalid URLs.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.invalidRouteHandler = () => {
    return ( request, response, next ) => {
        logger.log( `Received request to an invalid route: "${ request.originalUrl }"`, logger.logSeverity.ERROR, exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI ) );
        response.status( 404 ).send( {
            isSuccessful: false
        } );
    };
};

/**
 * Express middleware for handling errors in most situations.
 *
 * @method
 * @returns {ExpressErrorHandler}
 * @public
 */
module.exports.defaultErrorHandler = () => {
    return ( error, request, response, next ) => {
        let exception = exceptions.raise( error );
        logger.log( "Received request caused an exception.", logger.logSeverity.ERROR, exception );
        response.status( exception.httpCode || 500 ).send( {
            isSuccessful: false,
            exception: exception.asJSON( false )
        } );
    };
};