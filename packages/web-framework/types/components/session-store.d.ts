export = SessionStore;
import session = require("express-session");
import type { SessionData } from "express-session";
import type { TiException } from "@ti-engine/core/exceptions";
/**
 * A session store for the web server using the standard 'cache' module of the ti-engine.
 * <br/>
 * NOTE: This implementation is compatible with the 'express-session' module.
 *
 * @class SessionStore
 * @public
 */
declare class SessionStore extends session.Store {
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
