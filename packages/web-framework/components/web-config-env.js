/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

"use strict";

const tools = require( "@ti-engine/core/tools" );

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
function applyWebConfigEnvOverrides( config, env = process.env ) {
    if ( !config || typeof config !== "object" ) {
        return config;
    }
    if ( env.TI_WEB_HOST !== undefined ) {
        config.host = env.TI_WEB_HOST;
    }
    if ( env.TI_WEB_PORT !== undefined ) {
        const port = Number( env.TI_WEB_PORT );
        if ( Number.isInteger( port ) ) {
            config.port = port;
        }
    }
    if ( env.TI_WEB_USE_TLS !== undefined ) {
        config.useTLS = tools.toBool( env.TI_WEB_USE_TLS );
    }
    if ( env.TI_WEB_TLS_CERT_PATH !== undefined ) {
        config.tlsCertPath = env.TI_WEB_TLS_CERT_PATH;
    }
    if ( env.TI_WEB_TLS_KEY_PATH !== undefined ) {
        config.tlsKeyPath = env.TI_WEB_TLS_KEY_PATH;
    }
    if ( env.TI_WEB_COOKIE_SECRET !== undefined ) {
        config.cookies = config.cookies || {};
        config.cookies.secret = env.TI_WEB_COOKIE_SECRET;
    }
    if ( env.TI_WEB_SESSION_IDLE_TIMEOUT !== undefined ) {
        // MINUTES, because that is the unit a deployment actually reasons in — and because the millisecond field it
        // feeds is what went wrong here in the first place: `604800` was written into `cookies.maxAge` meaning seven
        // days, and express-session read it as 604800 MILLISECONDS, giving every user a ten-minute session. Naming
        // the unit in the variable and converting here keeps that mistake from being expressible.
        const minutes = Number( env.TI_WEB_SESSION_IDLE_TIMEOUT );
        if ( Number.isInteger( minutes ) && minutes > 0 ) {
            config.cookies = config.cookies || {};
            config.cookies.maxAge = minutes * 60 * 1000;
        }
    }
    if ( env.TI_WEB_AUTH_METHODS !== undefined ) {
        config.auth = config.auth || {};
        config.auth.enabledMethods = env.TI_WEB_AUTH_METHODS.split( "," ).map( ( method ) => method.trim() ).filter( ( method ) => method.length > 0 );
    }
    if ( env.TI_WEB_AUTH_ADMINS !== undefined ) {
        config.auth = config.auth || {};
        config.auth.admins = env.TI_WEB_AUTH_ADMINS.split( "," ).map( ( entry ) => entry.trim() ).filter( ( entry ) => entry.length > 0 );
    }
    if ( env.TI_WEB_AUTH_LOCAL_USERS_PATH !== undefined ) {
        config.auth = config.auth || {};
        config.auth.local = config.auth.local || {};
        config.auth.local.usersPath = env.TI_WEB_AUTH_LOCAL_USERS_PATH;
    }
    if ( env.TI_WEB_TRUSTED_ORIGINS !== undefined ) {
        config.trustedOrigins = env.TI_WEB_TRUSTED_ORIGINS.split( "," ).map( ( origin ) => origin.trim() ).filter( ( origin ) => origin.length > 0 );
    }
    if ( env.TI_WEB_STATIC_MAX_AGE !== undefined ) {
        // Seconds, matching the `Cache-Control` directive itself. A non-integer is left to the config value rather
        // than coerced, exactly as TI_WEB_PORT is — `TiWebServer.resolveStaticCachePolicy` reports the bad value.
        const maxAge = Number( env.TI_WEB_STATIC_MAX_AGE );
        if ( Number.isInteger( maxAge ) && maxAge >= 0 ) {
            config.staticCache = config.staticCache || {};
            config.staticCache.maxAge = maxAge;
        }
    }
    if ( env.TI_WEB_STATIC_IMMUTABLE !== undefined ) {
        config.staticCache = config.staticCache || {};
        config.staticCache.immutable = tools.toBool( env.TI_WEB_STATIC_IMMUTABLE );
    }
    if ( env.TI_WEB_STATIC_IMMUTABLE_PATHS !== undefined ) {
        config.staticCache = config.staticCache || {};
        config.staticCache.immutablePaths = env.TI_WEB_STATIC_IMMUTABLE_PATHS.split( "," ).map( ( prefix ) => prefix.trim() ).filter( ( prefix ) => prefix.length > 0 );
    }
    return config;
}

module.exports = applyWebConfigEnvOverrides;
