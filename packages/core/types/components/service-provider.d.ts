export = ServiceProvider;
import ServiceConsumer = require("#service-consumer");
/**
 * Abstract class used to define a Service Provider behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice provider instance.
 * <br/>
 * NOTE: A service provider is a microservice that offers an API of named business services that can be invoked by other
 * microservices using {@link ServiceCall} objects. The provider will take care of the actual execution of that service and
 * therefore acts as a "black box". The only necessary items are the service address and optional inbound parameters to be
 * used in that service's logic. The result of the service's execution will be bundled in an {@link ServiceCallResult}
 * object and returned to the caller.
 *
 * @class ServiceProvider
 * @extends ServiceConsumer
 * @abstract
 * @public
 */
declare class ServiceProvider extends ServiceConsumer {
    #private;
    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {ServiceConfiguration} [serviceConfig] The JSON configuration for this service.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(serviceDomainName: string, serviceConfig?: ServiceConfiguration);
    /**
     * Perform initialization tasks when the service provider starts.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStart logic, you can override this method but make sure to call it in the
     * overriding method using: super.onStart()
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart(): Promise<any>;
    /**
     * Perform shut down and cleanup tasks when the service provider stops.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStop logic, you can override this method but make sure to call it in the
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
     * NOTE: By default, this method will update a Redis key with an expiration timer. You can override this
     * functionality with something custom like calling an HTTP endpoint.
     *
     * @method
     * @override
     * @virtual
     * @public
     */
    reportHealthy(): void;
    /**
     * Used to verify whether the service caller has authorization to access the service.
     * <br/>
     * NOTE: Override this to implement authorization check. By default, this method simply returns.
     *
     * @method
     * @param {string} authToken
     * @param {ServiceAddress} serviceAddress
     * @return {Promise}
     * @virtual
     * @public
     */
    verifyAccess(authToken: string, serviceAddress: ServiceAddress): Promise<any>;
    /**
     * Used to register a single service to the service provider's API. One service can have multiple versions accessible at the same time.
     * <br/>
     * NOTE: This will actually bind the serviceDefinition as the first parameter of the service handler function. When creating default service handlers,
     * keep in mind that your first param must always be the 'serviceDefinition' and the second one will be the general 'serviceParams' object.
     * <br/>
     * NOTE: Additionally, if you intend to call another service inside the service handler, then you have to use a normal function for the handler and not
     * an arrow function! Arrow functions cannot bind the scope of the parent class to themselves, and you won't have access to it and its methods.
     *
     * @method
     * @param {ServiceDefinition} serviceDefinition Full service definition object.
     * @param {ServiceHandlerMethod} [defaultServiceHandler=undefined] A default service handler in case there is one.
     * @return {Promise}
     * @public
     */
    registerService(serviceDefinition: ServiceDefinition, defaultServiceHandler?: ServiceHandlerMethod): Promise<any>;
    /**
     * Used to register multiple services from the provided service definitions.
     *
     * @method
     * @param {ServiceDefinition[]} serviceDefinitions
     * @param {ServiceHandlerMethod} [defaultServiceHandler=undefined]
     * @return {Promise}
     * @public
     */
    registerServices(serviceDefinitions: ServiceDefinition[], defaultServiceHandler?: ServiceHandlerMethod): Promise<any>;
    /**
     * Used to get an ordered list of all currently registered services. This does not include the service versions.
     *
     * @method
     * @returns {string[]}
     * @public
     */
    getRegisteredServices(): string[];
}
