/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
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

}

module.exports = CompetenceWebServer;