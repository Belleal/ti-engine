/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * @typedef {Object} EmployeeDirectoryRecord
 * @property {string} employeeID
 * @property {string} employmentStatus
 */

/**
 * @typedef {Object} IdentityFacts
 * @property {string} [email] - The email the user authenticated with.
 * @property {string} [testUserCookie] - Raw value of the dev `ti-test-user` cookie.
 * @property {boolean} [testUserEnabled] - Whether the dev cookie may be honored at all.
 * @property {boolean} [isAdmin] - Whether the identity is on the deployment's admin allowlist.
 * @property {function(string): (EmployeeDirectoryRecord|{ambiguous: boolean}|null)} lookupByEmail
 * @property {function(string): boolean} employeeExists
 */

/**
 * @typedef {Object} IdentityOutcome
 * @property {string|null} employeeID
 * @property {number[]|null} overrideRoles
 * @property {boolean} adminOnly
 * @property {string|null} reason
 */

// The employment statuses permitted to sign in. Anything else — including an unrecognized value — is refused, so a
// future status added to the employee schema fails closed until it is deliberately listed here.
const LOGIN_PERMITTED_STATUSES = Object.freeze( [ "active", "on-leave" ] );

const REFUSAL_REASON = Object.freeze( {
    NO_EMAIL: "no-email",
    NO_RECORD: "no-record",
    TERMINATED: "terminated",
    AMBIGUOUS_EMAIL: "ambiguous-email"
} );

/**
 * Pure resolver mapping an authenticated identity to the acting employee. Performs no I/O — the caller injects the
 * directory lookups (mirrors the {@link RoleResolver} and {@link TaskResolver} pattern), keeping every rule
 * unit-testable with plain objects. Knows nothing about sessions beyond {@link IdentityResolver#applyIdentity}.
 *
 * @class IdentityResolver
 * @singleton
 * @public
 */
class IdentityResolver {

    static #instance = null;

    /**
     * @constructor
     * @returns {IdentityResolver}
     */
    constructor() {
        if ( !IdentityResolver.#instance ) {
            IdentityResolver.#instance = this;
        }
        return IdentityResolver.#instance;
    }

    /* Public interface */

    /**
     * The four reasons a sign-in can be refused.
     *
     * @property
     * @returns {Object}
     * @public
     */
    get REFUSAL_REASON() {
        return REFUSAL_REASON;
    }

    /**
     * Parses the dev `ti-test-user` cookie. Only values that are already finite JS numbers survive the roles list —
     * a string, `null`, a boolean, or an object is dropped rather than coerced, so the cookie can never inject the
     * string `admin` role (and `null` can't slip through as `0`). Pure.
     *
     * @method
     * @param {string} [raw]
     * @returns {{employeeID: string, roles: number[]}|null}
     * @public
     */
    parseTestUserCookie( raw ) {
        if ( !raw ) {
            return null;
        }
        try {
            const parsed = JSON.parse( decodeURIComponent( raw ) );
            if ( parsed && parsed.employeeID ) {
                return {
                    employeeID: String( parsed.employeeID ),
                    roles: Array.isArray( parsed.roles ) ? parsed.roles.filter( ( role ) => typeof role === "number" && Number.isFinite( role ) ) : []
                };
            }
        } catch {
            // A malformed cookie is treated as absent.
        }
        return null;
    }

    /**
     * Decides which employee an authenticated identity acts as. Precedence: the dev cookie (only when explicitly
     * enabled), then the email identity, then the admin exception, then refusal. Pure.
     *
     * @method
     * @param {IdentityFacts} facts
     * @returns {IdentityOutcome}
     * @public
     */
    resolve( facts ) {
        const context = facts || {};
        const lookupByEmail = context.lookupByEmail || ( () => null );
        const employeeExists = context.employeeExists || ( () => false );

        // 1. The dev test-user cookie, honored only behind the explicit flag. Identity is overridden wholesale, so the
        //    only check is that the employee exists — employment status is deliberately not enforced here, keeping a
        //    terminated employee testable locally.
        if ( context.testUserEnabled === true ) {
            const selection = this.parseTestUserCookie( context.testUserCookie );
            if ( selection ) {
                return employeeExists( selection.employeeID )
                    ? this.#admit( selection.employeeID, selection.roles.length > 0 ? selection.roles : null )
                    : this.#refuse( REFUSAL_REASON.NO_RECORD, context.isAdmin === true );
            }
        }

        // 2. The authenticated email.
        const email = String( context.email == null ? "" : context.email ).trim().toLowerCase();
        if ( !email ) {
            return this.#refuse( REFUSAL_REASON.NO_EMAIL, context.isAdmin === true );
        }

        const record = lookupByEmail( email );
        if ( !record ) {
            return this.#refuse( REFUSAL_REASON.NO_RECORD, context.isAdmin === true );
        }
        if ( record.ambiguous === true ) {
            return this.#refuse( REFUSAL_REASON.AMBIGUOUS_EMAIL, context.isAdmin === true );
        }
        if ( !LOGIN_PERMITTED_STATUSES.includes( record.employmentStatus ) ) {
            return this.#refuse( REFUSAL_REASON.TERMINATED, context.isAdmin === true );
        }

        return this.#admit( record.employeeID, null );
    }

    /**
     * Applies a resolved outcome to the session, or throws when the outcome is a refusal. Throwing is the framework's
     * documented way for an application to refuse a login (see `TiWebServer#augmentSession`): the session is destroyed
     * and the browser is redirected to the login page carrying the error code.
     *
     * @method
     * @param {Object} session
     * @param {IdentityOutcome} outcome
     * @param {function(string): number[]} resolveRoles
     * @returns {Object} The session, for chaining.
     * @public
     */
    applyIdentity( session, outcome, resolveRoles ) {
        if ( outcome.reason ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { reason: outcome.reason }, exceptions.httpCode.C_401 );
        }

        if ( outcome.adminOnly === true ) {
            // An admin with no employee record has no appraisal identity: no employeeID and no application roles. The
            // framework's `applyAdminRole` adds the string `admin` role immediately after this returns.
            session.user.employeeID = null;
            session.user.roles = [];
            return session;
        }

        session.user.employeeID = outcome.employeeID;
        session.user.roles = outcome.overrideRoles || resolveRoles( outcome.employeeID );
        return session;
    }

    /* Private interface */

    /**
     * @method
     * @param {string} employeeID
     * @param {number[]|null} overrideRoles
     * @returns {IdentityOutcome}
     * @private
     */
    #admit( employeeID, overrideRoles ) {
        return { employeeID: employeeID, overrideRoles: overrideRoles, adminOnly: false, reason: null };
    }

    /**
     * Turns a refusal into the admin exception when the identity is on the allowlist. The exception covers every
     * reason, not only a missing record: the recovery path it protects is worth least exactly when the employee data
     * is in a bad state.
     *
     * @method
     * @param {string} reason
     * @param {boolean} isAdmin
     * @returns {IdentityOutcome}
     * @private
     */
    #refuse( reason, isAdmin ) {
        if ( isAdmin === true ) {
            return { employeeID: null, overrideRoles: null, adminOnly: true, reason: null };
        }
        return { employeeID: null, overrideRoles: null, adminOnly: false, reason: reason };
    }

}

const instance = new IdentityResolver();
module.exports.instance = Object.freeze( instance );
