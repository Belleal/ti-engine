declare const _exported: Readonly<Auditing>;
export { _exported as instance };
import type { TiLogSeverity } from "#logger";
/** @import { TiLogSeverity } from "#logger" */
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
}
