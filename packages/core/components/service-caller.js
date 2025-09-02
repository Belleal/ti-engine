/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const MessageObserver = require( "#message-observer" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const config = require( "#config" );
const cache = require( "#cache" );
const messageDispatcher = require( "#message-dispatcher" );

/**
 * @typedef {Object} ServiceAddress
 * @property {string} serviceAlias A valid service alias.
 * @property {string} serviceDomainName A valid service domain name.
 * @property {number|undefined} serviceVersion Optional service version. If not provided, the latest version will be assumed as a target.
 */

/**
 * @typedef {Object} ServiceExecContext
 * @property {string|undefined} authToken A valid authentication token that initialized the service call (if applicable).
 * @property {ServiceCallPredecessor|undefined} previousServiceCall The previous service call in the execution chain (if such exists).
 */

/**
 * @typedef {Message} ServiceCallPredecessor
 * @property {string} predecessor The {@link Message.messageID} of the predecessor in the service call tree.
 * @property {ServiceAddress} serviceAddress The address of the service that has to process the service call.
 * @property {Object|undefined} serviceParams The named params to be provided to the API service.
 */

/**
 * @typedef {ServiceCallPredecessor} ServiceCall
 * @property {string} authToken A valid authentication token that initialized the service call.
 * @property {number} createdOn A unix timestamp taken at creation time of the service call.
 * @property {number} executionTime The total execution time of this service call in milliseconds.
 * @property {Object|undefined} exception If there was exception during the service call processing, it will be set here. Otherwise, it will be 'undefined'.
 * @property {number|undefined} finishedOn A unix timestamp taken at finish time of the service call.
 * @property {boolean} isCompleted Flag to indicate if this service call has been completed.
 * @property {boolean|undefined} isSuccessful A flag indicating if this service call can be considered successful or not. Will be 'undefined' until the service call is processed.
 * @property {string[]} successors The service call IDs of the successors in the service call tree.
 */

/**
 * @typedef {Object} ServiceCallResult
 * @property {Exception|undefined} exception If there was exception during the service call processing, it will be set here. Otherwise, it will be 'undefined'.
 * @property {boolean} isSuccessful A flag indicating if this service call can be considered successful or not.
 * @property {Object|string|undefined} payload The payload containing the results from the service call processing. If a string, it is ID of the payload in the memory cache instead.
 */

/**
 * Used to assemble and prepare a new {@link ServiceCall} object.
 *
 * @method
 * @param {string} messageID The message ID of the service call. This has to be unique across the whole service call tree, including the current service call, and will be used to identify the service call in the service call tree.
 * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
 * @param {Object} serviceParams Set of named parameters to provide to the called service.
 * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
 * @returns {Promise<ServiceCall>}
 * @private
 */
let prepareServiceCall = ( messageID, serviceAddress, serviceParams, serviceExecContext ) => {
    return new Promise( ( resolve ) => {
        const ServiceInstance = require( "#service-instance" );

        // assemble the new service call:
        let chainID = ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.chainID : tools.getUUID();
        let chainLevel = ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.chainLevel + 1 : 0;
        let source = {
            instanceID: ServiceInstance.instanceID,
            route: ServiceInstance.serviceDomainName
        };
        let destination = {
            instanceID: undefined,
            route: serviceAddress.serviceDomainName
        };
        /** @type ServiceCall */
        let serviceCall = {
            authToken: serviceExecContext.authToken,
            chainID: chainID,
            chainLevel: chainLevel,
            createdOn: Date.now(),
            destination: destination,
            executionTime: 0,
            exception: undefined,
            finishedOn: undefined,
            isCompleted: false,
            isSuccessful: undefined,
            messageID: messageID,
            payload: undefined,
            predecessor: ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.messageID : undefined,
            serviceAddress: serviceAddress,
            serviceParams: serviceParams,
            source: source,
            successors: undefined
        };

        resolve( serviceCall );
    } );
}

/**
 * Used to verify if the service is registered in the service registry.
 *
 * @method
 * @param {ServiceAddress} serviceAddress
 * @returns {Promise}
 * @private
 */
let findServiceInRegistry = ( serviceAddress ) => {
    return new Promise( ( resolve, reject ) => {
        let serviceCatalog = config.getSetting( config.setting.SERVICE_REGISTRY_ADDRESS ) + serviceAddress.serviceDomainName;
        cache.instance.isSetMember( serviceCatalog, serviceAddress.serviceAlias ).then( ( result ) => {
            if ( result === true ) {
                resolve();
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_COM_SERVICE_NOT_REGISTERED ) );
            }
        } ).catch( ( error ) => {
            reject( exceptions.raise( error ) );
        } );
    } );
}

/**
 * A class defining a service call processor.
 *
 * @class ServiceCallProcessor
 * @private
 */
class ServiceCallProcessor {

    #messageID;
    #serviceAddress;
    #serviceParams;
    #serviceExecContext;
    #timeoutHandle;
    #taskCompletionHandler;
    #isProcessed = false;

    /**
     * @constructor
     * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
     * @param {Object} serviceParams Set of named parameters to provide to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     * @returns {ServiceCallProcessor}
     */
    constructor( serviceAddress, serviceParams, serviceExecContext ) {
        this.#messageID = tools.getUUID();
        this.#serviceAddress = serviceAddress;
        this.#serviceParams = serviceParams;
        this.#serviceExecContext = serviceExecContext;
    }

    /* Public interface */

    /**
     * The unique identifier of the service call.
     *
     * @property
     * @returns {string}
     * @public
     */
    get messageID() {
        return this.#messageID;
    }

    /**
     * Used to start the execution of the service call.
     * <br/>
     * NOTE: This method will time out after specific preconfigured time, in which case it will resolve with {@link E_COM_SERVICE_EXEC_TIMEOUT} error.
     *
     * @method
     * @returns {Promise<ServiceCallResult>}
     * @public
     */
    process() {
        return Promise.race( [ this.#execute(), this.#timeout() ] ).then( ( result ) => {
            clearTimeout( this.#timeoutHandle );
            this.#isProcessed = true;
            return result;
        } ).catch( ( error ) => {
            clearTimeout( this.#timeoutHandle );
            this.#isProcessed = true;
            logger.log( `Error during service call execution!`, logger.logSeverity.ERROR, error );
            return {
                isSuccessful: false,
                exception: exceptions.raise( error ),
                payload: undefined
            };
        } );
    }

    /**
     * Used to complete the execution of the service call that was started within the {@link process} method.
     *
     * @method
     * @param {ServiceCall} serviceCall
     * @public
     */
    complete( serviceCall ) {
        if ( this.#isProcessed !== true ) {
            let serviceCallResult = {
                exception: serviceCall.exception,
                isSuccessful: ( serviceCall.isSuccessful !== undefined ) ? tools.toBool( serviceCall.isSuccessful ) : true,
                payload: serviceCall.payload
            };
            this.#taskCompletionHandler( serviceCallResult );
        }
    }

    /* Private interface */

    /**
     * Used to execute the service call.
     *
     * @method
     * @returns {Promise<ServiceCallResult>}
     * @private
     */
    #execute() {
        return new Promise( ( resolve, reject ) => {
            findServiceInRegistry( this.#serviceAddress ).then( () => {
                return prepareServiceCall( this.#messageID, this.#serviceAddress, this.#serviceParams, this.#serviceExecContext );
            } ).then( ( serviceCall ) => {
                return messageDispatcher.instance.sendRequest( serviceCall );
            } ).then( () => {
                this.#taskCompletionHandler = ( serviceCallResult ) => {
                    resolve( serviceCallResult );
                };
            } ).catch( ( error ) => {
                if ( this.#isProcessed !== true ) {
                    reject( exceptions.raise( error ) );
                }
            } );
        } );
    }

    /**
     * Used to time out the service call execution.
     *
     * @method
     * @returns {Promise<ServiceCallResult>}
     * @private
     */
    #timeout() {
        return new Promise( ( resolve, reject ) => {
            this.#timeoutHandle = setTimeout( () => {
                if ( this.#isProcessed !== true ) {
                    reject( exceptions.raise( exceptions.exceptionCode.E_COM_SERVICE_EXEC_TIMEOUT ) );
                }
            }, config.getSetting( config.setting.SERVICE_EXECUTION_TIMEOUT ) );
        } );
    }

}

/**
 * A class defining a service caller behavior.
 *
 * @class ServiceCaller
 * @extends MessageObserver
 * @public
 */
class ServiceCaller extends MessageObserver {

    #serviceCallProcessors = {};

    /**
     * @constructor
     */
    constructor() {
        super( 10 );
    }

    /* Public interface */

    /**
     * Used to call a service in the service ecosystem asynchronously.
     * <br/>
     * NOTE: This method will time out after specific preconfigured time, in which case it will resolve with {@link E_COM_SERVICE_EXEC_TIMEOUT} error.
     *
     * @method
     * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
     * @param {Object} serviceParams Set of named parameters to provide to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     * @returns {Promise<ServiceCallResult>} Will always return a service call result that can be either successful or not.
     * @public
     */
    executeServiceCall( serviceAddress, serviceParams, serviceExecContext ) {
        return new Promise( ( resolve ) => {
            let processor = new ServiceCallProcessor( serviceAddress, serviceParams, serviceExecContext );
            this.#addProcessor( processor.messageID, processor );
            processor.process().then( ( serviceCallResult ) => {
                this.#removeProcessor( processor.messageID );
                resolve( serviceCallResult );
            } );
        } );
    }

    /**
     * Once the proper message is received this method will trigger the completion of the pending {@link ServiceCall} execution started in {@link #executeServiceCall}.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {ServiceCall} serviceCall The service call message for processing.
     * @returns {ServiceCall} The service call message that was received.
     * @override
     * @public
     */
    onMessage( identifier, serviceCall ) {
        // Complete the service call:
        serviceCall.finishedOn = Date.now();
        serviceCall.executionTime = serviceCall.finishedOn - serviceCall.createdOn;
        serviceCall.isCompleted = true;

        let processor = this.#getProcessor( serviceCall.messageID );
        if ( processor ) {
            this.#removeProcessor( serviceCall.messageID );
            processor.complete( serviceCall );
        } else {
            logger.log( `Received service call message with ID '${ serviceCall.messageID }' without registered processor! This may be caused by a service call timeout.`, logger.logSeverity.DEBUG, serviceCall.exception || undefined );
        }

        return serviceCall;
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
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionLost( identifier ) {
        super.onConnectionLost( identifier );
    }

    /* Private interface */

    /**
     * Used to add a new task handler to the list of current tasks.
     *
     * @method
     * @param {string} messageID
     * @param {ServiceCallProcessor} processor
     * @private
     */
    #addProcessor( messageID, processor ) {
        this.#serviceCallProcessors[ messageID ] = processor;
    }

    /**
     * Used to fetch a task handler from the list of current tasks.
     *
     * @method
     * @param {string} messageID
     * @returns {ServiceCallProcessor}
     * @private
     */
    #getProcessor( messageID ) {
        return this.#serviceCallProcessors[ messageID ];
    }

    /**
     * Used to remove a task handler from the list of current tasks.
     *
     * @method
     * @param {string} messageID
     * @private
     */
    #removeProcessor( messageID ) {
        if ( this.#serviceCallProcessors[ messageID ] ) {
            delete this.#serviceCallProcessors[ messageID ];
        }
    }

}

module.exports = ServiceCaller;