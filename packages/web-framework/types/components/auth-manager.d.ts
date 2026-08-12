export = AuthManager;
export { authMethodEnum as authMethod };
import User = require("#user");
export type TiAuthMethod = string;
/**
 * Enum for specifying the authentication method.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiAuthMethod
 */
declare const authMethodEnum: Object;
export type TiTokenEndpointAuthMethod = string;
/**
 * The AuthManager class is used to manage authentication and authorization.
 *
 * @class AuthManager
 * @public
 */
declare class AuthManager {
    #private;
    /**
     * @constructor
     * @param {SettingsAuth} settings
     */
    constructor(settings: SettingsAuth);
    /**
     * Used to initialize the authentication manager.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize(): Promise<any>;
    /**
     * Used to check whether the specified authentication method is enabled.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {boolean}
     * @public
     */
    isAuthEnabled(authMethod: TiAuthMethod): boolean;
    /**
     * Returns the list of currently enabled authentication methods, reflecting any OpenID providers dropped by
     * {@link AuthManager#initialize} for being enabled but unconfigured. Callers (e.g. the login-page renderer)
     * use this to present only the methods a user can actually complete.
     *
     * @method
     * @returns {TiAuthMethod[]}
     * @public
     */
    getEnabledMethods(): TiAuthMethod[];
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
    authenticate(authMethod: TiAuthMethod, authDetails: Object): Promise<Object>;
    /**
     * Used to set up user authorization according to the specified authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @returns {Promise<User>}
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the authentication method is not recognized.
     * @public
     */
    authorize(authMethod: TiAuthMethod, currentUrl: URL, oidc: Object): Promise<User>;
    /**
     * Used to get the callback URL for the specified OAuth2 authentication method.
     *
     * @method
     * @param {TiAuthMethod} authMethod
     * @returns {string}
     * @throws {TiException.E_SEC_UNRECOGNIZED_AUTH_METHOD} If the requested OAuth2 method is not recognized or enabled.
     * @public
     */
    getOAuth2CallbackUrl(authMethod: TiAuthMethod): string;
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
    getOAuth2CallbackPath(authMethod: TiAuthMethod): string | null;
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
    static toCallbackPath(callbackUrl: string): string | null;
    /**
     * Removes any OpenID Connect provider that is enabled but not configured (missing a client ID) from the set
     * of enabled authentication methods, logging a warning for each. This prevents a startup crash during OpenID
     * discovery when an enabled provider has no credentials (e.g. a container started without OAuth env vars): the
     * instance boots on its remaining methods, and `isAuthEnabled` then correctly reports the dropped provider as
     * unavailable so a sign-in attempt against it is rejected per-request instead of taking down startup.
     *
     * @method
     * @private
     */
    private #dropUnconfiguredOpenIDProviders;
    /**
     * Checks whether an OpenID Connect provider has the minimum configuration required to initialize (a non-empty client ID).
     *
     * @method
     * @param {SettingsOAuth2Client} [oauth2] The provider's OAuth2 settings.
     * @returns {boolean}
     * @private
     */
    private #isOpenIDConfigured;
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
     * @private
     */
    private #initializeOpenIDClient;
    /**
     * Used to verify the local authentication of a request.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {Promise}
     * @private
     */
    private #authenticateLocal;
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
    private #authenticateOpenID;
    /**
     * Used to perform the actual OpenID Connect authorization.
     *
     * @method
     * @param {URL} currentUrl
     * @param {Object} oidc
     * @param {openidClient.Configuration} clientConfig
     * @returns {Promise<User>}
     * @private
     */
    private #authorizeOpenID;
}
