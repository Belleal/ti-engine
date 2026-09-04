export = ConfigRegistry;
export type ConfigValidationIssue = {
    /**
     * A JSON pointer / data path to the offending value (e.g. ".competencies.E1-1.name"), or "".
     */
    path: string;
    /**
     * Human-readable problem description.
     */
    message: string;
    /**
     * "schema" for JSON-Schema failures, or a validator-supplied code (default "semantic").
     */
    code: string;
    /**
     * Optional structured details (e.g. ajv params).
     */
    params?: Object;
};
export type ValidatorContext = {
    /**
     * Resolves the *pending* value of `key` when it is part of the
     * current edit batch, otherwise its current committed value. Lets a validator check a sibling document's
     * post-edit state — but calling this for the document being validated itself just returns the same incoming
     * value already passed as the validator's first argument, not its prior state.
     */
    getConfig: (key: string) => Promise<any>;
    /**
     * Always resolves the current committed value of `key`,
     * even when `key` is the document currently under validation. Use this to compare a document against its own
     * previous state (e.g. detecting an edit that should have bumped a version marker).
     */
    getStoredConfig: (key: string) => Promise<any>;
};
export type SemanticValidator = (value: Object, context: ValidatorContext) => ConfigValidationIssue[] | Promise<ConfigValidationIssue[]>;
/**
 * @typedef {Object} ConfigValidationIssue
 * @property {string} path A JSON pointer / data path to the offending value (e.g. ".competencies.E1-1.name"), or "".
 * @property {string} message Human-readable problem description.
 * @property {string} code "schema" for JSON-Schema failures, or a validator-supplied code (default "semantic").
 * @property {Object} [params] Optional structured details (e.g. ajv params).
 */
/**
 * The cross-document read context passed to every {@link SemanticValidator}, built fresh for each
 * {@link ConfigService#applyEdits} call.
 *
 * @typedef {Object} ValidatorContext
 * @property {(key: string) => Promise<*>} getConfig Resolves the *pending* value of `key` when it is part of the
 *      current edit batch, otherwise its current committed value. Lets a validator check a sibling document's
 *      post-edit state — but calling this for the document being validated itself just returns the same incoming
 *      value already passed as the validator's first argument, not its prior state.
 * @property {(key: string) => Promise<*>} getStoredConfig Always resolves the current committed value of `key`,
 *      even when `key` is the document currently under validation. Use this to compare a document against its own
 *      previous state (e.g. detecting an edit that should have bumped a version marker).
 */
/**
 * @typedef {(value: Object, context: ValidatorContext) => ConfigValidationIssue[]|Promise<ConfigValidationIssue[]>} SemanticValidator
 * A semantic validator receives the candidate value and a {@link ValidatorContext} and returns the issues it found
 * (empty array = OK). May be async.
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
declare class ConfigRegistry {
    #private;
    constructor();
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
    register(configKey: string, definition: {
        schema: Object;
        validators?: SemanticValidator[];
        defaultValue?: Object;
        metadata?: Object;
    }): ConfigRegistry;
    /**
     * Adds a schema that is referenced (via `$ref`/`$id`) by document schemas but is not itself a document.
     *
     * @method
     * @param {Object} schema
     * @returns {ConfigRegistry} this (chainable)
     * @public
     */
    addSchema(schema: Object): ConfigRegistry;
    /**
     * @method
     * @param {string} configKey
     * @returns {boolean}
     * @public
     */
    has(configKey: string): boolean;
    /**
     * @method
     * @returns {string[]} All registered configuration keys.
     * @public
     */
    list(): string[];
    /**
     * @method
     * @param {string} configKey
     * @returns {Object|undefined} The editor metadata registered for the document.
     * @public
     */
    metadataFor(configKey: string): Object | undefined;
    /**
     * @method
     * @param {string} configKey
     * @returns {Object|undefined} The bootstrap default value registered for the document.
     * @public
     */
    getDefault(configKey: string): Object | undefined;
    /**
     * Validates a candidate value for a registered document: JSON Schema first, then the semantic validators.
     * Resolves with `{ valid, errors }` (errors is an array of {@link ConfigValidationIssue}).
     *
     * @method
     * @param {string} configKey
     * @param {Object} value
     * @param {ValidatorContext} [context] Passed to each semantic validator.
     * @returns {Promise<{valid: boolean, errors: ConfigValidationIssue[]}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the document is not registered.
     * @public
     */
    validate(configKey: string, value: Object, context?: ValidatorContext): Promise<{
        valid: boolean;
        errors: ConfigValidationIssue[];
    }>;
    /**
     * Validates a value against a document's registered schema **only**, skipping the semantic validators.
     * <br/>
     * Separate from {@link ConfigRegistry#validate} because the two answer different questions. A semantic validator
     * may need a {@link ValidatorContext} the caller has no reason to build, and several of them are about an edit
     * (did the version move? does this removal orphan a reference?) rather than about the document standing alone.
     * A caller that just wants to know whether a value is structurally admissible — a boot-time check on what the
     * store already holds, say — needs this half and not the other.
     *
     * @method
     * @param {string} configKey
     * @param {Object} value
     * @returns {{valid: boolean, errors: ConfigValidationIssue[]}}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the document is not registered.
     * @public
     */
    validateSchema(configKey: string, value: Object): {
        valid: boolean;
        errors: ConfigValidationIssue[];
    };
}
declare namespace ConfigRegistry {
    export { instance };
}
declare const instance: ConfigRegistry;
