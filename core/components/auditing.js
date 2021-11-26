/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const tools = require( "#tools" );
const logger = require( "#logger" );
const config = require( "#config" );
const gcloud = require( "#gcloud-integration" );

/**
 * @typedef {Object} LogEntry
 * @property {string} _id Unique identifier that can be used to identify the document in a NoSQL database.
 * @property {TiLogSeverity} severity The log severity level.
 * @property {string} thread The categorization of the log message.
 * @property {string} reporter
 * @property {string} message The actual log message.
 * @property {number} timestamp The timestamp of the log entry in UTC time.
 * @property {Object} data Additional JSON data to accompany the message.
 */

/**
 * Used to create and/or return an Auditing System singleton instance.
 *
 * @class Auditing
 * @singleton
 * @public
 */
class Auditing {

    static #instance = null;

    /**
     * @constructor
     * @returns {Auditing}
     */
    constructor() {
        if ( !Auditing.#instance ) {
            Auditing.#instance = this;
        }
        return Auditing.#instance;
    }

    /* Public interface */

    /**
     * Used to generate a log entry and dispatch it to all enabled logging destinations.
     *
     * @method
     * @param {string} message The primary log message.
     * @param {TiLogSeverity} [severity=DEFAULT] The log severity level. If the current log filtering setting is higher than this then the log entry will be ignored.
     * @param {string} [thread='main'] The logging thread to which the log entry belongs.
     * @param {Object} [data={}] Optional JSON data containing details of the log entry.
     * @public
     */
    log( message, severity = logger.logSeverity.DEFAULT, thread = "main", data = {} ) {
        try {
            // log entries bellow the min allowed level will be ignored:
            if ( severity >= config.getSetting( config.setting.AUDITING_LOG_MIN_LEVEL ) ) {
                // obscure any passwords that might have landed in the data object;
                // also make sure to convert a potential Error object to a JSON:
                let copyOfData = ( config.getSetting( config.setting.AUDITING_LOG_DETAILS ) === true ) ? _.cloneDeep( data ) : undefined;
                let logEntry = Auditing.#createLogEntry( severity, thread, message, copyOfData );

                // make sure there is a console available:
                if ( config.getSetting( config.setting.AUDITING_LOG_CONSOLE_ENABLED ) === true && console ) {
                    Auditing.#logToConsole( logEntry );
                }

                // if this is an actual error, then send it to GCloud error reporting system as well:
                if ( logEntry.severity >= logger.logSeverity.WARNING && data instanceof Error && gcloud.isEnabled() ) {
                    gcloud.reportError( data );
                }
            }
        } catch ( error ) {
            // do nothing here for now...
        }
    }

    /* Private interface */

    /**
     * Used to generate a new Log Entry object.
     *
     * @method
     * @param {TiLogSeverity} severity
     * @param {string} thread
     * @param {string} message
     * @param {Object} data
     * @returns {LogEntry}
     * @private
     */
    static #createLogEntry( severity, thread, message, data ) {
        let currentDate = new Date();
        let logDate = tools.getUTCDateString( currentDate );
        let logTime = tools.getUTCTimeString( currentDate, true );
        let reporter = process.env.TI_INSTANCE_ID;

        return {
            _id: `${ logDate }-${ logTime }-${ thread }-${ reporter }-${ logger.getSeverityName( severity ) }-${ tools.getUUID() }`,
            severity: severity,
            thread: thread,
            reporter: reporter,
            message: message,
            timestamp: currentDate.getTime(),
            data: data
        };
    }

    /**
     * Used to write the log entries to the system console (i.e. STD OUT and STD ERR).
     * <br/>
     * NOTE: There was an issue in previous Node versions with console that can crash the application if the number of
     *    outputs exceeds several thousands per second. To be monitored and adjusted as necessary!
     *
     * @method
     * @param {LogEntry} logEntry
     * @private
     */
    static #logToConsole( logEntry ) {
        if ( config.getSetting( config.setting.AUDITING_LOG_USES_JSON ) === true ) {
            if ( logEntry.severity >= logger.logSeverity.WARNING ) {
                console.error( tools.stringifyJSON( logEntry ) );
            } else {
                console.log( tools.stringifyJSON( logEntry ) );
            }
        } else {
            console.log( Auditing.#formatConsoleMessage( logEntry ) );
            if ( !_.isEmpty( logEntry.data ) ) {
                console.log( `   » ${ Auditing.#formatConsoleData( logEntry ) }` );
            }
        }
    }

    /**
     * Used to format a log entry for the Node console.
     *
     * @method
     * @param {LogEntry} logEntry
     * @returns {string}
     * @private
     */
    static #formatConsoleMessage( logEntry ) {
        let logDate = new Date( logEntry.timestamp );
        return `${ tools.getUTCDateString( logDate ) }, ${ tools.getUTCTimeString( logDate, true ) } (UTC): ${ logEntry.reporter } - ${ logger.getSeverityName( logEntry.severity ) } - ${ logEntry.message }`;
    }

    /**
     * Used to format a log entry data payload for the Node console.
     *
     * @method
     * @param {LogEntry} logEntry
     * @returns {string}
     * @private
     */
    static #formatConsoleData( logEntry ) {
        return tools.stringifyJSON( logEntry.data );
    }
}

const instance = new Auditing();
module.exports = Object.freeze( instance );
