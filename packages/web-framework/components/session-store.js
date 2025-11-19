/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const cache = require( "@ti-engine/core/cache" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const _ = require( "lodash" );
const session = require( "express-session" );

// The name of the session store in the cache:
const sessionStoreName = "ti:web:sessions";

/**
 * A session store for the web server using the standard 'cache' module of the ti-engine.
 * <br/>
 * NOTE: This implementation is compatible with the 'express-session' module.
 *
 * @class SessionStore
 * @public
 */
class SessionStore extends session.Store {

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
     * @param {Object} session
     * @param {function( (Error|Exception|null)= )} callback
     * @public
     */
    set( sessionID, session, callback ) {
        cache.instance.hashSetField( sessionStoreName, sessionID, session ).then( () => {
            let expire = ( session.cookie && _.isNumber( session.cookie.maxAge ) ) ? session.cookie.maxAge / 1000 : null;
            if ( expire ) {
                return cache.instance.expireValue( sessionID, expire, sessionStoreName );
            } else {
                callback();
            }
        } ).then( () => {
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
     * @param {function( (Error|Exception|null)=, (Object)= )} callback
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
     * @param {function( (Error|Exception|null)= )} callback
     * @public
     */
    destroy( sessionID, callback ) {
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
     * @param {Object} session
     * @param {function( (Error|Exception|null)= )} callback
     * @public
     */
    touch( sessionID, session, callback ) {
        let expire = ( session.cookie && _.isNumber( session.cookie.maxAge ) ) ? session.cookie.maxAge / 1000 : null;
        cache.instance.expireValue( sessionID, expire, sessionStoreName ).then( () => {
            callback();
        } ).catch( ( error ) => {
            logger.log( `Error while trying to refresh user session expiration in cache!`, logger.logSeverity.ERROR, error );
            callback( exceptions.raise( error ) );
        } );
    }

}

module.exports = SessionStore;