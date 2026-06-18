/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { EventEmitter } = require( "node:events" );
const logger = require( "@ti-engine/core/logger" );

/**
 * @typedef {Object} ConfigChangeEvent
 * @property {string} changeSetID
 * @property {string[]} configKeys The configuration documents affected by the change.
 * @property {string} adminID Who committed the change.
 * @property {string} timestamp ISO timestamp.
 */

const CONFIG_CHANGED = "config:changed";

/**
 * Notifies subscribers that configuration changed, so they can react (e.g. invalidate an in-memory cache, or push a
 * live update to an admin UI). This is the **in-process** implementation of a deliberately transport-agnostic
 * contract — `publish(event)` (fire-and-forget) and `subscribe(listener) → unsubscribe`.
 *
 * **Designed for an eventual switch to a reusable core pub/sub.** Cross-instance propagation is out of scope for v1
 * (the store-backed model already makes a committed change visible to every instance via the shared Redis cache;
 * this emitter exists to invalidate optional *in-memory* caches and drive live UI within a process). When a Redis
 * (or other) pub/sub primitive lands in `@ti-engine/core`, a drop-in implementation of this same contract can be
 * provided and injected into {@link ConfigService} — no change to publishers or subscribers. To keep that swap
 * behavior-safe, **delivery here is already asynchronous** (matching cross-instance transports); subscribers must
 * not assume synchronous delivery, and the event payload is plain serializable JSON so it survives a wire transport.
 *
 * @class ConfigChangeNotifier
 * @public
 */
class ConfigChangeNotifier {

    #emitter = new EventEmitter();

    constructor() {
        this.#emitter.setMaxListeners( 0 );
    }

    /**
     * Publishes a configuration-change event to all subscribers. Fire-and-forget; delivery is asynchronous.
     *
     * @method
     * @param {ConfigChangeEvent} event
     * @returns {ConfigChangeEvent} The (frozen) event that will be delivered.
     * @public
     */
    publish( event ) {
        const payload = Object.freeze( { ...event } );
        setImmediate( () => {
            for ( const listener of this.#emitter.listeners( CONFIG_CHANGED ) ) {
                try {
                    listener( payload );
                } catch ( error ) {
                    // A misbehaving subscriber must not break delivery to the others or crash the process.
                    logger.log( `Config-change subscriber threw: ${ error && error.message ? error.message : error }`, logger.logSeverity.WARNING );
                }
            }
        } );
        return payload;
    }

    /**
     * Subscribes a listener to configuration-change events.
     *
     * @method
     * @param {function(ConfigChangeEvent): void} listener
     * @returns {function(): void} An unsubscribe function.
     * @public
     */
    subscribe( listener ) {
        this.#emitter.on( CONFIG_CHANGED, listener );
        return () => {
            this.#emitter.off( CONFIG_CHANGED, listener );
        };
    }

    /**
     * @method
     * @returns {number} The current number of subscribers.
     * @public
     */
    subscriberCount() {
        return this.#emitter.listenerCount( CONFIG_CHANGED );
    }

}

const instance = new ConfigChangeNotifier();
module.exports = ConfigChangeNotifier;
module.exports.instance = instance;
module.exports.CONFIG_CHANGED = CONFIG_CHANGED;
