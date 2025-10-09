/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );
const logger = require( "@ti-engine/core/logger" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const _ = require( "lodash" );

const RE_NONCE_ATTR = /nonce="{ti-nonce-placeholder}"/g;
const RE_INLINE_SCRIPT_NONCE = /"inlineScriptNonce":"{ti-nonce-placeholder}"/g;
const RE_INLINE_STYLE_NONCE = /"inlineStyleNonce":"{ti-nonce-placeholder}"/g;
const RE_CSP_NONCE = /^[A-Za-z0-9+\/=_-]{16,}$/;

/**
 * @class WebAppManager
 * @public
 */
class WebAppManager {

    #webAppIdentifier = null;
    #fragments = {};

    constructor( identifier ) {
        this.#webAppIdentifier = identifier;

        // TODO: All of this will be configurable later.
        this.#fragments[ 'home' ] = { path: "index.html" };
        this.#fragments[ 'application-main' ] = { path: "fragments/frame-application.html" };
        this.#fragments[ 'login' ] = { path: "fragments/frame-login.html" };
        this.#fragments[ 'dashboard' ] = { path: "fragments/frame-dashboard.html" };
        this.#fragments[ 'administration' ] = { path: "fragments/frame-administration.html" };
        this.#fragments[ 'profile' ] = { path: "fragments/frame-profile.html" };
    }

    /* Public interface */

    /**
     * Optional HTML transformation hook. Override in subclasses to add nonces or other dynamic data to outgoing HTML.
     *
     * @method
     * @param {string} html
     * @param {string} fullPublicPath
     * @param {Object} [options]
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @virtual
     * @public
     */
    transformHtml( html, fullPublicPath, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            let transformedHtml = String( html );

            // TODO: Temporary setup - will be expanded later
            this.#loadHtmlFragment( path.join( fullPublicPath, "fragments/components/component-sidebar-flyout.html" ) ).then( ( fileData ) => {
                transformedHtml = transformedHtml.replaceAll( "{ti-sidebar-flyout-placeholder}", fileData );

                // Insert nonces:
                const nonce = options?.nonce;
                if ( typeof nonce === "string" && RE_CSP_NONCE.test( nonce ) ) {
                    transformedHtml = transformedHtml.replaceAll( RE_NONCE_ATTR, `nonce="${ nonce }"` );
                    if ( options.isHome ) {
                        transformedHtml = transformedHtml
                            .replaceAll( RE_INLINE_SCRIPT_NONCE, `"inlineScriptNonce":"${ nonce }"` )
                            .replaceAll( RE_INLINE_STYLE_NONCE, `"inlineStyleNonce":"${ nonce }"` );
                    }
                }

                resolve( transformedHtml );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }


    assembleHtmlView( session, fullPublicPath, route, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            let fragment = null;
            let getHtmlPromises = [];
            let localOptions = ( options && typeof options === "object" ) ? { ...options } : {};

            if ( route === "/" ) {
                fragment = this.#fragments[ 'home' ];
                localOptions.isHome = true;
                getHtmlPromises.push( this.#getHtmlFragment( session, fullPublicPath, fragment, localOptions ) );
            } else if ( route === "/app" || route === "/app/enter" ) {
                fragment = ( session && session.user ) ? this.#fragments[ 'application-main' ] : this.#fragments[ 'login' ];
                getHtmlPromises.push( this.#getHtmlFragment( session, fullPublicPath, fragment, localOptions ) );
            } else {
                // TODO: Not yet ready!
                if ( options.isPartial !== true ) {
                    getHtmlPromises.push( this.#getHtmlFragment( session, fullPublicPath, this.#fragments[ 'home' ], localOptions ) );
                }

                fragment = this.#fragments[ options.view ];
                if ( !fragment ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI );
                } else {
                    getHtmlPromises.push( this.#getHtmlFragment( session, fullPublicPath, fragment, localOptions ) );
                }
            }

            Promise.all( getHtmlPromises ).then( ( filesData ) => {
                let assembledHtml = undefined;
                _.forEach( filesData, ( fileData ) => {
                    assembledHtml = ( assembledHtml ) ? assembledHtml.replace( "{ti-nested-view-placeholder}", fileData ) : fileData;
                } );
                resolve( assembledHtml );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /* Private interface */

    /**
     * Returns the HTML fragment for the requested route.
     *
     * @method
     * @param {Object} session
     * @param {string} fullPublicPath
     * @param {Object} fragment
     * @param {Object} [options]
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @throws {Exception.E_WEB_INVALID_REQUEST_URI} If the provided route is not supported.
     * @public
     */
    #getHtmlFragment( session, fullPublicPath, fragment, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            this.#verifyAccess( session, fragment ).then( () => {
                return this.#loadHtmlFragment( path.join( fullPublicPath, fragment.path ) );
            } ).then( ( fileData ) => {
                return this.transformHtml( fileData, fullPublicPath, options );
            } ).then( ( fileData ) => {
                resolve( fileData );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Loads the HTML fragment from the specified file path.
     *
     * @method
     * @param {string} filePath
     * @returns {Promise<string>}
     * @private
     */
    #loadHtmlFragment( filePath ) {
        return new Promise( ( resolve, reject ) => {
            fs.promises.readFile( filePath, "utf8" ).then( ( fileData ) => {
                resolve( fileData );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
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

module.exports = WebAppManager;