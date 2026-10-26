/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
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

const _ = require( "lodash" );
const tools = require( "#tools" );
const config = require( "#config" );
const logger = require( "#logger" );
const exceptions = require( "#exceptions" );
const cache = require( "#cache" );

/*
 * The roster of a service domain's running provider instances (CA-560).
 *
 * The service catalog says which aliases a domain has ever offered: a provider adds them when it starts and nothing
 * takes them out, because the set is shared by every instance of the domain and the cache contract has no atomic way
 * to know which one is the last. So the catalog alone cannot say whether anybody is still there to answer, and a call
 * to a domain whose instances have all gone used to wait out the whole executionTimeout. The roster answers that.
 *
 * It is one hash per domain. Each provider instance holds a field under its instance ID, and the hash also holds a
 * marker that no instance ID can collide with (they all begin with "ti-"):
 *
 *   ti:services:registry:instances:<domain>   ~roster        true
 *                                             ti-<uuid>      { heartbeat: false|true, startedOn }
 *
 * - An instance joins once it can receive requests and leaves on a clean stop, so a clean stop is seen at once.
 * - Its record says `heartbeat: true` only when its built-in heartbeat was written before it joined, and is rewritten
 *   on every beat after that; a record whose heartbeat key has expired belongs to an instance that died, so a crash is
 *   seen within the heartbeat's expiry. A record that does not say so - the heartbeat switched off, or `reportHealthy`
 *   overridden without the built-in write - cannot be watched and counts as running while it is there, which is how
 *   every instance counted before.
 * - The marker is what keeps "no roster" apart from "nobody left". Providers older than 1.21.0 keep no roster, so a
 *   domain without one is called as before, on the catalog alone. A domain that has one keeps the marker for good,
 *   and an instance that leaves writes it again before removing itself, so the hash never empties into looking old.
 */

/**
 * The roster field that marks a domain's roster as kept, and is never removed.
 *
 * @type {string}
 * @private
 */
const ROSTER_MARKER = "~roster";

/**
 * Whether this process has already warned that its cache backend cannot read a roster.
 *
 * @type {boolean}
 * @private
 */
let isUnreadableReported = false;

/**
 * Used to get the cache key of a domain's roster.
 *
 * @method
 * @param {string} domain
 * @returns {string}
 * @private
 */
function rosterKey( domain ) {
    return config.getSetting( config.setting.SERVICE_INSTANCES_ADDRESS ) + domain;
}

/**
 * Used to get the prefix that an instance ID completes into that instance's heartbeat key - the key
 * {@link ServiceInstance#reportHealthy} writes.
 *
 * @method
 * @param {string} domain
 * @returns {string}
 * @private
 */
function heartbeatPrefix( domain ) {
    return config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ADDRESS ) + domain + ":";
}

/**
 * Used to list the instance IDs a roster records, without its marker.
 *
 * @method
 * @param {Object} roster
 * @returns {string[]}
 * @private
 */
function recordedInstances( roster ) {
    return _.filter( Object.keys( roster ), ( instanceID ) => instanceID !== ROSTER_MARKER );
}

/**
 * Used to tell whether a record can be watched through its instance's heartbeat.
 *
 * @method
 * @param {*} record
 * @returns {boolean}
 * @private
 */
function isWatched( record ) {
    return _.isObjectLike( record ) && record.heartbeat === true;
}

/**
 * Used to find which of the given instances has a heartbeat key that has not expired.
 *
 * @method
 * @param {string} domain
 * @param {string[]} instanceIDs
 * @returns {Promise<string[]>}
 * @private
 */
function withLiveHeartbeat( domain, instanceIDs ) {
    return new Promise( ( resolve, reject ) => {
        if ( instanceIDs.length === 0 ) {
            resolve( [] );
            return;
        }
        cache.instance.getValues( instanceIDs, heartbeatPrefix( domain ) ).then( ( heartbeats ) => {
            resolve( _.filter( instanceIDs, ( instanceID ) => heartbeats[ instanceID ] !== null && heartbeats[ instanceID ] !== undefined ) );
        } ).catch( ( error ) => {
            reject( exceptions.raise( error ) );
        } );
    } );
}

/**
 * Used to drop the records of instances that died without a clean stop: the watched ones whose heartbeat has expired.
 * <br/>
 * NOTE: Safe against an instance that is starting at the same moment, because a record says `heartbeat: true` only
 * after that instance's heartbeat key has been written, so a record read as watched has a heartbeat to find unless the
 * instance has stopped beating. One that stopped only for a while - a long pause, a lost connection - is put back by
 * its next beat, which rewrites the record whole.
 *
 * @method
 * @param {string} domain
 * @returns {Promise}
 * @private
 */
function prune( domain ) {
    return new Promise( ( resolve, reject ) => {
        let watched = [];
        cache.instance.hashGetAll( rosterKey( domain ) ).then( ( roster ) => {
            watched = _.filter( recordedInstances( roster ), ( instanceID ) => isWatched( roster[ instanceID ] ) );
            return withLiveHeartbeat( domain, watched );
        } ).then( ( live ) => {
            let dead = _.difference( watched, live );
            return tools.whenAllSettled( _.map( dead, ( instanceID ) => cache.instance.hashDeleteField( rosterKey( domain ), instanceID ) ) );
        } ).then( () => {
            resolve();
        } ).catch( ( error ) => {
            reject( exceptions.raise( error ) );
        } );
    } );
}

/**
 * Used to record an instance in its domain's roster as it starts receiving requests, after dropping the records of
 * instances that died since the last one started.
 * <br/>
 * NOTE: `isWatched` is true only when the instance's built-in heartbeat has just been written: a record must never say
 * there is a heartbeat to watch before there is one, or {@link prune} could drop a live instance. The marker is written
 * after the record, so that a caller never finds a kept roster with nobody in it while the first instance is joining.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @param {string} startedOn ISO timestamp of the instance's start.
 * @param {boolean} isWatched Whether the instance writes the built-in heartbeat a caller can watch.
 * @returns {Promise}
 * @public
 */
function join( domain, instanceID, startedOn, isWatched ) {
    return new Promise( ( resolve, reject ) => {
        prune( domain ).catch( ( error ) => {
            // Left for the next instance to start: a stale record costs a heartbeat lookup per call, not a wrong answer.
            logger.log( `Could not drop the records of stopped instances from the roster of '${ domain }'.`, logger.logSeverity.WARNING, error );
        } ).then( () => {
            return cache.instance.hashSetField( rosterKey( domain ), instanceID, { heartbeat: isWatched === true, startedOn: startedOn } );
        } ).then( () => {
            return cache.instance.hashSetField( rosterKey( domain ), ROSTER_MARKER, true );
        } ).then( () => {
            resolve();
        } ).catch( ( error ) => {
            reject( exceptions.raise( error ) );
        } );
    } );
}

/**
 * Used to mark an instance's record as watched by its heartbeat, after a heartbeat write has succeeded.
 * <br/>
 * NOTE: Called on every beat, not once. The record is rewritten whole, so one that {@link prune} dropped while the
 * heartbeat had lapsed comes back within a beat of the heartbeat itself.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @param {string} startedOn ISO timestamp of the instance's start.
 * @returns {Promise}
 * @public
 */
function confirm( domain, instanceID, startedOn ) {
    return cache.instance.hashSetField( rosterKey( domain ), instanceID, { heartbeat: true, startedOn: startedOn } );
}

/**
 * Used to remove an instance from its domain's roster on a clean stop.
 * <br/>
 * NOTE: The marker is written first. A roster whose last record is removed would otherwise stop existing, and a
 * domain without a roster is called as if its providers predated rosters - which is exactly the hang this prevents.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @returns {Promise}
 * @public
 */
function leave( domain, instanceID ) {
    return new Promise( ( resolve, reject ) => {
        cache.instance.hashSetField( rosterKey( domain ), ROSTER_MARKER, true ).then( () => {
            return cache.instance.hashDeleteField( rosterKey( domain ), instanceID );
        } ).then( () => {
            resolve();
        } ).catch( ( error ) => {
            reject( exceptions.raise( error ) );
        } );
    } );
}

/**
 * Used to decide whether a domain has a running instance to answer a call.
 * <br/>
 * NOTE: It has one when its providers keep no roster (they predate 1.21.0, and the catalog is all there is to go on),
 * when any record cannot be watched, or when any watched record's heartbeat has not expired. A kept roster with no
 * record, or with only records whose heartbeat has expired, has none. A cache backend without
 * {@link CacheProvider#hashGetAll} cannot read the roster, and every domain counts as having one, as before 1.21.0.
 *
 * @method
 * @param {string} domain
 * @returns {Promise<boolean>}
 * @public
 */
function isLive( domain ) {
    return new Promise( ( resolve, reject ) => {
        cache.instance.hashGetAll( rosterKey( domain ) ).then( ( roster ) => {
            let instanceIDs = recordedInstances( roster );
            if ( Object.keys( roster ).length === 0 || _.some( instanceIDs, ( instanceID ) => !isWatched( roster[ instanceID ] ) ) ) {
                return true;
            }
            return withLiveHeartbeat( domain, instanceIDs ).then( ( live ) => {
                return live.length > 0;
            } );
        } ).then( ( isLive ) => {
            resolve( isLive );
        } ).catch( ( error ) => {
            // A cache backend written for an earlier contract cannot list a hash. Its callers are left as they were, on
            // the catalog alone, instead of being refused every call by a minor release.
            if ( error.code === exceptions.exceptionCode.E_GEN_ABSTRACT_METHOD_CALL ) {
                if ( isUnreadableReported === false ) {
                    isUnreadableReported = true;
                    logger.log( `The cache backend cannot read the roster of running instances, so service calls are checked against the catalog alone, and a call to a stopped service waits out the execution timeout.`, logger.logSeverity.WARNING, error );
                }
                resolve( true );
            } else {
                reject( exceptions.raise( error ) );
            }
        } );
    } );
}

module.exports = {
    join,
    confirm,
    leave,
    isLive
};
