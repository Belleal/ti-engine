/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageObserver = require( "#message-observer" );
const _ = require( "lodash" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} filePath File path to the JS file containing the service itself.
 * @property {string} serviceAlias Service alias.
 * @property {number} serviceVersion Service version.
 */

/**
 * @callback VerifyAccess
 * @param {string} authToken
 * @param {ServiceAddress} serviceAddress
 * @returns {Promise}
 */

/**
 * @callback ServiceHandler
 * @param {Object} serviceParams Set of named parameters provided to the called service.
 * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
 * @returns {Promise<Object|undefined>} Optional payload to be returned to the service caller.
 */

/**
 * A class defining a service executor behavior.
 *
 * @class ServiceExecutor
 * @extends MessageObserver
 * @public
 */
class ServiceExecutor extends MessageObserver {

    #serviceInterface = {};
    /** @type VerifyAccess */
    #verifyAccess;

    /**
     * @constructor
     */
    constructor() {
        super();

        this.#verifyAccess = () => {
            return Promise.resolve();
        };
    }

    /* Public interface */

    /**
     *
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @override
     * @public
     */
    onMessage( identifier, message ) {
        this.#processServiceCall( message ).then( ( serviceCall ) => {
            return messageDispatcher.sendResponse( serviceCall );
        } ).catch( ( error ) => {
            logger.log( `Failed to send service call response after processing! Service call ID was: '${ message.messageID }'`, logger.logSeverity.ERROR, error );
        } );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        super.onConnectionDisrupted( identifier );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered( identifier ) {
        super.onConnectionRecovered( identifier );
    }

    /**
     * Used to setup the method for service access verification.
     *
     * @method
     * @param {VerifyAccess} verifyAccess
     * @public
     */
    configureVerifyAccess( verifyAccess ) {
        if ( typeof ( verifyAccess ) === "function" ) {
            this.#verifyAccess = verifyAccess;
        } else {
            logger.log( `Attempting to setup service verification method that is not a function!`, logger.logSeverity.WARNING );
        }
    }

    /* Private interface */

    /**
     * Used to assemble {@link ServiceExecContext} from the provided service call object.
     *
     * @method
     * @param {ServiceCall} serviceCall
     * @returns {ServiceExecContext}
     * @private
     */
    static #assembleServiceExecContext( serviceCall ) {
        return {
            authToken: serviceCall.authToken,
            previousServiceCall: {
                chainID: serviceCall.chainID,
                chainLevel: serviceCall.chainLevel,
                destination: serviceCall.destination,
                messageID: serviceCall.messageID,
                payload: serviceCall.payload,
                predecessor: serviceCall.predecessor,
                serviceAddress: serviceCall.serviceAddress,
                serviceParams: serviceCall.serviceParams,
                source: serviceCall.source
            }
        };
    }

    /**
     * Used to process the actual service call.
     *
     * @method
     * @param {ServiceCall} serviceCall
     * @returns {Promise<ServiceCall>}
     * @private
     */
    #processServiceCall( serviceCall ) {
        return new Promise( ( resolve, reject ) => {
            this.#verifyAccess( serviceCall.authToken, serviceCall.serviceAddress ).then( () => {
                return this.#identifyService( serviceCall.serviceAddress );
            } ).then( ( serviceHandler ) => {
                return this.#loadService( serviceHandler, serviceCall.serviceParams, ServiceExecutor.#assembleServiceExecContext( serviceCall ) );
            } ).then( ( payload ) => {
                serviceCall.isSuccessful = true;
                serviceCall.payload = payload;
                resolve( serviceCall );
            } ).catch( ( error ) => {
                serviceCall.isSuccessful = false;
                serviceCall.exception = exceptions.raise( error ).asJSON();
                resolve( serviceCall );
            } );
        } );
    }

    /**
     * Used to identify the service in the service interface and retrieve its definition.
     *
     * @method
     * @param {ServiceAddress} serviceAddress
     * @returns {Promise<ServiceHandler>}
     * @private
     */
    #identifyService( serviceAddress ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#serviceInterface[ serviceAddress.serviceAlias ] ) {
                let serviceVersion = serviceAddress.serviceVersion;
                if ( !serviceVersion ) {
                    serviceVersion = _.last( _.sortBy( _.keys( this.#serviceInterface[ serviceAddress.serviceAlias ] ) ) );
                }

                let serviceHandler = this.#serviceInterface[ serviceAddress.serviceAlias ][ serviceVersion ];
                if ( serviceHandler ) {
                    resolve( serviceHandler );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_COM_SERVICE_HANDLER_NOT_FOUND ) );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_COM_SERVICE_NOT_FOUND ) );
            }
        } );
    }

    /**
     * Used to load ana execute the provided service handler.
     *
     * @method
     * @param {ServiceHandler} serviceHandler
     * @param {Object} serviceParams Set of named parameters provided to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     * @returns {Promise}
     * @private
     */
    #loadService( serviceHandler, serviceParams, serviceExecContext ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement from here...
            resolve();
        } );
    }

}

module.exports = ServiceExecutor;
