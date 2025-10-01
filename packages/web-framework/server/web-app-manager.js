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
    }

    /* Public interface */

    /**
     * Optional HTML transformation hook. Override in subclasses to add nonces or other dynamic data to outgoing HTML.
     *
     * @method
     * @param {string} html
     * @param {Object} [options]
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @virtual
     * @public
     */
    transformHtml( html, options = {} ) {
        const nonce = options?.nonce;
        let transformedHtml = String( html );
        if ( typeof nonce === "string" && RE_CSP_NONCE.test( nonce ) ) {
            transformedHtml = transformedHtml.replace( RE_NONCE_ATTR, `nonce="${ nonce }"` );
            if ( options.isHome ) {
                transformedHtml = transformedHtml
                    .replace( RE_INLINE_SCRIPT_NONCE, `"inlineScriptNonce":"${ nonce }"` )
                    .replace( RE_INLINE_STYLE_NONCE, `"inlineStyleNonce":"${ nonce }"` );
            }
        }

        return Promise.resolve( transformedHtml );
    }

    /**
     * Returns the HTML fragment for the requested route.
     *
     * @method
     * @param {Object} session
     * @param {string} fullPublicPath
     * @param {string} route
     * @param {Object} [options]
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @returns {Promise<string>}
     * @throws {Exception.E_WEB_INVALID_REQUEST_URI} If the provided route is not supported.
     * @public
     */
    getHtmlFragment( session, fullPublicPath, route, options = {} ) {
        return new Promise( ( resolve, reject ) => {
            let fragment = null;
            const localOptions = ( options && typeof options === "object" ) ? { ...options } : {};
            switch ( route ) {
                case '/': {
                    fragment = this.#fragments[ 'home' ];
                    localOptions.isHome = true;
                }
                    break;
                case '/app':
                case '/enter': {
                    fragment = ( session && session.user )
                        ? this.#fragments[ 'application-main' ]
                        : this.#fragments[ 'login' ];
                }
                    break;
                default: {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI );
                }
            }

            this.#verifyAccess( session, fragment ).then( () => {
                return this.#loadHtmlFragment( path.join( fullPublicPath, fragment.path ) );
            } ).then( ( fileData ) => {
                return this.transformHtml( fileData, localOptions );
            } ).then( ( fileData ) => {
                resolve( fileData );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /* Private interface */

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
            // TODO: Implement this.
            resolve();
        } );
    }

}

module.exports = WebAppManager;