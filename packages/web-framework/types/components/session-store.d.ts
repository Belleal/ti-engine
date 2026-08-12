export = SessionStore;
import session = require("express-session");
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
     * @param {TiSession} session
     * @param {function( (Error|TiException|null)= )} callback
     * @public
     */
    set(sessionID: string, session: TiSession, callback: Function): void;
    /**
     * Used to retrieve a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {function( (Error|TiException|null)=, (TiSession)= )} callback
     * @public
     */
    get(sessionID: string, callback: Function): void;
    /**
     * Used to remove a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {function( (Error|TiException|null)= )} callback
     * @public
     */
    destroy(sessionID: string, callback: Function): void;
    /**
     * Used to update the expiration time of a user session in the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {TiSession} session
     * @param {function( (Error|TiException|null)= )} callback
     * @public
     */
    touch(sessionID: string, session: TiSession, callback: Function): void;
}
