/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
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

const exceptions = require( "@ti-engine/core/exceptions" );
const tools = require( "@ti-engine/core/tools" );
const localization = require( "@ti-engine/core/localization" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const configRegistry = require( "#config-registry" );
const configService = require( "#config-service" );
const authorization = require( "#authorization" );
const applicationInfo = require( "#application-info" );

/** @import { TiApplicationInfo, TiInfoSection, TiProfileInfo, TiSession } from "#definitions" */

const RE_NONCE_ATTR = /\{ti-nonce-placeholder}/g;
const RE_CSRF_ATTR = /\{ti-csrf-placeholder}/g;
const RE_HTMX_CONFIG = /\{ti-htmx-config-placeholder}/g;
const RE_CSP_NONCE = /^[A-Za-z0-9+/=_-]{16,}$/;
const TI_NESTED_FRAME_PLACEHOLDER = "ti-nested-frame-placeholder";
const OAUTH_METHODS = [ "openid-google", "openid-azure" ];
const ALL_METHODS = [ "local", "openid-google", "openid-azure" ];
const RE_AUTH_MARKERS = /<!--\/?ti-auth-(?:divider|social|none|method(?::[a-z-]+)?)-->/g;

/**
 * Removes every `<openMarker>…<closeMarker>` span (inclusive) from `html` in a single linear pass. The markers are
 * matched as fixed strings via `indexOf`, so — unlike an `openMarker[\s\S]*?closeMarker` regular expression under a
 * global replace — this cannot exhibit super-linear backtracking on hostile input containing many opening markers
 * (CodeQL js/polynomial-redos). Matches the lazy-regex semantics: each opening marker pairs with the *next* closing
 * marker after it. An opening marker with no matching closing marker is left untouched (the caller strips any stray
 * markers afterwards with {@link RE_AUTH_MARKERS}).
 *
 * @param {string} html
 * @param {string} openMarker
 * @param {string} closeMarker
 * @returns {string}
 */
function stripMarkerSpans( html, openMarker, closeMarker ) {
    let result = "";
    let cursor = 0;
    for ( ; ; ) {
        const open = html.indexOf( openMarker, cursor );
        if ( open === -1 ) {
            result += html.slice( cursor );
            break;
        }
        const close = html.indexOf( closeMarker, open + openMarker.length );
        if ( close === -1 ) {
            result += html.slice( cursor );
            break;
        }
        result += html.slice( cursor, open );
        cursor = close + closeMarker.length;
    }
    return result;
}

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
function applyAuthMethodVisibility( html, enabledMethods ) {
    let result = String( html );
    const enabled = Array.isArray( enabledMethods ) ? enabledMethods : [];
    const localEnabled = enabled.includes( "local" );
    const anyOAuth = OAUTH_METHODS.some( ( method ) => enabled.includes( method ) );

    // Drop the block for each authentication method that is not enabled.
    ALL_METHODS.forEach( ( method ) => {
        if ( !enabled.includes( method ) ) {
            result = stripMarkerSpans( result, "<!--ti-auth-method:" + method + "-->", "<!--/ti-auth-method-->" );
        }
    } );

    // Drop the SSO button group when no OpenID provider is enabled.
    if ( !anyOAuth ) {
        result = stripMarkerSpans( result, "<!--ti-auth-social-->", "<!--/ti-auth-social-->" );
    }

    // Show the "or continue with" divider only when BOTH a local form and at least one SSO provider are present.
    if ( !( localEnabled && anyOAuth ) ) {
        result = stripMarkerSpans( result, "<!--ti-auth-divider-->", "<!--/ti-auth-divider-->" );
    }

    // Show the "no method configured" fallback only when nothing is enabled.
    if ( localEnabled || anyOAuth ) {
        result = stripMarkerSpans( result, "<!--ti-auth-none-->", "<!--/ti-auth-none-->" );
    }

    return result.replace( RE_AUTH_MARKERS, "" );
}

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
class TiWebAppManager {

    #webAppIdentifier;
    #fragments = {};
    #staticFileCache = {};
    #staticFileCacheEnabled;
    #enabledAuthMethods = [];
    #baseApplicationInfo = null;

    /**
     * @constructor
     * @param {string} identifier The identifier for this web application. Should be unique and recognizable.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor( identifier ) {
        // Make sure this abstract class cannot be instantiated:
        if ( new.target === TiWebAppManager ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#webAppIdentifier = identifier;
        this.#staticFileCacheEnabled = ( process.env.TI_WEB_APP_STATIC_CACHE_DISABLED !== "true" );

        // Define the default HTML fragments for the application:
        this.#fragments[ 'home' ] = {
            path: "index.html",
            components: [ "component-notification-bar" ]
        };
        this.#fragments[ 'application-main' ] = {
            title: "Application",
            path: "fragments/frame-application.html",
            components: [ "component-topbar", "component-sidebar", "component-notification-bar", "component-sidebar-flyout" ]
        };
        this.#fragments[ 'login' ] = {
            title: "Login",
            path: "fragments/frame-login.html"
        };
        this.#fragments[ 'dashboard' ] = {
            title: "Dashboard",
            path: "fragments/frame-dashboard.html"
        };
        this.#fragments[ 'administration' ] = {
            title: "Administration",
            path: "fragments/frame-administration.html"
        };
        this.#fragments[ 'profile' ] = {
            title: "Profile",
            path: "fragments/frame-profile.html"
        };
        this.#fragments[ 'about' ] = {
            title: "About",
            path: "fragments/frame-about.html"
        };
        this.#fragments[ 'not-found' ] = {
            title: "Not Found",
            path: "fragments/frame-not-found.html"
        };
    }

    /* Public interface */

    /**
     * Returns the identifier for this web application.
     *
     * @property
     * @returns {string}
     * @public
     */
    get webAppIdentifier() {
        return this.#webAppIdentifier;
    }

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
    addFragment( identifier, fragment ) {
        if ( this.#fragments[ identifier ] === undefined ) {
            this.#fragments[ identifier ] = fragment;
        } else {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_UNALLOWED_OVERRIDE, { identifier: identifier } );
        }
    }

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
    registerConfigDocument( configKey, definition ) {
        configRegistry.instance.register( configKey, definition );
        return this;
    }

    /**
     * Registers a JSON Schema that is referenced (via `$ref`) by config-document schemas but is not itself a document.
     *
     * @method
     * @param {Object} schema
     * @returns {TiWebAppManager} this (chainable)
     * @public
     */
    registerConfigSchema( schema ) {
        configRegistry.instance.addSchema( schema );
        return this;
    }

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
    registerConfigEditor( editorKey, definition ) {
        configService.instance.registerEditor( editorKey, definition );
        return this;
    }

    /**
     * Used to clear the static file cache. This is useful for testing purposes to ensure that the web server is always serving fresh content.
     *
     * @method
     * @public
     */
    clearStaticFileCache() {
        this.#staticFileCache = {};
    }

    /**
     * Sets the effective enabled authentication methods used to gate login-page provider buttons. The web server
     * calls this at startup, after the auth manager has dropped any enabled-but-unconfigured OpenID providers.
     *
     * @method
     * @param {string[]} methods
     * @public
     */
    setEnabledAuthMethods( methods ) {
        this.#enabledAuthMethods = Array.isArray( methods ) ? [ ...methods ] : [];
    }

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
    transformHtml( html, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            let transformedHtml = String( html );

            // Insert nonce in all placeholder locations. If nonce is not provided or is invalid, this will use an empty string instead to remove the placeholder:
            const nonce = ( typeof options?.nonce === "string" && RE_CSP_NONCE.test( options?.nonce ) ) ? options?.nonce : "";
            transformedHtml = transformedHtml.replaceAll( RE_NONCE_ATTR, nonce );
            if ( options.isHome ) {
                let htmxConfig = {
                    inlineScriptNonce: nonce,
                    inlineStyleNonce: nonce,
                    allowEval: false,
                    refreshOnHistoryMiss: true,
                    historyCacheSize: 0
                };
                transformedHtml = transformedHtml.replace( RE_HTMX_CONFIG, JSON.stringify( htmxConfig ) );
            }

            const csrfToken = ( typeof options?.csrfToken === "string" ) ? options?.csrfToken : "";
            transformedHtml = transformedHtml.replaceAll( RE_CSRF_ATTR, csrfToken );

            transformedHtml = transformedHtml.replace( "{ti-title-placeholder}", options.title || "" );

            // Gate login-page OpenID provider buttons to the effective enabled auth methods (no-op on other fragments).
            transformedHtml = applyAuthMethodVisibility( transformedHtml, this.#enabledAuthMethods );

            resolve( transformedHtml );
        } );
    }

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
    assembleHtmlView( session, staticContentPaths, route, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            let fragment;
            let getHtmlPromises = [];
            let localOptions = ( options && typeof options === "object" ) ? { ...options } : {};

            if ( route === "/" ) {
                fragment = this.#fragments[ 'home' ];
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, fragment, { ...localOptions, isHome: true } ) );
            } else if ( route === "/app/error" ) {
                // TODO: This endpoint is for testing purposes only. Remove later.
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_METHOD ) );
            } else if ( route === "/app" || route === "/app/enter" ) {
                fragment = ( session && session.user ) ? this.#fragments[ 'application-main' ] : this.#fragments[ 'login' ];
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, fragment, localOptions ) );
            } else if ( route === "/not-found" ) {
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, this.#fragments[ 'home' ], { ...localOptions, isHome: true, title: this.#fragments[ 'not-found' ].title } ) );
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, this.#fragments[ 'not-found' ], localOptions ) );
            } else {
                fragment = this.#fragments[ options.view ];
                if ( !fragment ) {
                    // Abort execution if the requested view is not found:
                    return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI ) );
                } else {
                    // This handles application refreshes from nested frames:
                    if ( options.isPartial !== true ) {
                        getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, this.#fragments[ 'home' ], {
                            ...localOptions,
                            isHome: true,
                            title: fragment.title
                        } ) );
                        getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, this.#fragments[ 'application-main' ], localOptions ) );
                    }
                    getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, fragment, localOptions ) );
                }
            }

            Promise.all( getHtmlPromises ).then( ( filesData ) => {
                let assembledHtml = undefined;
                filesData.forEach( ( fileData ) => {
                    // There should always be at most one ti-nested-frame-placeholder element in each HTML fragment:
                    assembledHtml = ( assembledHtml ) ? this.#replacePlaceholderElement( assembledHtml, TI_NESTED_FRAME_PLACEHOLDER, fileData ) : fileData;
                } );
                resolve( assembledHtml );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

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
    processDataRequest( session, view, options = {} ) {
        if ( view === "profile" ) {
            return this.getProfileInfo( session );
        }
        if ( view === "about" ) {
            return this.getApplicationInfo( session );
        }
        return new Promise( ( resolve, reject ) => {
            if ( view === "config" ) {
                resolve( {
                    labels: localization.getAllLabels( session?.language ),
                    auth: {
                        isAuthenticated: Boolean( session && session.user )
                    },
                    componentsConfig: this.buildComponentsConfig( session )
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI, { view: view } ) );
            }
        } );
    }

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
    buildComponentsConfig( session ) {
        const language = session && session.language;
        return {
            userProfileMenu: {
                menuTitle: localization.getLabel( "interface.topbar.user-profile", language, "Your profile" ),
                placement: "right-end",
                offset: 0,
                buttonConfigs: [ {
                    title: localization.getLabel( "interface.user-menu.profile", language, "Your profile" ),
                    icon: "user-profile",
                    action: { href: "/app/profile", target: "#ti-content", swap: "innerHTML" }
                }, {
                    title: localization.getLabel( "interface.user-menu.about", language, "About" ),
                    icon: "info-circle",
                    action: { href: "/app/about", target: "#ti-content", swap: "innerHTML" }
                }, {
                    title: localization.getLabel( "interface.user-menu.logout", language, "Logout" ),
                    icon: "logout",
                    action: { href: "/logout", method: "post", target: "body", swap: "outerHTML" }
                } ]
            }
        };
    }

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
    getProfileInfo( session ) {
        return new Promise( ( resolve, reject ) => {
            const user = session && session.user;
            if ( !user ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
            }
            resolve( {
                identity: this.buildSessionIdentity( session ),
                sections: this.buildAccountSections( session )
            } );
        } );
    }

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
    getApplicationInfo( session ) {
        return new Promise( ( resolve ) => {
            if ( !this.#baseApplicationInfo ) {
                this.#baseApplicationInfo = applicationInfo.buildApplicationInfo( {
                    manifest: applicationInfo.readApplicationManifest(),
                    env: process.env,
                    components: TiWebAppManager.resolveFrameworkComponents()
                } );
            }

            const info = structuredClone( this.#baseApplicationInfo );
            if ( authorization.hasAnyRole( session, [ authorization.ADMIN_ROLE ] ) ) {
                info.runtime = {
                    node: process.version,
                    platform: `${ process.platform } · ${ process.arch }`,
                    application: this.#webAppIdentifier
                };
            }
            resolve( info );
        } );
    }

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
    buildSessionIdentity( session ) {
        const user = ( session && session.user ) || {};
        return {
            name: String( user.name || user.username || user.userID || "" ),
            subtitle: "",
            caption: String( user.email || "" ),
            avatarSeed: String( user.userID || user.username || "" ),
            // No pills by default: the framework knows roles only as opaque codes, and a stack of pills reading
            // "1" / "2" beside the name is noise. The Access section lists them, and an application that has
            // meaningful status to show (employment state, an ID, a badge) supplies its own.
            tags: []
        };
    }

    /**
     * Builds the framework's account-level Profile sections from the session user. A subclass showing richer
     * application data can append these so the account facts remain visible alongside it.
     *
     * @method
     * @param {TiSession} session
     * @returns {TiInfoSection[]}
     * @public
     */
    buildAccountSections( session ) {
        const user = ( session && session.user ) || {};
        const language = session && session.language;
        const roles = Array.isArray( user.roles ) ? user.roles : [];

        return [ {
            title: localization.getLabel( "interface.profile.section-account", language, "Account" ),
            icon: "user",
            items: [
                { label: localization.getLabel( "interface.profile.field-name", language, "Full name" ), value: String( user.name || "" ) },
                { label: localization.getLabel( "interface.profile.field-username", language, "Username" ), value: String( user.username || "" ) },
                { label: localization.getLabel( "interface.profile.field-email", language, "E-mail" ), value: String( user.email || "" ), wide: true },
                { label: localization.getLabel( "interface.profile.field-user-id", language, "User ID" ), value: String( user.userID || "" ), mono: true },
                { label: localization.getLabel( "interface.profile.field-language", language, "Language" ), value: String( user.language || language || "" ) }
            ]
        }, {
            title: localization.getLabel( "interface.profile.section-access", language, "Access" ),
            icon: "check-circle",
            items: [
                { label: localization.getLabel( "interface.profile.field-roles", language, "Roles" ), value: roles.join( " · " ), wide: true }
            ]
        } ];
    }

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
    static resolveFrameworkComponents() {
        const manifests = [
            applicationInfo.readApplicationManifest( path.join( __dirname, ".." ) ),
            TiWebAppManager.#readManifestForModule( "@ti-engine/core/tools" )
        ];
        return manifests
            .filter( ( manifest ) => manifest && manifest.name && manifest.version )
            .map( ( manifest ) => ( { name: manifest.name, version: manifest.version } ) );
    }

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
    processServiceRequest( session, service, params ) {
        return new Promise( ( resolve, reject ) => {
            reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI, { service: service } ) );
        } );
    }

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
    verifyAccess( session, resource ) {
        return new Promise( ( resolve, reject ) => {
            const requiredRoles = ( resource && resource.roles ) ? resource.roles : null;
            const userRoles = ( session && session.user && session.user.roles ) || [];
            if ( authorization.isAccessAllowed( requiredRoles, userRoles ) ) {
                return resolve();
            }
            reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 ) );
        } );
    }

    /* Private interface */

    /**
     * Locates the `package.json` owning a resolvable module specifier by walking up from the resolved file.
     *
     * @method
     * @static
     * @param {string} moduleSpecifier
     * @returns {Object} The manifest, or an empty object when it cannot be located.
     */
    static #readManifestForModule( moduleSpecifier ) {
        try {
            let directory = path.dirname( require.resolve( moduleSpecifier ) );
            for ( let depth = 0; depth < 8; depth++ ) {
                const manifest = applicationInfo.readApplicationManifest( directory );
                if ( manifest && manifest.name ) {
                    return manifest;
                }
                const parent = path.dirname( directory );
                if ( parent === directory ) {
                    break;
                }
                directory = parent;
            }
        } catch {
            // An unresolvable package simply does not appear in the component list.
        }
        return {};
    }

    /**
     * Returns the HTML fragment for the requested route.
     *
     * @method
     * @param {TiSession} session
     * @param {string[]} staticContentPaths
     * @param {Object} fragment
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     */
    #getHtmlFragment( session, staticContentPaths, fragment, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            this.verifyAccess( session, fragment ).then( () => {
                return this.#locateStaticFile( staticContentPaths, fragment.path );
            } ).then( ( fileData ) => {
                return this.#replaceComponentPlaceholders( fileData, staticContentPaths, fragment.components );
            } ).then( ( fileData ) => {
                return this.transformHtml( fileData, { ...options, title: fragment.title || options.title } );
            } ).then( ( fileData ) => {
                resolve( fileData );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Attempts to locate the requested static file in the provided static content paths.
     *
     * @method
     * @param {string[]} staticContentPaths A list of directories to search for static content. If sent as expected by the web server, the first item in the array should be the system default path.
     * @param {string} filePath Relative path to the static file to locate.
     * @returns {Promise<string>}
     */
    #locateStaticFile( staticContentPaths, filePath ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#staticFileCacheEnabled === true && this.#staticFileCache[ filePath ] !== undefined ) {
                resolve( this.#staticFileCache[ filePath ] );
            } else {
                let fullFilePath;
                // Search for the file in the static content paths in reverse order so that the default system path is checked last. This will ensure that
                // any fragment overrides are loaded first (i.e., fragments with the same relative path):
                for ( let idx = staticContentPaths.length - 1; idx >= 0; idx-- ) {
                    const staticContentPath = staticContentPaths[ idx ];
                    let potentialFilePath = path.join( staticContentPath, filePath );
                    if ( fs.existsSync( potentialFilePath ) ) {
                        fullFilePath = potentialFilePath;
                        break;
                    }
                }

                if ( fullFilePath !== undefined ) {
                    fs.promises.readFile( fullFilePath, "utf8" ).then( ( fileData ) => {
                        if ( this.#staticFileCacheEnabled === true ) {
                            this.#staticFileCache[ filePath ] = fileData;
                        }
                        resolve( fileData );
                    } ).catch( ( error ) => {
                        reject( exceptions.raise( error ) );
                    } );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI ) );
                }
            }
        } );
    }

    /**
     * Used to replace the component placeholders in the HTML with the actual component HTML.
     *
     * @method
     * @param {string} html
     * @param {string[]} staticContentPaths
     * @param {Array<string>} components
     * @returns {Promise<string>}
     */
    #replaceComponentPlaceholders( html, staticContentPaths, components ) {
        return new Promise( ( resolve, reject ) => {
            if ( components === undefined || components.length === 0 ) {
                resolve( html );
            } else {
                let transformedHtml = String( html );
                let promises = [];
                const componentData = {};
                tools.arrayUniques( components ).forEach( ( component ) => {
                    promises.push( this.#locateStaticFile( staticContentPaths, `fragments/components/${ component }.html` ).then( ( fileData ) => {
                        componentData[ component ] = fileData;
                    } ) );
                } );

                Promise.all( promises ).then( () => {
                    components.forEach( ( component ) => {
                        transformedHtml = this.#replacePlaceholderElement( transformedHtml, `ti-${ component }-placeholder`, componentData[ component ] );
                    } );
                    resolve( transformedHtml );
                } ).catch( ( error ) => {
                    reject( exceptions.raise( error ) );
                } );
            }
        } );
    }

    /**
     * Used to replace a placeholder element in the HTML with the provided replacement.
     * <br/>
     * The placeholder's attributes are exposed to the replacement HTML as `{ti-<attr-name>}` tokens, allowing the
     * component template to consume initial data without changing its `x-data` factory.
     * <br/>
     * If the replacement HTML contains a `<ti-slot></ti-slot>` (or self-closing `<ti-slot/>`) marker, the placeholder's
     * inner content replaces it precisely; otherwise, inner content is appended before the replacement's last closing
     * tag (legacy behaviour) so existing components keep working.
     *
     * @method
     * @param {string} html
     * @param {string} tagName
     * @param {string} replacement
     * @returns {string}
     */
    #replacePlaceholderElement( html, tagName, replacement ) {
        const start = html.indexOf( `<${ tagName }` );
        if ( start === -1 ) {
            return html;
        }
        const gt = html.indexOf( ">", start );
        if ( gt === -1 ) {
            return html;
        }
        // Tolerate whitespace(s) before '/>' and attributes on the tag:
        let p = gt - 1;
        while ( p > start && /\s/.test( html[ p ] ) ) p--;
        const isSelfClosing = html[ p ] === "/";
        let end;
        let inner = "";
        if ( isSelfClosing ) {
            end = gt + 1;
        } else {
            const close = `</${ tagName }>`;
            end = html.indexOf( close, gt + 1 );
            if ( end === -1 ) {
                return html;
            }
            inner = html.slice( gt + 1, end );
            end += close.length;
        }

        // Substitute the placeholder's attributes as `{ti-<name>}` tokens inside the replacement HTML:
        const placeholderAttributes = this.#parsePlaceholderAttributes( html.slice( start, gt + 1 ) );
        let processedReplacement = replacement;
        Object.keys( placeholderAttributes ).forEach( ( name ) => {
            const value = placeholderAttributes[ name ];
            const token = `{ti-${ name }}`;
            // Use split/join for a literal replaceAll without regex escaping concerns:
            processedReplacement = processedReplacement.split( token ).join( value );
        } );

        let replacementWithInner = processedReplacement;
        const slotMatch = processedReplacement.match( /<ti-slot\b[^>]*>[\s\S]*?<\/ti-slot>|<ti-slot\b[^>]*\/>/ );
        if ( slotMatch ) {
            // If a slot marker exists, the placeholder's inner content (when present) replaces it. When inner is
            // empty, the slot's own default content (between <ti-slot> and </ti-slot>) is kept by unwrapping it:
            if ( inner ) {
                replacementWithInner = processedReplacement.replace( slotMatch[ 0 ], inner );
            } else {
                replacementWithInner = processedReplacement.replace( slotMatch[ 0 ], ( match ) => {
                    const defaultMatch = match.match( /<ti-slot\b[^>]*>([\s\S]*?)<\/ti-slot>/ );
                    return defaultMatch ? defaultMatch[ 1 ] : "";
                } );
            }
        } else if ( inner ) {
            const insertAt = processedReplacement.lastIndexOf( "</" );
            if ( insertAt !== -1 ) {
                replacementWithInner = processedReplacement.slice( 0, insertAt ) + inner + processedReplacement.slice( insertAt );
            } else {
                replacementWithInner = processedReplacement + inner;
            }
        }

        return html.slice( 0, start ) + replacementWithInner + html.slice( end );
    }

    /**
     * Parses the attribute name/value pairs declared on a placeholder element's opening tag.
     *
     * @method
     * @param {string} openingTag The full opening tag text, e.g. `<ti-foo-placeholder bar="baz">`.
     * @returns {Object<string, string>}
     */
    #parsePlaceholderAttributes( openingTag ) {
        const attributes = {};
        // Strip the element name and the surrounding angle brackets so only the attribute string remains:
        const trimmed = openingTag.replace( /^<[^\s>/]+/, "" ).replace( /\/?>\s*$/, "" );
        const regex = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
        let match;
        while ( ( match = regex.exec( trimmed ) ) !== null ) {
            attributes[ match[ 1 ] ] = match[ 2 ] ?? match[ 3 ] ?? match[ 4 ] ?? "";
        }
        return attributes;
    }

}

module.exports = TiWebAppManager;
TiWebAppManager.applyAuthMethodVisibility = applyAuthMethodVisibility;
