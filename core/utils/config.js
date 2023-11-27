/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const tools = require( "#tools" );

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
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_MIN_LEVEL
 * @property {EnvironmentVariable} env.TI_AUDITING_LOG_USES_JSON
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_AUTH_KEY
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_DB
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_HOST
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_REDIS_PORT
 * @property {EnvironmentVariable} env.TI_MEMORY_CACHE_USER
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY
 * @property {EnvironmentVariable} env.TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED
 * @property {EnvironmentVariable} env.TI_OPERATION_MODE
 */

/**
 * @typedef {string} CronString
 */

/**
 * @typedef {Object} SettingsMain
 * @property {SettingsAuditing} auditing
 * @property {SettingsGcloudIntegration} gcloudIntegration
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
 * @typedef {Object} SettingsMemoryCache
 * @property {string} authKey
 * @property {number} redisDB
 * @property {string} redisHost
 * @property {number} redisPort
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
 * Enum for listing all system settings.
 *
 * @readonly
 * @enum {string} Keys of this ENUM are strings.
 */
let settingsEnum = tools.enum( {
    AUDITING_LOG_CONSOLE_ENABLED: [ "auditing.logConsoleEnabled", "logConsoleEnabled", "" ],
    AUDITING_LOG_DETAILS: [ "auditing.logDetails", "logDetails", "" ],
    AUDITING_LOG_MIN_LEVEL: [ "auditing.logMinLevel", "logMinLevel", "" ],
    AUDITING_LOG_USES_JSON: [ "auditing.logUsesJSON", "logUsesJSON", "" ],
    GCLOUD_API_KEY: [ "gcloudIntegration.apiKey", "apiKey", "" ],
    GCLOUD_PROJECT_ID: [ "gcloudIntegration.projectID", "projectID", "" ],
    MEMORY_CACHE_AUTH_KEY: [ "memoryCache.authKey", "authKey", "" ],
    MEMORY_CACHE_REDIS_DB: [ "memoryCache.redisDB", "redisDB", "" ],
    MEMORY_CACHE_REDIS_HOST: [ "memoryCache.redisHost", "redisHost", "" ],
    MEMORY_CACHE_REDIS_PORT: [ "memoryCache.redisPort", "redisPort", "" ],
    MEMORY_CACHE_USER: [ "memoryCache.user", "user", "" ],
    MESSAGE_EXCHANGE_QUEUE_PREFIX: [ "messageExchange.messageQueuePrefix", "messageQueuePrefix", "" ],
    MESSAGE_EXCHANGE_MESSAGE_STORE: [ "messageExchange.messageStore", "messageStore", "" ],
    MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED: [ "messageExchange.securityHashEnabled", "securityHashEnabled", "" ],
    MESSAGE_EXCHANGE_SECURITY_HASH_KEY: [ "messageExchange.securityHashKey", "securityHashKey", "" ],
    MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: [ "messageExchange.traceExpirationTime", "traceExpirationTime", "" ],
    MESSAGE_EXCHANGE_TRACE_LOG_ENABLED: [ "messageExchange.traceLogEnabled", "traceLogEnabled", "" ],
    MESSAGE_EXCHANGE_TRACE_REPOSITORY: [ "messageExchange.traceRepository", "traceRepository", "" ],
    SERVICE_EXECUTION_TIMEOUT: [ "serviceConfig.executionTimeout", "executionTimeout", "" ],
    SERVICE_HEALTH_CHECK_ADDRESS: [ "serviceConfig.healthCheckAddress", "healthCheckAddress", "" ],
    SERVICE_HEALTH_CHECK_INTERVAL: [ "serviceConfig.healthCheckInterval", "healthCheckInterval", "" ],
    SERVICE_HEALTH_CHECK_TIMEOUT: [ "serviceConfig.healthCheckTimeout", "healthCheckTimeout", "" ],
    SERVICE_REGISTRY_ADDRESS: [ "serviceConfig.serviceRegistryAddress", "serviceRegistryAddress", "" ],
    OPERATION_MODE: [ "operationMode", "operationMode", "" ]
} );

/**
 * @typedef {string} TiSetting
 */
module.exports.setting = settingsEnum;

/** @type {SettingsMain} */
const settings = require( "#settings" );

// override remaining settings with ENV variables (if provided):
if ( settings.auditing ) {
    settings.auditing.logMinLevel = ( process.env.TI_AUDITING_LOG_MIN_LEVEL !== undefined ) ? process.env.TI_AUDITING_LOG_MIN_LEVEL : settings.auditing.logMinLevel;
    settings.auditing.logConsoleEnabled = ( process.env.TI_AUDITING_LOG_CONSOLE_ENABLED !== undefined ) ? tools.toBool( process.env.TI_AUDITING_LOG_CONSOLE_ENABLED ) : settings.auditing.logConsoleEnabled;
    settings.auditing.logUsesJSON = ( process.env.TI_AUDITING_LOG_USES_JSON !== undefined ) ? tools.toBool( process.env.TI_AUDITING_LOG_USES_JSON ) : settings.auditing.logUsesJSON;
}
if ( settings.memoryCache ) {
    settings.memoryCache.authKey = ( process.env.TI_MEMORY_CACHE_AUTH_KEY !== undefined ) ? process.env.TI_MEMORY_CACHE_AUTH_KEY : settings.memoryCache.authKey;
    settings.memoryCache.redisDB = ( process.env.TI_MEMORY_CACHE_REDIS_DB !== undefined ) ? process.env.TI_MEMORY_CACHE_REDIS_DB : settings.memoryCache.redisDB;
    settings.memoryCache.redisHost = ( process.env.TI_MEMORY_CACHE_REDIS_HOST !== undefined ) ? process.env.TI_MEMORY_CACHE_REDIS_HOST : settings.memoryCache.redisHost;
    settings.memoryCache.redisPort = ( process.env.TI_MEMORY_CACHE_REDIS_PORT !== undefined ) ? process.env.TI_MEMORY_CACHE_REDIS_PORT : settings.memoryCache.redisPort;
    settings.memoryCache.user = ( process.env.TI_MEMORY_CACHE_USER !== undefined ) ? process.env.TI_MEMORY_CACHE_USER : settings.memoryCache.user;
}
if ( settings.messageExchange ) {
    settings.messageExchange.securityHashEnabled = ( process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED !== undefined ) ? tools.toBool( process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED ) : settings.messageExchange.securityHashEnabled;
    settings.messageExchange.securityHashKey = ( process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY !== undefined ) ? process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY : settings.messageExchange.securityHashKey;
    settings.messageExchange.traceLogEnabled = ( process.env.TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED !== undefined ) ? tools.toBool( process.env.TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED ) : settings.messageExchange.traceLogEnabled;
}

// make sure GCloud is enabled before trying to set it up:
if ( process.env.TI_GCLOUD_ENABLED === true && settings.gcloudIntegration ) {
    settings.gcloudIntegration.apiKey = ( process.env.TI_GCLOUD_API_KEY !== undefined ) ? process.env.TI_GCLOUD_API_KEY : settings.gcloudIntegration.apiKey;
    settings.gcloudIntegration.projectID = ( process.env.TI_GCLOUD_PROJECT_ID !== undefined ) ? process.env.TI_GCLOUD_PROJECT_ID : settings.gcloudIntegration.projectID;
}

settings.operationMode = process.env.TI_OPERATION_MODE || settings.operationMode;

// prevent further modifications to the settings object:
Object.freeze( settings );

/**
 * A standard getter method for fetching a setting.
 *
 * @method
 * @param {string|TiSetting} setting Specifies either a dot-separated JSON path of the setting, or is a Setting from the settings enum.
 * @param {*} [defaultValue] The default value to be returned if the setting is not found in the current configuration.
 * @returns {*}
 * @public
 */
module.exports.getSetting = ( setting, defaultValue ) => {
    return _.get( settings, setting, defaultValue );
};
