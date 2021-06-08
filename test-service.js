const ServiceInstance = require( process.cwd() + "/core/components/service-instance" );

class ServiceConsumer extends ServiceInstance {
    /**
     * @constructor
     */
    constructor() {
        super();
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
            resolve();
        } );
    }

}

module.exports = ServiceConsumer;