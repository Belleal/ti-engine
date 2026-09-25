/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
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

const cache = require( "@ti-engine/core/cache" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const _ = require( "lodash" );
const session = require( "express-session" );

/** @import { SessionData } from "express-session" */
/** @import { TiException } from "@ti-engine/core/exceptions" */

// The name of the session store in the cache:
const sessionStoreName = "ti:web:sessions";

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
const TOUCH_INTERVAL_SECONDS = 60;

/**
 * Beyond this many remembered sessions, entries whose interval has passed are dropped before another is added. They
 * carry no information once it has: the next touch writes regardless.
 *
 * @type {number}
 */
const TOUCH_MEMORY_SWEEP_THRESHOLD = 10000;

/**
 * Converts a session cookie's remaining lifetime into the expiry, in seconds, the store keeps the session for.
 *
 * @param {SessionData} session
 * @returns {number|null} Null when the cookie has no lifetime (a browser-session cookie), which the store keeps forever.
 */
function storeExpiryFor( session ) {
    return ( session && session.cookie && _.isNumber( session.cookie.maxAge ) ) ? Math.ceil( session.cookie.maxAge / 1000 ) + TOUCH_INTERVAL_SECONDS : null;
}

/**
 * A session store for the web server using the standard 'cache' module of the ti-engine.
 * <br/>
 * NOTE: This implementation is compatible with the 'express-session' module.
 *
 * @class SessionStore
 * @public
 */
class SessionStore extends session.Store {

    // When this process last wrote each session's expiry to the store, in epoch milliseconds.
    #expiryWrittenAt = new Map();

    /**
     * @constructor
     */
    constructor() {
        super();
    }

    /**
     * Used to store a user session in the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {SessionData} session
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    set( sessionID, session, callback ) {
        cache.instance.hashSetField( sessionStoreName, sessionID, session ).then( () => {
            let expire = storeExpiryFor( session );
            return ( expire ) ? cache.instance.expireValue( sessionID, expire, sessionStoreName ) : null;
        } ).then( () => {
            this.#rememberExpiryWrite( sessionID );
            callback();
        } ).catch( ( error ) => {
            logger.log( `Error while trying to store user session in cache!`, logger.logSeverity.ERROR, error );
            callback( exceptions.raise( error ) );
        } );
    }

    /**
     * Used to retrieve a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {(error?: Error|TiException|null, session?: SessionData|null) => void} callback
     * @public
     */
    get( sessionID, callback ) {
        cache.instance.hashGetField( sessionStoreName, sessionID ).then( ( session ) => {
            callback( null, session );
        } ).catch( ( error ) => {
            logger.log( `Error while trying to fetch user session from cache!`, logger.logSeverity.ERROR, error );
            callback( exceptions.raise( error ) );
        } );
    }

    /**
     * Used to remove a user session from the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    destroy( sessionID, callback ) {
        this.#expiryWrittenAt.delete( sessionID );
        cache.instance.hashDeleteField( sessionStoreName, sessionID ).then( () => {
            callback();
        } ).catch( ( error ) => {
            logger.log( `Error while trying to remove user session from cache!`, logger.logSeverity.ERROR, error );
            callback( exceptions.raise( error ) );
        } );
    }

    /**
     * Used to update the expiration time of a user session in the cache.
     *
     * @method
     * @param {string} sessionID
     * @param {SessionData} session
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    touch( sessionID, session, callback ) {
        const writtenAt = this.#expiryWrittenAt.get( sessionID );
        if ( writtenAt !== undefined && ( Date.now() - writtenAt ) < TOUCH_INTERVAL_SECONDS * 1000 ) {
            // The expiry written moments ago still outlasts the cookie this response re-stamps (see
            // TOUCH_INTERVAL_SECONDS), so this write would change nothing but the response's latency.
            return callback();
        }
        let expire = storeExpiryFor( session );
        cache.instance.expireValue( sessionID, expire, sessionStoreName ).then( () => {
            this.#rememberExpiryWrite( sessionID );
            callback();
        } ).catch( ( error ) => {
            logger.log( `Error while trying to refresh user session expiration in cache!`, logger.logSeverity.ERROR, error );
            callback( exceptions.raise( error ) );
        } );
    }

    /**
     * Records that this process has just written a session's expiry, dropping remembered writes whose interval has
     * passed once there are many of them.
     *
     * @method
     * @param {string} sessionID
     */
    #rememberExpiryWrite( sessionID ) {
        const now = Date.now();
        if ( this.#expiryWrittenAt.size >= TOUCH_MEMORY_SWEEP_THRESHOLD ) {
            for ( const [ knownID, writtenAt ] of this.#expiryWrittenAt ) {
                if ( ( now - writtenAt ) >= TOUCH_INTERVAL_SECONDS * 1000 ) {
                    this.#expiryWrittenAt.delete( knownID );
                }
            }
        }
        this.#expiryWrittenAt.set( sessionID, now );
    }

}

SessionStore.TOUCH_INTERVAL_SECONDS = TOUCH_INTERVAL_SECONDS;

module.exports = SessionStore;