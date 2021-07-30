/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
 */

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
     * @returns {Promise<string>}
     * @public
     */
    sendRequest( message ) {
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
                resolve( message.messageID );
            } ).catch( ( error ) => {
                messageTracer.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.FAILED, messageTracer.messageState.PENDING );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    sendResponse( message ) {
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

    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message requests.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverRequestsIn( messageObserver ) {
        this.#messageExchange.addMessageObserverRequestsIn( messageObserver );
    }

    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message responses.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverResponsesIn( messageObserver ) {
        this.#messageExchange.addMessageObserverResponsesIn( messageObserver );
    }

}

const instance = new MessageDispatcher();
module.exports = Object.freeze( instance );
