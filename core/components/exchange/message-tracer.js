/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const tools = require( "#tools" );
const config = require( "#config" );
const logger = require( "#logger" );

/**
 * @typedef {Object} TiTraceEntry
 * @property {string} chainID
 * @property {string} dispatchEvent
 * @property {string} fromAddress
 * @property {string} messageID
 * @property {string} messageSnapshot
 * @property {string} messageState
 * @property {string} messageType
 * @property {string} toAddress
 * @property {string} traceID
 */

/**
 * Enum for listing message types.
 *
 * @readonly
 * @enum {number}
 */
let messageTypeEnum = tools.enum( {
    MESSAGE_REQUEST: [ 1000, "REQUEST", "" ],
    MESSAGE_RESPONSE: [ 1001, "RESPONSE", "" ]
} );

/**
 * @typedef {number} TiMessageType
 */
module.exports.messageType = messageTypeEnum;

/**
 * Enum for listing dispatch events.
 *
 * @readonly
 * @enum {number}
 */
let dispatchEventEnum = tools.enum( {
    DELIVERED: [ 1100, "DELIVERED", "When message delivery is confirmed." ],
    FAILED: [ 1101, "FAILED", "When message delivery has failed." ],
    RECEIVED: [ 1102, "RECEIVED", "When message was received." ],
    SENT: [ 1103, "SENT", "When message was sent." ]
} );

/**
 * @typedef {number} TiDispatchEvent
 */
module.exports.dispatchEvent = dispatchEventEnum;

/**
 * Enum for listing message states.
 *
 * @readonly
 * @enum {number}
 */
let messageStateEnum = tools.enum( {
    PENDING: [ 1200, "PENDING", "" ],
    PROCESSED: [ 1201, "PROCESSED", "" ]
} );

/**
 * @typedef {number} TiMessageState
 */
module.exports.messageState = messageStateEnum;

/**
 * Used to create a log entry from the trace entry.
 *
 * @method
 * @param {TiTraceEntry} traceEntry The trace entry to log.
 * @param {TiLogSeverity} severity The log entry severity.
 * @private
 */
let createLogEntry = ( traceEntry, severity ) => {
    logger.log( formatLogEntry( traceEntry ), severity, traceEntry );
};

/**
 * Used to format trace entry into log-suitable string.
 *
 * @method
 * @param {TiTraceEntry} traceEntry
 * @return {string} Prepared trace info.
 * @private
 */
let formatLogEntry = ( traceEntry ) => {
    return `Message(${ traceEntry.chainID || traceEntry.messageID }) Trace: '${ traceEntry.messageType } ${ traceEntry.dispatchEvent } ${ traceEntry.messageState }' From: '${ traceEntry.fromAddress }' To: '${ traceEntry.toAddress }'`;
};

/**
 * Used to obscure sensitive data in the message snapshot and convert it to string.
 *
 * @method
 * @param {Message} message
 * @returns {string}
 * @private
 */
let obscureSensitiveData = ( message ) => {
    let messageSnapshot = tools.stringifyJSON( message );
    return _.replace( messageSnapshot, /("\w*?pin\w*?"|"\w*?pass\w*?"|"\w*?otp\w*?"):"(.*?)"/gmi, "\"SENSITIVE_PROPERTY\":\"OBSCURED_BY_SYSTEM\"" );
};

/**
 * Used to create a trace entry for the provided {@link Message} and parameters.
 * NOTE: With the exception of failed message delivery, trace events are logged with severity level DEBUG.
 *
 * @method
 * @param {Message} message The message to trace.
 * @param {TiMessageType} messageType The type of the message.
 * @param {TiDispatchEvent} dispatchEvent The event in the dispatch system that triggered the trace entry.
 * @param {TiMessageState} messageState The state of the processing of the message.
 * @public
 */
module.exports.recordTraceEntry = ( message, messageType, dispatchEvent, messageState ) => {
    // depending on whether the message comes as request or response, the from and to addresses will be opposite:
    let source = message.source.route + "." + message.source.instanceID;
    let destination = message.destination.route + ( ( message.destination.instanceID != null ) ? "." + message.destination.instanceID : "" );

    /** @type TiTraceEntry */
    let traceEntry = {
        chainID: message.chainID,
        dispatchEvent: tools.getEnumName( dispatchEventEnum, dispatchEvent ),
        fromAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? source : destination,
        messageID: message.messageID,
        messageSnapshot: obscureSensitiveData( message ),
        messageState: tools.getEnumName( messageStateEnum, messageState ),
        messageType: tools.getEnumName( messageTypeEnum, messageType ),
        toAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? destination : source,
        traceID: tools.getUUID()
    };

    if ( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_LOG_ENABLED ) === true ) {
        createLogEntry( traceEntry, ( dispatchEvent === dispatchEventEnum.FAILED ) ? logger.logSeverity.ERROR : logger.logSeverity.DEBUG );
    }

    // TODO Feature: Functionality that can dispatch the trace entry to a configurable database and/or monitoring system.
};
