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

/**
 * Framework-level authorization helpers. Provides the privileged `admin` role used to gate configuration-editing
 * (and other administrative) routes, plus Express guards. The `admin` role is sourced from a deployment allowlist
 * (`auth.admins` in the web-server config) and applied to the session *after* the application's `augmentSession`
 * hook runs, so it is additive and cannot be clobbered by an app's own (domain) role assignment.
 *
 * @module authorization
 */

const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * The privileged role required to administer configuration. A string value so it never collides with an
 * application's own role codes (e.g. competence uses numeric role codes).
 *
 * @type {string}
 */
const ADMIN_ROLE = "admin";

/**
 * @param {*} value
 * @returns {string} Trimmed, lower-cased string form (so email/username matching is case-insensitive).
 */
function normalizeIdentity( value ) {
    return String( value == null ? "" : value ).trim().toLowerCase();
}

/**
 * Returns `true` if the user matches any entry in the admin allowlist. An entry may match the user's `userID`,
 * `username`, or `email` (case-insensitive).
 *
 * @param {Object} user A session user (`{ userID, username, email, roles, ... }`).
 * @param {string[]} admins The configured allowlist of admin identifiers.
 * @returns {boolean}
 */
function isAdminIdentity( user, admins ) {
    if ( !user || !Array.isArray( admins ) || admins.length === 0 ) {
        return false;
    }
    const candidates = new Set( [ user.userID, user.username, user.email ].map( normalizeIdentity ).filter( ( value ) => value.length > 0 ) );
    return admins.some( ( entry ) => candidates.has( normalizeIdentity( entry ) ) );
}

/**
 * Adds the `admin` role to the session user (additively, no duplicates) when the user is in the allowlist.
 * Safe to call with an empty/missing allowlist or session — it is then a no-op. Returns the session for chaining.
 *
 * @param {Object} session
 * @param {string[]} [admins]
 * @returns {Object} The (possibly modified) session.
 */
function applyAdminRole( session, admins ) {
    if ( session && session.user && isAdminIdentity( session.user, admins ) ) {
        const roles = Array.isArray( session.user.roles ) ? session.user.roles.slice() : [];
        if ( !roles.includes( ADMIN_ROLE ) ) {
            roles.push( ADMIN_ROLE );
        }
        session.user.roles = roles;
    }
    return session;
}

/**
 * @param {Object} session
 * @param {Array<string|number>} roles
 * @returns {boolean} `true` if the session user holds any of the given roles.
 */
function hasAnyRole( session, roles ) {
    const userRoles = ( session && session.user && Array.isArray( session.user.roles ) ) ? session.user.roles : [];
    return roles.some( ( role ) => userRoles.includes( role ) );
}

/**
 * Pure access decision for a resource (e.g. an HTML fragment) that declares a set of required roles. A resource with
 * no required roles (`null` / `undefined` / empty) is public — any (authenticated) user may access it; otherwise the
 * user must hold at least one of the required roles. Roles are treated opaquely, so this works equally for numeric
 * application role codes and the string `admin` role — there is no implicit hierarchy (an `admin`-gated resource is
 * reachable only by holders of the `admin` role, never by a high numeric role). Backs {@link TiWebAppManager#verifyAccess}.
 *
 * @param {Array<string|number>} [requiredRoles] The roles permitted to access the resource; empty/absent = public.
 * @param {Array<string|number>} [userRoles] The roles held by the current session user.
 * @returns {boolean}
 */
function isAccessAllowed( requiredRoles, userRoles ) {
    if ( requiredRoles === null || requiredRoles === undefined ) {
        return true;
    }
    if ( !Array.isArray( requiredRoles ) ) {
        return false;
    }
    if ( requiredRoles.length === 0 ) {
        return true;
    }
    const roles = Array.isArray( userRoles ) ? userRoles : [];
    return requiredRoles.some( ( role ) => roles.includes( role ) );
}

/**
 * Express middleware factory that admits a request only if its session user holds at least one of the given roles.
 * Responds `401` when unauthenticated (no session user) and `403` when authenticated but lacking the role.
 *
 * @param {...(string|number)} roles
 * @returns {(request: Object, response: Object, next: Function) => void}
 */
function requireRole( ...roles ) {
    return ( request, response, next ) => {
        const user = request && request.session && request.session.user;
        if ( !user ) {
            response.status( exceptions.httpCode.C_401 ).end();
            return;
        }
        if ( !hasAnyRole( request.session, roles ) ) {
            response.status( exceptions.httpCode.C_403 ).end();
            return;
        }
        next();
    };
}

/**
 * Express middleware that admits only `admin`-role users.
 *
 * @type {(request: Object, response: Object, next: Function) => void}
 */
const requireAdmin = requireRole( ADMIN_ROLE );

module.exports = { ADMIN_ROLE, isAdminIdentity, applyAdminRole, hasAnyRole, isAccessAllowed, requireRole, requireAdmin };
