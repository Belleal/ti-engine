/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
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
 * @property {string} authToken A valid authentication token that initialized the service call.
 * @property {string|undefined} chainID Shared unique ID between all pre- and post-processed service call and related operations (i.e. the message chain).
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
 * @property {number|undefined} finishedOn A unix timestamp taken at finish time of the service call.
 * @property {boolean} isCompleted Flag to indicate if this service call has been completed.
 * @property {ServiceCallResult} result Will contain the results of the service call's execution regardless of the outcome.
 * @property {string[]} successors The service call IDs of the successors in the service call tree.
 */

/**
 * @typedef {Object} ServiceCallResult
 * @property {boolean} isSuccessful A flag indicating if this result is a success or not.
 * @property {Exception|undefined} exception If there was exception during the service call processing, it will be set here. Otherwise it will be 'null'.
 * @property {Object|string|undefined} payload The payload containing the results from the service call processing. If string, it is ID of the payload in the memory cache instead.
 */

/**
 * A class defining a service caller behavior.
 *
 * @class ServiceCaller
 * @extends MessageObserver
 * @public
 */
class ServiceCaller extends MessageObserver {

    #serviceCallTasks = {};

    /**
     * @constructor
     */
    constructor() {
        super();
    }

    /* Public interface */

    /**
     * Used to call a service in the service ecosystem asynchronously.
     * NOTE: This method will timeout after specific preconfigured time, in which case it will resolve with {@link E_COM_SERVICE_EXEC_TIMEOUT} error.
     *
     * @method
     * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
     * @param {Object} serviceParams Set of named parameters to provide to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     * @returns {Promise<ServiceCallResult>} Will always return a service call result that can be either successful or not.
     * @public
     */
    executeServiceCall( serviceAddress, serviceParams, serviceExecContext ) {
        let execution = new Promise( ( resolve, reject ) => {
            this.#findServiceInRegistry( serviceAddress ).then( () => {
                return this.#prepareServiceCall( serviceAddress, serviceParams, serviceExecContext );
            } ).then( ( serviceCall ) => {
                return messageDispatcher.sendRequest( serviceCall );
            } ).then( ( messageID ) => {
                this.#addTaskHandler( messageID, ( serviceCall ) => {
                    this.#completeServiceCall( serviceCall ).then( ( serviceCall ) => {
                        let serviceCallResult = serviceCall.result || {
                            isSuccessful: true
                        };
                        serviceCallResult.payload = serviceCall.payload || {};

                        resolve( serviceCallResult );
                    } ).catch( ( error ) => {
                        reject( exceptions.raise( error ) );
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
        let timeoutHandle;
        let timeout = new Promise( ( resolve, reject ) => {
            timeoutHandle = setTimeout( () => reject( exceptions.raise( exceptions.exceptionCode.E_COM_SERVICE_EXEC_TIMEOUT ) ), config.getSetting( config.setting.SERVICE_EXECUTION_TIMEOUT ) );
        } );

        return Promise.race( [ execution, timeout ] ).then( ( result ) => {
            clearTimeout( timeoutHandle );
            return result;
        } ).catch( ( error ) => {
            logger.log( `Error during service call execution!`, logger.logSeverity.ERROR, error );
            return {
                isSuccessful: false,
                exception: exceptions.raise( error )
            };
        } );
    }

    /**
     * Once the proper message is received this method will trigger the completion of the pending {@link ServiceCall} execution started in {@link #executeServiceCall}.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @override
     * @public
     */
    onMessage( identifier, message ) {
        let execution = this.#getTaskHandler( message.messageID );
        if ( typeof ( execution ) === "function" ) {
            execution( message );
            this.#removeTaskHandler( message.messageID );
        } else {
            logger.log( `Received message with ID '${ message.messageID }' in ServiceCaller that has no registered handler. This is probably a software bug!`, logger.logSeverity.WARNING );
        }
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

    /* Private interface */

    /**
     * Used to verify if the service is registered in the service registry.
     *
     * @method
     * @param {ServiceAddress} serviceAddress
     * @returns {Promise}
     * @private
     */
    #findServiceInRegistry( serviceAddress ) {
        return new Promise( ( resolve, reject ) => {
            let serviceCatalog = config.getSetting( config.setting.SERVICE_REGISTRY_ADDRESS ) + serviceAddress.serviceDomainName;
            cache.isSetMember( serviceCatalog, serviceAddress.serviceAlias ).then( ( result ) => {
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
     * Used to assemble and prepare a new {@link ServiceCall} object.
     *
     * @method
     * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
     * @param {Object} serviceParams Set of named parameters to provide to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     * @returns {Promise<ServiceCall>}
     * @private
     */
    #prepareServiceCall( serviceAddress, serviceParams, serviceExecContext ) {
        return new Promise( ( resolve, reject ) => {
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
                finishedOn: undefined,
                isCompleted: false,
                messageID: tools.getUUID(),
                payload: {},
                predecessor: ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.messageID : undefined,
                result: undefined,
                serviceAddress: serviceAddress,
                serviceParams: serviceParams,
                sequence: 0,
                source: source,
                successors: undefined
            };

            resolve( serviceCall );
        } );
    }

    /**
     * Used to complete the provided {@link ServiceCall} object by setting all required properties to their correct values.
     *
     * @method
     * @param {ServiceCall} serviceCall
     * @returns {Promise<ServiceCall>}
     * @private
     */
    #completeServiceCall( serviceCall ) {
        return new Promise( ( resolve, reject ) => {
            serviceCall.finishedOn = Date.now();
            serviceCall.executionTime = serviceCall.finishedOn - serviceCall.createdOn;
            serviceCall.isCompleted = true;

            resolve( serviceCall );
        } );
    }

    /**
     * Used to add a new task handler to the list of current tasks.
     *
     * @method
     * @param {string} taskID
     * @param {function( ServiceCall )} taskHandler
     * @private
     */
    #addTaskHandler( taskID, taskHandler ) {
        this.#serviceCallTasks[ taskID ] = taskHandler;
    }

    /**
     * Used to fetch a task handler from the list of current tasks.
     *
     * @method
     * @param {string} taskID
     * @returns {function( ServiceCall )}
     * @private
     */
    #getTaskHandler( taskID ) {
        return this.#serviceCallTasks[ taskID ];
    }

    /**
     * Used to remove a task handler from the list of current tasks.
     *
     * @method
     * @param {string} taskID
     * @private
     */
    #removeTaskHandler( taskID ) {
        if ( this.#serviceCallTasks[ taskID ] ) {
            delete this.#serviceCallTasks[ taskID ];
        }
    }

}

module.exports = ServiceCaller;
