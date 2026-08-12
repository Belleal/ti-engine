export type EnvironmentVariable = string;
export type Environment = NodeJS.Process;
export type SettingsMain = {
    auditing: SettingsAuditing;
    gcloudIntegration: SettingsGcloudIntegration;
    localization: SettingsLocalization;
    memoryCache: SettingsMemoryCache;
    messageExchange: SettingsMessageExchange;
    serviceConfig: SettingsServiceConfig;
    operationMode: string;
};
export type SettingsAuditing = {
    logConsoleEnabled: boolean;
    logDetails: boolean;
    logMinLevel: TiLogSeverity;
    logUsesJSON: boolean;
};
export type SettingsGcloudIntegration = {
    apiKey: string;
    projectID: string;
};
export type SettingsLocalization = {
    labelsPath: Array<string>;
    language: TiLocalizationLanguage;
};
export type SettingsMemoryCache = {
    authKey: string;
    redisDB: number;
    redisHost: string;
    redisPort: number;
    retryMaxAttempts: number;
    retryMaxInterval: number;
    user: string;
};
export type SettingsMessageExchange = {
    messageQueuePrefix: string;
    messageStore: string;
    securityHashEnabled: boolean;
    securityHashKey: string;
    traceExpirationTime: number;
    traceLogEnabled: boolean;
    traceRepository: string;
};
export type SettingsServiceConfig = {
    executionTimeout: number;
    healthCheckAddress: string;
    healthCheckInterval: CronString;
    healthCheckTimeout: number;
    serviceRegistryAddress: string;
};
export type CronString = string;
export type TiEnumValue = {
    value: number | string;
    name: string;
    description?: string;
};
export type TiEnum = {
    properties: Record<string, TiEnumValue>;
    name: (enumValue: number | string, placeholder?: string) => string | undefined;
    description: (enumValue: number | string, placeholder?: string) => string | undefined;
    contains: (enumValue: number | string) => boolean;
};
export type TiLogEntry = {
    /**
     * Unique identifier that can be used to identify the document in a NoSQL database.
     */
    _id: string;
    /**
     * The log severity level.
     */
    severity: TiLogSeverity;
    /**
     * The categorization of the log message.
     */
    thread: string;
    reporter: string;
    /**
     * The actual log message.
     */
    message: string;
    /**
     * The timestamp of the log entry in UTC time.
     */
    timestamp: number;
    /**
     * Additional JSON data to go with the message.
     */
    data: Object;
};
export type TiTraceEntry = {
    chainID: string;
    dispatchEvent: string;
    fromAddress: string;
    messageID: string;
    messageSnapshot: Object;
    messageState: string;
    messageType: string;
    toAddress: string;
    traceID: string;
    traceTimestamp: number;
};
export type TiLocalizedLabel = Object<TiLocalizationLanguage, string>;
export type TiLabelsTree = Object<string, TiLocalizedLabel | TiLabelsTree>;
export type ServiceAddress = {
    /**
     * A valid service alias.
     */
    serviceAlias: string;
    /**
     * A valid service domain name.
     */
    serviceDomainName: string;
    /**
     * Optional service version. If not provided, the latest version will be assumed as a target.
     */
    serviceVersion: number | undefined;
};
export type ServiceExecContext = {
    /**
     * A valid authentication token that initialized the service call (if applicable).
     */
    authToken: string | undefined;
    /**
     * The previous service call in the execution chain (if such exists).
     */
    previousServiceCall: ServiceCallPredecessor | undefined;
};
export type ServiceCallPredecessor = Message;
export type ServiceCall = ServiceCallPredecessor;
export type ServiceCallResult = {
    /**
     * If there was exception during the service call processing, it will be set here. Otherwise, it will be 'undefined'.
     */
    exception: TiException | undefined;
    /**
     * A flag indicating if this service call can be considered successful or not.
     */
    isSuccessful: boolean;
    /**
     * The payload containing the results from the service call processing. If a string, it is ID of the payload in the memory cache instead.
     */
    payload: Object | string | undefined;
};
export type ServiceDefinition = {
    /**
     * Service alias.
     */
    serviceAlias: string;
    /**
     * The JS file containing the service itself. This has to be exposed via package.json import structure!
     */
    serviceFile: string;
    /**
     * Service version.
     */
    serviceVersion?: number;
};
export type ServiceInterface = Object<string, ServiceInterfaceVersion>;
export type ServiceInterfaceVersion = Object<number, ServiceHandlerMethod>;
export type ServiceConfiguration = {
    /**
     * A list of service definitions to be registered with the {@link ServiceProvider}.
     */
    services?: ServiceDefinition[];
};
export type MessageDestination = {
    /**
     * The instance ID of the message exchange by which the message was received (available after acceptance).
     */
    instanceID?: string | undefined;
    /**
     * The route to destination for the message. The exact structure will depend on the implementation of the message exchange.
     */
    route: string;
};
export type MessageSource = {
    /**
     * The instance ID of the message exchange from which the service call originated.
     */
    instanceID: string;
    /**
     * The route from source of the message. The exact structure will depend on the implementation of the message exchange.
     */
    route: string;
};
export type Message = {
    /**
     * Unique identifier of the message chain if the message is part of one.
     */
    chainID: string;
    /**
     * The node level of this message in the message chain tree.
     */
    chainLevel: number;
    /**
     * The destination of the message.
     */
    destination: MessageDestination;
    /**
     * Security hash for the message if the mechanism is enabled.
     */
    hash?: string;
    /**
     * Unique message identifier.
     */
    messageID: string;
    /**
     * The message contents to be processed in destination. If a string, it is ID of the payload in the memory cache instead.
     * Note that if this is not an Object or a string, there is no guarantee that it will be delivered in the same/proper format!
     */
    payload: Object | string | undefined;
    /**
     * The source of the message.
     */
    source: MessageSource;
};
/**
 * @typedef {string} EnvironmentVariable
 */
/**
 * @typedef {NodeJS.Process} Environment
 * @property {ProcessEnv} env
 * @property {EnvironmentVariable} env.TI_GCLOUD_API_KEY
 * @property {EnvironmentVariable} env.TI_GCLOUD_ENABLED
 * @property {EnvironmentVariable} env.TI_GCLOUD_PROJECT_ID
 * @property {EnvironmentVariable} env.TI_INSTANCE_CLASS
 * @property {EnvironmentVariable} env.TI_INSTANCE_CONFIG
 * @property {EnvironmentVariable} env.TI_INSTANCE_ID
 * @property {EnvironmentVariable} env.TI_INSTANCE_NAME
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_CONSOLE_ENABLED
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_DETAILS
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_MIN_LEVEL
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_USES_JSON
 * @property {EnvironmentVariable} env.TI_LOCALIZATION_LABELS_PATH
 * @property {EnvironmentVariable} env.TI_LOCALIZATION_LANGUAGE
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_AUTH_KEY
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_DB
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_HOST
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_PORT
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_RETRY_MAX_ATTEMPTS
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_RETRY_MAX_INTERVAL
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_USER
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED
 */
/**
 * @typedef {Object} SettingsMain
 * @property {SettingsAuditing} auditing
 * @property {SettingsGcloudIntegration} gcloudIntegration
 * @property {SettingsLocalization} localization
 * @property {SettingsMemoryCache} memoryCache
 * @property {SettingsMessageExchange} messageExchange
 * @property {SettingsServiceConfig} serviceConfig
 * @property {string} operationMode
 */
/**
 * @typedef {Object} SettingsAuditing
 * @property {boolean} logConsoleEnabled
 * @property {boolean} logDetails
 * @property {TiLogSeverity} logMinLevel
 * @property {boolean} logUsesJSON
 */
/**
 * @typedef {Object} SettingsGcloudIntegration
 * @property {string} apiKey
 * @property {string} projectID
 */
/**
 * @typedef {Object} SettingsLocalization
 * @property {Array<string>} labelsPath
 * @property {TiLocalizationLanguage} language
 */
/**
 * @typedef {Object} SettingsMemoryCache
 * @property {string} authKey
 * @property {number} redisDB
 * @property {string} redisHost
 * @property {number} redisPort
 * @property {number} retryMaxAttempts
 * @property {number} retryMaxInterval
 * @property {string} user
 */
/**
 * @typedef {Object} SettingsMessageExchange
 * @property {string} messageQueuePrefix
 * @property {string} messageStore
 * @property {boolean} securityHashEnabled
 * @property {string} securityHashKey
 * @property {number} traceExpirationTime
 * @property {boolean} traceLogEnabled
 * @property {string} traceRepository
 */
/**
 * @typedef {Object} SettingsServiceConfig
 * @property {number} executionTimeout
 * @property {string} healthCheckAddress
 * @property {CronString} healthCheckInterval
 * @property {number} healthCheckTimeout
 * @property {string} serviceRegistryAddress
 */
/**
 * @typedef {string} CronString
 */
/**
 * @typedef {Object} TiEnumValue
 * @property {number|string} value
 * @property {string} name
 * @property {string} [description]
 */
/**
 * @typedef {Object} TiEnum
 * @property {Object.<string,TiEnumValue>} properties
 * @property {(enumValue: number|string, placeholder?: string) => string|undefined} name
 * @property {(enumValue: number|string, placeholder?: string) => string|undefined} description
 * @property {(enumValue: number|string) => boolean} contains
 */
/**
 * @typedef {Object} TiLogEntry
 * @property {string} _id Unique identifier that can be used to identify the document in a NoSQL database.
 * @property {TiLogSeverity} severity The log severity level.
 * @property {string} thread The categorization of the log message.
 * @property {string} reporter
 * @property {string} message The actual log message.
 * @property {number} timestamp The timestamp of the log entry in UTC time.
 * @property {Object} data Additional JSON data to go with the message.
 */
/**
 * @typedef {Object} TiTraceEntry
 * @property {string} chainID
 * @property {string} dispatchEvent
 * @property {string} fromAddress
 * @property {string} messageID
 * @property {Object} messageSnapshot
 * @property {string} messageState
 * @property {string} messageType
 * @property {string} toAddress
 * @property {string} traceID
 * @property {number} traceTimestamp
 */
/**
 * The key of this object is the language code, and the value is the textual representation of the label.
 *
 * @typedef {Object<TiLocalizationLanguage, string>} TiLocalizedLabel
 */
/**
 * A nested labels tree where intermediate nodes are objects and leaf nodes are language-to-text maps.
 *
 * @typedef {Object<string, TiLocalizedLabel | TiLabelsTree>} TiLabelsTree
 */
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
 * @property {TiException|undefined} exception If there was exception during the service call processing, it will be set here. Otherwise, it will be 'undefined'.
 * @property {boolean} isSuccessful A flag indicating if this service call can be considered successful or not.
 * @property {Object|string|undefined} payload The payload containing the results from the service call processing. If a string, it is ID of the payload in the memory cache instead.
 */
/**
 * @typedef {Object} ServiceDefinition
 * @property {string} serviceAlias Service alias.
 * @property {string} serviceFile The JS file containing the service itself. This has to be exposed via package.json import structure!
 * @property {number} [serviceVersion] Service version.
 */
/**
 * @typedef {Object.<string, ServiceInterfaceVersion>} ServiceInterface
 */
/**
 * @typedef {Object.<number, ServiceHandlerMethod>} ServiceInterfaceVersion
 */
/**
 * @typedef {Object} ServiceConfiguration
 * @property {ServiceDefinition[]} [services] A list of service definitions to be registered with the {@link ServiceProvider}.
 */
/**
 * @typedef {Object} MessageDestination
 * @property {string|undefined} [instanceID] The instance ID of the message exchange by which the message was received (available after acceptance).
 * @property {string} route The route to destination for the message. The exact structure will depend on the implementation of the message exchange.
 */
/**
 * @typedef {Object} MessageSource
 * @property {string} instanceID The instance ID of the message exchange from which the service call originated.
 * @property {string} route The route from source of the message. The exact structure will depend on the implementation of the message exchange.
 */
/**
 * @typedef {Object} Message
 * @property {string} chainID Unique identifier of the message chain if the message is part of one.
 * @property {number} chainLevel The node level of this message in the message chain tree.
 * @property {MessageDestination} destination The destination of the message.
 * @property {string} [hash] Security hash for the message if the mechanism is enabled.
 * @property {string} messageID Unique message identifier.
 * @property {Object|string|undefined} payload The message contents to be processed in destination. If a string, it is ID of the payload in the memory cache instead.
 * Note that if this is not an Object or a string, there is no guarantee that it will be delivered in the same/proper format!
 * @property {MessageSource} source The source of the message.
 */
