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
const tools = require( "@ti-engine/core/tools" );
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
const HELD_IN_DOUBT_MILLISECONDS = 2 * 60 * 1000;

/**
 * Beyond this many held sessions, the expired ones are dropped before another is held, and then the oldest, so a held
 * store never grows past it.
 *
 * @type {number}
 */
const HELD_SESSIONS_LIMIT = 10000;

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
class SessionStore extends session.Store {

    // When this process last wrote each session's expiry to the store, in epoch milliseconds.
    #expiryWrittenAt = new Map();
    // Whether this store holds the sessions it reads and writes.
    #isHeld = false;
    // The held sessions: their text as the store keeps it, and the instant, in epoch milliseconds, before which the
    // store's own copy cannot have expired.
    #held = new Map();
    // A token per session read in flight, so a read that a write overtook, or that was answered while one was in flight,
    // does not hold what it read.
    #reading = new Map();
    // The writes in flight per session, and the latest one's token. While two are in flight the store keeps whichever
    // lands last, so neither may hold what it wrote.
    #writing = new Map();
    // Sessions whose last write failed, until the instant, in epoch milliseconds, after which they may be held again.
    #inDoubtUntil = new Map();
    // When the held and in-doubt sessions that had lapsed were last dropped, in epoch milliseconds.
    #sweptAt = 0;

    /**
     * @constructor
     * @param {Object} [options]
     * @param {boolean} [options.held=false] Whether to hold the sessions in this process (see the class description).
     */
    constructor( options ) {
        super();
        this.#isHeld = ( _.get( options, "held" ) === true );
    }

    /**
     * Whether this store holds the sessions it reads and writes.
     *
     * @returns {boolean}
     * @public
     */
    get isHeld() {
        return this.#isHeld;
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
        // Serialized now, as the provider serializes what it sends: express-session hands over its live session, which
        // a later change on the same request must not carry into the copy before the store has it.
        let text = null;
        if ( this.#isHeld ) {
            try {
                text = String( tools.stringifyJSON( session ) );
            } catch ( error ) {
                // As the provider's own serialization fails an unheld write, to the callback and not out of `set`.
                logger.log( `Error while trying to store user session in cache!`, logger.logSeverity.ERROR, error );
                return callback( exceptions.raise( error ) );
            }
        }
        const expire = storeExpiryFor( session );
        const write = this.#startWrite( sessionID );
        const startedAt = Date.now();
        // A call that throws before it returns a promise is a failed write, as one that rejects is.
        Promise.resolve().then( () => cache.instance.hashSetField( sessionStoreName, sessionID, session ) ).then( () => {
            return ( expire ) ? cache.instance.expireValue( sessionID, expire, sessionStoreName ) : null;
        } ).then( () => {
            this.#rememberExpiryWrite( sessionID );
            if ( this.#endWrite( sessionID, write, true ) ) {
                this.#hold( sessionID, text, ( expire ) ? startedAt + expire * 1000 : Infinity );
            }
            callback();
        } ).catch( ( error ) => {
            this.#endWrite( sessionID, write, false );
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
        const held = ( this.#isHeld ) ? this.#held.get( sessionID ) : undefined;
        if ( held && Date.now() < held.expiresAt ) {
            // A copy of its own, parsed as a store read is: express-session copies the session's fields onto
            // `request.session` without cloning them, so a handler changing `session.user` in place would otherwise change
            // the held copy with no write. Answered on a later turn, as a store read and express-session's own
            // MemoryStore are.
            const session = tools.parseJSON( held.text );
            setImmediate( () => callback( null, session ) );
            return;
        }
        this.#held.delete( sessionID );
        const read = this.#startRead( sessionID );
        const startedAt = Date.now();
        cache.instance.hashGetField( sessionStoreName, sessionID ).then( ( session ) => {
            if ( this.#endRead( sessionID, read ) && session ) {
                // The read says nothing of when the store expires the session. One touch interval is the least it can
                // have left, since every expiry written carries that interval over the cookie's lifetime, and the touch
                // that ends this request moves the copy's expiry to the one it writes.
                this.#hold( sessionID, String( tools.stringifyJSON( session ) ), startedAt + TOUCH_INTERVAL_SECONDS * 1000 );
            }
            callback( null, session );
        } ).catch( ( error ) => {
            this.#endRead( sessionID, read );
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
        const write = this.#startWrite( sessionID );
        Promise.resolve().then( () => cache.instance.hashDeleteField( sessionStoreName, sessionID ) ).then( () => {
            this.#endWrite( sessionID, write, true );
            callback();
        } ).catch( ( error ) => {
            this.#endWrite( sessionID, write, false );
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
        const startedAt = Date.now();
        const heldAtStart = this.#held.get( sessionID );
        cache.instance.expireValue( sessionID, expire, sessionStoreName ).then( () => {
            this.#rememberExpiryWrite( sessionID );
            // Only the copy this touch found: one held since came from a later write, whose own expiry stands.
            if ( heldAtStart && this.#held.get( sessionID ) === heldAtStart ) {
                // The store counts the expiry from when it received the write, which is no earlier than this.
                heldAtStart.expiresAt = ( expire ) ? startedAt + expire * 1000 : Infinity;
            }
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

    /**
     * Marks the start of a read of a session.
     *
     * @method
     * @param {string} sessionID
     * @returns {Object|null} The read's token, for `#endRead`; null when the store holds nothing.
     */
    #startRead( sessionID ) {
        if ( !this.#isHeld ) {
            return null;
        }
        const read = {};
        this.#reading.set( sessionID, read );
        return read;
    }

    /**
     * Marks the end of a read of a session.
     *
     * @method
     * @param {string} sessionID
     * @param {Object|null} read The token `#startRead` returned.
     * @returns {boolean} Whether what the read got may be held: no write to the session started or ended since it began.
     */
    #endRead( sessionID, read ) {
        if ( !this.#isHeld || this.#reading.get( sessionID ) !== read ) {
            return false;
        }
        this.#reading.delete( sessionID );
        return this.#mayHold( sessionID );
    }

    /**
     * Marks the start of a write to a session: the copy is dropped, and a read in flight will not hold what it gets.
     *
     * @method
     * @param {string} sessionID
     * @returns {Object|null} The write's token, for `#endWrite`; null when the store holds nothing.
     */
    #startWrite( sessionID ) {
        if ( !this.#isHeld ) {
            return null;
        }
        const write = { ended: false };
        const writes = this.#writing.get( sessionID ) || { count: 0, latest: null };
        writes.count++;
        writes.latest = write;
        this.#writing.set( sessionID, writes );
        this.#reading.delete( sessionID );
        this.#held.delete( sessionID );
        return write;
    }

    /**
     * Marks the end of a write to a session, which a read still in flight may have been answered on either side of. A
     * failed one puts the session in doubt (see HELD_IN_DOUBT_MILLISECONDS). Ending a write twice, as a callback that
     * throws after the success path has run would, ends it once.
     *
     * @method
     * @param {string} sessionID
     * @param {Object|null} write The token `#startWrite` returned.
     * @param {boolean} succeeded
     * @returns {boolean} Whether this write may hold what it wrote: it succeeded, it was the session's latest, and no
     *     other write to the session is still in flight.
     */
    #endWrite( sessionID, write, succeeded ) {
        if ( !this.#isHeld || write.ended ) {
            return false;
        }
        write.ended = true;
        this.#reading.delete( sessionID );
        if ( !succeeded ) {
            this.#inDoubtUntil.set( sessionID, Date.now() + HELD_IN_DOUBT_MILLISECONDS );
            this.#sweepLapsed( this.#inDoubtUntil.size );
        }
        const writes = this.#writing.get( sessionID );
        writes.count--;
        if ( writes.count > 0 ) {
            return false;
        }
        this.#writing.delete( sessionID );
        return succeeded && writes.latest === write && this.#mayHold( sessionID );
    }

    /**
     * Whether a session may be held now: the store holds sessions, no write to this one is in flight, and its last
     * failed write is long enough ago.
     *
     * @method
     * @param {string} sessionID
     * @returns {boolean}
     */
    #mayHold( sessionID ) {
        if ( !this.#isHeld || this.#writing.has( sessionID ) ) {
            return false;
        }
        const inDoubtUntil = this.#inDoubtUntil.get( sessionID );
        if ( inDoubtUntil !== undefined ) {
            if ( Date.now() < inDoubtUntil ) {
                return false;
            }
            this.#inDoubtUntil.delete( sessionID );
        }
        return true;
    }

    /**
     * Drops the held sessions that have lapsed and the doubts that are over, when `size` has reached the limit, and no
     * more than once per touch interval: at the limit with nothing lapsed, every new session would otherwise scan them
     * all.
     *
     * @method
     * @param {number} size How many entries the map being grown holds.
     */
    #sweepLapsed( size ) {
        const now = Date.now();
        if ( size < HELD_SESSIONS_LIMIT || ( now - this.#sweptAt ) < TOUCH_INTERVAL_SECONDS * 1000 ) {
            return;
        }
        this.#sweptAt = now;
        for ( const [ knownID, held ] of this.#held ) {
            if ( now >= held.expiresAt ) {
                this.#held.delete( knownID );
            }
        }
        for ( const [ knownID, untilAt ] of this.#inDoubtUntil ) {
            if ( now >= untilAt ) {
                this.#inDoubtUntil.delete( knownID );
            }
        }
    }

    /**
     * Holds a session, as the text the store keeps, making room first when the limit is reached.
     *
     * @method
     * @param {string} sessionID
     * @param {string} text The session as it was sent to or read from the store.
     * @param {number} expiresAt Epoch milliseconds before which the store's own copy cannot have expired.
     */
    #hold( sessionID, text, expiresAt ) {
        this.#held.delete( sessionID );
        this.#sweepLapsed( this.#held.size );
        if ( this.#held.size >= HELD_SESSIONS_LIMIT ) {
            // Insertion order is the order they were held in, so the first is the one held longest ago.
            this.#held.delete( this.#held.keys().next().value );
        }
        this.#held.set( sessionID, { text: text, expiresAt: expiresAt } );
    }

}

SessionStore.TOUCH_INTERVAL_SECONDS = TOUCH_INTERVAL_SECONDS;
SessionStore.HELD_IN_DOUBT_MILLISECONDS = HELD_IN_DOUBT_MILLISECONDS;
SessionStore.HELD_SESSIONS_LIMIT = HELD_SESSIONS_LIMIT;

module.exports = SessionStore;