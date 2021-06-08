/**
 * The application entry point for any type of service instance.
 * This should be used when initializing new application process regardless if locally or in the cloud.
 */

"use strict";

/**
 * @typedef {string} EnvironmentVariable
 */

/**
 * @typedef {NodeJS.Process} Environment
 * @property {ProcessEnv} env
 * @property {EnvironmentVariable} env.TI_GCLOUD_API_KEY
 * @property {EnvironmentVariable} env.TI_GCLOUD_ENABLED
 * @property {EnvironmentVariable} env.TI_GCLOUD_PROJECT_ID
 * @property {EnvironmentVariable} env.TI_INSTANCE_CLASS
 * @property {EnvironmentVariable} env.TI_INSTANCE_ID
 * @property {EnvironmentVariable} env.TI_INSTANCE_NAME
 * @property {EnvironmentVariable} env.TI_LOG_CONSOLE_ENABLED
 * @property {EnvironmentVariable} env.TI_LOG_MIN_LEVEL
 * @property {EnvironmentVariable} env.TI_LOG_USED_JSON
 * @property {EnvironmentVariable} env.TI_OPERATION_MODE
 */

// load any ENV variables defined in a .env file:
require( "dotenv" ).config();

const _ = require( "lodash" );
const tools = require( process.cwd() + "/core/utils/tools" );
const logger = require( process.cwd() + "/core/utils/logger" );

// configure the current instance variables before requiring any platform modules and store the necessary ones in memory cache:
process.env.TI_INSTANCE_ID = "ti-" + tools.getUUID();
process.env.TI_INSTANCE_CLASS = process.env.TI_INSTANCE_CLASS || "";
process.env.TI_INSTANCE_NAME = process.env.TI_INSTANCE_NAME || _.last( _.split( process.env.TI_INSTANCE_CLASS, "/" ) );

// configure the process error handlers:

/**
 * Will be used to gracefully shut down the instance.
 * NOTE: Will be overridden below after the instance creation.
 *
 * @method
 * @param {number} exitCode
 * @abstract
 * @private
 */
let shutDownInstance = ( exitCode ) => {
};

// this event will handle the process termination (Ctrl + C):
process.on( "SIGINT", () => {
    logger.log( `SIGINT event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// this event will handle the process termination (CMD close):
process.on( "SIGHUP", () => {
    logger.log( `SIGHUP event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// this event will handle the process termination:
process.on( "SIGTERM", () => {
    logger.log( `SIGTERM event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

process.on( "unhandledRejection", ( reason, promise ) => {
    logger.log( `Unhandled promise rejection identified! Make sure this isn't a software bug.`, logger.logSeverity.WARNING, {
        reason: reason,
        promise: tools.stringifyJSON( promise )
    } );
} );

process.on( "multipleResolves", ( type, promise, reason ) => {
    logger.log( `Multiple promise resolves detected! Make sure this isn't a software bug.`, logger.logSeverity.WARNING, {
        reason: reason,
        promise: tools.stringifyJSON( promise )
    } );
} );

process.on( "uncaughtException", ( error ) => {
    logger.log( `Some nasty and uncaught error just occurred in the application!`, logger.logSeverity.ALERT, error );
    setImmediate( () => process.exit( 1 ) );
} );

// start the instance:
try {
    logger.log( `Starting new instance of type '${ process.env.TI_INSTANCE_NAME }' with instance ID '${ process.env.TI_INSTANCE_ID }'.`, logger.logSeverity.NOTICE );

    /** @type ServiceInstance */
    const serviceConstructor = require( process.cwd() + "/" + process.env.TI_INSTANCE_CLASS );
    const mainInstance = new serviceConstructor();

    /** @override */
    shutDownInstance = ( code ) => {
        mainInstance.stop().then( () => {
            setImmediate( () => process.exit( code ) );
        } ).catch( ( error ) => {
            logger.log( `Error occurred during shut down of instance '${ process.env.TI_INSTANCE_ID }'! Exit code changed from '${ code }' to '1'.`, logger.logSeverity.ERROR, error );
            setImmediate( () => process.exit( 1 ) );
        } );
    };

    if ( mainInstance.isInstanceEntry ) {
        mainInstance.start().catch( ( error ) => {
            logger.log( `Error detected during instance '${ process.env.TI_INSTANCE_ID }' startup!`, logger.logSeverity.ALERT, error );
            setImmediate( () => process.exit( 1 ) );
        } );
    } else {
        logger.log( `Attempting to start a module that does not implement the ServiceInstance abstract class!`, logger.logSeverity.ERROR );
        setImmediate( () => process.exit( 1 ) );
    }
} catch ( error ) {
    logger.log( `Error detected in the instance startup script!`, logger.logSeverity.ALERT, error );
    setImmediate( () => process.exit( 1 ) );
}
