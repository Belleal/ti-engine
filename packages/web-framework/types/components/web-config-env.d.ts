export = applyWebConfigEnvOverrides;
/**
 * Applies TI_WEB_* environment-variable overrides onto an (already-merged) web server configuration object.
 * Each override is applied ONLY when its environment variable is defined, so an absent variable leaves the
 * configured/default value untouched (fully backward compatible). This gives ti-engine web servers 12-factor,
 * container-friendly control over network binding, TLS, the session cookie secret, the enabled authentication
 * methods, the admin allowlist, the local auth users file path, the trusted request origins, and the `/static` cache policy without editing config files. Note `TI_WEB_AUTH_METHODS`,
 * `TI_WEB_AUTH_ADMINS`, `TI_WEB_TRUSTED_ORIGINS`, and `TI_WEB_STATIC_IMMUTABLE_PATHS` fully REPLACE their config arrays (`auth.enabledMethods` / `auth.admins` / `trustedOrigins` / `staticCache.immutablePaths`) rather than
 * merging — the config-file merge is by-index and cannot cleanly override an array.
 *
 * @method
 * @param {Object} config The web server configuration to augment (mutated in place and returned).
 * @param {Object} [env=process.env] The environment source (injectable for testing).
 * @returns {Object} The same config object, with any present overrides applied.
 * @public
 */
declare function applyWebConfigEnvOverrides(config: Object, env?: Object): Object;
