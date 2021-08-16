/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceProvider = require( "@ti-engine/core/service-provider" );
const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * A test microservice.
 *
 * @class TestService
 * @public
 */
class TestService extends ServiceProvider {

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} serviceConfig The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
    }

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
                this.test();
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

    test() {
        setTimeout( () => {
            this.callService( {
                serviceAlias: "service1",
                serviceDomainName: "test-service"
            }, {}, {
                authToken: "auth"
            } ).then( ( result ) => {
                this.test();
                console.log( result );
            } ).catch( ( error ) => {
                console.log( error );
            } );
        }, 2000 );
    }

}

module.exports = TestService;
