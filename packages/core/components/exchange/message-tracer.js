/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
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
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );
const { cacheCapability } = require( "#cache-capability" );

/** @import { Message, TiTraceSnapshot } from "#definitions" */

const UNKNOWN_TOKEN = "UNKNOWN";
const OBSCURED_TOKEN = "OBSCURED_BY_SYSTEM";

// What a trace keeps of a message: where it went, when, and how it ended. Named one by one, down to the fields of the
// objects it keeps, because the snapshot used to be the whole message less its payload and a few key names that looked
// like passwords, and so it kept every bearer token and every parameter value - e-mail addresses, reset codes, uploaded
// logs - in the cache (CA-589). The service address is the caller's own object, so a field it added would ride along
// too. A field a later version adds to the message stays out of the trace until somebody decides it belongs here.
const SNAPSHOT_FIELDS = Object.freeze( [
    "chainLevel",
    "createdOn",
    "executionTime",
    "finishedOn",
    "isCompleted",
    "isSuccessful",
    "predecessor",
    "successors"
] );
const SNAPSHOT_ROUTE_FIELDS = Object.freeze( [ "instanceID", "route" ] );
const SNAPSHOT_ADDRESS_FIELDS = Object.freeze( [ "serviceAlias", "serviceDomainName", "serviceVersion" ] );
// What a trace keeps of an exception: which one it was. Its description and data are the failing call's own words and
// values, which can be as personal as the parameters that caused them; its ID only when it is one the framework made,
// because a rejection with a plain object supplies its own.
const SNAPSHOT_EXCEPTION_FIELDS = Object.freeze( [ "code", "httpCode", "label" ] );
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enum for listing message types.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiMessageType
 */
let messageTypeEnum = tools.enum( {
    MESSAGE_REQUEST: [ 1000, "REQUEST", "" ],
    MESSAGE_RESPONSE: [ 1001, "RESPONSE", "" ]
} );
module.exports.messageType = messageTypeEnum;

/**
 * Enum for listing dispatch events.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiDispatchEvent
 */
let dispatchEventEnum = tools.enum( {
    DELIVERED: [ 1100, "DELIVERED", "When message delivery is confirmed." ],
    FAILED: [ 1101, "FAILED", "When message delivery has failed." ],
    RECEIVED: [ 1102, "RECEIVED", "When message was received." ],
    SENT: [ 1103, "SENT", "When message was sent." ]
} );
module.exports.dispatchEvent = dispatchEventEnum;

/**
 * Enum for listing message states.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiMessageState
 */
let messageStateEnum = tools.enum( {
    PENDING: [ 1200, "PENDING", "" ],
    PROCESSED: [ 1201, "PROCESSED", "" ]
} );
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

    /** Whether entries go to the memory cache; settled by {@link MessageTracer#initialize}. */
    #isRepositoryUsable = false;

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
     * <br/>
     * NOTE: Nothing is written here. Each chain's trace is a list of its own, created by its first entry and gone
     * `traceExpirationTime` seconds after its last one; see {@link MessageTracer#recordTraceEntry}.
     *
     * @method
     * @returns {Promise}
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If `traceExpirationTime` is not a whole number of seconds, 0 or more.
     * @public
     */
    initialize() {
        this.#isRepositoryUsable = false;
        if ( config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED ) === false ) {
            return Promise.resolve();
        }

        // Refused rather than passed on: anything that is not a whole number of seconds fails `expiration > 0`, and
        // that used to mean the trace was kept for good without anybody having asked for it.
        let expiration = config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME );
        if ( !Number.isSafeInteger( expiration ) || expiration < 0 ) {
            let given = Number.isNaN( expiration ) ? "an empty or non-numeric value" : `'${ expiration }'`;
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, {
                details: `The setting 'messageExchange.traceExpirationTime' (TI_MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME) must be a whole number of seconds, 0 or more, not ${ given }.`
            } ) );
        }

        // A backend that cannot hold a list, or cannot expire one, gets no trace at all: one that kept entries it could
        // never expire is the defect this guards (CA-589). Said once here instead of once for every message.
        let capabilities = cache.instance.capabilities;
        let missing = _.difference( [ cacheCapability.LISTS, cacheCapability.KEY_EXPIRY ], capabilities );
        if ( missing.length > 0 ) {
            logger.log( `The message trace is not stored: the cache backend does not provide ${ missing.join( " and " ) }.`, logger.logSeverity.WARNING );
            return Promise.resolve();
        }

        this.#isRepositoryUsable = true;
        return Promise.resolve();
    }

    /**
     * Used to create a trace entry for the provided {@link Message} and parameters.
     * <br/>
     * NOTE: Each chain's trace entries are stored in the memory cache, newest first, in a list of their own: the
     * MESSAGE_EXCHANGE_TRACE_REPOSITORY setting followed by `:` and the chain's ID (the message's ID if it has no
     * chain). Every entry sets the list to expire MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME seconds later, in the same
     * step as the push, so a chain's trace is gone that long after its last message. The
     * MESSAGE_EXCHANGE_TRACE_REPOSITORY_ENABLED setting turns the store off.
     * <br/>
     * NOTE: An entry never holds the message's auth token, its parameters, its payload, or an exception's description
     * and data. See {@link TiTraceSnapshot} for what it does hold.
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
        let isLogEnabled = config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_LOG_ENABLED ) === true;
        if ( isLogEnabled === false && this.#isRepositoryUsable === false ) {
            return;
        }

        // Depending on whether the message comes as a request or response, the from and to addresses will be opposite:
        let source = message.source.route + "." + message.source.instanceID;
        let destination = message.destination.route + ( ( message.destination.instanceID != null ) ? "." + message.destination.instanceID : "" );
        let currentDate = new Date();

        /** @type TiTraceEntry */
        let traceEntry = {
            chainID: message.chainID,
            dispatchEvent: dispatchEventEnum.name( dispatchEvent, UNKNOWN_TOKEN ),
            fromAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? source : destination,
            messageID: message.messageID,
            messageSnapshot: MessageTracer.#takeSnapshot( message ),
            messageState: messageStateEnum.name( messageState, UNKNOWN_TOKEN ),
            messageType: messageTypeEnum.name( messageType, UNKNOWN_TOKEN ),
            toAddress: ( messageType === messageTypeEnum.MESSAGE_REQUEST ) ? destination : source,
            traceTimestamp: currentDate.getTime(),
            traceID: tools.getUUID()
        };

        // Only write the trace in the general log if this is enabled:
        if ( isLogEnabled === true ) {
            MessageTracer.#createLogEntry( traceEntry, ( dispatchEvent === dispatchEventEnum.FAILED ) ? logger.logSeverity.ERROR : logger.logSeverity.NOTICE );
        }

        if ( this.#isRepositoryUsable === false ) {
            return;
        }

        // One list per chain, and its expiry set with each push: the whole trace used to be one key whose expiry every
        // write pushed back, so under steady traffic it never expired, and without RedisJSON it was a set with no
        // expiry at all (CA-589). A chain ends, so its list does too.
        // The push carries the expiry, so Redis sets both in one step and no stop in between can leave the list without
        // one. It is set again on its own for a backend written before `listPushValue` took an expiration: one that
        // ignores the argument would otherwise keep every chain's trace for good.
        let repository = config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_REPOSITORY ) + ":" + ( message.chainID || message.messageID );
        let expiration = config.getSetting( config.setting.MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME );
        cache.instance.listPushValue( repository, [ traceEntry ], ( expiration > 0 ) ? expiration : undefined ).then( () => {
            return ( expiration > 0 ) ? cache.instance.expireValue( repository, expiration ) : expiration;
        } ).catch( ( error ) => {
            logger.log( `Failed to add message trace entry to the trace repository. While this will not prevent the application from running, it might still be a sign of a more serious problem!`, logger.logSeverity.WARNING, error );
        } );
    }

    /* Private interface */

    /**
     * Used to create a log entry from the trace entry.
     *
     * @method
     * @param {TiTraceEntry} traceEntry The trace entry to log.
     * @param {TiLogSeverity} severity The log entry severity.
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
     */
    static #formatLogEntry( traceEntry ) {
        return `Message(${ traceEntry.chainID || traceEntry.messageID }) Trace: '${ traceEntry.messageType } ${ traceEntry.dispatchEvent } ${ traceEntry.messageState }' From: '${ traceEntry.fromAddress }' To: '${ traceEntry.toAddress }'`;
    }

    /**
     * Used to take the part of the message a trace keeps: the fields in `SNAPSHOT_FIELDS`, the route of its source and
     * destination, the service it addressed, whether it carried an auth token and parameters, and which exception the
     * call ended with.
     * <br/>
     * NOTE: Not even the parameters' names. A gateway that passes a client's request body on as the parameters lets the
     * client choose the names, so they can be data, and a call with many of them made an entry larger than the call.
     * <br/>
     * NOTE: The result is a copy, detached from the message, which keeps changing as it travels.
     *
     * @method
     * @param {Message} message
     * @returns {TiTraceSnapshot}
     */
    static #takeSnapshot( message ) {
        let snapshot = _.pick( message, SNAPSHOT_FIELDS );
        if ( _.isObjectLike( message.source ) ) {
            snapshot.source = _.pick( message.source, SNAPSHOT_ROUTE_FIELDS );
        }
        if ( _.isObjectLike( message.destination ) ) {
            snapshot.destination = _.pick( message.destination, SNAPSHOT_ROUTE_FIELDS );
        }
        if ( _.isObjectLike( message.serviceAddress ) ) {
            snapshot.serviceAddress = _.pick( message.serviceAddress, SNAPSHOT_ADDRESS_FIELDS );
        }
        if ( !_.isEmpty( message.authToken ) ) {
            snapshot.authToken = OBSCURED_TOKEN;
        }
        if ( message.serviceParams !== undefined && message.serviceParams !== null ) {
            snapshot.serviceParams = OBSCURED_TOKEN;
        }
        if ( _.isObjectLike( message.exception ) ) {
            snapshot.exception = _.pick( message.exception, SNAPSHOT_EXCEPTION_FIELDS );
            if ( _.isString( message.exception.id ) && UUID_PATTERN.test( message.exception.id ) ) {
                snapshot.exception.id = message.exception.id;
            }
        }
        // Through JSON, as the snapshot always was: a deep copy, and an undefined field is left out rather than kept.
        return tools.parseJSON( tools.stringifyJSON( snapshot ) );
    }

}

const instance = new MessageTracer();
module.exports.instance = Object.freeze( instance );