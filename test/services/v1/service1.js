/**
 * Test service.
 * NOTE: This is an example of a service that does not call other services. Therefore the definition is done as an
 * arrow function definition.
 *
 * @method
 * @type {ServiceHandler}
 * @param {ServiceDefinition} serviceDefinition Automatically passed in by the Service Provider.
 * @param {Object} serviceParams
 * @param {ServiceExecContext} serviceCallContext
 * @returns {Promise<Object|undefined>}
 * @public
 */
module.exports.service = ( serviceDefinition, serviceParams, serviceCallContext ) => {
    return new Promise( ( resolve, reject ) => {
        resolve();
    } );
};
