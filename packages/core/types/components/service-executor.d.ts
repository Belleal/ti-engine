export = ServiceExecutor;
import MessageObserver = require("#message-observer");
import ServiceInstance = require("#service-instance");
import type { ServiceAddress, ServiceCall, ServiceDefinition, ServiceExecContext, ServiceInterface } from "#definitions";
export type VerifyAccessMethod = (authToken: string, serviceAddress: ServiceAddress) => Promise<any>;
export type ServiceHandlerMethod = (serviceDefinition: ServiceDefinition, serviceParams: Object, serviceExecContext: ServiceExecContext) => Promise<Object | undefined>;
/** @import { ServiceAddress, ServiceCall, ServiceDefinition, ServiceExecContext, ServiceInterface } from "#definitions" */
/**
 * @callback VerifyAccessMethod
 * @param {string} authToken
 * @param {ServiceAddress} serviceAddress
 * @returns {Promise<*>}
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
declare class ServiceExecutor extends MessageObserver {
    #private;
    /**
     * @constructor
     */
    constructor();
    /**
     * Property returning the current service interface.
     *
     * @property
     * @returns {ServiceInterface}
     * @public
     */
    get serviceInterface(): ServiceInterface;
    /**
     *
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {ServiceCall} serviceCall The service call message for processing.
     * @returns {ServiceCall} The service call message that was received.
     * @override
     * @public
     */
    onMessage(identifier: string, serviceCall: ServiceCall): ServiceCall;
    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionLost(identifier: string): void;
    /**
     * Used to set up the method for service access verification.
     *
     * @method
     * @param {VerifyAccessMethod} verifyAccess
     * @public
     */
    configureVerifyAccess(verifyAccess: VerifyAccessMethod): void;
    /**
     * Used to add a service handler to the service interface.
     * <br/>
     * NOTE: If the same version of the service handler already exists, it will be overridden!
     *
     * @method
     * @param {ServiceHandlerMethod} serviceHandler
     * @param {ServiceDefinition} serviceDefinition
     * @param {ServiceInstance} serviceInstance This will be used as context to bind all business services.
     * @returns {Promise}
     * @public
     */
    addServiceHandler(serviceHandler: ServiceHandlerMethod, serviceDefinition: ServiceDefinition, serviceInstance: ServiceInstance): Promise<any>;
}
