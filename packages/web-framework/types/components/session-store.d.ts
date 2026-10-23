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
 * How long, in milliseconds, a held store reads a session from the store and keeps no copy of it after a write to it
 * failed.
 * <br/>
 * A write that timed out may still be applied (core 1.20.1 never sends one twice for that reason). A copy taken from a
 * read made before it lands would keep the session as it was, after the store has changed it or deleted it: a sign-out
 * that timed out and landed late would leave the session signed in on this process. Two minutes is the window the
 * application's held records use for the same doubt.
 *
 * @type {number}
 */
declare const HELD_IN_DOUBT_MILLISECONDS: number;
/**
 * Beyond this many held sessions, the expired ones are dropped before another is held, and then the oldest, so a held
 * store never grows past it.
 *
 * @type {number}
 */
declare const HELD_SESSIONS_LIMIT: number;
/**
 * A session store for the web server using the standard 'cache' module of the ti-engine.
 * <br/>
 * NOTE: This implementation is compatible with the 'express-session' module.
 * <br/>
 * **Held** (`sessions.held`, CA-557), the store keeps a copy of every session this process reads or writes, and answers
 * a read from it: express-session reads the session on every request that reaches it, so unheld, each request paid one
 * store round trip before any handler ran. Every write still goes to the store first, and the copy changes only once the
 * write has landed. The copy is sound only while this process is the one serving the sessions in its store: a session
 * another process changes or signs out is not seen here.
 *
 * @class SessionStore
 * @public
 */
declare class SessionStore extends session.Store {
    #private;
    /**
     * @constructor
     * @param {Object} [options]
     * @param {boolean} [options.held=false] Whether to hold the sessions in this process (see the class description).
     */
    constructor(options?: {
        held?: boolean;
    });
    /**
     * Whether this store holds the sessions it reads and writes.
     *
     * @returns {boolean}
     * @public
     */
    get isHeld(): boolean;
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
    export { HELD_IN_DOUBT_MILLISECONDS };
    export { HELD_SESSIONS_LIMIT };
}
