export { messageTypeEnum as messageType };
export { dispatchEventEnum as dispatchEvent };
export { messageStateEnum as messageState };
declare const _exported: Readonly<MessageTracer>;
export { _exported as instance };
export type TiMessageType = number;
/**
 * Enum for listing message types.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiMessageType
 */
declare let messageTypeEnum: Object;
export type TiDispatchEvent = number;
/**
 * Enum for listing dispatch events.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiDispatchEvent
 */
declare let dispatchEventEnum: Object;
export type TiMessageState = number;
/**
 * Enum for listing message states.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiMessageState
 */
declare let messageStateEnum: Object;
/**
 * Used for recording message trace entries.
 *
 * @class MessageTracer
 * @singleton
 * @public
 */
declare class MessageTracer {
    #private;
    /**
     * @constructor
     * @return {MessageTracer}
     */
    constructor();
    /**
     * Used to initialize the message tracer.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize(): Promise<any>;
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
    recordTraceEntry(message: Message, messageType: TiMessageType, dispatchEvent: TiDispatchEvent, messageState: TiMessageState): void;
    /**
     * Used to create a log entry from the trace entry.
     *
     * @method
     * @param {TiTraceEntry} traceEntry The trace entry to log.
     * @param {TiLogSeverity} severity The log entry severity.
     * @private
     */
    private static #createLogEntry;
    /**
     * Used to format trace entry into log-suitable string.
     *
     * @method
     * @param {TiTraceEntry} traceEntry
     * @return {string} Prepared trace info.
     * @private
     */
    private static #formatLogEntry;
    /**
     * Used to obscure sensitive data in the message, remove the payload, and return a snapshot.
     *
     * @method
     * @param {Message} message
     * @returns {Message}
     * @private
     */
    private static #obscureSensitiveData;
}
