/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageObserver = require( "#message-observer" );
const _ = require( "lodash" );
const exceptions = require( "#exceptions" );
const messageTracer = require( "#message-tracer" );

/**
 * @typedef {Object} MessageDestination
 * @property {string|undefined} [instanceID] The instance ID of the message exchange by which the message was received (available after acceptance).
 * @property {string} route The route to destination for the message. Exact structure will depend on the implementation of the message exchange.
 */

/**
 * @typedef {Object} MessageSource
 * @property {string} instanceID The instance ID of the message exchange from which the service call originated.
 * @property {string} route The route from source of the message. Exact structure will depend on the implementation of the message exchange.
 */

/**
 * @typedef {Object} Message
 * @property {string} chainID Unique identifier of the message chain if the message is part of one.
 * @property {number} chainLevel The node level of this message in the message chain tree.
 * @property {MessageDestination} destination The destination of the message.
 * @property {string} messageID Unique message identifier.
 * @property {*} payload The message contents to be processed in destination.
 * @property {number} sequence A system property used to count the sequence of the message handler tasks. Counting starts from 0.
 * @property {MessageSource} source The source of the message.
 */

/**
 * An abstract class that defines a message exchange behavior.
 * NOTE: While this sets the basis frame for the message based communication between microservices, it has to be inherited and
 * extended with additional logic that is NOT implemented here. For a working example please see {@link DefaultMessageExchange} class.
 * NOTE: This class and its children are designed to be used internally by the {@link MessageDispatcher} and its related classes.
 *
 * @class MessageExchange
 * @extends MessageObserver
 * @abstract
 * @public
 */
class MessageExchange extends MessageObserver {

    static #connectionNameRequestsOut = "connection-msg-requests-out";
    static #connectionNameRequestsIn = "connection-msg-requests-in";
    static #connectionNameResponsesOut = "connection-msg-responses-out";
    static #connectionNameResponsesIn = "connection-msg-responses-in";
    #instanceID;
    #serviceDomainName;
    #disruptedConnections;
    #configuredOutbound = false;
    #configuredInbound = false;
    /** @type MessageSender */
    #messageRequestsOut;
    /** @type MessageSender */
    #messageResponsesOut;
    /** @type MessageReceiver */
    #messageRequestsIn;
    /** @type MessageReceiver */
    #messageResponsesIn;

    /**
     * @constructor
     * @param {string} instanceID The unique identifier of the microservice instance using the message exchange.
     * @param {string} serviceDomainName The domain name of the microservice using the message exchange.
     */
    constructor( instanceID, serviceDomainName ) {
        super();

        // make sure this abstract class cannot be instantiated:
        if ( new.target === MessageExchange ) {
            throw exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_CLASS_INIT, { name: this.constructor.name } );
        }

        this.#instanceID = instanceID;
        this.#serviceDomainName = serviceDomainName;
        this.#disruptedConnections = [];
    }

    /* Public interface */

    /**
     * Property returning the configured connection name for the outgoing message requests.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameRequestsOut() { return this.#connectionNameRequestsOut; }

    /**
     * Used to set the connection name for the outgoing message requests.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameRequestsOut( value ) { this.#connectionNameRequestsOut = value; }

    /**
     * Property returning the configured connection name for the incoming message requests.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameRequestsIn() { return this.#connectionNameRequestsIn; }

    /**
     * Used to set the connection name for the incoming message requests.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameRequestsIn( value ) { this.#connectionNameRequestsIn = value; }

    /**
     * Property returning the configured connection name for the outgoing message responses.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameResponsesOut() { return this.#connectionNameResponsesOut; }

    /**
     * Used to set the connection name for the outgoing message responses.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameResponsesOut( value ) { this.#connectionNameResponsesOut = value; }

    /**
     * Property returning the configured connection name for the incoming message responses.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get connectionNameResponsesIn() { return this.#connectionNameResponsesIn; }

    /**
     * Used to set the connection name for the incoming message responses.
     *
     * @property
     * @param {string} value
     * @public
     */
    static set connectionNameResponsesIn( value ) { this.#connectionNameResponsesIn = value; }

    /**
     * Property returning the identifier of the pending messages queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get pendingQueue() { return "pending:"; }

    /**
     * Property returning the identifier of the processing messages queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get processingQueue() { return "processing:"; }

    /**
     * Property returning the identifier of the processed messages queue.
     *
     * @property
     * @returns {string}
     * @public
     */
    static get processedQueue() { return "processed:"; }

    /**
     * Property returning the configured service instance ID.
     *
     * @property
     * @returns {string}
     * @public
     */
    get instanceID() { return this.#instanceID; }

    /**
     * Property returning the configured service domain name.
     *
     * @property
     * @returns {string}
     * @public
     */
    get serviceDomainName() { return this.#serviceDomainName; }

    /**
     * Returns the currently configured {@link MessageSender} for outbound message requests.
     *
     * @property
     * @returns {MessageSender}
     * @public
     */
    get messageRequestsOut() { return this.#messageRequestsOut; }

    /**
     * Returns the currently configured {@link MessageSender} for outbound message responses.
     *
     * @property
     * @returns {MessageSender}
     * @public
     */
    get messageResponsesOut() { return this.#messageResponsesOut; }

    /**
     * Returns the currently configured {@link MessageReceiver} for inbound message requests.
     *
     * @property
     * @returns {MessageReceiver}
     * @public
     */
    get messageRequestsIn() { return this.#messageRequestsIn; }

    /**
     * Returns the currently configured {@link MessageReceiver} for inbound message responses.
     *
     * @property
     * @returns {MessageReceiver}
     * @public
     */
    get messageResponsesIn() { return this.#messageResponsesIn; }

    /**
     * Returns a flag indicating if the message exchange is configured for outbound communication.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get configuredOutbound() { return this.#configuredOutbound; }

    /**
     * Returns a flag indicating if the message exchange is configured for inbound communication.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get configuredInbound() { return this.#configuredInbound; }

    /**
     * Should be used to enable all communication channels for messaging.
     * NOTE: Override this to implement messaging initialization.
     *
     * @method
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to setup inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to setup outbound messaging.
     * @returns {Promise}
     * @abstract
     * @public
     */
    enableMessaging( configureInbound, configureOutbound ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.enableMessaging.name } ) );
    }

    /**
     * Should be used to gracefully disable all communication channels for messaging.
     * NOTE: Override this to implement graceful messaging shut down.
     *
     * @method
     * @returns {Promise}
     * @abstract
     * @public
     */
    disableMessaging() {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.disableMessaging.name } ) );
    }

    /**
     * Used to configure the message exchange for receiving inbound messages and returning responses to them.
     * Should typically be called from an implemented {@link enableMessaging} method.
     *
     * @method
     * @param {MessageReceiver} messageReceiverRequestsIn A message receiver that will handle the inbound messages.
     * @param {MessageSender} messageSenderResponsesOut A message sender that will handle the sending of responses for the inbound messages.
     * @public
     */
    configureInboundMessaging( messageReceiverRequestsIn, messageSenderResponsesOut ) {
        this.#messageRequestsIn = messageReceiverRequestsIn;
        this.#messageResponsesOut = messageSenderResponsesOut;
        this.#configuredInbound = true;
    }

    /**
     * Used to configure message exchange for sending messages and receiving responses to them.
     * Should typically be called from an implemented {@link enableMessaging} method.
     *
     * @method
     * @param {MessageSender} messageSenderRequestsOut A message sender that will handle the outbound messages.
     * @param {MessageReceiver} messageReceiverResponsesIn A message receiver that will handle the returned responses for the outbound messages.
     * @public
     */
    configureOutboundMessaging( messageSenderRequestsOut, messageReceiverResponsesIn ) {
        this.#messageRequestsOut = messageSenderRequestsOut;
        this.#messageResponsesIn = messageReceiverResponsesIn;
        this.#configuredOutbound = true;
    }

    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message requests.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverRequestsIn( messageObserver ) {
        this.#messageRequestsIn.addMessageObserver( messageObserver );
    }

    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message responses.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverResponsesIn( messageObserver ) {
        this.#messageResponsesIn.addMessageObserver( messageObserver );
    }

    /**
     * Used to mark the connection with the provided identifier as disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        this.#disruptedConnections.push( identifier );
    }

    /**
     * Used to mark the connection with the provided identifier as recovered.
     * NOTE: This will also result in enabling the message exchange if no connections are currently disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered( identifier ) {
        _.pull( this.#disruptedConnections, identifier );
    }

    /**
     * Used only for the purposes of the message tracer.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @param {Message} message The message for processing.
     * @override
     * @public
     */
    onMessage( identifier, message ) {
        message.destination.instanceID = this.#instanceID;

        if ( MessageExchange.connectionNameRequestsIn === identifier ) {
            messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.RECEIVED, messageTracer.messageState.PENDING );
        } else if ( MessageExchange.connectionNameResponsesIn === identifier ) {
            messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.RECEIVED, messageTracer.messageState.PROCESSED );
        }
    }

    /**
     * Used to check whether the connection with the provided identifier is currently in recovery mode.
     *
     * @method
     * @param {string} identifier The identifier of the connection.
     * @returns {boolean} Will return 'true' if the connection is currently disrupted and not yet recovered.
     * @public
     */
    isConnectionInRecovery( identifier ) {
        return this.#disruptedConnections.indexOf( identifier ) !== -1;
    }

    /**
     * Used to send a message request. Override of this method assumes that the message itself contains enough
     * information to determine the send destination.
     *
     * @method
     * @param {Message} message The message request to send.
     * @returns {Promise}
     * @abstract
     * @public
     */
    sendMessageRequest( message ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.sendMessageRequest.name } ) );
    }

    /**
     * Used to send a message response. Override of this method assumes that the message itself contains enough
     * information to determine the send destination.
     *
     * @method
     * @param {Message} message The message response to send.
     * @returns {Promise}
     * @abstract
     * @public
     */
    sendMessageResponse( message ) {
        return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_ABSTRACT_METHOD_CALL, { name: this.constructor.name + "." + this.sendMessageResponse.name } ) );
    }

}

module.exports = MessageExchange;
