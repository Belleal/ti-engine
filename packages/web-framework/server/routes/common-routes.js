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
            request.server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow( request ).then( ( result ) => {
                const idToken = result.id_token || ( result.token && result.token.id_token );
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
                request.session.auth = { provider: "google", token: result.token };

                const redirectTo = request.session.redirectTo || "/dashboard";
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

const pageHandler = ( request, reply ) => {
    return new Promise( ( resolve, reject ) => {
        reply.type( "text/html" )
        return reply.sendFile( "dashboard.html", { maxAge: 0, immutable: false } );
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
    // TODO: all of this has to be reviewed and refactored.

    // Inline handlers to capture options (webConfig) in closure:
    const loginGetHandler = ( request, reply ) => {
        const localEnabled = options.webConfig && options.webConfig.localAuth && options.webConfig.localAuth.enabled;
        const csrfToken = typeof reply.generateCsrf === "function" ? reply.generateCsrf() : "";
        const googleLoginUrl = "/login/google";
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in</title>
  <meta name="csrf-token" content="${ csrfToken }" />
  ${ localEnabled ? '<script src="/public/login.js" defer></script>' : '' }
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; }
    .box { max-width: 420px; margin: 2rem auto; border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; }
    .row { margin-bottom: 0.75rem; }
    label { display:block; margin-bottom: 0.25rem; font-weight: 600; }
    input { width:100%; padding:0.5rem; border:1px solid #ccc; border-radius:4px; }
    button { padding:0.5rem 0.75rem; border:1px solid #2c7be5; background:#2c7be5; color:#fff; border-radius:4px; cursor:pointer; }
    button.link { background:#fff; color:#2c7be5; border-color:#2c7be5; margin-left: 0.5rem; }
    .error { color:#b00020; display:none; margin-bottom:0.5rem; }
    .sep { text-align:center; color:#888; margin: 0.75rem 0; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Sign in</h2>
    ${ localEnabled ? `
    <div id="error" class="error"></div>
    <form id="loginForm">
      <div class="row">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" />
      </div>
      <div class="row">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" />
      </div>
      <div class="row">
        <button type="submit">Sign in</button>
        <a class="link" href='${ googleLoginUrl }'>Sign in with Google</a>
      </div>
    </form>
    ` : `
    <div class="row">
      <a href='${ googleLoginUrl }'>Sign in with Google</a>
    </div>
    ` }
    <div class="sep">&nbsp;</div>
  </div>
</body>
</html>`;
        reply.header( "x-csrf-token", csrfToken );
        reply.type( "text/html" );
        return reply.send( html );
    };

    const loginPostHandler = ( request, reply ) => {
        return new Promise( ( resolve ) => {
            try {
                const body = request.body || {};
                const username = String( body.username || "" );
                const password = String( body.password || "" );
                const cfg = ( options.webConfig && options.webConfig.localAuth ) ? options.webConfig.localAuth : {};
                if ( !cfg.enabled || !cfg.username ) {
                    reply.code( 400 ).send( { error: "local_auth_disabled" } );
                    return resolve();
                }
                const userOk = username === cfg.username;
                let passOk = false;
                if ( cfg.password ) {
                    passOk = password === cfg.password;
                }
                if ( !passOk && cfg.passwordSha256 ) {
                    try {
                        const { createHash } = require( "crypto" );
                        const hashed = createHash( "sha256" ).update( password, "utf8" ).digest( "hex" ).toLowerCase();
                        passOk = hashed === String( cfg.passwordSha256 ).toLowerCase();
                    } catch ( e ) {
                    }
                }
                if ( !userOk || !passOk ) {
                    reply.code( 401 ).send( { error: "invalid_credentials" } );
                    return resolve();
                }
                request.session.user = { id: "local:" + cfg.username, name: cfg.username };
                request.session.auth = { provider: "local" };
                const redirectTo = request.session.redirectTo || "/dashboard";
                delete request.session.redirectTo;
                reply.code( 200 ).send( { ok: true, redirectTo } );
                resolve();
            } catch ( err ) {
                reply.code( 500 ).send( { error: "login_failed" } );
                resolve();
            }
        } );
    };

    const rootGetHandler = ( request, reply ) => {
        const fs = require( "fs" );
        const path = require( "path" );
        const pubPath = ( options.webConfig && options.webConfig.publicPath ) ? options.webConfig.publicPath : "packages/web-framework/bin/public";
        const filePath = path.join( process.cwd(), pubPath, "index.html" );
        fs.readFile( filePath, "utf8", ( err, html ) => {
            if ( err ) {
                return reply.code( 500 ).type( "text/plain" ).send( "Failed to load page." );
            }
            const nonce = request.cspNonce || "";
            const out = String( html ).replace( /%%CSP_NONCE%%/g, nonce );
            reply.type( "text/html; charset=utf-8" ).send( out );
        } );
    };

    fastify.get( "/", rootGetHandler );
    fastify.get( "/favicon.ico", faviconHandler );
    fastify.get( "/dashboard", pageHandler );

    fastify.get( "/login", loginGetHandler );
    fastify.post( "/login", { preHandler: fastify.csrfProtection ? fastify.csrfProtection : undefined }, loginPostHandler );
    fastify.post( "/logout", { preHandler: fastify.csrfProtection ? fastify.csrfProtection : undefined }, logoutHandler );
    fastify.get( "/me", getUserHandler );
    fastify.get( options.webConfig.oauth2.google.callbackUrl, oauth2GoogleHandler );
};