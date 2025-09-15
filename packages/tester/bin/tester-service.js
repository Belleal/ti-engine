/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ServiceProvider = require( "@ti-engine/core/service-provider" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { setTimeout: setTimeoutPromise } = require( "node:timers/promises" );

/**
 * A tester microservice for the ti-engine.
 *
 * @class TiTesterService
 * @public
 */
class TiTesterService extends ServiceProvider {

    // Use a fake non-undefined value for auth token as expected by the method 'verifyAccess':
    #authToken = "dummy-auth";

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
                // Give it a little time to finish initialization and then execute the testing sequence:
                return setTimeoutPromise( 500 );
            } ).then( () => {
                this.#executeTests();
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
        // For demo purposes accept any non-undefined value in the auth token to process the service call:
        if ( authToken ) {
            return Promise.resolve();
        } else {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS ) );
        }
    }

    /* Private interface */

    /**
     * Used to execute a sequence of integration tests and report the results to the log.
     *
     * @method
     * @private
     */
    #executeTests() {
        let totalTests = 3;
        let passedTests = 0;
        this.#assertService( "Test 1: Service call to a simple service without chained services", "service1", ServiceProvider.serviceDomainName, true ).then( ( result ) => {
            passedTests = ( result ) ? passedTests + 1 : passedTests;
            return this.#assertService( "Test 2: Service call to a simple service with one chained service", "service2", ServiceProvider.serviceDomainName, true );
        } ).then( ( result ) => {
            passedTests = ( result ) ? passedTests + 1 : passedTests;
            return this.#assertService( "Test 3: Service call to a non-existent service", "service3", ServiceProvider.serviceDomainName, false );
        } ).then( ( result ) => {
            passedTests = ( result ) ? passedTests + 1 : passedTests;
            logger.log( `All service tests completed. Passed ${ passedTests } out of ${ totalTests }.`, logger.logSeverity.NOTICE );
        } ).catch( ( error ) => {
            logger.log( "Error during service tests execution.", logger.logSeverity.ERROR, error );
        } );
    }

    /**
     * Used to assert the result of a service call.
     *
     * @method
     * @param {string} testName
     * @param {string} serviceAlias
     * @param {string} serviceDomainName
     * @param {boolean} expectedResult
     * @returns {Promise<boolean>}
     * @private
     */
    #assertService( testName, serviceAlias, serviceDomainName, expectedResult ) {
        return new Promise( ( resolve ) => {
            this.callService( {
                serviceAlias: serviceAlias,
                serviceDomainName: serviceDomainName
            }, {}, {
                authToken: this.#authToken
            } ).then( ( result ) => {
                let testSuccessful = ( expectedResult === result.isSuccessful );
                if ( testSuccessful ) {
                    logger.log( `Execution of '${ testName }' successful.`, logger.logSeverity.INFO, result );
                } else {
                    logger.log( `Execution of '${ testName }' not successful.`, logger.logSeverity.ERROR, result );
                }
                resolve( testSuccessful );
            } ).catch( ( error ) => {
                logger.log( `Error in execution of '${ testName }'!`, logger.logSeverity.ERROR, error );
                resolve( false );
            } );
        } );
    }

}

module.exports = TiTesterService;