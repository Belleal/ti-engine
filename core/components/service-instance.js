/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
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
 * Abstract class used to define a Service Instance behavior.
 * <br/>
 * NOTE: Inherit this to create an a module that can be started as a microservice instance.
 * <br/>
 * NOTE: This class does not
 *
 * @class ServiceInstance
 * @abstract
 * @public
 */
class ServiceInstance {

    static #instanceID;
    static #serviceDomainName;
    #serviceConfig;
    #serviceHealthCheck;
    #reportHealthyJob;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {Object} [serviceConfig={}] The JSON configuration for this service.
     */
    constructor( serviceDomainName, serviceConfig = {} ) {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceInstance ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        ServiceInstance.#instanceID = process.env.TI_INSTANCE_ID || tools.getUUID();
        ServiceInstance.#serviceDomainName = serviceDomainName;
        this.#serviceConfig = ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : {};
    }

    /* Public interface */

    /**
     * Property returning the current service instance ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get instanceID() { return ServiceInstance.#instanceID; }

    /**
     * Property returning the current service domain name.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get serviceDomainName() { return ServiceInstance.#serviceDomainName; }

    /**
     * Property to indicate that this and every child class is a {@link ServiceInstance}.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isServiceInstance() { return true; }

    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {Object}
     * @public
     */
    get serviceConfig() { return this.#serviceConfig; }

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
            const DefaultMessageExchange = require( "#default-message-exchange" );
            const ServiceProvider = require( "#service-provider" );
            const ServiceConsumer = require( "#service-consumer" );

            let configureInbound = ( this instanceof ServiceProvider );
            let configureOutbound = ( this instanceof ServiceConsumer );

            messageDispatcher.initialize( new DefaultMessageExchange( ServiceInstance.instanceID, ServiceInstance.serviceDomainName ), configureInbound, configureOutbound ).then( () => {
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
        return new Promise( ( resolve, reject ) => {
            this.#serviceHealthCheck = config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ADDRESS ) + process.env.TI_INSTANCE_NAME + ":" + ServiceInstance.instanceID;
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
        return new Promise( ( resolve, reject ) => {
            // schedule regular health check:
            this.#reportHealthyJob = schedule.scheduleJob( config.getSetting( config.setting.SERVICE_HEALTH_CHECK_INTERVAL ), () => {
                this.#reportHealthy();
            } );

            logger.log( `Instance '${ ServiceInstance.instanceID }' started successfully.`, logger.logSeverity.NOTICE, {
                nodeVersion: process.version
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
        return new Promise( ( resolve, reject ) => {
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
        return new Promise( ( resolve, reject ) => {
            logger.log( `Instance '${ ServiceInstance.instanceID }' shut down successfully.`, logger.logSeverity.NOTICE );

            resolve();
        } );
    }

    /**
     * Scheduled job used to report for service instance health checks.
     *
     * @method
     * @private
     */
    #reportHealthy() {
        if ( cache.isOperational ) {
            let timestamp = new Date();
            cache.setValue( this.#serviceHealthCheck, timestamp.toISOString(), config.getSetting( config.setting.SERVICE_HEALTH_CHECK_TIMEOUT ) ).catch( ( error ) => {
                logger.log( `Error while trying to report for health check from '${ ServiceInstance.instanceID }'!`, logger.logSeverity.WARNING, error );
            } );
        }
    }

}

module.exports = ServiceInstance;
