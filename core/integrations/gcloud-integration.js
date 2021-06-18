/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const config = require( "#config" );

/**
 * Used to verify if the GCloud integration is enabled.
 *
 * @method
 * @returns {boolean}
 * @public
 */
module.exports.isEnabled = () => {
    return process.env.TI_GCLOUD_ENABLED === true;
};

/**
 * Will be used to gracefully shut down the instance.
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