/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceInstance = require( process.cwd() + "/core/components/service-instance" );

class ServiceConsumer extends ServiceInstance {
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
            console.log( "Inside overridden Start" );
            resolve();
        } );
    }

}

module.exports = ServiceConsumer;