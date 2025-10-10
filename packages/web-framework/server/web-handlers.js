/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { randomBytes, timingSafeEqual } = require( "node:crypto" );
const URL = require( "node:url" ).URL;
const helmet = require( "helmet" );
const authMethod = require( "#auth-manager" ).authMethod;

/** @typedef {import("express").req} ExpressRequest */
/** @typedef {import("express").res} ExpressResponse */

/**
 * Express middleware callback.
 *
 * @callback ExpressHandler
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 * @param {function( Error | null )} next
 * @returns {void}
 */

/**
 * Express middleware callback with an error.
 *
 * @callback ExpressErrorHandler
 * @param {Error} error
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 * @param {function( Error | null )} next
 * @returns {void}
 */

/**
 * Used to assemble the current URL of a request.
 *
 * @method
 * @param {ExpressRequest} request
 * @returns {string}
 * @private
 */
let getBaseUrl = ( request ) => {
    const xfProtocol = String( request.get( "x-forwarded-proto" ) || "" ).toLowerCase();
    const xfHost = request.get( "x-forwarded-host" );
    const protocol = ( request.secure || xfProtocol === "https" ) ? "https" : "http";
    const host = xfHost || request.get( "host" );
    return `${ protocol }://${ host }`;
};

/**
 * Timing-safe token comparison.
 *
 * @method
 * @param {string} first
 * @param {string} second
 * @returns {boolean}
 * @private
 */
let safeEquals = ( first, second ) => {
    try {
        const ba = Buffer.from( String( first || "" ) );
        const bb = Buffer.from( String( second || "" ) );
        return ( ba.length !== bb.length ) ? false : timingSafeEqual( ba, bb );
    } catch {
        return false;
    }
};

/**
 * Extract origin to validate. Prefer Origin, fallback to Referer origin.
 *
 * @method
 * @param {ExpressRequest} request
 * @returns {string|undefined} e.g., "https://example.com:8443"
 * @private
 */
let getRequestOrigin = ( request ) => {
    let result = undefined;
    const origin = request.get( "origin" );
    if ( origin ) {
        result = origin;
    } else {
        const referer = request.get( "referer" );
        if ( referer ) {
            try {
                const refererUrl = new URL( referer );
                result = `${ refererUrl.protocol }//${ refererUrl.host }`;
            } catch {
                // do nothing here...
            }
        }
    }
    return result;
};

/**
 * Used to regenerate the session and save it.
 *
 * @method
 * @param {ExpressRequest} request
 * @param {string} redirectTo
 * @param {function( Session ): Session} modifier
 * @returns {Promise<string>}
 * @private
 */
let regenerateAndSaveSession = ( request, redirectTo, modifier ) => {
    return new Promise( ( resolve, reject ) => {
        request.session.regenerate( ( error ) => {
            if ( error ) {
                reject( error );
            } else {
                if ( modifier && typeof modifier === "function" ) {
                    request.session = modifier( request.session );
                }
                request.session.save( ( error ) => {
                    if ( error ) {
                        reject( error );
                    } else {
                        resolve( redirectTo );
                    }
                } )
            }
        } )
    } );
};

/**
 * Check if the request is an HTMX request.
 *
 * @method
 * @param {ExpressRequest} request
 * @returns {boolean}
 * @private
 */
let isHtmxRequest = ( request ) => {
    return String( request.get( "HX-Request" ) || "" ).toLowerCase() === "true";
};

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
            const acceptsHtml = request.accepts( [ "html", "json" ] ) === "html";
            const redirectTo = "/";
            if ( isHtmxRequest( request ) ) {
                response.set( "HX-Redirect", redirectTo );
                response.status( exceptions.httpCode.C_204 ).end();
            } else if ( acceptsHtml ) {
                response.redirect( exceptions.httpCode.C_303, redirectTo );
            } else {
                response.status( exceptions.httpCode.C_401 ).send( {
                    isSuccessful: false
                } );
            }
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
            instance.authenticate( authMethod.LOCAL, { username: username, password: password } ).then( ( data ) => {
                return ( data && data.result === true ) ? regenerateAndSaveSession( request, "/app/enter", ( session ) => {
                    session.user = { id: `local:${ username }`, name: username };
                    return session;
                } ) : null;
            } ).then( ( redirectTo ) => {
                if ( redirectTo ) {
                    response.redirect( exceptions.httpCode.C_303, redirectTo );
                } else {
                    response.status( exceptions.httpCode.C_401 ).end();
                }
            } ).catch( ( error ) => {
                next( error );
            } );
        } else if ( method === authMethod.OPENID_GOOGLE || method === authMethod.OPENID_AZURE ) {
            instance.authenticate( method, { baseUrl: getBaseUrl( request ) } ).then( ( result ) => {
                return regenerateAndSaveSession( request, result.redirectTo, ( session ) => {
                    session.oidc = { codeVerifier: result.codeVerifier, state: result.state, nonce: result.nonce };
                    return session;
                } );
            } ).then( ( redirectTo ) => {
                response.redirect( exceptions.httpCode.C_303, redirectTo );
            } ).catch( ( error ) => {
                next( error );
            } );
        } else {
            next();
        }
    };
};

/**
 * Used to handle the callback from the Google OpenID authentication.
 *
 * @method
 * @param {TiWebServer} instance
 * @param {TiAuthMethod} authMethod
 * @returns {ExpressHandler}
 * @public
 */
module.exports.authorizedOAuth2CallbackHandler = ( instance, authMethod ) => {
    return ( request, response, next ) => {
        const code = request.query.code;
        const state = request.query.state;
        const oidc = request.session.oidc || {};
        if ( !code || !oidc?.codeVerifier ) {
            response.status( exceptions.httpCode.C_400 ).end();
        } else if ( oidc.state && state !== oidc.state ) {
            response.status( exceptions.httpCode.C_400 ).end();
        } else {
            instance.authorize( authMethod, new URL( request.originalUrl, getBaseUrl( request ) ), oidc ).then( ( userInfo ) => {
                return regenerateAndSaveSession( request, "/", ( session ) => {
                    session.user = { id: `oauth2:${ userInfo.sub }`, email: userInfo.email, name: userInfo.name };
                    delete session.oidc;
                    return session;
                } );
            } ).then( ( redirectTo ) => {
                response.redirect( exceptions.httpCode.C_303, redirectTo );
            } ).catch( ( error ) => {
                next( error );
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
            const isPartial = isHtmxRequest( request );
            const nonceHeader = request.get( "x-csp-nonce" ) || "";
            const nonce = isPartial ? nonceHeader : ( request.cspNonce || request.nonce || resLocals.cspNonce || resLocals.nonce );
            // HEAD: set headers only:
            if ( request.method === "HEAD" ) {
                response.set( "Cache-Control", "no-store" );
                response.set( "Content-Type", "text/html; charset=utf-8" );
                response.status( exceptions.httpCode.C_200 ).end();
            } else {
                // GET: load and render:
                instance.webAppManager.assembleHtmlView( request.session, instance.fullPublicPath, request.path, {
                    nonce: nonce,
                    isPartial: isPartial,
                    view: request.params.view
                } ).then( ( html ) => {
                    response.set( "Cache-Control", "no-store" );
                    response.set( "Content-Type", "text/html; charset=utf-8" );
                    response.status( exceptions.httpCode.C_200 ).send( html );
                } ).catch( ( error ) => {
                    let exception = exceptions.raise( error );
                    exception.httpCode = exceptions.httpCode.C_404;
                    next( exception );
                } );
            }
        }
    };
};

/**
 * Validate Origin/Referer for non-GET/HEAD/OPTIONS requests.
 * Origin must match the current request origin (protocol + host[:port]).
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.originRefererValidationHandler = () => {
    return ( request, response, next ) => {
        if ( request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS" ) {
            next();
        } else {
            const expectedOrigin = getBaseUrl( request );
            const providedOrigin = getRequestOrigin( request );
            if ( !providedOrigin || String( providedOrigin ).toLowerCase() !== String( expectedOrigin ).toLowerCase() ) {
                logger.log( `Issue identified with origin/referer mismatch. Expected '${ expectedOrigin }', received '${ providedOrigin }'.`, logger.logSeverity.WARNING );
                response.status( exceptions.httpCode.C_403 ).send( {
                    isSuccessful: false,
                    exception: exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS ).asJSON( false )
                } );
            } else {
                next();
            }
        }
    };
};

/**
 * Ensure a per-session CSRF token and expose it to the client via a non-HTTPOnly cookie (double-submit token).
 * Set only on GET/HEAD to avoid caching/set-cookie noise on API calls.
 *
 * @method
 * @param {TiWebServer} instance
 * @returns {ExpressHandler}
 * @public
 */
module.exports.csrfInitHandler = ( instance ) => {
    return ( request, response, next ) => {
        if ( request.method !== "GET" && request.method !== "HEAD" ) {
            next();
        } else {
            try {
                const session = request.session;
                if ( session ) {
                    if ( !session.csrfToken ) {
                        session.csrfToken = randomBytes( 32 ).toString( "base64url" );
                    }
                    // Expose the token via a readable cookie for front-end code (double-submit pattern):
                    const xfProto = String( request.get( "x-forwarded-proto" ) || "" ).toLowerCase();
                    const isSecure = ( request.secure === true ) || ( xfProto === "https" );
                    const cookieOptions = {
                        path: instance.serviceConfig.cookies.path,
                        sameSite: instance.serviceConfig.cookies.sameSite,
                        secure: isSecure,
                        httpOnly: false
                    };
                    if ( Number.isFinite( instance.serviceConfig.cookies.maxAge ) ) {
                        cookieOptions.maxAge = instance.serviceConfig.cookies.maxAge;
                    }
                    response.cookie( "ti-xsrf-token", session.csrfToken, cookieOptions );
                }
                next();
            } catch ( error ) {
                let exception = exceptions.raise( error );
                exception.httpCode = exceptions.httpCode.C_400;
                next( exception );
            }
        }
    };
};

/**
 * Require and validate the CSRF token on state-changing requests.
 * Accept from the header 'X-CSRF-Token' or 'X-XSRF-Token', or body/query 'csrfToken'.
 * Token must match the one in the current session set by {@link csrfInitHandler}.
 *
 * @method
 * @returns {ExpressHandler}
 * @public
 */
module.exports.csrfProtectionHandler = () => {
    return ( request, response, next ) => {
        if ( request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS" ) {
            next();
        } else {
            const expected = request.session && request.session.csrfToken;
            if ( !expected ) {
                return response.status( exceptions.httpCode.C_403 ).send( {
                    isSuccessful: false,
                    exception: exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_HEADERS ).asJSON( false )
                } );
            } else {
                const provided =
                    request.get( "x-csrf-token" ) ||
                    request.get( "x-xsrf-token" ) ||
                    ( request.body && ( request.body.csrfToken || request.body._csrf ) ) ||
                    ( request.query && ( request.query.csrfToken || request.query._csrf ) );
                if ( !safeEquals( provided, expected ) ) {
                    logger.log( "Issue identified with CSRF token validation fail.", logger.logSeverity.WARNING );
                    return response.status( exceptions.httpCode.C_403 ).send( {
                        isSuccessful: false,
                        exception: exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_HEADERS ).asJSON( false )
                    } );
                } else {
                    next();
                }
            }
        }
    };
};