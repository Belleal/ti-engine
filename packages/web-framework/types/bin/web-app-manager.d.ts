export = TiWebAppManager;
import type { TiApplicationInfo, TiInfoSection, TiProfileInfo, TiSession } from "#definitions";
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
     * Returns the configuration for the shared UI components the application shell renders — currently the sidebar
     * user flyout menu. Shipped as part of the `config` data payload and merged into the `tiComponentsConfig`
     * Alpine store on the client.
     * <br/>
     * The default menu links the two screens the framework itself provides (Profile and About) plus sign-out, so a
     * consuming application gets a working user menu without configuring one. Override to replace it; a subclass
     * that supplies its own `componentsConfig` naturally supersedes this.
     *
     * @method
     * @param {TiSession} session
     * @returns {Object}
     * @virtual
     * @public
     */
    buildComponentsConfig(session: TiSession): Object;
    /**
     * Returns the descriptor rendered by the "Profile" screen — the identity header plus an ordered list of titled
     * label/value sections. Every string in it is display-ready: the server resolves labels and formats values,
     * because this is where the session language and the label catalogue are (see {@link resolveLabel}).
     * <br/>
     * The default implementation reports what the framework itself knows about the session user — name, username,
     * e-mail, language and roles. Override in subclasses to show application-owned data instead; the screen, its
     * Alpine component and its styling are inherited unchanged, so an override only decides the content.
     * <br/>
     * NOTE: The descriptor is always about the SESSION user. There is deliberately no "whose profile" parameter —
     * viewing another person's record belongs to an application screen that carries its own scoping rules.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<TiProfileInfo>}
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} (401) When the session carries no user.
     * @virtual
     * @public
     */
    getProfileInfo(session: TiSession): Promise<TiProfileInfo>;
    /**
     * Returns the descriptor rendered by the "About" screen — the application's own identity (name, version,
     * release date, description, license, homepage) plus the ti-engine component versions it runs on, and any
     * extra sections the application contributes.
     * <br/>
     * The baseline is resolved once from the consuming application's `package.json`, overridable through
     * `TI_WEB_APP_NAME` / `TI_WEB_APP_VERSION` / `TI_WEB_APP_RELEASE_DATE` (see `#application-info`), and cached —
     * the manifest cannot change while the process runs.
     * <br/>
     * NOTE: Runtime facts (node version, platform, instance identity) are attached only for an `admin` session.
     * They are operational detail that helps support and means nothing to an ordinary user, so they are not handed
     * to every signed-in visitor. Override in subclasses to append application-specific sections; call `super` and
     * extend the result rather than rebuilding it.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<TiApplicationInfo>}
     * @virtual
     * @public
     */
    getApplicationInfo(session: TiSession): Promise<TiApplicationInfo>;
    /**
     * Builds the identity header of the Profile screen from the session user. Kept separate from
     * {@link TiWebAppManager#getProfileInfo} so a subclass that replaces the sections can still reuse — or fall
     * back to — the framework's identity block when the application has no richer identity to show.
     *
     * @method
     * @param {TiSession} session
     * @returns {Object}
     * @public
     */
    buildSessionIdentity(session: TiSession): Object;
    /**
     * Builds the framework's account-level Profile sections from the session user. A subclass showing richer
     * application data can append these so the account facts remain visible alongside it.
     *
     * @method
     * @param {TiSession} session
     * @returns {TiInfoSection[]}
     * @public
     */
    buildAccountSections(session: TiSession): TiInfoSection[];
    /**
     * Resolves the versions of the ti-engine packages the running application is built on, for the About screen.
     * <br/>
     * NOTE: `@ti-engine/core` does not expose `./package.json` through its exports map, so its manifest is located
     * by walking up from a module it *does* export. A package that cannot be resolved is simply omitted — an
     * informational screen must never be the reason a request fails.
     *
     * @method
     * @static
     * @returns {Array<{name: string, version: string}>}
     * @public
     */
    static resolveFrameworkComponents(): Array<{
        name: string;
        version: string;
    }>;
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
