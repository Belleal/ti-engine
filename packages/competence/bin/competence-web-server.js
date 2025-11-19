/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebServer = require( "@ti-engine/web-framework/web-server" );

/**
 * NOTE: This is still a work in progress.
 *
 * @class CompetenceWebServer
 * @extends TiWebServer
 * @public
 */
class CompetenceWebServer extends TiWebServer {

    /**
     * @constructor
     * @param {string} serviceDomainName
     * @param {TiWebServiceConfiguration} serviceConfig
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
    }

    /* Public interface */

    /**
     * Used to define the unprotected routes (i.e., routes that do not require authentication).
     *
     * @method
     * @override
     * @public
     */
    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
    }

    /**
     * Used to define the web application routes.
     *
     * @method
     * @override
     * @public
     */
    defineWebApplicationRoutes() {
        super.defineWebApplicationRoutes();
    }

}

module.exports = CompetenceWebServer;