# Design — Competence Organization Chart & Employee Import

| | |
|---|---|
| **Date** | 2026-08-19 |
| **Packages** | `packages/competence`, plus a small `packages/web-framework` addition (see §5.2) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | competence `3.21.1` → `3.22.0` (minor); web-framework `1.24.2` → `1.25.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack `CA-###` — to be created (subtask of the organization/identity epic) |

---

## 1. Background & motivation

A deployment of the competence app is useless until it knows the organization it is appraising. Today that knowledge
arrives in two incompatible ways, and neither is fit for a real installation of 50–300 people.

**The unit tree** lives in `bin/config/config.organization-structure.json`, `require()`d and deep-frozen at module
load (`configuration-loader.js:20`). It is not one of the eight store-backed configuration documents, so it has no
schema, no validators, no versioning, no audit trail and no admin editor. Changing it means changing the image.
`README.md`'s configuration-reference table marks it *Admin-editable: No*, while `INSTALL.md` §11 tells operators
the opposite — that it can be adjusted "via the framework's admin configuration system". That statement is false
today.

**Employee records** live in Redis and are created one at a time through the Employee Management screen
(`create-employee` / `update-employee`). The only bulk path is `bin/data/seeders/employees.json` behind
`COMPETENCE_PRELOAD_DATA=true` — demo-data machinery that initializes empty collections, cannot update an existing
record, and re-applies on every boot while the flag is set.

Neither half has an update path, and the half that most needs governance — the tree whose shape assigns SUPERVISOR
rights — is the half welded into the container image.

### 1.1 Why Azure AD does not solve this

The target deployment already has Azure AD SSO. That integration is **authentication only**. `identity-resolver.js`
lowercases the email the user authenticated with and matches it against `employee.email`. No record refuses the
login; two records sharing an email refuse it rather than guessing; `terminated` refuses it. `TI_WEB_AUTH_ADMINS` is
the break-glass that admits an administrator with no employee record at all.

So SSO supplies **identity binding for free** and **nothing about structure**. There is no Microsoft Graph call
anywhere in the codebase, and — per §2, decision 3 — there will not be one.

### 1.2 Why the directory could not populate an employee anyway

`employee.schema.json` requires, per person: `personal.firstName`, `personal.lastName`, `personal.workMode`
(Full-time / Part-time / Contract), `personal.workLocation` (On-site / Hybrid / Remote),
`career.organizationUnitID`, `career.roleFamily` (one of nine), `career.level` (N/J/R/S/X/T) and `career.stage`
(1–3). Entra ID can supply the first two and the email. It cannot supply work mode, work location, role family,
specialization, level or stage — those are appraisal-domain gradings, not directory attributes.

## 2. Decisions taken during brainstorming (2026-08-19)

1. **One-time load now, sync later.** The importer is built so a later automated sync becomes a *new driver* against
   the same validation and reconciliation module, not a rework.
2. **Scale is 50–300 employees**, roughly 10–40 units. Hand-typing employees through a web form is not viable;
   hand-authoring ~30 units is.
3. **The HRIS is the authoritative org chart**, not Entra ID. Entra's only role remains issuing an email that matches
   `employee.email`. **Microsoft Graph is therefore out of scope permanently** — no app registration, no
   `Directory.Read.All`, no admin consent, and no need to synthesize units from a person-to-person manager chain.
4. **The unit tree is hand-authored; employee records are generated.** The tree's *shape* is a governance decision
   (see §2, decision 5), not a data migration.
5. **The tree shape assigns SUPERVISOR rights.** `role-resolver.js` derives a structural supervisor as the root
   unit's manager, plus any direct report of that manager whose managed subtree runs at least
   `MIN_SUPERVISOR_SUBTREE_DEPTH` (2) nested *manager-led* levels deep; manager-less intermediate units are recursed
   through but not counted. Drawing the tree is therefore an access-control decision and belongs to a human.
6. **CSV, not JSON, is the import format** (revised from the initial proposal — see §5.4 for what this costs).
7. **The document is exempt from drift reporting** rather than shipping an empty default tree, which keeps four
   existing test suites intact (see §5.2).

## 3. Goals & non-goals

**Goals**

- Make the organization unit tree a first-class, schema-validated, versioned, admin-editable configuration document.
- Provide a repeatable, validating, idempotent bulk import of employee records from an HRIS export.
- Make every failure mode that is currently silent visible and actionable: broken parent/child symmetry, a cycle,
  multiple roots and a duplicate email become rejections; a dangling `managerID` becomes a persistent, visible
  diagnostic (§5.1.1).
- Leave behind a seam that a later HRIS sync drives without modification.

**Non-goals**

- Microsoft Graph / Entra directory sync — permanently out (§2, decision 3).
- A scheduled or automated sync — deferred; this design only ensures it plugs in.
- An admin-facing upload screen — deferred; the CLI covers the one-time load, and the sync phase makes the screen
  partly redundant.
- Any change to how roles are derived, how evaluations are snapshotted, or how identity resolves at login.

## 4. Current state that constrains the design

| Fact | Consequence |
|---|---|
| A duplicate email refuses login for **both** records | A duplicate is a **rejection**, never a warning |
| `employmentStatus: "terminated"` refuses login | Leavers are marked terminated, never deleted — deletion would orphan their evaluations |
| `managerID` on a unit is what grants MANAGER / SUPERVISOR | A dangling `managerID` is an access-control defect, and today needs a redeploy to fix |
| `buildOrganizationChart()` is already re-runnable, and already re-runs after every employee write | Live reload on a config change is one added call, not new machinery |
| `subManagerDepth()` recurses with no visited set | A cycle in the tree is a stack overflow at login — the validator must reject cycles |
| `getTopManagerID()` assumes exactly one root | Multiple or zero roots must be rejected |
| Four org test suites assert against unit IDs `22 / 20 / 8 / 11` from the shipped demo file | The shipped default tree must stay as it is |

## 5. Design

### 5.1 Component A — `organization-structure` becomes the ninth configuration document

Register it alongside the existing eight in `config-registration.js`, add it to `STORE_BACKED` in
`configuration-loader.js`, and write the `organization-structure.schema.json` it has never had.

**Semantic validators** — each closes a currently silent failure:

| Validator | Rejects | Blocking |
|---|---|---|
| `orgSingleRoot` | Zero or more than one unit with `parent: null` | yes |
| `orgParentChildSymmetry` | A `children` entry that does not name this unit as its `parent`, and the converse | yes |
| `orgNoCycles` | Any cycle reachable through `children` | yes |
| `orgManagerResolves` | A `managerID` that names no employee, or names a `terminated` one | **no — reported** |

#### 5.1.1 Why `orgManagerResolves` reports rather than blocks

Making it blocking would deadlock a fresh install. The tree validator needs employees to exist in order to resolve
`managerID`, while the employee importer needs the tree to exist in order to resolve `organizationUnitID`. On an
empty deployment neither can go first, and the workaround — apply a manager-less tree, import, then re-apply the tree
with managers — makes a three-pass ritual out of a one-time setup.

The principled line, which this design adopts: **a validator blocks on properties intrinsic to the document, and
reports on references into another store.** Root count, parent/child symmetry and acyclicity are structural facts
about the JSON itself and stay blocking. `managerID` points into the employee collection, which has its own
lifecycle, so it is surfaced as a persistent diagnostic rather than a save gate — the same instinct as
`reportConfigDrift`, which is explicitly written so that "diagnostics must never gate boot."

Concretely, `orgManagerResolves` emits a per-unit finding shown in the admin configuration screen and logged as one
`WARNING` per unresolved manager at startup. Because a dangling `managerID` means that unit's people silently have no
manager, an unresolved finding must be visible until it clears — not a one-shot message at save time. It resolves
employees through the injected validator context, so it stays unit-testable with plain objects, consistent with the
existing validators in `config-validators.js`.

> **Corrected after implementation (CA-107 whole-branch review).** Only the startup `WARNING` shipped — there is no
> admin-configuration-screen surface for this finding; `reportUnresolvedManagers` has exactly two consumers
> (`onStart` and its own test) and no route, handler or fragment. The screen surface described in the paragraph
> above was considered and deferred rather than built: it needs a new route, handler and fragment of its own, which
> is scope beyond this feature. The finding is instead documented for operators in `INSTALL.md` §11 — what the
> warning looks like, when a screenful of it is expected, and how to clear one that persists. §10 is corrected to
> match.

The ordering this permits: apply the tree first (structurally valid, managers reported as unresolved), import
employees second, at which point the findings clear on the next evaluation.

**Live reload.** The `onConfigChanged` handler in `configuration-loader.initialize()` already reassigns the exported
config object via `applyStoreValue`. Organization structure additionally needs
`organizationManager.instance.buildOrganizationChart()` invoked after the reassignment, so an edited tree takes effect
without a restart — the same call already made after every employee write.

**Editability.** Registered `editable: true`. No bespoke composite editor in this phase; the generic document editor
is sufficient for a tree this size, and a purpose-built org editor is a separate piece of work.

### 5.2 web-framework — a `driftTracked` flag on document registration

The 3.20.0 drift subsystem compares each document's stored value against the file default shipped in the image, warns
per drifted document at startup, and lists them in the admin drift panel.

That comparison is meaningful for the other eight documents, which are **product content the vendor ships** — a
release changed the competency dictionary and this deployment is not serving it. It is meaningless for
`organization-structure`, which is **customer data**. A real org chart differs from the shipped demo tree by
definition and forever, so it would log a `WARNING` on every boot and sit permanently "drifted", devaluing a signal
that currently means something.

`ConfigService.listDrift()` today iterates every registered key and reports `configKey`, `status`, `counts`,
`storedVersion`, `editable`, `label`. This design adds an optional `driftTracked` registration flag, defaulting
`true`, surfaced in that payload. Consumers then filter on data rather than on a hardcoded key list.

This belongs in the framework rather than in competence because "is this document product content or deployment
data?" is a property of the reusable configuration subsystem — any future consumer registering customer data hits the
same problem. Competence sets `driftTracked: false` for `organization-structure` and skips it in `reportConfigDrift`
and in the admin panel.

**Alternative rejected:** shipping `config.organization-structure.json` as `{}` and moving the demo tree to a test
fixture. Cleaner semantics, but it breaks `organization-roles`, `organization-manager`,
`organization-closest-manager` and `organization-team-reviewer-eligibility`, all of which assert against the shipped
tree, in exchange for no benefit to the deployment.

### 5.3 Component B — the pure `organization-import` module

`application/organization-import.js`, a frozen singleton performing no I/O, with the caller injecting every lookup —
the established pattern of `identity-resolver`, `role-resolver`, `task-resolver` and `research-consent`.

The pipeline is four separable stages:

1. **`parseDelimited( text, options )`** — a strict RFC 4180 parser (quoted fields, embedded delimiters and newlines,
   doubled quotes). Text in, rows out; no filesystem. See §5.4.1 for why this is hand-written rather than a
   dependency.
2. **`mapRows( rows )`** — flat columns to the nested `employee.schema.json` shape, with the type coercions and
   normalizations of §5.4.2. Reports a per-row mapping failure rather than emitting a malformed record.
3. **`reconcile( records, existing, context )`** — classifies every record as `create` / `update` / `unchanged` /
   `reject` and returns a **plan**. Validates against `employee.schema.json` plus the referential checks that ajv
   cannot express: `organizationUnitID` exists in the tree, `roleFamily` is one of the nine, `specialization` is
   permitted for that family, `level` + `stage` is a legal ladder position, and email uniqueness across both the
   incoming batch and the existing store.
4. **`applyPlan( plan, writer )`** — an idempotent upsert keyed on `employeeID`, driving the injected writer.

Returning a plan from `reconcile` is what makes dry-run free: the preview and the applied change come from the same
function, so a dry-run cannot diverge from what apply does.

**The reconciliation key is `employeeID`, not email.** A person who changes their name or email address must
reconcile to the same record and keep their evaluation history. Email is unique but is not an identity.

**Leavers.** A record whose `employmentStatus` becomes `terminated` is updated, never deleted. An employee absent
from the import file is reported in the plan as an unmatched existing record and left untouched — the importer never
infers a departure from an omission, because a partial export would otherwise terminate half the company.

### 5.4 The CSV contract

One row per employee, UTF-8, first row a header. Column order is irrelevant; names are matched case-insensitively
after trimming.

| Column | Target | Required | Notes |
|---|---|---|---|
| `employee_id` | `employeeID` | yes | Reconciliation key. String — leading zeros are significant |
| `email` | `email` | yes | Lowercased on import. Must be unique. This is the SSO binding |
| `employment_status` | `employmentStatus` | no | `active` (default) / `on-leave` / `terminated` |
| `first_name` | `personal.firstName` | yes | |
| `last_name` | `personal.lastName` | yes | |
| `work_mode` | `personal.workMode` | yes | `Full-time` / `Part-time` / `Contract` |
| `work_location` | `personal.workLocation` | yes | `On-site` / `Hybrid` / `Remote` |
| `birth_date` | `personal.birthDate` | no | `YYYY-MM-DD` |
| `gender` | `personal.gender` | no | Free text |
| `organization_unit_id` | `career.organizationUnitID` | yes | Must exist in the unit tree |
| `role_family` | `career.roleFamily` | yes | `SE` `QE` `BA` `PM` `XD` `DA` `IO` `MC` `PD` |
| `specialization` | `career.specialization` | no | Empty cell becomes `null` (generalist), never `""` |
| `level` | `career.level` | yes | `N` `J` `R` `S` `X` `T` |
| `stage` | `career.stage` | yes | Integer 1–3; `N`, `X` and `T` admit only stage 1 |
| `starting_date` | `career.startingDate` | no | `YYYY-MM-DD` |

#### 5.4.1 What choosing CSV costs

JSON would have reused `employee.schema.json` directly. CSV moves four problems into the module, each of which is a
real source of silently wrong data:

- **Everything is a string.** `career.stage` is a schema integer; `"2"` must be coerced and a non-numeric must reject
  cleanly rather than reaching ajv as `NaN`.
- **Enums are exact and case-sensitive**, and HR spreadsheets produce `full time`, `Fulltime`, `FULL-TIME`. The module
  trims and case-normalizes before matching the fixed enums, then **rejects anything that still does not match,
  listing the permitted values in the message**. Deliberately no synonym table — guessing what `FT` meant is how you
  silently grade someone wrong.
- **Empty cells are ambiguous.** An empty `specialization` means `null` (a generalist within the family), which is a
  legal schema value; emitting `""` instead would fail the runtime role-families check.
- **A parser is required.** Names like `Smith, Jr.` mean naive `split(",")` corrupts data. The parser is roughly 60
  lines, hand-written and unit-tested, rather than a dependency: it must be available at runtime because the later
  admin upload screen and the sync driver both call the same module, so a build-time devDependency (the `marked`
  pattern) would be the wrong shape.

#### 5.4.2 Spreadsheet hazards the importer must survive

These are the ways an HR-produced CSV corrupts data without anyone noticing, and each gets an explicit guard:

- **A UTF-8 BOM** on the first header cell, which otherwise makes `employee_id` unmatched. Detected and stripped.
- **CP1251 rather than UTF-8** — the Windows Excel default in a Bulgarian locale. Cyrillic names arrive as mojibake.
  The importer requires UTF-8 and **fails the whole file** on an invalid sequence rather than writing corrupted names.
- **Semicolon delimiters**, also the European Excel default. The delimiter is auto-detected from the header row and
  overridable with `--delimiter`.
- **Leading zeros stripped** — `00123` becoming `123` after a round-trip through Excel silently addresses a
  *different* employee. The importer cannot detect this after the fact, so it is called out in the operator
  documentation, and `--template` (§5.5) emits a header-only file to discourage editing an export in Excel at all.
- **CRLF line endings**, normalized by the parser.
- A **leading apostrophe** is deliberately *not* stripped. Excel uses it as a display-only marker for "treat this
  cell as text" and does not write it to a CSV export, so stripping one would corrupt a value that genuinely starts
  with an apostrophe while fixing nothing real.

### 5.5 Component C — the CLI driver

`bin/build/import-organization.js`. Reads the file, calls the module, prints the plan.

- **Dry-run is the default.** Writing requires an explicit `--apply`.
- `--template` emits a header-only CSV so HR starts from the correct columns.
- `--delimiter` overrides auto-detection.
- Output is counts plus a per-rejection list **identified by `employee_id` and row number only** (see §7).
- On apply, one audit entry per change through the existing audit log, so a CLI import is as traceable as a UI edit.
- Exit code is non-zero when any row rejects, so the run is scriptable.

## 6. Error handling

Validation is **per row**: a bad row is rejected on its own and must never block the 299 good ones around it.

Three conditions fail the whole file instead, because each means the operator supplied the wrong file rather
than a flawed row — an undecodable encoding (§5.4.2), a header that does not resolve the required columns, and a
header that repeats a column. The last is fatal rather than per-row because records are keyed by header cell: two
columns normalizing to the same key silently overwrite each other, and the earlier column's data disappears with no
error anywhere.

Every rejection carries a machine-readable reason code and the row number. Duplicate email is reported against *both*
participating rows, since either could be the wrong one and the operator needs to see the pair.

## 7. Privacy & data protection

This importer processes real employee personal data, which the app is designed to hold for the appraisal purpose. Two
constraints follow:

- **No personal fields in logs or stdout.** The reconciliation report identifies rows by `employee_id` and row
  number. Names, emails, birth dates and gradings never reach a terminal, a CI log or the container log.
- **The transformation stays local.** The HRIS export and any mapping script are handled in the deployment
  environment; extracts are not pasted into external tools.

The later sync phase introduces a *new automated processing flow* over HR data, which is a materially different
proposition from a one-time operator-run load. That phase should be reviewed with the DPO before it is built, not
after. This phase does not change what data the app holds — only how it gets there.

## 8. Testing

The module is pure, so every rule is testable with plain objects and no Redis:

- **Parser** — quoted fields containing the delimiter, embedded newlines, doubled quotes, CRLF, BOM, semicolon
  detection.
- **Mapping** — stage coercion and its failure, enum case-normalization and rejection with the permitted values
  listed, empty `specialization` becoming `null`.
- **Reconciliation** — duplicate email rejected against both rows; dangling `organizationUnitID`; illegal
  `level`+`stage` pair; specialization not permitted for the family; leaver transition to `terminated`; an existing
  record absent from the file reported and untouched.
- **Idempotency** — applying the same plan twice yields all `unchanged` on the second run.
- **Validators** — one suite in the existing `config-validators` style: multiple roots, broken symmetry, a cycle, a
  dangling `managerID`, a `managerID` naming a terminated employee.

The four existing org suites keep the shipped demo tree and are untouched (§5.2).

## 9. Operational runbook for the one-time load

1. Author the unit tree from the HRIS department list, deciding deliberately where the ≥2-level depth falls — that
   choice is who gets SUPERVISOR (§2, decision 5).
2. Apply the tree as a configuration change; the structural validators reject a malformed tree before it reaches the
   graph. **Every `managerID` will report as unresolved at this point** — that is expected until step 5 (§5.1.1).
3. Export from the HRIS, transform to the §5.4 columns, and reconcile emails against what Entra actually issues.
4. Dry-run the CLI. Fix rejections. Dry-run again until clean.
5. `--apply`, then sign in as an identity from `TI_WEB_AUTH_ADMINS` and spot-check Employee Management.
6. Verify role derivation: confirm each unit manager sees MANAGER, and that exactly the intended people are
   SUPERVISOR.
7. Correct `INSTALL.md` §11, which this work finally makes accurate, and `README.md`'s
   *Admin-editable: No* row.

## 10. Risks & open questions

- **The tree shape silently determines SUPERVISOR rights.** Mitigated by step 6 of the runbook, but there is no
  screen that shows "who is a supervisor and why". A derived-roles preview would be a worthwhile follow-up.
- **Leading-zero employee IDs** cannot be detected after Excel has stripped them (§5.4.2). Only documentation and the
  `--template` flag mitigate this.
- **An unresolved `managerID` is a warning, not a save gate** (§5.1.1). That is the right call for bootstrapping, but
  it means a deployment can run indefinitely with a unit whose people have no manager, visible only in the admin
  screen and the startup log. Step 6 of the runbook is what catches it; a derived-roles preview would catch it better.
- **Corrected after implementation:** no admin-screen surface shipped for the bullet above — see the amendment in
  §5.1.1. The finding is visible only in the startup log, now documented for operators in `INSTALL.md` §11 and
  checked for explicitly in its §13 post-install verification, because the finding's own severity is `WARNING` and
  the general "no `error`/`alert` severity lines" check would otherwise pass a deployment where an entire unit has
  no manager.
- **No rollback for an applied import.** Employee writes are audited but not versioned the way configuration is.
  A Redis backup before `--apply` is the operator's rollback, and belongs in the runbook.

## 11. Delivery

Two packages, sequenced so each lands independently:

1. **web-framework `1.25.0`** — the `driftTracked` registration flag, surfaced in `listDrift`. Small, isolated,
   independently testable.
2. **competence `3.22.0`** — the schema, the four validators, the ninth document registration and its reload hook,
   the import module, the CLI driver, and the documentation corrections.

Both follow the repo's design-first cadence: small checkpointed Conventional Commits bundled thematically, with the
`CA-###` identifier in each message.
