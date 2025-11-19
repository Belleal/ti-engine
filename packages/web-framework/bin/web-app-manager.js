/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );
const tools = require( "@ti-engine/core/tools" );
const localization = require( "@ti-engine/core/localization" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const _ = require( "lodash" );

const RE_NONCE_ATTR = /\{ti-nonce-placeholder}/g;
const RE_CSRF_ATTR = /\{ti-csrf-placeholder}/g;
const RE_HTMX_CONFIG = /\{ti-htmx-config-placeholder}/g;
const RE_CSP_NONCE = /^[A-Za-z0-9+\/=_-]{16,}$/;
const TI_NESTED_FRAME_PLACEHOLDER = "ti-nested-frame-placeholder";

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

    /**
     * @constructor
     * @param {string} identifier The identifier for this web application. Should be unique and recognizable.
     * @throws {Exception.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor( identifier ) {
        // Make sure this abstract class cannot be instantiated:
        if ( new.target === TiWebAppManager ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#webAppIdentifier = identifier;

        // Define the default HTML fragments for the application:
        this.#fragments[ 'home' ] = {
            path: "index.html",
            components: [ "component-notification-bar" ]
        };
        this.#fragments[ 'application-main' ] = {
            title: "Application",
            path: "fragments/frame-application.html",
            components: [ "component-sidebar-flyout", "component-sidebar-flyout" ]
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
     * @param {Object} fragment
     * @throws {Exception.E_GEN_UNALLOWED_OVERRIDE} If a fragment with the same identifier already exists.
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

            if ( options.title ) {
                transformedHtml = transformedHtml.replace( "{ti-title-placeholder}", options.title );
            }

            resolve( transformedHtml );
        } );
    }

    /**
     * Used to assemble the complete HTML view for the requested route, including nested HTML fragments.
     *
     * @method
     * @param {Object} session
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
                // TODO: This is for testing purposes only. Remove later.
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_METHOD ) );
            } else if ( route === "/app" || route === "/app/enter" ) {
                fragment = ( session && session.user ) ? this.#fragments[ 'application-main' ] : this.#fragments[ 'login' ];
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, fragment, localOptions ) );
            } else if ( route === "/not-found" ) {
                getHtmlPromises.push( this.#getHtmlFragment( session, staticContentPaths, this.#fragments[ 'home' ], { ...localOptions, isHome: true } ) );
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
                            isHome: true
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
     * @param {Object} session
     * @param {string} view
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @public
     */
    processDataRequest( session, view, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            if ( view === "config" ) {
                resolve( {
                    labels: localization.getAllLabels( session?.language )
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI ) );
            }
        } );
    }

    /* Private interface */

    /**
     * Returns the HTML fragment for the requested route.
     *
     * @method
     * @param {Object} session
     * @param {string[]} staticContentPaths
     * @param {Object} fragment
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @public
     */
    #getHtmlFragment( session, staticContentPaths, fragment, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            this.#verifyAccess( session, fragment ).then( () => {
                return this.#locateStaticFile( staticContentPaths, fragment.path );
            } ).then( ( fileData ) => {
                return this.#replaceComponentPlaceholders( fileData, staticContentPaths, fragment.components );
            } ).then( ( fileData ) => {
                return this.transformHtml( fileData, { ...options, title: fragment.title } );
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
     * @private
     */
    #locateStaticFile( staticContentPaths, filePath ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#staticFileCache[ filePath ] !== undefined ) {
                resolve( this.#staticFileCache[ filePath ] );
            } else {
                let fullFilePath;
                // Search for the file in the static content paths in reverse order so that the default system path is checked last. This will ensure that
                // any fragment overrides are loaded first (i.e., fragments with the same relative path):
                _.forEachRight( staticContentPaths, ( staticContentPath ) => {
                    let potentialFilePath = path.join( staticContentPath, filePath );
                    if ( fs.existsSync( potentialFilePath ) ) {
                        fullFilePath = potentialFilePath;
                        return false;
                    }
                } );

                if ( fullFilePath !== undefined ) {
                    fs.promises.readFile( fullFilePath, "utf8" ).then( ( fileData ) => {
                        this.#staticFileCache[ filePath ] = fileData;
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
     * @private
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
     *
     * @method
     * @param {string} html
     * @param {string} tagName
     * @param {string} replacement
     * @returns {string}
     * @private
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
        if ( isSelfClosing ) {
            end = gt + 1;
        } else {
            const close = `</${ tagName }>`;
            end = html.indexOf( close, gt + 1 );
            if ( end === -1 ) {
                return html;
            }
            end += close.length;
        }

        return html.slice( 0, start ) + replacement + html.slice( end );
    }

    /**
     * Used to verify whether the current user has access to the requested resource.
     *
     * @method
     * @param {Object} session
     * @param {Object} resource
     * @returns {Promise}
     * @private
     */
    #verifyAccess( session, resource ) {
        return new Promise( ( resolve, reject ) => {
            // TODO: Implement role based access management.
            resolve();
        } );
    }

}

module.exports = TiWebAppManager;