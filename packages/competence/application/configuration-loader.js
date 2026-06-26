/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "@ti-engine/core/tools" );

/** @type {ConfigActiveCompetencySets} */
module.exports.configActiveCompetencySets = tools.deepFreeze( require( "#config-active-competency-sets" ) );
/** @type {ConfigCompetencies} */
module.exports.configCompetencies = tools.deepFreeze( require( "#config-competencies" ) );
/** @type {ConfigRelevancyArchetypes} */
module.exports.configRelevancyArchetypes = tools.deepFreeze( require( "#config-relevancy-archetypes" ) );
module.exports.configOrganizationStructure = tools.deepFreeze( require( "#config-organization-structure" ) );
/** @type {ConfigRoleFamilies} */
module.exports.configRoleFamilies = tools.deepFreeze( require( "#config-role-families" ) );
/** @type {Object<string, Array<string>>} The per-family competency pool (applicability): family code → its complete pool (family-specific + shared) of competency codes. */
module.exports.configRoleFamilyCompetencies = tools.deepFreeze( require( "#config-role-family-competencies" ) );
/** @type {ConfigStageLevels} */
module.exports.configStageLevels = tools.deepFreeze( require( "#config-stage-levels" ) );

/**
 * Enum for the organization role values.
 *
 * @readonly
 * @enum {RoleCode}
 * @typedef {RoleCodeValue} RoleCode
 */
const roleCodeEnum = tools.enum( {
    EMPLOYEE: [ 1, "Employee", "A general employee role without any additional privileges." ],
    MANAGER: [ 2, "Manager", "A manager role that is responsible for managing employees." ],
    SUPERVISOR: [ 3, "Supervisor", "A supervisor role that oversees the process but does not manage employees." ],
    TEAM_MEMBER: [ 4, "Team Member", "A team member role that is part of a dedicated team and has limited privileges." ]
} );
module.exports.roleCode = roleCodeEnum;

/**
 * Enum for the role family codes (top-level discipline).
 *
 * @readonly
 * @enum {RoleFamilyCode}
 * @typedef {RoleFamilyCodeValue} RoleFamilyCode
 */
const roleFamilyCodeEnum = tools.enum( {
    SE: [ "SE", "Software Engineering", "Disciplines focused on building software systems." ],
    QE: [ "QE", "Quality Engineering", "Disciplines focused on validating product quality." ],
    BA: [ "BA", "Business Analysis", "Disciplines focused on translating business needs into solutions." ],
    PM: [ "PM", "Project & Delivery Management", "Disciplines focused on planning and delivering projects." ],
    XD: [ "XD", "Experience Design", "Disciplines focused on user research and interaction design." ],
    DA: [ "DA", "Data & Analytics", "Disciplines focused on data engineering, analytics, and ML." ],
    IO: [ "IO", "Infrastructure & Ops", "Disciplines focused on infrastructure, platforms, and operations." ],
    MC: [ "MC", "Marketing & Communications", "Disciplines focused on marketing, brand, content, and PR." ],
    PD: [ "PD", "Product Management", "Disciplines focused on product strategy and ownership." ]
} );
module.exports.roleFamilyCode = roleFamilyCodeEnum;

/**
 * Returns the valid specialization codes for a given role family, as defined in `config.role-families.json`.
 *
 * @method
 * @param {RoleFamilyCodeValue|string} roleFamilyCode
 * @returns {Array<string>} Specialization codes for the family, or empty array if the family is unknown.
 * @public
 */
module.exports.getSpecializationCodes = ( roleFamilyCode ) => {
    const family = module.exports.configRoleFamilies?.[ roleFamilyCode ];
    return family && family.specializations ? Object.keys( family.specializations ) : [];
};

/**
 * Returns the competency pool (applicability universe) for a given role family — its family-specific competencies plus
 * the shared canonical ones — as defined in `config.role-family-competencies.json`. This is the set of codes a family
 * may draw on when configuring its Active Competency Sets per cycle. Returns an empty array for an unknown or
 * unpopulated family.
 *
 * @method
 * @param {RoleFamilyCodeValue|string} roleFamilyCode
 * @returns {Array<string>} The family's competency-code pool (empty if the family has no pool).
 * @public
 */
module.exports.getCompetencyPool = ( roleFamilyCode ) => {
    const pool = module.exports.configRoleFamilyCompetencies?.[ roleFamilyCode ];
    return Array.isArray( pool ) ? pool : [];
};

/**
 * Returns the ordered stage-level codes (the discipline-agnostic ladder rungs), e.g. `[ "N", "J", "R", "S", "X", "T" ]`.
 * These double as the six scope anchors used throughout the competency dictionary.
 *
 * @method
 * @returns {Array<string>}
 * @public
 */
module.exports.getStageLevelCodes = () => {
    return Object.keys( module.exports.configStageLevels || {} );
};

/**
 * Returns the stage-level ladder as an ordered list of `{ code, stages }`, where `stages` is the array of valid stage
 * numbers for that level (e.g. `N → [ 1 ]`, `J → [ 1, 2, 3 ]`). Derived from `config.stage-levels.json` so the ladder
 * has a single source of truth.
 *
 * @method
 * @returns {Array<{code: string, stages: Array<number>}>}
 * @public
 */
module.exports.getStageLevelLadder = () => {
    return Object.entries( module.exports.configStageLevels || {} ).map( ( [ code, definition ] ) => {
        const stageCount = ( definition && Number.isInteger( definition.stages ) && definition.stages > 0 ) ? definition.stages : 1;
        const stages = [];
        for ( let stage = 1; stage <= stageCount; stage++ ) {
            stages.push( stage );
        }
        return { code: code, stages: stages };
    } );
};

/**
 * Returns the flattened stage-level identifiers used as relevancy-archetype curve keys — every `<level><stage>`
 * combination in ladder order, e.g. `[ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ]`.
 *
 * @method
 * @returns {Array<string>}
 * @public
 */
module.exports.getArchetypeStageLevels = () => {
    const levels = [];
    module.exports.getStageLevelLadder().forEach( ( entry ) => {
        entry.stages.forEach( ( stage ) => {
            levels.push( `${ entry.code }${ stage }` );
        } );
    } );
    return levels;
};

/**
 * Enum for the calendar slot status values.
 *
 * @readonly
 * @enum {SlotStatus}
 * @typedef {SlotStatusValue} SlotStatus
 */
const slotStatusEnum = tools.enum( {
    AVAILABLE: [ "available", "framework.slot.status.name.available", "framework.slot.status.description.available" ],
    BOOKED: [ "booked", "framework.slot.status.name.booked", "framework.slot.status.description.booked" ],
    BUSY: [ "busy", "framework.slot.status.name.busy", "framework.slot.status.description.busy" ],
    DELETED: [ "deleted", "framework.slot.status.name.deleted", "framework.slot.status.description.deleted" ]
} );
module.exports.slotStatus = slotStatusEnum;

/**
 * Enum for the appraisal cycle lifecycle status. One-way transitions: PLANNING → ACTIVE → CLOSED.
 *
 * @readonly
 * @enum {CycleStatus}
 * @typedef {CycleStatusValue} CycleStatus
 */
const cycleStatusEnum = tools.enum( {
    PLANNING: [ "PLANNING", "framework.cycle.status.name.planning", "framework.cycle.status.description.planning" ],
    ACTIVE: [ "ACTIVE", "framework.cycle.status.name.active", "framework.cycle.status.description.active" ],
    CLOSED: [ "CLOSED", "framework.cycle.status.name.closed", "framework.cycle.status.description.closed" ]
} );
module.exports.cycleStatus = cycleStatusEnum;

/**
 * Enum for the evaluation status values.
 *
 * @readonly
 * @enum {EvaluationStatus}
 * @typedef {EvaluationStatusValue} EvaluationStatus
 */
const evaluationStatusEnum = tools.enum( {
    NOT_STARTED: [ "Not Started", "framework.status.name.not-started", "framework.status.description.not-started" ],
    OPEN: [ "Open", "framework.status.name.open", "framework.status.description.open" ],
    IN_REVIEW: [ "In Review", "framework.status.name.in-review", "framework.status.description.in-review" ],
    READY: [ "Ready", "framework.status.name.ready", "framework.status.description.ready" ],
    CLOSED: [ "Closed", "framework.status.name.closed", "framework.status.description.closed" ],
    DELETED: [ "Deleted", "framework.status.name.deleted", "framework.status.description.deleted" ]
} );
module.exports.evaluationStatus = evaluationStatusEnum;

/**
 * Enum for the evaluation grade values.
 *
 * @readonly
 * @enum {EvaluationGrade}
 * @typedef {EvaluationGradeValue} EvaluationGrade
 */
const evaluationGradeEnum = tools.enum( {
    S: [ "S", "framework.grades.name.S", "framework.grades.description.S" ],
    R: [ "R", "framework.grades.name.R", "framework.grades.description.R" ],
    U: [ "U", "framework.grades.name.U", "framework.grades.description.U" ],
    N: [ "N", "framework.grades.name.N", "framework.grades.description.N" ]
} );
module.exports.evaluationGrade = evaluationGradeEnum;

/**
 * Enum for the performance threshold values.
 *
 * @readonly
 * @enum {PerformanceThreshold}
 * @typedef {PerformanceThresholdValue} PerformanceThreshold
 */
const performanceThresholdEnum = tools.enum( {
    T1: [ "T1", "framework.performance.threshold.name.T1", "framework.performance.threshold.description.T1" ],
    T2: [ "T2", "framework.performance.threshold.name.T2", "framework.performance.threshold.description.T2" ],
    T3: [ "T3", "framework.performance.threshold.name.T3", "framework.performance.threshold.description.T3" ],
    T4: [ "T4", "framework.performance.threshold.name.T4", "framework.performance.threshold.description.T4" ],
    T5: [ "T5", "framework.performance.threshold.name.T5", "framework.performance.threshold.description.T5" ]
} );
module.exports.performanceThreshold = performanceThresholdEnum;

/** @type {ConfigApplication} */
const configApplication = require( "#config-application" );

// Prevent further modifications to the settings object:
tools.deepFreeze( configApplication );

/**
 * A standard getter method for fetching a setting.
 *
 * @method
 * @param {string} setting Specifies either a dot-separated JSON path of the setting.
 * @param {*} [defaultValue] The default value to be returned if the setting is not found in the current configuration.
 * @returns {*}
 * @public
 */
module.exports.getSetting = ( setting, defaultValue ) => {
    return _.get( configApplication, setting, defaultValue );
};

/**
 * Configuration documents that become store-backed (editable via the admin config API), keyed by their admin
 * configKey → the property exported above. The file values loaded at module-load are the bootstrap defaults.
 *
 * @type {Object<string, string>}
 */
const STORE_BACKED = {
    "competencies": "configCompetencies",
    "relevancy-archetypes": "configRelevancyArchetypes",
    "active-competency-sets": "configActiveCompetencySets",
    "role-families": "configRoleFamilies",
    "role-family-competencies": "configRoleFamilyCompetencies",
    "stage-levels": "configStageLevels"
};
const fileDefaults = {};
Object.entries( STORE_BACKED ).forEach( ( [ configKey, property ] ) => {
    fileDefaults[ configKey ] = module.exports[ property ];
} );

/**
 * @method
 * @param {string} configKey
 * @param {Object} value
 * @private
 */
function applyStoreValue( configKey, value ) {
    if ( value !== undefined && value !== null ) {
        module.exports[ STORE_BACKED[ configKey ] ] = tools.deepFreeze( value );
    }
}

/**
 * Brings configuration under store control: seeds the store from the file defaults (empty-store-only), loads the
 * current store values into the exported config objects, and refreshes them whenever a `config:changed` event fires.
 * Idempotent. Reads stay synchronous — the exported `configX` objects are reassigned in place — and until this runs
 * (and without it) the exported objects are the file defaults, so the app works before/without store initialization.
 *
 * @method
 * @param {Object} [service] The framework config service (defaults to the `@ti-engine/web-framework/config-management` facade).
 * @returns {Promise}
 * @public
 */
module.exports.initialize = ( service ) => {
    const configService = service || require( "@ti-engine/web-framework/config-management" ).instance;
    return Promise.all( Object.keys( STORE_BACKED ).map( ( configKey ) => {
        return configService.seedDefault( configKey, fileDefaults[ configKey ] )
            .then( () => configService.getCurrent( configKey ) )
            .then( ( current ) => {
                if ( current ) applyStoreValue( configKey, current.value );
            } );
    } ) ).then( () => {
        configService.onConfigChanged( ( event ) => {
            const keys = ( event && event.configKeys ) || [];
            return Promise.all( keys.filter( ( key ) => STORE_BACKED[ key ] ).map( ( key ) => {
                return configService.getCurrent( key ).then( ( current ) => {
                    if ( current ) applyStoreValue( key, current.value );
                } );
            } ) );
        } );
    } );
};
