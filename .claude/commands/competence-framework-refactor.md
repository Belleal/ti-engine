# Competence Framework Refactor — Claude Code Brief

This document specifies a structured refactor of the `competence` package in the `ti-engine` monorepo. The refactor introduces a three-dimensional competency model (Role Family × Specialization × Stage-Level), an Active Competency Set concept per evaluation cycle, a cycle lifecycle state machine, and supporting UI screens. Existing pilot data is **not preserved** — the refactor performs a destructive reseed against a fresh database state.

The work is organized into seven phases (0–6). Phase 0 is reconnaissance with no code changes; Phases 1–6 each produce an isolated commit. Phase 0 must be checkpointed with the project owner before continuing.

---

## 1. Context and Goals

The current `competence` package implements a two-dimensional competency-based appraisal model: each employee has a single `CareerPath` (currently `SE01`, `PM01`, `BA01`) and is evaluated against a flat list of competencies for that path during a cycle. This refactor moves to a three-dimensional model:

- **Role Family** (replaces Career Path) — a broad discipline, e.g., Software Engineering.
- **Specialization** (new, optional) — a narrower focus within a family, e.g., Backend.
- **Stage-Level** (unchanged) — the `N/J/R/S/X/T` ladder with dual-track at senior level.

The cycle itself becomes a first-class entity with a lifecycle (`PLANNING → ACTIVE → CLOSED`) and owns an Active Competency Set per `(roleFamily, specialization)` tuple. Evaluations snapshot their competency list at creation time, decoupling running evaluations from any subsequent configuration drift.

This work supports the project owner's eMBA dissertation on competency-based performance appraisal and, practically, prepares the framework for compliance with EU Directive 2023/970 (Pay Transparency) by providing auditable, deterministic, objective evaluation criteria.

---

## 2. Terminology

Throughout the codebase and this document, use the following terms consistently. Do not introduce synonyms.

| Term | Meaning |
|------|---------|
| **Role Family** | Top-level discipline. One of nine values (see §4). Replaces "Career Path." |
| **Specialization** | Optional second-level identity within a Role Family. Has its own code, name, description, and optional e-CF mapping. |
| **Stage-Level** | Seniority ladder code: `N1`, `J1`–`J3`, `R1`–`R3`, `S1`–`S3`, `X1`, `T1`. Dual track at the senior tier (`X` = Expert, `T` = Manager). |
| **Cycle** | An appraisal period with a unique ID (`YYYY-Hx` convention) and a lifecycle status. |
| **Baseline** | The set of competencies that applies to all employees of a given Role Family within a cycle, regardless of specialization. Keyed literally as `"baseline"` in the active competency sets data (no underscore prefix). |
| **Active Competency Set** | The resolved list of competency codes for a given `(roleFamily, specialization?, cycleID)`. Computed as `family.baseline[cycle] ∪ family.specialization[cycle]` (deduplicated). |
| **Snapshot** | A copy of the resolved Active Competency Set (with sufficient competency metadata for rendering) stored on an Evaluation record at creation time. |

---

## 3. Cross-Cutting Requirements

These apply to every phase. Failure on any of these is a phase failure.

1. **Module conventions.** CommonJS only. Use `#alias` imports per each package's `imports` map; never relative paths across modules.
2. **Architectural patterns.** Respect the `ServiceInstance / ServiceConsumer / ServiceProvider` hierarchy. Singletons (`DataManager`, `CompetenceFramework`, `OrganizationManager`, `CommonMemoryCache`) accessed via their exported instance. `deepFreeze` applied to loaded configuration. Never instantiate abstract base classes directly.
3. **Persistence.** All entity reads and writes go through `DataManager`. Never reach into Redis (or the future NoSQL store) from business logic, UI handlers, or services. Add new methods to `DataManager` for any new entity type.
4. **Server-side authorization.** Every mutation endpoint enforces role-based authorization server-side. Client-side gating is for UX only and never the sole guard.
5. **Audit trail.** Every employee-record write (field change, role family change, specialization change, manager reassignment, stage-level change, employment status change) produces an audit log entry: `{ employeeID, changedBy, timestamp, field, oldValue, newValue, reason? }`. Append-only.
6. **Design consistency.** All new UI uses existing component vocabulary from `packages/web-framework/bin/static/scripts/ti-framework.css` and the `ti-theme-black-glass.css` theme. Use CSS custom properties (`--ti-*`) — never raw colors, raw spacing, or off-grid dimensions. Existing components include `.ti-icon` (Heroicons-backed), `.ti-button` (and `.ti-button.inline`), `.ti-data-field`, `.ti-content.pane`, `.ti-glass-btn-black` (with `.large`, `.on-screen`, `.primary`, `.is-active` variants), and the `tiToolbox` Alpine store. New visual primitives introduced in this refactor (subcategory pills, origin badges, tree nodes) must be designed to match this language.
7. **Frontend stack.** HTMX + Alpine.js (CSP variant). Use `x-text-label` for label translation. Use `tiToolbox` utility methods rather than reimplementing helpers.
8. **Testing.** New logic in Phases 1 and 2 must be covered by `node --test` test files in `packages/competence/test/`. UI phases produce manual verification steps in the commit message.
9. **Localization.** Every user-visible string uses a localization key. Add keys to both `en` and `bg` locales in `bin/localization/competence-labels.json`.
10. **No backward compatibility.** Existing pilot data is discarded. Do not maintain aliases, fallbacks, or legacy code paths for the old `CareerPath` world. Where the old name appears, replace it.

---

## 4. Locked Design Decisions

These are settled. Do not deviate without escalating to the project owner.

**The nine Role Families and their permitted Specializations:**

| Code | Role Family | Specializations |
|------|-------------|-----------------|
| `SE` | Software Engineering | `BACKEND`, `FRONTEND`, `MOBILE`, `FULLSTACK`, `EMBEDDED` |
| `QE` | Quality Engineering | `MANUAL`, `AUTOMATION`, `PERFORMANCE`, `SECURITY` |
| `BA` | Business Analysis | `REQUIREMENTS`, `PROCESS`, `PRODUCT_OWNERSHIP`, `DATA_BA`, `DOC_PROC` |
| `PM` | Project & Delivery Management | `AGILE`, `TRADITIONAL`, `PROGRAM` |
| `XD` | Experience Design | `RESEARCH`, `INTERACTION`, `VISUAL`, `SERVICE` |
| `DA` | Data & Analytics | `ENGINEERING`, `ANALYTICS`, `ML`, `RESEARCH` |
| `IO` | Infrastructure & Ops | `DEVOPS`, `SRE`, `CLOUD`, `SYSADMIN`, `SECOPS` |
| `MC` | Marketing & Communications | `DIGITAL`, `BRAND_PR`, `CONTENT`, `INTERNAL_COMMS` |
| `PD` | Product Management | `STRATEGY`, `OWNERSHIP`, `ACCOUNT`, `GROWTH` |

**Other locked decisions:**

- **Baseline keyword**: literal string `"baseline"` (no underscore prefix).
- **e-CF mapping**: stored at both competency level (in `config.competencies.json`) and specialization level (in `config.role-families.json`). Placeholder values acceptable initially; empty arrays where no mapping exists.
- **Specialization permanence**: permanent identity, editable only by HR (Supervisor) and Manager. Not editable by the Employee.
- **Specialization can be unset (cleared).** This is a valid state — employee becomes a generalist within the family.
- **Mandatory floor coverage** for a cycle's Active Competency Set: validated against **baseline only**. Each of the nine subcategories (`E1, E2, E3, I1, I2, I3, C1, C2, C3`) must have at least one competency in the baseline of every active Role Family. Specializations are purely additive — they do not contribute to floor satisfaction.
- **Hard cap** on resolved set size: configurable, default `30`. Enforced at lock time; exceeded sets cannot transition the cycle to `ACTIVE`.
- **Cycle lifecycle**: `PLANNING → ACTIVE → CLOSED`. One-way transitions. No back-edits to a locked cycle. New cycles required for new configuration.
- **Cycle ID convention**: auto-suggested `YYYY-Hx` (e.g., `2026-H2`), editable in the create form, uniqueness validated.
- **Per-stage-level relevancy weights** stay on competency records (in `config.competencies.json`). The Active Competency Set selects *which* competencies apply; it does not override weights.
- **Snapshot rule**: at evaluation creation, copy the resolved set plus per-competency metadata (name, description, subcategory, scope per stage-level, relevancy per stage-level, e-CF mapping, origin marker = `"baseline"` or specialization code) onto the evaluation record. The form reads exclusively from the snapshot thereafter.
- **Persistence model**: seed-and-manage. JSON config files in `bin/config/` are bootstrap data only. After seeding, the database is authoritative. Re-seeding is destructive (wipes affected collections, reloads from JSON). No idempotent-additive seeding in this phase.
- **Permission matrix on Employee record fields**:

  | Field | Supervisor | Manager | Employee |
  |---|---|---|---|
  | Name | edit | read | read (self) |
  | Contact info | edit | read | read (self) |
  | Role family | edit | read | read |
  | Specialization | edit | edit | read |
  | Stage-level | edit | read | read |
  | Career track at S3 (X vs T) | edit | read | read |
  | Manager assignment | edit | read | read |
  | Employment status | edit | read | read (self) |
  | Hire date | edit | read | read |

---

## 5. Phase 0 — Familiarization (No Code Changes)

**Goal**: produce a written inventory of the codebase artifacts this refactor will touch, confirming the assumptions in this brief are accurate. **No code changes.** Checkpoint with the project owner before proceeding to Phase 1.

**Actions:**

1. Read `ti-engine.md` at the repo root for monorepo orientation. Confirm version numbers, file paths, and enum names match what this brief assumes. Note any drift.
2. Read the theme-based design-system files:
   - `packages/web-framework/bin/static/scripts/ti-framework.css`
   - `packages/web-framework/bin/static/scripts/ti-theme-daylight.css`
   - `packages/web-framework/bin/static/scripts/ti-theme-black-glass.css`
   - Any CSS files in `packages/competence/bin/static/`
   Document the design tokens available (CSS custom properties), the component classes, the icon set, and the spacing/sizing conventions.
3. Read two existing screen implementations end-to-end: the **Employees List** screen and the **Competence Evaluation** screen. Document the patterns used: how fragments are structured, how Alpine.js state is organized, how HTMX requests are dispatched, how server-side handlers respond, how localization keys are used.
4. Read the application core:
   - `packages/competence/application/configuration-loader.js`
   - `packages/competence/application/data-manager.js`
   - `packages/competence/application/competence-framework.js`
   - `packages/competence/application/organization-manager.js`
5. Read all files in `packages/competence/bin/config/` and `packages/competence/bin/data/schemas/`.
6. Identify every call site of `getAllowedCompetencyCodes(careerPath, cycleID)` (or any other API touching the old `CareerPath` concept). List file paths and line numbers.
7. Identify every reference to `CareerPathCode`, `careerPath`, or `SE01`/`PM01`/`BA01` in code, config, schemas, and tests. List them.

**Deliverable**: a Markdown summary written to `packages/competence/REFACTOR_PHASE0_INVENTORY.md` containing:
- Design-token and component inventory (with example usages from the existing screens).
- Call-site inventory for the old `CareerPath` API.
- Reference inventory for the old enum and codes.
- Any flagged inconsistencies with this brief (don't fix them — flag them).

Commit message: `docs(competence): phase 0 inventory for framework refactor`. No code changes in this commit.

**Acceptance check (project owner reviews before Phase 1 starts)**: the inventory file exists, lists every relevant location, and surfaces any drift between this brief and the actual codebase.

---

## 6. Phase 1 — Data Model and Configuration

**Goal**: introduce all new entities at the data layer. After this phase, the application doesn't yet use the new model — Phase 2 wires it in — but the schemas, seed data, `DataManager` methods, and enum updates are all in place.

### 6.1 Configuration Files

**Create** `packages/competence/bin/config/config.role-families.json`. Structure:

```json
{
  "SE": {
    "name": "role-family.name.SE",
    "description": "role-family.description.SE",
    "specializations": {
      "BACKEND": {
        "name": "role-family.SE.specialization.name.BACKEND",
        "description": "role-family.SE.specialization.description.BACKEND",
        "eCFMapping": []
      },
      "FRONTEND": { "...": "..." },
      "MOBILE": { "...": "..." },
      "FULLSTACK": { "...": "..." },
      "EMBEDDED": { "...": "..." }
    }
  },
  "QE": { "...": "..." },
  "BA": { "...": "..." },
  "PM": { "...": "..." },
  "XD": { "...": "..." },
  "DA": { "...": "..." },
  "IO": { "...": "..." },
  "MC": { "...": "..." },
  "PD": { "...": "..." }
}
```

All nine families and their full specialization lists per §4. Use placeholder localization keys (the strings themselves go in `competence-labels.json`). `eCFMapping` arrays start empty.

**Rename** `packages/competence/bin/config/config.career-path-competencies.json` → `config.active-competency-sets.json` and replace its contents with the new nested structure:

```json
{
  "SE": {
    "baseline": {
      "2026-H2": ["E1-1", "E1-2", "I1-1", "I2-1", "C1-1", "C2-1", "C3-1"]
    },
    "BACKEND": {
      "2026-H2": ["E2-3", "E2-4"]
    }
  },
  "BA": { "...": "..." },
  "PM": { "...": "..." }
}
```

Seed data should include at minimum a valid baseline for `SE`, `BA`, `PM` for cycle `2026-H2`, satisfying floor coverage (at least one competency from each of the nine subcategories). The existing nine-competency baseline in the old file is insufficient (it likely misses several subcategories) — extend it to cover all nine, drawing from the existing dictionary. The remaining six families (`QE`, `XD`, `DA`, `IO`, `MC`, `PD`) can have empty configurations for the seed cycle; they'll be populated via the UI later.

**Rename** `packages/competence/bin/config/config.career-path-levels.json` → `config.stage-levels.json`. Content unchanged structurally; only the filename changes. Update all references.

**Update** `packages/competence/bin/config/config.competencies.json`. Add an optional `eCFMapping` field to each competency record. Field shape:

```json
"eCFMapping": [
  { "competence": "B.6", "level": "e-3" }
]
```

Empty array is the default. Populate placeholder values where a clean cross-walk to e-CF is obvious (the project owner will refine later); leave empty otherwise. **Existing fields (category, subcategory, scope, relevancy) are not modified.**

### 6.2 JSON Schemas

For every config file created or restructured in 6.1, add or update the corresponding schema in `packages/competence/bin/data/schemas/`:

- `schema.role-families.json` (new)
- `schema.active-competency-sets.json` (replaces `schema.career-path-competencies.json` — delete the old one)
- `schema.stage-levels.json` (renamed from `schema.career-path-levels.json`)
- `schema.competencies.json` (extended with optional `eCFMapping`)

Update `npm run test:json` to validate against the new schema set.

### 6.3 Enum Updates

In `packages/competence/application/configuration-loader.js`:

- **Remove** the `CareerPathCode` enum.
- **Add** a `RoleFamilyCode` enum with values `SE, QE, BA, PM, XD, DA, IO, MC, PD`, frozen.
- Specialization codes are **not** a top-level enum — they're nested under each family in the role-families configuration. Expose a helper, e.g., `getSpecializationCodes(roleFamilyCode)`, that returns the valid specialization codes for a given family.
- Add a `CycleStatus` enum: `PLANNING, ACTIVE, CLOSED`, frozen.
- Existing enums (`RoleCode`, `EvaluationStatus`, `EvaluationGrade`) are unchanged.

### 6.4 DataManager Extensions

In `packages/competence/application/data-manager.js`, add CRUD methods for the new entity types. Naming consistent with existing methods.

- **Role families**: `getRoleFamilies()`, `getRoleFamily(code)`, `getSpecializationsForFamily(familyCode)`. Read-only in this refactor (no UI to edit yet). Backed by the seeded data.
- **Cycles**: `createCycle(cycleData)`, `getCycle(cycleID)`, `getAllCycles()`, `updateCycleStatus(cycleID, newStatus)`, `getActiveCycle()` (returns the single cycle in `ACTIVE` state, or null).
- **Active Competency Sets**: `getActiveCompetencySet(roleFamily, specialization, cycleID)` (returns resolved baseline ∪ specialization, deduplicated, sorted), `getBaselineSet(roleFamily, cycleID)`, `getSpecializationSet(roleFamily, specialization, cycleID)`, `setActiveCompetencySet(roleFamily, specialization|"baseline", cycleID, competencyCodes)`.
- **Employees**: extend existing methods to handle the new fields. The employee record schema gains `roleFamily` (replacing `careerPath`) and optional `specialization`. Validation: `specialization` must be a valid specialization code for the assigned `roleFamily`, or null.
- **Audit log**: `appendAuditEntry(entry)`, `getAuditEntriesForEmployee(employeeID)`. Append-only collection.

### 6.5 Seeder

Update the destructive seeder so it:

1. Wipes the relevant data collections (role families, specializations, cycles, active competency sets, employees, evaluations, audit logs — but **not** competencies dictionary or stage-levels structure on every run unless explicitly requested).
2. Loads `config.role-families.json` → role families collection.
3. Loads `config.competencies.json` → competencies dictionary collection.
4. Loads `config.stage-levels.json` → stage-levels collection.
5. Loads `config.active-competency-sets.json` → cycles (creates the `2026-H2` cycle in `PLANNING` state) and active competency sets.
6. Seeds a small set of test employees representative of the new model (at least one per Role Family among `SE/BA/PM`, mixed specializations, mixed stage-levels). A minimum of 10 employees is reasonable.
7. Guard the destructive seeder with an environment check that prevents accidental production runs (e.g., requires `NODE_ENV=development` or an explicit `--force` flag).

### 6.6 Acceptance Criteria for Phase 1

- All four config files (`role-families`, `active-competency-sets`, `stage-levels`, `competencies`) exist and validate against their schemas.
- `npm run test:json` passes.
- The seeder runs cleanly against an empty Redis: `node bin/seed.js` (or whatever the existing entry point is) produces the expected entities.
- `DataManager.getRoleFamilies()`, `DataManager.getAllCycles()`, `DataManager.getActiveCompetencySet("SE", null, "2026-H2")`, and `DataManager.getActiveCompetencySet("SE", "BACKEND", "2026-H2")` all return correct results.
- No code outside `DataManager` references Redis directly for the new entities.
- The old `CareerPathCode` enum, the old `config.career-path-competencies.json` file, and the old schema file are gone.

Commit message: `feat(competence)!: introduce role family + specialization + cycle data model (phase 1)`.

---

## 7. Phase 2 — Application Logic

**Goal**: implement the resolution function, validation rules, cycle lifecycle state machine, and snapshot semantics in `competence-framework.js`. After this phase, the system can resolve and validate Active Competency Sets and lock cycles, even though no UI yet exists to drive it.

### 7.1 Resolution Function

Replace any existing `getAllowedCompetencyCodes(careerPath, cycleID)` (or equivalent) with:

```js
// In competence-framework.js
function getActiveCompetencySet(roleFamily, specialization, cycleID) { /* ... */ }
```

Behavior:

1. Look up baseline for `(roleFamily, cycleID)`. If absent, throw an `E_APP_*` exception (configurable; missing baseline for active cycle is a configuration error).
2. If `specialization` is provided (non-null), look up the specialization set for `(roleFamily, specialization, cycleID)`. If absent, treat as empty array. **Not an error.**
3. Return union, deduplicated, sorted by competency code ascending.

Update every call site (per Phase 0 inventory) to use the new function.

### 7.2 Validation Rules

Implement a validator that runs when transitioning a cycle from `PLANNING` to `ACTIVE`. Pure function, testable in isolation.

```js
function validateCycleForLock(cycleID) {
  // Returns { valid: boolean, errors: [ { family, specialization?, rule, detail } ] }
}
```

Rules applied to every `(roleFamily)` that has any data for the cycle (baseline or any specialization):

1. **Baseline floor coverage**: baseline must contain at least one competency from each of `E1, E2, E3, I1, I2, I3, C1, C2, C3`. Failure reports the missing subcategory.
2. **Cap**: for the family's baseline and every specialization sub-list, the resolved set (baseline ∪ specialization) must have size ≤ configured cap. The cap is read from `config.application.json`; default `30`. Failure reports the actual size.
3. **Reference integrity**: every competency code referenced must exist in the competencies dictionary; every specialization code must exist under the parent family in role families. Failure reports the offending code.
4. **No empty baseline**: a family with any specialization data for the cycle must also have a non-empty baseline. Failure reports the family.

Errors are structured (per-family, per-rule, with detail) so the UI can render them inline next to the offending fields.

### 7.3 Cycle Lifecycle State Machine

Implement strict one-way transitions:

- `PLANNING → ACTIVE`: only via `lockCycle(cycleID)`, which runs `validateCycleForLock` first and aborts on any failure. On success, also persists a `lockedAt` timestamp and `lockedBy` user ID.
- `ACTIVE → CLOSED`: via `closeCycle(cycleID)`. Optionally triggered automatically by a scheduled job at the cycle's planned-close date — implement the manual close action now; the scheduled job is out of scope for this refactor.
- All other transitions: rejected with `E_APP_*` exception.

Enforce: `getActiveCycle()` returns the unique cycle in `ACTIVE` state. The system permits **at most one** cycle in `ACTIVE` state at any time. Attempting to lock a second cycle while one is already active fails with a clear error.

### 7.4 Snapshot at Evaluation Creation

When an evaluation is created (existing code path triggered from the Employees List screen), the snapshot must be built and stored on the evaluation record. Snapshot includes, for each competency in the resolved set:

- Competency code, name (localization key), description (localization key), category, subcategory.
- Scope per stage-level (full set, all six levels) — needed because the form may render scope text for the employee's specific stage-level.
- Relevancy per stage-level (full map) — needed because the score calculation uses the relevancy for the employee's stage-level.
- e-CF mapping (if non-empty).
- **Origin marker**: literal `"baseline"` or the specialization code (e.g., `"BACKEND"`). Used by the form to render the origin badge.

The evaluation form reads exclusively from this snapshot. It must not call the competencies dictionary at render time.

### 7.5 Tests

Add `node --test` files in `packages/competence/test/`:

- `test/competence-framework.resolution.test.js` — covers baseline-only, baseline + specialization, missing baseline (throws), missing specialization (empty add), deduplication, sort order.
- `test/competence-framework.validation.test.js` — covers each of the four validation rules in pass and fail cases.
- `test/competence-framework.lifecycle.test.js` — covers each valid and invalid transition; covers single-active-cycle invariant.
- `test/competence-framework.snapshot.test.js` — covers snapshot construction completeness and immutability after creation.

### 7.6 Acceptance Criteria for Phase 2

- `npm test` passes, including all new test files.
- `getActiveCompetencySet()` returns correct resolved sets for seeded data.
- `validateCycleForLock()` correctly accepts a well-formed cycle and rejects each of the four failure modes.
- Lock and close transitions enforce the lifecycle correctly.
- Snapshots produced at evaluation creation contain all required fields and are not mutated by subsequent dictionary changes.

Commit message: `feat(competence)!: resolution, validation, lifecycle, snapshot (phase 2)`.

---

## 8. Phase 3 — HR Supervisor UI: Cycle Management and Cycle Setup

**Goal**: two new screens accessible to Supervisor (HR) only.

### 8.1 Cycle Management Screen

Route: e.g., `/cycles`. Supervisor-only.

UI: table of all cycles, ordered by `createdAt` descending. Columns: cycle ID, name, created date, planned close date, actual close date, status (badge with `.ti-glass-btn-black` styling variants — `is-active` for `ACTIVE`, dimmed for `CLOSED`, default for `PLANNING`), evaluation counts (in-progress / completed), action buttons.

Per-row actions:

- **Open**: navigates to the Cycle Setup screen for that cycle. Always available; the Setup screen renders read-only for non-`PLANNING` cycles.
- **Lock**: visible only on `PLANNING` rows. On click, runs `validateCycleForLock` server-side. If errors, opens a modal listing them grouped by family. If clean, shows a confirmation modal: "Locking will freeze all active competency sets and permit evaluations to start. This cannot be undone." On confirm, transitions to `ACTIVE`.
- **Close**: visible only on `ACTIVE` rows. Confirmation: "Closing prevents new evaluations from being started. In-flight evaluations can still be completed." Transitions to `CLOSED`.

Page-level action: **Create Cycle**. Opens a small modal form. Cycle ID field auto-suggests `YYYY-Hx` based on current date (use `tiToolbox.formatDate` and date logic to determine H1 vs H2), editable. Name field (free text). Planned close date field. On submit, creates a new cycle in `PLANNING` state.

### 8.2 Cycle Setup Screen

Route: e.g., `/cycles/:cycleID/setup`. Supervisor-only. Read-only if cycle status is not `PLANNING`.

Layout: two-pane (left tree, right editor). Use `.ti-content.pane` for both panes; respect the existing layout grid.

**Left pane** — navigation tree. For each Role Family:

- A family node showing the family name, expanded by default.
- Under each family: a `baseline` node, plus one node per specialization defined in that family's configuration.
- Each node displays a status indicator:
  - ✓ if data exists and validates cleanly for the cycle.
  - ⚠ if data exists with validation errors (hover for detail).
  - — (em dash) if data exists but is intentionally empty — the explicit "no extra competencies for this cycle" state (see 8.3 below).
  - blank / outline if not yet configured.

Tree node styling: use `.ti-glass-btn-black` variants for selection state.

**Right pane** — competency editor for the selected node.

Header: family + node label, e.g., "Software Engineering — Baseline" or "Software Engineering — Backend".

Below header, three indicator rows:

- **Cap usage**: "12 of 30 competencies selected." For specialization nodes, show resolved size: "Baseline (12) + Specialization (5) = 17 of 30." Color shifts red when exceeded.
- **Subcategory floor coverage** (baseline nodes only): nine pills for `E1, E2, E3, I1, I2, I3, C1, C2, C3`. Pill is filled-green when satisfied, outlined-red when missing. Real-time updates as competencies are added/removed.
- **"This specialization has no extra competencies for this cycle" checkbox** (specialization nodes only). When checked, the node displays as ✓ (em dash → ✓) instead of "not configured." Persists as an explicit empty-but-intentional marker.

Competency list: each row shows competency code, localized name, subcategory tag, e-CF mapping (inline, only when present — render as a small `.ti-data-value`-styled tag), per-stage-level relevancy on hover, and a remove icon (`.ti-icon` variant).

**Add Competency** button: opens a picker modal. Filters: category (E/I/C), subcategory (E1–C3), free text search on code or name. Shows all competencies in the dictionary. Multi-select with confirm.

**Clone from...** dropdown:

- "Clone from previous cycle" — copies the active set from the same `(roleFamily, specialization)` in the most recent prior cycle, if any.
- "Clone from another (family, specialization)" — opens a picker.

Cloning replaces the current node's content (with a confirmation modal if non-empty).

**Save**: persists the current state to the database. Does not lock. Saves remain editable until the cycle is locked.

### 8.3 Backend Handlers

In `packages/competence/bin/competence-web-server.js` and `competence-web-application.js`:

- New service handlers: `cycles.list`, `cycles.create`, `cycles.lock`, `cycles.close`, `cycles.get`, `activeCompetencySets.get`, `activeCompetencySets.set`, `activeCompetencySets.markEmpty`, `competencies.search` (for the picker).
- All Supervisor-only (server-side enforced via `RoleCode.SUPERVISOR`).
- All write handlers validate input against schemas before persisting.

### 8.4 Acceptance Criteria for Phase 3

- Cycle Management screen lists cycles correctly, supports create/lock/close, enforces lifecycle.
- Cycle Setup screen renders the two-pane editor with real-time validation indicators.
- All UI uses existing component vocabulary and design tokens; no bespoke colors, off-grid spacing, or raw pixel values.
- Lock action runs full validation and refuses to transition on any error.
- Server-side authorization rejects non-Supervisor access on every endpoint.
- Manual verification: a fresh-seeded cycle can be edited, validated, and locked through the UI without touching JSON.

Commit message: `feat(competence): cycle management and setup screens (phase 3)`.

---

## 9. Phase 4 — Employee Management Screen

**Goal**: a master-detail screen for managing employee records. Replaces JSON-file editing of the employee roster. Shared between Supervisor and Manager with permission-gated controls per the matrix in §4.

### 9.1 Layout

Route: e.g., `/employees/manage`. Both Supervisor and Manager can access; scope differs (Supervisor sees all, Manager sees direct reports only — enforced server-side).

Master pane: searchable, filterable list. Filters: role family, specialization, stage-level, manager, employment status. Search: free-text on name. Default sort: by name ascending.

Detail pane: form for the selected employee, with field-level permission gating per §4. Read-only fields render as `.ti-data-value`; editable fields as `.ti-data-field` with appropriate input variants.

Below the form, a tabbed area:

- **Details** (default): the form.
- **Evaluations**: list of the employee's evaluations across cycles (read-only).
- **Audit** (Supervisor-only): the audit log entries for this employee, ordered descending. Each entry shows timestamp, actor, field, old value, new value. Manager users do not see this tab.

### 9.2 Behavior

- **Save**: validates and persists. On any field change, writes an audit log entry per §3 cross-cutting requirement.
- **Role family change**: confirmation modal — "Changing role family will affect all future evaluations. In-flight evaluations are not affected (they retain their snapshotted competency sets). N in-flight evaluations will continue with their original set. Continue?" Show N as a real count.
- **Specialization change or clear**: same logic, lighter confirmation modal.
- **Validation on save**: specialization (if set) must belong to the assigned role family; stage-level must follow the dual-track rule (`S1/S2/S3` then `X1` or `T1`); manager assignment must be a valid Manager-role employee; no circular reporting.

### 9.3 Create Employee

Supervisor-only action: **New Employee** button on the master pane. Opens an empty detail form. Manager assignment required; specialization optional. On save, creates the record and an initial audit entry.

### 9.4 Coexistence with the existing Employees List

The existing Employees List screen (hierarchical org-chart view) is preserved unchanged. It remains the navigation/browsing tool. The new Employee Management screen is the editing tool. They link to each other where appropriate (e.g., a "Manage this employee" action from the list view jumps to the management screen with the employee preselected).

### 9.5 Backend Handlers

- `employees.list` (scope-aware: Supervisor full, Manager direct-reports), `employees.get`, `employees.create` (Supervisor-only), `employees.update` (field-level authorization), `employees.getAuditLog` (Supervisor-only).
- All writes produce audit entries via `DataManager.appendAuditEntry`.

### 9.6 Acceptance Criteria for Phase 4

- Supervisor can view, create, and edit any employee record; all field changes appear in the audit log.
- Manager can view direct reports only; can edit specialization on those reports; cannot edit any other field; does not see the Audit tab.
- Permission gating enforced server-side (verifiable by direct API call as a Manager attempting to mutate a forbidden field — request rejected with 403 or equivalent).
- Role family change shows correct in-flight evaluation count and does not affect those evaluations after change.
- UI uses existing component vocabulary; visual consistency with Cycle screens from Phase 3.

Commit message: `feat(competence): employee management screen with audit log (phase 4)`.

---

## 10. Phase 5 — Evaluation Form and Start-Evaluation Handler

**Goal**: small but important changes — the evaluation form reads from the snapshotted set with the new contextual information rendered, and the existing "start evaluation" action on the Employees List screen uses the new resolution + snapshot path.

### 10.1 Start-Evaluation Handler

The existing action triggered from the Employees List screen with a known `employeeID`:

1. Look up the employee record.
2. Look up the currently active cycle via `getActiveCycle()`. If none, abort with a clear UI error: "No active appraisal cycle. Contact HR."
3. Call `getActiveCompetencySet(employee.roleFamily, employee.specialization, cycle.id)`.
4. Validate that the resolved set is non-empty and that the cycle is in `ACTIVE` state.
5. Create the evaluation record, building the snapshot per Phase 2 spec.
6. Return the evaluation to the form.

### 10.2 Evaluation Form Updates

The form template gains:

- **Context header**: below the employee's name, render three `.ti-data-value` entries: role family (resolved name), specialization (resolved name, or "Generalist" if unset), stage-level. Style consistent with other forms in the app.
- **Per-competency origin marker**: a small badge next to each competency code. Text is either "Baseline" (localized) or the specialization name (localized). Style: light `.ti-data-value` variant; do not over-emphasize.
- **Per-competency e-CF tag**: inline next to the origin marker, **only when the snapshot's `eCFMapping` is non-empty**. Render each mapping as a compact tag, e.g., `e-CF: B.6 (e-3)`. Otherwise render nothing — no empty tag.
- **No dictionary lookups**: the form reads exclusively from the snapshot. Remove any code path that fetches competency descriptions from the live dictionary at form render time. Snapshots are self-contained.

### 10.3 Acceptance Criteria for Phase 5

- Starting an evaluation from the Employees List successfully resolves and snapshots, with no console errors and a populated form.
- Form displays context header, origin markers, and e-CF tags correctly. Tags appear only when mappings are present.
- Mutating a competency in the dictionary after evaluation creation does **not** change the form's rendered content (verifiable: edit `config.competencies.json` competency description, re-seed competencies dictionary only, reload form — old description remains).
- Form scoring continues to use snapshotted relevancy weights, not live dictionary weights.

Commit message: `feat(competence): evaluation form context and snapshot-driven rendering (phase 5)`.

---

## 11. Phase 6 — Cleanup and Documentation

**Goal**: remove dead code, refresh documentation, bump version.

### 11.1 Code Cleanup

- Delete any code paths still referencing `CareerPathCode`, the string codes `SE01`, `PM01`, `BA01`, or the field `careerPath`. Phase 0 produced the inventory.
- Verify no stale schema files or config files remain.
- Run the full test suite. Fix any remaining failures.
- Run ESLint and Prettier across `packages/competence`. Resolve all warnings introduced by the refactor.

### 11.2 Documentation

- Update `packages/competence/CHANGELOG.md` with a `Version 2.0.0` entry containing a `feat!:` line summarizing the breaking change, plus per-phase entries for each commit in this refactor.
- Bump `packages/competence/package.json` version to `2.0.0`.
- Update the root `ti-engine.md`:
  - Replace `CareerPathCode: SE01, PM01, BA01` with `RoleFamilyCode: SE, QE, BA, PM, XD, DA, IO, MC, PD`.
  - Add `CycleStatus` enum to the enum list.
  - Add specialization concept to the description of the package's role.
  - Refresh the file list under Package: competence to reflect renamed files (`config.active-competency-sets.json`, `config.stage-levels.json`, `config.role-families.json`).
  - Update the version number reference for the `competence` package.

### 11.3 Acceptance Criteria for Phase 6

- `git grep -i "careerpath\|SE01\|PM01\|BA01"` returns no results in `packages/competence/`.
- `npm test` passes across the affected packages.
- `npm run test:json` passes.
- ESLint clean.
- `ti-engine.md` accurately describes the post-refactor state.
- `CHANGELOG.md` and `package.json` version reflect the breaking change.

Commit message: `chore(competence): refactor cleanup, docs refresh, v2.0.0 (phase 6)`.

---

## 12. Working Style and Reporting

- **One commit per phase.** Do not combine phases in a single commit. Do not split a phase across multiple commits unless explicitly authorized.
- **After each phase commit, pause and report.** Provide a short summary: what was done, any deviations from this brief, any open questions, and confirmation that the phase's acceptance criteria are met. Do not start the next phase until the project owner acknowledges.
- **If this brief is ambiguous or in conflict with the codebase reality discovered in Phase 0, surface the conflict.** Do not silently resolve it. The project owner makes the call.
- **Phase 0 is the only phase with no code changes.** It is a checkpoint. Do not skip it; do not collapse it into Phase 1.
- **No scope additions.** If something useful but out-of-brief comes to mind, document it as a follow-up; do not implement it in this refactor.
- **Localization is non-negotiable.** Every user-visible string requires a key in both `en` and `bg` locales. No hardcoded strings.

End of brief.
