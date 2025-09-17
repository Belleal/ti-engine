/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "#tools" );
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );

/**
 * @typedef {Object} TiTraceEntry
 * @property {string} chainID
 * @property {string} dispatchEvent
 * @property {string} fromAddress
 * @property {string} messageID
 * @property {Object} messageSnapshot
 * @property {string} messageState
 * @property {string} messageType
 * @property {string} toAddress
 * @property {string} traceID
 * @property {number} traceTimestamp
 */

const traceRoot = {
    trace: []
};
const UNKNOWN_TOKEN = "UNKNOWN";

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
 * Used for recording message trace entries.
 *
 * @class MessageTracer
 * @singleton
 * @public
 */
class MessageTracer {

    static #instance = null;

    /**
     * @constructor
     * @return {MessageTracer}
     */
    constructor() {
        if ( !MessageTracer.#instance ) {
            MessageTracer.#instance = this;
        }
        return MessageTracer.#instance;
    }

    /* Public interface */

    /**
     * Used to initialize the message tracer.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize() {
        return new Promise( ( resolve, reject ) => {
            cache.instance.setJSON( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY ), traceRoot, "$", 1 ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                // If JSON is unsupported in Redis server, the trace will use a Set later, so we can resolve the promise:
                if ( error.code === exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED ) {
                    resolve();
                } else {
                    reject( exceptions.raise( error ) );
                }
            } );
        } );
    }

    /**
     * Used to create a trace entry for the provided {@link Message} and parameters.
     * <br/>
     * NOTE: By default, all trace events are stored in the memory cache for further processing and analysis. The
     * location is configured in the MESSAGE_EXCHANGE_TRACE_REPOSITORY setting.
     * <br/>
     * NOTE: Trace events are logged with severity level NOTICE or ERROR for failed dispatches. They still might be
     * filtered out if the minimum log level setting is set too high.
     *
     * @method
     * @param {Message} message The message to trace.
     * @param {TiMessageType} messageType The type of the message.
     * @param {TiDispatchEvent} dispatchEvent The event in the dispatch system that triggered the trace entry.
     * @param {TiMessageState} messageState The state of the message processing.
     * @public
     */
    recordTraceEntry( message, messageType, dispatchEvent, messageState ) {
        // Depending on whether the message comes as a request or response, the from and to addresses will be opposite:
        let source = message.source.route + "." + message.source.instanceID;
        let destination = message.destination.route + ( ( message.destination.instanceID != null ) ? "." + message.destination.instanceID : "" );
        let messageSnapshot = MessageTracer.#obscureSensitiveData( message );
        delete messageSnapshot.chainID;
        delete messageSnapshot.messageID;
        let currentDate = new Date();

        /** @type TiTraceEntry */
        let traceEntry = {
            chainID: message.chainID,
            dispatchEvent: dispatchEventEnum.name( dispatchEvent, UNKNOWN_TOKEN ),
            fromAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? source : destination,
            messageID: message.messageID,
            messageSnapshot: messageSnapshot,
            messageState: messageStateEnum.name( messageState, UNKNOWN_TOKEN ),
            messageType: messageTypeEnum.name( messageType, UNKNOWN_TOKEN ),
            toAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? destination : source,
            traceTimestamp: currentDate.getTime(),
            traceID: tools.getUUID()
        };

        // Only write the trace in the general log if this is enabled:
        if ( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_LOG_ENABLED ) === true ) {
            MessageTracer.#createLogEntry( traceEntry, ( dispatchEvent === dispatchEventEnum.FAILED ) ? logger.logSeverity.ERROR : logger.logSeverity.NOTICE );
        }

        // Add the trace entry to the repository in the memory cache:
        cache.instance.arrayAppendJSON( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY ), traceEntry, "$.trace" ).then( () => {
            // This will refresh the expiration time for the trace repository on each new record:
            let expiration = config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME );
            return ( expiration > 0 ) ? cache.instance.expireValue( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY ), expiration ) : expiration;
        } ).catch( ( error ) => {
            // If JSON is unsupported in Redis server, then try to store the trace entry in a Set:
            if ( error.code === exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED ) {
                cache.instance.addToSet( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY ), traceEntry ).catch( ( error ) => {
                    logger.log( `Failed to add message trace entry to the trace repository. While this will not prevent the application from running, it might still be a sign of a more serious problem!`, logger.logSeverity.WARNING, error );
                } );
            } else {
                logger.log( `Failed to add message trace entry to the trace repository. While this will not prevent the application from running, it might still be a sign of a more serious problem!`, logger.logSeverity.WARNING, error );
            }
        } );
    }

    /* Private interface */

    /**
     * Used to create a log entry from the trace entry.
     *
     * @method
     * @param {TiTraceEntry} traceEntry The trace entry to log.
     * @param {TiLogSeverity} severity The log entry severity.
     * @private
     */
    static #createLogEntry( traceEntry, severity ) {
        logger.log( MessageTracer.#formatLogEntry( traceEntry ), severity, traceEntry );
    }

    /**
     * Used to format trace entry into log-suitable string.
     *
     * @method
     * @param {TiTraceEntry} traceEntry
     * @return {string} Prepared trace info.
     * @private
     */
    static #formatLogEntry( traceEntry ) {
        return `Message(${ traceEntry.chainID || traceEntry.messageID }) Trace: '${ traceEntry.messageType } ${ traceEntry.dispatchEvent } ${ traceEntry.messageState }' From: '${ traceEntry.fromAddress }' To: '${ traceEntry.toAddress }'`;
    }

    /**
     * Used to obscure sensitive data in the message, remove the payload, and return a snapshot.
     *
     * @method
     * @param {Message} message
     * @returns {Message}
     * @private
     */
    static #obscureSensitiveData( message ) {
        /** @type Message */
        let messageSnapshot = tools.parseJSON( _.replace( tools.stringifyJSON( message ), /("\w*?pin\w*?"|"\w*?pass\w*?"|"\w*?otp\w*?"):"(.*?)"/gmi, "\"SENSITIVE_PROPERTY\":\"OBSCURED_BY_SYSTEM\"" ) );
        delete messageSnapshot.payload;
        return messageSnapshot;
    }

}

const instance = new MessageTracer();
module.exports.instance = Object.freeze( instance );