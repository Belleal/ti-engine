# Admin Config Management — Design

| Field | Value |
|---|---|
| **Status** | In implementation — Phase A |
| **Created** | 2026-06-02 |
| **Last updated** | 2026-06-02 |
| **Owner** | Boris Kostadinov |
| **Scope** | `@ti-engine/web-framework` (reusable machinery) + `@ti-engine/competence` (editors, validators, configs) |
| **Relates to** | retires the content rebuild's materialized `config.competency-relevancy.json` (§5); archetype source = `packages/competence/design/competency-relevancy-model.md` |

## Implementation log

How this design landed in code — update as each step is committed (branch `current`).

| Phase / step | Status | Commit | Date |
|---|---|---|---|
| Design ratified (storage model · editor model · relevancy restructure) | ✅ ratified | — | 2026-06-02 |
| A1 — ConfigStore (versioned · change-sets · restore · optimistic lock) + web-framework test harness | ✅ committed | `b2fab75` | 2026-06-02 |
| A2 — Admin role (allowlist → session roles + framework guard) | ✅ committed | `0be8a6f` | 2026-06-02 |
| A3 — ConfigRegistry + validation pipeline (ajv + semantic validators) | ✅ committed | `129cd7b` | 2026-06-02 |
| A4 — Composite-editor abstraction + transactional multi-doc save | ✅ committed | `115c5a3` | 2026-06-02 |
| A5 — Change propagation (in-process notifier; cross-instance deferred) | ✅ committed | `38a8195` | 2026-06-02 |
| A6 — Audit + snapshot integration (validated restore + audit/history queries) | ✅ committed | `939f308` | 2026-06-02 |
| A7 — Export-to-git (download bundle) | ✅ committed | `8a5e8be` | 2026-06-02 |
| A8a — Admin config HTTP API (admin-gated `/admin/config/*` routes) | ✅ committed | `7e2af9c` | 2026-06-02 |
| A8b — Admin UI shell + shared components | ⏸ deferred — built with the UI effort (Phase C) | — | — |
| B1 — Relevancy restructure (archetypes config + per-competency assignment; retire materialized relevancy) | ✅ committed | `1b38ffe` | 2026-06-02 |
| B2a — Framework config registration API (`TiWebAppManager.registerConfig*`) | ✅ committed | `2b4ab6d` | 2026-06-02 |
| B2b — Register competence config docs + validators + composite editors | ⏳ in progress | — | — |
| B3 — Store-backed configuration-loader (seed-empty bootstrap + refresh on `config:changed`) | ☐ planned | — | — |
| C — Admin UI shell + competency text editor (BG review) | ☐ planned | — | — |
| D — Archetype editor + assignment editor | ☐ planned | — | — |
| E — Later editors (dictionary structure, role-families, …) | ☐ planned | — | — |

> **Reorder note (2026-06-02):** the UI (former A8b) is deferred and built *with* the first concrete editor in Phase C, after Phase B registers competence's configs (so screens have real data). **UI implementation guidance:** the design concept in `.claude/competence-design-concept` is a portable React/CSS rendering of the *visual language only*; the implementation must follow the framework's real stack (HTMX + Alpine CSP + server-rendered fragments) and **use the existing competence screens/components as the reference**, reusing the established `.ti-*` primitives.

Enables `Admin`-role users to edit application configuration through the UI, with every write validated and persisted server-side, full version history with restore, and an explicit export-to-git for durable/reviewable versioning.

**Agreed framing:**
- **Split:** reusable machinery in `@ti-engine/web-framework`; only config-specific schemas, validators, compose/decompose logic, and editor screens in `@ti-engine/competence`.
- **Storage:** hybrid — the store is the live truth, in-repo JSON files are *empty-store* bootstrap defaults, and an explicit admin **download/export bundle** lets you commit the live config to git manually.
- **Editing is entity-contextual, not file-contextual** — admins edit domain entities (a "competency"), which are projected from one or more config documents and scattered back on save.

> Current-state claims about competence internals are marked *(confirm)* where inferred.

---

## 1. The core shift: config becomes runtime data

Config moves from static frozen files to a layered model:

| Layer | What | Where |
|---|---|---|
| **Defaults** | in-repo JSON files; seed an *empty* store only | each package's `bin/config` + localization |
| **Live** | the operational config the app reads at runtime | versioned ConfigStore (Redis-backed) |
| **History** | full snapshot per committed edit; enables restore | ConfigStore history, correlated by change-set |
| **Git export** | on demand: live config → downloadable JSON bundle → you commit | export action |

**Boot rule (resolves the destructive-seeder tension):** for each registered config, if the live store is empty, seed it from the file defaults (idempotent, empty-store-only); otherwise the store wins. `COMPETENCE_PRELOAD_DATA`'s destructive reseed becomes "seed only when empty," with an explicit, audited "reset to defaults" admin action as the one-way-in.

**Snapshot immunity (must preserve):** evaluation snapshots freeze their resolved name/description/scope/relevancy at evaluation creation *(confirm — `buildEvaluationSnapshot`)*, so live config edits — including recalibration — affect only *future* resolutions. Historical evaluations are untouched.

---

## 2. Domain-entity (composite) editors — the central pattern

Admins edit **domain entities**, not raw config files. An entity is a projection over one or more documents:

- **READ / compose:** assemble related documents into entity "rows" for display.
- **WRITE / decompose (scatter):** map an edited row back into per-document patches.
- **Transactional multi-document save:** a single logical save may touch several documents → validate *all* (each JSON Schema + semantic + cross-document integrity) → write **all-or-nothing** → version each touched document → emit **one change-set** (shared id + note + adminID) so history/restore treats the logical edit as a unit even though storage is per-document. Optimistic lock spans the change-set's source documents.

The framework provides this abstraction; competence supplies each entity's `compose`/`decompose` + which documents it spans + its validators.

---

## 3. Framework vs competence split

### 3.1 `@ti-engine/web-framework` (reusable core)
1. **`Admin` role + authorization** — a single new role above Manager/Supervisor; **server-side** route guards on every config endpoint (403 otherwise). UI `x-show` gating is cosmetic only.
2. **ConfigRegistry** — apps register editable config *documents* (key, JSON Schema, semantic validators, default loader, metadata) and **composite editors** (the entities, with `compose`/`decompose` + spanned documents).
3. **Versioned ConfigStore** — `getCurrent`, `saveChangeSet` (multi-document, transactional), `listHistory`, `getVersion`, `restore`. Redis-backed; per-document versioning correlated by change-set id; optimistic locking.
4. **Validation pipeline** — ajv (schemas) + registered semantic validators; atomic reject with field-level errors.
5. **Change propagation** — `ConfigService` emits `config:changed` on commit through a transport-agnostic notifier (asynchronous delivery; plain-JSON payload). v1 ships an **in-process `EventEmitter`** implementation for in-process reactions (in-memory cache invalidation, live admin UI). Core's `message-exchange` is RPC/queue (directed request-response), **not** a broadcast bus, so cross-instance fan-out is **deferred to a planned reusable Redis pub/sub in `@ti-engine/core`** — injectable behind the same `publish`/`subscribe` contract with no change to publishers/subscribers. (The shared Redis cache already makes a committed change visible to every store-backed reader; propagation matters only for invalidating optional in-memory caches.)
6. **Audit + history** — every save/restore appends an audit entry *and* full snapshots (framework-owned, distinct from competence's domain audit log; may share storage primitives).
7. **Export-to-git** — serialize current live config to a downloadable JSON bundle for manual commit.
8. **Admin UI shell + shared components** — new "Admin" nav section/category; reusable list/detail editor with **language switch-with-reference**, history/restore panel, version diff, and optimistic-lock conflict handling. CSP-safe; Alpine-CSP-compliant (no inline styles; no optional chaining in Alpine expressions).

### 3.2 `@ti-engine/competence` (app-specific)
1. **Register config documents** with their existing schemas (`bin/data/schemas/*`) + semantic validators.
2. **Validators refactored out of the tests** into a `config-validators` module: reference integrity (active-set codes ∈ dictionary; spec keys ∈ role-families; **`relevancyArchetype` ∈ archetypes**), content integrity (non-empty en/bg name/description/scope), baseline floor coverage, cap. Tests stay as a second line.
3. **Wire read paths to the live store** (preserving snapshot immunity). *(confirm current paths — active-sets already go through the Redis cache; dictionary/labels/relevancy appear frozen-file-read and must move behind the store.)*
4. **The three editor screens (§4) + the relevancy restructure (§5).**

---

## 4. The editor screens

### 4.1 Competency **text** editor (first slice — the BG review)
- **Scope:** texts only — competency `name`, `description`, and the six scope levels (`N…T`), bilingual. **Edit-only** (no add/remove/recategorize for now). Reads the dictionary for grouping; **writes only `competence-labels.json`.**
- **Layout:** left = all competencies sorted category → subcategory → index (row label in the active language); right = detail with id (read-only) + name + description + 6 scope fields.
- **Language: switch-with-reference** — the switch sets the *edit target* language; the other language shows inline read-only (correct the BG with the authoritative EN in view). Flip to edit EN.
- Save scatters into the labels document via a composite save.

### 4.2 Relevancy **archetype assignment** editor (second)
- **Scope:** one archetype per competency — **global** (the same curve wherever the competency is used). Stored as a `relevancyArchetype` field on each competency in `config.competencies.json`.
- **Layout:** competency list (by category) with an archetype **dropdown** per competency; shows the resulting curve as a preview. Writes the dictionary.

### 4.3 Relevancy **archetype** editor (third)
- **Scope:** the archetype curves themselves — `name`, `description`, and the 12 `N1…T1` weights (integers 2–10) each. **Edit + add freely; remove only when no competency is assigned** (reference-integrity guard).
- **Documents:** composite over a new `config.relevancy-archetypes.json` (curves) + the `relevancy-archetype` labels already in `competence-labels.json` (name/description) → transactional save.
- Editing a curve re-weights every competency assigned to it — this *is* the calibration that was deferred, at the right altitude.

---

## 5. Relevancy restructure (archetypes + global assignment; weights derived)

This replaces the materialized per-family weights with their source:

- **NEW `config.relevancy-archetypes.json`** + `relevancy-archetypes.schema.json` — archetype id → `{ weights: {N1…T1 integers 2–10} }`. Seeded from the 7 curves in `competency-relevancy-model.md`; thereafter editable (add/edit/remove-when-unassigned).
- **`config.competencies.json` gains `relevancyArchetype`** (string, must reference an existing archetype) per competency — the global assignment. Schema update + a reference-integrity validator.
- **`config.competency-relevancy.json` is retired** as stored data. Effective weight is **derived**: `weight(code, stageLevel) = archetypes[ competencies[code].relevancyArchetype ].weights[stageLevel]` — family-independent under global assignment.
- **Framework read-path change:** `buildEvaluationSnapshot` resolves relevancy via the competency's archetype instead of `configCompetencyRelevancy[family][code]`. The `#config-competency-relevancy` import, its schema, and the relevancy-coverage json tests are retired/replaced (replaced by an "every `relevancyArchetype` resolves" check). *(This is an internal app-logic change in competence-framework — in scope for this feature, not the content rebuild.)*
- **Consequence:** global assignment trades away per-family calibration. Re-introducing it later = an optional per-family override layer (deferred, as before).
- **Migration is clean:** the curves and the per-competency assignments already live in `competency-relevancy-model.md`; the existing `build-competency-relevancy.js` is repurposed as a one-time migration that emits the archetypes file + sets `relevancyArchetype` on dictionary entries (instead of materializing per-family weights).

---

## 6. Store data model

- `config:current:{key}` → `{ value, version, updatedAt, updatedBy }`
- `config:history:{key}` → append-only `[{ version, timestamp, adminID, note, changeSetID, snapshot } ...]`
- `config:changeset:{id}` → `{ timestamp, adminID, note, documents: [{key, version}] }` — correlates a multi-document logical edit for unit restore.
- **Restore(changeSet):** re-validate the snapshots against *current* schemas/validators → `saveChangeSet` them as new current versions (note "restored from change-set X"); never destructive.
- **Optimistic lock:** the editor sends the versions it loaded; reject if any current version differs → UI shows a diff and lets the admin rebase.

---

## 7. Resolved decisions

1. **Export-to-git:** download/export bundle (v1); store remains live truth.
2. **Admin role:** single `admin` role (v1); capabilities later if needed.
3. **Editable scope:** labels (texts) → relevancy (archetypes + assignment) → dictionary; structural configs (`role-families`, `stage-levels`, `application`) stay file-only/read-only for v1.
4. **Relevancy assignment:** global per competency (`relevancyArchetype` on the dictionary); per-family override deferred.
5. **Materialized relevancy:** retired; weights derived from archetypes + assignment.
6. **Archetypes:** edit + add freely; remove only when unassigned; per-competency weight override deferred.
7. **History retention:** keep all versions (internal tool, low volume).
8. **Concurrency:** hard-reject on version conflict + diff/rebase.
9. **Version history** is framework-owned, distinct from competence's domain audit log.

---

## 8. Phased implementation plan (after design sign-off)

- **Phase A — framework foundation.** `Admin` role + authz; ConfigRegistry; versioned ConfigStore with change-sets, restore, optimistic lock; composite-editor abstraction + transactional multi-document save; validation pipeline; change propagation; audit+snapshot; export-to-git (download bundle); admin UI shell + shared components (list/detail, language switch-with-reference, history/restore, diff, conflict).
- **Phase B — competence integration + relevancy restructure.** Register config documents; extract validators from tests; add `config.relevancy-archetypes.json` (+ schema) and the `relevancyArchetype` dictionary field (+ schema); change the framework relevancy read path to resolve via archetype; retire the materialized relevancy file/schema/tests; migrate via the repurposed generator; move read paths behind the store; reconcile the seeder to seed-empty-only + "reset to defaults". Preserve snapshot immunity.
- **Phase C — Competency text editor** (the BG review).
- **Phase D — Archetype editor + assignment editor** (relevancy management).
- **Phase E — later editors** (dictionary structure, role-families, …) per scope.

Each phase: schemas/validators/tests green; one commit per logical step; checkpoint before the next (same cadence as the content rebuild).

---

## 9. Risks & notes

- **CSP / Alpine:** no inline `style="..."`; no optional chaining (`?.`) in Alpine expressions; form-based editors only (raw-JSON view read-only if at all).
- **Multi-instance:** propagation must reach all instances; reload is idempotent and fails safe (serve last-good on validation failure).
- **Export drift:** the store wins on boot; git export is a one-way snapshot out; "reset to defaults from files" is the explicit one-way in.
- **Relevancy read-path change** touches scoring — covered by snapshot immunity (only future evaluations affected) and gated by the validator that every `relevancyArchetype` resolves.
