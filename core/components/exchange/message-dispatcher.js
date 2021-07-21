/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

const MessageExchange = require( "#message-exchange" );
const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const messageTracer = require( "#message-tracer" );

/**
 * Used to create and/or return a Message Dispatcher singleton instance.
 * This class handles the internal message dispatching between the microservices.
 *
 * @class MessageDispatcher
 * @singleton
 * @public
 */
class MessageDispatcher {

    static #instance = null;
    #messageExchange;

    /**
     * @constructor
     * @returns {MessageDispatcher}
     */
    constructor() {
        if ( !MessageDispatcher.#instance ) {
            MessageDispatcher.#instance = this;
        }

        return MessageDispatcher.#instance;
    }

    /* Public interface */

    /**
     * Used to initialize the message dispatcher and enable the message exchange.
     *
     * @method
     * @param {MessageExchange} messageExchange The message exchange instance to be used by the dispatcher.
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to setup inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to setup outbound messaging.
     * @returns {Promise}
     * @public
     */
    initialize( messageExchange, configureInbound, configureOutbound ) {
        return new Promise( ( resolve, reject ) => {
            this.#messageExchange = messageExchange;
            this.#messageExchange.enableMessaging( configureInbound, configureOutbound ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to shut down the message dispatcher and disable the message exchange.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    shutDown() {
        return new Promise( ( resolve, reject ) => {
            this.#messageExchange.disableMessaging().then( () => {
                this.#messageExchange = null;
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to send a message request via the message exchange system.
     *
     * @method
     * @param {Message} message The message to send. This can also be a subclass of {@link Message}.
     * @returns {Promise}
     * @public
     */
    sendMessageRequest( message ) {
        return new Promise( ( resolve, reject ) => {
            // make sure to increment the task sequence before proceeding further:
            //message.sequence = ( message.sequence == null) ? 0 : message.sequence + 1;

            let retry = new tools.RetryPolicy( 3 );
            retry.onFailedAttempt( ( error ) => {
                logger.log( `Failed to send message request with chain ID: ${ message.chainID }`, logger.logSeverity.WARNING, error );
            } );
            retry.onRetry( ( attempt ) => {
                logger.log( `Retrying to send message response with chain ID: ${ message.chainID }. This is attempt ${ attempt }...`, logger.logSeverity.NOTICE );
            } );

            messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PENDING );

            retry.execute( this.#messageExchange, this.#messageExchange.sendMessageRequest, [ message ] ).then( () => {
                messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.DELIVERED, messageTracer.messageState.PENDING );
                resolve();
            } ).catch( ( error ) => {
                messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.FAILED, messageTracer.messageState.PENDING );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    sendMessageResponse( message ) {
        return new Promise( ( resolve, reject ) => {
            // update the instance ID so we can track which instance processed this request:
            //message.destination.instanceID = ServiceInstance.instanceID;

            let retry = new tools.RetryPolicy( 3 );
            retry.onFailedAttempt( ( error ) => {
                logger.log( `Failed to send message response with chain ID: ${ message.chainID }`, logger.logSeverity.WARNING, error );
            } );
            retry.onRetry( ( attempt ) => {
                logger.log( `Retrying to send message response with chain ID: ${ message.chainID }. This is attempt ${ attempt }...`, logger.logSeverity.NOTICE );
            } );

            messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PROCESSED );

            retry.execute( this.#messageExchange, this.#messageExchange.sendMessageResponse, [ message ] ).then( () => {
                messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.DELIVERED, messageTracer.messageState.PROCESSED );
                resolve();
            } ).catch( ( error ) => {
                messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.FAILED, messageTracer.messageState.PROCESSED );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    addMessageObserverRequestsIn( messageObserver ) {
        this.#messageExchange.addMessageObserverRequestsIn( messageObserver );
    }

    addMessageObserverResponsesIn( messageObserver ) {
        this.#messageExchange.addMessageObserverResponsesIn( messageObserver );
    }

    /**
     * Used to initialize the dispatcher for {@link ServiceProvider} behavior.
     * <p>
     * NOTE: By default this is called by the {@link ServiceProvider} class upon starting.
     *
     * @param processServiceRequest A method that will be used to process incoming service requests.
     */
    addMessageRequestListener( processServiceRequest ) {
        // messageExchange.setAsServiceProvider((ServiceCall serviceCall) -> {
        //     MessageTracer.recordTraceEntry(serviceCall, MessageType.SERVICE_CALL_REQUEST, DispatchEvent.MSG_RECEIVED, MessageState.PENDING);
        //     increaseServiceCallsCount();
        //     processServiceRequest.accept(serviceCall);
        // });
    }

    /**
     * Used to initialize the dispatcher for {@link ServiceConsumer} behavior.
     * <p>
     * NOTE: By default this is called by the {@link ServiceConsumer} class upon starting.
     */
    configureServiceConsumer() {
        // messageExchange.setAsServiceConsumer((ServiceCall serviceCall) -> {
        //     completeServiceCall(serviceCall);
        //     MessageTracer.recordTraceEntry(serviceCall, MessageType.SERVICE_CALL_RESPONSE, DispatchEvent.MSG_RECEIVED, MessageState.PROCESSED);
        // });
    }

}

const instance = new MessageDispatcher();
module.exports = Object.freeze( instance );
