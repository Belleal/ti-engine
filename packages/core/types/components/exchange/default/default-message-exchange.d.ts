export = DefaultMessageExchange;
import MessageExchange = require("#message-exchange");
/**
 * The default {@link MessageExchange} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageExchange
 * @extends MessageExchange
 * @public
 */
declare class DefaultMessageExchange extends MessageExchange {
    /**
     * @constructor
     * @param {string} instanceID The unique identifier of the microservice instance using the message exchange.
     * @param {string} serviceDomainName The domain name of the microservice using the message exchange.
     */
    constructor(instanceID: string, serviceDomainName: string);
    /**
     * Used to initialize the message exchange.
     * <br/>
     * NOTE: This will create and prepare all necessary message handlers and then enable them simultaneously.
     *
     * @method
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to set up inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to set up outbound messaging.
     * @returns {Promise}
     * @override
     * @public
     */
    enableMessaging(configureInbound: boolean, configureOutbound: boolean): Promise<any>;
    /**
     * Used to gracefully shut down the message exchange.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disableMessaging(): Promise<any>;
    /**
     * Used to send a message request vie the specified route.
     *
     * @method
     * @param {Message} message The message request to send.
     * @returns {Promise}
     * @override
     * @public
     */
    sendMessageRequest(message: Message): Promise<any>;
    /**
     * Used to send a message response via the specified route.
     *
     * @method
     * @param {Message} message The message response to send.
     * @returns {Promise}
     * @override
     * @public
     */
    sendMessageResponse(message: Message): Promise<any>;
}
