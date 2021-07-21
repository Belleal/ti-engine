/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const schedule = require( "node-schedule" );
const tools = require( "#tools" );
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );

/**
 * Abstract class used to define a Service Instance behavior.
 * NOTE: Inherit this to create an a module that can be started as a microservice instance.
 *
 * @class ServiceInstance
 * @abstract
 * @public
 */
class ServiceInstance {

    static #instanceID;
    static #serviceDomainName;
    #serviceHealthCheck;
    #reportHealthyJob;

    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     */
    constructor( serviceDomainName ) {
        // make sure this abstract class cannot be instantiated:
        if ( new.target === ServiceInstance ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        ServiceInstance.#instanceID = process.env.TI_INSTANCE_ID || tools.getUUID();
        ServiceInstance.#serviceDomainName = serviceDomainName;
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
     * Property to indicate that this and every child class is a Service Instance.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isServiceInstance() {
        return true;
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
                reject( exceptions.raise( exceptions.exceptionCode.E_INVALID_SERVICE_DOMAIN_NAME ) );
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
     * NOTE: Override this to add specific functionality.
     * NOTE: This method will be invoked automatically.
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStart() {
        return Promise.resolve();
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
     * NOTE: Override this to add specific functionality.
     * NOTE: This method will be invoked automatically.
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStop() {
        return Promise.resolve();
    }

    /* Private interface */

    /**
     * Used to run internal pre-start logic.
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
        let timestamp = new Date();
        cache.setValue( this.#serviceHealthCheck, timestamp.toISOString(), config.getSetting( config.setting.SERVICE_HEALTH_CHECK_TIMEOUT ) ).catch( ( error ) => {
            logger.log( `Error while trying to report for health check from '${ ServiceInstance.instanceID }'!`, logger.logSeverity.WARNING, error );
        } );
    }

}

module.exports = ServiceInstance;
