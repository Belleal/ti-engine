/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const tools = require( "@ti-engine/core/tools" );

const configOrganizationPositionsEnum = tools.enum( require( "#config-positions" ) );
const configCompetencies = require( "#config-competencies" );
const configEvaluationGrades = require( "#config-grades" );
const configEvaluationLevels = require( "#config-position-levels" );
const configEvaluationPositionCompetencies = require( "#config-position-competencies" );

module.exports.organizationPositionCode = configOrganizationPositionsEnum;
module.exports.configCompetencies = tools.deepFreeze( configCompetencies );
module.exports.configEvaluationGrades = tools.deepFreeze( configEvaluationGrades );
module.exports.configEvaluationLevels = tools.deepFreeze( configEvaluationLevels );
module.exports.configEvaluationPositionCompetencies = tools.deepFreeze( configEvaluationPositionCompetencies );

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
 * Enum for the evaluation status values.
 *
 * @readonly
 * @enum {EvaluationStatus}
 * @typedef {EvaluationStatusValue} EvaluationStatus
 */
const evaluationStatusEnum = tools.enum( {
    OPEN: [ "Open", "Open", "The evaluation form is open for self and team submissions." ],
    IN_REVIEW: [ "In Review", "In Review", "The evaluation form is in review by the manager." ],
    READY: [ "Ready", "Ready", "The evaluation form was reviewed and is now ready for interview scheduling." ],
    CLOSED: [ "Closed", "Closed", "The evaluation form is closed and the evaluation cannot be modified." ],
    DELETED: [ "Deleted", "Deleted", "The evaluation form has been deleted and cannot be accessed." ]
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
    S: [ "S", "Superior", "The employee exceeds expectations for this competency at the current level." ],
    R: [ "R", "Regular", "The employee meets the expected standards for this competency at the current level." ],
    U: [ "U", "Unsatisfactory", "The employee shows skills below the expected standards for this competency at the current level." ]
} );
module.exports.evaluationGrade = evaluationGradeEnum;