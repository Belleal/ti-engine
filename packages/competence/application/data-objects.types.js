/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @typedef {Object} EvaluationGradeEntry
 * @property {EvaluationGradeValue} [employee]
 * @property {EvaluationGradeValue} [manager]
 * @property {EvaluationGradeValue} [team]
 */

/**
 * @typedef {"U"|"R"|"S"|""} EvaluationGradeValue
 */

/**
 * @typedef {Object} Evaluation
 * @property {string} evaluationID - Unique identifier for the evaluation (UUID).
 * @property {string} employeeID - ID of the employee being evaluated.
 * @property {string} cycleID - Identifier of the evaluation cycle (e.g., 2025.H1).
 * @property {string} cycleDate - Official date of the evaluation cycle starting (YYYY-MM-DD).
 * @property {string|null} [interviewDate] - Date when the evaluation interview took place (YYYY-MM-DD).
 * @property {"Open"|"In Review"|"Closed"|"Deleted"} status - Current status of the evaluation.
 * @property {Object.<string, EvaluationGradeEntry>} [grades] - Collection of grades keyed by competency ID.
 */

/**
 * @typedef {Object} Employee
 * @property {string} employeeID - Unique identifier for the employee.
 * @property {string} name - Full name of the employee.
 * @property {string} [email] - Corporate email address.
 * @property {string} [position] - Job title or position.
 * @property {string} [department] - Department name.
 * @property {string} [manager] - Name of the direct manager.
 * @property {string} [managerID] - Employee ID of the direct manager.
 * @property {"N"|"J"|"R"|"S"|"X"|"T"} level - Competency level.
 * @property {1|2|3} stage - Progression stage within the level.
 * @property {string} [startingDate] - Date of joining the company (YYYY-MM-DD).
 */
