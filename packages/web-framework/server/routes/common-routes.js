/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @typedef {import('fastify').FastifyInstance} FastifyInstance
 * @typedef {import('fastify').FastifyPluginOptions} FastifyPluginOptions
 * @typedef {import('fastify').FastifyRequest} FastifyRequest
 * @typedef {import('fastify').FastifyReply} FastifyReply
 */

/**
 * Decodes a JWT (no verification). Returns payload object or null on error.
 * @param {string} jwt
 */
const decodeJwtPayload = ( jwt ) => {
    try {
        const parts = jwt.split( "." );
        if ( parts.length !== 3 ) return null;
        const base64 = parts[ 1 ].replace( /-/g, "+" ).replace( /_/g, "/" );
        const padded = base64.padEnd( base64.length + ( 4 - ( base64.length % 4 ) ) % 4, "=" );
        const json = Buffer.from( padded, "base64" ).toString( "utf8" );
        return JSON.parse( json );
    } catch ( e ) {
        return null;
    }
};

/**
 * Simple pre-handler to require an authenticated session.
 */
const requireAuth = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        if ( !request.session || !request.session.user ) {
            return reply.code( 401 ).send( { error: "unauthenticated" } );
        } else {
            resolve();
        }
    } );
}

/**
 * Main handler for the root route.
 *
 * @method
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise}
 * @public
 */
const rootHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        reply.type( "text/html" )
        return reply.sendFile( "index.html", { maxAge: 0, immutable: false } );
    } );
};

/**
 * Handler for the favicon route.
 *
 * @method
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @returns {Promise}
 * @public
 */
const faviconHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        return reply.sendFile( "favicon.ico", { maxAge: "1d", immutable: false } );
    } );
};

const loginHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        return reply.redirect( "/login/google" );
    } );
};

const logoutHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        const done = () => {
            try {
                reply.clearCookie( "sid" );
            } catch ( e ) {
            }
            reply.code( 204 ).send();
            resolve();
        };
        if ( typeof request.destroySession === "function" ) {
            request.destroySession( done );
        } else {
            if ( request.session ) request.session = null;
            done();
        }
    } );
};

const getUserHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        if ( request.session && request.session.user ) {
            return { user: request.session.user };
        }
        return reply.code( 401 ).send( { error: "unauthenticated" } );
    } );
};

const oauth2GoogleHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        try {
            request.server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow( request ).then( ( token ) => {
                const idToken = token.id_token || ( token.token && token.token.id_token );
                let profile = null;
                if ( idToken ) {
                    profile = decodeJwtPayload( idToken );
                }

                // Persist user and auth details in session:
                request.session.user = profile ? {
                    id: profile.sub,
                    email: profile.email,
                    name: profile.name || [ profile.given_name, profile.family_name ].filter( Boolean ).join( " " ),
                    picture: profile.picture,
                    email_verified: profile.email_verified
                } : {};
                request.session.auth = { provider: "google", token };

                const redirectTo = request.session.redirectTo || "/";
                delete request.session.redirectTo;
                return reply.redirect( redirectTo );
            } ).catch( ( error ) => {
                return reply.code( 500 ).send( { error: "OAuth2 callback failed" } );
            } );
        } catch ( error ) {
            return reply.code( 500 ).send( { error: "OAuth2 callback failed" } );
        }
    } );
};

/**
 * Registers common routes for the web server.
 *
 * @method
 * @param {FastifyInstance} fastify
 * @param {FastifyPluginOptions} [options]
 * @public
 */
module.exports = ( fastify, options ) => {
    fastify.get( "/", rootHandler );
    fastify.get( "/favicon.ico", faviconHandler );

    fastify.get( "/login", loginHandler );
    fastify.post( "/logout", { preHandler: fastify.csrfProtection ? fastify.csrfProtection : undefined }, logoutHandler );
    fastify.get( "/me", getUserHandler );
    fastify.get( options.webConfig.oauth2.google.callbackUrl, oauth2GoogleHandler );
};