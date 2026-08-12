export = ServiceConsumer;
import ServiceInstance = require("#service-instance");
/**
 * Abstract class used to define a Service Consumer behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice consumer instance.
 * <br/>
 * NOTE: A service consumer is a microservice that can invoke named business services in the APIs of other
 * microservices using {@link ServiceCall} objects. The consumer does not need to know the specifics of
 * the business logic in these services but only the service address and the inbound parameters (if any).
 * The result of the execution will be returned to the consumer in a {@link ServiceCallResult} object.
 *
 * @class ServiceConsumer
 * @extends ServiceInstance
 * @abstract
 * @public
 */
declare class ServiceConsumer extends ServiceInstance {
    #private;
    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {ServiceConfiguration} [serviceConfig] The JSON configuration for this service.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(serviceDomainName: string, serviceConfig?: ServiceConfiguration);
    /**
     * Perform initialization tasks when the service consumer starts.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStart logic you can override this method but make sure to call it in the
     * overriding method using: super.onStart()
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart(): Promise<any>;
    /**
     * Perform shut down and cleanup tasks when the service consumer stops.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStop logic you can override this method but make sure to call it in the
     * overriding method using: super.onStop()
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStop(): Promise<any>;
    /**
     * Used to report health status of the service instance for external monitoring.
     * This is a scheduled job that will be executed at SERVICE_HEALTH_CHECK_INTERVAL time.
     * <br/>
     * NOTE: By default this method will update a Redis key with an expiration timer. You can override this
     * functionality with something custom like calling an HTTP endpoint.
     *
     * @method
     * @override
     * @virtual
     * @public
     */
    reportHealthy(): void;
    /**
     * Used to invoke a business service in any {@link ServiceInstance}.
     *
     * @method
     * @param {ServiceAddress} serviceAddress
     * @param {Object} serviceParams
     * @param {ServiceExecContext} serviceExecContext
     * @returns {Promise<ServiceCallResult>}
     * @public
     */
    callService(serviceAddress: ServiceAddress, serviceParams: Object, serviceExecContext: ServiceExecContext): Promise<ServiceCallResult>;
}
