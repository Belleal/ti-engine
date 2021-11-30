/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageObserver = require( "#message-observer" );
const ServiceInstance = require( "#service-instance" );
const _ = require( "lodash" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const config = require( "#config" );
const cache = require( "#cache" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} serviceAlias Service alias.
 * @property {string} serviceFile The JS file containing the service itself. This has to be exposed via package.json import structure!
 * @property {number} [serviceVersion] Service version.
 */

/**
 * @callback VerifyAccessMethod
 * @param {string} authToken
 * @param {ServiceAddress} serviceAddress
 * @returns {Promise}
 */

/**
 * @callback ServiceHandlerMethod
 * @param {ServiceDefinition} serviceDefinition The service definition as provided during the service registration.
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
    /** @type VerifyAccessMethod */
    #verifyAccess;

    /**
     * @constructor
     */
    constructor() {
        super();

        this.#verifyAccess = () => {
            return Promise.resolve();
        };

        cache.addConnectionObserver( this );
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

        let serviceCatalog = config.getSetting( config.setting.SERVICE_REGISTRY_ADDRESS ) + ServiceInstance.serviceDomainName;
        _.forOwn( this.#serviceInterface, ( versions, serviceAlias ) => {
            cache.addToSet( serviceCatalog, serviceAlias ).catch( ( error ) => {
                logger.log( `Record for service '${ serviceAlias }' could not be added to the service registry.`, logger.logSeverity.ERROR, error );
            } );
        } );
    }

    /**
     * Used to setup the method for service access verification.
     *
     * @method
     * @param {VerifyAccessMethod} verifyAccess
     * @public
     */
    configureVerifyAccess( verifyAccess ) {
        if ( typeof ( verifyAccess ) === "function" ) {
            this.#verifyAccess = verifyAccess;
        } else {
            logger.log( `Attempting to setup service verification method that is not a function!`, logger.logSeverity.WARNING );
        }
    }

    /**
     * Used to add a service handler to the service interface.
     * <br/>
     * NOTE: If the same version of the service handler already exists, it will be overridden!
     *
     * @method
     * @param {ServiceHandlerMethod} serviceHandler
     * @param {ServiceDefinition} serviceDefinition
     * @param {ServiceInstance} serviceInstance This will be used as context to bind all business services.
     * @public
     */
    addServiceHandler( serviceHandler, serviceDefinition, serviceInstance ) {
        if ( !this.#serviceInterface[ serviceDefinition.serviceAlias ] ) {
            this.#serviceInterface[ serviceDefinition.serviceAlias ] = {};
        }
        if ( this.#serviceInterface[ serviceDefinition.serviceAlias ][ serviceDefinition.serviceVersion ] ) {
            logger.log( `Service handler for '${ serviceDefinition.serviceAlias }' version '${ serviceDefinition.serviceVersion }' already existed and will be overridden.`, logger.logSeverity.WARNING );
        }
        this.#serviceInterface[ serviceDefinition.serviceAlias ][ serviceDefinition.serviceVersion ] = serviceHandler.bind( serviceInstance, _.cloneDeep( serviceDefinition ) );
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
                return serviceHandler( serviceCall.serviceParams, ServiceExecutor.#assembleServiceExecContext( serviceCall ) );
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
     * @returns {Promise<ServiceHandlerMethod>}
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

}

module.exports = ServiceExecutor;
