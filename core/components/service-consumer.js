/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceCaller = require( "#service-caller" );
const ServiceInstance = require( "#service-instance" );
const DefaultMessageExchange = require( "#default-message-exchange" );
const exceptions = require( "#exceptions" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * Abstract class used to define a Service Consumer behavior.
 * NOTE: Inherit this to create an a module that can be started as a microservice consumer instance.
 *
 * @class ServiceConsumer
 * @abstract
 * @public
 */
class ServiceConsumer extends ServiceInstance {

    #serviceCaller;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     */
    constructor( serviceDomainName ) {
        super( serviceDomainName );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceConsumer ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#serviceCaller = new ServiceCaller();
    }

    /* Public interface */

    /**
     * Perform initialization tasks when the service consumer starts.
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
            messageDispatcher.initialize( new DefaultMessageExchange( ServiceInstance.serviceDomainName ), false, true ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Perform shut down and cleanup tasks when the service consumer stops.
     * NOTE: If you need to add more onStop logic you can override this method but make sure to call it in the
     * overriding method using: super.onStop()
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStop() {
        return new Promise( ( resolve, reject ) => {
            messageDispatcher.shutDown().then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    callService( serviceAddress, serviceParams, serviceExecContext ) {
        return this.#serviceCaller.executeServiceCall( serviceAddress, serviceParams, serviceExecContext );
    }

}

module.exports = ServiceConsumer;
