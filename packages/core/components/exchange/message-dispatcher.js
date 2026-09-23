/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const tools = require( "#tools" );
const exceptions = require( "#exceptions" );
const logger = require( "#logger" );
const messageTracer = require( "#message-tracer" );

/** @import { Message } from "#definitions" */
/** @import MessageExchange from "#message-exchange" */
/** @import MessageObserver from "#message-observer" */

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
     * @param {boolean} configureInbound If set to 'true' it tells the message exchange to set up inbound messaging.
     * @param {boolean} configureOutbound If set to 'true' it tells the message exchange to set up outbound messaging.
     * @returns {Promise}
     * @public
     */
    initialize( messageExchange, configureInbound, configureOutbound ) {
        return new Promise( ( resolve, reject ) => {
            this.#messageExchange = messageExchange;

            // Initialize the message tracer before enabling the message exchange:
            messageTracer.instance.initialize().then( () => {
                return this.#messageExchange.enableMessaging( configureInbound, configureOutbound );
            } ).then( () => {
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
            this.#requireExchange();
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
            this.#requireExchange();
            let retry = new tools.RetryPolicy( 3 );
            retry.onFailedAttempt( ( error ) => {
                logger.log( `Failed to send message request with chain ID: ${ message.chainID }`, logger.logSeverity.WARNING, error );
            } );
            retry.onRetry( ( attempt, error ) => {
                logger.log( `Retrying to send message response with chain ID: ${ message.chainID }. This is attempt ${ attempt }...`, logger.logSeverity.NOTICE, ( error ) ? { error: tools.errorToJSON( error ) } : undefined );
            } );

            messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PENDING );

            retry.execute( this.#messageExchange, this.#messageExchange.sendMessageRequest, [ message ] ).then( () => {
                messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.DELIVERED, messageTracer.messageState.PENDING );
                resolve( message.messageID );
            } ).catch( ( error ) => {
                messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_REQUEST, messageTracer.dispatchEvent.FAILED, messageTracer.messageState.PENDING );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to send a message response via the message exchange system.
     *
     * @method
     * @param {Message} message The message to send. This can also be a subclass of {@link Message}.
     * @returns {Promise}
     * @public
     */
    sendResponse( message ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireExchange();
            let retry = new tools.RetryPolicy( 3 );
            retry.onFailedAttempt( ( error ) => {
                logger.log( `Failed to send message response with chain ID: ${ message.chainID }`, logger.logSeverity.WARNING, error );
            } );
            retry.onRetry( ( attempt, error ) => {
                logger.log( `Retrying to send message response with chain ID: ${ message.chainID }. This is attempt ${ attempt }...`, logger.logSeverity.NOTICE, ( error ) ? { error: tools.errorToJSON( error ) } : undefined );
            } );

            messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.SENT, messageTracer.messageState.PROCESSED );

            retry.execute( this.#messageExchange, this.#messageExchange.sendMessageResponse, [ message ] ).then( () => {
                messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.DELIVERED, messageTracer.messageState.PROCESSED );
                resolve();
            } ).catch( ( error ) => {
                messageTracer.instance.recordTraceEntry( message, messageTracer.messageType.MESSAGE_RESPONSE, messageTracer.dispatchEvent.FAILED, messageTracer.messageState.PROCESSED );
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Refuses to proceed when there is no exchange to dispatch through.
     * <br/>
     * NOTE: Without this, every method here dereferences an undefined exchange and fails with a raw TypeError -
     * "Cannot read properties of undefined (reading 'addMessageObserverResponsesIn')" - which names the symptom and
     * hides the cause. There are two causes and the message names both: the dispatcher is used before
     * {@link MessageDispatcher#initialize} ran, or the exchange is switched off by `messageExchange.enabled` and a
     * caller did not check. The second is what shipped in 1.14.0: every web server crashed at boot with the exchange
     * disabled, because `ServiceConsumer` registered its observer unconditionally.
     *
     * @method
     * @throws {TiException.E_GEN_NOT_INITIALIZED} If there is no exchange.
     */
    #requireExchange() {
        if ( !this.#messageExchange ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_NOT_INITIALIZED, {
                details: "The message dispatcher has no exchange: it is used before initialize() ran, or the message exchange is disabled (messageExchange.enabled / TI_MESSAGE_EXCHANGE_ENABLED) and the caller did not check."
            } );
        }
    }

    /**
     * Used to add an additional {@link MessageObserver} to the connection for the incoming message requests.
     *
     * @method
     * @param {MessageObserver} messageObserver
     * @public
     */
    addMessageObserverRequestsIn( messageObserver ) {
        this.#requireExchange();
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
        this.#requireExchange();
        this.#messageExchange.addMessageObserverResponsesIn( messageObserver );
    }

}

const instance = new MessageDispatcher();
module.exports.instance = Object.freeze( instance );