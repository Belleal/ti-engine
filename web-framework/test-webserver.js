/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceInstance = require( "@ti-engine/core/service-instance" );

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
        return Promise.resolve();
    }

    /**
     * Executes custom logic on instance stop.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStop() {
        return Promise.resolve();
    }
}

module.exports = ServiceConsumer;
