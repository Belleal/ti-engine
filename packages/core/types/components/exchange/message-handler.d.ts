export = MessageHandler;
import ConnectionObserver = require("#connection-observer");
/**
 * An abstract class that defines a basic message handler behavior.
 * <br/>
 * NOTE: This class and its children are designed to be used internally by classes extending the {@link MessageObserver} class.
 *
 * @class MessageHandler
 * @extends ConnectionObserver
 * @abstract
 * @public
 */
declare class MessageHandler extends ConnectionObserver {
    #private;
    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(identifier: string);
    /**
     * Indicates whether the message handler is currently available.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isAvailable(): boolean;
    /**
     * Used to set the isAvailable flag.
     * <br/>
     * NOTE: For use by implementing classes only!
     *
     * @property
     * @param {boolean} value
     * @public
     */
    set isAvailable(value: boolean);
    /**
     * Returns the connection identifier.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier(): string;
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
     * Used to create a security hash from the message.
     *
     * @method
     * @param {Message} message
     * @returns {string}
     * @public
     */
    createMessageHash(message: Message): string;
    /**
     * Used to register a new {@link MessageObserver} for events related to the messages passing through this handler.
     *
     * @method
     * @param {MessageObserver} messageObserver The {@link MessageObserver} that will be notified of any changes.
     * @public
     */
    addMessageObserver(messageObserver: MessageObserver): void;
    /**
     * An event-triggered method that will notify any observers about a new message for handling.
     * <br/>
     * NOTE: Each observer will be notified in the order of their priority via their {@link MessageObserver.onMessage} method. Additionally, the message will be
     * passed through each observer in the order of their priority. If the observer returns a modified message, it will be used instead of the original message!
     *
     * @method
     * @param {Message} message
     * @public
     */
    notifyMessageObservers(message: Message): void;
    /**
     * An event-triggered method that will notify any observers about the primary connection recovered state.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionRecovered( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    private onConnectionRecovered;
    /**
     * An event-triggered method that will notify any observers about the primary connection disrupted state.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionDisrupted( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    private onConnectionDisrupted;
    /**
     * An event-triggered method that will notify any observers about the primary connection having been lost.
     * <br/>
     * NOTE: You can override this to add custom functionality but make sure to also call the base method
     * using: super.onConnectionLost( identifier )
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @private
     */
    private onConnectionLost;
}
