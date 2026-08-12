export { logSeverityEnum as logSeverity };
export declare var getSeverityName: (severity: TiLogSeverity) => string;
export declare var log: (message: string, level?: TiLogSeverity, data?: Object | Error | TiException, thread?: string) => void;
export type TiLogSeverity = number;
/**
 * Enum for specifying the log entry severity. This is based on the Google Stackdriver severity levels.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiLogSeverity
 */
declare const logSeverityEnum: Object;
