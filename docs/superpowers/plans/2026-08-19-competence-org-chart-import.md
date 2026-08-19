# Competence Organization Chart & Employee Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a real organization be loaded into a competence deployment — the unit tree as a versioned, admin-editable configuration document, and 50–300 employee records through a validating, idempotent CSV importer.

**Architecture:** Every rule lands in a **pure module with injected data** (`employee-rules`, `organization-rules`, `organization-import`), following the established `identity-resolver` / `role-resolver` / `task-resolver` pattern. Thin drivers sit on top: the existing web application, a new CLI, and — later, unchanged — an HRIS sync. The org unit tree becomes the ninth store-backed configuration document, inheriting versioning, audit, export/restore and admin editing from machinery that already exists.

**Tech Stack:** Node.js ≥ 20.19.0, CommonJS, `node --test`, ajv (via the framework config registry), graphology (existing org graph). No new runtime dependencies.

**Design record:** [`docs/superpowers/specs/2026-08-19-competence-org-chart-import-design.md`](../specs/2026-08-19-competence-org-chart-import-design.md)

## Global Constraints

- **Versions:** competence `3.21.1` → `3.22.0` (minor); web-framework `1.24.2` → `1.25.0` (minor). Bump `package.json` **and** `CHANGELOG.md` for each.
- **CommonJS only** — `require()` / `module.exports`. No ESM.
- **Internal imports use `#alias`** from the package's `imports` map, never relative paths. A new module needs a new alias entry in `package.json`.
- **License headers are per-package and differ.** Copy the header block verbatim from an existing file **in the same package**: competence is `AGPL-3.0-or-later`, web-framework is `Apache-2.0`.
- **Tests are `node --test`** with `node:assert/strict`. No external test framework. One `test/<subject>.test.js` per module.
- **Pure modules perform no I/O.** The caller injects every lookup. This is what makes each rule testable with plain objects.
- **Commit convention:** Conventional Commits scoped to the package, referencing the YouTrack ID — e.g. `feat(competence): add the CSV row mapper (CA-107)`. Bundle thematically; one commit per task unless a task says otherwise.
- **Tracking:** [CA-107](https://belleal.youtrack.cloud/issue/CA-107), a subtask of CA-6 (Employee & Organization Management). Reference it in every commit message.
- **Never add a `Co-Authored-By: Claude` trailer** in this repo — it adds a `claude` PR author that fails the CLA check.
- **No personal data in logs or stdout.** Rejections are identified by `employee_id` and row number only — never names, emails, birth dates or gradings.
- **Never commit `.run/*.run.xml`** — they are git-tracked but carry live local credentials.

---

## File Structure

**web-framework (Task 1)**

| File | Responsibility |
|---|---|
| `packages/web-framework/components/config-service.js` (modify) | Surface `driftTracked` in the `getDrift` / `listDrift` payloads |
| `packages/web-framework/test/config-service.drift.test.js` (modify) | Cover the flag's default and its opt-out |

**competence — pure rule modules**

| File | Responsibility |
|---|---|
| `packages/competence/application/employee-rules.js` (create) | Employee field validation + email-collision detection, config injected |
| `packages/competence/application/organization-rules.js` (create) | Structural tree rules (roots, symmetry, cycles) + the unresolved-manager diagnostic |
| `packages/competence/application/organization-import.js` (create) | `parseDelimited` → `mapRows` → `reconcile` → `applyPlan` |

**competence — wiring**

| File | Responsibility |
|---|---|
| `packages/competence/bin/data/schemas/organization-structure.schema.json` (create) | Structural JSON Schema for the unit tree |
| `packages/competence/application/config-validators.js` (modify) | Thin adapters wrapping `organization-rules` into `ValidationIssue[]` |
| `packages/competence/application/config-registration.js` (modify) | Register the ninth document with `driftTracked: false` |
| `packages/competence/application/configuration-loader.js` (modify) | `STORE_BACKED` entry, org-chart rebuild on change, drift-report skip |
| `packages/competence/bin/competence-web-application.js` (modify) | Delegate employee validation to `employee-rules`; enforce email uniqueness |
| `packages/competence/bin/competence-web-server.js` (modify) | Startup unresolved-manager diagnostic |
| `packages/competence/bin/build/import-organization.js` (create) | CLI driver — dry-run by default |

**competence — docs**

| File | Responsibility |
|---|---|
| `packages/competence/INSTALL.md` (modify) | §17 becomes true; add the import runbook |
| `packages/competence/README.md` (modify) | Flip the *Configurable at runtime* row for the org structure |

---

## Task 1: web-framework — expose `driftTracked` on drift payloads

The org chart is customer data, not vendor-shipped product content, so it must not be compared against the demo tree baked into the image. `metadata` is already an open object threaded through registration, and `getDrift` already reads it — this mirrors the existing `editable: metadata.editable !== false` line exactly.

**Files:**
- Modify: `packages/web-framework/components/config-service.js` (`getDrift`, `listDrift`)
- Modify: `packages/web-framework/test/config-service.drift.test.js`
- Modify: `packages/web-framework/package.json`, `packages/web-framework/CHANGELOG.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getDrift( configKey )` and `listDrift()` each include `driftTracked: boolean` — `true` unless the document registered `metadata.driftTracked === false`. Task 5 consumes this.

- [ ] **Step 1: Write the failing test**

Append to `packages/web-framework/test/config-service.drift.test.js`, as a new top-level `describe` after the existing `ConfigService — getDrift / listDrift` block. The file already builds `registry` and `service` fresh in its `beforeEach`, so register into that `registry` rather than constructing anything:

```js
describe( "ConfigService — driftTracked metadata flag", () => {

    it( "defaults to true when the document does not set it", async () => {
        // "pool" registers metadata without driftTracked.
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.driftTracked, true );
    } );

    it( "is false when the document opts out", async () => {
        registry.register( "customer-data", { schema: POOL, defaultValue: {}, metadata: { label: "org", driftTracked: false } } );
        const drift = await service.getDrift( "customer-data" );
        assert.equal( drift.driftTracked, false );
    } );

    it( "carries the flag through listDrift", async () => {
        registry.register( "customer-data", { schema: POOL, defaultValue: {}, metadata: { label: "org", driftTracked: false } } );
        const listed = await service.listDrift();
        const byKey = Object.fromEntries( listed.map( ( entry ) => [ entry.configKey, entry ] ) );
        assert.equal( byKey[ "pool" ].driftTracked, true );
        assert.equal( byKey[ "customer-data" ].driftTracked, false );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/web-framework/test/config-service.drift.test.js
```

Expected: three failures, each `Expected values to be strictly equal: undefined !== true` (or `!== false`), because `driftTracked` is not yet in the payload.

- [ ] **Step 3: Add the flag to `getDrift`**

In `packages/web-framework/components/config-service.js`, in `getDrift`, add one property to the returned object immediately after `editable`:

```js
                editable: metadata.editable !== false,
                driftTracked: metadata.driftTracked !== false,
                label: metadata.label || configKey
```

- [ ] **Step 4: Carry it through `listDrift`**

In the same file, in `listDrift`, add the property to the projected shape immediately after `editable`:

```js
                editable: drift.editable,
                driftTracked: drift.driftTracked,
                label: drift.label
```

- [ ] **Step 5: Run the test and the whole web-framework suite**

```bash
node --test packages/web-framework/test/
```

Expected: all pass, including the three new cases.

- [ ] **Step 6: Bump the version and changelog**

Set `packages/web-framework/package.json` `version` to `1.25.0`. Add to the top of `packages/web-framework/CHANGELOG.md`, directly under the intro paragraph:

```markdown
## Version 1.25.0

* feat(config-management): surface a `driftTracked` flag on the `getDrift` / `listDrift` payloads, defaulting to
  `true` and set to `false` by a document registering `metadata.driftTracked: false`. Drift compares a stored value
  against the file default shipped in the image, which is meaningful for vendor-shipped product content and
  meaningless for a document holding customer data — that always differs, forever, and would drown a signal that
  otherwise means "a release changed something this deployment is not serving". Consumers now filter on data rather
  than on a hardcoded key list (CA-107)
```

- [ ] **Step 7: Commit**

```bash
git add packages/web-framework/components/config-service.js packages/web-framework/test/config-service.drift.test.js packages/web-framework/package.json packages/web-framework/CHANGELOG.md
git commit -m "feat(config-management): add a driftTracked flag to the drift payloads (CA-107)"
```

---

## Task 2: competence — extract employee validation into a pure module

`#validateEmployeeFields` in `competence-web-application.js` already implements every referential rule the importer needs — role family, specialization within family, level, stage, the N/X/T stage-1 dual-track rule, unit existence, email format, employment status, work mode, work location. It is private and reads `configurationLoader` directly.

Duplicating it in the importer would guarantee the two copies drift, and the operator fixes import rejections *in that very screen* — so they must agree exactly. This task is **behavior-preserving**: same rules, same returned label keys, just relocated with config injected.

**Files:**
- Create: `packages/competence/application/employee-rules.js`
- Create: `packages/competence/test/employee-rules.test.js`
- Modify: `packages/competence/package.json` (imports map)
- Modify: `packages/competence/bin/competence-web-application.js` (`#validateEmployeeFields`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `employeeRules.instance.validateEmployee( employee, context ) → string|null` — returns a localization label key on the first violation, `null` when valid.
  - `context` is `{ roleFamilies: Object, organizationStructure: Object }`.
  - Tasks 3 and 9 consume both.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/employee-rules.test.js` (copy the AGPL header block verbatim from `packages/competence/application/role-resolver.js`):

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const employeeRules = require( "#employee-rules" );

const CONTEXT = {
    roleFamilies: {
        SE: { specializations: { BACKEND: {}, FRONTEND: {} } },
        PM: { specializations: { AGILE: {} } }
    },
    organizationStructure: { "1": {}, "1-1": {} }
};

function employee( over = {} ) {
    return {
        employeeID: over.employeeID || "1",
        email: ( over.email !== undefined ) ? over.email : "a@example.com",
        employmentStatus: over.employmentStatus || "active",
        personal: {
            firstName: ( over.firstName !== undefined ) ? over.firstName : "Ada",
            lastName: ( over.lastName !== undefined ) ? over.lastName : "Lovelace",
            workMode: over.workMode || "Full-time",
            workLocation: over.workLocation || "On-site"
        },
        career: {
            organizationUnitID: ( over.unit !== undefined ) ? over.unit : "1-1",
            roleFamily: over.roleFamily || "SE",
            specialization: ( over.specialization !== undefined ) ? over.specialization : "BACKEND",
            level: over.level || "R",
            stage: ( over.stage !== undefined ) ? over.stage : 2
        }
    };
}

describe( "employeeRules.validateEmployee", () => {

    it( "accepts a well-formed record", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    it( "rejects a missing name", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { firstName: "" } ), CONTEXT ), "error.employee.missing-name" );
    } );

    it( "rejects an unknown work mode", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workMode: "Casual" } ), CONTEXT ), "error.employee.invalid-work-mode" );
    } );

    it( "rejects a role family absent from the configuration", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { roleFamily: "ZZ" } ), CONTEXT ), "error.employee.invalid-role-family" );
    } );

    it( "rejects a specialization that does not belong to the family", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { roleFamily: "PM", specialization: "BACKEND" } ), CONTEXT ), "error.employee.invalid-specialization" );
    } );

    it( "accepts a null specialization as a generalist", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { specialization: null } ), CONTEXT ), null );
    } );

    it( "rejects a non-integer stage", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { stage: 1.5 } ), CONTEXT ), "error.employee.invalid-stage" );
    } );

    it( "enforces the dual-track rule that N, X and T carry only stage 1", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 2 } ), CONTEXT ), "error.employee.invalid-stage-for-level" );
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 1 } ), CONTEXT ), null );
    } );

    it( "rejects an organization unit that is not in the tree", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { unit: "9-9" } ), CONTEXT ), "error.employee.invalid-organization-unit" );
    } );

    it( "rejects a malformed email but allows an absent one", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { email: "not-an-email" } ), CONTEXT ), "error.employee.invalid-email" );
        assert.equal( employeeRules.instance.validateEmployee( employee( { email: undefined } ), CONTEXT ), null );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/employee-rules.test.js
```

Expected: `Cannot find package '#employee-rules'` — the module and its alias do not exist yet.

- [ ] **Step 3: Add the import alias**

In `packages/competence/package.json`, add to the `imports` map, keeping the existing alphabetical placement style:

```json
    "#employee-rules": "./application/employee-rules.js",
```

- [ ] **Step 4: Create the module**

Create `packages/competence/application/employee-rules.js` with the AGPL header copied from `role-resolver.js`, then:

```js
/**
 * @typedef {Object} EmployeeRulesContext
 * @property {Object} roleFamilies - The role-families configuration, keyed by family code.
 * @property {Object} organizationStructure - The organization unit tree, keyed by unit ID.
 */

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const LEVELS = Object.freeze( [ "N", "J", "R", "S", "X", "T" ] );
// N (Intern), X (Expert) and T (Manager) are single-stage rungs of the ladder; J, R and S carry stages 1-3.
const SINGLE_STAGE_LEVELS = Object.freeze( [ "N", "X", "T" ] );
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure validation rules for an employee record. Performs no I/O — the caller injects the role-families and
 * organization-structure configuration (mirrors the {@link RoleResolver} pattern), so every rule is unit-testable
 * with plain objects and the web UI, the CSV importer and any future sync driver all decide validity identically.
 *
 * @class EmployeeRules
 * @singleton
 * @public
 */
class EmployeeRules {

    static #instance = null;

    /**
     * @constructor
     * @returns {EmployeeRules}
     */
    constructor() {
        if ( !EmployeeRules.#instance ) {
            EmployeeRules.#instance = this;
        }
        return EmployeeRules.#instance;
    }

    /* Public interface */

    /**
     * Validates an employee record's fields. Returns the localization label key of the first violation found, or
     * `null` when the record is valid. Pure.
     *
     * @method
     * @param {Employee} employee
     * @param {EmployeeRulesContext} context
     * @returns {string|null}
     * @public
     */
    validateEmployee( employee, context ) {
        const ctx = context || {};
        const families = ctx.roleFamilies || {};
        const structure = ctx.organizationStructure || {};

        const firstName = employee && employee.personal && employee.personal.firstName;
        const lastName = employee && employee.personal && employee.personal.lastName;
        if ( !firstName || !lastName ) {
            return "error.employee.missing-name";
        }

        const workMode = employee.personal.workMode;
        if ( !WORK_MODES.includes( workMode ) ) {
            return "error.employee.invalid-work-mode";
        }
        const workLocation = employee.personal.workLocation;
        if ( !WORK_LOCATIONS.includes( workLocation ) ) {
            return "error.employee.invalid-work-location";
        }

        const employmentStatus = employee.employmentStatus || "active";
        if ( !EMPLOYMENT_STATUSES.includes( employmentStatus ) ) {
            return "error.employee.invalid-employment-status";
        }

        const career = employee.career || {};
        const roleFamily = career.roleFamily;
        if ( !roleFamily || !families[ roleFamily ] ) {
            return "error.employee.invalid-role-family";
        }
        const specialization = career.specialization || null;
        if ( specialization && !( families[ roleFamily ].specializations || {} )[ specialization ] ) {
            return "error.employee.invalid-specialization";
        }

        const level = career.level;
        const stage = career.stage;
        if ( !LEVELS.includes( level ) ) {
            return "error.employee.invalid-level";
        }
        if ( !Number.isInteger( stage ) || stage < 1 || stage > 3 ) {
            return "error.employee.invalid-stage";
        }
        if ( SINGLE_STAGE_LEVELS.includes( level ) && stage !== 1 ) {
            return "error.employee.invalid-stage-for-level";
        }

        const organizationUnitID = career.organizationUnitID;
        if ( !organizationUnitID || !structure[ organizationUnitID ] ) {
            return "error.employee.invalid-organization-unit";
        }

        if ( employee.email && !EMAIL_PATTERN.test( employee.email ) ) {
            return "error.employee.invalid-email";
        }

        return null;
    }

}

const instance = new EmployeeRules();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
node --test packages/competence/test/employee-rules.test.js
```

Expected: 11 passing.

- [ ] **Step 6: Delegate from the web application**

In `packages/competence/bin/competence-web-application.js`, add the require alongside the other `#`-alias requires at the top of the file:

```js
const employeeRules = require( "#employee-rules" );
```

Then replace the entire body of `#validateEmployeeFields` — keep the method and its JSDoc so every existing call site is untouched:

```js
    #validateEmployeeFields( employee ) {
        return employeeRules.instance.validateEmployee( employee, {
            roleFamilies: configurationLoader.configRoleFamilies,
            organizationStructure: configurationLoader.configOrganizationStructure
        } );
    }
```

- [ ] **Step 7: Run the full competence suite to prove nothing regressed**

```bash
node --test packages/competence/test/
```

Expected: all suites pass. This is a pure relocation — any failure means the extracted rules diverged from the original.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/employee-rules.js packages/competence/test/employee-rules.test.js packages/competence/package.json packages/competence/bin/competence-web-application.js
git commit -m "refactor(competence): extract employee field validation into a pure rules module (CA-107)"
```

---

## Task 3: competence — reject a duplicate email on employee write

**This closes a live defect, not just importer groundwork.** There is no email-uniqueness check anywhere on the employee write path. `OrganizationManager#buildEmailIndex` detects the collision only afterwards, at chart-build time, and marks the address `ambiguous` — which makes `identity-resolver` refuse the login of **both** employees. A Supervisor can lock out two people today through the ordinary Employee Management screen, with no warning.

**Files:**
- Modify: `packages/competence/application/employee-rules.js`
- Modify: `packages/competence/test/employee-rules.test.js`
- Modify: `packages/competence/bin/competence-web-application.js` (`#createEmployee`, `#updateEmployee`)
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Consumes: `employeeRules.instance` from Task 2.
- Produces: `employeeRules.instance.findEmailCollision( email, employeeID, employees ) → string|null` — returns the `employeeID` of the colliding record, or `null`. Task 9 consumes it.

- [ ] **Step 1: Write the failing test**

Append to `packages/competence/test/employee-rules.test.js`:

```js
describe( "employeeRules.findEmailCollision", () => {

    const EXISTING = [
        { employeeID: "1", email: "ada@example.com" },
        { employeeID: "2", email: "Grace@Example.com" },
        { employeeID: "3" }
    ];

    it( "returns null when the email is unused", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "new@example.com", "9", EXISTING ), null );
    } );

    it( "finds a collision regardless of case or surrounding whitespace", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "  ADA@example.com ", "9", EXISTING ), "1" );
        assert.equal( employeeRules.instance.findEmailCollision( "grace@example.com", "9", EXISTING ), "2" );
    } );

    it( "does not collide a record with itself", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "ada@example.com", "1", EXISTING ), null );
    } );

    it( "ignores an absent or empty email", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "", "9", EXISTING ), null );
        assert.equal( employeeRules.instance.findEmailCollision( undefined, "9", EXISTING ), null );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/employee-rules.test.js
```

Expected: `employeeRules.instance.findEmailCollision is not a function`.

- [ ] **Step 3: Implement it**

Add to the public interface of `EmployeeRules` in `packages/competence/application/employee-rules.js`, after `validateEmployee`:

```js
    /**
     * Finds an existing employee already using the given email, excluding the record being written. Returns the
     * colliding `employeeID`, or `null`. Matching is trimmed and case-insensitive, exactly as
     * `OrganizationManager#buildEmailIndex` normalizes at login. Pure.
     * <br/>
     * A collision is a hard rejection rather than a warning: a shared address makes the login index ambiguous, and
     * `IdentityResolver` then refuses **both** employees rather than guessing which one signed in.
     *
     * @method
     * @param {string} [email]
     * @param {string} [employeeID] - The record being written, excluded from the search.
     * @param {Array<Employee>} [employees]
     * @returns {string|null}
     * @public
     */
    findEmailCollision( email, employeeID, employees ) {
        const normalized = String( email == null ? "" : email ).trim().toLowerCase();
        if ( !normalized ) {
            return null;
        }
        const self = String( employeeID == null ? "" : employeeID );
        const list = Array.isArray( employees ) ? employees : [];
        for ( const candidate of list ) {
            const candidateID = candidate && candidate.employeeID;
            if ( !candidateID || String( candidateID ) === self ) {
                continue;
            }
            if ( String( candidate.email == null ? "" : candidate.email ).trim().toLowerCase() === normalized ) {
                return String( candidateID );
            }
        }
        return null;
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/employee-rules.test.js
```

Expected: 15 passing.

- [ ] **Step 5: Add the localization label**

In `packages/competence/bin/localization/competence-labels.json`, add alongside the other `error.employee.*` entries, in both `en` and `bg`:

- `en`: `"error.employee.duplicate-email": "Another employee already uses this email address. Emails must be unique — a shared address prevents both employees from signing in."`
- `bg`: `"error.employee.duplicate-email": "Друг служител вече използва този имейл адрес. Имейлите трябва да са уникални — споделен адрес спира достъпа и на двамата служители."`

- [ ] **Step 6: Enforce it on create**

In `#createEmployee` in `packages/competence/bin/competence-web-application.js`, inside the `fetchEmployees().then( ( employees ) => {` block, immediately after the existing `#validateEmployeeFields` check:

```js
                const collision = employeeRules.instance.findEmailCollision( newEmployee.email, newEmployee.employeeID, employees );
                if ( collision ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_ALREADY_EXISTS, { details: "error.employee.duplicate-email" }, exceptions.httpCode.C_409 );
                }
```

- [ ] **Step 7: Enforce it on update**

`#updateEmployee` reads a single record with `fetchEmployee( employeeID )`, so the guard needs the full list. Replace the `saveEmployee` call and everything up to its `.then( ( saved ) => {` with a `fetchEmployees` step in front of it. Passing `updated.employeeID` is what stops a record from colliding with itself while editing its other fields:

```js
                const validationError = this.#validateEmployeeFields( updated );
                if ( validationError ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: validationError }, exceptions.httpCode.C_422 );
                }

                return dataManager.instance.fetchEmployees().then( ( employees ) => {
                    const collision = employeeRules.instance.findEmailCollision( updated.email, updated.employeeID, employees );
                    if ( collision ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_ALREADY_EXISTS, { details: "error.employee.duplicate-email" }, exceptions.httpCode.C_409 );
                    }
                    return dataManager.instance.saveEmployee( updated );
                } ).then( ( saved ) => {
                    return Promise.all( changes.map( ( change ) => dataManager.instance.appendAuditEntry( {
                        subjectType: "employee",
                        subjectID: saved.employeeID,
                        changedBy: userID,
                        field: change.path,
                        oldValue: change.oldValue,
                        newValue: change.newValue
                    } ) ) ).then( () => organizationManager.instance.buildOrganizationChart().then( () => saved ) );
                } ).then( ( saved ) => {
                    resolve( this.#projectEmployeeDetail( saved, session ) );
                } );
```

- [ ] **Step 8: Run the full suite**

```bash
node --test packages/competence/test/
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/competence/application/employee-rules.js packages/competence/test/employee-rules.test.js packages/competence/bin/competence-web-application.js packages/competence/bin/localization/competence-labels.json
git commit -m "fix(competence): reject a duplicate employee email on write (CA-107)"
```

---

## Task 4: competence — organization structure schema and pure structural rules

**Files:**
- Create: `packages/competence/bin/data/schemas/organization-structure.schema.json`
- Create: `packages/competence/application/organization-rules.js`
- Create: `packages/competence/test/organization-rules.test.js`
- Modify: `packages/competence/package.json` (imports map)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all pure and all on `organizationRules.instance`:
  - `findRootUnits( structure ) → string[]`
  - `findSymmetryBreaks( structure ) → Array<{unitID, relatedID, code}>` where `code` is `missing-child` | `child-parent-mismatch` | `missing-parent` | `parent-missing-child`
  - `findCycles( structure ) → string[]`
  - `findUnresolvedManagers( structure, employees ) → Array<{unitID, managerID, code}>` where `code` is `manager-not-found` | `manager-terminated`
  - Tasks 5 and 6 consume these.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-rules.test.js` with the AGPL header, then:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationRules = require( "#organization-rules" );

// A well-formed two-level tree: root "1" (mgr 22) -> "1-1" (mgr 20) -> "1-1-1" (mgr 8).
function validTree() {
    return {
        "1": { id: "1", name: "Root", parent: null, children: [ "1-1" ], managerID: "22" },
        "1-1": { id: "1-1", name: "Engineering", parent: "1", children: [ "1-1-1" ], managerID: "20" },
        "1-1-1": { id: "1-1-1", name: "Platform", parent: "1-1", children: [], managerID: "8" }
    };
}

describe( "organizationRules.findRootUnits", () => {

    it( "finds exactly one root in a well-formed tree", () => {
        assert.deepEqual( organizationRules.instance.findRootUnits( validTree() ), [ "1" ] );
    } );

    it( "finds every root when there is more than one", () => {
        const tree = validTree();
        tree[ "2" ] = { id: "2", parent: null, children: [] };
        assert.deepEqual( organizationRules.instance.findRootUnits( tree ).sort(), [ "1", "2" ] );
    } );

    it( "returns an empty list when no unit is rooted", () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1-1";
        assert.deepEqual( organizationRules.instance.findRootUnits( tree ), [] );
    } );

} );

describe( "organizationRules.findSymmetryBreaks", () => {

    it( "reports nothing for a well-formed tree", () => {
        assert.deepEqual( organizationRules.instance.findSymmetryBreaks( validTree() ), [] );
    } );

    it( "reports a child that names a different parent", () => {
        const tree = validTree();
        tree[ "1-1-1" ].parent = "1";
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1" && b.relatedID === "1-1-1" && b.code === "child-parent-mismatch" ) );
    } );

    it( "reports a children entry naming a unit that does not exist", () => {
        const tree = validTree();
        tree[ "1-1" ].children.push( "ghost" );
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.relatedID === "ghost" && b.code === "missing-child" ) );
    } );

    it( "reports a parent that does not list this unit as a child", () => {
        const tree = validTree();
        tree[ "1-1" ].children = [];
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1-1" && b.relatedID === "1-1" && b.code === "parent-missing-child" ) );
    } );

    it( "reports a parent that does not exist", () => {
        const tree = validTree();
        tree[ "1-1" ].parent = "ghost";
        const breaks = organizationRules.instance.findSymmetryBreaks( tree );
        assert.ok( breaks.some( ( b ) => b.unitID === "1-1" && b.relatedID === "ghost" && b.code === "missing-parent" ) );
    } );

} );

describe( "organizationRules.findCycles", () => {

    it( "reports nothing for an acyclic tree", () => {
        assert.deepEqual( organizationRules.instance.findCycles( validTree() ), [] );
    } );

    it( "detects a cycle and terminates", () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1-1";
        const cycles = organizationRules.instance.findCycles( tree );
        assert.ok( cycles.length > 0 );
    } );

    it( "detects a unit that is its own parent", () => {
        const tree = validTree();
        tree[ "1-1" ].parent = "1-1";
        assert.ok( organizationRules.instance.findCycles( tree ).includes( "1-1" ) );
    } );

} );

describe( "organizationRules.findUnresolvedManagers", () => {

    const EMPLOYEES = [
        { employeeID: "22", employmentStatus: "active" },
        { employeeID: "20", employmentStatus: "active" },
        { employeeID: "8", employmentStatus: "terminated" }
    ];

    it( "reports nothing when every manager resolves and is not terminated", () => {
        const tree = validTree();
        delete tree[ "1-1-1" ].managerID;
        assert.deepEqual( organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES ), [] );
    } );

    it( "reports a managerID naming nobody", () => {
        const tree = validTree();
        tree[ "1-1-1" ].managerID = "999";
        const findings = organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES );
        assert.deepEqual( findings, [ { unitID: "1-1-1", managerID: "999", code: "manager-not-found" } ] );
    } );

    it( "reports a manager who is terminated", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( validTree(), EMPLOYEES );
        assert.deepEqual( findings, [ { unitID: "1-1-1", managerID: "8", code: "manager-terminated" } ] );
    } );

    it( "treats a manager-less unit as legal", () => {
        const tree = { "1": { id: "1", parent: null, children: [] } };
        assert.deepEqual( organizationRules.instance.findUnresolvedManagers( tree, EMPLOYEES ), [] );
    } );

    it( "reports every unit against an empty employee list, which is the fresh-install state", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( validTree(), [] );
        assert.equal( findings.length, 3 );
        assert.ok( findings.every( ( f ) => f.code === "manager-not-found" ) );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-rules.test.js
```

Expected: `Cannot find package '#organization-rules'`.

- [ ] **Step 3: Add the import alias**

In `packages/competence/package.json` `imports`:

```json
    "#organization-rules": "./application/organization-rules.js",
```

- [ ] **Step 4: Create the module**

Create `packages/competence/application/organization-rules.js` with the AGPL header, then:

```js
/**
 * Pure structural rules for the organization unit tree. Performs no I/O — the caller passes the structure (and, for
 * the manager diagnostic, the employee list) as plain objects, mirroring the {@link RoleResolver} pattern.
 * <br/>
 * The first three rules are facts about the document itself and back **blocking** config validators. The fourth,
 * {@link OrganizationRules#findUnresolvedManagers}, is a reference into the employee store — a different lifecycle —
 * and is therefore reported as a diagnostic rather than gating a save. Blocking on it would deadlock a fresh
 * install: the tree could not be saved until the employees existed, while the employee importer rejects any record
 * whose `organizationUnitID` is not already in the tree.
 *
 * @class OrganizationRules
 * @singleton
 * @public
 */
class OrganizationRules {

    static #instance = null;

    /**
     * @constructor
     * @returns {OrganizationRules}
     */
    constructor() {
        if ( !OrganizationRules.#instance ) {
            OrganizationRules.#instance = this;
        }
        return OrganizationRules.#instance;
    }

    /* Public interface */

    /**
     * The IDs of every unit with no parent. `getTopManagerID` and the whole structural-supervisor derivation assume
     * exactly one. Pure.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<string>}
     * @public
     */
    findRootUnits( structure ) {
        return Object.entries( structure || {} )
            .filter( ( [ , unit ] ) => !unit || unit.parent === null || unit.parent === undefined || unit.parent === "" )
            .map( ( [ rawID, unit ] ) => ( unit && unit.id ) || rawID );
    }

    /**
     * Every place the `parent` and `children` links disagree. The graph builder reads the two independently, so a
     * mismatch silently yields a half-connected tree rather than an error. Pure.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<{unitID: string, relatedID: string, code: string}>}
     * @public
     */
    findSymmetryBreaks( structure ) {
        const units = structure || {};
        const breaks = [];
        for ( const [ rawID, unit ] of Object.entries( units ) ) {
            const unitID = ( unit && unit.id ) || rawID;
            const children = ( unit && Array.isArray( unit.children ) ) ? unit.children : [];
            for ( const childID of children ) {
                const child = units[ childID ];
                if ( !child ) {
                    breaks.push( { unitID: unitID, relatedID: childID, code: "missing-child" } );
                } else if ( child.parent !== rawID ) {
                    breaks.push( { unitID: unitID, relatedID: childID, code: "child-parent-mismatch" } );
                }
            }
            const parentID = unit && unit.parent;
            if ( parentID ) {
                const parent = units[ parentID ];
                if ( !parent ) {
                    breaks.push( { unitID: unitID, relatedID: parentID, code: "missing-parent" } );
                } else if ( !( Array.isArray( parent.children ) ? parent.children : [] ).includes( rawID ) ) {
                    breaks.push( { unitID: unitID, relatedID: parentID, code: "parent-missing-child" } );
                }
            }
        }
        return breaks;
    }

    /**
     * Every unit that sits on a parent cycle. `RoleResolver#subManagerDepth` recurses with no visited set, so a
     * cycle is a stack overflow at login rather than a diagnosable error. Pure.
     *
     * @method
     * @param {Object} structure
     * @returns {Array<string>}
     * @public
     */
    findCycles( structure ) {
        const units = structure || {};
        const cyclic = new Set();
        for ( const startID of Object.keys( units ) ) {
            const seen = new Set();
            let cursor = startID;
            while ( cursor && units[ cursor ] ) {
                if ( seen.has( cursor ) ) {
                    cyclic.add( cursor );
                    break;
                }
                seen.add( cursor );
                cursor = units[ cursor ].parent;
            }
        }
        return Array.from( cyclic ).sort();
    }

    /**
     * Every unit whose `managerID` names no employee, or names a terminated one. A manager-less unit is legal and is
     * not reported — `RoleResolver#subManagerDepth` recurses through it as transparent. Pure.
     * <br/>
     * Reported, never blocking — see the class note.
     *
     * @method
     * @param {Object} structure
     * @param {Array<Employee>} employees
     * @returns {Array<{unitID: string, managerID: string, code: string}>}
     * @public
     */
    findUnresolvedManagers( structure, employees ) {
        const byID = new Map();
        ( Array.isArray( employees ) ? employees : [] ).forEach( ( employee ) => {
            if ( employee && employee.employeeID ) {
                byID.set( String( employee.employeeID ), employee );
            }
        } );

        const findings = [];
        for ( const [ rawID, unit ] of Object.entries( structure || {} ) ) {
            const unitID = ( unit && unit.id ) || rawID;
            const managerID = unit && unit.managerID;
            if ( !managerID ) {
                continue;
            }
            const manager = byID.get( String( managerID ) );
            if ( !manager ) {
                findings.push( { unitID: unitID, managerID: String( managerID ), code: "manager-not-found" } );
            } else if ( manager.employmentStatus === "terminated" ) {
                findings.push( { unitID: unitID, managerID: String( managerID ), code: "manager-terminated" } );
            }
        }
        return findings;
    }

}

const instance = new OrganizationRules();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-rules.test.js
```

Expected: 16 passing.

- [ ] **Step 6: Write the JSON schema**

Create `packages/competence/bin/data/schemas/organization-structure.schema.json`. It covers **shape only** — the relational rules are the semantic validators of Task 5, because JSON Schema cannot express cross-key references:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ti-engine.dev/schemas/competence/organization-structure.json",
  "title": "Organization Structure",
  "description": "The organization unit tree, keyed by unit ID. Relational integrity (single root, parent/child symmetry, acyclicity) is enforced by semantic validators, not by this schema.",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "required": [ "id", "name", "type", "parent", "children" ],
    "additionalProperties": false,
    "properties": {
      "id": { "type": "string", "minLength": 1, "description": "Unit identifier; must equal the map key" },
      "name": { "type": "string", "minLength": 1, "description": "Unit name" },
      "displayName": { "type": "string", "description": "Optional display override" },
      "description": { "type": "string", "description": "Free-text description" },
      "type": { "type": "string", "minLength": 1, "description": "Unit kind, e.g. Organization, Department, Unit" },
      "branch": { "type": "string", "description": "Branch designation" },
      "location": { "type": "string", "description": "Physical location" },
      "managerID": { "type": [ "string", "null" ], "description": "Employee ID of the unit's manager; absent or null means a manager-less pass-through unit" },
      "parent": { "type": [ "string", "null" ], "description": "Parent unit ID; null marks the single root" },
      "children": { "type": "array", "items": { "type": "string", "minLength": 1 }, "description": "Child unit IDs" }
    }
  }
}
```

- [ ] **Step 7: Verify the shipped tree validates against the new schema**

```bash
node --test packages/competence/test/json-config-validation.test.js
```

Expected: pass. If this suite does not yet cover the org structure, add it there following the file's existing per-config pattern, so the shipped `config.organization-structure.json` is checked against the schema on every run.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/organization-rules.js packages/competence/test/organization-rules.test.js packages/competence/bin/data/schemas/organization-structure.schema.json packages/competence/package.json packages/competence/test/json-config-validation.test.js
git commit -m "feat(competence): add the organization structure schema and pure structural rules (CA-107)"
```

---

## Task 5: competence — register the organization structure as the ninth config document

**Files:**
- Modify: `packages/competence/application/config-validators.js`
- Modify: `packages/competence/application/config-registration.js`
- Modify: `packages/competence/application/configuration-loader.js`
- Create: `packages/competence/test/organization-structure-config.test.js`
- Modify: `packages/competence/INSTALL.md`, `packages/competence/README.md`

**Interfaces:**
- Consumes: `organizationRules.instance` (Task 4); `driftTracked` on the drift payload (Task 1).
- Produces: the `organization-structure` config key is registered, store-backed and admin-editable; `configurationLoader.configOrganizationStructure` reflects the stored value; the org graph rebuilds on change.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-structure-config.test.js` with the AGPL header. The validators are pure functions of the document, so this suite calls them directly — no config service or registry is needed:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

function validTree() {
    return {
        "1": { id: "1", name: "Root", type: "Organization", parent: null, children: [ "1-1" ], managerID: "22" },
        "1-1": { id: "1-1", name: "Engineering", type: "Department", parent: "1", children: [], managerID: "20" }
    };
}

// The validators take (value, context); none of the organization validators reads a sibling document, so an empty
// context is sufficient.
const CONTEXT = { getConfig: () => Promise.resolve( null ), getStoredConfig: () => Promise.resolve( null ) };

describe( "organization structure semantic validators", () => {

    it( "accepts a well-formed tree", async () => {
        assert.deepEqual( await validators.organizationSingleRoot( validTree(), CONTEXT ), [] );
        assert.deepEqual( await validators.organizationParentChildSymmetry( validTree(), CONTEXT ), [] );
        assert.deepEqual( await validators.organizationNoCycles( validTree(), CONTEXT ), [] );
    } );

    it( "rejects a tree with two roots", async () => {
        const tree = validTree();
        tree[ "2" ] = { id: "2", name: "Other", type: "Organization", parent: null, children: [] };
        const issues = await validators.organizationSingleRoot( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "single-root" );
    } );

    it( "rejects a tree with no root", async () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1";
        const issues = await validators.organizationSingleRoot( tree, CONTEXT );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "single-root" );
    } );

    it( "rejects broken parent/child symmetry", async () => {
        const tree = validTree();
        tree[ "1" ].children = [];
        const issues = await validators.organizationParentChildSymmetry( tree, CONTEXT );
        assert.ok( issues.length > 0 );
        assert.ok( issues.every( ( issue ) => issue.code === "symmetry" ) );
    } );

    it( "rejects a cycle", async () => {
        const tree = validTree();
        tree[ "1" ].parent = "1-1";
        tree[ "1-1" ].children = [ "1" ];
        const issues = await validators.organizationNoCycles( tree, CONTEXT );
        assert.ok( issues.length > 0 );
        assert.equal( issues[ 0 ].code, "cycle" );
    } );

    it( "does not reject a dangling managerID — that is a diagnostic, not a gate", async () => {
        const tree = validTree();
        tree[ "1" ].managerID = "does-not-exist";
        assert.deepEqual( await validators.organizationSingleRoot( tree, CONTEXT ), [] );
        assert.deepEqual( await validators.organizationParentChildSymmetry( tree, CONTEXT ), [] );
        assert.deepEqual( await validators.organizationNoCycles( tree, CONTEXT ), [] );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-structure-config.test.js
```

Expected: `validators.organizationSingleRoot is not a function`.

- [ ] **Step 3: Add the three validators**

In `packages/competence/application/config-validators.js`, add the require at the top alongside the existing `configurationLoader` require:

```js
const organizationRules = require( "#organization-rules" );
```

Then add the three validators, following the file's existing Promise-returning style:

```js
/**
 * organization-structure: exactly one unit must have no parent. `getTopManagerID` and the structural-supervisor
 * derivation both assume a single root.
 *
 * @method
 * @param {Object} value - The pending organization structure being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationSingleRoot( value, context ) {
    const roots = organizationRules.instance.findRootUnits( value );
    if ( roots.length === 1 ) {
        return Promise.resolve( [] );
    }
    return Promise.resolve( [ {
        path: ".",
        message: ( roots.length === 0 )
            ? "no root unit — exactly one unit must have parent: null"
            : `${ roots.length } root units (${ roots.join( ", " ) }) — exactly one unit must have parent: null`,
        code: "single-root"
    } ] );
}

/**
 * organization-structure: the `parent` and `children` links must agree in both directions. The graph builder reads
 * them independently, so a mismatch produces a half-connected tree with no error.
 *
 * @method
 * @param {Object} value
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationParentChildSymmetry( value, context ) {
    return Promise.resolve( organizationRules.instance.findSymmetryBreaks( value ).map( ( found ) => ( {
        path: `.${ found.unitID }`,
        message: `link to '${ found.relatedID }' is inconsistent (${ found.code })`,
        code: "symmetry"
    } ) ) );
}

/**
 * organization-structure: the parent chain must be acyclic. `RoleResolver#subManagerDepth` recurses with no visited
 * set, so a cycle is a stack overflow at login rather than a diagnosable failure.
 *
 * @method
 * @param {Object} value
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationNoCycles( value, context ) {
    const cyclic = organizationRules.instance.findCycles( value );
    if ( cyclic.length === 0 ) {
        return Promise.resolve( [] );
    }
    return Promise.resolve( [ {
        path: ".",
        message: `parent cycle through unit(s): ${ cyclic.join( ", " ) }`,
        code: "cycle"
    } ] );
}
```

Add all three to the file's `module.exports` block, matching its existing export style.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-structure-config.test.js
```

Expected: 6 passing.

- [ ] **Step 5: Make the document store-backed**

In `packages/competence/application/configuration-loader.js`, add the entry to the `STORE_BACKED` map (around line 248), matching the existing `configKey: exportedPropertyName` shape:

```js
    "organization-structure": "configOrganizationStructure",
```

- [ ] **Step 6: Rebuild the org graph when the document changes**

Still in `configuration-loader.js`, in the `onConfigChanged` handler inside `initialize()`, rebuild the graph after the store value has been applied. Require `#organization-manager` **lazily inside the handler**, not at module top level — `organization-manager` already requires `#configuration-loader`, and a top-level require would create a cycle:

```js
        configService.onConfigChanged( ( event ) => {
            const keys = ( event && event.configKeys ) || [];
            return Promise.all( keys.filter( ( key ) => STORE_BACKED[ key ] ).map( ( key ) => {
                return configService.getCurrent( key ).then( ( current ) => {
                    if ( current ) applyStoreValue( key, current.value );
                } );
            } ) ).then( () => {
                if ( !keys.includes( "organization-structure" ) ) {
                    return undefined;
                }
                // Lazy require: organization-manager requires this module, so a top-level require is a cycle.
                return require( "#organization-manager" ).instance.buildOrganizationChart();
            } );
        } );
```

- [ ] **Step 7: Skip it in the startup drift report**

Still in `configuration-loader.js`, in `reportConfigDrift`, skip documents that opted out — the flag Task 1 added:

```js
        for ( const document of ( documents || [] ) ) {
            if ( document.driftTracked === false ) {
                // Customer data (the org chart), not vendor-shipped product content: it differs from the image's
                // default by definition and forever, so reporting it would drown the signal for documents where a
                // difference genuinely means "a release changed something this deployment is not serving".
                continue;
            }
            if ( document.status === "drifted" ) {
```

- [ ] **Step 8: Register the document**

In `packages/competence/application/config-registration.js`, add the schema require alongside the others:

```js
const organizationStructureSchema = require( "../bin/data/schemas/organization-structure.schema.json" );
```

and register it after the `research-consent` registration:

```js
    app.registerConfigDocument( "organization-structure", {
        schema: organizationStructureSchema,
        validators: [ validators.organizationSingleRoot, validators.organizationParentChildSymmetry, validators.organizationNoCycles ],
        defaultValue: configurationLoader.fileDefaults[ "organization-structure" ],
        metadata: { path: "bin/config/config.organization-structure.json", label: "organization.structure", editable: true, driftTracked: false }
    } );
```

Also extend the module's header comment, which enumerates what is editable, to mention the organization structure and why it is drift-exempt.

- [ ] **Step 9: Add the `organization.structure` label**

In `packages/competence/bin/localization/competence-labels.json`, add the `organization.structure` label in both `en` (`"Organization Structure"`) and `bg` (`"Организационна структура"`), alongside the other config-document labels such as `role.families`.

- [ ] **Step 10: Run the full suite**

```bash
node --test packages/competence/test/
```

Expected: all pass — notably `config-drift-reporting.test.js`, `config-management.test.js`, `config-live.test.js` and the four `organization-*.test.js` suites, which keep asserting against the shipped demo tree.

- [ ] **Step 11: Correct the documentation this makes true**

In `packages/competence/INSTALL.md` §17, replace the **Organization structure** bullet:

```markdown
- **Organization structure:** the org chart is a store-backed configuration document, editable in
  **Administration → Configuration** like any other. The file baked into the image is only the bootstrap default,
  seeded on a first run; from then on the stored value wins. Reflecting *your* organization is therefore a
  configuration task, not a rebuild. It is deliberately excluded from the configuration-drift report: it holds your
  data rather than content shipped with the release, so it differs from the image default by design.
```

In `packages/competence/README.md`, change the `config.organization-structure.json` row's *Configurable at runtime* cell from `No` to `Yes (store-backed)`.

- [ ] **Step 12: Commit**

```bash
git add packages/competence/application/config-validators.js packages/competence/application/config-registration.js packages/competence/application/configuration-loader.js packages/competence/test/organization-structure-config.test.js packages/competence/bin/localization/competence-labels.json packages/competence/INSTALL.md packages/competence/README.md
git commit -m "feat(competence): make the organization structure a store-backed config document (CA-107)"
```

---

## Task 6: competence — report unresolved unit managers

A dangling `managerID` means that unit's people silently have no manager and no one gains MANAGER over them. It must be visible until it clears, so it is a persistent diagnostic — not a one-shot message at save time, and not a save gate (Task 4's class note explains why).

**Files:**
- Modify: `packages/competence/bin/competence-web-server.js` (`onStart`)
- Create: `packages/competence/test/organization-manager-diagnostics.test.js`

**Interfaces:**
- Consumes: `organizationRules.instance.findUnresolvedManagers` (Task 4); `dataManager.instance.fetchEmployees()`.
- Produces: `reportUnresolvedManagers()` on the web server, logging one `WARNING` per finding. Returns `Promise<Array>` of the findings so the test can assert on them.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-manager-diagnostics.test.js` with the AGPL header. It tests the pure composition rather than the logger:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationRules = require( "#organization-rules" );

// Mirrors the shipped demo tree's shape: root "1" mgr 22 -> "1-1" mgr 20 -> "1-1-1" mgr 8.
const TREE = {
    "1": { id: "1", parent: null, children: [ "1-1" ], managerID: "22" },
    "1-1": { id: "1-1", parent: "1", children: [ "1-1-1" ], managerID: "20" },
    "1-1-1": { id: "1-1-1", parent: "1-1", children: [], managerID: "8" }
};

describe( "unresolved manager diagnostics", () => {

    it( "reports every unit on a fresh install with no employees loaded", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( TREE, [] );
        assert.equal( findings.length, 3 );
        assert.deepEqual( findings.map( ( f ) => f.unitID ).sort(), [ "1", "1-1", "1-1-1" ] );
    } );

    it( "clears once the named employees exist and are not terminated", () => {
        const employees = [
            { employeeID: "22", employmentStatus: "active" },
            { employeeID: "20", employmentStatus: "on-leave" },
            { employeeID: "8", employmentStatus: "active" }
        ];
        assert.deepEqual( organizationRules.instance.findUnresolvedManagers( TREE, employees ), [] );
    } );

    it( "carries a machine-readable code and no personal data", () => {
        const findings = organizationRules.instance.findUnresolvedManagers( TREE, [ { employeeID: "22", employmentStatus: "terminated" } ] );
        const forRoot = findings.find( ( f ) => f.unitID === "1" );
        assert.equal( forRoot.code, "manager-terminated" );
        assert.deepEqual( Object.keys( forRoot ).sort(), [ "code", "managerID", "unitID" ] );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it passes already**

```bash
node --test packages/competence/test/organization-manager-diagnostics.test.js
```

Expected: 3 passing — Task 4 built the rule. This suite pins the **contract the startup reporter depends on**, including that a finding carries no personal fields. Keep it: it is what stops a later change from putting a manager's name into a log line.

- [ ] **Step 3: Report at startup**

In `packages/competence/bin/competence-web-server.js`, add the requires if not already present:

```js
const organizationRules = require( "#organization-rules" );
```

Add the method to the class:

```js
    /**
     * Logs one WARNING per organization unit whose `managerID` names no employee, or names a terminated one. Such a
     * unit's people silently have no manager and nobody gains MANAGER over them, so the condition must stay visible
     * until it clears — on a container deployment nobody is watching an admin screen.
     * <br/>
     * Deliberately a diagnostic rather than a validator: blocking the tree's save on employee data would deadlock a
     * fresh install, where the tree must exist before employees can reference its units. Every unit reporting at once
     * is the *expected* state between loading the tree and importing employees.
     * <br/>
     * Never gates boot, and never logs a personal field — a finding carries only unit ID, manager ID and a code.
     *
     * @method
     * @returns {Promise<Array<Object>>}
     * @public
     */
    reportUnresolvedManagers() {
        return dataManager.instance.fetchEmployees().then( ( employees ) => {
            const findings = organizationRules.instance.findUnresolvedManagers( configurationLoader.configOrganizationStructure, employees );
            for ( const finding of findings ) {
                logger.log( `Organization unit '${ finding.unitID }' names manager '${ finding.managerID }' which does not resolve to an active employee (${ finding.code }). That unit's employees have no manager, and nobody holds MANAGER over them.`, logger.logSeverity.WARNING );
            }
            return findings;
        } ).catch( ( error ) => {
            // Diagnostics must never gate boot.
            logger.log( "Unable to check organization unit managers at startup.", logger.logSeverity.WARNING, error );
            return [];
        } );
    }
```

- [ ] **Step 4: Call it from `onStart`**

Still in `competence-web-server.js`, append it to the `onStart` promise chain, after `backfillMissingEvaluationDeadlines()` — it must run once the org chart and employees are both loaded:

```js
            .then( () => this.reportUnresolvedManagers() )
```

- [ ] **Step 5: Run the full suite**

```bash
node --test packages/competence/test/
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/competence-web-server.js packages/competence/test/organization-manager-diagnostics.test.js
git commit -m "feat(competence): report organization units whose manager does not resolve (CA-107)"
```

---

## Task 7: competence — the CSV parser

**Files:**
- Create: `packages/competence/application/organization-import.js`
- Create: `packages/competence/test/organization-import.parse.test.js`
- Modify: `packages/competence/package.json` (imports map)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `organizationImport.instance.detectDelimiter( text ) → "," | ";"`
  - `organizationImport.instance.parseDelimited( text, options ) → string[][]` — `options.delimiter` optional; strips a UTF-8 BOM; skips blank lines.
  - `organizationImport.instance.toRecords( rows ) → { header: string[], records: Array<Object> }` — header cells trimmed and lower-cased.
  - Task 8 consumes `toRecords`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-import.parse.test.js` with the AGPL header:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

describe( "organizationImport.detectDelimiter", () => {

    it( "detects a comma", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "a,b,c\n1,2,3" ), "," );
    } );

    it( "detects a semicolon, the European Excel default", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "a;b;c\n1;2;3" ), ";" );
    } );

    it( "prefers the delimiter that appears more often in the header", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "last_name;first_name;note\nSmith, Jr.;Ada;x" ), ";" );
    } );

} );

describe( "organizationImport.parseDelimited", () => {

    it( "parses a simple file", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\n1,2" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "keeps a delimiter inside a quoted field", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'name,unit\n"Smith, Jr.",1-1' ), [ [ "name", "unit" ], [ "Smith, Jr.", "1-1" ] ] );
    } );

    it( "unescapes a doubled quote", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a\n"say ""hi"""' ), [ [ "a" ], [ 'say "hi"' ] ] );
    } );

    it( "keeps a newline inside a quoted field", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a,b\n"line1\nline2",x' ), [ [ "a", "b" ], [ "line1\nline2", "x" ] ] );
    } );

    it( "handles CRLF line endings", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\r\n1,2\r\n" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "strips a UTF-8 BOM so the first header cell still matches", () => {
        const rows = organizationImport.instance.parseDelimited( "﻿employee_id,email\n1,a@b.co" );
        assert.equal( rows[ 0 ][ 0 ], "employee_id" );
    } );

    it( "skips blank lines", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\n\n1,2\n\n" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "honours an explicit delimiter override", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a;b\n1;2", { delimiter: ";" } ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "preserves a leading zero in an ID", () => {
        const rows = organizationImport.instance.parseDelimited( "employee_id\n00123" );
        assert.equal( rows[ 1 ][ 0 ], "00123" );
    } );

} );

describe( "organizationImport.toRecords", () => {

    it( "maps rows onto trimmed, lower-cased header keys", () => {
        const { header, records } = organizationImport.instance.toRecords( [ [ " Employee_ID ", "Email" ], [ "1", "a@b.co" ] ] );
        assert.deepEqual( header, [ "employee_id", "email" ] );
        assert.deepEqual( records, [ { employee_id: "1", email: "a@b.co", __row: 2 } ] );
    } );

    it( "returns no records for a header-only file", () => {
        const { records } = organizationImport.instance.toRecords( [ [ "employee_id" ] ] );
        assert.deepEqual( records, [] );
    } );

    it( "pads a short row rather than dropping it, so the row still reports its own errors", () => {
        const { records } = organizationImport.instance.toRecords( [ [ "a", "b" ], [ "1" ] ] );
        assert.deepEqual( records, [ { a: "1", b: "", __row: 2 } ] );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-import.parse.test.js
```

Expected: `Cannot find package '#organization-import'`.

- [ ] **Step 3: Add the import alias**

In `packages/competence/package.json` `imports`:

```json
    "#organization-import": "./application/organization-import.js",
```

- [ ] **Step 4: Create the module with the parse stage**

Create `packages/competence/application/organization-import.js` with the AGPL header, then:

```js
/**
 * Pure employee-import pipeline: `parseDelimited` → `mapRows` → `reconcile` → `applyPlan`. Performs no I/O — the
 * caller supplies the file contents and injects the store lookups and the writer, mirroring the {@link RoleResolver}
 * pattern. That is what lets the same rules serve the CLI today and an HRIS sync later without change.
 * <br/>
 * The CSV parser is hand-written rather than a dependency because the module must be reachable at runtime: a future
 * admin upload screen and a sync driver both call it, so a build-time devDependency (the `marked` pattern) would be
 * the wrong shape.
 *
 * @class OrganizationImport
 * @singleton
 * @public
 */
class OrganizationImport {

    static #instance = null;

    /**
     * @constructor
     * @returns {OrganizationImport}
     */
    constructor() {
        if ( !OrganizationImport.#instance ) {
            OrganizationImport.#instance = this;
        }
        return OrganizationImport.#instance;
    }

    /* Public interface */

    /**
     * Picks the delimiter from the header line by simple frequency. Excel exports semicolon-delimited files in a
     * European locale, which would otherwise parse as a single unnamed column. Pure.
     *
     * @method
     * @param {string} text
     * @returns {string}
     * @public
     */
    detectDelimiter( text ) {
        const source = this.#stripBOM( String( text == null ? "" : text ) );
        const headerLine = source.split( /\r?\n/ )[ 0 ] || "";
        const semicolons = ( headerLine.match( /;/g ) || [] ).length;
        const commas = ( headerLine.match( /,/g ) || [] ).length;
        return ( semicolons > commas ) ? ";" : ",";
    }

    /**
     * Strict RFC 4180 parser: quoted fields, embedded delimiters and newlines, doubled quotes, CRLF, and a leading
     * UTF-8 BOM. Blank lines are skipped. Values are returned verbatim — no trimming — so a leading zero in an ID
     * survives. Pure.
     *
     * @method
     * @param {string} text
     * @param {Object} [options]
     * @param {string} [options.delimiter] - Overrides auto-detection.
     * @returns {Array<Array<string>>}
     * @public
     */
    parseDelimited( text, options ) {
        const opts = options || {};
        const source = this.#stripBOM( String( text == null ? "" : text ) );
        const delimiter = opts.delimiter || this.detectDelimiter( source );

        const rows = [];
        let record = [];
        let field = "";
        let inQuotes = false;
        let dirty = false;

        const endField = () => {
            record.push( field );
            field = "";
        };
        const endRecord = () => {
            endField();
            if ( dirty ) {
                rows.push( record );
            }
            record = [];
            dirty = false;
        };

        for ( let i = 0; i < source.length; i++ ) {
            const character = source[ i ];
            if ( inQuotes ) {
                if ( character === "\"" ) {
                    if ( source[ i + 1 ] === "\"" ) {
                        field += "\"";
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += character;
                }
                dirty = true;
                continue;
            }
            if ( character === "\"" ) {
                inQuotes = true;
                dirty = true;
            } else if ( character === delimiter ) {
                endField();
                dirty = true;
            } else if ( character === "\n" ) {
                endRecord();
            } else if ( character !== "\r" ) {
                field += character;
                if ( character.trim().length > 0 ) {
                    dirty = true;
                }
            }
        }
        endRecord();

        return rows;
    }

    /**
     * Turns parsed rows into objects keyed by the trimmed, lower-cased header cells. Each record carries a `__row`
     * property holding its 1-based line number in the source file, so a rejection can name the row without echoing
     * any of its contents. A short row is padded rather than dropped, so it still reports its own missing fields.
     * Pure.
     *
     * @method
     * @param {Array<Array<string>>} rows
     * @returns {{header: Array<string>, records: Array<Object>}}
     * @public
     */
    toRecords( rows ) {
        const list = Array.isArray( rows ) ? rows : [];
        if ( list.length === 0 ) {
            return { header: [], records: [] };
        }
        const header = ( list[ 0 ] || [] ).map( ( cell ) => String( cell == null ? "" : cell ).trim().toLowerCase() );
        const records = [];
        for ( let i = 1; i < list.length; i++ ) {
            const row = list[ i ] || [];
            const record = { __row: i + 1 };
            header.forEach( ( key, index ) => {
                record[ key ] = String( row[ index ] == null ? "" : row[ index ] );
            } );
            records.push( record );
        }
        return { header: header, records: records };
    }

    /* Private interface */

    /**
     * @method
     * @param {string} text
     * @returns {string}
     * @private
     */
    #stripBOM( text ) {
        return ( text.charCodeAt( 0 ) === 0xFEFF ) ? text.slice( 1 ) : text;
    }

}

const instance = new OrganizationImport();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-import.parse.test.js
```

Expected: 15 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/organization-import.parse.test.js packages/competence/package.json
git commit -m "feat(competence): add the CSV parse stage of the employee importer (CA-107)"
```

---

## Task 8: competence — map CSV rows onto employee records

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Create: `packages/competence/test/organization-import.map.test.js`

**Interfaces:**
- Consumes: `toRecords` output (Task 7).
- Produces:
  - `organizationImport.instance.COLUMNS` — frozen `{ required: string[], optional: string[] }`.
  - `organizationImport.instance.mapRow( record ) → { employee: Employee|null, error: {row, column, code, message}|null }`
  - `organizationImport.instance.mapRows( records ) → { employees: Array, errors: Array }`
  - Task 9 consumes `mapRows`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-import.map.test.js` with the AGPL header:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

function row( over = {} ) {
    return Object.assign( {
        __row: 2,
        employee_id: "00123",
        email: "Ada@Example.com",
        employment_status: "active",
        first_name: "Ada",
        last_name: "Lovelace",
        work_mode: "Full-time",
        work_location: "On-site",
        organization_unit_id: "1-1",
        role_family: "SE",
        specialization: "BACKEND",
        level: "R",
        stage: "2",
        starting_date: "2022-03-14"
    }, over );
}

describe( "organizationImport.mapRow", () => {

    it( "maps a well-formed row into the nested employee shape", () => {
        const { employee, error } = organizationImport.instance.mapRow( row() );
        assert.equal( error, null );
        assert.deepEqual( employee, {
            __row: 2,
            employeeID: "00123",
            email: "ada@example.com",
            employmentStatus: "active",
            personal: { firstName: "Ada", lastName: "Lovelace", workMode: "Full-time", workLocation: "On-site" },
            career: { organizationUnitID: "1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2, startingDate: "2022-03-14" }
        } );
    } );

    it( "carries the source row number so a later rejection can name the line", () => {
        assert.equal( organizationImport.instance.mapRow( row( { __row: 42 } ) ).employee.__row, 42 );
    } );

    it( "preserves a leading zero in the employee ID", () => {
        assert.equal( organizationImport.instance.mapRow( row() ).employee.employeeID, "00123" );
    } );

    it( "lower-cases the email, matching the login index", () => {
        assert.equal( organizationImport.instance.mapRow( row() ).employee.email, "ada@example.com" );
    } );

    it( "coerces stage to an integer", () => {
        assert.equal( organizationImport.instance.mapRow( row( { stage: " 3 " } ) ).employee.career.stage, 3 );
    } );

    it( "rejects a non-numeric stage rather than emitting NaN", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { stage: "senior" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "stage" );
        assert.equal( error.code, "not-an-integer" );
        assert.equal( error.row, 2 );
    } );

    it( "normalizes case and separators on a fixed enum", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "full time" } ) ).employee.personal.workMode, "Full-time" );
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "FULL_TIME" } ) ).employee.personal.workMode, "Full-time" );
        assert.equal( organizationImport.instance.mapRow( row( { work_location: "hybrid" } ) ).employee.personal.workLocation, "Hybrid" );
    } );

    it( "rejects an unrecognized enum value and lists the permitted ones", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { work_mode: "Casual" } ) );
        assert.equal( employee, null );
        assert.equal( error.code, "not-a-permitted-value" );
        assert.ok( error.message.includes( "Full-time" ) );
    } );

    it( "does not guess at an abbreviation", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "FT" } ) ).employee, null );
    } );

    it( "turns an empty specialization into null, marking a generalist", () => {
        assert.equal( organizationImport.instance.mapRow( row( { specialization: "" } ) ).employee.career.specialization, null );
        assert.equal( organizationImport.instance.mapRow( row( { specialization: "   " } ) ).employee.career.specialization, null );
    } );

    it( "defaults an absent employment status to active", () => {
        assert.equal( organizationImport.instance.mapRow( row( { employment_status: "" } ) ).employee.employmentStatus, "active" );
    } );

    it( "omits an absent optional date rather than writing an empty string", () => {
        const { employee } = organizationImport.instance.mapRow( row( { starting_date: "" } ) );
        assert.equal( Object.prototype.hasOwnProperty.call( employee.career, "startingDate" ), false );
    } );

    it( "rejects a date that is not ISO-8601", () => {
        const { error } = organizationImport.instance.mapRow( row( { starting_date: "14/03/2022" } ) );
        assert.equal( error.column, "starting_date" );
        assert.equal( error.code, "not-a-date" );
    } );

    it( "rejects a missing required column value", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { employee_id: "" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "employee_id" );
        assert.equal( error.code, "required" );
    } );

    it( "never echoes a personal field in the error message", () => {
        const { error } = organizationImport.instance.mapRow( row( { first_name: "", last_name: "Lovelace" } ) );
        assert.equal( error.message.includes( "Lovelace" ), false );
    } );

} );

describe( "organizationImport.mapRows", () => {

    it( "separates mapped employees from per-row errors and keeps going after a bad row", () => {
        const { employees, errors } = organizationImport.instance.mapRows( [
            row( { __row: 2, employee_id: "1" } ),
            row( { __row: 3, employee_id: "2", stage: "nope" } ),
            row( { __row: 4, employee_id: "3" } )
        ] );
        assert.equal( employees.length, 2 );
        assert.equal( errors.length, 1 );
        assert.equal( errors[ 0 ].row, 3 );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-import.map.test.js
```

Expected: `organizationImport.instance.mapRow is not a function`.

- [ ] **Step 3: Add the column contract and the mapping stage**

In `packages/competence/application/organization-import.js`, add above the class:

```js
// The CSV column contract. Documented in INSTALL.md; `--template` emits exactly this header.
const REQUIRED_COLUMNS = Object.freeze( [
    "employee_id", "email", "first_name", "last_name", "work_mode", "work_location",
    "organization_unit_id", "role_family", "level", "stage"
] );
const OPTIONAL_COLUMNS = Object.freeze( [ "employment_status", "birth_date", "gender", "specialization", "starting_date" ] );

const WORK_MODES = Object.freeze( [ "Full-time", "Part-time", "Contract" ] );
const WORK_LOCATIONS = Object.freeze( [ "On-site", "Hybrid", "Remote" ] );
const EMPLOYMENT_STATUSES = Object.freeze( [ "active", "on-leave", "terminated" ] );
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
```

Then add to the public interface, after `toRecords`:

```js
    /**
     * The CSV column contract.
     *
     * @property
     * @returns {{required: Array<string>, optional: Array<string>}}
     * @public
     */
    get COLUMNS() {
        return Object.freeze( { required: REQUIRED_COLUMNS, optional: OPTIONAL_COLUMNS } );
    }

    /**
     * Maps one CSV record onto the nested employee shape, coercing types and normalizing the fixed enums. Returns
     * either an employee or the first error found — never both. Pure.
     * <br/>
     * Enum normalization is mechanical (trim, lower-case, collapse spaces/underscores/hyphens), never a synonym
     * table: guessing what `FT` meant is how a person is silently graded wrong. An unmatched value is rejected with
     * the permitted values named.
     * <br/>
     * No error message ever contains a personal field — only the column, a code, and the permitted values.
     *
     * @method
     * @param {Object} record
     * @returns {{employee: Employee|null, error: Object|null}}
     * @public
     */
    mapRow( record ) {
        const source = record || {};
        const rowNumber = source.__row;
        const fail = ( column, code, message ) => ( { employee: null, error: { row: rowNumber, column: column, code: code, message: message } } );
        const read = ( column ) => String( source[ column ] == null ? "" : source[ column ] ).trim();

        for ( const column of REQUIRED_COLUMNS ) {
            if ( read( column ).length === 0 ) {
                return fail( column, "required", `'${ column }' is required and was empty` );
            }
        }

        const workMode = this.#matchEnum( read( "work_mode" ), WORK_MODES );
        if ( !workMode ) {
            return fail( "work_mode", "not-a-permitted-value", `'work_mode' must be one of: ${ WORK_MODES.join( ", " ) }` );
        }
        const workLocation = this.#matchEnum( read( "work_location" ), WORK_LOCATIONS );
        if ( !workLocation ) {
            return fail( "work_location", "not-a-permitted-value", `'work_location' must be one of: ${ WORK_LOCATIONS.join( ", " ) }` );
        }

        const rawStatus = read( "employment_status" );
        const employmentStatus = rawStatus.length === 0 ? "active" : this.#matchEnum( rawStatus, EMPLOYMENT_STATUSES );
        if ( !employmentStatus ) {
            return fail( "employment_status", "not-a-permitted-value", `'employment_status' must be one of: ${ EMPLOYMENT_STATUSES.join( ", " ) }` );
        }

        const rawStage = read( "stage" );
        if ( !/^\d+$/.test( rawStage ) ) {
            return fail( "stage", "not-an-integer", "'stage' must be a whole number from 1 to 3" );
        }
        const stage = Number( rawStage );

        for ( const column of [ "birth_date", "starting_date" ] ) {
            const value = read( column );
            if ( value.length > 0 && !ISO_DATE.test( value ) ) {
                return fail( column, "not-a-date", `'${ column }' must be an ISO-8601 date, formatted YYYY-MM-DD` );
            }
        }

        const specialization = read( "specialization" );
        const birthDate = read( "birth_date" );
        const gender = read( "gender" );
        const startingDate = read( "starting_date" );

        const employee = {
            // The source line number travels with the record so `reconcile` can name the offending line without
            // echoing any of its contents. `reconcile` strips it before the record reaches the plan, so it is never
            // persisted.
            __row: rowNumber,
            employeeID: read( "employee_id" ),
            email: read( "email" ).toLowerCase(),
            employmentStatus: employmentStatus,
            personal: {
                firstName: read( "first_name" ),
                lastName: read( "last_name" ),
                workMode: workMode,
                workLocation: workLocation,
                ...( birthDate ? { birthDate: birthDate } : {} ),
                ...( gender ? { gender: gender } : {} )
            },
            career: {
                organizationUnitID: read( "organization_unit_id" ),
                roleFamily: read( "role_family" ).toUpperCase(),
                specialization: specialization.length > 0 ? specialization.toUpperCase() : null,
                level: read( "level" ).toUpperCase(),
                stage: stage,
                ...( startingDate ? { startingDate: startingDate } : {} )
            }
        };
        return { employee: employee, error: null };
    }

    /**
     * Maps every record, collecting mapped employees and per-row errors separately. A bad row never stops the ones
     * around it. Pure.
     *
     * @method
     * @param {Array<Object>} records
     * @returns {{employees: Array<Employee>, errors: Array<Object>}}
     * @public
     */
    mapRows( records ) {
        const employees = [];
        const errors = [];
        for ( const record of ( Array.isArray( records ) ? records : [] ) ) {
            const { employee, error } = this.mapRow( record );
            if ( error ) {
                errors.push( error );
            } else {
                employees.push( employee );
            }
        }
        return { employees: employees, errors: errors };
    }
```

And add to the private interface, after `#stripBOM`:

```js
    /**
     * Matches a raw cell against a fixed enum, normalizing case and separators only. Returns the canonical value, or
     * `null` when nothing matches. Pure.
     *
     * @method
     * @param {string} raw
     * @param {Array<string>} allowed
     * @returns {string|null}
     * @private
     */
    #matchEnum( raw, allowed ) {
        const normalize = ( value ) => String( value == null ? "" : value ).trim().toLowerCase().replace( /[\s_-]+/g, "-" );
        const target = normalize( raw );
        if ( !target ) {
            return null;
        }
        for ( const candidate of allowed ) {
            if ( normalize( candidate ) === target ) {
                return candidate;
            }
        }
        return null;
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-import.map.test.js
```

Expected: 16 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/organization-import.map.test.js
git commit -m "feat(competence): map CSV rows onto employee records (CA-107)"
```

---

## Task 9: competence — reconcile a mapped batch against the store

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Create: `packages/competence/test/organization-import.reconcile.test.js`

**Interfaces:**
- Consumes: `mapRows` (Task 8); `employeeRules.instance.validateEmployee` and `findEmailCollision` (Tasks 2–3).
- Produces: `organizationImport.instance.reconcile( employees, existing, context ) → Plan`, where

```
Plan = {
    create:    Array<Employee>,
    update:    Array<{ employee: Employee, previous: Employee }>,
    unchanged: Array<Employee>,
    rejected:  Array<{ employeeID, row, code, message }>,
    absent:    Array<string>          // employeeIDs present in the store but not in the file
}
```

and `context` is `{ roleFamilies, organizationStructure }` — the same shape `employee-rules` takes.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-import.reconcile.test.js` with the AGPL header:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

const CONTEXT = {
    roleFamilies: { SE: { specializations: { BACKEND: {} } }, PM: { specializations: { AGILE: {} } } },
    organizationStructure: { "1": {}, "1-1": {} }
};

function employee( over = {} ) {
    return {
        employeeID: over.employeeID || "1",
        email: ( over.email !== undefined ) ? over.email : "ada@example.com",
        employmentStatus: over.employmentStatus || "active",
        personal: { firstName: "Ada", lastName: "Lovelace", workMode: "Full-time", workLocation: "On-site" },
        career: {
            organizationUnitID: over.unit || "1-1",
            roleFamily: over.roleFamily || "SE",
            specialization: ( over.specialization !== undefined ) ? over.specialization : "BACKEND",
            level: over.level || "R",
            stage: ( over.stage !== undefined ) ? over.stage : 2
        }
    };
}

describe( "organizationImport.reconcile", () => {

    it( "classifies an unknown employeeID as a create", () => {
        const plan = organizationImport.instance.reconcile( [ employee() ], [], CONTEXT );
        assert.equal( plan.create.length, 1 );
        assert.equal( plan.update.length, 0 );
        assert.equal( plan.rejected.length, 0 );
    } );

    it( "classifies a changed record as an update", () => {
        const existing = [ employee( { level: "J" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { level: "S" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.update[ 0 ].previous.career.level, "J" );
        assert.equal( plan.update[ 0 ].employee.career.level, "S" );
    } );

    it( "classifies an identical record as unchanged", () => {
        const plan = organizationImport.instance.reconcile( [ employee() ], [ employee() ], CONTEXT );
        assert.equal( plan.unchanged.length, 1 );
        assert.equal( plan.update.length, 0 );
    } );

    it( "reconciles on employeeID, so a changed email still updates the same record", () => {
        const existing = [ employee( { email: "old@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { email: "new@example.com" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.create.length, 0 );
    } );

    it( "rejects two rows in the batch sharing an email, naming both", () => {
        const rows = [ employee( { employeeID: "1" } ), employee( { employeeID: "2" } ) ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.equal( plan.rejected.length, 2 );
        assert.ok( plan.rejected.every( ( r ) => r.code === "duplicate-email" ) );
        assert.deepEqual( plan.rejected.map( ( r ) => r.employeeID ).sort(), [ "1", "2" ] );
    } );

    it( "rejects a row whose email is already held by a different stored employee", () => {
        const existing = [ employee( { employeeID: "9", email: "ada@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employeeID: "1" } ) ], existing, CONTEXT );
        assert.equal( plan.rejected.length, 1 );
        assert.equal( plan.rejected[ 0 ].code, "duplicate-email" );
    } );

    it( "rejects a row whose organization unit is not in the tree", () => {
        const plan = organizationImport.instance.reconcile( [ employee( { unit: "9-9" } ) ], [], CONTEXT );
        assert.equal( plan.rejected.length, 1 );
        assert.equal( plan.rejected[ 0 ].code, "error.employee.invalid-organization-unit" );
    } );

    it( "rejects a specialization that does not belong to the family", () => {
        const plan = organizationImport.instance.reconcile( [ employee( { roleFamily: "PM", specialization: "BACKEND" } ) ], [], CONTEXT );
        assert.equal( plan.rejected[ 0 ].code, "error.employee.invalid-specialization" );
    } );

    it( "treats a leaver as an update to terminated, never a deletion", () => {
        const existing = [ employee( { employmentStatus: "active" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employmentStatus: "terminated" } ) ], existing, CONTEXT );
        assert.equal( plan.update.length, 1 );
        assert.equal( plan.update[ 0 ].employee.employmentStatus, "terminated" );
    } );

    it( "reports a stored employee missing from the file without touching them", () => {
        const existing = [ employee( { employeeID: "1" } ), employee( { employeeID: "7", email: "g@example.com" } ) ];
        const plan = organizationImport.instance.reconcile( [ employee( { employeeID: "1" } ) ], existing, CONTEXT );
        assert.deepEqual( plan.absent, [ "7" ] );
        assert.equal( plan.update.length, 0 );
        assert.equal( plan.unchanged.length, 1 );
    } );

    it( "rejects two rows carrying the same employeeID", () => {
        const rows = [ employee( { employeeID: "1", email: "a@x.co" } ), employee( { employeeID: "1", email: "b@x.co" } ) ];
        const plan = organizationImport.instance.reconcile( rows, [], CONTEXT );
        assert.ok( plan.rejected.some( ( r ) => r.code === "duplicate-employee-id" ) );
    } );

    it( "names the source line on a rejection, and strips the marker from the plan", () => {
        const bad = Object.assign( employee( { unit: "9-9" } ), { __row: 17 } );
        const good = Object.assign( employee( { employeeID: "2", email: "g@example.com" } ), { __row: 18 } );
        const plan = organizationImport.instance.reconcile( [ bad, good ], [], CONTEXT );

        assert.equal( plan.rejected[ 0 ].row, 17 );
        assert.equal( Object.prototype.hasOwnProperty.call( plan.create[ 0 ], "__row" ), false );
    } );

    it( "is idempotent — reconciling the applied result again yields only unchanged", () => {
        const first = organizationImport.instance.reconcile( [ employee() ], [], CONTEXT );
        const second = organizationImport.instance.reconcile( [ employee() ], first.create, CONTEXT );
        assert.equal( second.unchanged.length, 1 );
        assert.equal( second.create.length, 0 );
        assert.equal( second.update.length, 0 );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-import.reconcile.test.js
```

Expected: `organizationImport.instance.reconcile is not a function`.

- [ ] **Step 3: Implement reconcile**

In `packages/competence/application/organization-import.js`, add the require at the top of the file:

```js
const employeeRules = require( "#employee-rules" );
```

Add to the public interface, after `mapRows`:

```js
    /**
     * Classifies every mapped employee against the current store, returning a plan rather than performing any write.
     * The plan is what makes dry-run free: the preview and the applied change come from this one function, so a
     * dry-run cannot diverge from what apply does. Pure.
     * <br/>
     * Reconciliation is keyed on `employeeID`, never email — a person who changes their name or address must keep
     * the same record, and with it their evaluation history. A shared email is a rejection rather than a warning,
     * because it makes the login index ambiguous and locks out **both** employees.
     * <br/>
     * An employee present in the store but absent from the file is reported and left untouched. A departure is never
     * inferred from an omission: a partial export would otherwise terminate half the organization.
     *
     * @method
     * @param {Array<Employee>} employees - Mapped candidates, from {@link OrganizationImport#mapRows}.
     * @param {Array<Employee>} existing - Every employee currently stored.
     * @param {EmployeeRulesContext} context
     * @returns {{create: Array, update: Array, unchanged: Array, rejected: Array, absent: Array}}
     * @public
     */
    reconcile( employees, existing, context ) {
        const candidates = Array.isArray( employees ) ? employees : [];
        const stored = Array.isArray( existing ) ? existing : [];
        const plan = { create: [], update: [], unchanged: [], rejected: [], absent: [] };

        const storedByID = new Map( stored.filter( ( e ) => e && e.employeeID ).map( ( e ) => [ String( e.employeeID ), e ] ) );
        const seenIDs = new Set();
        const seenEmails = new Map();
        const rejectedIDs = new Set();

        const reject = ( employee, code, message ) => {
            plan.rejected.push( { employeeID: String( employee.employeeID ), row: employee.__row, code: code, message: message } );
            rejectedIDs.add( String( employee.employeeID ) );
        };

        // Pass 1 — collisions within the batch itself.
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( seenIDs.has( id ) ) {
                reject( candidate, "duplicate-employee-id", `employee_id '${ id }' appears more than once in this file` );
            }
            seenIDs.add( id );

            const email = String( candidate.email == null ? "" : candidate.email ).trim().toLowerCase();
            if ( email ) {
                const previous = seenEmails.get( email );
                if ( previous ) {
                    // Both participants are named: either could be the wrong one, and the operator needs the pair.
                    reject( previous, "duplicate-email", `this email is also used by employee_id '${ id }' in this file` );
                    reject( candidate, "duplicate-email", `this email is also used by employee_id '${ String( previous.employeeID ) }' in this file` );
                } else {
                    seenEmails.set( email, candidate );
                }
            }
        }

        // Pass 2 — validity and classification.
        for ( const candidate of candidates ) {
            const id = String( candidate.employeeID );
            if ( rejectedIDs.has( id ) ) {
                continue;
            }

            const violation = employeeRules.instance.validateEmployee( candidate, context );
            if ( violation ) {
                reject( candidate, violation, `record is not valid: ${ violation }` );
                continue;
            }

            const collision = employeeRules.instance.findEmailCollision( candidate.email, id, stored );
            if ( collision ) {
                reject( candidate, "duplicate-email", `this email is already held by stored employee_id '${ collision }'` );
                continue;
            }

            // Strip the row marker here: it exists only to name a line in a rejection, and must never be persisted.
            const record = this.#withoutRowMarker( candidate );
            const previous = storedByID.get( id );
            if ( !previous ) {
                plan.create.push( record );
            } else if ( this.#isSameRecord( previous, record ) ) {
                plan.unchanged.push( record );
            } else {
                plan.update.push( { employee: record, previous: previous } );
            }
        }

        for ( const id of storedByID.keys() ) {
            if ( !seenIDs.has( id ) ) {
                plan.absent.push( id );
            }
        }

        return plan;
    }
```

Add to the private interface:

```js
    /**
     * Returns the record without the `__row` marker that {@link OrganizationImport#mapRow} attaches. The marker
     * exists only so a rejection can name its source line; it must never reach the store. Pure.
     *
     * @method
     * @param {Employee} employee
     * @returns {Employee}
     * @private
     */
    #withoutRowMarker( employee ) {
        const { __row, ...record } = employee || {};
        return record;
    }

    /**
     * Whether a stored record and a candidate are identical for import purposes. Compares the fields the importer
     * writes, ignoring key order and any property the importer never sets. Pure.
     *
     * @method
     * @param {Employee} previous
     * @param {Employee} candidate
     * @returns {boolean}
     * @private
     */
    #isSameRecord( previous, candidate ) {
        const normalize = ( employee ) => JSON.stringify( {
            employeeID: String( employee.employeeID ),
            email: String( employee.email == null ? "" : employee.email ).trim().toLowerCase(),
            employmentStatus: employee.employmentStatus || "active",
            personal: {
                firstName: employee.personal && employee.personal.firstName,
                lastName: employee.personal && employee.personal.lastName,
                workMode: employee.personal && employee.personal.workMode,
                workLocation: employee.personal && employee.personal.workLocation,
                birthDate: ( employee.personal && employee.personal.birthDate ) || null,
                gender: ( employee.personal && employee.personal.gender ) || null
            },
            career: {
                organizationUnitID: employee.career && employee.career.organizationUnitID,
                roleFamily: employee.career && employee.career.roleFamily,
                specialization: ( employee.career && employee.career.specialization ) || null,
                level: employee.career && employee.career.level,
                stage: employee.career && employee.career.stage,
                startingDate: ( employee.career && employee.career.startingDate ) || null
            }
        } );
        return normalize( previous ) === normalize( candidate );
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-import.reconcile.test.js
```

Expected: 13 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/organization-import.reconcile.test.js
git commit -m "feat(competence): reconcile an imported batch against the employee store (CA-107)"
```

---

## Task 10: competence — apply the plan and ship the CLI

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Create: `packages/competence/test/organization-import.apply.test.js`
- Create: `packages/competence/bin/build/import-organization.js`
- Modify: `packages/competence/package.json` (version + `scripts`), `packages/competence/CHANGELOG.md`, `packages/competence/INSTALL.md`

**Interfaces:**
- Consumes: the whole pipeline (Tasks 7–9).
- Produces: `organizationImport.instance.applyPlan( plan, writer ) → Promise<{created, updated, skipped}>`, where `writer` is `{ save( employee ) → Promise, audit( entry ) → Promise }`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-import.apply.test.js` with the AGPL header:

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

function recordingWriter() {
    const saved = [];
    const audited = [];
    return {
        saved: saved,
        audited: audited,
        save: ( employee ) => { saved.push( employee ); return Promise.resolve( employee ); },
        audit: ( entry ) => { audited.push( entry ); return Promise.resolve(); }
    };
}

const CREATED = { employeeID: "1", email: "a@x.co", personal: {}, career: {} };
const UPDATED = { employeeID: "2", email: "b@x.co", personal: {}, career: {} };
const PREVIOUS = { employeeID: "2", email: "old@x.co", personal: {}, career: {} };

describe( "organizationImport.applyPlan", () => {

    it( "writes creates and updates, and skips unchanged records", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( {
            create: [ CREATED ],
            update: [ { employee: UPDATED, previous: PREVIOUS } ],
            unchanged: [ { employeeID: "3" } ],
            rejected: [],
            absent: []
        }, writer );

        assert.deepEqual( result, { created: 1, updated: 1, skipped: 1 } );
        assert.deepEqual( writer.saved.map( ( e ) => e.employeeID ), [ "1", "2" ] );
    } );

    it( "audits a create with a __created__ field and no previous value", async () => {
        const writer = recordingWriter();
        await organizationImport.instance.applyPlan( { create: [ CREATED ], update: [], unchanged: [], rejected: [], absent: [] }, writer );

        assert.equal( writer.audited.length, 1 );
        assert.equal( writer.audited[ 0 ].subjectType, "employee" );
        assert.equal( writer.audited[ 0 ].subjectID, "1" );
        assert.equal( writer.audited[ 0 ].field, "__created__" );
        assert.equal( writer.audited[ 0 ].oldValue, null );
    } );

    it( "audits an update carrying the previous record", async () => {
        const writer = recordingWriter();
        await organizationImport.instance.applyPlan( { create: [], update: [ { employee: UPDATED, previous: PREVIOUS } ], unchanged: [], rejected: [], absent: [] }, writer );

        assert.equal( writer.audited[ 0 ].field, "__imported__" );
        assert.equal( writer.audited[ 0 ].oldValue.email, "old@x.co" );
        assert.equal( writer.audited[ 0 ].newValue.email, "b@x.co" );
    } );

    it( "never writes a rejected or absent record", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( {
            create: [], update: [], unchanged: [],
            rejected: [ { employeeID: "8", code: "duplicate-email" } ],
            absent: [ "9" ]
        }, writer );

        assert.deepEqual( result, { created: 0, updated: 0, skipped: 0 } );
        assert.equal( writer.saved.length, 0 );
    } );

    it( "applies an empty plan without error", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( { create: [], update: [], unchanged: [], rejected: [], absent: [] }, writer );
        assert.deepEqual( result, { created: 0, updated: 0, skipped: 0 } );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-import.apply.test.js
```

Expected: `organizationImport.instance.applyPlan is not a function`.

- [ ] **Step 3: Implement applyPlan**

Add to the public interface of `organization-import.js`, after `reconcile`:

```js
    /**
     * Applies a plan through the injected writer, sequentially so a partial failure leaves a comprehensible store.
     * Only `create` and `update` are written; `unchanged`, `rejected` and `absent` are never touched — which is what
     * makes a re-run of the same file a no-op.
     *
     * @method
     * @param {Object} plan - From {@link OrganizationImport#reconcile}.
     * @param {{save: function(Employee): Promise, audit: function(Object): Promise}} writer
     * @returns {Promise<{created: number, updated: number, skipped: number}>}
     * @public
     */
    applyPlan( plan, writer ) {
        const safe = plan || {};
        const creates = Array.isArray( safe.create ) ? safe.create : [];
        const updates = Array.isArray( safe.update ) ? safe.update : [];
        const skipped = Array.isArray( safe.unchanged ) ? safe.unchanged.length : 0;

        const steps = creates.map( ( employee ) => () => {
            return writer.save( employee ).then( ( saved ) => writer.audit( {
                subjectType: "employee",
                subjectID: String( employee.employeeID ),
                field: "__created__",
                oldValue: null,
                newValue: saved || employee
            } ) );
        } ).concat( updates.map( ( change ) => () => {
            return writer.save( change.employee ).then( ( saved ) => writer.audit( {
                subjectType: "employee",
                subjectID: String( change.employee.employeeID ),
                field: "__imported__",
                oldValue: change.previous,
                newValue: saved || change.employee
            } ) );
        } ) );

        return steps.reduce( ( chain, step ) => chain.then( step ), Promise.resolve() )
            .then( () => ( { created: creates.length, updated: updates.length, skipped: skipped } ) );
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-import.apply.test.js
```

Expected: 5 passing.

- [ ] **Step 5: Write the CLI driver**

Create `packages/competence/bin/build/import-organization.js` with the AGPL header. Follow the `require.main === module` guard style of `bin/build/build-user-guide.js`:

```js
/**
 * Operator CLI for the employee importer. Dry-run by default: writing requires an explicit `--apply`.
 *
 * Usage:
 *   node bin/build/import-organization.js --file employees.csv               # dry run, prints the plan
 *   node bin/build/import-organization.js --file employees.csv --apply       # writes
 *   node bin/build/import-organization.js --template > employees.csv         # emit the header row
 *   node bin/build/import-organization.js --file e.csv --delimiter ";"       # override detection
 *
 * Output names rows by employee_id and line number only — never a name, email, date of birth or grading. This runs
 * against real HR data, and a terminal or CI log is not a place for it.
 *
 * Exits non-zero when any row is rejected, so a run is scriptable.
 */

const fs = require( "node:fs" );

const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const organizationImport = require( "#organization-import" );

function parseArguments( argv ) {
    const args = { file: null, apply: false, template: false, delimiter: null };
    for ( let i = 0; i < argv.length; i++ ) {
        if ( argv[ i ] === "--file" ) args.file = argv[ ++i ];
        else if ( argv[ i ] === "--apply" ) args.apply = true;
        else if ( argv[ i ] === "--template" ) args.template = true;
        else if ( argv[ i ] === "--delimiter" ) args.delimiter = argv[ ++i ];
    }
    return args;
}

function printTemplate() {
    const columns = organizationImport.instance.COLUMNS;
    process.stdout.write( columns.required.concat( columns.optional ).join( "," ) + "\n" );
}

function printPlan( plan, applied ) {
    process.stdout.write( `\n${ applied ? "APPLIED" : "DRY RUN — nothing was written" }\n` );
    process.stdout.write( `  create    ${ plan.create.length }\n` );
    process.stdout.write( `  update    ${ plan.update.length }\n` );
    process.stdout.write( `  unchanged ${ plan.unchanged.length }\n` );
    process.stdout.write( `  rejected  ${ plan.rejected.length }\n` );
    process.stdout.write( `  in store but absent from the file: ${ plan.absent.length } (left untouched)\n` );

    if ( plan.rejected.length > 0 ) {
        process.stdout.write( "\nRejections:\n" );
        for ( const rejection of plan.rejected ) {
            const where = rejection.row ? `line ${ rejection.row }` : "unknown line";
            process.stdout.write( `  ${ where }, employee_id '${ rejection.employeeID }': ${ rejection.code } — ${ rejection.message }\n` );
        }
    }
    if ( plan.absent.length > 0 ) {
        process.stdout.write( `\nAbsent from the file (employee_id): ${ plan.absent.join( ", " ) }\n` );
        process.stdout.write( "A departure is never inferred from an omission — mark a leaver with employment_status=terminated.\n" );
    }
}

function run() {
    const args = parseArguments( process.argv.slice( 2 ) );

    if ( args.template ) {
        printTemplate();
        return Promise.resolve( 0 );
    }
    if ( !args.file ) {
        process.stderr.write( "Missing --file. Use --template to emit the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    let text;
    try {
        // 'utf8' replaces an undecodable byte with U+FFFD rather than throwing, so check for it explicitly: a
        // CP1251 export of Cyrillic names would otherwise be written to the store as mojibake.
        text = fs.readFileSync( args.file, "utf8" );
    } catch ( error ) {
        process.stderr.write( `Unable to read '${ args.file }': ${ error.message }\n` );
        return Promise.resolve( 2 );
    }
    if ( text.includes( "�" ) ) {
        process.stderr.write( "The file is not valid UTF-8. Re-export it as UTF-8 — a Windows-1251 export would store names as mojibake.\n" );
        return Promise.resolve( 2 );
    }

    const rows = organizationImport.instance.parseDelimited( text, args.delimiter ? { delimiter: args.delimiter } : undefined );
    const { header, records } = organizationImport.instance.toRecords( rows );

    const missing = organizationImport.instance.COLUMNS.required.filter( ( column ) => !header.includes( column ) );
    if ( missing.length > 0 ) {
        process.stderr.write( `The header is missing required column(s): ${ missing.join( ", " ) }\n` );
        process.stderr.write( "Run with --template to see the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    const { employees, errors } = organizationImport.instance.mapRows( records );

    return dataManager.instance.fetchEmployees().then( ( existing ) => {
        const plan = organizationImport.instance.reconcile( employees, existing, {
            roleFamilies: configurationLoader.configRoleFamilies,
            organizationStructure: configurationLoader.configOrganizationStructure
        } );

        // Mapping errors are rejections too — merge them so one list is the whole truth.
        plan.rejected = errors.map( ( error ) => ( {
            employeeID: "(unmapped)",
            row: error.row,
            code: error.code,
            message: `${ error.column }: ${ error.message }`
        } ) ).concat( plan.rejected );

        if ( !args.apply ) {
            printPlan( plan, false );
            return plan.rejected.length > 0 ? 1 : 0;
        }

        return organizationImport.instance.applyPlan( plan, {
            save: ( employee ) => dataManager.instance.saveEmployee( employee ),
            audit: ( entry ) => dataManager.instance.appendAuditEntry( Object.assign( { changedBy: "import-cli" }, entry ) )
        } ).then( () => {
            printPlan( plan, true );
            return plan.rejected.length > 0 ? 1 : 0;
        } );
    } );
}

if ( require.main === module ) {
    run().then( ( code ) => process.exit( code ) ).catch( ( error ) => {
        process.stderr.write( `Import failed: ${ error.message }\n` );
        process.exit( 2 );
    } );
}

module.exports = { run, parseArguments };
```

- [ ] **Step 6: Verify the CLI end to end against the dev stack**

Emit a template, fill two rows matching the shipped demo tree's unit `1-1-1`, and dry-run:

```bash
node packages/competence/bin/build/import-organization.js --template
```

Expected: one comma-separated header line containing `employee_id` first and `starting_date` last.

Then, with the Docker dev stack up (`docker compose up --build`), run a dry-run against a two-row file and confirm the plan prints `create 2` and `rejected 0`, and that **no name or email appears anywhere in the output**.

- [ ] **Step 7: Add the npm script**

In `packages/competence/package.json` `scripts`:

```json
    "import:org": "node bin/build/import-organization.js",
```

- [ ] **Step 8: Document the importer**

In `packages/competence/INSTALL.md`, add a subsection to the installation flow covering: the column contract table (copy from the design record §5.4), the UTF-8 and delimiter requirements, the leading-zero warning, dry-run first, `--apply`, and **take a Redis backup before applying — an import has no rollback**.

- [ ] **Step 9: Run the whole suite and the linter**

```bash
node --test packages/competence/test/
```

```bash
npm run lint
```

Expected: both clean.

- [ ] **Step 10: Bump the version and changelog**

Set `packages/competence/package.json` `version` to `3.22.0`. Add to the top of `packages/competence/CHANGELOG.md`:

```markdown
## Version 3.22.0

A real organization can now be loaded into a deployment. The org unit tree becomes a store-backed configuration
document — versioned, validated, audited and admin-editable rather than welded into the container image — and
employee records arrive through a validating, idempotent CSV importer. Requires `@ti-engine/web-framework` ≥ 1.25.0.

* feat(competence): register `organization-structure` as the ninth store-backed configuration document, with a JSON
  schema and three blocking semantic validators — single root, parent/child symmetry, and acyclicity. Each closes a
  failure that was previously silent: a second root breaks the structural-supervisor derivation, an asymmetric link
  yields a half-connected graph with no error, and a cycle is a stack overflow at login rather than a diagnosable
  fault. The document is registered `driftTracked: false` — it holds deployment data, not content shipped with the
  release, so it differs from the image default by design (CA-107)
* feat(competence): report every organization unit whose `managerID` names no employee or a terminated one, as a
  startup `WARNING` per finding. Deliberately a diagnostic rather than a validator: blocking the tree's save on
  employee data would deadlock a fresh install, since the tree must exist before an employee can reference its
  units (CA-107)
* feat(competence): add the employee CSV importer — a pure `organization-import` module (parse → map → reconcile →
  apply) with a dry-run-by-default CLI, `npm run import:org`. Reconciliation is keyed on `employeeID` so a changed
  name or email keeps the same record and its evaluation history; a leaver becomes `terminated` rather than being
  deleted, which would orphan their evaluations; and an employee absent from the file is reported, never inferred
  as a departure. Returning a plan is what makes dry-run exact — the preview and the write come from one function
  (CA-107)
* fix(competence): reject a duplicate employee email on write. Nothing enforced uniqueness, and
  `buildEmailIndex` marks a shared address ambiguous only afterwards — at which point `IdentityResolver` refuses
  **both** employees. A Supervisor could lock out two people through the ordinary Employee Management screen with
  no warning (CA-107)
* refactor(competence): extract employee field validation from the web application into the pure `employee-rules`
  module with configuration injected, so the UI, the importer and any future sync driver decide validity
  identically. Behaviour is unchanged — same rules, same returned label keys
* docs(competence): correct `INSTALL.md` §17 and the `README.md` runtime-configurability table, which both
  described the org structure as a build-time file, and add the import runbook
* build(release): bump package version from `3.21.1` to `3.22.0`
```

- [ ] **Step 11: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/organization-import.apply.test.js packages/competence/bin/build/import-organization.js packages/competence/package.json packages/competence/CHANGELOG.md packages/competence/INSTALL.md
git commit -m "feat(competence): add the employee import CLI and release 3.22.0 (CA-107)"
```

---

## Verification before opening the pull request

- [ ] `npm test` at the workspace root — every package's suite passes
- [ ] `npm run lint` — clean
- [ ] `npm run test:json -w @ti-engine/competence` — the shipped org structure validates against its new schema
- [ ] `git diff --stat master` shows no `.run/*.run.xml`
- [ ] Every commit message references `CA-107`
- [ ] CA-107 has its time logged and is moved to `State: Verified` / `Stage: Done`
