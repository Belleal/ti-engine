/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebServer = require( "@ti-engine/web-framework/web-server" );
const authorization = require( "@ti-engine/web-framework/authorization" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const tools = require( "@ti-engine/core/tools" );
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const identityResolver = require( "#identity-resolver" );
const configurationLoader = require( "#configuration-loader" );
const roleResolver = require( "#role-resolver" );
const competenceFramework = require( "#competence-framework" );

/**
 * NOTE: This is still a work in progress.
 *
 * @class CompetenceWebServer
 * @extends TiWebServer
 * @public
 */
class CompetenceWebServer extends TiWebServer {

    /**
     * @constructor
     * @param {string} serviceDomainName
     * @param {TiWebServiceConfiguration} serviceConfig
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
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
        // The dev test-user cookie lets the client choose the acting employee AND inject role codes, so wherever it is
        // on, anyone who can complete sign-in is one cookie away from acting as anyone — including as a Supervisor.
        // It is off by default and every documented production install sets it to `false` explicitly, but "off by
        // default" is invisible: nothing said so where an operator would see it. Say it once, loudly, at boot, the way
        // core does for an unset message-exchange hash key. (The Cloud Run test environment turns it on deliberately;
        // there the warning is a reminder that IAP is the only thing keeping that environment private.)
        if ( tools.toBool( process.env.COMPETENCE_TEST_USER_ENABLED ) ) {
            logger.log( "COMPETENCE_TEST_USER_ENABLED is ON: the 'ti-test-user' cookie can override the acting identity and its roles, so any authenticated visitor can act as any employee. This is a development-only setting — set it to 'false' in production.", logger.logSeverity.WARNING );
        }

        return super.onStart()
            .then( () => dataManager.instance.initialize() )
            // Must run before buildOrganizationChart(): this is what replaces the exported
            // configOrganizationStructure (the shipped file-default demo tree) with this deployment's actual stored
            // tree, and buildOrganizationChart() reads that export at call time. Swap the order back and every boot
            // silently rebuilds the chart from the demo tree instead — there is no later rebuild on the boot path to
            // correct it, since the only rebuild hook (onConfigChanged) fires on an admin save, not on startup. (CA-107)
            .then( () => configurationLoader.initialize() )
            .then( () => organizationManager.instance.buildOrganizationChart() )
            .then( () => dataManager.instance.loadRoleGrants() )
            .then( () => competenceFramework.instance.backfillMissingEvaluationDeadlines() )
            .then( () => organizationManager.instance.reportUnresolvedManagers() )
            .catch( ( error ) => {
                logger.log( `Error while trying to start competence web server within instance '${ ServiceConsumer.instanceID }'!`, logger.logSeverity.ERROR, error );
                throw exceptions.raise( error );
            } );
    }

    /**
     * Used to define the unprotected routes (i.e., routes that do not require authentication).
     *
     * @method
     * @override
     * @public
     */
    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
    }

    /**
     * Used to define the web application routes.
     *
     * @method
     * @override
     * @public
     */
    defineWebApplicationRoutes() {
        super.defineWebApplicationRoutes();
    }

    /**
     * Used to augment the session with the acting employee identity and their derived roles.
     * <br/>
     * Identity comes from the email the user authenticated with, resolved against the employee directory. An identity
     * with no usable employee record is REFUSED — throwing refuses the login per the framework's documented
     * `augmentSession` contract, which destroys the session and returns the browser to the login page. The one
     * exception is an identity on the deployment's admin allowlist, which is admitted with no employeeID and no
     * application roles so the admin configuration UI stays reachable when the employee data itself is wrong.
     * <br/>
     * The dev `ti-test-user` cookie still overrides identity, but only behind the off-by-default
     * `COMPETENCE_TEST_USER_ENABLED` flag (see {@link IdentityResolver#resolve}).
     *
     * @method
     * @override
     * @param {TiSession} session
     * @param {Object} [request] Express request used to read the dev test-user selection (cookie).
     * @returns {TiSession}
     * @public
     */
    augmentSession( session, request ) {
        if ( !session.user ) {
            return session;
        }

        const outcome = identityResolver.instance.resolve( {
            email: session.user.email,
            testUserCookie: request && request.cookies && request.cookies[ "ti-test-user" ],
            testUserEnabled: tools.toBool( process.env.COMPETENCE_TEST_USER_ENABLED ),
            isAdmin: authorization.isAdminIdentity( session.user, this.serviceConfig?.auth?.admins ),
            lookupByEmail: ( email ) => organizationManager.instance.resolveEmployeeIDByEmail( email ),
            employeeExists: ( employeeID ) => organizationManager.instance.hasEmployee( employeeID )
        } );

        if ( outcome.reason ) {
            logger.log( `Refusing sign-in for '${ session.user.email || session.user.userID }': ${ outcome.reason }.`, logger.logSeverity.WARNING );
        }

        return identityResolver.instance.applyIdentity( session, outcome, ( employeeID ) => this.#resolveUserRoles( employeeID ) );
    }

    /**
     * Decides whether a signed-in session may still hold access, on every protected request.
     * <br/>
     * `employmentStatus` used to be consulted only at sign-in, which made termination a rule about the NEXT login
     * rather than about access: someone whose record moved to `terminated` kept the session they already had, and
     * with a `rolling` cookie an active user's session need never expire. Per-request role derivation
     * ({@link #refreshSession}) did not close this on its own, because a terminated employee's roles are still the
     * roles their position implies — the question is not what they may do but whether they should be signed in at
     * all. Returning `false` here is what ends the session: the framework destroys it and the next request lands on
     * the login page, where {@link IdentityResolver#resolve} refuses the sign-in for the same reason.
     * <br/>
     * The admissible statuses come from {@link IdentityResolver#isLoginPermittedStatus}, the same predicate sign-in
     * uses, so the two can never drift apart. An employee who has left the organization chart entirely is refused for
     * the same reason, and an unrecognised or absent status is refused rather than assumed benign.
     * <br/>
     * An allowlisted administrator with no employee record keeps their session: they have no employment status to
     * judge, and theirs is the access that exists to repair the employee data in the first place.
     *
     * @method
     * @override
     * @param {TiSession} session
     * @returns {boolean}
     * @public
     */
    verifySession( session ) {
        if ( !super.verifySession( session ) ) {
            return false;
        }

        const employeeID = session.user.employeeID;
        if ( !employeeID ) {
            return true;
        }
        if ( !organizationManager.instance.hasEmployee( employeeID ) ) {
            return false;
        }

        return identityResolver.instance.isLoginPermittedStatus( organizationManager.instance.resolveEmploymentStatus( employeeID ) );
    }

    /**
     * Re-derives the acting employee's roles on every request, so an authority the organization withdraws stops
     * applying on the next click rather than at the user's next sign-in.
     * <br/>
     * `augmentSession` runs once, inside the login handler, and every gate in the application reads
     * `session.user.roles`. That made `#revokeSupervisor` advisory: it removed the grant from the store and the
     * in-memory mirror, wrote its audit entry, and changed nothing for the person being revoked, who kept org-wide
     * read of every evaluation, the consent register and the oversight screens until they chose to sign out — and
     * with a `rolling` session cookie, an active user need never do that. Losing a unit to a reorganization had the
     * same shape. A grant *added* mid-session had the mirror-image problem and simply did not work until re-login.
     * <br/>
     * Both inputs are already in-memory and synchronous — the org graph and the grant mirror — which is what made
     * deriving at login cheap, and makes deriving per request cheap for the same reason.
     * <br/>
     * Three sessions do not get freshly derived application roles:
     * <ul>
     *   <li>a dev test-user session whose roles were pinned by the `ti-test-user` cookie's override — re-deriving
     *       would defeat the override on the request after login, which is the whole point of the panel;</li>
     *   <li>an allowlisted administrator with no employee record, who has no appraisal identity to derive from; their
     *       `admin` role is a framework role, not one of ours, so it is carried across untouched;</li>
     *   <li>a session whose employee has left the organization chart, which drops to no application roles at all —
     *       fail closed, since an identity that cannot be placed cannot be granted authority.</li>
     * </ul>
     * <br/>
     * NOTE: this governs ROLES — what a session may do. Whether it should exist at all is {@link #verifySession},
     * which ends a session whose employee is no longer entitled to one.
     *
     * @method
     * @override
     * @param {TiSession} session
     * @param {Object} [request]
     * @returns {TiSession}
     * @public
     */
    refreshSession( session, request ) {
        const user = session && session.user;
        if ( !user || user.rolesPinned === true ) {
            return session;
        }

        const employeeID = user.employeeID;
        let derived;
        if ( !employeeID || !organizationManager.instance.hasEmployee( employeeID ) ) {
            derived = [];
        } else {
            derived = this.#resolveUserRoles( employeeID );
        }

        // This application owns the NUMERIC role codes and nothing else. Any other role on the session was put there
        // by someone else — the framework's additive string `admin` is the one in practice — so it is carried across
        // rather than derived. Dropping it and letting `applyAdminRole` restore it would work, but would rewrite an
        // administrator's roles on every single request and report each one as a change.
        const current = Array.isArray( user.roles ) ? user.roles : [];
        const foreign = current.filter( ( role ) => typeof role !== "number" );
        const currentOwned = current.filter( ( role ) => typeof role === "number" );

        if ( currentOwned.length !== derived.length || derived.some( ( role, index ) => role !== currentOwned[ index ] ) ) {
            logger.log( `Roles for employee '${ employeeID }' changed mid-session: [${ currentOwned.join( ", " ) }] -> [${ derived.join( ", " ) }].`, logger.logSeverity.NOTICE );
            user.roles = derived.concat( foreign );
        }

        return session;
    }

    /* Private interface */

    /**
     * Derives the effective role codes for an employee from their org-chart position plus any manual supervisor grant.
     * Synchronous by design — `augmentSession` runs inside a synchronous session callback, and {@link #refreshSession}
     * runs inside request middleware — so both the org chart and the grant mirror are read from memory, never a store.
     *
     * @method
     * @param {string} employeeID
     * @returns {number[]}
     * @private
     */
    #resolveUserRoles( employeeID ) {
        return roleResolver.instance.resolveRoles( {
            isUnitManager: organizationManager.instance.isUnitManager( employeeID ),
            isAutoSupervisor: organizationManager.instance.isAutoSupervisor( employeeID ),
            hasSupervisorGrant: dataManager.instance.hasSupervisorGrant( employeeID )
        } );
    }

}

module.exports = CompetenceWebServer;