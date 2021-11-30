/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const tools = require( "#tools" );

/**
 * Enum for listing all system-recognized exceptions.
 *
 * @readonly
 * @enum {number}
 */
let exceptionCodeEnum = tools.enum( {
    E_UNKNOWN_ERROR: [ 0, "unknown error", "Unidentified error encountered or unrecognized exception code provided." ],
    /** General exceptions - codes under 1xxx */
    E_GEN_JS_INTERNAL_ERROR: [ 1000, "js internal error", "Error thrown by internal JS source." ],
    E_GEN_ABSTRACT_CLASS_INIT: [ 1001, "abstract class init", "Attempt to construct an abstract class detected." ],
    E_GEN_ABSTRACT_METHOD_CALL: [ 1002, "abstract method call", "Attempt to call an abstract method detected." ],
    E_GEN_INVALID_SERVICE_DOMAIN_NAME: [ 1003, "invalid service domain name", "Invalid or no service domain name provided at microservice startup." ],
    E_GEN_SYSTEM_CACHE_UNAVAILABLE: [ 1004, "system cache unavailable", "The system cache required for proper engine operation is unavailable." ],
    E_GEN_BAD_SERVICE_HANDLER: [ 1005, "bad service handler", "The provided service handler is not a proper function." ],
    /** Security & Administration related exceptions - codes under 2xxx */
    E_SEC_INVALID_AUTH_TOKEN: [ 2000, "invalid auth token", "Invalid authorization token provided." ],
    E_SEC_INVALID_EXPIRED_SESSION: [ 2001, "invalid or expired session", "Invalid or expired session encountered." ],
    E_SEC_UNAUTHORIZED_ACCESS: [ 2002, "unauthorized access", "Attempt for unauthorized access detected." ],
    /** Cross-Application Communication exceptions - codes under 3xxx */
    E_COM_GENERAL_ERROR: [ 3000, "general communication error", "General error during cross-application communication." ],
    E_COM_MESSAGE_SENDER_UNAVAILABLE: [ 3001, "message sender unavailable", "The message sender instance is currently unavailable." ],
    E_COM_SERVICE_EXEC_TIMEOUT: [ 3002, "service exec timeout", "The execution of a service could not complete within the allowed timeout." ],
    E_COM_SERVICE_NOT_REGISTERED: [ 3003, "service not registered", "The specified service is not found in the service registry." ],
    E_COM_SERVICE_NOT_FOUND: [ 3004, "service not found", "The specified service is not found in the service definition interface." ],
    E_COM_SERVICE_HANDLER_NOT_FOUND: [ 3005, "service handler not found", "No handler found in the interface for the specified service or service version." ],
    // E_COM_UNRECOGNIZED_API_URL: [ 301, "unrecognized api url", "Attempt to access unrecognized or invalid API URL." ],
    // E_COM_MISSING_REQUIRED_ARGUMENTS: [ 302, "missing required arguments", "Attempt to execute operation without all required arguments." ],
    // E_COM_UNRECOGNIZED_RESPONSE_STRUCTURE: [ 303, "unrecognized response structure", "The received response has unrecognized structure and cannot be parsed or examined." ],
    // E_COM_RECEIVED_ERROR_RESPONSE: [ 304, "received error response", "The received response indicates error in the external system." ],
    // E_COM_JSON_RPC_DATA_INVALID: [ 305, "json rpc data invalid", "The JSON RPC 2.0 data being verified is not valid." ],
    // E_COM_NO_OPEN_CONNECTION: [ 306, "no open connection", "Attempting to do communication request while there is no open connection available." ],
    // E_COM_REQUEST_ERROR_RESPONSE: [ 307, "received error response", "The received response indicates error in the external system." ],
    // E_COM_CONNECTION_TIMEOUT: [ 308, "connection timeout", "Attempting to do communication request but request timeout." ],
    // E_COM_INVALID_API_MAPPING: [ 309, "invalid api mapping", "Attempt to access API URL without proper controller mapping." ],
    E_COM_RETRY_ATTEMPTS_EXCEEDED: [ 3010, "retry attempts exceeded", "Connection retry attempts exceeded the configured limit." ]
} );

/**
 * @typedef {number} TiExceptionCode
 */
module.exports.exceptionCode = exceptionCodeEnum;

/**
 * Represents an exception.
 *
 * @class Exception
 * @public
 */
class Exception {

    #id = undefined;
    #code = undefined;
    #httpCode = undefined;
    #label = undefined;
    #description = undefined;
    #data = undefined;

    /**
     * @constructor
     * @param {string} id The unique ID to be assigned to this exception.
     * @param {TiExceptionCode} exceptionCode An unique exception identifier. If this is not recognized, the default error code will be used instead.
     * @param {Object} [data] Any additional data to insert into the exception.
     * @param {string} [description] Description of the exception.
     */
    constructor( id, exceptionCode, data, description ) {
        exceptionCode = ( exceptionCodeEnum.properties[ exceptionCode ] ) ? exceptionCode : module.exports.exceptionCode.E_UNKNOWN_ERROR;

        this.#id = id;
        this.#code = exceptionCode;
        this.#httpCode = undefined;
        this.#label = "labels.general.exceptions." + exceptionCode;
        this.#description = exceptionCodeEnum.properties[ exceptionCode ].description;
        this.#data = data || {};
    }

    /* Public interface */

    /**
     * Unique identifier of the exception instance. Can be used for tracing problems with customer support cases.
     *
     * @method
     * @return {string}
     * @public
     */
    get id() {
        return this.#id;
    }

    /**
     * Identifier code of the exception type.
     *
     * @method
     * @return {TiExceptionCode}
     * @public
     */
    get code() {
        return this.#code;
    }

    /**
     * HTTP error code if relevant.
     *
     * @method
     * @return {number}
     * @public
     */
    get httpCode() {
        return this.#httpCode;
    }

    /**
     * HTTP error code if relevant.
     *
     * @method
     * @param {number} httpCode
     * @public
     */
    set httpCode( httpCode ) {
        this.#httpCode = httpCode;
    }

    /**
     * Localized label identifier.
     *
     * @method
     * @return {string}
     * @public
     */
    get label() {
        return this.#label;
    }

    /**
     * Description or additional technical information that is NOT localized.
     *
     * @method
     * @return {string}
     * @public
     */
    get description() {
        return this.#description;
    }

    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @method
     * @return {Object}
     * @public
     */
    get data() {
        return this.#data;
    }

    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @method
     * @param {Object} data
     * @public
     */
    set data( data ) {
        this.#data = data;
    }

    /**
     * Extracts the essential information about the Exception and returns it as JSON.
     *
     * @method
     * @returns {Object}
     * @public
     */
    asJSON() {
        return {
            id: this.id,
            code: this.code,
            httpCode: this.httpCode,
            label: this.label,
            description: this.description,
            data: this.data
        };
    }
}

/**
 * Used to raise an exception from the provided source.
 *
 * @method
 * @param {Error|TiExceptionCode|Exception} source Could be a standard JS Error, an ExceptionCode, or another Exception (in which case it will be raised further).
 * @param {Object} [data] Additional JSON data that can accompany the exception. If more data is added on subsequent Raise calls, it will be merged with the existing one.
 * @param {string} [exceptionID] Should be used only in cases when we have a recognizable exception ID beforehand. Should not be entered otherwise!
 * @returns {Exception}
 * @public
 */
module.exports.raise = ( source, data, exceptionID ) => {
    /** @type Exception */
    let exception;

    if ( source instanceof Error ) {
        exception = new Exception( exceptionID || tools.getUUID(), module.exports.exceptionCode.E_GEN_JS_INTERNAL_ERROR, tools.errorToJSON( source ) );
    } else if ( source instanceof Exception ) {
        exception = source;
    } else if ( _.isString( source ) ) {
        exception = new Exception( exceptionID || tools.getUUID(), module.exports.exceptionCode.E_GEN_JS_INTERNAL_ERROR, {
            message: source
        } );
    } else if ( _.isObjectLike( source ) ) {
        exception = new Exception( exceptionID || ( source.id || tools.getUUID() ), source.code || module.exports.exceptionCode.E_GEN_JS_INTERNAL_ERROR, source.data, source.description );
    } else {
        exception = new Exception( exceptionID || tools.getUUID(), ( exceptionCodeEnum.properties[ source ] ) ? source : module.exports.exceptionCode.E_UNKNOWN_ERROR );
    }

    // merge the default exception data with the additional one, if it's provided:
    if ( data ) {
        exception.data = _.mergeWith( ( exception.data || {} ), _.cloneDeep( data ), ( objValue, srcValue ) => {
            return ( _.isArray( objValue ) ) ? objValue.concat( srcValue ) : undefined;
        } );

        // make sure to eliminate any circular dependencies inside the data object (these should never be needed for an error description):
        exception.data = tools.decycle( exception.data );
    }

    return exception;
};

/**
 * Verifies if the passed object is an Exception.
 *
 * @method
 * @param object
 * @returns {boolean}
 * @public
 */
module.exports.isException = ( object ) => {
    return ( object instanceof Exception );
};
