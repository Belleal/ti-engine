/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceConsumer = require( process.cwd() + "/core/components/service-consumer" );
const exceptions = require( process.cwd() + "/core/utils/exceptions" );
const cache = require( process.cwd() + "/core/utils/cache" );

/**
 * A test microservice.
 *
 * @class TestService
 * @public
 */
class TestService extends ServiceConsumer {

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     */
    constructor( serviceDomainName ) {
        super( serviceDomainName );
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
                return this.callService( {
                    serviceAlias: "service1",
                    serviceDomainName: "testProvider"
                }, {}, {
                    authToken: "auth"
                } );
            } ).then( ( result ) => {
                console.log( result );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = TestService;
