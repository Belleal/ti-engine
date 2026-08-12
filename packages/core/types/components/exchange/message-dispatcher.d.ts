declare const _exported: Readonly<MessageDispatcher>;
export { _exported as instance };
/**
 * Used to create and/or return a Message Dispatcher singleton instance.
 * This class handles the internal message dispatching between the microservices.
 *
 * @class MessageDispatcher
 * @singleton
 * @public
 */
declare class MessageDispatcher {
    #private;
    /**
     * @constructor
     * @returns {MessageDispatcher}
     */
    constructor();
    /**
     * Used to initialize the message dispatcher and enable the message exchange.
     *
     * @method
     * @param {MessageExchange} messageExchange The message exchange instance to be used by the dispatcher.
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to set up inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to set up outbound messaging.
     * @returns {Promise}
     * @public
     */
    initialize(messageExchange: MessageExchange, configureInbound: boolean, configureOutbound: boolean): Promise<any>;
    /**
     * Used to shut down the message dispatcher and disable the message exchange.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    shutDown(): Promise<any>;
    /**
     * Used to send a message request via the message exchange system.
     *
     * @method
     * @param {Message} message The message to send. This can also be a subclass of {@link Message}.
     * @returns {Promise<string>}
     * @public
     */
    sendRequest(message: Message): Promise<string>;
    /**
     * Used to send a message response via the message exchange system.
     *
     * @method
     * @param {Message} message The message to send. This can also be a subclass of {@link Message}.
     * @returns {Promise}
     * @public
     */
    sendResponse(message: Message): Promise<any>;
    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message requests.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverRequestsIn(messageObserver: MessageObserver): void;
    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message responses.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverResponsesIn(messageObserver: MessageObserver): void;
}
