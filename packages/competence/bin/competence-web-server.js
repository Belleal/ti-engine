/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebServer = require( "@ti-engine/web-framework/web-server" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const tools = require( "@ti-engine/core/tools" );
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
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
        return super.onStart()
            .then( () => dataManager.instance.initialize() )
            .then( () => organizationManager.instance.buildOrganizationChart() )
            .then( () => dataManager.instance.loadRoleGrants() )
            .then( () => configurationLoader.initialize() )
            .then( () => competenceFramework.instance.backfillMissingEvaluationDeadlines() )
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
     * Used to augment the session with additional data.
     *
     * @method
     * @override
     * @param {TiSession} session
     * @param {Object} [request] Express request used to read the test user selection (cookie).
     * @returns {TiSession}
     * @public
     */
    augmentSession( session, request ) {
        // NOTE: Identity (employeeID) still comes from the temporary test-user cookie until AD-driven identity is
        // wired up. Roles are now DERIVED from the user's place in the org chart; the cookie's optional `roles`
        // array remains a dev-only override (see the login test panel). The whole cookie is honored ONLY when the
        // off-by-default COMPETENCE_TEST_USER_ENABLED flag is set (see #readTestUserSelection) — in production it is
        // ignored, so identity falls back to the authenticated session and roles are always org-derived.
        if ( session.user ) {
            const testUser = this.#readTestUserSelection( request );
            session.user.employeeID = ( testUser && testUser.employeeID ) || session.user.employeeID || "20";

            const overrideRoles = ( testUser && Array.isArray( testUser.roles ) && testUser.roles.length > 0 ) ? testUser.roles : null;
            session.user.roles = overrideRoles || this.#resolveUserRoles( session.user.employeeID );
        }

        return session;
    }

    /* Private interface */

    /**
     * Derives the effective role codes for an employee from their org-chart position plus any manual supervisor grant.
     * Synchronous by design (augmentSession runs inside a synchronous session callback): the org chart and the grant
     * mirror are both in-memory by this point.
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

    /**
     * Reads the temporary "ti-test-user" cookie set by the login screen pill panel and returns the parsed selection.
     * <br/>
     * SECURITY: This cookie is a dev-only backdoor — it lets the client choose BOTH the acting identity and an
     * optional numeric roles override, bypassing org-derived and grant-based authorization. It must never be trusted
     * in production, so it is hard-gated behind the explicit, off-by-default `COMPETENCE_TEST_USER_ENABLED` env flag
     * (mirrors `COMPETENCE_PRELOAD_DATA`). Without the flag the cookie is ignored entirely.
     * <br/>
     * NOTE: For testing purposes only — the cookie path should be removed once real identity propagation is implemented.
     *
     * @method
     * @param {Object} [request]
     * @returns {{ employeeID: string, roles: number[] } | null}
     * @private
     */
    #readTestUserSelection( request ) {
        if ( !tools.toBool( process.env.COMPETENCE_TEST_USER_ENABLED ) ) {
            return null;
        }
        const raw = request && request.cookies && request.cookies[ "ti-test-user" ];
        if ( !raw ) {
            return null;
        }
        try {
            const parsed = JSON.parse( decodeURIComponent( raw ) );
            if ( parsed && parsed.employeeID ) {
                return {
                    employeeID: String( parsed.employeeID ),
                    roles: Array.isArray( parsed.roles ) ? parsed.roles.map( ( role ) => Number( role ) ).filter( ( role ) => Number.isFinite( role ) ) : []
                };
            }
        } catch {
            // Ignore malformed cookie values.
        }
        return null;
    }

}

module.exports = CompetenceWebServer;