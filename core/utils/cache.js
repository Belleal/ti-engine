/*
 * SPDX-FileCopyrightText: © 2021 Boris Kostadinov <kostadinov.boris@gmail.com>
 * SPDX-License-Identifier: ICU
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

    /**
     * @constructor
     * @return {CommonMemoryCache}
     */
    constructor() {
        super();

        if ( !CommonMemoryCache.#instance ) {
            let host = config.getSetting( config.setting.MEMORY_CACHE_REDIS_HOST );
            let port = config.getSetting( config.setting.MEMORY_CACHE_REDIS_PORT );
            let db = config.getSetting( config.setting.MEMORY_CACHE_REDIS_DB );
            let authKey = config.getSetting( config.setting.MEMORY_CACHE_AUTH_KEY );
            this.#redisClient = redis.createRedisClient( "system", host, port, authKey, db );
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
    get isOperational() { return this.#isOperational; }

    /**
     * Needs to be invoked by the connection handler when the connection is disrupted.
     *
     * @method
     * @param {string} identifier The identifier of the observed connection.
     * @override
     * @public
     */
    onConnectionDisrupted( identifier ) {
        this.#isOperational = false;
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
        this.#isOperational = true;
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
     * Used to search for keys by given pattern.
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
     * @param {string} value
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
     * NOTE: The two arrays of keys and values must have correct index relations (i.e. first pair on keys[0] and values[0] and so on)!
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
     * Used to check if the provided value is member of the specified set.
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
     * @param {string} key
     * @param {string} name
     * @param {*} value
     * @returns {Promise}
     * @public
     */
    hashSetField( key, name, value ) {
        return new Promise( ( resolve, reject ) => {
            if ( this.#isOperational === true ) {
                let commandHashSetField = [ redis.cacheCommands.HASH_SET_MANY, key, name, tools.stringifyJSON( value ) ];
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
                let commandHashSetFields = [ redis.cacheCommands.HASH_SET_MANY, key ];
                _.forEach( fields, ( field ) => {
                    commandHashSetFields.push( field.name );
                    commandHashSetFields.push( _.isObjectLike( field.value ) ? tools.stringifyJSON( field.value ) : field.value );
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
}

const instance = new CommonMemoryCache();
module.exports = Object.freeze( instance );
