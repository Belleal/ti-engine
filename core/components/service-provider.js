/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceConsumer = require( "#service-consumer" );
const exceptions = require( "#exceptions" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * Abstract class used to define a Service Provider behavior.
 * NOTE: Inherit this to create an a module that can be started as a microservice provider instance.
 * NOTE: A service provider is a microservice that offers an API of named business services that can be invoked by other
 * microservices using {@link ServiceCall} objects. The provider will take care of the actual execution of that service and
 * therefore acts as a "black box". The only necessary items are the service address and optional inbound parameters to be
 * used in that service's logic. The result of the service's execution will be bundled in an {@link ServiceCallResult}
 * object and returned to the caller.
 *
 * @class ServiceProvider
 * @extends ServiceConsumer
 * @abstract
 * @public
 */
class ServiceProvider extends ServiceConsumer {

    #serviceExecutor;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     */
    constructor( serviceDomainName ) {
        super( serviceDomainName );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceProvider ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

    /**
     * Perform initialization tasks when the service provider starts.
     * NOTE: This method will be invoked automatically.
     * NOTE: If you need to add more onStart logic you can override this method but make sure to call it in the
     * overriding method using: super.onStart()
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart() {
        return new Promise( ( resolve, reject ) => {
            const ServiceExecutor = require( "#service-executor" );

            this.#serviceExecutor = new ServiceExecutor();

            super.onStart().then( () => {
                messageDispatcher.addMessageObserverRequestsIn( this.#serviceExecutor );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Perform shut down and cleanup tasks when the service provider stops.
     * NOTE: This method will be invoked automatically.
     * NOTE: If you need to add more onStop logic you can override this method but make sure to call it in the
     * overriding method using: super.onStop()
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStop() {
        return new Promise( ( resolve, reject ) => {
            super.onStop().then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = ServiceProvider;
