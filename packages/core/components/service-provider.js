/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ServiceConsumer = require( "#service-consumer" );
const _ = require( "lodash" );
const path = require( "path" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * Abstract class used to define a Service Provider behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice provider instance.
 * <br/>
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

    /** @type ServiceExecutor */
    #serviceExecutor;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {ServiceConfiguration} [serviceConfig] The JSON configuration for this service.
     * @throws {Exception.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );

        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceProvider ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }
    }

    /* Public interface */

    /**
     * Perform initialization tasks when the service provider starts.
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
            const ServiceExecutor = require( "#service-executor" );

            this.#serviceExecutor = new ServiceExecutor();
            this.#serviceExecutor.configureVerifyAccess( this.verifyAccess );

            super.onStart().then( () => {
                let serviceDefinitions = this.serviceConfig.services;
                return this.registerServices( serviceDefinitions );
            } ).then( () => {
                messageDispatcher.instance.addMessageObserverRequestsIn( this.#serviceExecutor );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Perform shut down and cleanup tasks when the service provider stops.
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
     * Used to verify whether the service caller has authorization to access the service.
     * <br/>
     * NOTE: Override this to implement authorization check. By default, this method simply returns.
     *
     * @method
     * @param {string} authToken
     * @param {ServiceAddress} serviceAddress
     * @return {Promise}
     * @virtual
     * @public
     */
    verifyAccess( authToken, serviceAddress ) {
        return Promise.resolve();
    }

    /**
     * Used to register a single service to the service provider's API. One service can have multiple versions accessible at the same time.
     * <br/>
     * NOTE: This will actually bind the serviceDefinition as the first parameter of the service handler function. When creating default service handlers,
     * keep in mind that your first param must always be the 'serviceDefinition' and the second one will be the general 'serviceParams' object.
     * <br/>
     * NOTE: Additionally, if you intend to call another service inside the service handler, then you have to use a normal function for the handler and not
     * an arrow function! Arrow functions cannot bind the scope of the parent class to themselves, and you won't have access to it and its methods.
     *
     * @method
     * @param {ServiceDefinition} serviceDefinition Full service definition object.
     * @param {ServiceHandlerMethod} [defaultServiceHandler=undefined] A default service handler in case there is one.
     * @return {Promise}
     * @public
     */
    registerService( serviceDefinition, defaultServiceHandler = undefined ) {
        return new Promise( ( resolve, reject ) => {
            /** @type {ServiceHandlerMethod} */
            let serviceHandler = null;
            if ( serviceDefinition.serviceFile ) {
                let serviceFilePath = path.normalize( path.join( process.cwd(), serviceDefinition.serviceFile ) );
                try {
                    serviceHandler = require( serviceFilePath ).service;
                } catch ( error ) {
                    logger.log( `Specified service handler file '${ serviceFilePath }' could not be loaded!`, logger.logSeverity.ERROR, error );
                }
            } else {
                if ( typeof ( defaultServiceHandler ) === "function" ) {
                    serviceHandler = defaultServiceHandler;
                } else {
                    logger.log( "A service cannot be registered without provided default service handler at the very least!", logger.logSeverity.WARNING, serviceDefinition );
                }
            }

            // if we have a valid service handler, proceed with the registration:
            if ( typeof ( serviceHandler ) === "function" ) {
                // make sure we have a version and parent service provider specified:
                serviceDefinition.serviceVersion = serviceDefinition.serviceVersion || 1;
                this.#serviceExecutor.addServiceHandler( serviceHandler, serviceDefinition, this ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_BAD_SERVICE_HANDLER ) );
            }
        } );
    }

    /**
     * Used to register multiple services from the provided service definitions.
     *
     * @method
     * @param {ServiceDefinition[]} serviceDefinitions
     * @param {ServiceHandlerMethod} [defaultServiceHandler=undefined]
     * @return {Promise}
     * @public
     */
    registerServices( serviceDefinitions, defaultServiceHandler = undefined ) {
        return new Promise( ( resolve, reject ) => {
            if ( serviceDefinitions ) {
                logger.log( `Starting service registration process. There is ${ ( ( defaultServiceHandler ) ? "" : "NO" ) } default service handler provided.`, logger.logSeverity.INFO );

                let promises = [];
                _.forEach( serviceDefinitions, ( serviceDefinition ) => {
                    // NOTE: we are not going to interrupt the service interface loading if one of the services fails to load or is not found!
                    // If this happens, a corresponding log entry will be created but the loading process will continue. Therefore, the following
                    // promise will always resolve (unless a programming error occurs in it, of course).
                    let registrationPromise = ( serviceDefinition, defaultServiceHandler ) => {
                        return new Promise( ( resolve ) => {
                            this.registerService( serviceDefinition, defaultServiceHandler ).then( () => {
                                resolve( true );
                            } ).catch( () => {
                                resolve( false );
                            } );
                        } );
                    };
                    promises.push( registrationPromise( serviceDefinition, defaultServiceHandler ) );
                } );

                Promise.all( promises ).then( ( result ) => {
                    let registrationResults = _.countBy( result, ( value ) => {
                        return value === true;
                    } );
                    logger.log( `Registration of defined services completed with ${ registrationResults[ "true" ] || 0 } successful out of ${ serviceDefinitions.length } total.`, logger.logSeverity.INFO );

                    resolve();
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            } else {
                logger.log( `Service registration process skipped as there are no service definitions provided.`, logger.logSeverity.NOTICE );
                resolve();
            }
        } );
    }

    /**
     * Used to get an ordered list of all currently registered services. This does not include the service versions.
     *
     * @method
     * @returns {string[]}
     * @public
     */
    getRegisteredServices() {
        return _.sortBy( _.keys( this.#serviceExecutor.serviceInterface ) );
    }

}

module.exports = ServiceProvider;