# ti-engine competence package changelog

This document contains the list of changes made to the competence package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.5.0

## Version 1.4.0

## Version 1.3.1

* feat(org): add `isSuperiorManagerOfEmployee()` to support superior-manager checks through the organization unit hierarchy
* feat(auth): replace direct-manager-only checks with hierarchy-aware `#canManagerPerformEvaluation()` across evaluation load/save/submit/start flows
* fix(web-app): calculate employees-list evaluation date by evaluation status (`OPEN` self/team deadline, `IN_REVIEW` manager deadline, `READY` interview date)
* feat(web-app): include `isCurrentUser` in employees-list payload entries
* fix(ui): update employees-list evaluation status rendering and prevent starting evaluations for the current user
* refactor(ui): remove hardcoded `employeesList` mock data from initial UI models
* build(release): bump package version to `1.3.1`

## Version 1.3.0

* feat(web-app): add `load-employee-list` data view and implement `#loadEmployeeList()` for organization-tree employee loading with role-aware visibility and evaluation access
* feat(org): extend `OrganizationManager` graph employee nodes with `careerPath`, `level`, `stage`, and `startingDate`
* feat(org): add organization graph query helpers (`resolveOrganizationUnitIDForEmployee`, `resolveEmployeeName`, `resolveParentUnitNames`, `getOrganizationUnitSubtree`)
* feat(data-manager): extend `fetchEvaluations()` to support bulk retrieval when `employeeID` is omitted
* feat(ui): implement employees-list controller data loading from `/app/load-employee-list` and add evaluation actions (`startEvaluation`, `openEvaluation`)
* feat(ui): rework `frame-employees-list` to render organization units and employees from the new hierarchical backend payload
* feat(css): update employees-list screen styling for organization section, career-path column, evaluation status display, and action layout
* feat(localization): add/update labels for employees-list organization/list sections and rename position label keys to career-path equivalents
* feat(config-loader): replace position-based exports with career-path-based exports and add grade code `N` (`Not Utilized`)
* feat(config): add/rename config files to `config.career-path-competencies.json`, `config.career-path-levels.json`, and `config.competencies.json`; remove `positions.json`
* feat(config): update organization structure seed naming/types (Organization/Division/Team display metadata)
* refactor(web-app): migrate evaluation and competency resolution logic from `position` to `careerPath`
* refactor(data): migrate employee seed data from `personal.position` to `personal.careerPath`
* refactor(schema): update employee and competencies schemas to use career-path terminology
* refactor(types): align data object typedefs with career-path naming and add organization-unit typedef
* refactor(ui): update competence-evaluation personal section bindings from `position` to `career-path`
* build(package): bump package version to `1.3.0` and update package import aliases for renamed config files
* build(scripts): add local build scripts for compiling competencies and competence labels from CSV sources (`bin/build/*.js`)
* chore(web-server): remove unused `#configuration-loader` import
* chore(test): remove obsolete competence package test suite files under `packages/competence/test/`
* docs(readme): expand module status/process workflow and role-based permission notes

## Version 1.2.0

* feat(org): add `OrganizationManager` singleton powered by `graphology` to build an organization chart from units and employees
* feat(org): add manager and organization context resolution (`resolveManagerIDForEmployee`, `resolveEmployeeOrganizationContext`) with parent-unit fallback
* feat(config): add `bin/config/config.organization-structure.json` and expose `configOrganizationStructure` via configuration loader
* feat(data-manager): add `fetchEmployees()` for bulk employee retrieval from cache or seeded fallback data
* feat(web-server): initialize organizational graph on startup after data initialization
* feat(web-app): add `employees-list` fragment registration and sidebar navigation action for the new screen
* feat(web-app): augment loaded evaluation personal context with `organizationUnitName` and graph-resolved manager info
* feat(web-app): set new evaluations `managerID` via organization graph resolution and use graph-based manager authorization checks
* feat(web-app): return grades from `evaluationGrade.properties` instead of external grades JSON configuration
* feat(ui): add employees list UI model and fragment scaffold with flat and hierarchical unit rendering
* feat(ui): update evaluation personal section to display organization unit name instead of department
* feat(css): add dedicated employees list layout and responsive styles
* feat(localization): add labels for employees list screen and rename personal section label key to organization unit
* refactor(data): replace employee `department`/embedded manager seed structure with `organizationUnitID` mapping and expanded seed dataset
* refactor(schema): update employee JSON schema to use `organizationUnitID` and remove required manager object
* refactor(types): align employee type definitions with organization-unit fields and optional manager data
* refactor(ui): migrate cloning and date formatting usage to framework toolbox helpers and remove `ti-user-interface.js` include from package index
* build(package): add import aliases `#config-organization-structure` and `#organization-manager`; remove `#config-grades`
* build(scripts): add local build utilities for generating competencies and competence labels from CSV sources (`bin/build/*.js`)
* build(deps): add `graphology` dependency
* build(release): bump package version from `1.1.0` to `1.2.0`
* test(app): update web application tests for organization unit and manager context behavior
* test(data): update data manager tests to validate `organizationUnitID`-based employee structure
* test(json): add organization-structure consistency validation between units and employee manager references

## Version 1.1.0

* feat(web-app): add `start-evaluation` service request handler with position-based competency initialization and active evaluation guard
* feat(web-app): add `#startEvaluation(session, employeeID)` private method to handle new evaluation creation flow
* feat(web-app): add `#getAllowedCompetencyCodes(positionKey, cycleID)` private method to compute position-based allowed competency codes
* feat(web-app): add `canEdit` and `deadlineDate` metadata to `load-evaluation` response for UI state management
* feat(web-app): update `#loadEvaluation` to return 404 `error.evaluation.no-evaluation-found` when no evaluation exists, instead of creating a new one
* feat(web-app): rework role-based grade anonymization; team data returns empty string for `TEAM_MEMBER`, cumulative value for `MANAGER`
* feat(ui): add `canEdit` and `deadlineDate` state properties to the competency evaluation model
* feat(ui): navigate to dashboard on HTTP 401 during `loadEmployeeEvaluation` and on successful `submitEvaluation`
* feat(ui): update `formatDate` to accept a `placeholder` parameter and return the corresponding label for invalid dates
* feat(ui): simplify `getItemGrade` and `setItemGrade` to use a flat `grades[competencyCode][role]` structure, removing team cumulative branching
* feat(ui): add a role banner to the evaluation form with employee, manager, and team color variants
* feat(ui): add `canEdit` guard to evaluation form container and action buttons
* feat(ui): replace interview date input with a static display showing the interview date and submission deadline
* feat(localization): add evaluation state labels (`active-evaluation-exists`, `already-completed-manager-evaluation`, `already-completed-team-evaluation`, `incomplete-grades`, `no-employee-found`, `no-evaluation-found`)
* feat(localization): add role-based banner labels (`interface.evaluation.banners.employee/manager/team`)
* feat(localization): add submission deadline and interview date UI labels for personal and appraisal sections
* feat(css): add `.role-banner` container with `employee`, `manager`, and `team` gradient color variants
* feat(error-handling): enforce explicit HTTP 401 on unauthorized access, 404 on missing employee/evaluation, and 422 on incomplete grades
* feat(config): add `COMPETENCE_PRELOAD_DATA` environment variable (default: `false`) to control data preloading at startup
* refactor(data): update `evaluations.json` seeder to use empty grade placeholders across all evaluation records
* build(deps): remove `postgres` direct dependency (delegated to framework layer)

## Version 1.0.2

* feat(config): add `config.application.json` with `performanceAppraisals` settings (`minTeamEvaluationMembers`, `numberOfNextPeriodGoals`)
* feat(config-loader): replace `organizationRoleCode` with `roleCode`; add `evaluationStatus` and `evaluationGrade` enum exports
* feat(data): add `bin/data/seeders/evaluations.json` seeder with workflow-aware evaluation records
* feat(data-manager): replace `data-loader` with `data-manager` that supports data storage and retrieval from Redis Cache
* feat(definitions): add typedefs for `Employee` and `Evaluation` with corresponding JSON Schemas
* feat(definitions): add `EvaluationStatusValue`, `EvaluationWorkflow`, and `EvaluationFeedback` typedefs
* feat(definitions): expand `Evaluation` typedef with `managerID`, `comment`, `feedback`, and `workflow` properties
* feat(definitions): restructure `Employee` typedef using `EmployeePersonalInformation` and `EmployeeManagerInformation` sub-types
* feat(definitions): add `CompetencyScope`, `CompetencyRelevancy`, `Competency`, and `RoleCodeValue` typedefs
* feat(definitions): update `EvaluationGradeEntry` with structured `team` grade containing `cumulative` and `individual` sub-fields
* feat(localization): add error messages for application and evaluation error scenarios
* feat(localization): add notification labels for `draft-saved` and `submitted` UI feedback messages
* feat(schema): update `employee.schema.json` with nested `personal` and `manager` objects
* feat(schema): update `evaluation.schema.json` with `managerID`, `comment`, `feedback`, `workflow` fields and expanded `status` enum (added `Ready`)
* feat(ui): add button bar to the evaluation screen with `save draft`, `reset`, and `submit` actions
* feat(ui): add team grade handling with `cumulative` and `individual` sub-structures in `getItemGrade`/`setItemGrade`
* feat(web-app): replace `load-employee-competencies` view with `load-evaluation` view
* feat(web-app): add `submit-evaluation` service request handler with role checks, deadline enforcement, and status transitions
* feat(web-app): add `save-evaluation-draft` service request handler with role-based authorization
* feat(web-app): add evaluation initialization logic with default workflow state, grades, feedback, and comment structures
* feat(web-app): add grade anonymization based on user role before returning evaluation responses
* feat(web-server): change `onStart` sequence to also initialize the new data manager
* refactor(config): remove static `roles.json` configuration file (replaced by dynamic role codes in configuration-loader)
* refactor(css): migrate CSS custom properties and class selectors from `competence-*` to `ti-*` design token naming scheme
* refactor(data): update `employees.json` seeder to use nested `manager` object structure
* refactor(data): move seed data files to `bin/data/seeders/` directory
* refactor(package): update `#data-employees` and `#data-evaluations` import mappings to reference seeder files; remove `#config-roles` import
* refactor(test): update all test references from `load-employee-competencies` to `load-evaluation` view
* refactor(test): remove `organizationRoleCode` test suite from configuration-loader tests
* refactor(ui): replace `isEmployee`/`isEmployeeManager` helpers with numeric `userRole` checks
* refactor(ui): rename `loadEmployee` to `loadEmployeeEvaluation` and update backend URL to `/app/load-evaluation`
* refactor(web-app): rename competency property keys (`code` → `competencyCode`, `categoryId` → `categoryID`, `subId` → `subID`)
* fix(data-manager): replace `E_WEB_INVALID_REQUEST_PARAMETERS` with `E_APP_RESOURCE_NOT_FOUND` for not-found scenarios
* fix(data-manager): use config-driven status values in `fetchEvaluations` instead of hard-coded strings
* fix(data-manager): update `saveEvaluation` to correctly return `Promise<Evaluation>` resolving with the saved evaluation
* docs(competence): add `README.md` with module overview and default process workflow diagram (Mermaid)

## Version 1.0.1

* feat(config): add new position competencies mapping file `bin/config/positionCompetencies.json`
* feat(config): add evaluation grades configuration file `bin/config/grades.json`
* feat(config): add comprehensive competency mappings for SOFTWARE_ENGINEER, PROJECT_MANAGER, and BUSINESS_ANALYST across all levels (N1-T1)
* feat(data): add employee data file `bin/data/employees.json` with sample employee records
* feat(data): add evaluation data file `bin/data/evaluations.json` with sample evaluation records
* feat(loader): add a configuration loader module for centralized configuration access with immutability guarantees
* feat(loader): add data loader singleton for employee and evaluation data retrieval
* feat(web-app): add `processDataRequest` method for handling data view requests
* feat(web-app): add config view support with augmented grades configuration
* feat(web-app): add a load-employee-competencies view with comprehensive data assembly
* feat(web-app): add competencies tree building with localization and position-based filtering
* feat(web-app): add grade normalization for employee, manager, and team evaluations
* feat(ui): add competence evaluation HTML fragment with Alpine.js integration
* feat(ui): add competence evaluation client-side data model and UI logic
* feat(ui): add nested competency list with category/subcategory/item hierarchy
* feat(ui): add personal information and appraisal panels
* feat(ui): add interactive grade selection inputs for employee, manager, and team roles
* feat(ui): add data loading, merging, and state management utilities
* feat(ui): add summary calculation methods (per-category and total)
* feat(ui): add date formatting and role-checking utilities
* feat(css): add comprehensive competence UI stylesheet with design system
* feat(css): add grid-based layouts for competency display and data values
* feat(css): add responsive media queries for mobile/tablet viewports
* feat(css): add special styling for grade inputs and category/subcategory headers
* feat(html): add main index.html page with HTMX integration and CSP nonce support
* feat(localization): add Bulgarian translations for competency labels
* feat(localization): add framework grades localization (R, S, U)
* feat(localization): add interface evaluation labels for personal, appraisal, and competencies sections
* feat(definitions): add new configuration exports (configEvaluationLevels, configCompetencies, configEvaluationGrades)
* feat(package): add package imports for all config and data files
* feat(package): add configuration-loader and data-loader import mappings
* feat(package): add test scripts (`test` and `test:json`)
* feat(test): add comprehensive unit tests for CompetenceWebApplication (50+ tests)
* feat(test): add comprehensive unit tests for CompetenceWebServer (70+ tests)
* feat(test): add comprehensive unit tests for configuration-loader (70+ tests)
* feat(test): add comprehensive unit tests for data-loader (40+ tests)
* feat(test): add JSON configuration validation tests (28 tests, all passing)
* feat(test): add test README with execution instructions and coverage summary
* feat(test): add test generation summary document with detailed metrics
* refactor(config): rename "competence" to "competency" throughout configuration and localization
* refactor(config): update competency IDs from string-based positions to position code-based mappings
* refactor(definitions): reorganize exports to use configuration-loader constants
* refactor(localization): expand and refine English descriptions for competencies
* build(deps): update postgres from ^3.4.7 to ^3.4.8
* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0
* build(env): update TI_AUDITING_LOG_MIN_LEVEL from 200 to 0
* docs(copyright): update copyright year from 2025 to 2026
* chore(cleanup): remove obsolete employee.json template file

## Version 1.0.0

* feat: first working prototype version
