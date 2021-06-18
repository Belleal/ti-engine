/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const config = require( "#config" );
const messageDispatcher = require( "#message-dispatcher" );
const ServiceInstance = require( "#service-instance" );

/**
 * @typedef {Object} ServiceAddress
 * @property {string} serviceAlias A valid service alias.
 * @property {string} serviceDomainName A valid service domain name.
 * @property {number} [serviceVersion] Optional service version. If not provided, the latest version will be assumed as a target.
 */

/**
 * @typedef {Object} ServiceExecContext
 * @property {string} transactionID Shared unique transaction ID between all pre- and post-processed service call and related operations.
 * @property {string} authToken A valid authentication token that initialized the service call.
 * @property {ServiceCallPredecessor} [previousServiceCall] The previous service call in the execution chain (if such exists).
 */

/**
 * @typedef {Object} ServiceCallDestination
 * @property {string} [instanceID] The instance ID of the microservice worker by which the service call was accepted (available after acceptance).
 * @property {string} serviceAlias The service alias of the API service requested by the service call.
 * @property {Object} [serviceParams] The named params to be provided to the API service.
 * @property {string} serviceDomainName The service domain name of the microservice to which the service call is sent.
 * @property {number} [serviceVersion] The version of the API service requested by the service call.
 */

/**
 * @typedef {Object} ServiceCallSource
 * @property {string} instanceID The instance ID of the microservice worker from which the service call originated.
 * @property {string} serviceDomainName The service domain name of the microservice from which the service call originated.
 */

/**
 * @typedef {Object} ServiceCallPredecessor
 * @property {ServiceCallDestination} destination The destination of the service call.
 * @property {number} level The node level of this service call in the service call tree.
 * @property {string} predecessor The service call ID of the predecessor in the service call tree.
 * @property {string} serviceCallID Unique service call identifier.
 * @property {ServiceCallSource} source The source of the service call.
 */

/**
 * @typedef {ServiceCallPredecessor} ServiceCall
 * @property {timestamp} createdOn A unix timestamp taken at creation time of the service call.
 * @property {number} executionTime The total execution time of this service call in milliseconds.
 * @property {timestamp} finishedOn A unix timestamp taken at finish time of the service call.
 * @property {boolean} isCompleted Flag to indicate if this service call has been completed.
 * @property {number} lastTaskSeq A system property used to count the number of tasks used to complete the service call.
 * @property {string} authToken A valid authentication token that initialized the service call.
 * @property {ServiceCallResult} result Will contain the results of the service call's execution regardless of the outcome.
 * @property {string[]} successors The service call IDs of the successors in the service call tree.
 * @property {string} transactionID The ID of the parent transaction.
 */

/**
 * @typedef {Object} ServiceCallResult
 * @property {boolean} isSuccessful A flag indicating if this result is a success or not.
 * @property {Exception} [exception] If there was exception during the service call processing, it will be set here. Otherwise it will be 'null'.
 * @property {Object|string} [payload] The payload containing the results from the service call processing. If string, it is ID of the payload in the memory cache instead.
 */

/**
 * A class defining a service caller behavior.
 *
 * @class ServiceCaller
 * @public
 */
class ServiceCaller {

    /**
     * @constructor
     */
    constructor() {}

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
            this.#prepareServiceCall( serviceAddress, serviceParams, serviceExecContext ).then( ( serviceCall ) => {
                return messageDispatcher.sendServiceRequest( serviceCall );
            } ).then( ( result ) => {
                if ( !result ) {
                    result = {
                        isSuccessful: true
                    };
                }
                resolve( result );
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

    /* Private interface */

    /**
     * Used to assemble and prepare a new {@link ServiceCall} object.
     *
     * @param {ServiceAddress} serviceAddress The service address has to define a valid service domain name, service alias, and optionally a service version.
     * @param {Object} serviceParams Set of named parameters to provide to the called service.
     * @param {ServiceExecContext} serviceExecContext The context in which the service call is being executed.
     *
     */
    #prepareServiceCall( serviceAddress, serviceParams, serviceExecContext ) {
        return new Promise( ( resolve, reject ) => {
            // assemble the new service call:
            let transactionID = ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.transactionID : tools.getUUID();
            let level = ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.level + 1 : 0;
            let source = {
                instanceID: ServiceInstance.#instanceID,
                serviceDomainName: ServiceInstance.#serviceDomainName
            };
            let destination = {
                serviceAlias: serviceAddress.serviceAlias,
                serviceDomainName: serviceAddress.serviceDomainName,
                serviceVersion: serviceAddress.serviceVersion,
                serviceParams: serviceParams
            };
            let serviceCall = {
                authToken: serviceExecContext.authToken,
                createdOn: Date.now(),
                destination: destination,
                executionTime: 0,
                isCompleted: false,
                lastTaskSeq: 0,
                level: level,
                predecessor: ( serviceExecContext.previousServiceCall ) ? serviceExecContext.previousServiceCall.serviceCallID : null,
                serviceCallID: tools.getUUID(),
                source: source,
                transactionID: transactionID
            };

            resolve( serviceCall );
        } );
    }
}
