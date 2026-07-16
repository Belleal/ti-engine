/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

const tools = require( "@ti-engine/core/tools" );

/**
 * Applies TI_WEB_* environment-variable overrides onto an (already-merged) web server configuration object.
 * Each override is applied ONLY when its environment variable is defined, so an absent variable leaves the
 * configured/default value untouched (fully backward compatible). This gives ti-engine web servers 12-factor,
 * container-friendly control over network binding, TLS, and the session cookie secret without editing config files.
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
        config.port = Number( env.TI_WEB_PORT );
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
    return config;
}

module.exports = applyWebConfigEnvOverrides;
