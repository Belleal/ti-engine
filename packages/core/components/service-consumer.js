/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ServiceInstance = require( "#service-instance" );
const exceptions = require( "#exceptions" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * Abstract class used to define a Service Consumer behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice consumer instance.
 * <br/>
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
     * @param {ServiceConfiguration} [serviceConfig] The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceConsumer ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

    /**
     * Perform initialization tasks when the service consumer starts.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
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
                messageDispatcher.instance.addMessageObserverResponsesIn( this.#serviceCaller );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Perform shut down and cleanup tasks when the service consumer stops.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
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
     * Used to report health status of the service instance for external monitoring.
     * This is a scheduled job that will be executed at SERVICE_HEALTH_CHECK_INTERVAL time.
     * <br/>
     * NOTE: By default this method will update a Redis key with an expiration timer. You can override this
     * functionality with something custom like calling an HTTP endpoint.
     *
     * @method
     * @override
     * @virtual
     * @public
     */
    reportHealthy() {
        super.reportHealthy();
    }

    /**
     * Used to invoke a business service in any {@link ServiceInstance}.
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