/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const ServiceInstance = require( "@ti-engine/core/service-instance" );
const tools = require( "@ti-engine/core/tools" );
const _ = require( "lodash" );
const fs = require( "fs" );

class ServiceConsumer extends ServiceInstance {
    /**
     * @constructor
     * @param {string} serviceDomainName The service domain name for this service instance.
     */
    constructor( serviceDomainName ) {
        super( serviceDomainName );
    }

    /**
     * Executes custom logic on instance start.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    onStart() {
        return new Promise( ( resolve, reject ) => {
            console.log( "Inside overridden Start" );

            let rawdata = fs.readFileSync( "C:\\Users\\b.kostadinov\\WebstormProjects\\ti-engine\\web-framework\\temp.json" );
            let all = JSON.parse( rawdata );
            let tests = [];
            let mans = [];
            let manIds = [];
            _.forEach( all.deviceList, ( device ) => {
                tests.push( {
                    1: device.id_device,
                    2: device.commercial_name,
                    3: 2,
                    4: device.manufacturer.id_manufacturer
                } );
                if ( manIds.indexOf( device.manufacturer.id_manufacturer ) === -1 ) {
                    manIds.push( device.manufacturer.id_manufacturer );
                    mans.push( {
                        1: device.manufacturer.id_manufacturer,
                        2: device.manufacturer.name,
                        3: device.manufacturer.country,
                        4: device.manufacturer.website
                    } );
                }
            } );

            tools.createCSVFile( tests, "C:\\Users\\b.kostadinov\\WebstormProjects\\ti-engine\\web-framework\\", "tests" );
            tools.createCSVFile( mans, "C:\\Users\\b.kostadinov\\WebstormProjects\\ti-engine\\web-framework\\", "mans" );

            resolve();
        } );
    }

}

module.exports = ServiceConsumer;
