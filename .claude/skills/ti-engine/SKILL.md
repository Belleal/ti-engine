---
name: ti-engine
description: "Use whenever working in the ti-engine monorepo (core / web-framework / web-content / tester) or the web-content publishing engine — architecture, package layout, conventions (CommonJS, #alias imports, Alpine CSP, deepFreeze, frozen singletons), authentication and session handling (OpenID Connect with Entra/Google, the admin allowlist, CSP and the request scheme), web-content's content model and visibility rules, deployment, node --test testing, versioning/changelog, npm publishing, and the YouTrack (CA) delivery process. Orient before answering about or editing ti-engine code. Sign-in and configuration questions usually cross into Belleal/competence, which has its own skill — load both."
---

# ti-engine Developer Skill

You are working on the **ti-engine** monorepo — an open-source Node.js microservices framework by Boris Kostadinov. Whenever this skill is invoked, orient yourself fully before answering or making changes.

> **The `competence` HR application used to live here and no longer does.** It was extracted to its own repository, `Belleal/competence`, in CA-120, and carries its own skill. It is still the framework's largest consumer, so it is referenced throughout this document to explain *why* a piece of framework behaviour exists — treat every such mention as a cross-repository reference, not a directory you can open.

**Every package here is Apache-2.0** — see `LICENSE.md`. The repository used to be mixed, with competence under
AGPL-3.0-or-later; that package left, and with it the per-package distinction. When adding a new `.js` file, copy
the header block verbatim from an existing file in the same package.

> **`CLAUDE.md` in the repository root is the other half of this.** It carries the *process* — session start-up,
> commit identity and signing, the code convention, what "done" means, how a PR is driven — and is deliberately
> short and slow-changing. This skill carries everything *volatile*: architecture, package layout, versions,
> counts, invariants. Where the two appear to disagree, **the skill wins on volatile detail and `CLAUDE.md` wins
> on process.** A change that makes anything asserted here wrong ships its skill edit in the same PR; that rule is
> in `CLAUDE.md` under *Definition of done*, and it is the only thing keeping this file honest.

---

## Monorepo Layout

```
ti-engine/                         npm workspace root (v1.3.0; workspaces = packages/*)
├── packages/
│   ├── core/          v1.15.2     Framework foundation (pluggable cache backend — Redis or HTTP, optional messaging, lifecycle, utils) + shipped TypeScript declarations
│   ├── web-framework/ v1.36.0     Express server + auth (incl. real local auth) + admin config-management + config drift + Profile/About + ti-charts + role gate + TI_WEB_* env overrides + /health + route seams
│   ├── web-content/   v0.3.1      Content-publishing engine — path-index routing, deny-by-default visibility, SEO documents, feeds, email capture (WIP)
│   └── tester/        v1.3.5      Reference/example service implementation + the docker-build target
├── .github/workflows/             ci.yml (lint/test/build) · codeql-analysis.yml · npm-publish.yml · cla.yml
├── CLAUDE.md                      The working agreement — process, read at session start (see below)
├── CLA.md · CONTRIBUTING.md       Contributor License Agreement (enforced by cla.yml) + contribution guide
├── LICENSE.md                     The license table — Apache-2.0 for every package
├── docs/superpowers/              specs/ (design records, 2026-07 onward) + plans/ (implementation plans)
├── package.json                   Workspace root; devDeps: ESLint 10 (@eslint/js, @eslint/json, globals), Prettier 3
└── eslint.config.mjs              Flat ESLint config (commonjs, browser+node globals; the @eslint/eslintrc shim was dropped)
```

Dependency direction: `core` is standalone → `web-framework` depends on `core` → **`web-content` depends on both**, and `tester` on `core` alone. Keep framework concerns in `core`/`web-framework` and application concerns in the consumer. Each package has its own independent semver version and `CHANGELOG.md`.

The out-of-repository consumer, `competence`, depends on `core` + `web-framework` by semver range from npm. A breaking change here therefore reaches it only when that range is bumped — which is *after* `npm-publish.yml` has published. That is the regression net this repository lost in CA-120: competence's 1060-test suite used to run in this workspace on every change.

Node: the workspace root requires **`>=20.19.0`**; `core` and `web-content` require `>=20.12` (core because of native `process.loadEnvFile`, adopted in core 1.7.0); `web-framework` declares `>=20`. Develop on ≥20.19 to satisfy all of them.

Branches: `master` is the release branch and the PR target. Work lands on a topic branch (`feat/...`, `fix/...`)
opened against it. A long-lived `current` integration branch was used historically and appears throughout the git
history and older PR bodies; it is no longer the working branch.

---

## Conventions & Constraints (read before editing)

- **CommonJS everywhere** — `"type": "commonjs"`; use `require()` / `module.exports`.
- **Internal imports use `#alias`** from each package.json `imports` map (e.g. `#web-config-env`, `#config-drift`, `#auth-manager`, `#definitions`), not relative paths. Cross-package imports use the `exports` map (e.g. `@ti-engine/core/tools`, `@ti-engine/web-framework/config-management`).
- **Alpine.js runs in CSP mode** — in the `web-framework` shell, and therefore in any application built on it (**not** `web-content`, which is server-rendered HTML plus one vanilla script). In HTML Alpine expressions: **no inline `style="..."` attributes** (CSP forbids them — use CSS classes) and **no optional chaining (`?.`)** (the CSP expression evaluator rejects it). `Array`, `Object`, etc. are also unavailable inside template expressions — use the `tiApplication.hasRole(...)`-style JS helpers instead of `Array.isArray(...)` inline.
- **Design-first cadence.** Non-trivial features start from a design record (meta header + running implementation log) and land as small, checkpointed Conventional-Commit steps. **Look in two places:** the owning package's `design/` directory (the older convention, still where competence's shipped feature records and all content source-of-truth docs live) and the repo-root `docs/superpowers/specs/` + `plans/` (the convention from 2026-07 onward).
- **Some committed files are generated — regenerate, don't hand-edit.** In this repository that means the TypeScript declarations under `packages/*/types/`: `npm run build:types` regenerates them and `npm run check:types` fails on stale output.
- **Never promise `immutable` for a URL that isn't content-addressed** — a lesson learned the hard way in both `web-framework` 1.19.0 and `web-content` (browsers honour `immutable` through a manual reload, so a shipped fix never reaches a returning visitor).
- **`.run/*.run.xml` are git-tracked but carry live local credentials** in the working tree — never commit changes to them.
- **deepFreeze on config** — once settings/config are loaded they are immutable; never mutate them in place.
- **Commit as the maintainer, disclose the assist in trailers** — `cla.yml` fails a PR whose commit authors have
  not signed `CLA.md`, and the allowlist holds `Belleal` alone. The identity to set and why it is the correct
  resolution rather than widening the allowlist are in **`CLAUDE.md` → *Start of session***. The repo-specific
  remedy when it has already gone wrong: a commit authored as `Claude <noreply@anthropic.com>` fails `CLAssistant`
  and needs re-authoring with
  `git rebase <base> --exec 'git commit --amend --no-edit --reset-author'` before the PR can go green.
- **`process.loadEnvFile` does not override a variable already in the OS environment.** A stale `export` in the
  shell silently beats a correct `.env`, and the file looks right the whole time — suspect this first whenever
  configuration "is not being read". It cost one full investigation in this repository: the reported cause of the
  Entra lock-out (1.35.0) was "`TI_WEB_AUTH_ADMINS` is not being read", the variable was measured and found to be
  read correctly, the real defect was elsewhere in `auth-manager` — *and* a stale shell export was independently
  masking the fix on the reporter's machine. core 1.12.0 logs which `.env` file was loaded, which narrows this but
  does not answer it: the line reports the **file**, not which value ended up in effect.
- **Config shipped in a release does not reach a seeded deployment on its own.** The store writes a file default
  only when a document has never been written, so a competency or setting added in a release is invisible on any
  environment started before it. That is what the **Configuration drift** panel (web-framework 1.24.0 /
  competence 3.20.0) exists to reconcile — never assume a shipped config change is live, and never tell an operator
  to wipe the Redis volume as the remedy.

---

## Package: core (v1.15.2)

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
| `utils/cache.js` | `CommonMemoryCache` singleton — owns operational state, connection observation and one shared guard; delegates storage to a `CacheProvider` |
| `components/cache/cache-provider.js` | **Abstract** backend contract (21 data methods + lifecycle) and `hasCapability()` |
| `components/cache/cache-capability.js` | `TiCacheCapability` enum — the optional behaviors a backend may declare |
| `components/cache/redis-cache-provider.js` | Redis/RedisJSON implementation — every Redis-specific detail in the cache path lives here |
| `components/cache/http-cache-provider.js` | State over HTTP (1.15.0) — the ten methods the state store uses; lists/sets stay abstract |
| `design/state-protocol.md` | The contract `HttpCacheProvider` speaks, plus the verified D1 mapping |
| `integrations/redis-integration.js` | ioredis client with connection pooling (RedisJSON: `JSON.MERGE`, `JSON.MGET`) |

**Public exports** (`package.json` `exports`): `.` (start-instance), `./tools`, `./cache`, `./exceptions`, `./logger`, `./localization`, `./service-instance`, `./service-consumer`, `./service-provider`, `./definitions` (the shared typedefs).

**Since the skill's last sync (1.9.0 → 1.15.0):**
- **TypeScript declarations ship with the package** (1.9.0, fixed in 1.9.1), generated from the JSDoc by
  `.github/scripts/build-types.js` into `types/`. They are **committed**, and `npm run check:types` fails on stale
  output — so regenerate rather than hand-edit. The gate type-checks a generated consumer with `skipLibCheck: false`
  and **nothing pinned**, because the first two attempts passed only by configuring the check into passing; a
  declaration naming a Node global needs an emitted `/// <reference types="node" />`, which the build script adds.
- `localization.getLabel( label, language, fallback )` takes an **optional third argument** returned when the key is
  absent, instead of the `!!! label not found !!!` placeholder (1.10.0).
- `tools.decycle` silently dropped a key named `__proto__` and corrupted the surrounding document — it built its
  replica with `{}` and bracket assignment, so that one name hit the inherited setter. Now `Object.create(null)`
  (1.11.0).
- Relicensed **GPL-3.0-or-later → Apache-2.0** (1.11.1).
- **`start-instance` reports which `.env` file it loaded, or that none was found at the resolved path** (1.12.0,
  at `DEBUG`; the log line moved after the instance has an ID in 1.12.1/1.12.2). The path comes from
  `process.cwd()` and a missing file is deliberately not fatal — a container supplies its whole environment
  directly — but the two cases were indistinguishable, so an instance started from a different working directory
  (an IDE run configuration, a wrapper script) read no env file at all and every setting it carried was simply
  absent. That surfaces much later as behaviour nobody configured. **It reports the file, not the outcome**: see
  the `process.loadEnvFile` trap under *Conventions* — a stale OS variable still beats a correct `.env`, and this
  line will say the file loaded while the value in effect came from the shell.

- **The cache backend is pluggable** (1.13.0). `CommonMemoryCache` used to build a Redis client in its own constructor,
  so the backend could not be changed without editing the class. Storage now sits behind the abstract `CacheProvider`;
  `RedisCacheProvider` is the only implementation and the default, so nothing changes for an existing deployment. The
  measurement that shaped it: of the ~25 methods the cache exposes, the union actually called by core-without-exchange,
  `web-framework` and `web-content` is ten — everything else, and every genuinely Redis-exclusive primitive
  (`blockingCommand`, `publishCommand`/`subscribeCommand`), belongs to the message exchange. A backend declares its
  capabilities and the application declares what it requires; the two are reconciled once, at startup.
  **`ATOMIC_JSON_EDIT` is separate from `JSON_DOCUMENTS` on purpose** — `web-content`'s capture store depends on
  `editJSON` being applied server-side, and a backend that emulates it as read-modify-write loses one of two concurrent
  writes with nothing thrown.
- **And selectable, with the exchange and heartbeat switchable off** (1.14.0). 1.13.0 gave the cache a contract but
  `CommonMemoryCache` still constructed `RedisCacheProvider` itself, so nothing else could be selected;
  `memoryCache.provider` now names the backend. Two other pieces of core assumed Redis and a mesh: the message
  exchange, constructed unconditionally at startup, and `reportHealthy()`, writing once per second forever. Both are
  now switchable, both default to on. **With the exchange and heartbeat both off, core makes no cache calls of its
  own at all** — which is what makes a non-Redis backend viable, since the exchange owns every primitive
  (`blockingCommand`, pub/sub) such a backend cannot reasonably provide.
  The selection seam is also the test seam: `test/fixtures/StubCacheProvider` reproduces the Redis client's
  notify-observers-then-resolve ordering, which is what made the 1.13.0 rollback testable at last.

- **And there is now a second backend: `HttpCacheProvider`** (1.15.0, built-in name `http`). It keeps state in an HTTP
  service instead of a database client, for a deployment where the durable store is reachable only through a platform
  binding — the Cloudflare container the Boris Khan site targets reaches D1 through its Worker, so no SDK and no
  credential is in the image. Named for the transport, not for D1: what answers the protocol is the deployment's
  business, which is also what lets core test the whole contract against `node:http`.
  The protocol is specified in `packages/core/design/state-protocol.md` — twelve paths, one per logical operation.
  Two details there are load-bearing. **Values go on the wire as strings**, because `tools.stringifyJSON` passes
  scalars through untouched and a stored `42` would otherwise return as a number, fail the `isString` check that
  decides whether a key exists, and read back as absent. **Paths go as arrays of literal key segments**, never as a
  JSONPath expression, because RedisJSON wants `$["a"]` and SQLite wants `$."a"` — and SQLite's path grammar has no
  escape for a double quote inside a quoted label at all, so the D1 merge nests the patch inside the path and binds it
  to a bare `json_patch( value, ?1 )` rather than building a path string. One statement, therefore atomic, therefore
  `ATOMIC_JSON_EDIT` is a claim with evidence.
  Only the methods the state store actually uses are implemented (the ten in use, plus `deleteValue`); lists, sets and
  multi-key batching stay abstract, because they belong to the message exchange, which this deployment disables.
  **The recovery probe is load-bearing and easy to delete by accident.** Once the singleton is told a connection is
  disrupted it stops passing calls through, so this provider would never see another request to discover the service
  on — the Redis client is spared this only because ioredis reconnects independently of commands. `#markDisrupted`
  starts a timer that is the entire recovery path; `http-cache-integration.test.js` pins it, and that test was
  verified to fail with the probe disabled.

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
- `TI_MEMORY_CACHE_REQUIRED_CAPABILITIES` — comma-separated `TiCacheCapability` values the application requires of the cache backend. **Empty by default**, which is what keeps every deployment predating capabilities behaving as it did; when set, a backend missing any of them fails startup rather than raising from inside a request
- `TI_MEMORY_CACHE_PROVIDER` — which cache backend to construct (1.14.0). `redis` (the default) and `http` (1.15.0) select built-ins; anything else is a module path resolved against the working directory and must export a `CacheProvider` subclass. A bad value fails at require time, on purpose
- `TI_MEMORY_CACHE_STATE_URL` / `_STATE_AUTH_TOKEN` / `_STATE_TIMEOUT` / `_STATE_ALLOW_INSECURE_AUTH` — where the `http` backend finds its state service, the bearer token to send (omitted when unset), the per-request timeout in ms, and the opt-in that lets a token travel as plain HTTP to a remote host (1.15.0, default `false`; loopback and HTTPS never need it, and the Cloudflare deployment sets no token at all). A bad timeout or an unparseable URL fails in the constructor, because `AbortSignal.timeout` throws synchronously and would otherwise break the promise contract. Ignored by the Redis backend
- `TI_MESSAGE_EXCHANGE_ENABLED` — whether to run the message exchange at all (1.14.0, default `true`). Off means the dispatcher is never initialized or shut down; see the note on the cache backend below for why that is what lets a non-Redis backend work. **Broken for every web server until 1.15.2**: `ServiceConsumer.onStart` registered with the uninitialized dispatcher unconditionally, so `TiWebServer` crashed at boot with it off. Anything that reaches the dispatcher must check `ServiceInstance.isMessageExchangeEnabled` first — the dispatcher now throws `E_GEN_NOT_INITIALIZED` rather than a `TypeError` if it doesn't. A `ServiceProvider` with it off registers none of its configured services and logs a warning saying how many it skipped: it could receive no requests for them
- `TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED` — toggle the message integrity hash (default `true`)
- `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` — message-exchange HMAC-SHA256 key. **Empty by default**: if unset (or equal to the old published default UUID) a one-time startup WARNING logs and tamper protection is ineffective — set a private value in production.

> Note: `executionTimeout` (default 180000ms) and `healthCheckEnabled` (1.14.0, default `true`) are `serviceConfig` **settings** (service config JSON / `bin/settings.json`), not ENV vars — there is no env override for either. `healthCheckEnabled: false` schedules no job at all; the default `healthCheckInterval` is a **six-field** cron (`*/1 * * * * *`), so leaving it on costs one cache write per second for the life of the instance.

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
npm test    # node --test — runs test/*.test.js: 124 tests / 32 suites across 12 files
            # (the count includes the three test/fixtures/ modules: the default pattern runs them too)
            # (cache-capabilities, cache-get-values, cache-provider-selection,
            #  http-cache-provider, http-cache-integration, http-cache-config,
            #  localization, message-hash, security-hash-key-warning,
            #  service-consumer-without-exchange,
            #  service-provider-without-exchange, tools-proto-keys)
            # test/fixtures/ holds StubCacheProvider (how the cache singleton is
            # driven without a live Redis) and startStubStateServer (an in-memory
            # implementation of the state protocol, on node:http) - neither is a
            # test file
```

---

## Package: web-framework (v1.36.0)

**Role**: Express.js web server + authentication layer + a reusable **admin config-management subsystem** for web-facing UIs + a CSP-safe **charting primitive library** (`ti-charts.js`) + the container-deployment surface (`TI_WEB_*` env overrides, `GET /health`) and the **route-registration seams** (1.17.0) a subclass uses to mount its own routes — what `web-content` is built on.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/web-server.js` | `TiWebServer` (extends ServiceConsumer); Express app, middleware stack; applies the `TI_WEB_*` overrides, mounts `GET /health`, hosts the `registerRoute` / `addUnprotectedRoute` seams (1.17.0) and the `/static` cache decision (`resolveStaticCachePolicy` / `staticCacheControlFor`, 1.19.0) |
| `bin/web-app-manager.js` | `TiWebAppManager` **abstract**; HTML fragment rendering, nonces, CSRF, the `registerConfigDocument` / `registerConfigEditor` API, the default `verifyAccess` that enforces a fragment's declared `roles` (1.13.0), and login-page gating to the effective auth methods (1.14.0/1.15.0) |
| `bin/web-server.json` | Server config (host, port, TLS, auth methods, `auth.admins`, `trustedOrigins`) — most fields overridable via `TI_WEB_*`. **`staticCache` defaults deliberately live on the class, not here**: the constructor's `_.merge` merges arrays by index, so a consumer's empty `immutablePaths` could otherwise never clear a default entry |
| `bin/build/post-install.js` | `postinstall` step (refreshes bundled static libs) |
| `components/auth-manager.js` | OpenID Connect (Azure/Google) + local auth; session token generation; `getOAuth2CallbackPath()` + the pure `toCallbackPath( callbackUrl )` (1.18.1) reduce a configured callback to its Express route path; the pure statics `resolveOpenIDIdentity( userInfo, claims )` (1.35.0 — the identity an OpenID sign-in puts on the session, read from **both** responses) and `isEmailReportedUnverified( userInfo, claims )` (1.30.0, second source added 1.35.0) |
| `components/authorization.js` | Role checks/guards — `requireRole`, `hasRole`, and the pure `isAccessAllowed(requiredRoles, userRoles)` (1.13.0) backing the fragment gate; backs admin gating |
| `components/session-store.js` | Express session storage |
| `components/web-handlers.js` | Middleware: CSP headers, CSRF validation, auth verification, `healthHandler` (`GET /health`, 1.15.0), `originRefererValidationHandler` (reconstructed origin **or** a configured trusted origin, 1.16.0), the module-private `isSecureRequest( request )` (1.35.1 — the **one** scheme decision, shared by `getBaseUrl`, `cspHeaderHandler` and `httpRedirectHandler`), error formatting (`resolveHttpCode` derives 4xx from the exception family when no explicit `httpCode`: `E_WEB_*`/`E_APP_*`→422, `E_SEC_*`→403, not-found→404, already-exists→409, method/content→405/415; only internal/comm/unknown stay 500) |
| `components/web-config-env.js` | `applyWebConfigEnvOverrides( config, env = process.env )` (`#web-config-env`, 1.14.0+) — the pure `TI_WEB_*` override layer over the merged server config |
| `components/user.js` | User object model |
| `components/config-store.js` | Versioned, audited config store (Redis JSON) — current value, history, validated restore |
| `components/config-registry.js` | In-process registry of config documents, schemas, validators, editors |
| `components/config-service.js` | Facade orchestrating registry + store + validation (exported as `config-management`); the `applyEdits` validator context exposes `getConfig` (the *pending* value, for cross-document checks) **and** `getStoredConfig( key )` (the *committed* value — 1.17.1, needed by a validator comparing its own document against its prior state) |
| `components/config-change-notifier.js` | In-process `config:changed` pub/sub so live config reloads |
| `components/admin-config-handlers.js` | `/admin/config/*` HTTP API (get/list/save/restore/export, ajv + semantic validation) |
| `components/definitions.types.js` | Shared JSDoc typedefs |
| `bin/static/` | Frontend assets: HTMX, Alpine.js (CSP build), `safe-nonce`, framework CSS + themes, HTML fragments |
| `bin/static/scripts/ti-charts.js` | CSP-safe SVG charting library (added 1.10.0); see *Charting primitives* below |
| `design/admin-config-management.md` | Design doc + implementation log for the config-management feature |
| `test/*.test.js` | `node --test` — **524 tests / 107 suites across 39 files**: the config subsystem + authorization + `ti-charts` (layout math + render structure) + the serving/deployment surface (`web-server-env-overrides`, `web-server.static-cache`, `web-server.route-seams`, `web-server.unprotected-routes`, `web-handlers.health`, `web-handlers.origin`, `web-app-manager.auth-visibility`) + the auth surface (`auth-manager`, `auth-manager.callback-path`, `auth-manager.email-verified`, **`auth-manager.openid-identity`**, `web-handlers.oauth-callback`, `web-handlers.session-*`) + **`web-handlers.csp-upgrade-insecure`** (which also pins that `cspHeaderHandler` and `httpRedirectHandler` agree about the scheme) + **`ti-framework.sidebar-overflow`** (which resolves the stylesheet's cascade rather than reading one block, because `.ti-sidebar` is declared twice and the later rule wins) + **`login-extra-slot`** (which asserts against the shipped files, because the defect it pins was what the package *contained*, and then drives `assembleHtmlView` to prove the slot actually resolves an application's component over the framework's empty default) |

**Public exports** (`package.json` `exports`) — **six**: `./config-management` (config-service), `./web-application` (web-app-manager), `./web-server`, `./authorization`, `./config-drift`, `./definitions`. The last three are easy to forget and a consumer does import them: competence reaches for `./authorization` and `./config-drift` directly. Anything not on this list fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, so **adding a module a consumer needs means adding its `exports` entry** — that is the API surface, and changing it is a breaking change for every consumer.

**Since the skill's last sync (1.25.1 → 1.36.0):**
- **The login screen has an application-extension slot, and the application-specific test-user panel is gone**
  (1.36.0, BREAKING). `frame-login.html` shipped a "Test user" pill panel whose profile list was a literal array of
  **competence's** employee IDs and role codes, with its behaviour and the `ti-test-user` cookie in
  `ti-framework.js` and its styling in `ti-framework.css` — one application's data in the framework package, on
  every deployment's login screen, marked TEMPORARY in two files since it was written.
  <br/>
  **Nothing could remove it, which is why nothing did.** The login screen is rendered *before* sign-in, so no
  application fragment is in play and a consumer had no way to put anything on that page; taking the panel out
  would have taken the capability with it. It also rendered unconditionally — the flag competence gates the cookie
  with is a server-side environment variable that never reaches the client, and `applyAuthMethodVisibility` strips
  only the auth-method, divider, social and "none" markers, so no path removed the panel. A production login page
  showed an identity picker that looked functional.
  <br/>
  The `login` fragment now declares `components: [ "component-login-extra" ]`, the fragment carries a
  `<ti-component-login-extra-placeholder>`, and the framework ships that component **empty**. A consumer supplies
  its own `fragments/components/component-login-extra.html` and `#locateStaticFile`'s reverse-order search
  resolves it over the empty default — the same mechanism that already lets competence override
  `frame-dashboard.html` and `index.html`. **No new API**, and the framework keeps owning the login page.
  <br/>
  Rejected: letting the consumer override `frame-login.html` wholesale (works today and needs no release, but forks
  the auth-method blocks, the provider SVGs and the error element into every consumer, to drift silently from fixes
  here), and a new `TiWebAppManager` hook returning login-extra HTML (more API surface, same result). Two things
  worth knowing if you touch this: the fragment's **root element** still bound `x-data="tiLoginTestUserPanel"` after
  the panel markup came out and would have thrown on every render — the test caught it — and `#locateStaticFile`
  **memoizes by relative path**, so a consumer's component is resolved once per process and
  `TI_WEB_APP_STATIC_CACHE_DISABLED=true` is what makes it re-read.
- **The sidebar scrolls instead of clipping everything past the fold** (1.35.4). `.ti-sidebar` is a `height: 100vh`
  flex column that was declaring `overflow: hidden`, and a consuming application appends its own sections as direct
  children — so once those exceeded the viewport the excess was cut off with no way to reach it. Measured in
  Chromium with competence's 21 entries at 1440x800: 1094px of content in an 800px box, and a mouse wheel over the
  sidebar moved it **0px**. Under the fold was `.ti-sidebar-foot` — the theme toggle and the user menu, and the
  user menu is where **sign-out** lives — so on a laptop those were simply unreachable. The column never
  compressed, it was cut, which is why the footer's bottom edge sat at 1082px whether the viewport was 640px or
  1080px.
  <br/>
  It survived because a 1080px monitor shows nearly everything: the footer misses by 2px and the only visible
  breakage is the last section label. That label is the one child that genuinely squashed —
  `.ti-sidebar-section-label` declares no `min-height`, alone among the children, so it absorbed the whole
  column's shrink and clipped its own text (25px → 14px). A report of "the buttons get squashed" is describing
  the only symptom a big screen has.
  <br/>
  `.ti-sidebar` is now the scroll container, with `.ti-sidebar-brand` and `.ti-sidebar-foot` pinned by
  `position: sticky` and `flex-shrink: 0` on every child. **The scroll container is the sidebar itself rather
  than a new inner wrapper on purpose** — a wrapper is a markup change, and every consumer that overrides
  `component-sidebar.html` (competence does) would keep the broken layout until it adopted the new element.
  Three consequences worth knowing before touching this: the vertical padding had to move from `.ti-sidebar`
  onto the pinned rows, or the list scrolls visibly through the gap above the brand and below the footer; the
  pinned rows composite `--sidebar-bg` over `--bg-app` because `--sidebar-bg` is **translucent** in the glass
  theme and the list would otherwise show through them; and `.ti-sidebar-collapse-btn` had to become `sticky`
  rather than `absolute`, because an absolutely positioned child of a scroll container scrolls away with the
  content. The `position: fixed` user flyout is *not* clipped by the scroll container — `backdrop-filter` in the
  glass theme targets the legacy `.sidebar`, not `.ti-sidebar`, so nothing creates a containing block for it.
- 1.35.2 and 1.35.3 are a `package.json` structure update and a build re-trigger; neither changes behaviour.
- **`upgrade-insecure-requests` follows the visitor's scheme, not the deployment's** (1.35.1). The directive was
  never declared in `cspHeaderHandler`'s own `directives` object — it arrived with Helmet's `useDefaults` and went
  out on every response, telling the browser to rewrite this origin's `http://` URLs to `https://` on a
  `TI_WEB_USE_TLS=false` deployment with no TLS listener to answer them. **What it broke was sign-out, and only
  sign-out**, which is why it survived: Chrome exempts a potentially-trustworthy host such as `localhost` when it
  issues the *first* request, so every ordinary XHR works — but it applies the upgrade when resolving a
  **redirect**, and `logoutHandler` is the one response in the framework that redirects. The `POST` succeeded, its
  `303` to `/` was followed to `https://`, and the handshake failed `net::ERR_SSL_PROTOCOL_ERROR`, surfacing
  through htmx as `htmx:sendError` — which names neither the scheme nor the directive that chose it. The decision
  is per **request**, so a TLS-terminating proxy in front of an HTTP server still gets the directive and Cloud
  Run / IAP is unchanged. `isSecureRequest` leads with `request.secure` (already proxy-aware: `trust proxy` is set
  unconditionally, so Express resolves `X-Forwarded-Proto` and takes the first hop of a chain) and reads the
  forwarded header only as a **second opinion**, never an override, for the one case Express gets wrong — it
  compares the scheme **case-sensitively**, so a proxy sending `HTTPS` reports as insecure. That clause looks
  redundant beside `request.secure` and is not; the measured matrix is recorded in
  `test/web-handlers.csp-upgrade-insecure.test.js` so it does not get simplified away.
- **An OpenID identity is resolved from the ID token claims *and* `userinfo`, not `userinfo` alone** (1.35.0,
  BREAKING) — the pure `AuthManager.resolveOpenIDIdentity( userInfo, claims )`. The ID token was fetched, read for
  the `sub` that `fetchUserInfo` is verified against, and then discarded. That works for Google and **fails for
  the Microsoft identity platform**, whose `userinfo` returns `sub`, `name`, `family_name`, `given_name`,
  `picture` and — only when the optional claim is configured — an `email` from the directory's `mail` attribute.
  **It never returns `preferred_username`: on Entra that claim is in the ID token, and it holds the UPN.** So the
  one identifier an Entra deployment is configured around — the address an operator knows, lists in
  `TI_WEB_AUTH_ADMINS` and writes into an application record — never reached the session, `isAdminIdentity` had
  nothing to match, and the consumer reported the refusal as a missing application record. On a fresh deployment,
  where the admin exception is the only way in, that is a **lock-out**, which is how it was found.
  <br/>
  Username precedence: `userinfo.preferred_username`, `claims.preferred_username`, `userinfo.upn`, `claims.upn`,
  then e-mail, then name, then `sub:<sub>`. **Two rules, and the claim rule outranks the source rule** — `userinfo`
  wins *within* a claim because it is the fresher response, but "fresher" earns nothing between two stable
  identifiers, so it does not promote the Microsoft `upn` extension over the standard `preferred_username`. Only
  non-empty trimmed strings count, so a provider cannot smuggle `""`, `"   "`, `42` or an object onto a session.
  The **UPN is deliberately not accepted as an `email`**: it is a sign-in name, not a mailbox, and `email` is what
  a consumer resolves its own directory by. **BREAKING for a deployment whose `auth.admins` lists an Azure display
  name** — that stops matching and should become the UPN or the e-mail.
  <br/>
  The same release reads `email_verified` from both sources (1.30.0's rule is otherwise intact: only an explicit
  `false` refuses), and logs **provenance, not values**, once per sign-in at `DEBUG` — `claims.preferred_username`,
  `userinfo.email`, … The identity strings are never logged, because `auditing.logMinLevel` ships at 0 with
  console logging on, so a DEBUG line carrying them would write every signed-in person's identifiers to a default
  deployment's console. An operator already knows their own address; what they need is which claim their provider
  supplies, and a `sources` map on the returned identity is what answers it.
- **The login error box can no longer render empty, and `?error=` is cleared from the address bar** (1.34.0). The
  message had been unreadable since it was added (CA-95): `x-text-label` resolves the key out of **this package's**
  `web-server-labels.json`, and a consuming application configures exactly one labels path — its own — so it never
  resolved there, the directive fell back to the element's own text, and the element was empty. A red alert box
  with nothing in it. Fallback text now lives on the element; an application wanting it localized adds the key to
  its own catalogue, the same arrangement Profile and About already use. `tiToolbox.clearUrlParam( name )`
  (`history.replaceState`, so no history entry the visitor never navigated to) drops the parameter once shown — it
  is a one-time message, not state. The parameter itself stays, because a top-level navigation (an OAuth callback,
  a non-HTMX form post) can only be answered with a redirect, and a redirect carries no payload.
- **A failed OIDC callback is refused through the normal error path** (1.33.0, BREAKING). It used to answer
  `response.status( 400 ).end()` — a bare status with an empty body, no log line, and the three distinct reasons a
  callback fails collapsed into one blank page. A refusal now carries an explicit `401`, so it presents like every
  other sign-in failure: an HTML `GET` lands back on the login page with `?error=<code>`. The three reasons are
  distinguished **in the log, not the response** (the visitor has no use for the difference and an attacker
  probing the endpoint should not be handed it): `E_WEB_INVALID_REQUEST_QUERY` when the provider returned no code,
  naming the provider's own `error`; **`E_SEC_INVALID_EXPIRED_SESSION` when the session carries no OAuth state,
  naming the host the callback arrived on** — a session cookie is host-scoped, so a sign-in begun on one hostname
  and called back on another arrives with no cookie, which is what a service reachable under two names produces;
  and `E_SEC_UNAUTHORIZED_ACCESS` on a state mismatch. **Nothing secret is logged** — never the code, the state
  values, the verifier or the nonce, and a test pins that. The same release stopped `oidc.state && state !== oidc.state`
  skipping the comparison when the expected state is absent: an unverifiable callback is refused instead.
- **Session lifetime, and the two defects that threw a signed-in user out ten minutes after sign-in** (1.27.0).
  `cookies.maxAge` was `604800` — seven days expressed in **seconds**, written into a field express-session reads as
  **milliseconds**, so every session lasted 604.8 seconds. It is now `28800000` (eight hours, in the unit the field
  takes). And `rolling: true` is on, so the window slides with use: express-session re-sends the cookie only when
  the session is new, when `rolling` is set, or when the session data itself changed — and nothing changes it after
  sign-in, so the limit was absolute from sign-in rather than an idle timeout. The store side was never the
  problem; `SessionStore.touch` slid the Redis TTL correctly throughout, which is exactly why the fault was
  invisible from the server. **`TI_WEB_SESSION_IDLE_TIMEOUT`** overrides the window in whole **minutes** — the unit
  is in the name because that is the confusion this fixed. Note for a consumer choosing a value: a rolling window
  is refreshed by requests, and a browser filling in a form makes none.
- **`bin/healthcheck.js`** (1.28.0) — the container liveness probe for any `TiWebServer` application. Point a
  Dockerfile `HEALTHCHECK` at `node /app/node_modules/@ti-engine/web-framework/bin/healthcheck.js`. It belongs here
  because every input it reads is the framework's (`TI_WEB_USE_TLS`, `TI_WEB_PORT`, `TI_WEB_TLS_CERT_PATH`, and
  `/health` itself). The framework had always provided the endpoint and never anything to call it, which left every
  consumer writing an inline `node -e` — and the obvious inline version hardcodes `http://`, so it reports a
  TLS-enabled container unhealthy forever and Docker restarts a server that is answering correctly. With TLS on the
  certificate is verified rather than skipped; without a configured certificate it falls back to proving the port
  accepts connections, which is weaker but neither disables verification nor restarts a healthy container.
- **Roles are re-derivable per request** (1.29.0). `refreshSession( session, request )` is the per-request
  companion to `augmentSession`, called by the `sessionRefreshHandler` middleware. Roles derived once at sign-in
  are roles that cannot be taken away: `augmentSession` runs inside `regenerateAndSaveSession` and nothing re-ran
  it, so an authority the application withdrew stayed live in every session already holding it — and since
  1.26.0's `rolling` cookie an active user's session need never expire. The default hook is a no-op. The middleware
  mounts **after** the static handlers and **before** the application routes. Unlike `augmentSession`, **throwing
  does not refuse anything** — there is no sign-in to refuse — so a failing hook is logged, the session's
  application roles are dropped, and the request proceeds with the `admin` role alone: fail closed on authority
  without one failed lookup taking the application down.
- **`applyAdminRole` reconciles in both directions** (1.32.0, BREAKING). It only ever *added* the `admin` role, and
  it is the only place the role is granted, so it was also the only place it could be taken away: an identity
  removed from `auth.admins` kept `admin` for the life of its session, reaching `/admin/config/*` and every
  admin-gated screen. Now that 1.29.0 re-applies the role on every request, removal takes effect on the next one.
  An empty or absent allowlist now means **nobody** is an administrator rather than that everybody keeps what they
  had.
- **An OIDC sign-in whose e-mail the provider itself reports as unverified is refused** (1.30.0, BREAKING), exposed
  as the pure `AuthManager.isEmailReportedUnverified( userInfo )`. A consumer maps the authenticated identity to an
  application principal by e-mail, so an address the provider has not verified is an unauthenticated claim to be
  someone — and nothing checked it. **Only an explicit `email_verified: false` is a rejection.** An absent claim is
  not: Google emits the claim, the Microsoft identity platform does not emit it at all, so treating "absent" as
  "unverified" would refuse every sign-in on an Azure-default deployment.
- **`verifySession` refusals now destroy the session** (1.31.0), instead of only redirecting it. The hook had been
  a seam with a `TODO` and no consumer; the default returns true for any session carrying a user, so the "carries a
  user but fails verification" branch was unreachable. An application that overrides it needs the refusal to
  stick — leaving the session alive means re-deciding the same verdict on every request while the shell, which
  reads `auth.isAuthenticated`, goes on believing the visitor is signed in. The refusal shape is unchanged
  (`HX-Redirect` for HTMX, `303` to `/` for HTML, `401` otherwise) and is served even if the destroy itself fails.
  **Nothing changes for a consumer using the default.**
- **`ConfigService.listSchemaViolations()`** (1.26.0) reports stored documents that no longer satisfy their
  registered schema, and `ConfigRegistry.validateSchema( configKey, value )` exposes the schema half of validation
  on its own. Nothing validated a stored value on the way *out* before this: the store hands back whatever it holds
  and a consumer freezes it into its config exports, so a release that tightens a schema leaves any deployment
  seeded before the change serving a document that can no longer be saved — surfacing much later as an admin edit
  rejected for a key the admin never touched, in a screen unrelated to the change. Schema-only and read-only by
  design: reconciling a stale document is the drift panel's job, under audit.

**Earlier, and still worth knowing (1.20.0 → 1.25.1):**
- **Configuration drift** (1.24.0, `#config-drift`) — a pure structural diff between a document's registered **file
  default** and its **stored** value, exposed through `getDrift` / `listDrift` and an audited apply that routes
  through the normal change-set machinery (so it is versioned, appears in the change feed, and can be restored). It
  exists because the store seeds a file default **only on first write**: before this, a config change shipped in a
  release could never reach an already-seeded deployment, and restore could not help because the oldest version *is*
  the stale one. Arrays of primitives are **set-diffed** (`+27 codes`, not "changed"); arrays of objects compare
  atomically. 1.25.0 adds a `driftTracked` flag so a document can opt out via `metadata.driftTracked: false`.
- **Real local authentication** (1.23.0). It had never been implemented — the constructor overwrote whatever was
  configured with `admin`/`admin` behind a "for testing purposes only" TODO, and compared with plain `===`.
- **`augmentSession` may refuse a sign-in**, fail-closed, and sign-in failures present identically across every auth
  method (1.22.0) — a prerequisite for local auth not leaking which half of a credential was wrong.
- **Profile and About screens** (1.21.0) — provided to every consumer; Profile had been a two-line placeholder
  fragment since the shell was written.
- TypeScript declarations ship (1.20.0/1.20.1), same gate as core.
- **`getLabel` and literal dots** (1.25.1): it split a key on every dot and descended one object level per segment,
  so a group storing flat dotted keys (because the key *is* a dotted string) never resolved. Relevant to any label
  group keyed by competency code or config path.
- Relicensed **Apache-2.0** (1.24.1).

**Config-management subsystem** (the reusable machinery; its first consumer was competence, now a separate repository):
- An app subclass calls `TiWebAppManager.registerConfigDocument(key, {...})` (schema, semantic validators, file default, editor metadata) and `registerConfigEditor(name, editor)` (composite/entity editors) during init.
- The store seeds from file defaults, serves the live value, versions every change, validates (ajv + semantic) on save, supports validated restore, audit, and export-to-git bundle.
- `config-management.instance.onConfigChanged(...)` lets consumers hot-reload their in-memory config when an admin edit lands.
- A semantic validator's `applyEdits` context gets `getConfig` (**pending** value — so it can check a sibling document's post-edit state) and, since 1.17.1, `getStoredConfig( key )` (**committed** value). Use `getStoredConfig` when a validator must compare its *own* document against its previous state: a document is always part of its own edit batch, so `getConfig` on itself just returns the incoming value (this silently defeated the competence `research-consent` version-bump guard).
- Admin gating: an identity must appear in `auth.admins` in `web-server.json` — or in `TI_WEB_AUTH_ADMINS` (1.18.0), which **replaces** it and is how a container names an admin; gating is `hasRole('admin')`. Default is `[]` (no admins) — set one to reach the admin UI.

**Role-based screen gate (1.13.0)**: `authorization.isAccessAllowed(requiredRoles, userRoles)` is a pure, unit-tested access decision (empty/absent `requiredRoles` = public; otherwise ≥1 role overlap; **no implicit hierarchy**, so an `admin` gate is never satisfied by a numeric role). The default `TiWebAppManager.verifyAccess` uses it to enforce a fragment's declared `roles` (set on `addFragment`) — a role-restricted screen becomes unreachable by direct URL, not merely hidden — while role-less fragments stay public (backward compatible). `tiApplication.setScreenTitle(title)` adds a per-screen topbar/document-title override (cleared on navigation) so, e.g., a manager viewing another user's scores isn't shown "My …".

**Container & deployment surface (1.14.0–1.16.0 + 1.18.x, CA-90/94/97)**: `applyWebConfigEnvOverrides` layers the `TI_WEB_*` variables (below) onto the merged config, so a container needs no per-environment config file. A list-valued override **replaces** its config array (`_.merge` is by-index and can't cleanly override one). An enabled OIDC provider with no client ID is **skipped with a warning** rather than crashing startup, and the login page renders only the *effective* methods — OAuth buttons *and* the `local` form, with a "no method configured" fallback — so an SSO-only deployment shows no dead login form. `GET /health` (unprotected) returns `{ status, broker, uptime }` for orchestrator probes. **1.18.1 (CA-97) — startup crash worth knowing:** an OAuth2 callback configured as an *absolute* URL (what the install docs tell operators to register with the provider) used to be handed to Express as a route path; under Express 5 / path-to-regexp v8 the `:` in `https://` throws `Missing parameter name at index 6`, so enabling Azure SSO took the instance down. Callbacks are now registered by their derived **path**, while the `redirect_uri` sent to the provider stays exactly as configured; an underivable callback logs a WARNING and skips that provider's endpoint.

**Route-registration seams (1.17.0)**: `TiWebServer.registerRoute( method, path, ...handlers )` — called from a `defineWebApplicationRoutes()` override *after* `super()` — mounts a custom route after the framework's own routes but before its `*splat` 404, which is exactly the seam a catch-all content resolver needs. Verbs are allowlisted (`get`/`post`/`put`/`patch`/`delete`/`options`/`head`/`all`; anything else raises `E_GEN_INVALID_ARGUMENT_TYPE`, and calling before the Express app exists raises `E_GEN_NOT_INITIALIZED`), and `method` must be a real **string** — a `[ "get" ]` or `new String( "get" )` is rejected outright, never coerced past the allowlist. `TiWebServer.addUnprotectedRoute( pattern )` (from a `defineUnprotectedRoutes()` override) appends a string (exact-match) or RegExp (tested) pattern, letting a public-by-default site invert the framework's protect-by-default stance. **`web-content` is the first consumer of both** — reach for these instead of touching private server state.

**`/static` cache policy — BREAKING in 1.19.0**: the old default was `max-age=1y, immutable`, and browsers honour `immutable` so completely that **not even a manual reload revalidates** — so a deployed CSS/JS fix could never reach a returning visitor for up to a year. That promise only holds for content-addressed URLs, and none of the framework's own assets (`/static/scripts/ti-framework.js`, the theme sheets) are named that way. The default is now `public, max-age=0, must-revalidate`; an unchanged asset still answers `304` (headers, no body) via `ETag`/`Last-Modified`. A consumer whose asset filenames **or** URLs carry a content hash should opt back in with `staticCache: { maxAge: 31536000, immutable: true }`. The `staticCache` block takes `maxAge` in whole **seconds** (an express-style `"1y"` string is reported, not silently reinterpreted as ms), `immutable`, and `immutablePaths` (prefixes served long-lived regardless of the other two; default `[ "/fonts/" ]`, clearable with an explicitly empty array). `immutable` with `maxAge: 0` is a contradiction and is dropped with a warning. The decision itself is pure and unit-tested — `resolveStaticCachePolicy()` (config → policy + warnings, logged by the caller) and `staticCacheControlFor()` (policy + file → header) — applied per file through `express.static`'s `setHeaders`.

**Security stack**: Helmet, CSP nonces, CSRF (timing-safe), express-session, OpenID Connect OAuth2.

**Frontend**: HTMX + Alpine.js (CSP build) for fragment-driven UIs. Reusable CSS primitives in `ti-framework.css` — `.ti-page-head`, `.ti-data-grid*`, `.ti-form*`, `.ti-panel-head*`, `.ti-panel-body-intro` (the canonical intro/description line under a panel head — don't hand-style per screen), `.ti-kv-label` / `.ti-kv-value` (key/value rhythm), `.ti-modal-*`, and the mask-based `.ti-icon` system (size modifiers `.xs`–`.xl`, ~40 variants); themes `ti-theme-daylight.css` / `ti-theme-black-glass.css`. `ti-framework.js` exposes the `tiApplication` Alpine store (incl. `hasRole`, `setScreenTitle`, topbar CTA slots, and `notify`/`formatException` which support a `{ message, details }` payload — the details line shows the specifics under the generic message; toasts render above open modals). Prefer these primitives over screen-specific CSS. **Remember the Alpine CSP constraints** (no inline styles, no `?.`).

**Charting primitives** (`bin/static/scripts/ti-charts.js`, added 1.10.0 — built for competence's Statistics & Results reporting, which now consumes it from npm):
- A single `renderChart(figure, spec)` dispatcher over a `{ type, data, options, a11yLabel, provisional }` spec; eight `type`s: `gauge`, `bars` (modes `stacked`/`grouped`/`diverging`), `stat`, `scatter`, `heatmap` (scales `sequential`/`diverging`), `box`, `radar`, `line` (mean + p25–p75 band, `sparkline`, stacked, `provisionalLastPoint` dashed trailing segment). Grouped `bars` and `radar` take optional legends + value labels, and `radar` optional per-axis tones (1.12.0).
- **Pure layout helpers are unit-tested in isolation** (`gaugeArcPath`, `barSegments`, `scatterLayout`, `heatmapLayout`, `boxLayout`, `radarLayout`, `lineLayout`, …) — add a new primitive by adding its layout + render + a `SUPPORTED_TYPES` entry + a dispatch case, mirroring an existing pair.
- **CSP discipline (enforced by tests):** build SVG with `createElementNS` + `setAttribute` only — **never** `element.style.*` except `setProperty("--var", …)`; every chart ships a visually-hidden `.ti-chart-sr` table; interactivity via `addEventListener` (the `ti-chart:select` CustomEvent).
- Bind from Alpine with the `x-ti-chart="someSpec"` directive on a `<figure class="ti-chart">`; per-type size caps come from `figure[data-ti-chart-type]` CSS (set by `renderChart`). Tones use `--chart-seq-1…5` + grade colours in both themes.

**ENV variables (web-framework)** — applied by `applyWebConfigEnvOverrides`; every list-valued one **replaces** the configured array (an explicitly empty value means "none"):
- `TI_WEB_HOST` / `TI_WEB_PORT` / `TI_WEB_USE_TLS` / `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` / `TI_WEB_COOKIE_SECRET` — binding, TLS, session-cookie secret (1.14.0)
- `TI_WEB_AUTH_METHODS` — enabled auth methods (`local`, `openid-google`, `openid-azure`); replaces `auth.enabledMethods` (1.15.0)
- `TI_WEB_AUTH_LOCAL_USERS_PATH` — the local user directory (`auth.local.usersPath`) backing real local auth (1.23.0). There are no hardcoded credentials to disable: a local sign-in succeeds only against a matching, non-disabled record in this file
- `TI_WEB_TRUSTED_ORIGINS` — extra accepted `Origin`/`Referer` values for state-changing requests behind a proxy that doesn't present the external host (1.16.0)
- `TI_WEB_AUTH_ADMINS` — admin allowlist; replaces `auth.admins`, matched **case-insensitively** against the session user's user ID, username **or** e-mail (1.18.0). Which of the three an entry should hold depends on the provider, and they are not interchangeable: on **Entra** `username` is the UPN and `email` is the directory's `mail` attribute, routinely two different addresses (1.35.0). The `DEBUG` provenance line names the claim each one came from — that is what it is for. An empty or absent allowlist means **nobody** is an administrator (1.32.0), and the role is reconciled in both directions on every request (1.29.0 + 1.32.0), so removing an entry takes effect on the next request rather than at the end of the session
- `TI_WEB_STATIC_MAX_AGE` / `TI_WEB_STATIC_IMMUTABLE` / `TI_WEB_STATIC_IMMUTABLE_PATHS` — the `/static` `Cache-Control` policy (1.19.0)
- `TI_WEB_SESSION_IDLE_TIMEOUT` — the rolling session idle window, in whole **minutes** (1.27.0). A non-integer or non-positive value is ignored, leaving the config value standing — the same posture as `TI_WEB_STATIC_MAX_AGE`
- `TI_WEB_APP_STATIC_CACHE_DISABLED` — **unrelated to the three above**: turns off the app manager's *in-process* memoization of read fragment/static file contents (`#locateStaticFile`), not any HTTP cache header

---

## Package: web-content (v0.3.1 — WIP)

**Role**: A **content-publishing engine** — turns registered content sources into a public, server-rendered website: path-index routing, deny-by-default visibility, SEO documents (canonical / `hreflang` / Open Graph / JSON-LD), feeds, and email capture. Layered on `web-framework` the way competence is, but **public-by-default** instead of protect-by-default: it is the first consumer of the 1.17.0 route seams and needs web-framework **≥ 1.17.0**. Node `>= 20.12`. Built for the standalone author's site, which lives outside this repo (its own specs are referenced as `Site/docs/`).

> **Status: 0.x, work in progress** — module surface and API are still settling. Design record + phased plan: `design/author-site-engine.md`. This is a **library**: no `start`/`build` script (only `test`), and a consuming site does the wiring.

**Key files**:
| File | Purpose |
|------|---------|
| `content/schema.js` | ajv validators for the common envelope, each content type, and the capture record; exports `CONTENT_TYPES` / `SECTION_TYPES` / `RELEASE_STATES` / `VISIBILITY_PATTERN`. `visibility` is **required and pattern-constrained**, so a missing or unrecognised value is a hard validation failure |
| `content/loader.js` | Validates records and builds the id / path / alias / type indexes — invalid records are excluded and conflicts reported, never thrown |
| `content/repository.js` | **The single visibility chokepoint** — `resolveVisibility` answers visible / gated / hidden and every query surface (resolve, list, count, getById, curated ids) routes through it; `list()` also expands one level of parent terms |
| `content/sources.js` | Reads **explicitly registered** front-matter/YAML files — a directory is an error, never scanned; normalizes YAML-parsed dates to ISO-8601 strings at the boundary (an unquoted timestamp parsed as a `Date` used to fail validation and silently drop the record) |
| `content/taxonomy.js` / `content/terms.js` | Pure term graph (one-level parent expansion, per-language slugs) / the **one** term-resolution helper (slug, label, `archiveHref`) shared by archive generation *and* page rendering — they used to keep diverging private copies |
| `content/archives.js` | Term-archive page records generated from the vocabulary once at load, with per-language paths from configuration |
| `content/markdown.js` | markdown-it wrapper — `html: false`, typographer/linkify **off** so authored Unicode punctuation survives verbatim |
| `content/transliterate.js` | Streamlined System romanisation + deterministic `slugify` |
| `render/html.js` | Escaping tagged template with an explicit `raw()` opt-out |
| `render/document.js` | Document-head composition — canonical, reciprocal `hreflang`, noindex policy, per-type JSON-LD |
| `render/sections.js` | Section registry + shared wrapper/chrome; mechanical type→class derivation (`characterCards` → `.section-character-cards`), map pinned by test |
| `render/editorial/*` | The 15 section bodies grouped by kind — `text`, `lore`, `listing`, `media`, `dictionary`, `forms`, `index` |
| `render/shell.js` / `templates.js` / `page.js` | Document shell / per-type page templates (article, composed record, gate, state panel) / full document assembly |
| `render/context.js` | The page context templates need — eyebrow, meta line, term pills, breadcrumb, adjacent posts (prev/next resolved through the repository for the *same* viewer, so it can't link to a withheld record) |
| `routes/content-routes.js` | The catch-all path-index resolver — alias → 301, miss → `next()`, hit → render; **cache policy keyed on the record's visibility**, so a non-public response never carries public cache headers |
| `routes/index.js` | The mount API — `mountContentRoutes`, `mountHomeRoute`, `mountRedirects`, `mountSessionRoute`, `defineContentUnprotectedRoutes` |
| `routes/feeds.js` | `sitemap.xml` / `rss.xml` / `robots.txt` — sitemap membership resolved as an **anonymous** viewer (a gated record only when it exposes a public teaser); RSS is public-only |
| `routes/media.js` | Serves a migrated media library at its **original** URLs (`/wp-content/uploads/…`) from a mirror tree, so nothing needs rewriting and inbound links keep working; misses fall through to the real 404, dotfiles and directory listings refused, cache long but **never `immutable`** |
| `capture/store.js` / `admin.js` / `routes.js` | Email capture (preorders / newsletter / beta) — no IP stored, `consentAt` stamped server-side, only schema fields persisted, dedupe on (email, purpose), erasure by email across every purpose. Admin reporting **fails closed**: an absent guard selects the built-in admin check, never none |
| `static/web-content.js` | The vanilla, dependency-free site script (reveal observer, dictionary toggle + filter, language menu, topbar toggle, audio player); served under `/static/` by `mountContentRoutes` and overridable by the consumer |
| `design/author-site-engine.md` | Design record + phased plan |
| `design/authoring-guide.md` | **The authoring guide** — how a record is found, the envelope, the `sections` body, every section type, and why a record does not appear. It ships with the engine (moved here in 0.2.0) so every consumer has it, and its guard came along: a section type present in the schema but absent from both the documented and the deferred lists **fails this package's suite** |
| `test/*.test.js` | `node --test` — **403 tests / 103 suites across 22 files** (schema, loader, repository, taxonomy, transliterate, markdown + markdown-editorial, document, html, page, feeds, media, capture, sources, content-routes, routes-index, routes-not-found, …) |

**Content model**:
- **Content types** — exactly four: `post`, `page`, `book`, `release`. A lexicon/dictionary is a **section on a `page`**, not a fifth type.
- **`visibility`** is required on every record, matching `public` | `authenticated` | `role:<name>`. The repository turns that into the per-viewer *outcome* **visible / gated / hidden**. A **gated** record may expose a public teaser (which is what lets it into the sitemap); its withheld body never feeds a summary.
- **`sections`** — the body is an ordered list of typed sections; 15 types: `hero`, `prose`, `verse`, `characterCards`, `audio`, `languageExample`, `agePanels`, `timeStrip`, `timeline`, `gallery`, `capture`, `featured`, `postList`, `closing`, `dictionary`.
- **`world`** — a story world, **optional on a post** by deliberate design: a post about an award belongs to no world, and one without a world simply appears in no world archive. `form` *is* required on a post.
- **`releaseState`** (`book` / `release`): `announced` → `prerelease` → `released`.
- **Draft preview** — a viewer holding the `preview` capability may open an unpublished record **by its path, and only that**. Drafts stay out of every listing, feed, sitemap and curated list regardless; the response is `private, no-store` + `noindex` with a visible `.draft-ribbon`, and a draft is **never** edge-cacheable or indexable whatever its `visibility` claims.

**Conventions & gotchas (this package)**:
- **CommonJS**, `#alias` imports, one module per `exports` entry — the same house style as the rest of the monorepo. No Alpine/HTMX here: server-rendered HTML plus the one vanilla site script.
- **Caching is a security boundary.** A page embedding the session CSRF token must never be served `public` — a shared cache stored one visitor's token and handed it to everyone, 403-ing every other submission; such a response now drops to `private, no-store` + `Vary: Cookie`. That is *why* the topbar account menu renders identically for every viewer, with the client asking `GET /session` and swapping panels and reading the CSRF token from the cookie at submit time: it keeps pages shared-cacheable.
- **Percent-decoding (0.2.0, BREAKING)** — Express does not decode `req.path`, and the path index is an exact `Map` lookup against literal characters, so **no non-ASCII URL could ever resolve** and nothing threw. Paths are now `decodeURI`d (deliberately *not* `decodeURIComponent`, so `%2F` stays encoded and a slash smuggled into a slug cannot change which record a path addresses); a malformed sequence answers 404, not 500. `mountRedirects` had the same defect and is now **one** decode-aware catch-all with a lookup table behind it (was N Express routes, which never fired for a non-ASCII target).
- **`mountHomeRoute` claims `/`** for the content resolver before the framework binds it to the SPA shell. Calling it *is* the declaration that `/` belongs to content, so a miss now answers the site's own **404** instead of `next()` — which used to serve the application login shell with a 200 at the site root (a foreign screen to a reader, a soft 404 on the site's most important URL to a crawler). `notFound: false` restores pass-through for a genuine hybrid.
- **Never `immutable` on a stable URL** — `/static/web-content.js` and the media library keep stable URLs across releases, so `immutable` promises something untrue and browsers honour it through a manual reload (the same lesson as web-framework 1.19.0).
- Rendering modules stay **pure**: `render/editorial/forms.js` reports a missing CSRF token through a `reportProblem` callback instead of requiring the core logger, which had been dragging the framework's Redis client transitively into every template that draws a form. The route layer, which legitimately owns a logger, does the logging.
- The JSON-LD block carries the **CSP nonce** — under `strict-dynamic` a nonce-less script tag is dropped silently, and structured data that quietly stops working is not a visible failure.
- A **configured locale is proven usable before it reaches `Intl`** — a malformed tag like `en-G` is a `RangeError`, not a fallback, so one mistyped region subtag in `site.locales` took down every page render in that language. A rejected value falls through the chain (bare language tag, then English), so a typo costs a region, not a language.

---

## Package: tester (v1.3.5)

**Role**: Working example of a ServiceProvider with cross-service calls. Run to smoke-test the framework.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/tester-service.js` | ServiceProvider; runs test suite on start |
| `bin/tester-service.json` | Service registry (points to `services/v1/*.js`) |
| `bin/services/v1/service1.js` | Returns current timestamp after 500ms |
| `bin/services/v1/service2.js` | Calls service1, returns both timestamps |
| `.env` | `TI_INSTANCE_NAME=ti-tester-service`, `TI_INSTANCE_CLASS`, `TI_INSTANCE_CONFIG`, `TI_LOCALIZATION_LABELS_PATH` |
| `Dockerfile` | **CI's `docker-build` target** since CA-120 — multi-stage `node:24-alpine`, workspace install scoped with `--workspace @ti-engine/tester --include-workspace-root`, running `core`'s `bin/start-instance.js`. No `HEALTHCHECK`: the tester serves no HTTP, so there is nothing to probe — the framework's `bin/healthcheck.js` is for `TiWebServer` applications |

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
- **`web-content` is pre-1.0**, so breaking changes land inside `0.x` — marked `!` on the commit and called out as **BREAKING** in the changelog body (e.g. the 0.2.0 path-decoding change) rather than forcing a major bump. Note that `web-framework` did the same for the 1.19.0 `/static` cache default: a `fix(web-server)!` inside a minor bump, because the framework is the one deciding the default.
- **A version bump is the whole release ritual.** Bumping a package's `version` plus its `## Version X.Y.Z` changelog section is what `npm-publish.yml` acts on when the change lands on `master`. There is no container pipeline here any more — `cd.yml` left with competence (CA-120).

### Contribution gates on every PR

**How a PR is written, opened and driven is in `CLAUDE.md` → *Pull requests*** (standing authorization to open and
drive one, never to merge; no template by design; every CodeRabbit finding verified against the code before it is
acted on). What follows is only what is specific to *this* repository's gates.

- **`cla.yml` (CLA Assistant)** fails a PR unless every commit author has signed `CLA.md`; the allowlist is
  `Belleal` alone. See the commit-authorship convention above — the fix is to author as the maintainer, not to
  widen the allowlist.
- **CodeRabbit is installed on every PR here; it reviews none of them until asked.** It is configured
  (`.coderabbit.yaml`, profile `ASSERTIVE`) and comments within seconds of a PR opening — but that first comment is
  a *"Trigger review"* checkbox saying the repository "does not receive automatic reviews because it has fewer than
  10 stars". **A review only happens once someone clicks that box or comments `@coderabbitai review`.** Until then
  the PR looks reviewed, because CodeRabbit has visibly commented, and no review has run. Never read that comment,
  or the absence of findings under it, as review evidence. It also occasionally reports it could not clone the
  repository and that the review may be incomplete — treat such a review as partial, not as a clean bill; it has
  said so on more than one PR here, so it is the normal case rather than a one-off.
  <br/>
  **A push while a review is in flight cancels it**, and silently enough to miss: the acknowledgement comment is
  edited in place to *"⚠️ Action not completed — Pull request base or head changed"*, the summary comment reverts
  to the un-triggered checkbox with a fresh Run ID, and no review is ever posted. Nothing announces this as a
  failure. So **trigger the review once the head is final for the round — after the last push, never before one** —
  and if a finding needs a fix, expect to re-trigger after pushing it, because CodeRabbit will not pick the new
  head up on its own. Measured on #153, where the first trigger was lost to exactly this.
  <br/>
  Budget the triggers: the plan allows **one included review per hour**, and the review summary says how many
  remain. Spending one on a head you are about to push over costs an hour, which is the real reason the ordering
  above matters.
  <br/>
  It runs `markdownlint-cli2` over changed markdown. **MD022** (a heading must be surrounded by blank lines) is the
  one that bites documentation edits; only the violations inside your diff get flagged, so a file with pre-existing
  ones is not your problem unless you touch those lines.
  <br/>
  **None of this applies in `Belleal/competence`** — CodeRabbit does not run there at all, so nothing but CI and a
  human reviews a PR in that repository. Do not carry the expectation across.
- CI also runs **CodeQL**, a Debricked vulnerability scan, `lint-and-test` and `docker-build`.
- **Tag pushes are rejected for agent sessions** (HTTP 403 on the tag ref) even though branch pushes succeed, so a
  `<package>-v<version>` release tag — which `npm-publish.yml` creates itself on a successful publish — cannot be
  pushed by an agent session, so a version that published but was not tagged stays in the plan until a re-run
  finishes it.

### Publishing to npm — automatic on merge into `master`

`core`, `web-framework`, `web-content` and `tester` are published by `.github/workflows/npm-publish.yml` on every push to `master`, which in normal use means every merged pull request. **A version bump plus its changelog section is the entire release ritual** — there is nothing to tag or trigger by hand. Every package in this repository is publishable; the one that was deliberately excluded, the `competence` application, has moved to `Belleal/competence` and ships as a container image from its own `cd.yml` there.

- **The plan comes from the registry and the tags, not from the diff.** Each package's declared version is compared against npm; a merge that bumps nothing publishes nothing and skips even the test job. A cancelled run, a hand-published version, or two bumps landing at once all leave the registry right where a diff of the merge commit would be wrong.
- **A release is the version on npm *and* its `<package>-v<version>` tag plus GitHub release.** Only the npm half is irreversible, so a version that published but never got tagged stays in the plan until it has one — a re-run finishes it rather than skipping it forever. `workflow_dispatch` is therefore a safe retry.
- **A version bump with no matching `## Version X.Y.Z` section fails the run before anything is published.** The release notes are built from that section; the plan job is the last point at which failing is free.
- **Authentication is npm trusted publishing (OIDC)** — no `NPM_TOKEN`, and provenance is attached automatically. Each package has a trusted publisher on npmjs.com keyed to the **workflow filename**, so renaming `npm-publish.yml` breaks publishing until those entries are updated. A brand-new package must be published by hand once before a trusted publisher can be added for it.
- **Provenance validates `repository.url`.** A package whose manifest lacks a `repository` block fails to publish with a `422` (this is what caught `tester` 1.3.3). A new package needs `repository` (with `directory`), `bugs` and `homepage` matching the others.
- Actions in every workflow are **pinned to commit SHAs** with the version as a trailing comment; Dependabot's `github-actions` ecosystem keeps them current.
- Dependabot scans from the workspace root only — with npm workspaces that already reaches every `packages/*/package.json` — and its **version updates target `current`**, so bumps arrive through the normal release pull request. Security updates always target the default branch regardless.

---

## Issue Tracking — YouTrack (project `CA`)

Work is tracked in **YouTrack Cloud** — project **`CA`** (`https://belleal.youtrack.cloud`), linked to GitHub `Belleal/ti-engine`. Full conventions, field scheme, and the reconstruction history live in `design/youtrack-backfill-inventory.md` **in the `Belleal/competence` repository** — the file went with the application in CA-120 and has no copy here; the essentials:

- **Structure:** capability **Epics** (`Type: Epic`) own their work. **Nest every feature/task as a `subtask of` its Epic** when one fits — delivered *and* forward/backlog; only truly standalone items stay unparented. Use `relates to` for cross-cutting/supersession links, not epic membership.
- **Fields:** `Type` · `State` · `Stage` · `Priority` · `Version` (enum `v1.0.0`…) · `Shipped` (date). Delivered = `State: Verified` / `Stage: Done`; backlog = `State: Open` / `Stage: Backlog`.
- **Going forward:** start new work as a `CA-###` card under its epic and put the ID in commit messages (e.g. `feat(web-framework): … (CA-123)`) so the GitHub integration links commit ↔ issue. The `CA` project spans both repositories now — framework work here, application work in `Belleal/competence`.
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

1. **Abstract base classes** — never instantiate `ServiceInstance`, `MessageExchange`, `CacheProvider`, `TiWebAppManager` directly; subclass them. Each guards its own constructor with `new.target` and raises `E_GEN_ABSTRACT_CLASS_INIT`; unimplemented methods raise `E_GEN_ABSTRACT_METHOD_CALL` naming the subclass and method.
2. **Singletons via frozen instance** — `CommonMemoryCache` here, and `ConfigService` / `ConfigRegistry` in web-framework, export a single frozen `instance`; access that, don't re-construct. Consumers follow the pattern (competence's `DataManager`, `OrganizationManager` and `CompetenceFramework` are all frozen singletons).
3. **deepFreeze on config** — config/settings are immutable once loaded.
4. **Store-backed config** — a consumer registers config documents with the framework registry and, after `initialize()`, they are served from a versioned, audited store; consumers hot-reload via `onConfigChanged`. File values are bootstrap defaults, seeded **only on first write** — which is why the drift panel exists.
5. **Envelope/payload split** — large message payloads go in a Redis hash; the envelope (metadata) goes in the queue list.
6. **Promise-based, non-blocking** — all service calls return Promises; use async/await (validators here favour explicit Promise chains).
7. **Snapshot isolation** — a long-lived record freezes the configuration it resolved at creation, so later config edits never alter work already in flight (competence's evaluations are the worked example).
8. **`#alias` / exports imports**, **CommonJS**, and the **Alpine CSP constraints** (see Conventions).
9. **One chokepoint per invariant** — enforce a rule at a single place every caller must pass through, then let every surface inherit it: `web-content`'s `repository.resolveVisibility` (all listings/feeds/sitemap/counts/prev-next), competence's `anonymizeEvaluationScores` and `research-consent.filterConsentedEvaluations`. Adding a new query surface should require no new enforcement code.
10. **Fail closed** — an absent guard selects the built-in check, never none (web-content capture admin); an unprovable consent is a visible failure rather than an optimistic pass (competence research-consent); a missing/unrecognised `visibility` is visible to nobody.

---

## When Working on This Codebase

1. **New service (tester)**: add the handler file in `services/v1/` and register it in the `.json` service registry.
2. **Extending the web UI**: subclass `TiWebAppManager`, add an HTML fragment + matching Alpine component; reuse framework CSS primitives; obey the Alpine CSP rules (no inline styles, no `?.`).
3. **Config-management, from a consumer's side**: a consuming application registers a config document (schema + file default + semantic validators + optional composite editor) through `TiWebAppManager.registerConfigDocument` / `registerConfigEditor`. Those seams live here; the documents themselves live in the consumer. Changing either seam is a breaking change for every consumer, so treat the `exports` map and these signatures as API.
4. **Testing**: Node.js built-in `node --test` (no external framework); each package's `test/` directory. `npm test`
   at the root fans out across workspaces — **1051 tests today: core 124, web-framework 524, web-content 403, tester
   none** (it is a runnable service, not a unit-tested one). The three checks that gate a push are in
   `CLAUDE.md` → *Definition of done*: `npm test`, `npm run lint` (0 errors; ESLint's only rule here is
   `no-unused-vars` as a **warning**, so a clean lint is no evidence the house style was followed — read a sibling
   file in `core` instead), and `npm run build:types && npm run check:types`.
5. **Bumping versions**: update the affected package's `package.json` + `CHANGELOG.md`.
6. **Design-first**: for non-trivial work, start from / update the relevant design record — package `design/*.md` or repo-root `docs/superpowers/specs/` (see Conventions) — and land small checkpointed commits. Never commit `.run/*.run.xml` (live creds).
7. **Adding a screen to web-content**: add the section type to `SECTION_TYPES` in `content/schema.js`, a body renderer under `render/editorial/`, and document it in `design/authoring-guide.md` — a type in the schema but in neither the documented nor the deferred list fails the suite. Mount routes only through the `routes/index.js` API (`mountContentRoutes` and friends) on top of the web-framework 1.17.0 seams; never reach into private server state.
8. **The container build**: `packages/tester/Dockerfile` is CI's `docker-build` target. It exists to prove the packages still compose into a bootable service — a regression class unit tests cannot see. It exercises `core` only; the web tier has no container-level coverage here since competence left (CA-120).
9. **Tracking work**: create a `CA-###` card in YouTrack under its epic (features/tasks are `subtask of` their epic; only truly standalone items stay unparented) and reference the ID in commit messages so the GitHub integration links them. See *Issue Tracking — YouTrack* above.
