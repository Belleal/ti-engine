/*
 * SPDX-FileCopyrightText: © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const _ = require( "lodash" );
const path = require( "path" );
const config = require( "#config" );

const labelsPath = path.normalize( path.join( process.cwd(), config.getSetting( config.setting.LOCALIZATION_LABELS_PATH ) ) );
const labels = require( labelsPath );
const defaultEmptyLabel = "!!! label not found !!!";

// prevent further modifications to the labels object:
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
