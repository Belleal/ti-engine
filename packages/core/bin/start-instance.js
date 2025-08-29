/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

const path = require( "path" );

// Load any ENV variables defined in a .env file - before including any framework files:
// - If an env file path is provided via process arguments, use it; otherwise, default to CWD/.env
const envFilePath = ( () => {
    let envPath = path.join( process.cwd(), ".env" );
    try {
        const argv = Array.isArray( process.argv ) ? process.argv.slice( 2 ) : [];
        const aliases = [ "--env", "--env-file", "--dotenv", "--dotenv-path", "-e" ];
        for ( const key of aliases ) {
            const idx = argv.indexOf( key );
            if ( idx !== -1 && idx + 1 < argv.length ) {
                const value = argv[ idx + 1 ];
                if ( typeof value === "string" && !value.startsWith( "-" ) ) {
                    envPath = path.join( process.cwd(), value.trim() );
                    break;
                }
            }
        }
    } catch {
    }
    return envPath;
} )();

require( "@dotenvx/dotenvx" ).config( { path: envFilePath } );

const tools = require( "#tools" );
const logger = require( "#logger" );

// Configure the current instance variables before requiring any platform modules and store the necessary ones in memory cache:
process.env.TI_INSTANCE_ID = "ti-" + tools.getUUID();
process.env.TI_INSTANCE_CLASS = process.env.TI_INSTANCE_CLASS || "";

// Derive a safe default service domain name if not explicitly provided:
// - Normalize path separators
// - Strip directory and file extension
const defaultNameFromClass = ( () => {
    try {
        const normalized = ( process.env.TI_INSTANCE_CLASS || "" ).replace( /\\/g, "/" );
        const base = path.posix.basename( normalized );
        const name = path.parse( base ).name;
        return name || "";
    } catch {
        return "";
    }
} )();

process.env.TI_INSTANCE_NAME = process.env.TI_INSTANCE_NAME || defaultNameFromClass;

// Configure the process termination handlers to ensure a graceful shutdown:

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

// This event will handle the process termination (Ctrl + C):
process.on( "SIGINT", () => {
    logger.log( `SIGINT event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// This event will handle the process termination via terminal hangup (CMD close) - not delivered on all platforms:
process.on( "SIGHUP", () => {
    logger.log( `SIGHUP event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// This event will handle the process termination:
process.on( "SIGTERM", () => {
    logger.log( `SIGTERM event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// Handle Windows console break (Ctrl + Break):
process.on( "SIGBREAK", () => {
    logger.log( `SIGBREAK event detected in main instance process.`, logger.logSeverity.NOTICE );
    shutDownInstance( 0 );
} );

// Configure the process general error handlers:

process.on( "unhandledRejection", ( reason ) => {
    // Check if the fail-fast behavior has been forcefully disabled:
    const failFastDisabled = tools.toBool( process.env.TI_FAIL_FAST_ON_UNHANDLED_OFF || "" );
    logger.log( `Unhandled promise rejection identified! Make sure this isn't a software bug.`, logger.logSeverity.WARNING, {
        reason: tools.errorToJSON && reason instanceof Error ? tools.errorToJSON( reason ) : reason
    } );
    if ( failFastDisabled !== true ) {
        setImmediate( () => process.exit( 1 ) );
    }
} );

process.on( "multipleResolves", ( type, promise, reason ) => {
    logger.log( `Multiple promise resolves detected! Make sure this isn't a software bug.`, logger.logSeverity.WARNING, {
        type,
        reason: tools.errorToJSON && reason instanceof Error ? tools.errorToJSON( reason ) : reason
    } );
} );

process.on( "uncaughtException", ( error ) => {
    logger.log( `Some nasty and uncaught error just occurred in the application!`, logger.logSeverity.ALERT, error );
    setImmediate( () => process.exit( 1 ) );
} );

// Start the instance:
try {
    logger.log( `Starting new instance of type '${ process.env.TI_INSTANCE_NAME }' with instance ID '${ process.env.TI_INSTANCE_ID }'.`, logger.logSeverity.NOTICE );

    const serviceConstructor = require( path.join( process.cwd(), process.env.TI_INSTANCE_CLASS ) );
    const serviceConfigPath = process.env.TI_INSTANCE_CONFIG;
    /** @type ServiceConfiguration */
    let serviceConfig = {};
    if ( serviceConfigPath ) {
        serviceConfig = require( path.join( process.cwd(), process.env.TI_INSTANCE_CONFIG ) );
    }
    /** @type ServiceInstance */
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
        logger.log( `Attempting to start a module that does not implement the ServiceInstance abstract class!`, logger.logSeverity.CRITICAL );
        setImmediate( () => process.exit( 1 ) );
    }
} catch ( error ) {
    logger.log( `Error detected in the instance startup script!`, logger.logSeverity.ALERT, error );
    setImmediate( () => process.exit( 1 ) );
}