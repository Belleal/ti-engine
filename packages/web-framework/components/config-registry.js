/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const Ajv = require( "ajv" );
const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * @typedef {Object} ConfigValidationIssue
 * @property {string} path A JSON pointer / data path to the offending value (e.g. ".competencies.E1-1.name"), or "".
 * @property {string} message Human-readable problem description.
 * @property {string} code "schema" for JSON-Schema failures, or a validator-supplied code (default "semantic").
 * @property {Object} [params] Optional structured details (e.g. ajv params).
 */

/**
 * @typedef {function(Object, Object): (ConfigValidationIssue[]|Promise<ConfigValidationIssue[]>)} SemanticValidator
 * A semantic validator receives the candidate value and a context object (e.g. `{ getConfig(key) }` to read other
 * current configs for cross-document checks) and returns the issues it found (empty array = OK). May be async.
 */

/**
 * Registry of editable configuration *documents* and the gate that validates a candidate value against a
 * document's JSON Schema (ajv) plus its semantic validators. The framework stays domain-agnostic: an application
 * registers its config documents (schemas, validators, defaults, editor metadata) at startup; this component knows
 * only "validated, versioned JSON documents". Validation must pass *before* {@link ConfigStore#saveChangeSet}.
 *
 * @class ConfigRegistry
 * @public
 */
class ConfigRegistry {

    #ajv;
    #registrations = new Map();

    constructor() {
        // ajv 6 (workspace) speaks Draft-07; our schema files annotate Draft 2020-12 only for editor support, so we
        // strip that annotation (see #stripUnsupportedMeta) and skip meta-validation.
        this.#ajv = new Ajv( { allErrors: true, schemaId: "$id", meta: true, validateSchema: false } );
    }

    /* Public interface */

    /**
     * Registers an editable configuration document.
     *
     * @method
     * @param {string} configKey Stable identifier for the document (also the ConfigStore key).
     * @param {Object} definition
     * @param {Object} definition.schema A JSON Schema for the document.
     * @param {SemanticValidator[]} [definition.validators] Cross-cutting/semantic checks beyond the schema.
     * @param {Object} [definition.defaultValue] The bootstrap default (seeds an empty store).
     * @param {Object} [definition.metadata] Editor metadata (label, editor type, group, risk class, …).
     * @returns {ConfigRegistry} this (chainable)
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On missing key/schema.
     * @public
     */
    register( configKey, definition ) {
        const { schema, validators = [], defaultValue, metadata = {} } = definition || {};
        if ( !configKey || !schema || typeof schema !== "object" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-config-registration", configKey: configKey } );
        }
        const prepared = this.#stripUnsupportedMeta( schema );
        this.addSchema( prepared );
        this.#registrations.set( configKey, {
            schema: prepared,
            validators: Array.isArray( validators ) ? validators : [],
            defaultValue: defaultValue,
            metadata: metadata || {},
            compiled: null
        } );
        return this;
    }

    /**
     * Adds a schema that is referenced (via `$ref`/`$id`) by document schemas but is not itself a document.
     *
     * @method
     * @param {Object} schema
     * @returns {ConfigRegistry} this (chainable)
     * @public
     */
    addSchema( schema ) {
        const prepared = this.#stripUnsupportedMeta( schema );
        if ( prepared && prepared.$id && !this.#ajv.getSchema( prepared.$id ) ) {
            this.#ajv.addSchema( prepared );
        }
        return this;
    }

    /**
     * @method
     * @param {string} configKey
     * @returns {boolean}
     * @public
     */
    has( configKey ) {
        return this.#registrations.has( configKey );
    }

    /**
     * @method
     * @returns {string[]} All registered configuration keys.
     * @public
     */
    list() {
        return Array.from( this.#registrations.keys() );
    }

    /**
     * @method
     * @param {string} configKey
     * @returns {Object|undefined} The editor metadata registered for the document.
     * @public
     */
    metadataFor( configKey ) {
        const registration = this.#registrations.get( configKey );
        return registration ? registration.metadata : undefined;
    }

    /**
     * @method
     * @param {string} configKey
     * @returns {Object|undefined} The bootstrap default value registered for the document.
     * @public
     */
    getDefault( configKey ) {
        const registration = this.#registrations.get( configKey );
        return registration ? registration.defaultValue : undefined;
    }

    /**
     * Validates a candidate value for a registered document: JSON Schema first, then the semantic validators.
     * Resolves with `{ valid, errors }` (errors is an array of {@link ConfigValidationIssue}).
     *
     * @method
     * @param {string} configKey
     * @param {Object} value
     * @param {Object} [context] Passed to each semantic validator (e.g. `{ getConfig(key) }`).
     * @returns {Promise<{valid: boolean, errors: ConfigValidationIssue[]}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the document is not registered.
     * @public
     */
    validate( configKey, value, context = {} ) {
        const registration = this.#registrations.get( configKey );
        if ( !registration ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-config", configKey: configKey } ) );
        }

        const errors = [];
        const validateSchema = this.#schemaValidator( registration );
        if ( !validateSchema( value ) ) {
            for ( const error of ( validateSchema.errors || [] ) ) {
                errors.push( { path: error.dataPath || error.instancePath || "", message: error.message || "schema violation", code: "schema", params: error.params } );
            }
        }

        return Promise.all( registration.validators.map( ( validator ) => {
            return Promise.resolve( validator( value, context ) ).then( ( issues ) => ( Array.isArray( issues ) ? issues : [] ) );
        } ) ).then( ( results ) => {
            for ( const issues of results ) {
                for ( const issue of issues ) {
                    errors.push( this.#normalizeIssue( issue ) );
                }
            }
            return { valid: errors.length === 0, errors: errors };
        } );
    }

    /* Private interface */

    /**
     * @method
     * @param {Object} registration
     * @returns {Function} The compiled (and cached) ajv validate function for the document's schema.
     * @private
     */
    #schemaValidator( registration ) {
        if ( !registration.compiled ) {
            registration.compiled = registration.schema.$id
                ? this.#ajv.getSchema( registration.schema.$id )
                : this.#ajv.compile( registration.schema );
        }
        return registration.compiled;
    }

    /**
     * @method
     * @param {Object} schema
     * @returns {Object} A shallow copy without the ajv-6-incompatible Draft-2020-12 `$schema` annotation.
     * @private
     */
    #stripUnsupportedMeta( schema ) {
        if ( schema && schema.$schema && String( schema.$schema ).includes( "draft/2020-12" ) ) {
            const clone = { ...schema };
            delete clone.$schema;
            return clone;
        }
        return schema;
    }

    /**
     * @method
     * @param {ConfigValidationIssue|string} issue
     * @returns {ConfigValidationIssue}
     * @private
     */
    #normalizeIssue( issue ) {
        if ( typeof issue === "string" ) {
            return { path: "", message: issue, code: "semantic" };
        }
        return { path: issue.path || "", message: issue.message || "validation failed", code: issue.code || "semantic", params: issue.params };
    }

}

const instance = new ConfigRegistry();
module.exports = ConfigRegistry;
module.exports.instance = instance;
