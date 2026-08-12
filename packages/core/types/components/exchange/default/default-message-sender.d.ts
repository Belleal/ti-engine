export = DefaultMessageSender;
import MessageSender = require("#message-sender");
/**
 * The default {@link MessageSender} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageSender
 * @extends MessageSender
 * @public
 */
declare class DefaultMessageSender extends MessageSender {
    #private;
    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     */
    constructor(identifier: string);
    /**
     * Used to perform the actual sending of a message.
     * <br/>
     * NOTE: The default message exchange works with lightweight messages (i.e., will keep the payloads stored in Redis while exchanging).
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The route to destination (queue) for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise}
     * @override
     * @public
     */
    onSend(message: Message, queue: string): Promise<any>;
    /**
     * Used to initialize and enable the communication capabilities of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    enable(): Promise<any>;
    /**
     * Used to shut down and disable the communication behavior of the handler.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disable(): Promise<any>;
}
