/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2023 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const MessageExchange = require( "#message-exchange" );
const config = require( "#config" );
const exceptions = require( "#exceptions" );

/**
 * The default {@link MessageExchange} behavior for the Ti Engine using Redis for message exchange.
 *
 * @class DefaultMessageExchange
 * @extends MessageExchange
 * @public
 */
class DefaultMessageExchange extends MessageExchange {

    /**
     * @constructor
     * @param {string} instanceID The unique identifier of the microservice instance using the message exchange.
     * @param {string} serviceDomainName The domain name of the microservice using the message exchange.
     */
    constructor( instanceID, serviceDomainName ) {
        super( instanceID, serviceDomainName );
    }

    /* Public interface */

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
    enableMessaging( configureInbound, configureOutbound ) {
        return new Promise( ( resolve, reject ) => {
            const DefaultMessageSender = require( "#default-message-sender" );
            const DefaultMessageReceiver = require( "#default-message-receiver" );

            let handlersToEnable = [];
            if ( configureInbound ) {
                let messageResponsesOut = new DefaultMessageSender( MessageExchange.connectionNameResponsesOut );
                let receiveRequestsQueue = config.getSetting( config.setting.MESSAGE_EXCHANGE_QUEUE_PREFIX ) + MessageExchange.pendingQueue + this.serviceDomainName;
                let messageRequestsIn = new DefaultMessageReceiver( MessageExchange.connectionNameRequestsIn, receiveRequestsQueue );
                messageRequestsIn.addMessageObserver( this );
                this.configureInboundMessaging( messageRequestsIn, messageResponsesOut );
                handlersToEnable.push( this.messageResponsesOut.enable() );
                handlersToEnable.push( this.messageRequestsIn.enable() );
            }
            if ( configureOutbound ) {
                let messageRequestsOut = new DefaultMessageSender( MessageExchange.connectionNameRequestsOut );
                let receiveResponsesQueue = config.getSetting( config.setting.MESSAGE_EXCHANGE_QUEUE_PREFIX ) + MessageExchange.processedQueue + this.serviceDomainName + ":" + this.instanceID;
                let messageResponsesIn = new DefaultMessageReceiver( MessageExchange.connectionNameResponsesIn, receiveResponsesQueue );
                messageResponsesIn.addMessageObserver( this );
                this.configureOutboundMessaging( messageRequestsOut, messageResponsesIn );
                handlersToEnable.push( this.messageRequestsOut.enable() );
                handlersToEnable.push( this.messageResponsesIn.enable() );
            }

            Promise.all( handlersToEnable ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to gracefully shut down the message exchange.
     *
     * @method
     * @returns {Promise}
     * @override
     * @public
     */
    disableMessaging() {
        return new Promise( ( resolve, reject ) => {
            let handlersToDisable = [];
            if ( this.configuredInbound ) {
                handlersToDisable.push( this.messageResponsesOut.disable() );
                handlersToDisable.push( this.messageRequestsIn.disable() );
            }
            if ( this.configuredOutbound ) {
                handlersToDisable.push( this.messageRequestsOut.disable() );
                handlersToDisable.push( this.messageResponsesIn.disable() );
            }

            Promise.all( handlersToDisable ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to send a message request vie the specified route.
     *
     * @method
     * @param {Message} message The message request to send.
     * @returns {Promise}
     * @override
     * @public
     */
    sendMessageRequest( message ) {
        let sendQueue = config.getSetting( config.setting.MESSAGE_EXCHANGE_QUEUE_PREFIX ) + MessageExchange.pendingQueue + message.destination.route;
        return this.messageRequestsOut.send( message, sendQueue );
    }

    /**
     * Used to send a message response via the specified route.
     *
     * @method
     * @param {Message} message The message response to send.
     * @returns {Promise}
     * @override
     * @public
     */
    sendMessageResponse( message ) {
        let sendQueue = config.getSetting( config.setting.MESSAGE_EXCHANGE_QUEUE_PREFIX ) + MessageExchange.processedQueue + message.source.route + ":" + message.source.instanceID;
        return this.messageResponsesOut.send( message, sendQueue );
    }

}

module.exports = DefaultMessageExchange;
