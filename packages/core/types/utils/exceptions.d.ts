export { exceptionCodeEnum as exceptionCode };
export { httpCodeEnum as httpCode };
export { TiException };
export declare var raise: (source: any, data: any, exceptionID?: undefined, httpCode?: undefined) => TiException;
export declare var isException: (object: any) => boolean;
export type TiExceptionCode = number;
/**
 * Enum for listing all system-recognized exceptions.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiExceptionCode
 */
declare const exceptionCodeEnum: import("../components/definitions.types").TiEnumOf<{
    E_UNKNOWN_ERROR: (string | number)[];
    /** General exceptions - codes under 1xxx */
    E_GEN_JS_INTERNAL_ERROR: (string | number)[];
    E_GEN_ABSTRACT_CLASS_INIT: (string | number)[];
    E_GEN_ABSTRACT_METHOD_CALL: (string | number)[];
    E_GEN_INVALID_SERVICE_DOMAIN_NAME: (string | number)[];
    E_GEN_SYSTEM_CACHE_UNAVAILABLE: (string | number)[];
    E_GEN_BAD_SERVICE_HANDLER: (string | number)[];
    E_GEN_FEATURE_UNSUPPORTED: (string | number)[];
    E_GEN_INVALID_ARGUMENT_TYPE: (string | number)[];
    E_GEN_NOT_INITIALIZED: (string | number)[];
    E_GEN_UNALLOWED_OVERRIDE: (string | number)[];
    E_GEN_NOT_IMPLEMENTED: (string | number)[];
    /** Security & Administration exceptions - codes under 2xxx */
    E_SEC_INVALID_AUTH_TOKEN: (string | number)[];
    E_SEC_INVALID_EXPIRED_SESSION: (string | number)[];
    E_SEC_UNAUTHORIZED_ACCESS: (string | number)[];
    E_SEC_MESSAGE_TAMPERING_DETECTED: (string | number)[];
    E_SEC_UNRECOGNIZED_AUTH_METHOD: (string | number)[];
    /** Cross-Application Communication exceptions - codes under 3xxx */
    E_COM_GENERAL_ERROR: (string | number)[];
    E_COM_MESSAGE_SENDER_UNAVAILABLE: (string | number)[];
    E_COM_SERVICE_EXEC_TIMEOUT: (string | number)[];
    E_COM_SERVICE_NOT_REGISTERED: (string | number)[];
    E_COM_SERVICE_NOT_FOUND: (string | number)[];
    E_COM_SERVICE_HANDLER_NOT_FOUND: (string | number)[];
    E_COM_MESSAGE_RECEIVER_UNAVAILABLE: (string | number)[];
    E_COM_MESSAGE_EXCHANGE_BROKEN: (string | number)[];
    E_COM_SERVICE_EXEC_FAILED: (string | number)[];
    E_COM_RETRY_ATTEMPTS_EXCEEDED: (string | number)[];
    /** Web server exceptions - codes under 4xxx */
    E_WEB_INVALID_REQUEST_METHOD: (string | number)[];
    E_WEB_INVALID_REQUEST_URI: (string | number)[];
    E_WEB_INVALID_REQUEST_BODY: (string | number)[];
    E_WEB_INVALID_REQUEST_QUERY: (string | number)[];
    E_WEB_INVALID_REQUEST_HEADERS: (string | number)[];
    E_WEB_INVALID_REQUEST_PARAMETERS: (string | number)[];
    E_WEB_INVALID_REQUEST_FORMAT: (string | number)[];
    E_WEB_INVALID_REQUEST_CONTENT_TYPE: (string | number)[];
    E_WEB_INVALID_REQUEST_CONTENT_LENGTH: (string | number)[];
    E_WEB_INVALID_REQUEST_CONTENT_ENCODING: (string | number)[];
    /** Application exceptions - codes under 5xxx */
    E_APP_RESOURCE_NOT_FOUND: (string | number)[];
    E_APP_SERVICE_ERROR: (string | number)[];
    E_APP_RESOURCE_ALREADY_EXISTS: (string | number)[];
}>;
export type TiHttpCode = number;
/**
 * Enum for listing all HTTP codes.
 *
 * @readonly
 * @enum {number}
 * @typedef {number} TiHttpCode
 */
declare const httpCodeEnum: import("../components/definitions.types").TiEnumOf<{
    /** 1xx informational response */
    C_100: (string | number)[];
    C_101: (string | number)[];
    C_102: (string | number)[];
    C_103: (string | number)[];
    /** 2xx success */
    C_200: (string | number)[];
    C_201: (string | number)[];
    C_202: (string | number)[];
    C_203: (string | number)[];
    C_204: (string | number)[];
    C_205: (string | number)[];
    C_206: (string | number)[];
    C_207: (string | number)[];
    C_208: (string | number)[];
    C_226: (string | number)[];
    /** 3xx redirection */
    C_300: (string | number)[];
    C_301: (string | number)[];
    C_302: (string | number)[];
    C_303: (string | number)[];
    C_304: (string | number)[];
    C_307: (string | number)[];
    C_308: (string | number)[];
    /** 4xx client errors */
    C_400: (string | number)[];
    C_401: (string | number)[];
    C_403: (string | number)[];
    C_404: (string | number)[];
    C_405: (string | number)[];
    C_406: (string | number)[];
    C_407: (string | number)[];
    C_408: (string | number)[];
    C_409: (string | number)[];
    C_410: (string | number)[];
    C_411: (string | number)[];
    C_412: (string | number)[];
    C_413: (string | number)[];
    C_414: (string | number)[];
    C_415: (string | number)[];
    C_416: (string | number)[];
    C_417: (string | number)[];
    C_421: (string | number)[];
    C_422: (string | number)[];
    C_423: (string | number)[];
    C_424: (string | number)[];
    C_425: (string | number)[];
    C_426: (string | number)[];
    C_428: (string | number)[];
    C_429: (string | number)[];
    C_431: (string | number)[];
    C_451: (string | number)[];
    /** 5xx server errors */
    C_500: (string | number)[];
    C_501: (string | number)[];
    C_502: (string | number)[];
    C_503: (string | number)[];
    C_504: (string | number)[];
    C_505: (string | number)[];
    C_506: (string | number)[];
    C_507: (string | number)[];
    C_508: (string | number)[];
    C_510: (string | number)[];
    C_511: (string | number)[];
}>;
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
