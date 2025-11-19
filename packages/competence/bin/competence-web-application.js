/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );

/**
 * NOTE: This is still a work in progress.
 *
 * @class CompetenceWebApplication
 * @extends TiWebAppManager
 * @public
 */
class CompetenceWebApplication extends TiWebAppManager {

    /**
     * @constructor
     * @param {string} identifier
     */
    constructor( identifier = "competence" ) {
        super( identifier );

        this.addFragment( "competence-evaluation", {
            title: "Competence Evaluation",
            path: "fragments/frame-competence-evaluation.html"
        } );
    }

    /* Public interface */

    /**
     * Optional HTML transformation hook.
     *
     * @method
     * @param {string} html
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @param {string} [options.title] Optional title to replace the placeholder in the HTML.
     * @returns {Promise<string>}
     * @override
     * @public
     */
    transformHtml( html, options ) {
        return super.transformHtml( html, options );
    }

}

module.exports = CompetenceWebApplication;