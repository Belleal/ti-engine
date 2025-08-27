/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const ConnectionObserver = require( "#connection-observer" );
const _ = require( "lodash" );
const config = require( "#config" );
const tools = require( "#tools" );
const redis = require( "#redis-integration" );
const exceptions = require( "#exceptions" );

/**
 * Used to create and/or return a Common Memory Cache singleton instance.
 *
 * @class CommonMemoryCache
 * @extends ConnectionObserver
 * @singleton
 * @public
 */
class CommonMemoryCache extends ConnectionObserver {

    static #instance = null;
    #redisClient = null;
    #isOperational = false;
    #connectionIdentifier = "system-cache";

    /**
     * @constructor
     * @return {CommonMemoryCache}
     */
    constructor() {
        super();

        if ( !CommonMemoryCache.#instance ) {
            this.#redisClient = redis.createRedisClient( this.#connectionIdentifier );
            this.#redisClient.addConnectionObserver( this );

            CommonMemoryCache.#instance = this;
        }
        return CommonMemoryCache.#instance;
    }

    /* Public interface */

    /**
     * Property returning the operational state of the cache.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isOperational() {
        return this.#isOperational;
    }

    /**
     * Property returning the connection identifier of the cache service.
     *
     * @property
     * @returns {string}
     * @public
     */
    get connectionIdentifier() {
        return this.#connectionIdentifier;
    }

    /**
     * Used to initialize the cache service.
     *
     * @method
     * @returns {Promise}
     * @public
     */
    initialize() {
        let host = config.getSetting( config.setting.MEMORY_CACHE_REDIS_HOST );
        let port = config.getSetting( config.setting.MEMORY_CACHE_REDIS_PORT );
        let db = config.getSetting( config.setting.MEMORY_CACHE_REDIS_DB );
        let authKey = config.getSetting( config.setting.MEMORY_CACHE_AUTH_KEY );
        let user = config.getSetting( config.setting.MEMORY_CACHE_USER );

        return this.#redisClient.initialize( host, port, authKey, user, db );
    }

    /**
     * Used to gracefully shut down the cache service.
     *
     * @method
     * @return {Promise}
     * @public
     */
    shutDown() {
        return this.#redisClient.shutDown( 250 );
    }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isOperational = false;
        }
    }

    /**
     * Needs to be invoked by the connection handler when the connection is recovered.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionRecovered( identifier ) {
        if ( identifier === this.#connectionIdentifier ) {
            this.#isOperational = true;
        }
    }

    /**
     * Used to register a new {@link ConnectionObserver} for events related to the underlying Redis connection state.
     *
     * @method
     * @param {ConnectionObserver} connectionObserver The {@link ConnectionObserver} that will be notified of any changes.
     * @public
     */
    addConnectionObserver( connectionObserver ) {
        this.#redisClient.addConnectionObserver( connectionObserver );
    }

    /**
     * Used to search for keys by a given pattern.
     *
     * @method
     * @param {string} pattern
     * @returns {Promise<Array>}
     * @public
     */
    matchKeys( pattern ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandKeys = [ redis.cacheCommands.KEYS, pattern ];
                this.#redisClient.executeCommands( [ commandKeys ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 ) ? results[ 1 ] : [] );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to set a specific string value.
     *
     * @method
     * @param {string} key
     * @param {string} value
     * @param {number} [expiration] Expiration value is in seconds.
     * @return {Promise<string>}
     * @public
     */
    setValue( key, value, expiration ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                if ( value ) {
                    let commandSetValue = [ redis.cacheCommands.SET_VALUE, key, tools.stringifyJSON( value ) ];
                    if ( expiration ) {
                        commandSetValue.push( "EX" );
                        commandSetValue.push( expiration );
                    }
                    this.#redisClient.executeCommands( [ commandSetValue ] ).then( () => {
                        resolve( value );
                    } ).catch( ( error ) => {
                        reject( error );
                    } );
                } else {
                    resolve( value );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to set multiple string values.
     *
     * @method
     * @param {Object} keyValues
     * @param {string} [prefix]
     * @param {number} [expiration]
     * @return {Promise}
     * @public
     */
    setValues( keyValues, prefix, expiration ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                if ( keyValues ) {
                    let commands = [];
                    _.forEach( keyValues, ( value, key ) => {
                        let commandSetValue = [ redis.cacheCommands.SET_VALUE, ( ( prefix ) ? prefix : "" ) + key, tools.stringifyJSON( value ) ];
                        if ( expiration ) {
                            commandSetValue.push( "EX" );
                            commandSetValue.push( expiration );
                        }
                        commands.push( commandSetValue );
                    } );

                    this.#redisClient.executeCommands( commands ).then( () => {
                        resolve( keyValues );
                    } ).catch( ( error ) => {
                        reject( error );
                    } );
                } else {
                    resolve( keyValues );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to get a string value.
     *
     * @method
     * @param {string} key
     * @return {Promise}
     * @public
     */
    getValue( key ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandGetValue = [ redis.cacheCommands.GET_VALUE, key ];
                this.#redisClient.executeCommands( [ commandGetValue ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 && _.isString( results[ 1 ] ) ) ? tools.parseJSON( results[ 1 ] ) : undefined );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to get multiple string values.
     *
     * @method
     * @param {string[]} keys
     * @param {string} [prefix]
     * @return {Promise}
     * @public
     */
    getValues( keys, prefix ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commands = [];
                _.forEach( keys, ( key ) => {
                    commands.push( [ redis.cacheCommands.GET_VALUE, ( ( prefix ) ? prefix : "" ) + key ] );
                } );
                this.#redisClient.executeCommands( commands ).then( ( rawResults ) => {
                    let results = {};
                    _.forEach( rawResults, ( result, idx ) => {
                        results[ keys[ idx ] ] = ( results && results.length > 1 && _.isString( results[ 1 ] ) ) ? tools.parseJSON( results[ 1 ] ) : null;
                    } );
                    resolve( results );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to delete a value / item.
     *
     * @method
     * @param {string} key
     * @returns {Promise<boolean>}
     * @public
     */
    deleteValue( key ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandDeleteValue = [ redis.cacheCommands.DELETE_VALUE, key ];
                this.#redisClient.executeCommands( [ commandDeleteValue ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 ) ? results[ 1 ] : undefined );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to set expiration in seconds to an existing key.
     * <br/>
     * NOTE: For performance optimization reasons, only use this only if the Redis command does not itself support the 'EX' argument.
     *
     * @method
     * @param {string} key
     * @param {number} seconds
     * @param {string} [name] If you need to expire a field in a hash set instead, provide the name of the set here.
     * @returns {Promise<number>} This will resolve with the seconds as provided initially by the caller.
     * @public
     */
    expireValue( key, seconds, name ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandExpire = [];
                if ( name ) {
                    commandExpire = [ redis.cacheCommands.HASH_EXPIRE, name, seconds, "FIELDS", 1, key ];
                } else {
                    commandExpire = [ redis.cacheCommands.EXPIRE, key, seconds ];
                }
                this.#redisClient.executeCommands( [ commandExpire ] ).then( () => {
                    resolve( seconds );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to add the specified values to a list.
     *
     * @method
     * @param {string} listName
     * @param {Object[]} values
     * @returns {Promise<number>}
     * @public
     */
    listPushValue( listName, values ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandPushValues = [ redis.cacheCommands.LIST_PUSH, listName ];
                _.forEach( values, ( value ) => {
                    if ( value ) {
                        commandPushValues.push( tools.stringifyJSON( value ) );
                    }
                } );
                this.#redisClient.executeCommands( [ commandPushValues ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 ) ? results[ 1 ] : undefined );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to add the specified value to a set.
     *
     * @method
     * @param {string} key
     * @param {string|Object} value
     * @returns {Promise}
     * @public
     */
    addToSet( key, value ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandAddToSet = [ redis.cacheCommands.ADD_TO_SET, key, tools.stringifyJSON( value ) ];
                this.#redisClient.executeCommands( [ commandAddToSet ] ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to add multiple values to multiple sets in one transactional request.
     * <br/>
     * NOTE: The two arrays of keys and values must have correct index relations (i.e., first pair on keys[0] and values[0] and so on)!
     *
     * @method
     * @param {string[]} keys
     * @param {string[]} values
     * @returns {Promise}
     * @public
     */
    addToSetMulti( keys, values ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commands = [];
                _.forEach( keys, ( key, idx ) => {
                    commands.push( [ redis.cacheCommands.ADD_TO_SET, key, tools.stringifyJSON( values[ idx ] ) ] );
                } );
                this.#redisClient.executeCommands( commands ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to check if the provided value is a member of the specified set.
     *
     * @method
     * @param {string} setName
     * @param {string} value
     * @returns {Promise<boolean>}
     * @public
     */
    isSetMember( setName, value ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandIsSetMember = [ redis.cacheCommands.IS_SET_MEMBER, setName, value ];
                this.#redisClient.executeCommands( [ commandIsSetMember ] ).then( ( results ) => {
                    results = results[ 0 ];
                    let result = !!( results && results.length > 1 && results[ 1 ] === 1 );
                    resolve( result );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to get all elements of a set.
     *
     * @method
     * @param {string} key
     * @returns {Promise<Object[]>}
     * @public
     */
    membersOfSet( key ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandMembersOfSet = [ redis.cacheCommands.GET_ALL_FROM_SET, key ];
                this.#redisClient.executeCommands( [ commandMembersOfSet ] ).then( ( results ) => {
                    results = results[ 0 ];
                    let parsedResults = ( results && results.length > 1 && results[ 1 ] ) ? results[ 1 ] : [];
                    resolve( parsedResults );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to get a union of all elements in the list of sets.
     *
     * @method
     * @param {string[]} keys
     * @returns {Promise<Object[]>}
     * @public
     */
    unionOfSets( keys ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandUnionOfSets = _.concat( [ redis.cacheCommands.UNION_OF_SETS ], keys );
                this.#redisClient.executeCommands( [ commandUnionOfSets ] ).then( ( results ) => {
                    results = results[ 0 ];
                    let parsedResults = ( results && results.length > 1 && results[ 1 ] ) ? results[ 1 ] : [];
                    resolve( parsedResults );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to set a single hash field.
     *
     * @method
     * @deprecated
     * @param {string} key
     * @param {string} name
     * @param {*} value
     * @returns {Promise}
     * @public
     */
    hashSetField( key, name, value ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandHashSetField = [ redis.cacheCommands.HASH_SET, key, name, tools.stringifyJSON( value ) ];
                this.#redisClient.executeCommands( [ commandHashSetField ] ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to set multiple hash fields.
     *
     * @method
     * @deprecated
     * @param {string} key
     * @param {Object[]} fields
     * @param {string} fields[].name
     * @param {*} fields[].value
     * @returns {Promise}
     * @public
     */
    hashSetFields( key, fields ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandHashSetFields = [ redis.cacheCommands.HASH_SET, key ];
                _.forEach( fields, ( field ) => {
                    commandHashSetFields.push( field.name );
                    commandHashSetFields.push( tools.stringifyJSON( field.value ) );
                } );
                this.#redisClient.executeCommands( [ commandHashSetFields ] ).then( () => {
                    resolve();
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to get a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise}
     * @public
     */
    hashGetField( key, field ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandHashGetField = [ redis.cacheCommands.HASH_GET, key, field ];
                this.#redisClient.executeCommands( [ commandHashGetField ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 && _.isString( results[ 1 ] ) ) ? tools.parseJSON( results[ 1 ] ) : null );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to remove a single field from a hash.
     *
     * @method
     * @param {string} key
     * @param {string} field
     * @return {Promise<boolean>} Will return 'true' if the field was removed, 'false' otherwise.
     * @public
     */
    hashDeleteField( key, field ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandHashGetField = [ redis.cacheCommands.HASH_REMOVE, key, field ];
                this.#redisClient.executeCommands( [ commandHashGetField ] ).then( ( results ) => {
                    results = results[ 0 ];
                    resolve( ( results && results.length > 1 ) ? tools.toBool( results[ 1 ] ) : false );
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to store a JSON variable.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string} [path='&']
     * @param {number} [overrideMode=0] By default this allows full override for existing keys.
     * Option 1 will set the key only if it doesn't already exist. Option 2 will set it only if it already exists.
     * @returns {Promise}
     * @public
     */
    setJSON( key, value, path = "$", overrideMode = 0 ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                if ( this.#redisClient.isJSONSupported ) {
                    let commandArguments = [ redis.cacheCommands.JSON_SET, key, path, tools.stringifyJSON( value ) ];
                    if ( overrideMode !== 0 ) {
                        commandArguments.push( overrideMode === 1 ? redis.cacheOverrideMode.NX : redis.cacheOverrideMode.XX );
                    }
                    this.#redisClient.callCommand( commandArguments ).then( () => {
                        resolve();
                    } ).catch( ( error ) => {
                        reject( error );
                    } );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED ), { details: "No RedisJSON module installed on server." } );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to fetch a JSON variable.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {string} path
     * @returns {Promise<Object>}
     * @public
     */
    getJSON( key, path = "$" ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                if ( this.#redisClient.isJSONSupported ) {
                    let commandArguments = [ redis.cacheCommands.JSON_GET, key, path ];
                    this.#redisClient.callCommand( commandArguments ).then( ( result ) => {
                        resolve( tools.parseJSON( result ) );
                    } ).catch( ( error ) => {
                        reject( error );
                    } );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED ), { details: "No RedisJSON module installed on server." } );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

    /**
     * Used to add an item to a JSON array. That array needs to exist already.
     * <br/>
     * NOTE: Requires ReJSON module installed on server to work.
     *
     * @method
     * @param {string} key
     * @param {Object} value
     * @param {string} path
     * @returns {Promise}
     * @public
     */
    arrayAppendJSON( key, value, path = "$" ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                if ( this.#redisClient.isJSONSupported ) {
                    let commandArguments = [ redis.cacheCommands.JSON_ARRAY_APPEND, key, path, tools.stringifyJSON( value ) ];
                    this.#redisClient.callCommand( commandArguments ).then( () => {
                        resolve();
                    } ).catch( ( error ) => {
                        reject( error );
                    } );
                } else {
                    reject( exceptions.raise( exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED ), { details: "No RedisJSON module installed on server." } );
                }
            } else {
                reject( exceptions.raise( exceptions.exceptionCode.E_GEN_SYSTEM_CACHE_UNAVAILABLE ) );
            }
        } );
    }

}

const instance = new CommonMemoryCache();
module.exports.instance = Object.freeze( instance );