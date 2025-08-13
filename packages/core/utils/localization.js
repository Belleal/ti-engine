/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const path = require( "path" );
const labels = require( "#labels" );
const config = require( "#config" );
const logger = require( '#logger' );
const exceptions = require( '#exceptions' );

const defaultEmptyLabel = "!!! label not found !!!";

// Load any custom labels defined in the configuration:
try {
    const labelsPaths = config.getSetting( config.setting.LOCALIZATION_LABELS_PATH );
    _.forEach( labelsPaths, ( labelsPath ) => {
        let filePath = path.normalize( path.join( process.cwd(), labelsPath ) );
        let fileLabels = require( filePath );
        _.merge( labels, fileLabels );
    } );
} catch ( error ) {
    logger.log( `Error while trying to load custom labels.`, logger.logSeverity.ERROR, exceptions.raise( error ) );
}

// Prevent further modifications to the labels object:
Object.freeze( labels );

/**
 * Used to return the textual value for a label based on the current system language.
 *
 * @method
 * @param {string} label This should be a dot-separated JSON path string.
 * @returns {string}
 * @public
 */
module.exports.getLabel = ( label ) => {
    return _.get( labels, label + "." + config.getSetting( config.setting.LOCALIZATION_LANGUAGE ), defaultEmptyLabel );
};