/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

"use strict";

const _ = require( "lodash" );
const path = require( "path" );

// load any ENV variables defined in a .env file - before including any framework files:
require( "dotenv" ).config( { path: path.join( process.cwd(), ".env" ) } );

const tools = require( "#tools" );
const logger = require( "#logger" );

// configure the current instance variables before requiring any platform modules and store the necessary ones in memory cache:
process.env.TI_INSTANCE_ID = "ti-" + tools.getUUID();
process.env.TI_INSTANCE_CLASS = process.env.TI_INSTANCE_CLASS || "";
process.env.TI_INSTANCE_NAME = process.env.TI_INSTANCE_NAME || _.last( _.split( process.env.TI_INSTANCE_CLASS, "/" ) );

// configure the process error handlers:

/**
 * Will be used to gracefully shut down the instance.
 * <br/>
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
    const serviceConstructor = require( path.join( process.cwd(), process.env.TI_INSTANCE_CLASS ) );
    const serviceConfigPath = process.env.TI_INSTANCE_CONFIG;
    let serviceConfig = {};
    if ( serviceConfigPath ) {
        serviceConfig = require( path.join( process.cwd(), process.env.TI_INSTANCE_CONFIG ) );
    }
    const mainInstance = new serviceConstructor( process.env.TI_INSTANCE_NAME, serviceConfig );

    /** @override */
    shutDownInstance = ( code ) => {
        mainInstance.stop().then( () => {
            setImmediate( () => process.exit( code ) );
        } ).catch( ( error ) => {
            logger.log( `Error occurred during shut down of instance '${ process.env.TI_INSTANCE_ID }'! Exit code changed from '${ code }' to '1'.`, logger.logSeverity.ERROR, error );
            setImmediate( () => process.exit( 1 ) );
        } );
    };

    if ( mainInstance.isServiceInstance ) {
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
