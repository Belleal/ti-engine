export = MessageObserver;
import ConnectionObserver = require("#connection-observer");
/**
 * An abstract class that allows the child class to observe and take action on message events.
 * <br/>
 * NOTE: This class inherits {@link ConnectionObserver} so it can also act in that capacity.
 *
 * @class MessageObserver
 * @extends ConnectionObserver
 * @abstract
 * @public
 */
declare class MessageObserver extends ConnectionObserver {
    #private;
    /**
     * @constructor
     * @param {number} [priority=0] The priority of this observer. Higher values indicate higher priority.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(priority?: number);
    /**
     * Returns the priority of this observer.
     * <br/>
     * NOTE: Higher values indicate higher priority.
     *
     * @property
     * @returns {number}
     */
    get priority(): number;
    /**
     * Used to set the priority of this observer.
     * <br/>
     * NOTE: Higher values indicate higher priority.
     *
     * @property
     * @param {number} value
     */
    set priority(value: number);
    /**
     * Needs to be invoked by the message handler once a message enters its logic for processing.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @returns {Message} The message that was received.
     * @virtual
     * @public
     */
    onMessage(identifier: string, message: Message): Message;
    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     * <br/>
     * NOTE: Override this to add custom functionality.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @virtual
     * @public
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
