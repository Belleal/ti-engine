export = ConfigChangeNotifier;
export type ConfigChangeEvent = {
    changeSetID: string;
    /**
     * The configuration documents affected by the change.
     */
    configKeys: string[];
    /**
     * Who committed the change.
     */
    adminID: string;
    /**
     * ISO timestamp.
     */
    timestamp: string;
};
/**
 * @typedef {Object} ConfigChangeEvent
 * @property {string} changeSetID
 * @property {string[]} configKeys The configuration documents affected by the change.
 * @property {string} adminID Who committed the change.
 * @property {string} timestamp ISO timestamp.
 */
declare const CONFIG_CHANGED = "config:changed";
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
declare class ConfigChangeNotifier {
    #private;
    constructor();
    /**
     * Publishes a configuration-change event to all subscribers. Fire-and-forget; delivery is asynchronous.
     *
     * @method
     * @param {ConfigChangeEvent} event
     * @returns {ConfigChangeEvent} The (frozen) event that will be delivered.
     * @public
     */
    publish(event: ConfigChangeEvent): ConfigChangeEvent;
    /**
     * Subscribes a listener to configuration-change events.
     *
     * @method
     * @param {(event: ConfigChangeEvent) => void} listener
     * @returns {() => void} An unsubscribe function.
     * @public
     */
    subscribe(listener: (event: ConfigChangeEvent) => void): () => void;
    /**
     * @method
     * @returns {number} The current number of subscribers.
     * @public
     */
    subscriberCount(): number;
}
declare namespace ConfigChangeNotifier {
    export { instance };
    export { CONFIG_CHANGED };
}
declare const instance: ConfigChangeNotifier;
