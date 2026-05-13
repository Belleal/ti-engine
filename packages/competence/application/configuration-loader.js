/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const _ = require( "lodash" );
const tools = require( "@ti-engine/core/tools" );

module.exports.configCareerPathCompetencies = tools.deepFreeze( require( "#config-career-path-competencies" ) );
module.exports.configCareerPathLevels = tools.deepFreeze( require( "#config-career-path-levels" ) );
/** @type {ConfigCompetencies} */
module.exports.configCompetencies = tools.deepFreeze( require( "#config-competencies" ) );
module.exports.configOrganizationStructure = tools.deepFreeze( require( "#config-organization-structure" ) );

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
 * Enum for the organization career path values.
 *
 * @readonly
 * @enum {CareerPathCode}
 * @typedef {CareerPathCodeValue} CareerPathCode
 */
const careerPathCodeEnum = tools.enum( {
    SE01: [ "SE01", "Software Engineer", "A career path suitable for a general software engineer position without a focus on specific technology stack." ],
    PM01: [ "PM01", "Project Manager", "A career path suitable for a standard project manager position that is responsible for managing a portfolio of projects." ],
    BA01: [ "BA01", "Business Analyst", "A career path suitable for a standard business analyst position that is responsible for analyzing business requirements and providing solutions." ]
} );
module.exports.careerPathCode = careerPathCodeEnum;

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