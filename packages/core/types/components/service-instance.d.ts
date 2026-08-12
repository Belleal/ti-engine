export = ServiceInstance;
/**
 * Abstract class used to define a Service Instance behavior.
 * <br/>
 * NOTE: Inherit this to create a module that can be started as a microservice instance.
 *
 * @class ServiceInstance
 * @abstract
 * @public
 */
declare class ServiceInstance {
    #private;
    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     * @param {ServiceConfiguration} [serviceConfig={ services: [] }] The JSON configuration for this service.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     * @throws {TiException.E_GEN_FEATURE_UNSUPPORTED} If multiple instances are started in the same process.
     */
    constructor(serviceDomainName: string, serviceConfig?: ServiceConfiguration);
    /**
     * Property returning the current service instance ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get instanceID(): string;
    /**
     * Property returning the current service domain name.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get serviceDomainName(): string;
    /**
     * Property to indicate that this and every child class is a {@link ServiceInstance}.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isServiceInstance(): boolean;
    /**
     * Property returning the service configuration JSON.
     *
     * @property
     * @returns {ServiceConfiguration}
     * @public
     */
    get serviceConfig(): ServiceConfiguration;
    /**
     * Initializes the instance.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    start(): Promise<any>;
    /**
     * Executes custom logic on instance start.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStart logic, you can override this method but make sure to call it in the
     * overriding method using: super.onStart()
     *
     * @method
     * @returns {Promise}
     * @virtual
     * @public
     */
    onStart(): Promise<any>;
    /**
     * Shuts down the instance.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    stop(): Promise<any>;
    /**
     * Executes custom logic on instance stop.
     * <br/>
     * NOTE: This method will be invoked automatically.
     * <br/>
     * NOTE: If you need to add more onStop logic, you can override this method but make sure to call it in the
     * overriding method using: super.onStop()
     *
     * @method
     * @returns {Promise}
     * @virtual
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
     * @virtual
     * @public
     */
    reportHealthy(): void;
    /**
     * Used to run internal pre-start logic.
     * <br/>
     * NOTE: This will be executed before any user's custom logic in {@link ServiceInstance.onStart}.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    private #preStart;
    /**
     * Used to run internal post-start logic.
     * <br/>
     * NOTE: This will be executed only after the user's custom logic in {@link ServiceInstance.onStart} has been successfully executed.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    private #postStart;
    /**
     * Used to run internal pre-start logic.
     * <br/>
     * NOTE: This will be executed before any user's custom logic in {@link ServiceInstance.onStop}.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    private #preStop;
    /**
     * Used to run internal post-stop logic.
     * <br/>
     * NOTE: This will be executed only after the user's custom logic in {@link ServiceInstance.onStop} has been successfully executed.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    private #postStop;
}
