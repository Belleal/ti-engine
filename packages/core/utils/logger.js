/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const _ = require( "lodash" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const localization = require( "#localization" );

/** @import { TiException } from "#exceptions" */

/**
 * Enum for specifying the log entry severity. This is based on the Google Stackdriver severity levels.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiLogSeverity
 */
const logSeverityEnum = tools.enum( {
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
module.exports.logSeverity = logSeverityEnum;

/**
 * Used to safely return the name of a severity code.
 *
 * @method
 * @param {TiLogSeverity} severity
 * @returns {string}
 */
module.exports.getSeverityName = ( severity ) => {
    return logSeverityEnum.name( severity, "unknown" );
};

/**
 * Used to extract information from a {@link TiException} and convert it to a loggable data object.
 *
 * @method
 * @param {TiException} exception
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
 * Used to generate and store a new log entry via the active {@link Auditing} instance.
 *
 * @method
 * @param {string} message The primary log message.
 * @param {TiLogSeverity} [level=DEFAULT] The log severity level. If the current log filtering setting is higher than this, then the log entry will be ignored.
 * @param {Object|Error|TiException} [data={}] Optional JSON data containing details of the log entry.
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