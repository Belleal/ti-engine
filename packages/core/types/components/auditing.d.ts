declare const _exported: Readonly<Auditing>;
export { _exported as instance };
/**
 * Used to create and/or return an Auditing System singleton instance.
 *
 * @class Auditing
 * @singleton
 * @public
 */
declare class Auditing {
    #private;
    /**
     * @constructor
     * @returns {Auditing}
     */
    constructor();
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
    log(message: string, severity?: TiLogSeverity, thread?: string, data?: Object): void;
    /**
     * Used to generate a new Log Entry object.
     *
     * @method
     * @param {TiLogSeverity} severity
     * @param {string} thread
     * @param {string} message
     * @param {Object} data
     * @returns {TiLogEntry}
     * @private
     */
    private static #createLogEntry;
    /**
     * Used to write the log entries to the system console (i.e., STD OUT and STD ERR).
     * <br/>
     * NOTE: There was an issue in previous Node versions with console that can crash the application if the number of
     * outputs exceeds several thousands per second. To be monitored and adjusted as necessary!
     *
     * @method
     * @param {TiLogEntry} logEntry
     * @private
     */
    private static #logToConsole;
    /**
     * Used to format a log entry for the Node console.
     *
     * @method
     * @param {TiLogEntry} logEntry
     * @returns {string}
     * @private
     */
    private static #formatConsoleMessage;
    /**
     * Used to format a log entry data payload for the Node console.
     *
     * @method
     * @param {*} data
     * @param {string} [prefix=""]
     * @param {number} [currentDepth=0]
     * @param {number} [maxDepth=5]
     * @param {Set} [visited=new Set()]
     * @returns {string}
     * @private
     */
    private static #formatConsoleData;
}
