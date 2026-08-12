export = MessageReceiver;
import MessageHandler = require("#message-handler");
/**
 * An abstract class that defines a basic message receiver behavior.
 *
 * @class MessageReceiver
 * @extends MessageHandler
 * @abstract
 * @public
 */
declare class MessageReceiver extends MessageHandler {
    #private;
    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @param {string} receiveQueue The queue from which the messages will be received.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(identifier: string, receiveQueue: string);
    /**
     * Property returning the configured receiving queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    get receiveQueue(): string;
    /**
     * Indicates whether the receiver is currently receiving messages.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isReceiving(): boolean;
    /**
     * Used to set the value of the {@link MessageReceiver#isReceiving} property.
     *
     * @property
     * @param {boolean} value
     * @public
     */
    set isReceiving(value: boolean);
    /**
     * Used to initialize and enable the communication capabilities of the handler.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    enable(): Promise<any>;
    /**
     * Used to shut down and disable the communication behavior of the handler.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    disable(): Promise<any>;
    /**
     * Used to receive messages.
     * <br/>
     * NOTE: This method will start a recursion of subsequent receive calls that will continue even if an individual message fetch fails.
     *
     * @method
     * @recursion
     * @public
     */
    receive(): void;
    /**
     * Used to receive messages.
     * <br/>
     * NOTE: This method will be called automatically even if overridden.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @returns {Promise<Message>}
     * @abstract
     * @public
     */
    onReceive(): Promise<Message>;
    /**
     * Used to process the received message before providing it to any {@link MessageObserver}.
     *
     * @method
     * @param {Message} message
     * @returns {Promise<Message>}
     * @private
     */
    private #postReceive;
}
