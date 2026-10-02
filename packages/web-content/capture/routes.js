/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * The capture endpoints: a public POST for the form, and admin-gated reporting.
 *
 * The form uses POST-Redirect-GET. A refresh after submitting must not resubmit, and the outcome has to survive
 * without JavaScript, so the handler redirects back to the page the form is on with `?capture=<status>`; the capture
 * section renders the matching status block.
 *
 * THE RETURN PATH IS VALIDATED AGAINST THE CONTENT INDEX. `returnTo` arrives in the request body and is therefore
 * attacker-controlled: redirecting to it unchecked is an open redirect, which is exactly the primitive a phishing
 * link wants -- a real link to a real site that lands somewhere else. Only a path that resolves to a record is
 * honoured; anything else falls back to "/".
 *
 * CSRF is enforced by the framework's global middleware, so the form must carry the token (render/editorial/forms.js
 * emits it). Nothing here needs to re-check it.
 *
 * A CSRF token does not stop a script, which loads the page and posts back what it was given. With Cloudflare Turnstile
 * configured (CA-352), each submission's token is verified with Cloudflare before anything is stored, and a failed or
 * unverifiable check is refused like any other failed capture.
 */

const logger = require( "@ti-engine/core/logger" );
const { summarise, toCsv } = require( "#capture-admin" );
const { resolveTurnstile, verifyTurnstileToken, TURNSTILE_RESPONSE_FIELD } = require( "#capture-turnstile" );

const CAPTURE_PATH = "/capture";
const ADMIN_BASE = "/admin/capture";

// Matches the framework's own admin role name, so a session it considers an administrator is one here too.
const ADMIN_ROLE = "admin";

/**
 * The default guard for the capture admin routes.
 *
 * These endpoints list, export and erase every captured email address, so they FAIL CLOSED: a request without an
 * authenticated session holding the admin role is refused. The framework's `authorization` module is not exported
 * from its package, so the check is reimplemented here against the same session shape and the same role name rather
 * than reaching into another package's internals.
 *
 * @param {Object} request
 * @param {Object} response
 * @param {Function} next
 */
function defaultRequireAdmin( request, response, next ) {
    const user = ( request && request.session ) ? request.session.user : null;
    if ( !user ) {
        response.status( 401 ).send( { error: "authentication required" } );
        return;
    }
    const roles = Array.isArray( user.roles ) ? user.roles : [];
    if ( roles.indexOf( ADMIN_ROLE ) === -1 ) {
        response.status( 403 ).send( { error: "administrator role required" } );
        return;
    }
    next();
}

/**
 * Resolves the post-submit redirect target, refusing anything that is not a known content path.
 *
 * @param {string} returnTo
 * @param {Object} repository
 * @returns {string}  A safe same-site path.
 */
function safeReturnPath( returnTo, repository ) {
    const candidate = String( returnTo || "" );
    // Reject absolute URLs and protocol-relative paths outright; only a rooted, single-slash path may be considered.
    if ( candidate.indexOf( "/" ) !== 0 || candidate.indexOf( "//" ) === 0 ) {
        return "/";
    }
    const path = candidate.split( "?" )[ 0 ].split( "#" )[ 0 ];
    if ( repository && typeof repository.resolve === "function" ) {
        const result = repository.resolve( path, { authenticated: false, roles: [] } );
        if ( result.outcome === "visible" || result.outcome === "gated" ) {
            return path;
        }
    }
    return "/";
}

/**
 * Whether a submission passed its challenge. With Turnstile off it always has, as before; misconfigured, it never has
 * (see {@link resolveTurnstile}).
 *
 * @method
 * @param {{ mode: string, secret?: string }} challenge As {@link resolveTurnstile} decided it.
 * @param {Object} body The submitted form.
 * @param {{ fetch?: Function, timeoutMs?: number }} [verification]
 * @returns {Promise<{ ok: boolean, codes: string[] }>}
 * @private
 */
function checkChallenge( challenge, body, verification ) {
    if ( challenge.mode === "off" ) {
        return Promise.resolve( { ok: true, codes: [] } );
    }
    if ( challenge.mode !== "on" ) {
        return Promise.resolve( { ok: false, codes: [ "misconfigured" ] } );
    }
    const opts = verification || {};
    return verifyTurnstileToken( body[ TURNSTILE_RESPONSE_FIELD ], { secret: challenge.secret, fetch: opts.fetch, timeoutMs: opts.timeoutMs } );
}

/**
 * The public capture endpoint.
 * <br/>
 * With `turnstile` configured, the submission's challenge is verified first, and a submission that fails it is never
 * handed to the store. The refusal redirects like any failed capture (`?capture=error`), and the log names Cloudflare's
 * reason.
 *
 * @param {Object} store
 * @param {Object} repository
 * @param {{ turnstile?: { siteKey?: string, secret?: string, fetch?: Function, timeoutMs?: number } }} [options]
 * @returns {(request: Object, response: Object) => void}
 */
function captureHandler( store, repository, options ) {
    const turnstile = ( options && options.turnstile ) || {};
    const challenge = resolveTurnstile( turnstile );
    return function ( request, response ) {
        const body = request.body || {};
        const target = safeReturnPath( body.returnTo, repository );
        // Deliberately never reads request.ip: there is no IP field to store, so there is none to leak or erase.
        checkChallenge( challenge, body, turnstile ).then( ( verdict ) => {
            if ( verdict.ok !== true ) {
                logger.log( `Refused a capture: its Turnstile challenge did not verify (${ verdict.codes.join( ", " ) }).`, logger.logSeverity.WARNING );
                response.redirect( 303, target + "?capture=error" );
                return undefined;
            }
            return store.submit( {
                email: body.email,
                purpose: body.purpose,
                edition: body.edition,
                source: body.source,
                locale: body.locale,
                consent: body.consent
            } ).then( ( result ) => {
                response.redirect( 303, target + "?capture=" + encodeURIComponent( result.status ) );
            } );
        } ).catch( () => {
            response.redirect( 303, target + "?capture=error" );
        } );
    };
}

/**
 * Registers the capture routes: a public POST for the form, and the admin reporting endpoints behind a guard.
 *
 * `requireAdmin` overrides the guard for a consumer with its own role model. Omitting it selects
 * {@link defaultRequireAdmin}, never "no guard" -- these endpoints expose every stored address, so a forgotten
 * option must fail closed.
 *
 * `turnstile` takes the site key and the secret together (CA-352). With one and not the other, every submission is
 * refused and the cause is logged here, once, at ERROR. The site keeps serving: a missing secret is a reason to stop
 * accepting sign-ups unchecked, not a reason to take the site down.
 *
 * @param {Object} server  A TiWebServer instance (>= 1.17.0).
 * @param {{ store: Object, repository?: Object, requireAdmin?: Function, turnstile?: { siteKey?: string, secret?: string } }} options
 * @returns {Object} The server, for chaining.
 */
function mountCaptureRoutes( server, options ) {
    const opts = options || {};
    const challenge = resolveTurnstile( opts.turnstile );
    if ( challenge.mode === "misconfigured" ) {
        logger.log( `Capture is refusing every submission: ${ challenge.problem }.`, logger.logSeverity.ERROR );
    }
    const store = opts.store;
    if ( !store ) {
        // Loudly, at boot. Mounting nothing leaves the form POSTing into the 404 handler, so the misconfiguration
        // surfaces weeks later as "the newsletter box stopped working" with no signal pointing back to here.
        throw new Error( "mountCaptureRoutes requires a store; refusing to mount the capture endpoints without one." );
    }
    // Never unguarded: an absent guard means the built-in one, not none. These endpoints expose every stored
    // address, so the failure mode of a forgotten option must be "refused", not "public".
    const guard = ( typeof opts.requireAdmin === "function" ) ? opts.requireAdmin : defaultRequireAdmin;
    const admin = ( handler ) => [ guard, handler ];

    server.registerRoute( "post", CAPTURE_PATH, captureHandler( store, opts.repository, { turnstile: opts.turnstile } ) );

    server.registerRoute( "get", ADMIN_BASE, ...admin( ( request, response ) => {
        store.list().then( ( records ) => {
            response.set( "Cache-Control", "private, no-store" );
            response.status( 200 ).send( Object.assign( { records: records }, summarise( records ) ) );
        } ).catch( () => response.status( 500 ).send( { error: "capture list failed" } ) );
    } ) );

    server.registerRoute( "get", ADMIN_BASE + "/export.csv", ...admin( ( request, response ) => {
        store.list().then( ( records ) => {
            response.set( "Cache-Control", "private, no-store" );
            response.set( "Content-Disposition", "attachment; filename=\"capture-export.csv\"" );
            response.status( 200 ).type( "text/csv" ).send( toCsv( records ) );
        } ).catch( () => response.status( 500 ).send( { error: "capture export failed" } ) );
    } ) );

    server.registerRoute( "post", ADMIN_BASE + "/erase", ...admin( ( request, response ) => {
        const email = ( request.body || {} ).email;
        store.eraseByEmail( email ).then( ( removed ) => {
            response.set( "Cache-Control", "private, no-store" );
            response.status( 200 ).send( { erased: removed } );
        } ).catch( () => response.status( 500 ).send( { error: "capture erasure failed" } ) );
    } ) );

    server.registerRoute( "post", ADMIN_BASE + "/delete", ...admin( ( request, response ) => {
        const id = ( request.body || {} ).id;
        store.delete( id ).then( ( removed ) => {
            response.set( "Cache-Control", "private, no-store" );
            response.status( removed ? 200 : 404 ).send( { deleted: removed } );
        } ).catch( () => response.status( 500 ).send( { error: "capture delete failed" } ) );
    } ) );

    return server;
}

module.exports = {
    mountCaptureRoutes: mountCaptureRoutes,
    defaultRequireAdmin: defaultRequireAdmin,
    captureHandler: captureHandler,
    safeReturnPath: safeReturnPath,
    CAPTURE_PATH: CAPTURE_PATH,
    ADMIN_BASE: ADMIN_BASE
};
