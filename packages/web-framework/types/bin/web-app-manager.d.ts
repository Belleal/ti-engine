export = TiWebAppManager;
import type { TiSession } from "#definitions";
/**
 * Gates the login-page authentication markup to the effective enabled methods. The login fragment delimits blocks
 * with HTML-comment markers: `<!--ti-auth-method:METHOD-->…<!--/ti-auth-method-->` around each method's control
 * (the `local` credentials form and each OpenID provider button), `<!--ti-auth-divider-->…<!--/ti-auth-divider-->`
 * around the "or continue with" separator, `<!--ti-auth-social-->…<!--/ti-auth-social-->` around the SSO button
 * group, and `<!--ti-auth-none-->…<!--/ti-auth-none-->` around a "no method configured" fallback. It removes the
 * block for any method that is not enabled, drops the social group when no SSO provider is enabled, shows the
 * divider only when a local form AND at least one SSO provider are both present, and shows the fallback only when
 * nothing is enabled. Any remaining markers are stripped so clean HTML ships. Fragments without these markers
 * (every non-login fragment) are returned unchanged.
 *
 * @param {string} html
 * @param {string[]} [enabledMethods] The effective enabled authentication methods.
 * @returns {string}
 */
declare function applyAuthMethodVisibility(html: string, enabledMethods?: string[]): string;
/**
 * A generic web application manager that handles the rendering and behavior of web application views. It is designed to be extended by specific web application
 * managers for each web application you want to implement with the ti-engine web framework.
 * <br/>
 * NOTE: You should not instantiate this class directly. Instead, extend it and override the abstract methods as needed. Additionally, you should configure your
 * ti-engine web server 'TiWebApplicationConfig' settings by specifying the 'classPath' that corresponds to your web application manager. The path should be
 * relative to the intended process's working directory.
 *
 * @class TiWebAppManager
 * @abstract
 * @public
 */
declare class TiWebAppManager {
    #private;
    /**
     * @constructor
     * @param {string} identifier The identifier for this web application. Should be unique and recognizable.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(identifier: string);
    /**
     * Returns the identifier for this web application.
     *
     * @property
     * @returns {string}
     * @public
     */
    get webAppIdentifier(): string;
    /**
     * Adds a new HTML fragment to the web application.
     * <br/>
     * NOTE: This method should only be called during the initialization phase of your web application manager.
     *
     * @method
     * @param {string} identifier
     * @param {Object} fragment The fragment descriptor (`{ title, path, components }`). May also carry an optional
     * `roles` array (`Array<string|number>`): when present, the default {@link TiWebAppManager#verifyAccess} serves
     * the fragment only to sessions holding at least one of those roles; omit it (or leave empty) for a public screen.
     * @throws {TiException.E_GEN_UNALLOWED_OVERRIDE} If a fragment with the same identifier already exists.
     * @public
     */
    addFragment(identifier: string, fragment: Object): void;
    /**
     * Registers an editable configuration document with the framework config registry (JSON Schema + semantic
     * validators + default value + editor metadata). Call during initialization. See {@link ConfigRegistry#register}.
     *
     * @method
     * @param {string} configKey
     * @param {Object} definition
     * @returns {TiWebAppManager} this (chainable)
     * @public
     */
    registerConfigDocument(configKey: string, definition: Object): TiWebAppManager;
    /**
     * Registers a JSON Schema that is referenced (via `$ref`) by config-document schemas but is not itself a document.
     *
     * @method
     * @param {Object} schema
     * @returns {TiWebAppManager} this (chainable)
     * @public
     */
    registerConfigSchema(schema: Object): TiWebAppManager;
    /**
     * Registers a composite (entity) editor with the framework config service — a `compose(docs)`/`decompose(edited,docs)`
     * pair over one or more documents. Call during initialization. See {@link ConfigService#registerEditor}.
     *
     * @method
     * @param {string} editorKey
     * @param {Object} definition
     * @returns {TiWebAppManager} this (chainable)
     * @public
     */
    registerConfigEditor(editorKey: string, definition: Object): TiWebAppManager;
    /**
     * Used to clear the static file cache. This is useful for testing purposes to ensure that the web server is always serving fresh content.
     *
     * @method
     * @public
     */
    clearStaticFileCache(): void;
    /**
     * Sets the effective enabled authentication methods used to gate login-page provider buttons. The web server
     * calls this at startup, after the auth manager has dropped any enabled-but-unconfigured OpenID providers.
     *
     * @method
     * @param {string[]} methods
     * @public
     */
    setEnabledAuthMethods(methods: string[]): void;
    /**
     * Optional HTML transformation hook.
     * <br/>
     * NOTE: Override in subclasses to add nonces or other dynamic data to outgoing HTML.
     *
     * @method
     * @param {string} html
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @param {string} [options.title] Optional title to replace the placeholder in the HTML.
     * @returns {Promise<string>}
     * @virtual
     * @public
     */
    transformHtml(html: string, options?: {
        csrfToken?: string;
        isHome?: boolean;
        nonce?: string;
        title?: string;
    }): Promise<string>;
    /**
     * Used to assemble the complete HTML view for the requested route, including nested HTML fragments.
     *
     * @method
     * @param {TiSession} session
     * @param {string[]} staticContentPaths
     * @param {string} route
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isPartial] Optional flag to indicate whether the requested route is a partial load of a fragment.
     * @param {string} [options.view] Optional view name to load within this route.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @public
     */
    assembleHtmlView(session: TiSession, staticContentPaths: string[], route: string, options?: {
        csrfToken?: string;
        isPartial?: boolean;
        view?: string;
        nonce?: string;
    }): Promise<string>;
    /**
     * Used to process a request for a data resource.
     *
     * @method
     * @param {TiSession} session
     * @param {string} view
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @virtual
     * @public
     */
    processDataRequest(session: TiSession, view: string, options?: Object): Promise<Object>;
    /**
     * Used to process an application service request.
     *
     * @method
     * @param {TiSession} session
     * @param {string} service
     * @param {Object} params
     * @returns {Promise<Object>}
     * @virtual
     * @public
     */
    processServiceRequest(session: TiSession, service: string, params: Object): Promise<Object>;
    /**
     * Used to verify whether the current user has access to the requested resource. The default implementation gates
     * HTML fragments by their declared `roles`: a fragment registered via {@link TiWebAppManager#addFragment} with a
     * `roles` array is served only to sessions holding at least one of those roles (see {@link addFragment}); a
     * fragment with no `roles` is public to any authenticated user. This makes role-restricted screens unreachable by
     * direct URL, not merely hidden in the UI. Override in subclasses only to implement additional/alternative checks.
     *
     * @method
     * @virtual
     * @param {TiSession} session
     * @param {Object} resource The fragment descriptor; its optional `resource.roles` lists the roles permitted to load it.
     * @returns {Promise}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} (403) When the session holds none of the fragment's required roles.
     * @public
     */
    verifyAccess(session: TiSession, resource: Object): Promise<any>;
}
declare namespace TiWebAppManager {
    export { applyAuthMethodVisibility };
}
