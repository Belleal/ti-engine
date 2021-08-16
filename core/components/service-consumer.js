/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceInstance = require( "#service-instance" );
const exceptions = require( "#exceptions" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * Abstract class used to define a Service Consumer behavior.
 * NOTE: Inherit this to create an a module that can be started as a microservice consumer instance.
 * NOTE: A service consumer is a microservice that can invoke named business services in the APIs of other
 * microservices using {@link ServiceCall} objects. The consumer does not need to know the specifics of
 * the business logic in these services but only the service address and the inbound parameters (if any).
 * The result of the execution will be returned to the consumer in a {@link ServiceCallResult} object.
 *
 * @class ServiceConsumer
 * @extends ServiceInstance
 * @abstract
 * @public
 */
class ServiceConsumer extends ServiceInstance {

    #serviceCaller;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} [serviceConfig={}] The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig = {} ) {
        super( serviceDomainName, serviceConfig );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceConsumer ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

    /**
     * Perform initialization tasks when the service consumer starts.
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
            const ServiceCaller = require( "#service-caller" );

            this.#serviceCaller = new ServiceCaller();

            super.onStart().then( () => {
                messageDispatcher.addMessageObserverResponsesIn( this.#serviceCaller );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Perform shut down and cleanup tasks when the service consumer stops.
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

    /**
     * Used to invoke a business service.
     *
     * @method
     * @param {ServiceAddress} serviceAddress
     * @param {Object} serviceParams
     * @param {ServiceExecContext} serviceExecContext
     * @returns {Promise<ServiceCallResult>}
     * @public
     */
    callService( serviceAddress, serviceParams, serviceExecContext ) {
        return this.#serviceCaller.executeServiceCall( serviceAddress, serviceParams, serviceExecContext );
    }

}

module.exports = ServiceConsumer;
