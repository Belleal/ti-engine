export = MessageSender;
import MessageHandler = require("#message-handler");
import type { Message } from "#definitions";
/** @import { Message } from "#definitions" */
/**
 * An abstract class that defines a basic message sender behavior.
 *
 * @class MessageSender
 * @extends MessageHandler
 * @abstract
 * @public
 */
declare class MessageSender extends MessageHandler {
    #private;
    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(identifier: string);
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
     * Used to send a {@link Message} via this message handler.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise}
     * @public
     */
    send(message: Message, queue: string): Promise<any>;
    /**
     * Used to perform the actual sending of a message.
     * <br/>
     * NOTE: This method will be called automatically even if overridden.
     * <br/>
     * NOTE: Override this to add functionality.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise<*>}
     * @abstract
     * @public
     */
    onSend(message: Message, queue: string): Promise<any>;
}
