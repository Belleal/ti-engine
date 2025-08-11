/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const config = require( "#config" );
const tools = require( "#tools" );

/**
 * Used to verify if the GCloud integration is enabled.
 *
 * @method
 * @returns {boolean}
 * @public
 */
module.exports.isEnabled = () => {
    return tools.toBool( process.env.TI_GCLOUD_ENABLED );
};

/**
 * Will be used to gracefully shut down the instance.
 * <br/>
 * NOTE: Will be overridden below after the instance creation.
 *
 * @method
 * @param {Error} error
 * @abstract
 * @public
 */
module.exports.reportError = ( error ) => {
    console.error( "Attempting to report error to GCloud while integration to it is disabled!" );
};

if ( process.env.TI_GCLOUD_ENABLED === true ) {
    const { ErrorReporting } = require( "@google-cloud/error-reporting" );

    const errorReporting = new ErrorReporting( {
        projectId: config.getSetting( config.setting.GCLOUD_PROJECT_ID ),
        key: config.getSetting( config.setting.GCLOUD_API_KEY ),
        reportMode: "production",
        logLevel: 2,
        reportUnhandledRejections: true
    } );

    /**
     * Reports an error to the GCloud error reporting system.
     *
     * @method
     * @param {Error} error
     * @override
     * @public
     */
    module.exports.reportError = ( error ) => {
        errorReporting.report( {
            eventTime: ( new Date() ).toISOString(),
            message: error.stack,
            serviceContext: {
                service: process.env.TI_INSTANCE_ID
            }
        } );
    };
}