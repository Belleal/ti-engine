export = AuthManager;
import User = require("#user");
import type { SettingsAuth } from "#web-server";
export type TiAuthMethod = string;
/** @import { SettingsAuth } from "#web-server" */
/**
 * Enum for specifying the authentication method.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiAuthMethod
 */
declare const authMethodEnum: import("@ti-engine/core/definitions").TiEnumOf<{
    LOCAL: string[];
    OPENID_AZURE: string[];
    OPENID_GOOGLE: string[];
}>;
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
     * Whether an OpenID Connect sign-in carries an e-mail address the provider itself reports as unverified. Pure,
     * so the decision is testable without a provider.
     * <br/>
     * A consumer maps the authenticated identity to an application principal by e-mail — competence resolves it
     * against the employee directory — so an address the provider has not verified is an unauthenticated claim to be
     * someone, and a sign-in carrying one is refused.
     * <br/>
     * **Both sources are consulted**, because {@link AuthManager.resolveOpenIDIdentity} takes the e-mail from either
     * one: a tenant that emits `email` only in the ID token would otherwise hand that address to the application
     * while its `email_verified: false` sat in the half of the response nobody looked at.
     * <br/>
     * **An ABSENT claim is not a rejection.** Google emits `email_verified`, the Microsoft identity platform does not
     * emit it at all, so treating "absent" as "unverified" would refuse every Azure sign-in — the default method of
     * the published container image. Only an explicit `false` is a rejection. That leaves a residual assumption for a
     * provider that says nothing: bind it out with a tenant-pinned discovery URL (what `INSTALL.md` prescribes for
     * Azure), a domain-restricted provider, or by matching on the stable `sub` rather than the mutable e-mail.
     *
     * @method
     * @param {Object} userInfo The provider's `userinfo` response.
     * @param {Object} [claims] The validated ID token claims, when available.
     * @returns {boolean}
     * @public
     */
    static isEmailReportedUnverified(userInfo: Object, claims?: Object): boolean;
    /**
     * Decides which identity strings an OpenID Connect sign-in puts on the session, from the validated ID token
     * claims and the `userinfo` response together. Pure, so every provider's shape is testable without one.
     * <br/>
     * **Both sources are needed, and this is why.** The identity used to be built from the `userinfo` response
     * alone, with the ID token read only for the `sub` that fetch is verified against. That works for Google and
     * fails for the Microsoft identity platform, whose `userinfo` endpoint returns `sub`, `name`, `family_name`,
     * `given_name`, `picture` and — only when the optional claim is configured — an `email` taken from the
     * directory's `mail` attribute. It never returns `preferred_username`: on Entra that claim lives in the ID
     * token, and it holds the UPN, which is the address an operator actually knows, lists in `auth.admins`
     * (`TI_WEB_AUTH_ADMINS`), and puts in an employee record. So the one identifier the deployment is configured
     * around never reached the session, and an allowlisted administrator was refused by
     * {@link authorization.isAdminIdentity} with nothing on the session to match — reported by the consumer as a
     * missing application record, which named the wrong thing entirely. On a fresh deployment, where the admin
     * exception is the only way in at all, that is a lock-out.
     * <br/>
     * **Two precedence rules, and the claim rule is the stronger one.** Within a single claim, `userinfo` wins: it
     * is the fresher of the two (the ID token is a snapshot from authentication time), and `openid-client` has
     * already verified that both describe the same subject. The ID token is a fallback, not a lesser source — it is
     * signature-, issuer-, audience- and nonce-validated. But `username` chooses between two DIFFERENT claims, and
     * there `preferred_username` beats `upn` regardless of which response carried it: `preferred_username` is the
     * standard OIDC claim for a human-readable identifier and `upn` a Microsoft extension, while "fresher" earns
     * nothing between two stable identifiers that do not differ across the two responses.
     * <br/>
     * Note that neither ordering can rescue a deployment whose allowlist names the claim that lost — only one string
     * can be the `username`. What covers that is the allowlist matching `userID`, `username` **or** `email`, and a
     * consumer reporting all three when it refuses a sign-in.
     * <br/>
     * **The UPN is deliberately NOT accepted as an e-mail.** It is e-mail-shaped and usually routable, but it is a
     * sign-in name, not a mailbox, and `email` is what a consumer resolves its own directory by — quietly widening
     * that would change which application principal an identity maps to. It is offered as the `username` instead,
     * which the admin allowlist matches (user ID, username or e-mail) and which no directory lookup keys on.
     *
     * Both arguments are plain objects, so a swapped call would silently produce a wrong-but-plausible identity.
     * The order is therefore the same as {@link AuthManager.isEmailReportedUnverified}'s, and it is the precedence
     * order too: the winning source comes first.
     *
     * @method
     * @param {Object} [userInfo] The provider's `userinfo` response.
     * @param {Object} [claims] The validated ID token claims.
     * @returns {{userID: string, username: string, email: (string|undefined), name: (string|undefined), sources: Object}}
     *          `sources` names the claim and response each value came from (e.g. `claims.preferred_username`), so a
     *          deployment can report how its provider is understood without logging anybody's identifiers.
     * @public
     */
    static resolveOpenIDIdentity(userInfo?: Object, claims?: Object): {
        userID: string;
        username: string;
        email: (string | undefined);
        name: (string | undefined);
        sources: Object;
    };
}
declare namespace AuthManager {
    export { authMethodEnum as authMethod };
}
