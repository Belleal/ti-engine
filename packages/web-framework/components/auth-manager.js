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
const fs = require( "node:fs" );
const openidClient = require( "openid-client" );
const User = require( "#user" );
const localUserDirectory = require( "#local-user-directory" );

/** @import { SettingsAuth } from "#web-server" */

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
 * The AuthManager class is used to manage authentication and authorization.
 *
 * @class AuthManager
 * @public
 */
class AuthManager {

    #initialized = false;
    /** @type {SettingsAuth} */
    #authSettings = {
        enabledMethods: [],
        local: {
            usersPath: undefined
        },
        oauth2: {}
    };
    #clientConfigOAuth2Google = {};
    #clientConfigOAuth2Azure = {};

    // Whether the local user directory is genuinely usable: set true only after #loadLocalUserDirectory performs
    // a successful reconcile that produced at least one record. Every other outcome — no 'usersPath' configured,
    // an unreadable/unparseable file, a file that reconciles to zero records, or a Redis failure during reconcile
    // — leaves this false. #authenticateLocal and authorize() both require it before consulting the directory,
    // because localUserDirectory.findByUsername reads Redis directly: without this flag, records reconciled by
    // an EARLIER successful boot would remain live and would still authenticate even though the CURRENT boot's
    // log already told the operator "every local sign-in will be refused". A failed load deliberately still does
    // not erase those stale Redis records (see #loadLocalUserDirectory's own doc comment) — this flag is what
    // makes them inert instead of merely unmentioned.
    #localDirectoryUsable = false;

    // A fixed, valid encoding used only to spend comparable time on an unknown or disabled username. It corresponds
    // to no usable password. Computed lazily on first use rather than at module/class load: eagerly running
    // scryptSync (~100ms, blocking) for every instance — even one where 'local' is disabled entirely, e.g.
    // competence's shipped Azure-only image — pays that cost at startup for nothing. Memoized because the whole
    // point is a fixed value nothing can ever verify against; recomputing it per call would just waste the cost
    // repeatedly for no benefit.
    static #timingDecoyHash;

    /**
     * Lazily computes and memoizes the timing decoy hash (see {@link AuthManager.#timingDecoyHash}).
     *
     * @method
     * @static
     * @returns {string}
     */
    static #getTimingDecoyHash() {
        if ( AuthManager.#timingDecoyHash === undefined ) {
            AuthManager.#timingDecoyHash = localUserDirectory.hashPassword( randomBytes( 32 ).toString( "base64" ) );
        }
        return AuthManager.#timingDecoyHash;
    }

    /**
     * @constructor
     * @param {SettingsAuth} settings
     */
    constructor( settings ) {
        if ( settings ) {
            this.#authSettings = settings;
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
        // Drop any OpenID Connect provider that is enabled but not configured (missing a client ID) so the
        // instance boots with the remaining methods instead of crashing during discovery — e.g. a container
        // started without OAuth credentials falls back to whatever else is enabled rather than failing to start.
        this.#dropUnconfiguredOpenIDProviders();

        let promises = [];
        if ( this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
            promises.push( this.#loadLocalUserDirectory() );
        }
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
     * Returns the list of currently enabled authentication methods, reflecting any OpenID providers dropped by
     * {@link AuthManager#initialize} for being enabled but unconfigured. Callers (e.g. the login-page renderer)
     * use this to present only the methods a user can actually complete.
     *
     * @method
     * @returns {TiAuthMethod[]}
     * @public
     */
    getEnabledMethods() {
        return [ ...this.#authSettings.enabledMethods ];
    }

    /**
     * Used to authenticate a user via the specified authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {Object} authDetails
     * @returns {Promise<Object>}
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the authentication method is not recognized or enabled.
     * @throws {TiException.E_GEN_NOT_INITIALIZED} If the auth manager was not properly initialized.
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
                throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
            }
        }
    }

    /**
     * Used to set up user authorization according to the specified authentication method.
     * <br/>
     * NOTE: This presupposes a successful, immediately preceding {@link AuthManager#authenticate} call for the
     * same credentials and is NOT an independent authentication check on its own — for `LOCAL` it performs no
     * password verification. It refuses an absent, disabled, or (for `LOCAL`) not-yet-usable-directory record,
     * but a caller that invokes it without having just authenticated bypasses password verification entirely.
     * The framework's own login route always calls `authenticate()` first (see `web-handlers.js`); this method
     * is public on both `AuthManager` and `TiWebServer`, so any other caller must preserve that ordering itself.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @returns {Promise<User>}
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the authentication method is not recognized.
     * @public
     */
    authorize( authMethod, currentUrl, oidc ) {
        switch ( authMethod ) {
            case authMethodEnum.LOCAL:
                // Requires the same #localDirectoryUsable flag #authenticateLocal requires — see its declaration
                // — so a stale Redis-backed record from an earlier successful boot cannot mint a session User
                // merely because authorize() looks the username up independently of #authenticateLocal.
                if ( !this.#localDirectoryUsable ) {
                    return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
                }
                return localUserDirectory.findByUsername( oidc.username ).then( ( record ) => {
                    // A disabled record must be refused here too, not only by #authenticateLocal: the two
                    // lookups are independent reads of the same Redis-backed directory, and a reconcile that
                    // flips 'disabled' between them would otherwise let authorize() admit what authenticate()
                    // had just refused (or vice versa).
                    if ( !record || record.disabled === true ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                    }
                    return new User( {
                        userID: record.userID,
                        username: record.username,
                        email: record.email,
                        name: record.name
                    } );
                } );
            case authMethodEnum.OPENID_GOOGLE:
                return this.#authorizeOpenID( currentUrl, oidc, this.#clientConfigOAuth2Google );
            case authMethodEnum.OPENID_AZURE:
                return this.#authorizeOpenID( currentUrl, oidc, this.#clientConfigOAuth2Azure );
            default: {
                throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
            }
        }
    }

    /**
     * Used to get the callback URL for the specified OAuth2 authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {string}
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the requested OAuth2 method is not recognized or enabled.
     * @public
     */
    getOAuth2CallbackUrl( authMethod ) {
        if ( authMethod === authMethodEnum.OPENID_GOOGLE && this.isAuthEnabled( authMethodEnum.OPENID_GOOGLE ) ) {
            return this.#authSettings.oauth2.google.callbackUrl;
        } else if ( authMethod === authMethodEnum.OPENID_AZURE && this.isAuthEnabled( authMethodEnum.OPENID_AZURE ) ) {
            return this.#authSettings.oauth2.azure.callbackUrl;
        } else {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD );
        }
    }

    /**
     * Used to get the local route path of the callback for the specified OAuth2 authentication method.
     * <br/>
     * A callback can legitimately be configured either as a path or as the full absolute URL registered with the
     * identity provider. The absolute form is what the provider expects as the redirect URI, but it is not a usable
     * Express route pattern, so this reduces whatever is configured to the path the server must actually listen on.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {string|null} The route path, or null if the configured callback yields no usable path.
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the requested OAuth2 method is not recognized or enabled.
     * @public
     */
    getOAuth2CallbackPath( authMethod ) {
        return AuthManager.toCallbackPath( this.getOAuth2CallbackUrl( authMethod ) );
    }

    /**
     * Reduces a configured OAuth2 callback value to the local route path it corresponds to. Accepts an absolute URL
     * ('https://host/login/azure-callback'), a protocol-relative URL, or a path with or without its leading slash,
     * and strips any query string or fragment. Pure and static; exposed for unit testing.
     * <br/>
     * NOTE: This exists because Express 5 parses a route pattern with path-to-regexp v8, where ':' opens a parameter
     * name — so an absolute URL used verbatim as a route path throws 'Missing parameter name' at startup.
     *
     * @method
     * @static
     * @param {string} callbackUrl
     * @returns {string|null} The route path, or null if no usable path can be derived.
     * @public
     */
    static toCallbackPath( callbackUrl ) {
        const value = String( callbackUrl || "" ).trim();
        if ( value === "" ) {
            return null;
        }
        try {
            // The base is only a parsing anchor — an absolute or protocol-relative value overrides it, while a
            // path or bare relative value resolves against it. Either way only the pathname is used.
            return new URL( value, "http://localhost" ).pathname;
        } catch {
            return null;
        }
    }

    /* Private interface */

    /**
     * Removes any OpenID Connect provider that is enabled but not configured (missing a client ID) from the set
     * of enabled authentication methods, logging a warning for each. This prevents a startup crash during OpenID
     * discovery when an enabled provider has no credentials (e.g. a container started without OAuth env vars): the
     * instance boots on its remaining methods, and `isAuthEnabled` then correctly reports the dropped provider as
     * unavailable so a sign-in attempt against it is rejected per-request instead of taking down startup.
     *
     * @method
     */
    #dropUnconfiguredOpenIDProviders() {
        const providers = [
            { method: authMethodEnum.OPENID_GOOGLE, oauth2: this.#authSettings.oauth2.google, label: "Google" },
            { method: authMethodEnum.OPENID_AZURE, oauth2: this.#authSettings.oauth2.azure, label: "Azure" }
        ];
        providers.forEach( ( provider ) => {
            if ( this.isAuthEnabled( provider.method ) && !this.#isOpenIDConfigured( provider.oauth2 ) ) {
                this.#authSettings.enabledMethods = this.#authSettings.enabledMethods.filter( ( method ) => method !== provider.method );
                logger.log( `OpenID Connect (${ provider.label }) is enabled but not configured (missing client ID); skipping this provider.`, logger.logSeverity.WARNING );
            }
        } );
    }

    /**
     * Checks whether an OpenID Connect provider has the minimum configuration required to initialize (a non-empty client ID).
     *
     * @method
     * @param {SettingsOAuth2Client} [oauth2] The provider's OAuth2 settings.
     * @returns {boolean}
     */
    #isOpenIDConfigured( oauth2 ) {
        return !!( oauth2 && typeof oauth2.clientID === "string" && oauth2.clientID.trim() !== "" );
    }

    /**
     * Used to initialize the OpenID Connect client for the specified OAuth2 authentication method.
     * <br/>
     * NOTE: A Google Cloud guide available here: https://developers.google.com/identity/openid-connect/openid-connect
     * <br/>
     * NOTE: An Azure Cloud guide available here: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols
     *
     * @method
     * @param {SettingsOAuth2Client} oauth2
     * @returns {Promise<openidClient.Configuration>}
     */
    #initializeOpenIDClient( oauth2 ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Public clients are not fully supported yet!
            let clientAuthentication;
            let metaData;
            if ( oauth2.isPublic === true ) {
                metaData = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.NONE };
                clientAuthentication = openidClient.None();
            } else {
                const method = oauth2.tokenEndpointAuthMethod || openIDTokenEndpointAuthMethodEnum.POST;
                switch ( method ) {
                    case openIDTokenEndpointAuthMethodEnum.POST: {
                        clientAuthentication = openidClient.ClientSecretPost( oauth2.clientSecret );
                        metaData = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.POST };
                    }
                        break;
                    case openIDTokenEndpointAuthMethodEnum.BASIC: {
                        clientAuthentication = openidClient.ClientSecretBasic( oauth2.clientSecret );
                        metaData = { token_endpoint_auth_method: openIDTokenEndpointAuthMethodEnum.BASIC };
                    }
                        break;
                    default: {
                        return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNRECOGNIZED_AUTH_METHOD ) );
                    }
                }
            }

            openidClient.discovery( new URL( oauth2.discoveryUrl ), oauth2.clientID, metaData, clientAuthentication, { algorithm: "oidc" } ).then( ( configuration ) => {
                resolve( configuration );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Loads the configured local users file and reconciles it into the directory. Every failure path leaves the
     * directory unusable and logs why, so local authentication refuses rather than admits — the same fail-soft
     * stance as {@link AuthManager#dropUnconfiguredOpenIDProviders}: a bad local-users file must not take down an
     * instance whose other auth method works, and must not let anyone in either.
     * <br/>
     * "Unusable" is not just a log line: {@link AuthManager#localDirectoryUsable} is the flag that actually makes
     * it so. `localUserDirectory.findByUsername` reads Redis directly, so without this flag a record reconciled
     * by an EARLIER successful boot would remain live — and would still authenticate — even on a boot where this
     * method logs that every local sign-in will be refused. The flag defaults to `false` and is set `true` only
     * at the very end of a successful reconcile that yielded at least one record; every failure path below
     * returns (or rejects) without ever setting it, so it stays `false`.
     * <br/>
     * A failed read deliberately does NOT reconcile, so a broken volume mount leaves the stored records untouched
     * instead of destroying them. They are inert while the load is failing — not because they are gone, but
     * because {@link AuthManager#localDirectoryUsable} stays `false` and #authenticateLocal/authorize() both
     * require it before ever consulting the directory.
     *
     * @method
     * @returns {Promise}
     */
    #loadLocalUserDirectory() {
        const usersPath = this.#authSettings.local?.usersPath;
        if ( !usersPath ) {
            this.#localDirectoryUsable = false;
            logger.log( "Local authentication is enabled but no 'auth.local.usersPath' is configured (see TI_WEB_AUTH_LOCAL_USERS_PATH) — every local sign-in will be refused.", logger.logSeverity.WARNING );
            return Promise.resolve();
        }

        let raw;
        try {
            raw = JSON.parse( fs.readFileSync( usersPath, "utf8" ) );
        } catch ( error ) {
            this.#localDirectoryUsable = false;
            logger.log( `Could not read the local users file '${ usersPath }' — every local sign-in will be refused. Previously stored records are left untouched.`, logger.logSeverity.WARNING, exceptions.raise( error ) );
            return Promise.resolve();
        }

        const parsed = localUserDirectory.parseRecords( raw );
        parsed.problems.forEach( ( problem ) => {
            logger.log( `Local users file '${ usersPath }': ${ problem }`, logger.logSeverity.WARNING );
        } );
        if ( parsed.records.length === 0 ) {
            logger.log( `The local users file '${ usersPath }' yielded no usable records — every local sign-in will be refused.`, logger.logSeverity.WARNING );
        }

        return localUserDirectory.reconcile( parsed.records ).then( ( result ) => {
            // Usable only when the reconcile actually produced at least one record — a file that parses cleanly
            // but yields zero valid records (logged above) must refuse just as completely as one that could not
            // be read at all.
            this.#localDirectoryUsable = parsed.records.length > 0;
            logger.log( `Local user directory reconciled: ${ result.added.length } added, ${ result.updated.length } updated, ${ result.removed.length } removed.`, logger.logSeverity.NOTICE );
        } ).catch( ( error ) => {
            this.#localDirectoryUsable = false;
            // Log only the error's message and code — never the raw error object or an exception wrapping it.
            // ioredis attaches `err.command = { name, args }` to reply errors and connection aborts, and
            // `tools.errorToJSON` (invoked when the logger's data argument is an Error, including one wrapped by
            // exceptions.raise) copies every own property, `command` included. For this call `args` is
            // `[ "JSON.SET", localUserDirectory.CACHE_KEY, "$", <the entire directory JSON> ]`, so passing the
            // raw error through here would print every local user's salt and scrypt hash at WARNING level on a
            // WRONGTYPE, OOM, ACL failure, or mid-command disconnect. Do not "simplify" this back to
            // `exceptions.raise( error )` or `error` directly.
            logger.log( "Could not reconcile the local user directory — every local sign-in will be refused.", logger.logSeverity.WARNING, { message: error?.message, code: error?.code } );
        } );
    }

    /**
     * Verifies a local sign-in against the user directory.
     * <br/>
     * An unknown username still performs a hash computation against a placeholder before failing, so a missing user
     * and a wrong password take comparable time. Without it the response time answers "does this username exist?",
     * which turns the login form into an enumeration oracle.
     * <br/>
     * Requires {@link AuthManager#localDirectoryUsable} in addition to {@link AuthManager#isAuthEnabled} before
     * ever calling `findByUsername` — that function reads Redis directly, so without this check a record
     * reconciled by an earlier successful boot would still authenticate on a boot whose own load just failed.
     * This check is a boot-time configuration gate, not a per-request secret, so it refuses immediately rather
     * than through the timing-decoy path below.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {Promise}
     */
    #authenticateLocal( username, password ) {
        if ( !this.isAuthEnabled( authMethodEnum.LOCAL ) || !this.#localDirectoryUsable ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
        }

        const refuse = () => Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );

        return localUserDirectory.findByUsername( username ).then( ( record ) => {
            if ( !record || record.disabled === true ) {
                // Burn comparable time before refusing, so timing does not reveal whether the username exists.
                return localUserDirectory.verifyPassword( password, AuthManager.#getTimingDecoyHash() ).then( () => refuse() );
            }
            return localUserDirectory.verifyPassword( password, record.passwordHash ).then( ( matches ) => {
                return matches ? Promise.resolve() : refuse();
            } );
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
     * @returns {Promise<User>}
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
                const username = userInfo.preferred_username ?? userInfo.email ?? userInfo.name ?? `sub:${ userInfo.sub }`;
                resolve( new User( { userID: `oauth2:${ userInfo.sub }`, username: username, email: userInfo.email, name: userInfo.name } ) );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

}

module.exports = AuthManager;
AuthManager.authMethod = authMethodEnum;