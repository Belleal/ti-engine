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
    E_GEN_INVALID_ARGUMENT_TYPE: [ 1007, "invalid argument type", "The provided argument is not of the expected type." ],
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
    E_WEB_INVALID_REQUEST_CONTENT_ENCODING: [ 4009, "invalid request content encoding", "The request content encoding is not recognized or not supported." ]
} );

/**
 * Enum for listing all HTTP codes.
 *
 * @readonly
 * @enum {number}
 */
const httpCodeEnum = tools.enum( {
    /** 1xx informational response */
    C_100: [ 100, "Continue", "The server has received the request headers and the client should proceed to send the request body." ],
    C_101: [ 101, "Switching Protocols", "The requester has asked the server to switch protocols and the server has agreed to do so." ],
    C_102: [ 102, "Processing", "This code indicates that the server has received and is processing the request, but no response is available yet." ],
    C_103: [ 103, "Early Hints", "Used to return some response headers before final HTTP message." ],
    /** 2xx success */
    C_200: [ 200, "OK", "Standard response for successful HTTP requests." ],
    C_201: [ 201, "Created", "The request has been fulfilled, resulting in the creation of a new resource." ],
    C_202: [ 202, "Accepted", "The request has been accepted for processing, but the processing has not been completed." ],
    C_203: [ 203, "Non-Authoritative Information", "The server is a transforming proxy that received a 200 OK from its origin, but is returning a modified version of the origin's response." ],
    C_204: [ 204, "No Content", "The server successfully processed the request, and is not returning any content." ],
    C_205: [ 205, "Reset Content", "The server successfully processed the request, asks that the requester reset its document view, and is not returning any content." ],
    C_206: [ 206, "Partial Content", "The server is delivering only part of the resource (byte serving) due to a range header sent by the client." ],
    C_207: [ 207, "Multi-Status", "The message body that follows is by default an XML message and can contain a number of separate response codes, depending on how many sub-requests were made." ],
    C_208: [ 208, "Already Reported", "The members of a DAV binding have already been enumerated in a preceding part of the (multistatus) response, and are not being included again." ],
    C_226: [ 226, "IM Used", "The server has fulfilled a request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance." ],
    /** 3xx redirection */
    C_300: [ 300, "Multiple Choices", "Indicates multiple options for the resource from which the client may choose." ],
    C_301: [ 301, "Moved Permanently", "This and all future requests should be directed to the given URI." ],
    C_302: [ 302, "Found", "Tells the client to look at (browse to) another URL." ],
    C_303: [ 303, "See Other", "The response to the request can be found under another URI using the GET method." ],
    C_304: [ 304, "Not Modified", "Indicates that the resource has not been modified since the version specified by the request headers If-Modified-Since or If-None-Match." ],
    C_305: [ 305, "Use Proxy", "The requested resource is available only through a proxy, the address for which is provided in the response." ],
    C_307: [ 307, "Temporary Redirect", "In this case, the request should be repeated with another URI; however, future requests should still use the original URI." ],
    C_308: [ 308, "Permanent Redirect", "This and all future requests should be directed to the given URI. 308 parallels the behavior of 301, but does not allow the HTTP method to change." ],
    /** 4xx client errors */
    C_400: [ 400, "Bad Request", "The server cannot or will not process the request due to an apparent client error." ],
    C_401: [ 401, "Unauthorized", "Similar to 403 Forbidden, but specifically for use when authentication is required and has failed or has not yet been provided." ],
    C_403: [ 403, "Forbidden", "The request contained valid data and was understood by the server, but the server is refusing action. This may be due to the user not having the necessary permissions for a resource or needing an account of some sort, or attempting a prohibited action." ],
    C_404: [ 404, "Not Found", "The requested resource could not be found but may be available in the future. Subsequent requests by the client are permissible." ],
    C_405: [ 405, "Method Not Allowed", "A request method is not supported for the requested resource; for example, a GET request on a form that requires data to be presented via POST, or a PUT request on a read-only resource." ],
    C_406: [ 406, "Not Acceptable", "The requested resource is capable of generating only content not acceptable according to the Accept headers sent in the request." ],
    C_407: [ 407, "Proxy Authentication Required", "The client must first authenticate itself with the proxy." ],
    C_408: [ 408, "Request Timeout", "The server timed out waiting for the request." ],
    C_409: [ 409, "Conflict", "Indicates that the request could not be processed because of conflict in the current state of the resource, such as an edit conflict between multiple simultaneous updates." ],
    C_410: [ 410, "Gone", "Indicates that the resource requested was previously in use but is no longer available and will not be available again." ],
    C_411: [ 411, "Length Required", "The request did not specify the length of its content, which is required by the requested resource." ],
    C_412: [ 412, "Precondition Failed", "The server does not meet one of the preconditions that the requester put on the request header fields." ],
    C_413: [ 413, "Payload Too Large", "The request is larger than the server is willing or able to process." ],
    C_414: [ 414, "URI Too Long", "The URI provided was too long for the server to process." ],
    C_415: [ 415, "Unsupported Media Type", "The request entity has a media type which the server or resource does not support." ],
    C_416: [ 416, "Range Not Satisfiable", "The client has asked for a portion of the file (byte serving), but the server cannot supply that portion." ],
    C_417: [ 417, "Expectation Failed", "The server cannot meet the requirements of the Expect request-header field." ],
    C_421: [ 421, "Misdirected Request", "The request was directed at a server that is not able to produce a response (for example because of connection reuse)." ],
    C_422: [ 422, "Unprocessable Content", "The request was well-formed (i.e., syntactically correct) but could not be processed." ],
    C_423: [ 423, "Locked", "The resource that is being accessed is locked." ],
    C_424: [ 424, "Failed Dependency", "The request failed because it depended on another request and that request failed." ],
    C_425: [ 425, "Too Early", "Indicates that the server is unwilling to risk processing a request that might be replayed." ],
    C_426: [ 426, "Upgrade Required", "The client should switch to a different protocol such as TLS/1.3, given in the Upgrade header field." ],
    C_428: [ 428, "Precondition Required", "The origin server requires the request to be conditional." ],
    C_429: [ 429, "Too Many Requests", "The user has sent too many requests in a given amount of time. Intended for use with rate-limiting schemes." ],
    C_431: [ 431, "Request Header Fields Too Large", "The server is unwilling to process the request because either an individual header field, or all the header fields collectively, are too large." ],
    C_451: [ 451, "Unavailable For Legal Reasons", "A server operator has received a legal demand to deny access to a resource or to a set of resources that includes the requested resource." ],
    /** 5xx server errors */
    C_500: [ 500, "Internal Server Error", "A generic error message, given when an unexpected condition was encountered and no more specific message is suitable." ],
    C_501: [ 501, "Not Implemented", "The server either does not recognize the request method, or it lacks the ability to fulfil the request." ],
    C_502: [ 502, "Bad Gateway", "The server was acting as a gateway or proxy and received an invalid response from the upstream server." ],
    C_503: [ 503, "Service Unavailable", "The server cannot handle the request (because it is overloaded or down for maintenance)." ],
    C_504: [ 504, "Gateway Timeout", "The server was acting as a gateway or proxy and did not receive a timely response from the upstream server." ],
    C_505: [ 505, "HTTP Version Not Supported", "The server does not support the HTTP version used in the request." ],
    C_506: [ 506, "Variant Also Negotiates", "Transparent content negotiation for the request results in a circular reference." ],
    C_507: [ 507, "Insufficient Storage", "The server is unable to store the representation needed to complete the request." ],
    C_508: [ 508, "Loop Detected", "The server detected an infinite loop while processing the request." ],
    C_510: [ 510, "Not Extended", "Further extensions to the request are required for the server to fulfil it." ],
    C_511: [ 511, "Network Authentication Required", "The client needs to authenticate to gain network access. Intended for use by intercepting proxies used to control access to the network." ]
} );

/**
 * @typedef {number} TiExceptionCode
 */
module.exports.exceptionCode = exceptionCodeEnum;

/**
 * @typedef {number} TiHttpCode
 */
module.exports.httpCode = httpCodeEnum;

const labelPath = "system.exceptions.";

/**
 * Represents an exception.
 *
 * @class Exception
 * @public
 */
class Exception {

    #id;
    #code;
    #httpCode;
    #label;
    #description;
    #data;

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
     * @returns {TiHttpCode}
     * @public
     */
    get httpCode() {
        return this.#httpCode;
    }

    /**
     * HTTP error code if relevant.
     *
     * @property
     * @param {TiHttpCode} httpCode
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
     * @param {boolean} [includeData=true] Whether to include the data property in the output.
     * @returns {Object}
     * @public
     */
    asJSON( includeData = true ) {
        return {
            id: this.id,
            code: this.code,
            httpCode: this.httpCode,
            label: this.label,
            description: this.description,
            data: ( includeData === true ) ? this.data : undefined
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