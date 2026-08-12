export = MessageExchange;
import MessageObserver = require("#message-observer");
/**
 * An abstract class that defines a message exchange behavior.
 * <br/>
 * NOTE: While this sets the basis frame for the message-based communication between microservices, it has to be inherited and
 * extended with additional logic that is NOT implemented here. For a working example please see {@link DefaultMessageExchange} class.
 * <br/>
 * NOTE: This class and its children are designed to be used internally by the {@link MessageDispatcher} and its related classes.
 *
 * @class MessageExchange
 * @extends MessageObserver
 * @abstract
 * @public
 */
declare class MessageExchange extends MessageObserver {
    #private;
    /**
     * @constructor
     * @param {string} instanceID The unique identifier of the microservice instance using the message exchange.
     * @param {string} serviceDomainName The domain name of the microservice using the message exchange.
     * @throws {TiException.E_GEN_ABSTRACT_CLASS_INIT} If this class is instantiated directly.
     */
    constructor(instanceID: string, serviceDomainName: string);
    /**
     * Property returning the configured connection name for the outgoing message requests.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameRequestsOut(): string;
    /**
     * Used to set the connection name for the outgoing message requests.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameRequestsOut(value: string);
    /**
     * Property returning the configured connection name for the incoming message requests.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameRequestsIn(): string;
    /**
     * Used to set the connection name for the incoming message requests.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameRequestsIn(value: string);
    /**
     * Property returning the configured connection name for the outgoing message responses.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameResponsesOut(): string;
    /**
     * Used to set the connection name for the outgoing message responses.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameResponsesOut(value: string);
    /**
     * Property returning the configured connection name for the incoming message responses.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameResponsesIn(): string;
    /**
     * Used to set the connection name for the incoming message responses.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameResponsesIn(value: string);
    /**
     * Property returning the identifier of the pending messages queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get pendingQueue(): string;
    /**
     * Property returning the identifier of the processed messages queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get processedQueue(): string;
    /**
     * Property returning the configured service instance ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    get instanceID(): string;
    /**
     * Property returning the configured service domain name.
     *
     * @property
     * @returns {string}
     * @public
     */
    get serviceDomainName(): string;
    /**
     * Returns the currently configured {@link MessageSender} for outbound message requests.
     *
     * @property
     * @returns {MessageSender}
     * @public
     */
    get messageRequestsOut(): MessageSender;
    /**
     * Returns the currently configured {@link MessageSender} for outbound message responses.
     *
     * @property
     * @returns {MessageSender}
     * @public
     */
    get messageResponsesOut(): MessageSender;
    /**
     * Returns the currently configured {@link MessageReceiver} for inbound message requests.
     *
     * @property
     * @returns {MessageReceiver}
     * @public
     */
    get messageRequestsIn(): MessageReceiver;
    /**
     * Returns the currently configured {@link MessageReceiver} for inbound message responses.
     *
     * @property
     * @returns {MessageReceiver}
     * @public
     */
    get messageResponsesIn(): MessageReceiver;
    /**
     * Returns a flag indicating if the message exchange is configured for outbound communication.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get configuredOutbound(): boolean;
    /**
     * Returns a flag indicating if the message exchange is configured for inbound communication.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get configuredInbound(): boolean;
    /**
     * Should be used to enable all communication channels for messaging.
     * <br/>
     * NOTE: Override this to implement messaging initialization.
     *
     * @method
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to set up inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to set up outbound messaging.
     * @returns {Promise}
     * @abstract
     * @public
     */
    enableMessaging(configureInbound: boolean, configureOutbound: boolean): Promise<any>;
    /**
     * Should be used to gracefully disable all communication channels for messaging.
     * <br/>
     * NOTE: Override this to implement graceful messaging shut down.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    disableMessaging(): Promise<any>;
    /**
     * Used to configure the message exchange for receiving inbound messages and returning responses to them.
     * Should typically be called from an implemented {@link enableMessaging} method.
     *
     * @method
     * @param {MessageReceiver} messageReceiverRequestsIn A message receiver that will handle the inbound messages.
     * @param {MessageSender} messageSenderResponsesOut A message sender that will handle the sending of responses for the inbound messages.
     * @public
     */
    configureInboundMessaging(messageReceiverRequestsIn: MessageReceiver, messageSenderResponsesOut: MessageSender): void;
    /**
     * Used to configure message exchange for sending messages and receiving responses to them.
     * Should typically be called from an implemented {@link enableMessaging} method.
     *
     * @method
     * @param {MessageSender} messageSenderRequestsOut A message sender that will handle the outbound messages.
     * @param {MessageReceiver} messageReceiverResponsesIn A message receiver that will handle the returned responses for the outbound messages.
     * @public
     */
    configureOutboundMessaging(messageSenderRequestsOut: MessageSender, messageReceiverResponsesIn: MessageReceiver): void;
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
    /**
     * Used to mark the connection with the provided identifier as disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted(identifier: string): void;
    /**
     * Used to mark the connection with the provided identifier as recovered.
     * <br/>
     * NOTE: This will also result in enabling the message exchange if no connections are currently disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered(identifier: string): void;
    /**
     * Used to mark the connection with the provided identifier as disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionLost(identifier: string): void;
    /**
     * Used only for the message tracer.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @returns {Message} The message that was received.
     * @override
     * @public
     */
    onMessage(identifier: string, message: Message): Message;
    /**
     * Used to check whether the connection with the provided identifier is currently in recovery mode.
     *
     * @method
     * @param {string} identifier The identifier of the connection.
     * @returns {boolean} Will return 'true' if the connection is currently disrupted and not yet recovered.
     * @public
     */
    isConnectionInRecovery(identifier: string): boolean;
    /**
     * Used to send a message request. Override of this method assumes that the message itself contains enough
     * information to determine the sending destination.
     *
     * @method
     * @param {Message} message The message request to send.
     * @returns {Promise}
     * @abstract
     * @public
     */
    sendMessageRequest(message: Message): Promise<any>;
    /**
     * Used to send a message response. Override of this method assumes that the message itself contains enough
     * information to determine the sending destination.
     *
     * @method
     * @param {Message} message The message response to send.
     * @returns {Promise}
     * @abstract
     * @public
     */
    sendMessageResponse(message: Message): Promise<any>;
}
