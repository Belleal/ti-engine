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
const { randomBytes } = require( "node:crypto" );
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
    OPENID_GOOGLE: [ "openid-google", "openid-google", "Authentication to Google Cloud using OpenID Connect." ]
} );

/**
 * Enum for specifying the OpenID Connect client authentication method.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiTokenEndpointAuthMethod
 */
const openIDTokenEndpointAuthMethodEnum = tools.enum( {
    BASIC: [ "client_secret_basic", "basic", "Uses 'client_secret_basic' token endpoint authentication method." ],
    POST: [ "client_secret_post", "post", "Uses 'client_secret_post' token endpoint authentication method." ],
    NONE: [ "none", "none", "Uses 'none' token endpoint authentication method." ]
} );

/**
 * @class AuthManager
 * @public
 */
class AuthManager {

    #initialized = false;
    /** @type {SettingsAuth} */
    #authSettings = {
        enabledMethods: [],
        local: {
            username: undefined,
            password: undefined
        },
        oauth2: {}
    };
    #clientConfigOAuth2Google = {};
    #clientConfigOAuth2Azure = {};

    /**
     * @constructor
     * @param {SettingsAuth} settings
     */
    constructor( settings ) {
        if ( settings ) {
            this.#authSettings = settings;
        }

        // Set up local authentication configuration:
        if ( this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
            // TODO: For testing purposes only! Implement real local auth later!
            this.#authSettings.local = this.#authSettings.local || {};
            this.#authSettings.local.username = "admin";
            this.#authSettings.local.password = "admin";
        }

        // Set up OAuth2 configuration:
        this.#authSettings.oauth2 = this.#authSettings.oauth2 || {};
        if ( this.isAuthEnabled( authMethodEnum.OPENID_GOOGLE ) ) {
            this.#authSettings.oauth2.google = this.#authSettings.oauth2.google || {};
            this.#authSettings.oauth2.google.clientID = process.env.TI_GCLOUD_AUTH_CLIENT_ID || this.#authSettings.oauth2.google.clientID;
            this.#authSettings.oauth2.google.clientSecret = process.env.TI_GCLOUD_AUTH_CLIENT_SECRET || this.#authSettings.oauth2.google.clientSecret;
            this.#authSettings.oauth2.google.callbackUrl = process.env.TI_GCLOUD_AUTH_CALLBACK_URL || this.#authSettings.oauth2.google.callbackUrl;
            this.#authSettings.oauth2.google.discoveryUrl = process.env.TI_GCLOUD_AUTH_DISCOVERY_URL || this.#authSettings.oauth2.google.discoveryUrl;
        }
        if ( this.isAuthEnabled( authMethodEnum.OPENID_AZURE ) ) {
            this.#authSettings.oauth2.azure = this.#authSettings.oauth2.azure || {};
            this.#authSettings.oauth2.azure.clientID = process.env.TI_AZURE_AUTH_CLIENT_ID || this.#authSettings.oauth2.azure.clientID;
            this.#authSettings.oauth2.azure.clientSecret = process.env.TI_AZURE_AUTH_CLIENT_SECRET || this.#authSettings.oauth2.azure.clientSecret;
            this.#authSettings.oauth2.azure.callbackUrl = process.env.TI_AZURE_AUTH_CALLBACK_URL || this.#authSettings.oauth2.azure.callbackUrl;
            this.#authSettings.oauth2.azure.discoveryUrl = process.env.TI_AZURE_AUTH_DISCOVERY_URL || this.#authSettings.oauth2.azure.discoveryUrl;
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
        let promises = [];
        if ( this.isAuthEnabled( authMethodEnum.OPENID_GOOGLE ) ) {
            promises.push( this.#initializeOpenIDClient( this.#authSettings.oauth2.google ).then( ( configuration ) => {
                this.#clientConfigOAuth2Google = configuration;
                logger.log( "Enabled OpenID Connect authentication with Google Cloud.", logger.logSeverity.NOTICE );
            } ) );
        }
        if ( this.isAuthEnabled( authMethodEnum.OPENID_AZURE ) ) {
            promises.push( this.#initializeOpenIDClient( this.#authSettings.oauth2.azure ).then( ( configuration ) => {
                this.#clientConfigOAuth2Azure = configuration;
                logger.log( "Enabled OpenID Connect authentication with Azure Cloud.", logger.logSeverity.NOTICE );
            } ) );
        }

        return Promise.all( promises ).then( () => {
            this.#initialized = true;
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
    isAuthEnabled( authMethod ) {
        return this.#authSettings.enabledMethods.includes( authMethod );
    }

    /**
     * Used to authenticate a user via the specified authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {Object} authDetails
     * @returns {Promise<Object>}
     * @throws {Exception.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the authentication method is not recognized or enabled.
     * @throws {Exception.E_GEN_NOT_INITIALIZED} If the auth manager was not properly initialized.
     * @public
     */
    authenticate( authMethod, authDetails ) {
        if ( !this.#initialized ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_NOT_INITIALIZED );
        }
        switch ( authMethod ) {
            case authMethodEnum.LOCAL:
                return this.#authenticateLocal( authDetails.username, authDetails.password );
            case authMethodEnum.OPENID_GOOGLE:
                return this.#authenticateOpenID( authDetails.baseUrl, this.#authSettings.oauth2.google, this.#clientConfigOAuth2Google );
            case authMethodEnum.OPENID_AZURE:
                return this.#authenticateOpenID( authDetails.baseUrl, this.#authSettings.oauth2.azure, this.#clientConfigOAuth2Azure );
            default: {
                let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
                exception.httpCode = exceptions.httpCode.C_401;
                throw exception;
            }
        }
    }

    /**
     * Used to set up user authorization according to the specified authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @returns {Promise}
     * @throws {Exception.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the authentication method is not recognized.
     * @public
     */
    authorize( authMethod, currentUrl, oidc ) {
        switch ( authMethod ) {
            case authMethodEnum.LOCAL:
                return Promise.resolve();
            case authMethodEnum.OPENID_GOOGLE:
                return this.#authorizeOpenID( currentUrl, oidc, this.#clientConfigOAuth2Google );
            case authMethodEnum.OPENID_AZURE:
                return this.#authorizeOpenID( currentUrl, oidc, this.#clientConfigOAuth2Azure );
            default: {
                let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
                exception.httpCode = exceptions.httpCode.C_401;
                throw exception;
            }
        }
    }

    /**
     * Used to get the callback URL for the specified OAuth2 authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {string}
     * @throws {Exception.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the requested OAuth2 method is not recognized or enabled.
     * @public
     */
    getOAuth2CallbackUrl( authMethod ) {
        if ( authMethod === authMethodEnum.OPENID_GOOGLE && this.isAuthEnabled( authMethodEnum.OPENID_GOOGLE ) ) {
            return this.#authSettings.oauth2.google.callbackUrl;
        } else if ( authMethod === authMethodEnum.OPENID_AZURE && this.isAuthEnabled( authMethodEnum.OPENID_AZURE ) ) {
            return this.#authSettings.oauth2.azure.callbackUrl;
        } else {
            let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
            exception.httpCode = exceptions.httpCode.C_401;
            throw exception;
        }
    }

    /* Private interface */

    /**
     * Used to initialize the OpenID Connect client for the specified OAuth2 authentication method.
     * <br/>
     * NOTE: Google Cloud guide available here: https://developers.google.com/identity/openid-connect/openid-connect
     * <br/>
     * NOTE: Azure Cloud guide available here: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols
     *
     * @method
     * @param {SettingsOAuth2Client} oauth2
     * @returns {Promise<openidClient.Configuration>}
     * @throws {Exception.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the token endpoint authentication method is not recognized.
     * @private
     */
    #initializeOpenIDClient( oauth2 ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Public clients are not fully supported yet!
            let clientAuthentication;
            let metadata = {};
            if ( oauth2.isPublic === true ) {
                metadata = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.NONE };
                clientAuthentication = openidClient.None();
            } else {
                const method = oauth2.tokenEndpointAuthMethod || openIDTokenEndpointAuthMethodEnum.POST;
                switch ( method ) {
                    case openIDTokenEndpointAuthMethodEnum.POST: {
                        clientAuthentication = openidClient.ClientSecretPost( oauth2.clientSecret );
                        metadata = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.POST };
                    }
                        break;
                    case openIDTokenEndpointAuthMethodEnum.BASIC: {
                        clientAuthentication = openidClient.ClientSecretBasic( oauth2.clientSecret );
                        metadata = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.BASIC };
                    }
                        break;
                    default: {
                        let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
                        exception.httpCode = exceptions.httpCode.C_401;
                        throw exception;
                    }
                }
            }

            openidClient.discovery( new URL( oauth2.discoveryUrl ), oauth2.clientID, metadata, clientAuthentication, { algorithm: "oidc" } ).then( ( configuration ) => {
                resolve( configuration );
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
     * @returns {Promise<Object>}
     * @private
     */
    #authenticateLocal( username, password ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement this!
            if ( this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
                resolve( { result: ( username === this.#authSettings.local.username && password === this.#authSettings.local.password ) } );
            } else {
                let exception = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                exception.httpCode = exceptions.httpCode.C_401;
                reject( exception );
            }
        } );
    }

    /**
     * Used to perform the actual OpenID Connect authentication.
     *
     * @method
     * @param {string} baseUrl
     * @param {SettingsOAuth2Client} oauth2
     * @param {openidClient.Configuration} clientConfig
     * @returns {Promise<Object>}
     * @private
     */
    #authenticateOpenID( baseUrl, oauth2, clientConfig ) {
        return new Promise( ( resolve, reject ) => {
            const codeVerifier = openidClient.randomPKCECodeVerifier();
            const nonce = ( typeof openidClient.randomNonce === "function" ) ? openidClient.randomNonce() : randomBytes( 16 ).toString( "base64" );
            const redirectUri = new URL( oauth2.callbackUrl, baseUrl ).toString();
            openidClient.calculatePKCECodeChallenge( codeVerifier ).then( ( codeChallenge ) => {
                const parameters = {
                    redirect_uri: redirectUri,
                    response_type: "code",
                    scope: "openid email profile",
                    state: openidClient.randomState(),
                    code_challenge: codeChallenge,
                    code_challenge_method: "S256",
                    nonce: nonce
                };
                const redirectTo = openidClient.buildAuthorizationUrl( clientConfig, parameters );
                resolve( { redirectTo: redirectTo, codeVerifier: codeVerifier, state: parameters.state, nonce: nonce } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to perform the actual OpenID Connect authorization.
     *
     * @method
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @param {openidClient.Configuration} clientConfig
     * @returns {Promise<Object>}
     * @private
     */
    #authorizeOpenID( currentUrl, oidc, clientConfig ) {
        return new Promise( ( resolve, reject ) => {
            openidClient.authorizationCodeGrant( clientConfig, currentUrl, {
                pkceCodeVerifier: oidc.codeVerifier,
                expectedState: oidc.state,
                expectedNonce: oidc.nonce
            } ).then( ( token ) => {
                const claims = token.claims();
                return openidClient.fetchUserInfo( clientConfig, token.access_token, claims.sub );
            } ).then( ( userInfo ) => {
                resolve( userInfo );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = AuthManager;
module.exports.authMethod = authMethodEnum;