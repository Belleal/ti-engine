/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const localization = require( "#localization" );

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
 * Used to extract information from an Exception and convert it to loggable data object.
 *
 * @method
 * @param {Exception} exception
 * @returns {{description, details: (*|undefined), exceptionID}}
 * @private
 */
const exceptionToLog = ( exception ) => {
    return {
        exceptionID: exception.id,
        description: localization.getLabel( exception.label ),
        details: !_.isEmpty( exception.data ) ? exception.data : undefined
    };
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
    const auditing = require( "#auditing" );

    if ( data instanceof Error ) {
        data = tools.errorToJSON( data );
    } else if ( exceptions.isException( data ) ) {
        data = exceptionToLog( data );
    } else if ( data.exception !== undefined && exceptions.isException( data.exception ) ) {
        data.exception = exceptionToLog( data.exception );
    }

    auditing.instance.log( message, level, thread, data );
};