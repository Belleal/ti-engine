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
     * @param {SessionData} session
     * @param {(error?: Error|TiException|null) => void} callback
     * @public
     */
    set( sessionID, session, callback ) {
        cache.instance.hashSetField( sessionStoreName, sessionID, session ).then( () => {
            let expire = ( session.cookie && _.isNumber( session.cookie.maxAge ) ) ? session.cookie.maxAge / 1000 : null;
            return ( expire ) ? cache.instance.expireValue( sessionID, expire, sessionStoreName ) : null;
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