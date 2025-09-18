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

/**
 * @class AuthManager
 * @public
 */
class AuthManager {

    /** @type {SettingsAuth} */
    #authSettings = {
        enabledMethods: [],
        local: {
            username: undefined,
            password: undefined,
            enabled: false
        },
        oauth2: {}
    };
    #googleOauth2Configuration = {};

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
            this.#authSettings.local = this.#authSettings.local || {};
            this.#authSettings.local.username = "admin";
            this.#authSettings.local.password = "admin";
            this.#authSettings.local.enabled = true;
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
            return Promise.all( promises ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to check whether the specified authentication method is enabled.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {boolean}
     * @public
     */
    isEnabled( authMethod ) {
        return this.#authSettings.enabledMethods.includes( authMethod );
    }

    /**
     * Used to authenticate a user via the specified authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {Object} authDetails
     * @returns {Promise}
     * @throws {Exception} If the authentication method is not recognized or enabled.
     * @public
     */
    authenticate( authMethod, authDetails ) {
        switch ( authMethod ) {
            case authMethodEnum.LOCAL:
                return this.#localAuthentication( authDetails.username, authDetails.password );
            case authMethodEnum.OPENID_GOOGLE:
                return this.#openIDGoogleAuthentication( authDetails.baseUrl );
            default: {
                let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
                exception.httpCode = exceptions.httpCode.C_401;
                throw exception;
            }
        }
    }

    /**
     * Used to get the callback URL for Google authentication.
     * <br/>
     * NOTE: This method is only available if the Google authentication method is enabled.
     *
     * @method
     * @returns {string}
     * @throws {Exception} If the Google authentication method is not enabled.
     * @public
     */
    getGoogleCallbackUrl() {
        if ( this.#authSettings.enabledMethods.includes( authMethodEnum.OPENID_GOOGLE ) ) {
            return this.#authSettings.oauth2.google.callbackUrl;
        } else {
            let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
            exception.httpCode = exceptions.httpCode.C_401;
            throw exception;
        }
    }

    /* Private interface */

    /**
     * Used to verify the local authentication of a request.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {Promise<boolean>}
     * @private
     */
    #localAuthentication( username, password ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement this!
            if ( this.#authSettings.local.enabled === true ) {
                resolve( username === this.#authSettings.local.username && password === this.#authSettings.local.password );
            } else {
                let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                exception.httpCode = exceptions.httpCode.C_401;
                reject( exception );
            }
        } );
    }

    /**
     * Used to initialize the OpenID Connect client for Google authentication.
     * <br/>
     * NOTE: Guide available here https://developers.google.com/identity/openid-connect/openid-connect
     *
     * @method
     * @returns {Promise}
     * @private
     */
    #initializeOpenIDGoogle() {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement this!
            const googleDiscoveryUrl = "https://accounts.google.com/.well-known/openid-configuration";
            const googleSettings = this.#authSettings.oauth2.google;
            openidClient.discovery( new URL( googleDiscoveryUrl ), googleSettings.clientID, googleSettings.clientSecret ).then( ( configuration ) => {
                this.#googleOauth2Configuration = configuration;
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to perform the actual OpenID Connect authentication.
     *
     * @method
     * @param {string} baseUrl
     * @returns {Promise<URL>}
     * @private
     */
    #openIDGoogleAuthentication( baseUrl ) {
        return new Promise( ( resolve, reject ) => {
            const codeVerifier = openidClient.randomPKCECodeVerifier();
            openidClient.calculatePKCECodeChallenge( codeVerifier ).then( ( codeChallenge ) => {
                const parameters = {
                    redirect_uri: `${ baseUrl }${ this.#authSettings.oauth2.google.callbackUrl }`,
                    response_type: "code",
                    client_id: this.#authSettings.oauth2.google.clientID,
                    scope: "openid email profile",
                    code_challenge: codeChallenge,
                    code_challenge_method: "S256"
                };
                if ( !this.#googleOauth2Configuration.serverMetadata().supportsPKCE() ) {
                    parameters.state = openidClient.randomState();
                }
                const redirectTo = openidClient.buildAuthorizationUrl( this.#googleOauth2Configuration, parameters );
                resolve( redirectTo );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = AuthManager;
module.exports.authMethod = authMethodEnum;