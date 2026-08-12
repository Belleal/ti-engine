export = ServiceCaller;
import MessageObserver = require("#message-observer");
import type { ServiceAddress, ServiceCall, ServiceCallResult, ServiceExecContext } from "#definitions";
/**
 * A class defining a service caller behavior.
 *
 * @class ServiceCaller
 * @extends MessageObserver
 * @public
 */
declare class ServiceCaller extends MessageObserver {
    #private;
    /**
     * @constructor
     */
    constructor();
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
    executeServiceCall(serviceAddress: ServiceAddress, serviceParams: Object, serviceExecContext: ServiceExecContext): Promise<ServiceCallResult>;
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
}
