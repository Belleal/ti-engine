const ServiceProvider = require( "@ti-engine/core/service-provider" );

/**
 * Test business service.
 * <br/>
 * NOTE: This is an example of a business service that calls another service.
 *
 * @method
 * @type {ServiceHandlerMethod}
 * @param {ServiceDefinition} serviceDefinition Automatically passed in by the Service Provider.
 * @param {Object} serviceParams
 * @param {ServiceExecContext} serviceCallContext
 * @returns {Promise<Object|undefined>}
 * @public
 */
module.exports.service = function ( serviceDefinition, serviceParams, serviceCallContext ) {
    return new Promise( ( resolve, reject ) => {
        let s2TimestampStart = Date.now();
        this.callService( {
            serviceAlias: this.getRegisteredServices()[ 0 ], // get the name of the first service - by default "service1"
            serviceDomainName: ServiceProvider.serviceDomainName // get the name of own service domain - by default "ti-tester-service"
        }, {}, {
            authToken: serviceCallContext.authToken // reuse the provided auth token for the next service call
        } ).then( ( result ) => {
            if ( result.isSuccessful ) {
                result = result.payload;
                result.s2TimestampStart = s2TimestampStart;
                result.s2TimestampEnd = Date.now();
                resolve( result );
            } else {
                reject( result.exception );
            }
        } ).catch( ( error ) => {
            reject( error );
        } );
    } );
};
