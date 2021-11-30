/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceProvider = require( "@ti-engine/core/service-provider" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * A tester microservice.
 *
 * @class TesterService
 * @public
 */
class TesterService extends ServiceProvider {

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
        // execute service1 - simple service call
        this.callService( {
            serviceAlias: "service1",
            serviceDomainName: "tester-service"
        }, {}, {
            authToken: "auth"
        } ).then( ( result ) => {
            logger.log( "Execution of service1 result:", logger.logSeverity.NOTICE, result );
            console.log( result );
        } ).catch( ( error ) => {
            logger.log( "Execution of service1 error result:", logger.logSeverity.ERROR, error );
            console.error( error );
        } );

        // execute service2 - 2-sequence service call
        this.callService( {
            serviceAlias: "service2",
            serviceDomainName: "tester-service"
        }, {}, {
            authToken: "auth"
        } ).then( ( result ) => {
            logger.log( "Execution of service2 result:", logger.logSeverity.NOTICE, result );
            console.log( result );
        } ).catch( ( error ) => {
            logger.log( "Execution of service2 error result:", logger.logSeverity.ERROR, error );
            console.error( error );
        } );
    }

}

module.exports = TesterService;
