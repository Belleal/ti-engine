# ti-engine Developer Skill

You are working on the **ti-engine** monorepo — an open-source Node.js microservices framework by Boris Kostadinov. Whenever this skill is invoked, orient yourself fully before answering or making changes.

---

## Monorepo Layout

```
ti-engine/                         npm workspace root (v1.2.4)
├── packages/
│   ├── core/          v1.4.3      Framework foundation (messaging, lifecycle, utils)
│   ├── web-framework/ v1.6.3      Express-based HTTP server + auth layer
│   ├── competence/    v2.0.0      HR competency appraisal application
│   └── tester/        v1.3.3      Reference/example service implementation
├── package.json                   Workspace root; devDeps: ESLint 10, Prettier 3
└── eslint.config.mjs              Flat ESLint config (commonjs, browser+node globals)
```

---

## Package: core

**Role**: Foundational framework. All other packages depend on it.

**Dependency graph tier**:
1. `MessageExchange` (Redis-backed async broker) — envelope/payload split
2. `ServiceInstance` → `ServiceConsumer` → `ServiceProvider` (lifecycle hierarchy)
3. Utils: logger, config, cache, exceptions, localization, tools

**Key files**:
| File | Purpose |
|------|---------|
| `bin/start-instance.js` | Process bootstrap; loads .env, instantiates service |
| `bin/settings.json` | Default config values |
| `components/service-instance.js` | **Abstract** base; lifecycle hooks (start/stop/healthCheck) |
| `components/service-consumer.js` | Extends ServiceInstance; outbound calls via ServiceCaller |
| `components/service-provider.js` | Extends ServiceConsumer; hosts business services via ServiceExecutor |
| `components/service-caller.js` | Sends service calls, awaits responses, implements retry |
| `components/service-executor.js` | Receives calls, dispatches to handler functions, sends results |
| `components/exchange/message-exchange.js` | **Abstract** broker interface |
| `components/exchange/default/default-message-exchange.js` | Redis (ioredis) implementation |
| `components/exchange/message-tracer.js` | chainID / chainLevel tracking across hops |
| `utils/tools.js` | `getUUID()`, `deepFreeze()`, `enum()` factory |
| `utils/exceptions.js` | Error codes: E_GEN_*, E_COM_*, E_SEC_*, E_APP_* |
| `utils/logger.js` | Severity levels: DEBUG/INFO/NOTICE/WARNING/ERROR/CRITICAL/ALERT |
| `utils/config.js` | Config enum + ENV overrides; frozen after init |
| `utils/cache.js` | `CommonMemoryCache` singleton — Redis JSON wrapper |
| `integrations/redis-integration.js` | ioredis client with connection pooling |

**ENV variables (core)**:
- `TI_INSTANCE_NAME` — service domain name (required)
- `TI_INSTANCE_CLASS` — path to ServiceInstance subclass (required)
- `TI_INSTANCE_CONFIG` — path to service config JSON
- `TI_AUDITING_LOG_MIN_LEVEL` — log filter (0–800)
- `TI_MEMORY_CACHE_HOST/PORT/AUTH/DB` — Redis connection
- `MESSAGE_EXCHANGE_SECURITY_HASH_KEY` — blake2 HMAC key
- `SERVICE_EXECUTION_TIMEOUT` — default 180000ms

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

---

## Package: web-framework

**Role**: Express.js web server + authentication layer for web-facing UIs.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/web-server.js` | `TiWebServer` (extends ServiceConsumer); Express app, middleware stack |
| `bin/web-app-manager.js` | `TiWebAppManager` **abstract**; HTML fragment rendering, nonces, CSRF |
| `bin/web-server.json` | Server config (host, port, TLS, auth methods) |
| `components/auth-manager.js` | OpenID Connect (Azure/Google) + local auth; session token generation |
| `components/session-store.js` | Express session storage |
| `components/web-handlers.js` | Middleware: CSP headers, CSRF validation, auth verification, error formatting |
| `components/user.js` | User object model |
| `bin/static/` | Frontend assets: HTMX, Alpine.js, CSS theme, HTML fragments |

**Security stack**: Helmet, CSP nonces, CSRF (timing-safe), express-session, OpenID Connect OAuth2

**Frontend**: HTMX + Alpine.js (CSP variant) for fragment-driven UIs

**ENV variables (web-framework)**:
- `TI_WEB_APP_STATIC_CACHE_DISABLED` — disable static file caching

---

## Package: competence

**Role**: Complete HR application for competency-based performance appraisals. v2 introduces a three-dimensional competency model — **Role Family × Specialization × Stage-Level** — and a first-class appraisal **Cycle** entity with a `PLANNING → ACTIVE → CLOSED` lifecycle. Evaluations snapshot their resolved competency set at creation time so configuration drift never affects in-flight evaluations. Depends on `core` + `web-framework`.

**Key files**:
| File | Purpose |
|------|---------|
| `application/competence-framework.js` | Singleton; `getActiveCompetencySet`, `buildEvaluationSnapshot`, `validateCycleForLock`, `lockCycle`, `closeCycle`, snapshot-driven scoring |
| `application/configuration-loader.js` | Loads config JSONs; exports frozen enums and `getSpecializationCodes(familyCode)` |
| `application/data-manager.js` | Singleton; CRUD for role families, cycles, active competency sets, employees, evaluations, audit log (Redis JSON) |
| `application/organization-manager.js` | Singleton; directed graph (graphology) for org chart; resolves manager + role-family attributes |
| `bin/competence-web-server.js` | Main entry point (extends ServiceConsumer) |
| `bin/competence-web-application.js` | UI renderer (extends TiWebAppManager); fragments for dashboard, employees-list, employee-management, cycles, cycle-setup, competence-evaluation, new-evaluation, manager-calendar, interview-schedule |
| `bin/config/config.application.json` | App settings (grade/evaluation weights, performance thresholds, `activeCompetencySetCap`, interview-calendar) |
| `bin/config/config.competencies.json` | Competency dictionary — categories E/I/C × subcategories 1–3, scope/relevancy per stage-level, optional `eCFMapping` |
| `bin/config/config.role-families.json` | Nine families (`SE`, `QE`, `BA`, `PM`, `XD`, `DA`, `IO`, `MC`, `PD`) with their permitted specializations |
| `bin/config/config.active-competency-sets.json` | Seeded baselines and specialization extensions, keyed by `family → "baseline"|<SPEC> → cycleID → [codes]` |
| `bin/config/config.stage-levels.json` | N/J/R/S/X/T ladder with dual-track senior tier |
| `bin/config/config.organization-structure.json` | Org-chart hierarchy; managers inferred via unit-walk |
| `bin/data/schemas/` | JSON schemas for config + seed validation (role-families, active-competency-sets, stage-levels, cycle, audit-entry, competencies, employee(s), evaluation(s)) |
| `bin/data/seeders/` | Destructive seed data behind `COMPETENCE_PRELOAD_DATA=true` |
| `bin/localization/competence-labels.json` | en/bg labels for every user-visible string |
| `test/` | Node built-in test runner (`node --test`): JSON validation + framework resolution / validation / lifecycle / snapshot suites |

**Enums**:
- `RoleCode`: EMPLOYEE(1), MANAGER(2), SUPERVISOR(3), TEAM_MEMBER(4)
- `RoleFamilyCode`: SE, QE, BA, PM, XD, DA, IO, MC, PD — specialization codes are nested per family in `config.role-families.json`, accessed via `getSpecializationCodes(familyCode)`
- `CycleStatus`: PLANNING → ACTIVE → CLOSED — one-way transitions; single-active-cycle invariant
- `EvaluationStatus`: NOT_STARTED → OPEN → IN_REVIEW → READY → CLOSED / DELETED
- `EvaluationGrade`: S(1.3), R(1.0), U(0.6), N(0.0) — weights used in score calculation

**Evaluation weight formula**: self×20% + team×30% + manager×50%

**Test commands**:
```bash
npm test             # node --test test/*.test.js
npm run test:json    # validate JSON config schemas
```

---

## Package: tester

**Role**: Working example of a ServiceProvider with cross-service calls. Run to smoke-test the framework.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/tester-service.js` | ServiceProvider; runs test suite on start |
| `bin/tester-service.json` | Service registry (points to services/v1/*.js) |
| `bin/services/v1/service1.js` | Returns current timestamp after 500ms |
| `bin/services/v1/service2.js` | Calls service1, returns both timestamps |
| `bin/.env` | `TI_INSTANCE_NAME=ti-tester-service`, etc. |

---

## Versioning & Changelog Conventions

- Each package has its own independent semver version and `CHANGELOG.md`
- Commit message format: Conventional Commits
  - `feat(scope): description` → minor bump
  - `fix(scope): description` → patch bump
  - `refactor(scope)!: description` or `feat!:` → major bump (breaking)
  - `build(deps): update X from ^A to ^B`
  - `docs(scope): description`
- Changelog entry format:
  ```markdown
  ## Version X.Y.Z
  * feat(module): what changed
  * fix(module): what was fixed
  * build(deps): updated dep from vA to vB
  ```
- Commit message subject lines typically: `augment <package> version X.Y.Z` (feature work) or `submit <package> version X.Y.Z` (release commit)

---

## Key Architectural Patterns

1. **Abstract base classes** — Never instantiate `ServiceInstance`, `MessageExchange`, `TiWebAppManager` directly; subclass them
2. **Singletons** — `CommonMemoryCache`, `DataManager`, `CompetenceFramework`, `OrganizationManager` are all singletons; access via the exported instance
3. **deepFreeze on config** — Once settings are loaded they are immutable; don't try to mutate them
4. **Envelope/payload split** — Large message payloads go in Redis hash; envelope (metadata) goes in the queue list
5. **No blocking operations** — All service calls are Promise-based; use async/await
6. **Module imports** — Internal imports use `#alias` form (package.json `imports` map), not relative paths
7. **CommonJS** — All packages use `"type": "commonjs"`; use `require()` / `module.exports`

---

## When Working on This Codebase

1. **Adding a new service to tester or competence**: add handler file in `services/v1/` and register it in the `.json` service registry
2. **Extending the web UI**: subclass `TiWebAppManager`, override fragment rendering methods
3. **Adding config**: add to `bin/config/*.json`, update the JSON schema in `bin/data/schemas/`, add enum entry in `configuration-loader.js`
4. **New package**: follow the `core` exports pattern; add to `packages/` and npm workspaces
5. **Testing**: use Node.js built-in `node --test`; no external test framework
6. **Bumping versions**: update `package.json` version + `CHANGELOG.md` in the affected package(s)
