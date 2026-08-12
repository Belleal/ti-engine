export { exceptionCodeEnum as exceptionCode };
export { httpCodeEnum as httpCode };
export declare var raise: (source: Error | TiExceptionCode | TiException, data?: Object, exceptionID?: string, httpCode?: TiHttpCode) => TiException;
export declare var isException: (object: any) => boolean;
export type TiExceptionCode = number;
/**
 * Enum for listing all system-recognized exceptions.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiExceptionCode
 */
declare const exceptionCodeEnum: Object;
export type TiHttpCode = number;
/**
 * Enum for listing all HTTP codes.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiHttpCode
 */
declare const httpCodeEnum: Object;
/**
 * Represents an any-purpose exception.
 *
 * @class TiException
 * @public
 */
declare class TiException {
    #private;
    /**
     * @constructor
     * @param {string} id The unique ID to be assigned to this exception.
     * @param {TiExceptionCode} exceptionCode An unique exception identifier. If this is not recognized, the default error code will be used instead.
     * @param {Object} [data={}] Any additional data to insert into the exception.
     * @param {string} [description=undefined] Description of the exception.
     */
    constructor(id: string, exceptionCode: TiExceptionCode, data?: Object, description?: string);
    /**
     * Unique identifier of the exception instance. Can be used for tracing problems with customer support cases.
     *
     * @property
     * @returns {string}
     * @public
     */
    get id(): string;
    /**
     * Identifier code of the exception type.
     *
     * @property
     * @returns {TiExceptionCode}
     * @public
     */
    get code(): TiExceptionCode;
    /**
     * HTTP error code if relevant.
     *
     * @property
     * @returns {TiHttpCode}
     * @public
     */
    get httpCode(): TiHttpCode;
    /**
     * HTTP error code if relevant.
     *
     * @property
     * @param {TiHttpCode} httpCode
     * @public
     */
    set httpCode(httpCode: TiHttpCode);
    /**
     * Localized label identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get label(): string;
    /**
     * Description or additional technical information that is NOT localized.
     *
     * @property
     * @returns {string}
     * @public
     */
    get description(): string;
    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @property
     * @returns {Object}
     * @public
     */
    get data(): Object;
    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @property
     * @param {Object} data
     * @public
     */
    set data(data: Object);
    /**
     * Extracts the essential information about the {@link TiException} and returns it as JSON.
     *
     * @method
     * @param {boolean} [includeData=true] Whether to include the data property in the output.
     * @returns {Object}
     * @public
     */
    asJSON(includeData?: boolean): Object;
}
