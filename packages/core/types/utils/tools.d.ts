export declare var getUUID: () => string;
export declare var deepFreeze: (object: Object, seen?: WeakSet<any>) => Object;
export { createEnum as enum };
export declare var getEnumName: (enumList: TiEnum, enumValue: number | string, placeholder?: string) => string | undefined;
export declare var errorToJSON: (value: Error) => Object;
export declare var toBool: (value: any) => boolean;
export declare var arrayUniques: (array: any[]) => any[];
export declare var getUTCDateString: (date: Date) => string;
export declare var getUTCTimeString: (date: Date, useMilliseconds?: boolean) => string;
export declare var decycle: (object: Object, replacer?: (value: Object) => Object) => Object;
export declare var retrocycle: ($: Object) => Object;
export declare var stringifyJSON: (value: Object) => string | any;
export declare var isJsonString: (string: string) => boolean;
export declare var parseJSON: (value: string) => Object | string;
export declare var decomposeJSON: (input: Object) => string | null;
export declare var constantTimeEquals: (a: any, b: any) => boolean;
export { RetryPolicy };
export declare var whenAllSettled: (promises: Array<Promise<any> | any>) => Promise<Array<any>>;
export { KeyedLock };
import type { TiEnum, TiEnumOf } from "#definitions";
/**
 * Used to create a custom Enum list.
 *
 * @method
 * @template {Record<string,*>} T
 * @param {T} seed
 * @returns {TiEnumOf<T>}
 * @public
 */
declare const createEnum: <T extends Record<string, any>>(seed: T) => TiEnumOf<T>;
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
     * @param {(...args: *[]) => Promise<*>} operation Operation to be executed; must return a Promise.
     * @param {Array<*>} [params=[]] The arguments to be provided to the operation upon execution.
     * @returns {Promise}
     * @public
     */
    execute(context: Object, operation: (...args: any[]) => Promise<any>, params?: Array<any>): Promise<any>;
    /**
     * Used to register a method that will be automatically called on a failed execution attempt.
     *
     * @method
     * @param {(error: Error) => void} action The execution error will be provided as an argument.
     * @public
     */
    onFailedAttempt(action: (error: Error) => void): void;
    /**
     * Used to register a method that will be automatically called on each execution retry (after the initial one).
     *
     * @method
     * @param {(attempt: number, lastError: Error|undefined) => void} action The current attempt and last error are provided.
     * @public
     */
    onRetry(action: (attempt: number, lastError: Error | undefined) => void): void;
}
/**
 * Used to run tasks that touch the same keys one at a time, in the order they arrived: an in-process lock for a
 * read-check-write that takes more than one round trip to a store.
 * <br/>
 * Without one, two requests that read a document, check it and write it back interleave: both read version N, both
 * pass the check, and the second write erases the first. A task queued for a key waits until every task queued before
 * it for that key has settled. A task may hold several keys, a change spanning two documents, and then waits for the
 * earlier tasks on all of them. Queueing is synchronous, so a task only ever waits for tasks queued before it, and no
 * two tasks can wait for each other. A task that fails releases its keys like one that succeeds, so one refusal never
 * stalls the tasks behind it.
 * <br/>
 * NOTE: A key is held until the task's promise settles, and no longer. A task must therefore not settle before every
 * write it started has: over parallel writes, that means {@link whenAllSettled}, not `Promise.all`, which settles at the
 * first failure while the other writes are still in flight. A task must also never ask for a key it already holds:
 * it would wait for itself, and every later task on that key would wait with it. The lock orders tasks within one
 * process, and nothing here orders writes between instances.
 *
 * @class KeyedLock
 * @public
 */
declare class KeyedLock {
    #private;
    /**
     * Used to run a task once every task queued before it for any of the given keys has settled, holding those keys
     * until it settles in turn.
     *
     * @method
     * @param {string|Array<string>} keys The key or keys the task needs held. A key named twice is held once.
     * @param {function(): (Promise<*>|*)} task Started when its turn comes. A synchronous throw counts as a rejection.
     * @returns {Promise<*>} The task's own outcome: its value, or its rejection.
     * @throws {TypeError} When no key is given, a key is not a non-empty string, or the task is not a function.
     * @public
     */
    exclusively(keys: string | Array<string>, task: Function): Promise<any>;
}
