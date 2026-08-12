export = DefaultMessageReceiver;
import MessageReceiver = require("#message-receiver");
import type { Message } from "#definitions";
/** @import { Message } from "#definitions" */
/**
 * The default {@link MessageReceiver} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageReceiver
 * @extends MessageReceiver
 * @public
 */
declare class DefaultMessageReceiver extends MessageReceiver {
    #private;
    /**
     * @constructor
     * @param {string} identifier An identifier for this message handler. Should be unique in the context of the message exchange.
     * @param {string} receiveQueue The queue from which the messages will be received.
     */
    constructor(identifier: string, receiveQueue: string);
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
    /**
     * Used to receive messages.
     * <br/>
     * NOTE: The default message exchange works with lightweight messages (i.e. will keep the payloads stored in Redis while exchanging).
     *
     * @method
     * @returns {Promise<Message>}
     * @override
     * @public
     */
    onReceive(): Promise<Message>;
}
