export { settingsEnum as setting };
export declare var getSetting: (setting: string | TiSetting, defaultValue?: any) => any;
export type TiSetting = string;
/**
 * Enum for listing all system settings.
 *
 * @readonly
 * @enum {string} Keys of this ENUM are strings.
 * @typedef {string} TiSetting
 */
declare const settingsEnum: import("../components/definitions.types").TiEnumOf<{
    AUDITING_LOG_CONSOLE_ENABLED: string[];
    AUDITING_LOG_DETAILS: string[];
    AUDITING_LOG_MIN_LEVEL: string[];
    AUDITING_LOG_USES_JSON: string[];
    GCLOUD_API_KEY: string[];
    GCLOUD_PROJECT_ID: string[];
    LOCALIZATION_LABELS_PATH: string[];
    LOCALIZATION_LANGUAGE: string[];
    MEMORY_CACHE_AUTH_KEY: string[];
    MEMORY_CACHE_REDIS_DB: string[];
    MEMORY_CACHE_REDIS_HOST: string[];
    MEMORY_CACHE_REDIS_PORT: string[];
    MEMORY_CACHE_RETRY_MAX_ATTEMPTS: string[];
    MEMORY_CACHE_RETRY_MAX_INTERVAL: string[];
    MEMORY_CACHE_USER: string[];
    MESSAGE_EXCHANGE_QUEUE_PREFIX: string[];
    MESSAGE_EXCHANGE_MESSAGE_STORE: string[];
    MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED: string[];
    MESSAGE_EXCHANGE_SECURITY_HASH_KEY: string[];
    MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME: string[];
    MESSAGE_EXCHANGE_TRACE_LOG_ENABLED: string[];
    MESSAGE_EXCHANGE_TRACE_REPOSITORY: string[];
    SERVICE_EXECUTION_TIMEOUT: string[];
    SERVICE_HEALTH_CHECK_ADDRESS: string[];
    SERVICE_HEALTH_CHECK_INTERVAL: string[];
    SERVICE_HEALTH_CHECK_TIMEOUT: string[];
    SERVICE_REGISTRY_ADDRESS: string[];
    OPERATION_MODE: string[];
}>;
