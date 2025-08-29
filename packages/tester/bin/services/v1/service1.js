/**
 * Test business service.
 * <br/>
 * NOTE: This is an example of a business service that does not call other services.
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
        setTimeout( () => {
            resolve( {
                s1Timestamp: Date.now()
            } );
        }, 500 );
    } );
};
