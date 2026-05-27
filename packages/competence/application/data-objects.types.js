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
 * @property {number} [maxTeamEvaluationMembers]
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
 * @property {Object.<string, Competency>} competencies
 */

/**
 * @typedef {Object} ConfigRoleFamilies
 * @property {RoleFamily} SE
 * @property {RoleFamily} QE
 * @property {RoleFamily} BA
 * @property {RoleFamily} PM
 * @property {RoleFamily} XD
 * @property {RoleFamily} DA
 * @property {RoleFamily} IO
 * @property {RoleFamily} MC
 * @property {RoleFamily} PD
 */

/**
 * @typedef {Object} RoleFamily
 * @property {string} name - Localization key for the family name.
 * @property {string} description - Localization key for the family description.
 * @property {Object.<string, Specialization>} specializations - Permitted specializations, keyed by specialization code.
 */

/**
 * @typedef {Object} Specialization
 * @property {string} name - Localization key for the specialization name.
 * @property {string} description - Localization key for the specialization description.
 * @property {ECFMapping[]} eCFMapping - e-CF cross-walk entries; empty array when none.
 */

/**
 * @typedef {Object} ECFMapping
 * @property {string} competence - e-CF competence reference (e.g., B.6).
 * @property {string} level - e-CF level (e-1 through e-5).
 */

/**
 * @typedef {Object.<RoleFamilyCodeValue, FamilyCompetencyAssignments>} ConfigActiveCompetencySets
 */

/**
 * @typedef {Object} FamilyCompetencyAssignments
 * @description Keys are either the literal "baseline" or a specialization code. Each value maps cycleID → competency-code array.
 */

/**
 * @typedef {Object} ConfigStageLevels
 * @property {StageLevel} N
 * @property {StageLevel} J
 * @property {StageLevel} R
 * @property {StageLevel} S
 * @property {StageLevel} X
 * @property {StageLevel} T
 */

/**
 * @typedef {Object} StageLevel
 * @property {string} name
 * @property {string} description
 * @property {number} grade
 * @property {number} stages
 * @property {CareerLevelCodeValue[]} previous
 * @property {CareerLevelCodeValue[]} next
 */

/**
 * @typedef {Object} Cycle
 * @property {string} cycleID - e.g., "2026-H2".
 * @property {string} name - Display name (e.g., "Autumn '26 cycle").
 * @property {CycleStatusValue} status - Lifecycle status.
 * @property {string} cycleStart - Cycle start date (YYYY-MM-DD).
 * @property {string} cycleDate - Manager review deadline (YYYY-MM-DD).
 * @property {string} cycleEnd - Planned close date (YYYY-MM-DD).
 * @property {string|null} [actualCloseDate] - Set on CLOSE transition.
 * @property {string|null} [lockedAt] - ISO-8601 timestamp set on LOCK transition.
 * @property {string|null} [lockedBy] - Actor that locked the cycle.
 * @property {string} createdAt - Creation timestamp.
 * @property {string|null} [createdBy] - Actor that created the cycle.
 */

/**
 * @typedef {"PLANNING"|"ACTIVE"|"CLOSED"} CycleStatusValue
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} entryID - UUID.
 * @property {"employee"|"cycle"|"activeCompetencySet"} subjectType
 * @property {string} subjectID - Identifier of the subject entity.
 * @property {string} changedBy - Employee ID of the actor.
 * @property {string} timestamp - ISO-8601 timestamp.
 * @property {string} field - Dot-path of the field that changed.
 * @property {*} oldValue
 * @property {*} newValue
 * @property {string|null} [reason]
 */

/**
 * @typedef {Object} SnapshotEntry
 * @property {string} code - Competency code (e.g., E1-1).
 * @property {string} name - Localization key for the competency name.
 * @property {string} description - Localization key for the competency description.
 * @property {CompetencyCategory} category
 * @property {string} subcategory
 * @property {CompetencyScope} scope - Full scope map.
 * @property {CompetencyRelevancy} relevancy - Full per-stage-level relevancy.
 * @property {ECFMapping[]} [eCFMapping] - e-CF cross-walk if any.
 * @property {string} origin - Literal "baseline" or the specialization code that contributed this competency.
 * @property {string} [originLabel] - Localization key resolving to the user-facing origin label ("Baseline" or the specialization's localized name).
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
 * @property {string} shortID - Short human-readable identifier for the evaluation.
 * @property {string} employeeID - ID of the employee being evaluated.
 * @property {string} [managerID] - ID of the manager who reviews the evaluation.
 * @property {string} cycleID - Identifier of the evaluation cycle (e.g., 2026-H2).
 * @property {string} cycleDate - Manager review deadline date of the cycle (YYYY-MM-DD).
 * @property {string|null} [interviewDate] - Date when the evaluation interview took place (YYYY-MM-DD).
 * @property {EvaluationStatusValue} status - Current status of the evaluation.
 * @property {RoleFamilyCodeValue} roleFamily - Role family at evaluation creation time.
 * @property {SpecializationCodeValue|null} [specialization] - Specialization at evaluation creation time, or null for a generalist within the family.
 * @property {string} stageLevel - Stage-level at evaluation creation time (e.g., S2).
 * @property {SnapshotEntry[]} snapshot - Frozen competency list resolved at creation time. The form reads exclusively from this snapshot.
 * @property {Object.<string, EvaluationGradeEntry>} [grades] - Collection of grades keyed by competency ID.
 * @property {Object.<CompetencyCategory, EvaluationScore>} [scores] - The evaluation scores per category based on the given grades.
 * @property {EvaluationScore} [finalScore] - The final score of the evaluation itself.
 * @property {string} [comment] - Comment submitted by the employee.
 * @property {EvaluationFeedback} [feedback] - Feedback attached to the evaluation.
 * @property {EvaluationWorkflow} [workflow] - System workflow state for the evaluation.
 */

/**
 * @typedef {Object} EmployeePersonalInformation
 * @property {string} firstName - First name of the employee.
 * @property {string} lastName - Last name of the employee.
 * @property {string} [birthDate] - Birth date of the employee.
 * @property {string} [gender] - Gender of the employee.
 * @property {string} workMode - Work mode of the employee (e.g., "Full-time", "Part-time", "Contract").
 * @property {string} workLocation - Work location of the employee (e.g., "Remote", "On-site").
 */

/**
 * @typedef {Object} EmployeeCareerInformation
 * @property {string} organizationUnitID - Organization unit ID.
 * @property {RoleFamilyCodeValue} roleFamily - Role family code.
 * @property {SpecializationCodeValue|null} [specialization] - Specialization code, or null/absent for a generalist within the family.
 * @property {CareerLevelCodeValue} level - Stage-level code.
 * @property {CareerLevelStageCodeValue} stage - Progression stage within the level.
 * @property {string} [startingDate] - Date of joining the company (YYYY-MM-DD).
 */

/**
 * @typedef {Object} Employee
 * @property {string} employeeID - Unique identifier for the employee.
 * @property {string} [email] - Corporate email address.
 * @property {"active"|"on-leave"|"terminated"} [employmentStatus] - Employment status.
 * @property {EmployeePersonalInformation} personal - Personal information about the employee.
 * @property {EmployeeCareerInformation} career - Career information about the employee.
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
 * @property {CompetencyScope} scope - Scope descriptions per stage-level.
 * @property {ECFMapping[]} [eCFMapping] - Optional e-CF cross-walk.
 */

/**
 * @typedef {Object.<RoleFamilyCodeValue, Object.<string, CompetencyRelevancy>>} ConfigCompetencyRelevancy
 * @description Maps role family code → competency code → per-stage-level relevancy scores. Relevancy is role-family-specific
 * because the same competency can carry different importance across disciplines (e.g., shared transversal
 * competencies have different N1/X1 expectations between Software Engineering and Business Analysis).
 */

/**
 * @typedef {1|2|3|4} RoleCodeValue
 */

/**
 * @typedef {"SE"|"QE"|"BA"|"PM"|"XD"|"DA"|"IO"|"MC"|"PD"} RoleFamilyCodeValue
 */

/**
 * @typedef {string} SpecializationCodeValue
 * @description An uppercase, alphanumeric (with underscores) specialization code. Valid values are family-dependent; validate at runtime against `configuration-loader.getSpecializationCodes(roleFamily)`.
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
 * @property {string} type - Type of the organization unit (e.g., "Department", "Division", "Unit", "Team").
 * @property {string} [branch] - The branch structure the organization unit belongs to (e.g., "HQ", "Branch City A", "Branch Country B").
 * @property {string} [location] - The address location of the organization unit.
 * @property {string} managerID - Employee ID of the manager of the organization unit.
 * @property {Employee[]} [employees] - List of employees in the organization unit.
 * @property {string} [parent] - Parent organization unit ID.
 * @property {string[]|OrganizationUnit[]} [children] - List of child organization units or unit IDs.
 */

/**
 * @typedef {"available"|"booked"|"busy"|"deleted"} SlotStatusValue
 */
