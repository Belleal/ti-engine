export { logSeverityEnum as logSeverity };
export declare var getSeverityName: (severity: TiLogSeverity) => string;
export declare var log: (message: string, level?: TiLogSeverity, data?: Object | Error | TiException, thread?: string) => void;
import type { TiException } from "#exceptions";
export type TiLogSeverity = number;
/** @import { TiException } from "#exceptions" */
/**
 * Enum for specifying the log entry severity. This is based on the Google Stackdriver severity levels.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiLogSeverity
 */
declare const logSeverityEnum: import("../components/definitions.types").TiEnumOf<{
    DEFAULT: (string | number)[];
    DEBUG: (string | number)[];
    INFO: (string | number)[];
    NOTICE: (string | number)[];
    WARNING: (string | number)[];
    ERROR: (string | number)[];
    CRITICAL: (string | number)[];
    ALERT: (string | number)[];
    EMERGENCY: (string | number)[];
}>;
