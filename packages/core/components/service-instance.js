/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const schedule = require( "node-schedule" );
const tools = require( "#tools" );
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * @typedef {Object} ServiceConfiguration
 * @property {ServiceDefinition[]} services A list of service definitions to be registered with the {@link ServiceProvider}.
 */

/**
 * Abstract class used to define a Service Instance behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice instance.
 *
 * @class ServiceInstance
 * @abstract
 * @public
 */
class ServiceInstance {

    static #instanceID;
    static #serviceDomainName;
    /** @type ServiceConfiguration */
    #serviceConfig;
    #serviceHealthCheck;
    #reportHealthyJob;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} [serviceConfig={}] The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig = {} ) {
        // Ensure this abstract class cannot be instantiated:
        if ( new.target === ServiceInstance ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        // Guard against multiple instances in a single process (not supported):
        if ( ServiceInstance.#instanceID && ServiceInstance.#serviceDomainName ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED, {
                details: "Multiple ServiceInstance initializations per process are not supported."
            } );
        }

        // Ensure uniform 'ti-' prefix even if env is missing or custom starter script is used:
        const envID = process.env.TI_INSTANCE_ID;
        ServiceInstance.#instanceID = ( envID && String( envID ).startsWith( "ti-" ) ) ? envID : ( "ti-" + ( envID || tools.getUUID() ) );

        ServiceInstance.#serviceDomainName = serviceDomainName;
        this.#serviceConfig = ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : { services: [] };
    }

    /* Public interface */

    /**
     * Property returning the current service instance ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get instanceID() {
        return ServiceInstance.#instanceID;
    }

    /**
     * Property returning the current service domain name.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get serviceDomainName() {
        return ServiceInstance.#serviceDomainName;
    }

    /**
     * Property to indicate that this and every child class is a {@link ServiceInstance}.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isServiceInstance() {
        return true;
    }

    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {ServiceConfiguration}
     * @public
     */
    get serviceConfig() {
        return this.#serviceConfig;
    }

    /**
     * Initializes the instance.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    start() {
        return new Promise( ( resolve, reject ) => {
            if ( !ServiceInstance.#serviceDomainName ) {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_SERVICE_DOMAIN_NAME ) );
            } else {
                this.#preStart().then( () => {
                    return this.onStart();
                } ).then( () => {
                    return this.#postStart();
                } ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            }
        } );
    }

    /**
     * Executes custom logic on instance start.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStart logic you can override this method but make sure to call it in the
     * overriding method using: super.onStart()
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStart() {
        return new Promise( ( resolve, reject ) => {
            cache.instance.initialize().then( () => {
                const DefaultMessageExchange = require( "#default-message-exchange" );
                const ServiceProvider = require( "#service-provider" );
                const ServiceConsumer = require( "#service-consumer" );

                let configureInbound = ( this instanceof ServiceProvider );
                let configureOutbound = ( this instanceof ServiceConsumer );

                return messageDispatcher.instance.initialize( new DefaultMessageExchange( ServiceInstance.instanceID, ServiceInstance.serviceDomainName ), configureInbound, configureOutbound );
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Shuts down the instance.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    stop() {
        return new Promise( ( resolve, reject ) => {
            this.#preStop().then( () => {
                return this.onStop();
            } ).then( () => {
                return cache.instance.shutDown();
            } ).then( () => {
                return this.#postStop();
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Executes custom logic on instance stop.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStop logic, you can override this method but make sure to call it in the
     * overriding method using: super.onStop()
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStop() {
        return new Promise( ( resolve, reject ) => {
            messageDispatcher.instance.shutDown().then( () => {
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
     * @virtual
     * @public
     */
    reportHealthy() {
        if ( cache.instance.isOperational ) {
            let timestamp = new Date();
            cache.instance.setValue( this.#serviceHealthCheck, timestamp.toISOString(), config.getSetting( config.setting.SERVICE_HEALTH_CHECK_TIMEOUT ) ).catch( ( error ) => {
                logger.log( `Error while trying to report for health check from '${ ServiceInstance.instanceID }'!`, logger.logSeverity.WARNING, error );
            } );
        }
    }

    /* Private interface */

    /**
     * Used to run internal pre-start logic.
     * <br/>
     * NOTE: This will be executed before any user's custom logic in {@link ServiceInstance.onStart}.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #preStart() {
        return new Promise( ( resolve ) => {
            this.#serviceHealthCheck = config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ADDRESS ) + ServiceInstance.serviceDomainName + ":" + ServiceInstance.instanceID;
            resolve();
        } );
    }

    /**
     * Used to run internal post-start logic.
     * <br/>
     * NOTE: This will be executed only after the user's custom logic in {@link ServiceInstance.onStart} has been successfully executed.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #postStart() {
        return new Promise( ( resolve ) => {
            // Schedule regular health check:
            this.#reportHealthyJob = schedule.scheduleJob( config.getSetting( config.setting.SERVICE_HEALTH_CHECK_INTERVAL ), () => {
                this.reportHealthy();
            } );

            logger.log( `Instance '${ ServiceInstance.instanceID }' started successfully.`, logger.logSeverity.NOTICE, {
                nodeVersion: process.version,
                operationMode: config.getSetting( config.setting.OPERATION_MODE )
            } );

            resolve();
        } );
    }

    /**
     * Used to run internal pre-start logic.
     * <br/>
     * NOTE: This will be executed before any user's custom logic in {@link ServiceInstance.onStop}.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #preStop() {
        return new Promise( ( resolve ) => {
            if ( this.#reportHealthyJob ) {
                this.#reportHealthyJob.cancel();
            }
            resolve();
        } );
    }

    /**
     * Used to run internal post-stop logic.
     * <br/>
     * NOTE: This will be executed only after the user's custom logic in {@link ServiceInstance.onStop} has been successfully executed.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #postStop() {
        return new Promise( ( resolve ) => {
            logger.log( `Instance '${ ServiceInstance.instanceID }' shut down successfully.`, logger.logSeverity.NOTICE );
            resolve();
        } );
    }

}

module.exports = ServiceInstance;