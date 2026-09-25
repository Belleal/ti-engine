export = SessionStore;
import session = require("express-session");
import type { SessionData } from "express-session";
import type { TiException } from "@ti-engine/core/exceptions";
/**
 * How long, in seconds, a session's expiry written to the store stands before another request refreshes it.
 * <br/>
 * express-session calls `touch` on every request of a rolling session and waits for it before ending the response, so
 * unthrottled, each screen switch paid a store write per request before its first byte. Every expiry this store writes
 * carries this interval as slack on top of the cookie's `maxAge`, so skipping a touch inside it never lets the store
 * expire a session its cookie still vouches for: written at t0 it lasts until t0 + maxAge + interval, and the cookie a
 * later request re-stamps at t1 lasts until t1 + maxAge, with t1 - t0 below the interval whenever the write is skipped.
 *
 * @type {number}
 */
declare const TOUCH_INTERVAL_SECONDS: number;
/**
 * A session store for the web server using the standard 'cache' module of the ti-engine.
 * <br/>
 * NOTE: This implementation is compatible with the 'express-session' module.
 *
 * @class SessionStore
 * @public
 */
declare class SessionStore extends session.Store {
    #private;
    /**
     * @constructor
     */
    constructor();
    /**
     * Used to store a user session in the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {SessionData} session
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    set(sessionID: string, session: SessionData, callback: (error?: Error | TiException | null) => void): void;
    /**
     * Used to retrieve a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {(error?: Error|TiException|null, session?: SessionData|null) => void} callback
     * @public
     */
    get(sessionID: string, callback: (error?: Error | TiException | null, session?: SessionData | null) => void): void;
    /**
     * Used to remove a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    destroy(sessionID: string, callback: (error?: Error | TiException | null) => void): void;
    /**
     * Used to update the expiration time of a user session in the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {SessionData} session
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    touch(sessionID: string, session: SessionData, callback: (error?: Error | TiException | null) => void): void;
}
declare namespace SessionStore {
    export { TOUCH_INTERVAL_SECONDS };
}
