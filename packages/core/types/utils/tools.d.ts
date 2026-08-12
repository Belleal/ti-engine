export declare var getUUID: () => string;
export declare var deepFreeze: (object: Object, seen?: WeakSet<any>) => Object;
export { createEnum as enum };
export declare var getEnumName: (enumList: TiEnum, enumValue: number | string, placeholder?: string) => string | undefined;
export declare var errorToJSON: (value: Error) => Object;
export declare var toBool: (value: any) => boolean;
export declare var arrayUniques: (array: any[]) => any[];
export declare var getUTCDateString: (date: Date) => string;
export declare var getUTCTimeString: (date: Date, useMilliseconds?: boolean) => string;
export declare var decycle: (object: Object, replacer: Function) => Object;
export declare var retrocycle: ($: Object) => Object;
export declare var stringifyJSON: (value: Object) => string | any;
export declare var isJsonString: (string: string) => boolean;
export declare var parseJSON: (value: string) => Object | string;
export declare var decomposeJSON: (input: Object) => string | null;
export declare var constantTimeEquals: (a: any, b: any) => boolean;
export { RetryPolicy };
/**
 * Used to create a custom Enum list.
 *
 * @method
 * @param {Object} seed
 * @returns {Object} This is a {@link TiEnum} object. Setting the proper reference here would unfortunately break IDE support.
 * @public
 */
declare const createEnum: (seed: Object) => Object;
/**
 * Used to create retry policy for the execution of an operation.
 *
 * @class RetryPolicy
 * @public
 */
declare class RetryPolicy {
    #private;
    /**
     * @constructor
     * @param {number} maxAttempts The maximum number of attempts to execute the operation.
     * @throws {TypeError} maxAttempts must be a positive integer.
     */
    constructor(maxAttempts: number);
    /**
     * Used to start execution of the provided operation.
     *
     * @method
     * @param {Object} context The context in which the operation will be executed (i.e., this reference).
     * @param {function( ...* ): Promise<*>} operation Operation to be executed; must return a Promise.
     * @param {Array<*>} [params=[]] The arguments to be provided to the operation upon execution.
     * @returns {Promise}
     * @public
     */
    execute(context: Object, operation: Function, params?: Array<any>): Promise<any>;
    /**
     * Used to register a method that will be automatically called on a failed execution attempt.
     *
     * @method
     * @param {function( Error )} action The execution error will be provided as an argument.
     * @public
     */
    onFailedAttempt(action: Function): void;
    /**
     * Used to register a method that will be automatically called on each execution retry (after the initial one).
     *
     * @method
     * @param {function( number, (Error|undefined) )} action The current attempt and last error are provided.
     * @public
     */
    onRetry(action: Function): void;
    /**
     * Will retry the execution of operation up to max attempts.
     *
     * @method
     * @param {Object} context
     * @param {function( ...* ): Promise<*>} operation Operation to be executed; must return a Promise.
     * @param {Array<*>} params The arguments to be provided to the operation upon execution.
     * @param {number} attempt
     * @param {Error} error
     * @returns {Promise}
     * @private
     */
    private #retry;
}
