/**
 * A class module defining and providing access to the default Cache component.
 */

const _ = require( "lodash" );
const tools = require( "#tools" );
const redis = require( "#redis-integration" );

/**
 * Used to create and/or return a Common Memory Cache singleton instance.
 *
 * @class CommonMemoryCache
 * @singleton
 * @public
 */
class CommonMemoryCache {

    static #instance = null;
    #redisClient = null;

    /**
     * @constructor
     * @return {CommonMemoryCache}
     */
    constructor() {
        if ( !CommonMemoryCache.#instance ) {
            this.#redisClient = redis.createRedisClient( "system", "127.0.0.1" );
            CommonMemoryCache.#instance = this;
        }
        return CommonMemoryCache.#instance;
    }

    /* Public interface */

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
            let commandKeys = [ redis.cacheCommands.KEYS, pattern ];
            this.#redisClient.executeCommands( [ commandKeys ] ).then( ( results ) => {
                resolve( results[ 0 ] );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandGetValue = [ redis.cacheCommands.GET_VALUE, key ];
            this.#redisClient.executeCommands( [ commandGetValue ] ).then( ( results ) => {
                resolve( ( results && results.length > 0 && _.isString( results[ 0 ] ) ) ? tools.parseJSON( results[ 0 ] ) : null );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commands = [];
            _.forEach( keys, ( key ) => {
                commands.push( [ redis.cacheCommands.GET_VALUE, ( ( prefix ) ? prefix : "" ) + key ] );
            } );
            this.#redisClient.executeCommands( commands ).then( ( rawResults ) => {
                let results = {};
                _.forEach( rawResults, ( result, idx ) => {
                    results[ keys[ idx ] ] = ( results && results.length > 0 && _.isString( results[ 0 ] ) ) ? tools.parseJSON( results[ 0 ] ) : null;
                } );
                resolve( results );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandDeleteValue = [ redis.cacheCommands.DELETE_VALUE, key ];
            this.#redisClient.executeCommands( [ commandDeleteValue ] ).then( ( results ) => {
                resolve( ( results && results.length > 0 ) ? results[ 0 ] : false );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandPushValues = [ redis.cacheCommands.LIST_PUSH, listName ];
            _.forEach( values, ( value ) => {
                if ( value ) {
                    commandPushValues.push( tools.stringifyJSON( value ) );
                }
            } );
            this.#redisClient.executeCommands( [ commandPushValues ] ).then( ( results ) => {
                resolve( results[ 0 ] );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandAddToSet = [ redis.cacheCommands.ADD_TO_SET, key, tools.stringifyJSON( value ) ];
            this.#redisClient.executeCommands( [ commandAddToSet ] ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Used to add multiple values to multiple sets in one transactional request.
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
            let commands = [];
            _.forEach( keys, ( key, idx ) => {
                commands.push( [ redis.cacheCommands.ADD_TO_SET, key, tools.stringifyJSON( values[ idx ] ) ] );
            } );
            this.#redisClient.executeCommands( commands ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandMembersOfSet = [ redis.cacheCommands.GET_ALL_FROM_SET, key ];
            this.#redisClient.executeCommands( [ commandMembersOfSet ] ).then( ( results ) => {
                let parsedResults = ( results && results.length > 0 && results[ 0 ] ) ? results[ 0 ] : [];
                _.forEach( parsedResults, ( item, idx ) => {
                    parsedResults[ idx ] = tools.parseJSON( item );
                } );
                resolve( parsedResults );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandUnionOfSets = _.concat( [ redis.cacheCommands.UNION_OF_SETS ], keys );
            this.#redisClient.executeCommands( [ commandUnionOfSets ] ).then( ( results ) => {
                let parsedResults = ( results && results.length > 0 && results[ 0 ] ) ? results[ 0 ] : [];
                _.forEach( parsedResults, ( item, idx ) => {
                    parsedResults[ idx ] = tools.parseJSON( item );
                } );
                resolve( parsedResults );
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandHashSetField = [ redis.cacheCommands.HASH_SET_MANY, key, name, tools.stringifyJSON( value ) ];
            this.#redisClient.executeCommands( [ commandHashSetField ] ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandHashSetFields = [ redis.cacheCommands.HASH_SET_MANY, key ];
            _.forEach( fields, ( field ) => {
                commandHashSetFields.push( field.name );
                commandHashSetFields.push( tools.stringifyJSON( field.value ) );
            } );
            this.#redisClient.executeCommands( [ commandHashSetFields ] ).then( () => {
                resolve();
            } ).catch( ( error ) => {
                reject( error );
            } );
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
            let commandHashGetField = [ redis.cacheCommands.HASH_GET, key, field ];
            this.#redisClient.executeCommands( [ commandHashGetField ] ).then( ( results ) => {
                resolve( ( results && results.length > 0 && _.isString( results[ 0 ] ) ) ? tools.parseJSON( results[ 0 ] ) : null );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }
}

const instance = new CommonMemoryCache();
module.exports = Object.freeze( instance );
