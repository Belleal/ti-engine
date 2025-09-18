/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const openidClient = require( "openid-client" );

/**
 * Enum for specifying the authentication method.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiAuthMethod
 */
const authMethodEnum = tools.enum( {
    LOCAL: [ "local", "local", "Local authentication with username and password." ],
    OPENID_AZURE: [ "openid-azure", "openid-azure", "Authentication to Azure Cloud using OpenID Connect." ],
    OPENID_GOOGLE: [ "openid-google", "openid-google", "Authentication to Google using OpenID Connect." ]
} );

module.exports.authMethod = authMethodEnum;

/**
 * @class AuthManager
 * @public
 */
class AuthManager {

    /** @type {SettingsAuth} */
    #authSettings = {
        enabledMethods: [],
        oauth2: {}
    };
    #localAuthentication = {
        username: undefined,
        password: undefined,
        enabled: false
    };

    /**
     * @constructor
     * @param {SettingsAuth} settings
     */
    constructor( settings ) {
        if ( settings ) {
            this.#authSettings = settings;
        }

        if ( this.#authSettings.enabledMethods.includes( authMethodEnum.LOCAL ) ) {
            // TODO: For testing purposes only! Implement real local auth later!
            this.#localAuthentication.username = "admin";
            this.#localAuthentication.password = "admin";
            this.#localAuthentication.enabled = true;
        }

        if ( this.#authSettings.enabledMethods.includes( authMethodEnum.OPENID_GOOGLE ) ) {
            this.#authSettings.oauth2.google = this.#authSettings.oauth2.google || {};
            this.#authSettings.oauth2.google.clientID = process.env.TI_GCLOUD_AUTH_CLIENT_ID;
            this.#authSettings.oauth2.google.clientSecret = process.env.TI_GCLOUD_AUTH_CLIENT_SECRET;
            this.#authSettings.oauth2.google.callbackUrl = this.#authSettings.oauth2.google.callbackUrl || "/login/google-callback";
        }
    }

    /* Public interface */

    /**
     * Used to initialize the authentication manager.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize() {
        return new Promise( ( resolve, reject ) => {
            let promises = [];
            if ( this.#authSettings.enabledMethods.includes( authMethodEnum.OPENID_GOOGLE ) ) {
                promises.push( this.#initializeOpenIDGoogle() );
            }
            return Promise.all( promises ).then( ( result ) => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to verify the local authentication of a request.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {boolean}
     * @public
     */
    localAuthentication( username, password ) {
        // TODO: Implement this!
        if ( this.#localAuthentication.enabled === true ) {
            return ( username === this.#localAuthentication.username && password === this.#localAuthentication.password );
        } else {
            return false;
        }
    }

    /* Private interface */

    /**
     * Used to initialize the OpenID Connect client for Google authentication.
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #initializeOpenIDGoogle() {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement this!
            openidClient.discovery( new URL( "" ), this.#authSettings.oauth2.clientID, this.#authSettings.oauth2.clientSecret ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

}

module.exports = AuthManager;