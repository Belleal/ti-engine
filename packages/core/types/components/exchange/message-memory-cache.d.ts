export declare var create: (identifier: string) => MessageMemoryCache;
import type ConnectionObserver from "#connection-observer";
import type { Message } from "#definitions";
/** @import ConnectionObserver from "#connection-observer" */
/** @import { Message } from "#definitions" */
/**
 * Used to create a Redis Cache client wrapped in a specialized message memory cache interface.
 *
 * @class MessageMemoryCache
 * @public
 */
declare class MessageMemoryCache {
    #private;
    /**
     * @constructor
     * @param {string} identifier The connection identifier for the Redis connection.
     * @returns {MessageMemoryCache}
     */
    constructor(identifier: string);
    /**
     * Used to initialize the cache service.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize(): Promise<any>;
    /**
     * Used to gracefully shut down the cache service.
     *
     * @method
     * @param {number} [timeoutMs]
     * @returns {Promise}
     * @public
     */
    shutDown(timeoutMs?: number): Promise<any>;
    /**
     * Used to register a new {@link ConnectionObserver} for events related to the Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver(connectionObserver: ConnectionObserver): void;
    /**
     * Used to send a message to the specified route.
     *
     * @method
     * @param {Message} message The message to send.
     * @param {string} queue The destination queue for the message as recognized by the {@link MessageExchange} implementation.
     * @returns {Promise<number>} Will return the destination queue length after adding the current message to it.
     * @public
     */
    sendMessage(message: Message, queue: string): Promise<number>;
    /**
     * Used to store a message payload.
     *
     * @method
     * @param {Object} payload
     * @param {string} storeLocation
     * @returns {Promise<string>} Will return a unique ID of the storage location for the payload.
     * @public
     */
    storeMessagePayload(payload: Object, storeLocation: string): Promise<string>;
    /**
     * Used to receive a message from the specified queue.
     *
     * @method
     * @param {string} queue
     * @returns {Promise<Message>}
     * @public
     */
    receiveMessage(queue: string): Promise<Message>;
    /**
     * Used to retrieve a message payload by its store ID.
     *
     * @method
     * @param {Message} message
     * @param {string} storeLocation
     * @returns {Promise<Message>} Will return the message with its payload populated if such is found.
     * @public
     */
    retrieveMessagePayload(message: Message, storeLocation: string): Promise<Message>;
}
