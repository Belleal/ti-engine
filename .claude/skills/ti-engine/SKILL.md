---
name: ti-engine
description: "Use whenever working in the ti-engine monorepo (core / web-framework / competence / tester) or the competence HR appraisal app — architecture, package layout, conventions (CommonJS, #alias imports, Alpine CSP, deepFreeze, frozen singletons), the competence data model and enum gotchas, node --test testing, versioning/changelog, and the commit-bundling + YouTrack (CA) delivery process. Orient before answering about or editing ti-engine code."
---

# ti-engine Developer Skill

You are working on the **ti-engine** monorepo — an open-source (GPL-3.0) Node.js microservices framework by Boris Kostadinov, plus the **competence** HR application built on top of it. Whenever this skill is invoked, orient yourself fully before answering or making changes.

---

## Monorepo Layout

```
ti-engine/                         npm workspace root (v1.2.4)
├── packages/
│   ├── core/          v1.7.0      Framework foundation (Redis messaging, lifecycle, utils)
│   ├── web-framework/ v1.9.3      Express HTTP server + auth + admin config-management subsystem
│   ├── competence/    v3.3.1      HR competency appraisal application (108-competency dictionary)
│   └── tester/        v1.3.3      Reference/example service implementation
├── package.json                   Workspace root; devDeps: ESLint 10, Prettier 3
└── eslint.config.mjs              Flat ESLint config (commonjs, browser+node globals)
```

Dependency direction: `core` is standalone → `web-framework` depends on `core` → `competence` depends on both. Keep framework concerns in `core`/`web-framework` and application concerns in `competence`. Node `>=20` — **core requires `>=20.12`** (native `process.loadEnvFile`). Each package has its own independent semver version and `CHANGELOG.md`.

Branches: `current` is the active feature branch; `master` is the release branch (PR target).

---

## Conventions & Constraints (read before editing)

- **CommonJS everywhere** — `"type": "commonjs"`; use `require()` / `module.exports`.
- **Internal imports use `#alias`** from each package.json `imports` map (e.g. `#configuration-loader`, `#config-competencies`), not relative paths. Cross-package imports use the `exports` map (e.g. `@ti-engine/core/tools`, `@ti-engine/web-framework/config-management`).
- **Alpine.js runs in CSP mode.** In HTML Alpine expressions: **no inline `style="..."` attributes** (CSP forbids them — use CSS classes) and **no optional chaining (`?.`)** (the CSP expression evaluator rejects it). `Array`, `Object`, etc. are also unavailable inside template expressions — use the `tiApplication.hasRole(...)`-style JS helpers instead of `Array.isArray(...)` inline.
- **Design-first cadence.** Non-trivial features start from a design doc under the owning package's `design/` directory (meta header + running implementation log), and land as small, checkpointed Conventional-Commit steps. Check `design/` for the current plan before building.
- **`.run/*.run.xml` are git-tracked but carry live local credentials** in the working tree — never commit changes to them.
- **deepFreeze on config** — once settings/config are loaded they are immutable; never mutate them in place.

---

## Package: core (v1.7.0)

**Role**: Foundational framework. All other packages depend on it. Standalone (no intra-repo deps).

**Layers**:
1. `MessageExchange` (Redis-backed async broker) — envelope/payload split
2. `ServiceInstance` → `ServiceConsumer` → `ServiceProvider` (lifecycle hierarchy)
3. Utils: logger, config, cache, exceptions, localization, tools

**Key files**:
| File | Purpose |
|------|---------|
| `bin/start-instance.js` | Process bootstrap; loads `.env` (native `process.loadEnvFile`), instantiates service |
| `bin/settings.json` | Default config values |
| `components/service-instance.js` | **Abstract** base; lifecycle hooks (start/stop/healthCheck) |
| `components/service-consumer.js` | Extends ServiceInstance; outbound calls via ServiceCaller |
| `components/service-provider.js` | Extends ServiceConsumer; hosts business services via ServiceExecutor |
| `components/service-caller.js` | Sends service calls, awaits responses, implements retry |
| `components/service-executor.js` | Receives calls, dispatches to handler functions, sends results |
| `components/auditing.js` | Structured audit logging |
| `components/connection-observer.js` | Tracks broker connection health |
| `components/definitions.types.js` | Shared JSDoc typedefs (object definitions live here, not inline) |
| `components/exchange/message-exchange.js` | **Abstract** broker interface |
| `components/exchange/message-handler.js` | **Abstract** base for senders/receivers; `createMessageHash()` — keyed **HMAC-SHA256** integrity hash + constant-time verify |
| `components/exchange/default/default-message-exchange.js` | Redis (ioredis) implementation |
| `components/exchange/message-dispatcher.js` / `message-sender.js` / `message-receiver.js` | Queue plumbing |
| `components/exchange/message-tracer.js` | chainID / chainLevel tracking across hops |
| `utils/tools.js` | `getUUID()`, `deepFreeze()`, `constantTimeEquals()`, `enum()` factory (enum value = **first element of its seed array**, not the key — see gotcha under competence enums) |
| `utils/exceptions.js` | `TiException` + standardized error codes (see below) |
| `utils/logger.js` | Severity: DEBUG/INFO/NOTICE/WARNING/ERROR/CRITICAL/ALERT |
| `utils/config.js` | Config enum + ENV overrides; frozen after init |
| `utils/cache.js` | `CommonMemoryCache` singleton — RedisJSON wrapper (`getJSON`/`setJSON`/`editJSON`/`mergeJSON`; array-path support) |
| `integrations/redis-integration.js` | ioredis client with connection pooling (RedisJSON: `JSON.MERGE`, `JSON.MGET`) |

**Public exports** (`package.json` `exports`): `.` (start-instance), `./tools`, `./cache`, `./exceptions`, `./logger`, `./localization`, `./service-instance`, `./service-consumer`, `./service-provider`.

**Exception families** (`utils/exceptions.js`) — the class is `TiException` (renamed from `Exception` in 1.4.0); `raise()` accepts an optional `httpCode`:
- `E_GEN_*` 1000–1010 (general; incl. `E_GEN_NOT_IMPLEMENTED` 1010)
- `E_SEC_*` 2000–2004 (security)
- `E_COM_*` 3000–3010 (communication/messaging)
- `E_WEB_*` 4000–4009 (web request validation)
- `E_APP_*` 5004–5006 (application; incl. `E_APP_RESOURCE_NOT_FOUND` 5004, `E_APP_SERVICE_ERROR` 5005, `E_APP_RESOURCE_ALREADY_EXISTS` 5006 → raise with HTTP `409`)

**ENV variables (core)**:
- `TI_INSTANCE_NAME` — service domain name (required)
- `TI_INSTANCE_CLASS` — path to ServiceInstance subclass (required)
- `TI_INSTANCE_CONFIG` — path to service config JSON
- `TI_AUDITING_LOG_MIN_LEVEL` — log filter (0–800)
- `TI_MEMORY_CACHE_REDIS_HOST` / `TI_MEMORY_CACHE_REDIS_PORT` / `TI_MEMORY_CACHE_AUTH_KEY` / `TI_MEMORY_CACHE_REDIS_DB` — Redis connection
- `TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED` — toggle the message integrity hash (default `true`)
- `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` — message-exchange HMAC-SHA256 key. **Empty by default**: if unset (or equal to the old published default UUID) a one-time startup WARNING logs and tamper protection is ineffective — set a private value in production.

> Note: `executionTimeout` (default 180000ms) is a `serviceConfig` **setting** (service config JSON / `bin/settings.json`), not an ENV var — there is no `SERVICE_EXECUTION_TIMEOUT` env override.

**Message flow**:
```
ServiceCaller → MessageDispatcher → MessageSender → Redis (list: requests + hash: payload)
  → MessageReceiver → ServiceExecutor → handler() → Redis (list: responses)
    → MessageDispatcher → ServiceCaller → resolved Promise
```

**Service handler contract**:
```js
module.exports.service = function (serviceDefinition, serviceParams, serviceCallContext) {
    return new Promise((resolve, reject) => {
        resolve(payload); // or reject(error)
    });
};
```

**Test commands**:
```bash
npm test    # node --test — runs test/*.test.js (message-hash + security-hash-key-warning suites)
```

---

## Package: web-framework (v1.9.3)

**Role**: Express.js web server + authentication layer + a reusable **admin config-management subsystem** for web-facing UIs.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/web-server.js` | `TiWebServer` (extends ServiceConsumer); Express app, middleware stack |
| `bin/web-app-manager.js` | `TiWebAppManager` **abstract**; HTML fragment rendering, nonces, CSRF, and the `registerConfigDocument` / `registerConfigEditor` API |
| `bin/web-server.json` | Server config (host, port, TLS, auth methods, `auth.admins` identity list) |
| `bin/build/post-install.js` | `postinstall` step (refreshes bundled static libs) |
| `components/auth-manager.js` | OpenID Connect (Azure/Google) + local auth; session token generation |
| `components/authorization.js` | Role checks/guards — `requireRole`, `hasRole`; backs admin gating |
| `components/session-store.js` | Express session storage |
| `components/web-handlers.js` | Middleware: CSP headers, CSRF validation, auth verification, error formatting (`resolveHttpCode` derives 4xx from the exception family when no explicit `httpCode`: `E_WEB_*`/`E_APP_*`→422, `E_SEC_*`→403, not-found→404, already-exists→409, method/content→405/415; only internal/comm/unknown stay 500) |
| `components/user.js` | User object model |
| `components/config-store.js` | Versioned, audited config store (Redis JSON) — current value, history, validated restore |
| `components/config-registry.js` | In-process registry of config documents, schemas, validators, editors |
| `components/config-service.js` | Facade orchestrating registry + store + validation (exported as `config-management`) |
| `components/config-change-notifier.js` | In-process `config:changed` pub/sub so live config reloads |
| `components/admin-config-handlers.js` | `/admin/config/*` HTTP API (get/list/save/restore/export, ajv + semantic validation) |
| `components/definitions.types.js` | Shared JSDoc typedefs |
| `bin/static/` | Frontend assets: HTMX, Alpine.js (CSP build), `safe-nonce`, framework CSS + themes, HTML fragments |
| `design/admin-config-management.md` | Design doc + implementation log for the config-management feature |
| `test/*.test.js` | `node --test` suites for the config subsystem + authorization |

**Public exports**: `./config-management` (config-service), `./web-application` (web-app-manager), `./web-server`.

**Config-management subsystem** (the reusable machinery; competence is its first consumer):
- An app subclass calls `TiWebAppManager.registerConfigDocument(key, {...})` (schema, semantic validators, file default, editor metadata) and `registerConfigEditor(name, editor)` (composite/entity editors) during init.
- The store seeds from file defaults, serves the live value, versions every change, validates (ajv + semantic) on save, supports validated restore, audit, and export-to-git bundle.
- `config-management.instance.onConfigChanged(...)` lets consumers hot-reload their in-memory config when an admin edit lands.
- Admin gating: an identity must appear in `auth.admins` in `web-server.json`; gating is `hasRole('admin')`. Default is `[]` (no admins) — add one to test the admin UI.

**Security stack**: Helmet, CSP nonces, CSRF (timing-safe), express-session, OpenID Connect OAuth2.

**Frontend**: HTMX + Alpine.js (CSP build) for fragment-driven UIs. Reusable CSS primitives in `ti-framework.css` — `.ti-page-head`, `.ti-data-grid*`, `.ti-form*`, `.ti-panel-head*`, `.ti-panel-body-intro` (the canonical intro/description line under a panel head — don't hand-style per screen), `.ti-kv-label` / `.ti-kv-value` (key/value rhythm), `.ti-modal-*`, and the mask-based `.ti-icon` system (size modifiers `.xs`–`.xl`, ~40 variants); themes `ti-theme-daylight.css` / `ti-theme-black-glass.css`. `ti-framework.js` exposes the `tiApplication` Alpine store (incl. `hasRole`, topbar CTA slots, and `notify`/`formatException` which support a `{ message, details }` payload — the details line shows the specifics under the generic message; toasts render above open modals). Prefer these primitives over screen-specific CSS. **Remember the Alpine CSP constraints** (no inline styles, no `?.`).

**ENV variables (web-framework)**:
- `TI_WEB_APP_STATIC_CACHE_DISABLED` — disable static file caching

---

## Package: competence (v3.3.1)

**Role**: Complete HR application for competency-based performance appraisals. Models competencies in three dimensions — **Role Family × Specialization × Stage-Level** — with a first-class appraisal **Cycle** (`PLANNING → ACTIVE → CLOSED`). Evaluations snapshot their resolved competency set at creation so later configuration drift never affects in-flight evaluations. Depends on `core` + `web-framework`; uses `graphology` for the org graph.

**v3.0.0 = the 108-competency content rebuild** (from the prior 164): SE 31, BA 22, PM 25, plus 30 shared canonical, regenerated from the source-of-truth docs in `design/`. Six families (QE/XD/DA/IO/MC/PD) are defined but unpopulated. This was a content replacement — config shapes, schemas, and framework logic were unchanged — but old competency codes were dropped/renumbered, so stored evaluations keyed by old codes need migration.

**Relevancy model**: per-family competency importance is expressed via **editable archetype curves** in `config.relevancy-archetypes.json` plus a per-competency `relevancyArchetype` pointer. (This superseded the earlier materialized `config.competency-relevancy.json`, which no longer exists.) `bin/build/build-competency-relevancy.js` is the re-runnable generator/expander for archetype-derived data.

**Competency pool** (restored in 3.1.0 as `config.role-family-competencies.json`, shape `{ <family>: [codes] }`): the per-family *applicability universe* — which competencies a family may draw on. Populated families carry family-specific + the 30 shared canonical (SE 61 / BA 52 / PM 55); the six unpopulated families carry the 30 shared only. The **pool** (which competencies *can* apply to a family) is distinct from **relevancy** (how much each *matters*, which is global via archetypes). The `build-competency-relevancy.js` generator emits both from `design/competency-relevancy-model.md`. The pool backs the `pool-membership` lock rule and scopes the Cycle Setup competency picker; it is registered as a store-backed, exportable/restorable config document (read-only — no inline editor yet).

**Team feedback & dashboard tasks (3.3.0)**: team members discover pending peer reviews as derived **dashboard tasks** (`application/task-resolver.js` — pure, org lookups injected); a manager — or a Supervisor via a read-only **facilitator** view — can `finalizeTeamFeedback` after a **cycle-level** team-feedback deadline (`cycle.teamFeedbackDeadline`, defaulted from `teamFeedbackWindowDays` and editable in Cycle Setup). Finalize records an evaluation-scoped audit entry; once an evaluation reaches `Ready` the employee sees the manager grade + team cumulative while individual peer grades stay anonymous.

**Key files**:
| File | Purpose |
|------|---------|
| `application/competence-framework.js` | Singleton (`module.exports.instance`); `getActiveCompetencySet`, `buildEvaluationSnapshot`, `validateCycleForLock`, `lockCycle`, `closeCycle`, `finalizeTeamFeedback`, `calculateTeamCumulativeGrades`, `calculateFinalEvaluationScores`, `buildCompetenciesTreeFromSnapshot`, `generateShortID` |
| `application/configuration-loader.js` | Loads config JSONs; exports frozen config objects + enums; helpers `getSpecializationCodes`, `getStageLevelCodes`, `getStageLevelLadder`, `getArchetypeStageLevels`, `getSetting`; `initialize(service)` brings the store-backed configs under admin-config control |
| `application/config-registration.js` | Registers competence config documents + composite editors with the framework registry (`registerCompetenceConfig`) |
| `application/config-editors.js` | Composite (entity) editors: `competency-text`, `archetype-assignment`, `relevancy-archetype`, `role-families` |
| `application/config-validators.js` | Semantic validators (Promise-chain style; `ValidationIssue` / `ValidatorContext` typedefs) incl. floor-coverage, cap, pool-membership (`activeSetsWithinPool` / `poolReferenceIntegrity`), and referential-integrity guards |
| `application/data-manager.js` | Singleton; CRUD for role families, cycles, active sets, employees, evaluations, audit log (Redis JSON) |
| `application/organization-manager.js` | Singleton; directed graph (graphology) for org chart; resolves manager + role-family attributes |
| `application/task-resolver.js` | Pure singleton; derives dashboard **tasks** (`team-feedback` / `team-finalize`) from evaluation/workflow state with injected org lookups — persistence-free and unit-tested (3.3.0; seed for the future web-framework tasks module) |
| `application/data-objects.types.js` | Shared JSDoc typedefs for data objects |
| `bin/competence-web-server.js` | Main entry point (extends ServiceConsumer); `onStart` initializes data-manager then `configurationLoader.initialize()` |
| `bin/competence-web-application.js` | UI renderer (extends TiWebAppManager); registers config via `registerCompetenceConfig`; serves all fragments |
| `bin/build/build-competency-relevancy.js` | Re-runnable generator for archetype-derived relevancy data + archetype labels |
| `bin/config/config.application.json` | App settings under `performanceAppraisals` (weights, thresholds, `activeCompetencySetCap`, interview calendar) + `config.application.schema.json` |
| `bin/config/config.competencies.json` | Competency dictionary — categories E/I/C × subcategories, scope/relevancy per stage-level, optional `eCFMapping` |
| `bin/config/config.relevancy-archetypes.json` | Editable archetype curves (keyed by flattened stage-levels) |
| `bin/config/config.role-families.json` | Nine families (`SE`,`QE`,`BA`,`PM`,`XD`,`DA`,`IO`,`MC`,`PD`) with permitted specializations |
| `bin/config/config.role-family-competencies.json` | Per-family competency **pool** (applicability universe) `{ <family>: [codes] }`; backs `pool-membership` lock rule + Cycle Setup picker (restored 3.1.0) |
| `bin/config/config.active-competency-sets.json` | Baselines + specialization extensions, keyed `family → "baseline"|<SPEC> → cycleID → [codes]` (seed populates per-family baselines for `2026-H2`) |
| `bin/config/config.stage-levels.json` | The ladder (see below) |
| `bin/config/config.organization-structure.json` | Org-chart hierarchy; managers inferred via unit-walk |
| `bin/data/schemas/` | JSON schemas for config + seed validation (incl. `relevancy-archetypes.schema.json`) |
| `bin/data/seeders/` | Destructive seed data behind `COMPETENCE_PRELOAD_DATA=true` |
| `bin/localization/competence-labels.json` | en/bg labels for every user-visible string (incl. a `relevancy-archetype` label section; BG pending native review) |
| `bin/static/scripts/competence-user-interface.js` | Alpine components for all screens (calls the framework `/admin/config/*` API for admin screens) |
| `bin/static/scripts/competence-main.css` | App-specific styles layered on the framework primitives |
| `design/` | Source-of-truth content docs — see below |
| `test/*.test.js` | `node --test` — JSON validation, content integrity, config-management/editors/live, framework resolution/validation/lifecycle/snapshot |

**UI fragments** (`bin/static/fragments/`): dashboard, employees-list, employee-management, cycles, cycle-setup, competence-evaluation, new-evaluation, manager-calendar, interview-schedule; plus admin-gated config screens: **admin-config** (landing: export + change feed/restore), **competency-text-editor**, **archetype-assignment**, **archetype-editor**, **role-families**. Admin screens live under an admin-only "Administration" sidebar section.

**Design docs** (`design/`, source of truth for content): `competency-definitions-final.md`, `competency-master-index.md`, `competency-bg-translations.md`, `competency-relevancy-model.md`; completed records are archived under `design/completed/` (the phase-0 inventories, `role-family-pool-restoration.md`, `dashboard-team-feedback-tasks.md`), and the YouTrack backfill log is `youtrack-backfill-inventory.md`.

**Enums** (`configuration-loader.js`):
- `RoleCode`: EMPLOYEE(1), MANAGER(2), SUPERVISOR(3), TEAM_MEMBER(4)
- `RoleFamilyCode`: SE, QE, BA, PM, XD, DA, IO, MC, PD — specializations are nested per family; access via `getSpecializationCodes(familyCode)`
- `CycleStatus`: PLANNING → ACTIVE → CLOSED — one-way; single-active-cycle invariant
- `EvaluationStatus`: NOT_STARTED → OPEN → IN_REVIEW → READY → CLOSED / DELETED
- `EvaluationGrade`: S(1.3), R(1.0), U(0.6), N(0.0) — `gradeWeights` used in scoring
- `PerformanceThreshold`: T1–T5 (76, 89, 105, 119, 150)
- `SlotStatus`: available / booked / busy / deleted (interview calendar)

> **Enum value gotcha** — `tools.enum()` sets each member's runtime value to the **first element of its seed array, not the key**. So `EvaluationStatus.OPEN === "Open"` and `IN_REVIEW === "In Review"` (title-case), whereas `CycleStatus` values are uppercase (`"PLANNING"`, `"ACTIVE"`, `"CLOSED"`) and `SlotStatus` values are lowercase (`"available"`, `"booked"`, …). Backend code routes through `configurationLoader.<enum>.*` so it stays correct; **front-end and any hand-written string comparison must use the value (`"Open"`), not the key (`"OPEN"`)** — comparing to the key silently never matches (this caused a dashboard bug fixed in competence 3.2.4).

**Stage-level ladder** (`config.stage-levels.json`): N=Intern(1), J=Junior Specialist(3), R=Specialist(3), S=Senior Specialist(3), X=Expert(1), T=Manager(1). Flattened to 12 archetype curve keys `N1, J1–J3, R1–R3, S1–S3, X1, T1`. These six levels also double as the scope anchors in the dictionary.

**Evaluation weights** (`performanceAppraisals.evaluationWeights`): self ×0.2 + team ×0.3 + manager ×0.5. Collective team mode grades by subcategory (3–5 members).

**Store-backed configs**: `competencies`, `relevancy-archetypes`, `active-competency-sets`, `role-families`, `role-family-competencies` (read-only), `stage-levels` (read-only) — editable via the admin config API once `configurationLoader.initialize()` has run. Until then (and without it) the exported config objects are the file defaults, so the app works before/without store init. Liveness nuance: archetype *assignment* + *weights* are store-backed (live for future evaluations); competency texts and archetype names/descriptions are *labels* (versioned/exportable, but need export → commit → redeploy to show).

**Cycle lock validation & family exclusion**: `validateCycleForLock(cycleID)` is a pure structured validator returning `{ valid, errors: [{ family, specialization?, rule, detail }] }`. Six rules: `baseline-floor-coverage` (each of the nine subcategories present in the baseline), `cap` (resolved set ≤ `activeCompetencySetCap`, default 30), `reference-integrity` (codes exist in the dictionary), `no-empty-baseline` (a family with specialization data needs a non-empty baseline), `pool-membership` (every code ∈ the family's pool — added 3.1.0), and `family-not-configured` (an *included* family must be configured — added 3.2.0). A family can be **excluded** from a cycle via `cycle.excludedFamilies` (`DataManager.setCycleExcludedFamilies`; Supervisor + PLANNING only, toggled on the Cycle Setup baseline editor) — excluded families are skipped by validation and hidden in the tree, so a cycle can lock with only the families that can be completed. Un-marking an intentionally-empty specialization clears it via `DataManager.deleteActiveCompetencySet`.

**Test commands**:
```bash
npm test             # node --test test/*.test.js
npm run test:json    # validate JSON config schemas
```

---

## Package: tester (v1.3.3)

**Role**: Working example of a ServiceProvider with cross-service calls. Run to smoke-test the framework.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/tester-service.js` | ServiceProvider; runs test suite on start |
| `bin/tester-service.json` | Service registry (points to `services/v1/*.js`) |
| `bin/services/v1/service1.js` | Returns current timestamp after 500ms |
| `bin/services/v1/service2.js` | Calls service1, returns both timestamps |
| `bin/.env` | `TI_INSTANCE_NAME=ti-tester-service`, etc. |

---

## Versioning & Changelog Conventions

- Each package has its own independent semver version and `CHANGELOG.md`.
- Commit messages: Conventional Commits, scoped to the package — `feat(scope)` (minor), `fix(scope)` (patch), `feat(scope)!` / `refactor(scope)!` (major/breaking), `build(deps)`, `docs(scope)`, `chore(build)`, `test(scope)`.
- **Bundle commits thematically — fewer is better.** Group a unit/feature/theme's changes into a small number of commits; do **not** commit per TDD micro-step. Prefer one commit per coherent component or theme — many tiny commits hurt traceability (e.g. Phase 0 of the statistics feature produced 35 commits, which was too granular).
- Changelog entry format:
  ```markdown
  ## Version X.Y.Z
  * feat(module): what changed
  * fix(module): what was fixed
  * build(deps): updated dep from vA to vB
  ```
- Bumping a version means updating that package's `package.json` version **and** its `CHANGELOG.md`.

---

## Issue Tracking — YouTrack (project `CA`)

Work is tracked in **YouTrack Cloud** — project **`CA`** (`https://belleal.youtrack.cloud`), linked to GitHub `Belleal/ti-engine`. Full conventions, field scheme, and the reconstruction history live in `packages/competence/design/youtrack-backfill-inventory.md`; the essentials:

- **Structure:** capability **Epics** (`Type: Epic`) own their work. **Nest every feature/task as a `subtask of` its Epic** when one fits — delivered *and* forward/backlog; only truly standalone items stay unparented. Use `relates to` for cross-cutting/supersession links, not epic membership.
- **Fields:** `Type` · `State` · `Stage` · `Priority` · `Version` (enum `v1.0.0`…) · `Shipped` (date). Delivered = `State: Verified` / `Stage: Done`; backlog = `State: Open` / `Stage: Backlog`.
- **Going forward:** start new work as a `CA-###` card under its epic and put the ID in commit messages (e.g. `feat(competence): … (CA-123)`) so the GitHub integration links commit ↔ issue.
- **Log time spent.** Update every `CA-###` task with the **time spent** on it (YouTrack work logging / time tracking, via the `log_work` MCP tool) in addition to its `State`/`Stage` transitions.
- **Knowledge Base:** design docs are mirrored as KB articles (sections *Competency Content* and *Design Records*, plus *Package Overview* and *Project backfill log*).

**Connect the MCP** (per machine; the `mcp__youtrack__*` tools attach only at startup, so **restart Claude Code after adding**):
```
claude mcp add --header "Authorization: Bearer <token>" --transport http youtrack https://belleal.youtrack.cloud/mcp
```
Token: YouTrack → Profile → Account Security → New token (scope: YouTrack).

**MCP gotchas:** `Shipped` stores −1 day → send the intended date **+1**; tags must **pre-exist** (no create-tag tool); **no delete** via MCP (create/update only — verify before bulk-creating); `create_issue.parentIssue` auto-creates the `subtask of` link.

---

## Key Architectural Patterns

1. **Abstract base classes** — never instantiate `ServiceInstance`, `MessageExchange`, `TiWebAppManager` directly; subclass them.
2. **Singletons via frozen instance** — `CommonMemoryCache`, `DataManager`, `CompetenceFramework`, `OrganizationManager` export a single frozen `instance`; access that, don't re-construct.
3. **deepFreeze on config** — config/settings are immutable once loaded.
4. **Store-backed config** — competence config documents are registered with the framework registry and (after `initialize()`) served from a versioned, audited store; consumers hot-reload via `onConfigChanged`. File values are bootstrap defaults.
5. **Envelope/payload split** — large message payloads go in a Redis hash; the envelope (metadata) goes in the queue list.
6. **Promise-based, non-blocking** — all service calls return Promises; use async/await (validators here favour explicit Promise chains).
7. **Snapshot isolation** — evaluations freeze their resolved competency set at creation; config edits never alter in-flight evaluations.
8. **`#alias` / exports imports**, **CommonJS**, and the **Alpine CSP constraints** (see Conventions).

---

## When Working on This Codebase

1. **New service (tester/competence)**: add the handler file in `services/v1/` and register it in the `.json` service registry.
2. **Extending the web UI**: subclass `TiWebAppManager`, add an HTML fragment + matching Alpine component; reuse framework CSS primitives; obey the Alpine CSP rules (no inline styles, no `?.`).
3. **Adding/changing config**: edit `bin/config/*.json`, update the JSON schema in `bin/data/schemas/`, add/adjust the enum or loader helper in `configuration-loader.js`, and — if it should be admin-editable — register it in `config-registration.js` (document + schema + semantic validator + optional composite editor).
4. **New admin-editable entity**: register a config document and, for structured editing, a composite editor in `config-editors.js`; add referential-integrity guards in `config-validators.js`.
5. **Competency content**: drive changes from the `design/` source-of-truth docs; re-run `bin/build/build-competency-relevancy.js` for archetype-derived data; the content-integrity test guards against empty names/descriptions/scopes.
6. **Testing**: Node.js built-in `node --test` (no external framework); each package's `test/` directory.
7. **Bumping versions**: update the affected package's `package.json` + `CHANGELOG.md`.
8. **Design-first**: for non-trivial work, start from / update the relevant `design/*.md` doc (meta header + implementation log) and land small checkpointed commits. Never commit `.run/*.run.xml` (live creds).
9. **Tracking work**: create a `CA-###` card in YouTrack under its epic (features/tasks are `subtask of` their epic; only truly standalone items stay unparented) and reference the ID in commit messages so the GitHub integration links them. See *Issue Tracking — YouTrack* above.
