/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @typedef {Object} ConfigPerformanceAppraisals
 * @property {Object.<string, decimal>} evaluationWeights
 * @property {Object.<EvaluationGradeValue, decimal>} gradeWeights
 * @property {boolean} [isTeamEvaluationCollective]
 * @property {number} minTeamEvaluationMembers
 * @property {number} numberOfNextPeriodGoals
 * @property {Object.<PerformanceThresholdValue, number>} performanceThresholds
 */

/**
 * @typedef {Object} ConfigApplication
 * @property {ConfigPerformanceAppraisals} performanceAppraisals
 */

/**
 * @typedef {Object} ConfigCompetencies
 * @property {Object.<CompetencyCategory, Object>} categories
 * @property {Object.<string, Object>} competencies
 */

/**
 * @typedef {Object} EvaluationTeamGradeValues
 * @property {EvaluationGradeValue} [cumulative]
 * @property {EvaluationGradeValue[]} [individual]
 */

/**
 * @typedef {Object} EvaluationGradeEntry
 * @property {EvaluationGradeValue} [employee]
 * @property {EvaluationGradeValue} [manager]
 * @property {EvaluationTeamGradeValues|string} [team]
 */

/**
 * @typedef {"U"|"R"|"S"|"N"|""} EvaluationGradeValue
 */

/**
 * @typedef {"Open"|"In Review"|"Ready"|"Closed"|"Deleted"} EvaluationStatusValue
 */

/**
 * @typedef {"T1"|"T2"|"T3"|"T4"|"T5"} PerformanceThresholdValue
 */

/**
 * @typedef {Object} EvaluationWorkflow
 * @property {1|2|3|4|5|6|7|8} currentStep - Current step in the workflow.
 * @property {boolean} [selfEvaluationCompleted=false] - Indicates if self-evaluation has been completed.
 * @property {string} [selfEvaluationDeadline] - Deadline for self-evaluation submission (YYYY-MM-DD).
 * @property {boolean} [teamEvaluationCompleted=false] - Indicates if team-evaluation has been completed.
 * @property {string} [teamEvaluationDeadline] - Deadline for team-evaluation submission (YYYY-MM-DD).
 * @property {boolean} [managerEvaluationCompleted=false] - Indicates if manager-evaluation has been completed.
 * @property {string} [managerEvaluationDeadline] - Deadline for manager-evaluation submission (YYYY-MM-DD).
 * @property {number} [teamEvaluationsSubmitted=0] - Number of team evaluations submitted.
 * @property {string[]} [team] - A list of employee IDs of the team members to provide team-evaluation. IDs will be removed from the list once the corresponding evaluation has been submitted.
 */

/**
 * @typedef {Object} EvaluationFeedback
 * @property {string} [managerComment] - Comment submitted by the manager.
 * @property {string[]} [teamComments] - Comments submitted by the team members.
 */

/**
 * @typedef {Object} EvaluationScore
 * @property {number} score - Numeric score calculated by the framework.
 * @property {PerformanceThreshold|null} [interpretation] - Interpretation of the score determined by the framework.
 */

/**
 * @typedef {Object} Evaluation
 * @property {string} evaluationID - Unique identifier for the evaluation (UUID).
 * @property {string} employeeID - ID of the employee being evaluated.
 * @property {string} [managerID] - ID of the manager who reviews the evaluation.
 * @property {string} cycleID - Identifier of the evaluation cycle (e.g., 2025.H1).
 * @property {string} cycleDate - Official date of the evaluation cycle starting (YYYY-MM-DD).
 * @property {string|null} [interviewDate] - Date when the evaluation interview took place (YYYY-MM-DD).
 * @property {EvaluationStatusValue} status - Current status of the evaluation.
 * @property {Object.<string, EvaluationGradeEntry>} [grades] - Collection of grades keyed by competency ID.
 * @property {CareerPathCodeValue} careerPath - The career path of the employee at the time of this evaluation.
 * @property {string} stageLevel - The level and sage of the employee at the time of this evaluation.
 * @property {Object.<CompetencyCategory, EvaluationScore>} [scores] - The evaluation scores per category based on the given grades.
 * @property {EvaluationScore} [finalScore] - The final score of the evaluation itself.
 * @property {string} [comment] - Comment submitted by the employee.
 * @property {EvaluationFeedback} [feedback] - Feedback attached to the evaluation.
 * @property {EvaluationWorkflow} [workflow] - System workflow state for the evaluation.
 */

/**
 * @typedef {Object} EmployeePersonalInformation
 * @property {string} name - Full name of the employee.
 * @property {string} [email] - Corporate email address.
 * @property {CareerPathCodeValue} careerPath - Career path.
 * @property {CareerLevelCodeValue} level - Career path level.
 * @property {CareerLevelStageCodeValue} stage - Progression stage within the level.
 * @property {string} organizationUnitID - Organization unit ID.
 * @property {string} [organizationUnitName] - Organization unit display name.
 * @property {string} [startingDate] - Date of joining the company (YYYY-MM-DD).
 */

/**
 * @typedef {Object} EmployeeManagerInformation
 * @property {string} [name] - Name of the direct manager.
 * @property {string} managerID - Employee ID of the direct manager.
 */

/**
 * @typedef {Object} Employee
 * @property {string} employeeID - Unique identifier for the employee.
 * @property {EmployeePersonalInformation} personal - Personal information about the employee.
 * @property {EmployeeManagerInformation} [manager] - Information about the direct manager.
 */

/**
 * @typedef {Object} CompetencyScope
 * @property {string} N - Localization key for N-level scope.
 * @property {string} J - Localization key for J-level scope.
 * @property {string} R - Localization key for R-level scope.
 * @property {string} S - Localization key for S-level scope.
 * @property {string} X - Localization key for X-level scope.
 * @property {string} T - Localization key for T-level scope.
 */

/**
 * @typedef {Object} CompetencyRelevancy
 * @property {number} N1 - Relevancy score for N1 (1-10).
 * @property {number} J1 - Relevancy score for J1 (1-10).
 * @property {number} J2 - Relevancy score for J2 (1-10).
 * @property {number} J3 - Relevancy score for J3 (1-10).
 * @property {number} R1 - Relevancy score for R1 (1-10).
 * @property {number} R2 - Relevancy score for R2 (1-10).
 * @property {number} R3 - Relevancy score for R3 (1-10).
 * @property {number} S1 - Relevancy score for S1 (1-10).
 * @property {number} S2 - Relevancy score for S2 (1-10).
 * @property {number} S3 - Relevancy score for S3 (1-10).
 * @property {number} X1 - Relevancy score for X1 (1-10).
 * @property {number} T1 - Relevancy score for T1 (1-10).
 */

/**
 * @typedef {"E"|"I"|"C"} CompetencyCategory
 */

/**
 * @typedef {Object} Competency
 * @property {string} name - Localization key for competency name.
 * @property {string} description - Localization key for competency description.
 * @property {CompetencyCategory} category - Category code: E (Expertise), I (Insight), or C (Commitment).
 * @property {string} subcategory - Subcategory code matching the parent category.
 * @property {CompetencyScope} scope - Scope descriptions per career path level.
 * @property {CompetencyRelevancy} relevancy - Relevancy scores per career path level tier/stage.
 */

/**
 * @typedef {1|2|3|4} RoleCodeValue
 */

/**
 * @typedef {"SE01"|"PM01"|"BA01"} CareerPathCodeValue
 */

/**
 * @typedef {"N"|"J"|"R"|"S"|"X"|"T"} CareerLevelCodeValue
 */

/**
 * @typedef {1|2|3} CareerLevelStageCodeValue
 */

/**
 * @typedef {Object} OrganizationUnit
 * @property {string} id - Unique identifier for the organization unit.
 * @property {string} name - System name of the organization unit.
 * @property {string} [displayName] - Display name of the organization unit.
 * @property {string} description - Description of the organization unit.
 * @property {string} type - Type of the organization unit (e.g., "Department", "Division", "Team").
 * @property {string} managerID - Employee ID of the manager of the organization unit.
 * @property {Employee[]} [employees] - List of employees in the organization unit.
 * @property {string} [parent] - Parent organization unit ID.
 * @property {string[]|OrganizationUnit[]} [children] - List of child organization units or unit IDs.
 */
