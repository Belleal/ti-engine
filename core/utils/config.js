/**
 * A set of objects and functions related to reading and accessing the system configurations.
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
 * @property {EnvironmentVariable} env.TI_INSTANCE_ID
 * @property {EnvironmentVariable} env.TI_INSTANCE_NAME
 * @property {EnvironmentVariable} env.TI_LOG_CONSOLE_ENABLED
 * @property {EnvironmentVariable} env.TI_LOG_MIN_LEVEL
 * @property {EnvironmentVariable} env.TI_LOG_USED_JSON
 * @property {EnvironmentVariable} env.TI_OPERATION_MODE
 */

/**
 * @typedef {string} CronString
 */

/**
 * @typedef {Object} SettingsMain
 * @property {SettingsAuditing} auditing
 * @property {SettingsGcloudIntegration} gcloudIntegration
 * @property {SettingsServiceConfig} serviceConfig
 * @property {string} operationMode
 */

/**
 * @typedef {Object} SettingsAuditing
 * @property {boolean} logConsoleEnabled
 * @property {TiLogSeverity} logMinLevel
 * @property {boolean} logUsesJSON
 */

/**
 * @typedef {Object} SettingsGcloudIntegration
 * @property {string} apiKey
 * @property {string} projectID
 */

/**
 * @typedef {Object} SettingsServiceConfig
 * @property {string} healthCheckAddress
 * @property {CronString} healthCheckInterval
 * @property {number} healthCheckTimeout
 */

/**
 * Enum for listing all system settings.
 *
 * @readonly
 * @extends TiEnum
 * @enum {number}
 */
let settingsEnum = tools.enum( {
    AUDITING_LOG_CONSOLE_ENABLED: [ "auditing.logConsoleEnabled", "logConsoleEnabled", "" ],
    AUDITING_LOG_MIN_LEVEL: [ "auditing.logMinLevel", "logMinLevel", "" ],
    AUDITING_LOG_USES_JSON: [ "auditing.logUsesJSON", "logUsesJSON", "" ],
    GCLOUD_API_KEY: [ "gcloudIntegration.apiKey", "apiKey", "" ],
    GCLOUD_PROJECT_ID: [ "gcloudIntegration.projectID", "projectID", "" ],
    SERVICE_HEALTH_CHECK_ADDRESS: [ "serviceConfig.healthCheckAddress", "healthCheckAddress", "" ],
    SERVICE_HEALTH_CHECK_INTERVAL: [ "serviceConfig.healthCheckInterval", "healthCheckInterval", "" ],
    SERVICE_HEALTH_CHECK_TIMEOUT: [ "serviceConfig.healthCheckTimeout", "healthCheckTimeout", "" ],
    OPERATION_MODE: [ "operationMode", "operationMode", "" ]
} );

/**
 * @typedef {TiEnum} Setting
 */
module.exports.setting = settingsEnum;

/** @type {SettingsMain} */
const settings = require( "#settings" );

// override remaining settings with ENV variables (if provided):
if ( settings.auditing ) {
    settings.auditing.logMinLevel = ( process.env.TI_LOG_MIN_LEVEL !== undefined ) ? process.env.TI_LOG_CONSOLE_ENABLED : settings.auditing.logMinLevel;
    settings.auditing.logConsoleEnabled = ( process.env.TI_LOG_CONSOLE_ENABLED !== undefined ) ? tools.toBool( process.env.TI_LOG_CONSOLE_ENABLED ) : settings.auditing.logConsoleEnabled;
    settings.auditing.logUsesJSON = ( process.env.TI_LOG_USED_JSON !== undefined ) ? tools.toBool( process.env.TI_LOG_USED_JSON ) : settings.auditing.logUsesJSON;
}

// make sure GCloud is enabled:
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
 * @param {string|Setting} setting Specifies either a dot-separated JSON path of the setting, or is a Setting from the settings enum.
 * @param {*} [defaultValue] The default value to be returned if the setting is not found in the current configuration.
 * @returns {*}
 * @public
 */
module.exports.getSetting = ( setting, defaultValue ) => {
    let path = ( _.isString( setting ) ) ? setting : setting.properties.value;
    return _.get( settings, path, defaultValue );
};
