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
            serviceAlias: "service1",
            serviceDomainName: "tester-service"
        }, {}, {
            authToken: serviceCallContext.authToken
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
