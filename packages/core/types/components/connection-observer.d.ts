export = ConnectionObserver;
/**
 * An abstract class that allows the child class to observe and take action on various events related to external connections.
 *
 * @class ConnectionObserver
 * @abstract
 * @public
 */
declare class ConnectionObserver {
    /**
     * @constructor
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor();
    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     *
     */
    onConnectionDisrupted(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionRecovered(identifier: string): void;
    /**
     * Needs to be invoked by the connection handler when the connection is irrevocably lost.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
     */
    onConnectionLost(identifier: string): void;
}
