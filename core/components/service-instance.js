/**
 * An abstract class module defining the Instance Entry behavior.
 */

const schedule = require( "node-schedule" );
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );

// reference values:
const healthCheckTimeout = 3;

/**
 * Abstract class used to define a Service Instance behavior.
 * NOTE: Inherit this to create an a module that can be started as an application microservice instance.
 *
 * @class ServiceInstance
 * @abstract
 * @public
 */
class ServiceInstance {

    #serviceHealthCheck = undefined;
    #reportHealthyJob = undefined;

    /**
     * @constructor
     */
    constructor() { }

    /* Public interface */

    /**
     * Property to indicate that this and every child class is a Instance Entry.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isInstanceEntry() {
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
            this.#preStart().then( () => {
                return this.onStart();
            } ).then( () => {
                return this.#postStart();
            } ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Executes custom logic on instance start.
     * NOTE: Override this to add specific functionality.
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
            this.#serviceHealthCheck = config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ADDRESS ) + process.env.TI_INSTANCE_NAME + ":" + process.env.TI_INSTANCE_ID;

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
            // TODO: move this to the InstanceEntry class instead and make it possible to reuse instance IDs of previously killed instances
            // startup was successful; add the current instance to the list of running ones in the memory cache:
            // cache.hashSetFields( "titanium:instances:" + process.env.TI_INSTANCE_ID, [ {
            //     name: "instance-start",
            //     value: process.env.TITANIUM_INSTANCE_START
            // } ] ).catch( ( error ) => {
            //     logger.log( "Error while trying to add data variables for current instance in cache!", logger.logSeverity.ERROR, error );
            // } );

            // schedule regular health check:
            this.#reportHealthyJob = schedule.scheduleJob( config.getSetting( config.setting.SERVICE_HEALTH_CHECK_INTERVAL ), () => {
                this.#reportHealthy();
            } );

            logger.log( `Instance '${ process.env.TI_INSTANCE_ID }' started successfully.`, logger.logSeverity.NOTICE, {
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
            logger.log( `Instance '${ process.env.TI_INSTANCE_ID }' shut down successfully.`, logger.logSeverity.NOTICE );

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
        cache.setValue( this.#serviceHealthCheck, "healthy", healthCheckTimeout ).catch( ( error ) => {
            logger.log( `Error while trying to report for health check from '${ process.env.TI_INSTANCE_ID }'!`, logger.logSeverity.WARNING, error );
        } );
    }

}

module.exports = ServiceInstance;
