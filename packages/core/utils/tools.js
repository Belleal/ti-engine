/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const crypto = require( "node:crypto" );

/**
 * @typedef {Object} TiEnumValue
 * @property {number|string} value
 * @property {string} name
 * @property {string} [description]
 */

/**
 * @typedef {Object} TiEnum
 * @property {Object.<number|string,TiEnumValue>} properties
 * @property {function( (number|string), [string] ): (string|undefined)} name
 * @property {function( (number|string), [string] ): (string|undefined)} description
 * @property {function( (number|string) ): boolean} contains
 */

/**
 * Used to generate and return new UUID.
 *
 * @method
 * @returns {string}
 * @public
 */
module.exports.getUUID = () => {
    return crypto.randomUUID( { disableEntropyCache: true } );
};

/**
 * Used to create a custom Enum list.
 *
 * @method
 * @param {Object} seed
 * @returns {Object} This is a {@link TiEnum} object. Setting the proper reference here would unfortunately break IDE support.
 * @public
 */
module.exports.enum = ( seed ) => {
    const enumObject = Object.create( null );
    const properties = Object.create( null );
    const reserved = new Set( [ "properties", "name", "description", "contains", "__proto__", "prototype", "constructor" ] );

    _.forOwn( seed, ( value, key ) => {
        if ( !reserved.has( key ) ) {
            if ( Array.isArray( value ) ) {
                enumObject[ key ] = value[ 0 ];
                properties[ value[ 0 ] ] = {
                    value: value[ 0 ],
                    name: value[ 1 ],
                    description: value[ 2 ]
                };
            } else {
                enumObject[ key ] = value;
                properties[ value ] = {
                    value: value,
                    name: key
                };
            }
        }
    } );
    Object.values( properties ).forEach( Object.freeze );
    Object.freeze( properties );

    /**
     * Used to get the name of an {@link TiEnumValue} if such value exists.
     *
     * @method
     * @param {number|string} value
     * @param {string} [placeholder=undefined] If provided it will be returned when the enum value does not have a name defined.
     * @returns {string|undefined}
     * @public
     */
    const name = ( value, placeholder = undefined ) => {
        return ( properties[ value ] ) ? properties[ value ].name : placeholder;
    };

    /**
     * Used to get the description of an {@link TiEnumValue} if such value exists.
     *
     * @method
     * @param {number|string} value
     * @param {string} [placeholder=undefined] If provided it will be returned when the enum value does not have a description defined.
     * @returns {string|undefined}
     * @public
     */
    const description = ( value, placeholder = undefined ) => {
        if ( !properties[ value ] ) {
            return placeholder;
        } else {
            return ( properties[ value ].description !== undefined ) ? properties[ value ].description : placeholder;
        }
    };

    /**
     * Used to check if the provided value is contained in the provided {@link TiEnum} list.
     *
     * @method
     * @param {number|string} value
     * @returns {boolean}
     * @public
     */
    const contains = ( value ) => {
        return !!( properties[ value ] );
    };

    Object.defineProperties( enumObject, {
        contains: {
            enumerable: false,
            configurable: false,
            writable: false,
            value: contains
        },
        description: {
            enumerable: false,
            configurable: false,
            writable: false,
            value: description
        },
        name: {
            enumerable: false,
            configurable: false,
            writable: false,
            value: name
        },
        properties: {
            enumerable: false,
            configurable: false,
            writable: false,
            value: properties
        }
    } );
    Object.freeze( enumObject );

    return enumObject;
};

/**
 * Used to get the name of an {@link TiEnum} value if such exists.
 *
 * @method
 * @deprecated Use the 'name' property of the provided {@link TiEnum} instead.
 * @param {TiEnum} enumList
 * @param {number|string} enumValue
 * @param {string} [placeholder=undefined] If provided it will be returned when the enum value does not have a name defined.
 * @returns {string|undefined}
 * @public
 */
module.exports.getEnumName = ( enumList, enumValue, placeholder = undefined ) => {
    return ( enumList.properties[ enumValue ] ) ? enumList.properties[ enumValue ].name : placeholder;
};

/**
 * Convert an Error to a JSON object.
 * <br/>
 * NOTE: If the value provided is not an error, then it will just be cloned.
 *
 * @method
 * @param {Error} value
 * @returns {Object}
 * @public
 */
module.exports.errorToJSON = ( value ) => {
    let error = {};

    if ( value instanceof Error ) {
        Object.getOwnPropertyNames( value ).forEach( ( key ) => {
            error[ key ] = value[ key ];
        } );
    } else {
        error = _.cloneDeep( value );
    }

    return error;
};

/**
 * Used to parse a value and return its boolean representation (if possible).
 *
 * @param {*} value
 * @returns {boolean}
 * @public
 */
module.exports.toBool = ( value ) => {
    let result = true;
    let regexp = /^false$|^0$|^no$/i;

    if ( !value || regexp.test( value ) || value === "N" || value === "0" || ( _.isObjectLike( value ) && _.size( value ) === 0 ) ) {
        result = false;
    }

    return result;
};

/**
 * Used to fetch only the unique values from the provided array.
 *
 * @method
 * @param {Array} array
 * @returns {Array}
 * @public
 */
module.exports.arrayUniques = ( array ) => {
    return [ ...new Set( array ) ];
};

/**
 * Will return a UTC date string in format YYYY-MM-DD from the provided date.
 *
 * @method
 * @param {Date} date
 * @returns {string}
 * @public
 */
module.exports.getUTCDateString = ( date ) => {
    const year = date.getUTCFullYear();
    const month = String( date.getUTCMonth() + 1 ).padStart( 2, "0" );
    const day = String( date.getUTCDate() ).padStart( 2, "0" );
    return `${ year }-${ month }-${ day }`;
};

/**
 * Will return a UTC time string in format hh:mm:ss, or hh:mm:ss.MMM when useMilliseconds is true.
 *
 * @method
 * @param {Date} date
 * @param {boolean} [useMilliseconds=false]
 * @returns {string}
 * @public
 */
module.exports.getUTCTimeString = ( date, useMilliseconds = false ) => {
    const hours = String( date.getUTCHours() ).padStart( 2, "0" );
    const minutes = String( date.getUTCMinutes() ).padStart( 2, "0" );
    const seconds = String( date.getUTCSeconds() ).padStart( 2, "0" );
    const milliseconds = useMilliseconds ? `${ String( date.getUTCMilliseconds() ).padStart( 3, "0" ) }` : "";
    return `${ hours }:${ minutes }:${ seconds }${ useMilliseconds ? `.${ milliseconds }` : "" }`;
};

/**
 * Used to remove any circular dependencies from JSON objects.
 * <br/>
 * NOTE: Original file from here - https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
 *
 * Make a deep copy of an object or array, assuring that there is at most one instance of each object or array in the
 * resulting structure. The duplicate references (which might be forming cycles) are replaced with an object of the
 * form of {"$ref": PATH} where the PATH is a JSONPath string that locates the first occurrence.
 *
 * So,
 *
 * var a = [];
 * a[0] = a;
 * return JSON.stringify(JSON.decycle(a));
 *
 * produces the string '[{"$ref":"$"}]'.
 *
 * If a replacer function is provided, then it will be called for each value. A replacer function receives a value
 * and returns a replacement value.
 *
 * JSONPath is used to locate the unique object. $ indicates the top level of the object or array. [NUMBER] or [STRING]
 * indicates a child element or property.
 *
 * @method
 * @param {Object} object
 * @param {function( Object ): Object} [replacer]
 * @returns {Object}
 * @public
 */
module.exports.decycle = ( object, replacer ) => {
    "use strict";

    let objects = new WeakMap();

    // The derez function recurse through the object, producing the deep copy.
    return ( function derez( value, path ) {
        let oldPath; // The path of an earlier occurrence of value
        let newItem; // The new object or array

        // If a replacer function was provided, then call it to get a replacement value.
        if ( replacer !== undefined ) {
            value = replacer( value );
        }

        // typeof null === "object", so go on if this value is really an object but not
        // one of the weird builtin objects.
        if (
            typeof value === "object"
            && value !== null
            && !( value instanceof Boolean )
            && !( value instanceof Date )
            && !( value instanceof Number )
            && !( value instanceof RegExp )
            && !( value instanceof String )
        ) {
            // If the value is an object or array, look to see if we have already
            // encountered it. If so, return a {"$ref":PATH} object. This uses an
            // ES6 WeakMap.
            oldPath = objects.get( value );
            if ( oldPath !== undefined ) {
                return { $ref: oldPath };
            }

            // Otherwise, accumulate the unique value and its path.
            objects.set( value, path );

            // If it is an array, replicate the array.
            if ( Array.isArray( value ) ) {
                newItem = [];
                value.forEach( ( element, i ) => {
                    newItem[ i ] = derez( element, path + "[" + i + "]" );
                } );
            } else {
                // If it is an object, replicate the object.
                newItem = {};
                Object.keys( value ).forEach( ( name ) => {
                    newItem[ name ] = derez(
                        value[ name ],
                        path + "[" + JSON.stringify( name ) + "]"
                    );
                } );
            }
            return newItem;
        }
        return value;
    }( object, "$" ) );
};

/**
 * Used to restore any circular dependencies from JSON objects after using the 'decycle' method.
 * <br/>
 * NOTE: Original file from here - https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
 *
 * Restore an object that was reduced by decycle. Members whose values are objects of the form of {$ref: PATH} are
 * replaced with references to the value found by the PATH. This will restore cycles. The object will be mutated.
 *
 * The eval function is used to locate the values described by a PATH. The root object is kept in a $ variable. A
 * regular expression is used to assure that the PATH is extremely well-formed. The regexp contains nested quantifiers.
 * That has been known to have extremely bad performance problems on some browsers for very long strings. A PATH is
 * expected to be reasonably short. A PATH is allowed to belong to a very restricted subset of Goessner's JSONPath.
 *
 * So,
 *
 * var s = '[{"$ref":"$"}]';
 * return JSON.retrocycle(JSON.parse(s));
 *
 * produces an array containing a single element which is the array itself.
 *
 * @method
 * @param {Object} $
 * @returns {Object}
 * @public
 */
module.exports.retrocycle = ( $ ) => {
    "use strict";

    // eslint-disable-next-line no-control-regex
    let px = /^\$(?:\[(?:\d+|"(?:[^\\"\u0000-\u001f]|\\(?:[\\"/bfnrt]|u[0-9a-zA-Z]{4}))*")])*$/;

    // The rez function walks recursively through the object looking for $ref
    // properties. When it finds one that has a value that is a path, then it
    // replaces the $ref object with a reference to the value that is found by
    // the path.
    ( function rez( value ) {
        if ( value && typeof value === "object" ) {
            if ( Array.isArray( value ) ) {
                value.forEach( ( element, i ) => {
                    if ( typeof element === "object" && element !== null ) {
                        let path = element.$ref;
                        if ( typeof path === "string" && px.test( path ) ) {
                            value[ i ] = eval( path );
                        } else {
                            rez( element );
                        }
                    }
                } );
            } else {
                Object.keys( value ).forEach( ( name ) => {
                    let item = value[ name ];
                    if ( typeof item === "object" && item !== null ) {
                        let path = item.$ref;
                        if ( typeof path === "string" && px.test( path ) ) {
                            value[ name ] = eval( path );
                        } else {
                            rez( item );
                        }
                    }
                } );
            }
        }
    }( $ ) );
    return $;
};

/**
 * Use this to stringify any JSON object for internal system purposes as it ensures no potential circular dependencies
 * will cause it to throw exception.
 *
 * @method
 * @param {Object} value
 * @returns {string|*}
 * @public
 */
module.exports.stringifyJSON = ( value ) => {
    return _.isObjectLike( value ) ? JSON.stringify( _.toPlainObject( module.exports.decycle( value ) ) ) : value;
};

/**
 * Use this to verify if the provided string can be parsed as a JSON.
 *
 * @method
 * @param {string} string
 * @returns {boolean}
 * @public
 */
module.exports.isJsonString = ( string ) => {
    try {
        JSON.parse( string );
    } catch {
        return false;
    }
    return true;
};

/**
 * Use this to parse any JSON string into JSON object for internal system purposes as it ensures to restore any
 * circular dependencies obscured with 'stringifyJSON'.
 *
 * @method
 * @param {string} value
 * @returns {Object|string}
 * @public
 */
module.exports.parseJSON = ( value ) => {
    try {
        let transformed = JSON.parse( value );
        return module.exports.retrocycle( transformed );
    } catch {
        return value;
    }
};

/**
 * Use this to decompose a JSON object into a sorted string. The values will be ordered alphabetically and combined with
 * their keys, where applicable, starting from the bottom and moving up. Null or undefined values will be ignored and
 * their keys will not be included in the final string.
 *
 * @param {Object} input
 * @recursion
 * @returns {string|null}
 * @public
 */
module.exports.decomposeJSON = ( input ) => {
    let decomposed;

    if ( !_.isNil( input ) ) {
        if ( _.isArray( input ) ) {
            decomposed = [];
            _.forEach( input, ( value ) => {
                let decomposedValue = module.exports.decomposeJSON( value );
                if ( decomposedValue !== undefined ) {
                    decomposed.push( decomposedValue );
                }
            } );
            decomposed = decomposed.sort();
            decomposed = decomposed.join( ":" );
        } else if ( _.isPlainObject( input ) ) {
            decomposed = [];
            _.forOwn( input, ( value, key ) => {
                let decomposedValue = module.exports.decomposeJSON( value );
                if ( decomposedValue !== undefined ) {
                    decomposed.push( _.toString( key ) + ":" + decomposedValue );
                }
            } );
            decomposed = decomposed.sort();
            decomposed = decomposed.join( ":" );
        } else {
            decomposed = _.toString( input );
        }
    }

    return decomposed;
};

/**
 * Used to create retry policy for the execution of an operation.
 *
 * @class RetryPolicy
 * @public
 */
class RetryPolicy {

    #maxAttempts;
    #onFailedAttempt;
    #onRetry;

    /**
     * @constructor
     * @param {number} maxAttempts The maximum number of attempts to execute the operation.
     * @throws {TypeError} maxAttempts must be a positive integer.
     */
    constructor( maxAttempts ) {
        if ( !Number.isInteger( maxAttempts ) || maxAttempts < 1 ) {
            throw new TypeError( "maxAttempts must be a positive integer" );
        }
        this.#maxAttempts = maxAttempts;
    }

    /* Public interface */

    /**
     * Used to start execution of the provided operation.
     *
     * @method
     * @param {Object} context The context in which the operation will be executed (i.e., this reference).
     * @param {function( ...* ): Promise<*>} operation Operation to be executed; must return a Promise.
     * @param {Array<*>} [params=[]] The arguments to be provided to the operation upon execution.
     * @returns {Promise}
     * @public
     */
    execute( context, operation, params = [] ) {
        return this.#retry( context, operation, params, 1, undefined );
    }

    /**
     * Used to register a method that will be automatically called on a failed execution attempt.
     *
     * @method
     * @param {function( Error )} action The execution error will be provided as an argument.
     * @public
     */
    onFailedAttempt( action ) {
        if ( typeof ( action ) === "function" ) {
            this.#onFailedAttempt = action;
        }
    }

    /**
     * Used to register a method that will be automatically called on each execution retry (after the initial one).
     *
     * @method
     * @param {function( number, (Error|undefined) )} action The current attempt and last error are provided.
     * @public
     */
    onRetry( action ) {
        if ( typeof ( action ) === "function" ) {
            this.#onRetry = action;
        }
    }

    /* Private interface */

    /**
     * Will retry the execution of operation up to max attempts.
     *
     * @method
     * @param {Object} context
     * @param {function( ...* ): Promise<*>} operation Operation to be executed; must return a Promise.
     * @param {Array<*>} params The arguments to be provided to the operation upon execution.
     * @param {number} attempt
     * @param {Error} error
     * @returns {Promise}
     * @private
     */
    #retry( context, operation, params, attempt, error ) {
        if ( attempt > this.#maxAttempts ) {
            return Promise.reject( error );
        } else {
            if ( attempt > 1 && this.#onRetry ) {
                try {
                    this.#onRetry( attempt, error );
                } catch {
                    // ignore observer errors...
                }
            }
            return Promise
                .resolve()
                .then( () => {
                    return operation.apply( context, params );
                } )
                .catch( ( error ) => {
                    if ( this.#onFailedAttempt ) {
                        try {
                            this.#onFailedAttempt( error );
                        } catch {
                            // ignore observer errors...
                        }
                    }
                    return this.#retry( context, operation, params, ( attempt + 1 ), error );
                } );
        }
    }

}

module.exports.RetryPolicy = RetryPolicy;