export { cacheCapabilityEnum as cacheCapability };
export type TiCacheCapability = string;
/**
 * Enum for listing the optional behaviors a cache backend may or may not provide.
 * <br/>
 * NOTE: A backend declares what it supports through {@link CacheProvider#capabilities}; an application declares what it
 * requires through the 'memoryCache.requiredCapabilities' setting. The two are reconciled once, during startup, so that
 * a backend which cannot do what the application needs fails where somebody is watching rather than inside a request
 * weeks later.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiCacheCapability
 */
declare const cacheCapabilityEnum: import("../definitions.types").TiEnumOf<{
    KEY_EXPIRY: string[];
    KEY_PATTERN_MATCH: string[];
    LISTS: string[];
    SETS: string[];
    HASH_FIELDS: string[];
    JSON_DOCUMENTS: string[];
    ATOMIC_JSON_EDIT: string[];
}>;
