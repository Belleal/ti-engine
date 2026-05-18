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
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );

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
        return new Promise( ( resolve, reject ) => {
            super.onStart().then( () => {
                return dataManager.instance.initialize();
            } ).then( () => {
                return organizationManager.instance.buildOrganizationChart();
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                logger.log( `Error while trying to start competence web server within instance '${ ServiceConsumer.instanceID }'!`, logger.logSeverity.ERROR, error );
                reject( exceptions.raise( error ) );
            } );
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
        // TODO: This part is for testing purposes only! Normally, the employeeID (if any) and roles should come from the AD response.
        if ( session.user ) {
            const testUser = this.#readTestUserSelection( request );
            session.user.employeeID = ( testUser && testUser.employeeID ) || session.user.employeeID || "20";
            session.user.roles = ( testUser && Array.isArray( testUser.roles ) && testUser.roles.length > 0 ) ? testUser.roles : [ 1, 2, 3 ];
        }

        return session;
    }

    /* Private interface */

    /**
     * Reads the temporary "ti-test-user" cookie set by the login screen pill panel and returns the parsed selection.
     * <br/>
     * NOTE: For testing purposes only — should be removed once real identity propagation is implemented.
     *
     * @method
     * @param {Object} [request]
     * @returns {{ employeeID: string, roles: number[] } | null}
     * @private
     */
    #readTestUserSelection( request ) {
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