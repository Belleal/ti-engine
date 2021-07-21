/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );

/**
 * Enum for specifying the log entry severity. This is based on the Google Stackdriver severity levels.
 *
 * @readonly
 * @enum {number}
 */
let logSeverityEnum = tools.enum( {
    DEFAULT: [ 0, "default", "The log entry has no assigned severity level." ],
    DEBUG: [ 100, "debug", "Debug or trace information." ],
    INFO: [ 200, "info", "Routine information, such as ongoing status or performance." ],
    NOTICE: [ 300, "notice", "Normal but significant events, such as start up, shut down, or a configuration change." ],
    WARNING: [ 400, "warning", "Warning events might cause problems." ],
    ERROR: [ 500, "error", "Error events are likely to cause problems." ],
    CRITICAL: [ 600, "critical", "Critical events cause more severe problems or outages." ],
    ALERT: [ 700, "alert", "A person must take an action immediately." ],
    EMERGENCY: [ 800, "emergency", "One or more systems are unusable." ]
} );

/**
 * @typedef {number} TiLogSeverity
 */
module.exports.logSeverity = logSeverityEnum;

/**
 * Used to safely return the name of a severity code.
 *
 * @method
 * @param {TiLogSeverity} severity
 * @returns {string}
 */
module.exports.getSeverityName = ( severity ) => {
    return tools.getEnumName( logSeverityEnum, severity, "unknown" );
};

/**
 * Used to generate and store a log entry in the active cache.
 *
 * @method
 * @param {string} message The primary log message.
 * @param {TiLogSeverity} [level=DEFAULT] The log severity level. If the current log filtering setting is higher than this then the log entry will be ignored.
 * @param {Object|Error|Exception} [data={}] Optional JSON data containing details of the log entry.
 * @param {string} [thread='main'] The logging thread to which the log entry belongs.
 * @public
 */
module.exports.log = ( message, level = logSeverityEnum.DEFAULT, data = {}, thread = "main" ) => {
    /** @type {Auditing} */
    const auditing = require( "#auditing" );

    if ( data instanceof Error ) {
        data = tools.errorToJSON( data );
    } else if ( exceptions.isException( data ) ) {
        data = {
            id: data.id,
            description: data.description,
            details: !_.isEmpty( data.data ) ? data.data : undefined
        };
    }

    auditing.log( message, level, thread, data );
};
