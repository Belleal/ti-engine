/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ServiceProvider = require( "@ti-engine/core/service-provider" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * A tester microservice for the ti-engine.
 *
 * @class TiTesterService
 * @public
 */
class TiTesterService extends ServiceProvider {

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} serviceConfig The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
    }

    /* Public interface */

    /**
     * Executes custom logic on instance start.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart() {
        return new Promise( ( resolve, reject ) => {
            super.onStart().then( () => {
                // give it little time to finish initialization and then execute the testing sequence:
                setTimeout( () => {
                    this.#executeTests();
                }, 500 );

                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to report health status of the service instance for external monitoring.
     * This is a scheduled job that will be executed at SERVICE_HEALTH_CHECK_INTERVAL time.
     *
     * @method
     * @override
     * @public
     */
    reportHealthy() {
        super.reportHealthy();
    }

    /**
     * Used to verify whether the service caller has authorization to access the service.
     *
     * @method
     * @param {string} authToken
     * @param {ServiceAddress} serviceAddress
     * @return {Promise}
     * @override
     * @public
     */
    verifyAccess( authToken, serviceAddress ) {
        // for demo purposes accept any non-undefined value in the auth token in order to process the service call:
        if ( authToken ) {
            return Promise.resolve();
        } else {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS ) );
        }
    }

    /* Private interface */

    /**
     * Used to execute sequence of integration tests.
     *
     * @method
     * @private
     */
    #executeTests() {
        // execute "service1" - simple service call
        this.callService( {
            serviceAlias: this.getRegisteredServices()[ 0 ], // get the name of the first service - by default "service1"
            serviceDomainName: ServiceProvider.serviceDomainName // get the name of own service domain - by default "ti-tester-service"
        }, {}, {
            authToken: "dummy-auth" // use a dummy non-undefined value for auth token as expected by method 'verifyAccess' above
        } ).then( ( result ) => {
            logger.log( "Execution of service1 result:", logger.logSeverity.NOTICE, result );
        } ).catch( ( error ) => {
            logger.log( "Execution of service1 error result:", logger.logSeverity.ERROR, error );
        } );

        // execute "service2" - 2-sequence service call
        this.callService( {
            serviceAlias: this.getRegisteredServices()[ 1 ], // get the name of the second service - by default "service2"
            serviceDomainName: ServiceProvider.serviceDomainName // get the name of own service domain - by default "ti-tester-service"
        }, {}, {
            authToken: "dummy-auth" // use a dummy non-undefined value for auth token as expected by method 'verifyAccess' above
        } ).then( ( result ) => {
            logger.log( "Execution of service2 result:", logger.logSeverity.NOTICE, result );
        } ).catch( ( error ) => {
            logger.log( "Execution of service2 error result:", logger.logSeverity.ERROR, error );
        } );
    }

}

module.exports = TiTesterService;
