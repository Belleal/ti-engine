/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "#tools" );

/**
 * Enum for listing all system-recognized exceptions.
 *
 * @readonly
 * @enum {number}
 */
const exceptionCodeEnum = tools.enum( {
    E_UNKNOWN_ERROR: [ 0, "unknown error", "Unidentified error encountered or unrecognized exception code provided." ],
    /** General exceptions - codes under 1xxx */
    E_GEN_JS_INTERNAL_ERROR: [ 1000, "js internal error", "Error thrown by internal JS source." ],
    E_GEN_ABSTRACT_CLASS_INIT: [ 1001, "abstract class init", "Attempt to construct an abstract class detected." ],
    E_GEN_ABSTRACT_METHOD_CALL: [ 1002, "abstract method call", "Attempt to call an abstract method detected." ],
    E_GEN_INVALID_SERVICE_DOMAIN_NAME: [ 1003, "invalid service domain name", "Invalid or no service domain name provided at microservice startup." ],
    E_GEN_SYSTEM_CACHE_UNAVAILABLE: [ 1004, "system cache unavailable", "The system cache required for proper engine operation is unavailable." ],
    E_GEN_BAD_SERVICE_HANDLER: [ 1005, "bad service handler", "The provided service handler is not a proper function." ],
    E_GEN_FEATURE_UNSUPPORTED: [ 1006, "feature unsupported", "The requested feature is not supported by current configuration or version." ],
    /** Security & Administration exceptions - codes under 2xxx */
    E_SEC_INVALID_AUTH_TOKEN: [ 2000, "invalid auth token", "Invalid authorization token provided." ],
    E_SEC_INVALID_EXPIRED_SESSION: [ 2001, "invalid or expired session", "Invalid or expired session encountered." ],
    E_SEC_UNAUTHORIZED_ACCESS: [ 2002, "unauthorized access", "Attempt for unauthorized access detected." ],
    E_SEC_MESSAGE_TAMPERING_DETECTED: [ 2003, "message tampering detected", "The system detected tampering with the message received via message exchange." ],
    /** Cross-Application Communication exceptions - codes under 3xxx */
    E_COM_GENERAL_ERROR: [ 3000, "general communication error", "General error during cross-application communication." ],
    E_COM_MESSAGE_SENDER_UNAVAILABLE: [ 3001, "message sender unavailable", "The message sender instance is currently unavailable." ],
    E_COM_SERVICE_EXEC_TIMEOUT: [ 3002, "service exec timeout", "The execution of a service could not complete within the allowed timeout." ],
    E_COM_SERVICE_NOT_REGISTERED: [ 3003, "service not registered", "The specified service is not found in the service registry." ],
    E_COM_SERVICE_NOT_FOUND: [ 3004, "service not found", "The specified service is not found in the service definition interface." ],
    E_COM_SERVICE_HANDLER_NOT_FOUND: [ 3005, "service handler not found", "No handler found in the interface for the specified service or service version." ],
    E_COM_MESSAGE_RECEIVER_UNAVAILABLE: [ 3006, "message receiver unavailable", "The message receiver instance is currently unavailable." ],
    E_COM_MESSAGE_EXCHANGE_BROKEN: [ 3007, "message exchange broken", "The message exchange is irrevocably broken and cannot be used any longer." ],
    E_COM_RETRY_ATTEMPTS_EXCEEDED: [ 3010, "retry attempts exceeded", "Connection retry attempts exceeded the configured limit." ],
    /** Web server exceptions - codes under 4xxx */
    E_WEB_INVALID_REQUEST_METHOD: [ 4000, "invalid request method", "The request method is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_URI: [ 4001, "invalid request uri", "The request URI is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_BODY: [ 4002, "invalid request body", "The request body is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_QUERY: [ 4003, "invalid request query", "The request query is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_HEADERS: [ 4004, "invalid request headers", "The request headers are not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_PARAMETERS: [ 4005, "invalid request parameters", "The request parameters are not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_FORMAT: [ 4006, "invalid request format", "The request format is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_TYPE: [ 4007, "invalid request content type", "The request content type is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_LENGTH: [ 4008, "invalid request content length", "The request content length is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_ENCODING: [ 4009, "invalid request content encoding", "The request content encoding is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_DISPOSITION: [ 4010, "invalid request content disposition", "The request content disposition is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_TRANSFER_ENCODING: [ 4011, "invalid request content transfer encoding", "The request content transfer encoding is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_RANGE: [ 4012, "invalid request content range", "The request content range is not recognized or not supported." ],
    E_WEB_INVALID_REQUEST_CONTENT_LANGUAGE: [ 4013, "invalid request content language", "The request content language is not recognized or not supported." ]
} );

/**
 * @typedef {number} TiExceptionCode
 */
module.exports.exceptionCode = exceptionCodeEnum;

const labelPath = "system.exceptions.";

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
        this.#label = labelPath + exceptionCode;
        this.#description = description || exceptionCodeEnum.properties[ exceptionCode ].description;
        this.#data = data || {};
    }

    /* Public interface */

    /**
     * Unique identifier of the exception instance. Can be used for tracing problems with customer support cases.
     *
     * @property
     * @returns {string}
     * @public
     */
    get id() {
        return this.#id;
    }

    /**
     * Identifier code of the exception type.
     *
     * @property
     * @returns {TiExceptionCode}
     * @public
     */
    get code() {
        return this.#code;
    }

    /**
     * HTTP error code if relevant.
     *
     * @property
     * @returns {number}
     * @public
     */
    get httpCode() {
        return this.#httpCode;
    }

    /**
     * HTTP error code if relevant.
     *
     * @property
     * @param {number} httpCode
     * @public
     */
    set httpCode( httpCode ) {
        this.#httpCode = httpCode;
    }

    /**
     * Localized label identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get label() {
        return this.#label;
    }

    /**
     * Description or additional technical information that is NOT localized.
     *
     * @property
     * @returns {string}
     * @public
     */
    get description() {
        return this.#description;
    }

    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @property
     * @returns {Object}
     * @public
     */
    get data() {
        return this.#data;
    }

    /**
     * JSON containing any additional data that has relevance for the exception. Can be converted JavaScript {@link Error} object as well.
     *
     * @property
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
 * @param {Object} [data] Additional JSON data that can go with the exception. If more data is added on later Raise calls, it will be merged with the existing one.
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

    // Merge the default exception data with the additional one if it's provided:
    if ( data ) {
        exception.data = _.mergeWith( ( exception.data || {} ), _.cloneDeep( data ), ( objValue, srcValue ) => {
            return ( _.isArray( objValue ) ) ? objValue.concat( srcValue ) : undefined;
        } );

        // Make sure to eliminate any circular dependencies inside the data object (these should never be needed for an error description):
        exception.data = tools.decycle( exception.data );
    }

    return exception;
};

/**
 * Verifies if the passed object is an Exception.
 *
 * @method
 * @param {*} object
 * @returns {boolean}
 * @public
 */
module.exports.isException = ( object ) => {
    return ( object instanceof Exception );
};