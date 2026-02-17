# ti-engine competence package changelog

This document contains the list of changes made to the competence package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.0.2

* feat(data manager): replace `data-loader` with `data-manager` that supports data storage and retrival from Redis Cache
* feat(definitions): add typedefs for `Employee` and `Evaluation` with corresponding JSON Schemas
* feat(web-server): change `onStart` sequence to also initialize the new data manager
* feat(ui): add button bar to the evaluation screen with `save draft`, `reset`, and `submit` actions

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
