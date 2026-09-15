---
name: ti-engine
description: "Use whenever working in the ti-engine monorepo (core / web-framework / web-content / tester) or the web-content publishing engine — architecture, package layout, conventions (CommonJS, #alias imports, Alpine CSP, deepFreeze, frozen singletons), web-content's content model and visibility rules, deployment, node --test testing, versioning/changelog, npm publishing, and the YouTrack (CA) delivery process. Orient before answering about or editing ti-engine code. The competence application was extracted to Belleal/competence (CA-120) and has its own skill there."
---

# ti-engine Developer Skill

You are working on the **ti-engine** monorepo — an open-source Node.js microservices framework by Boris Kostadinov. Whenever this skill is invoked, orient yourself fully before answering or making changes.

> **The `competence` HR application used to live here and no longer does.** It was extracted to its own repository, `Belleal/competence`, in CA-120, and carries its own skill. It is still the framework's largest consumer, so it is referenced throughout this document to explain *why* a piece of framework behaviour exists — treat every such mention as a cross-repository reference, not a directory you can open.

**Every package here is Apache-2.0** — see `LICENSE.md`. The repository used to be mixed, with competence under
AGPL-3.0-or-later; that package left, and with it the per-package distinction. When adding a new `.js` file, copy
the header block verbatim from an existing file in the same package.

---

## Monorepo Layout

```
ti-engine/                         npm workspace root (v1.2.10; workspaces = packages/*)
├── packages/
│   ├── core/          v1.11.1     Framework foundation (Redis messaging, lifecycle, utils) + shipped TypeScript declarations
│   ├── web-framework/ v1.32.0     Express server + auth (incl. real local auth) + admin config-management + config drift + Profile/About + ti-charts + role gate + TI_WEB_* env overrides + /health + route seams
│   ├── web-content/   v0.3.1      Content-publishing engine — path-index routing, deny-by-default visibility, SEO documents, feeds, email capture (WIP)
│   └── tester/        v1.3.5      Reference/example service implementation + the docker-build target
├── .github/workflows/             ci.yml (lint/test/build) · codeql-analysis.yml · npm-publish.yml · cla.yml
├── CLA.md · CONTRIBUTING.md       Contributor License Agreement (enforced by cla.yml) + contribution guide
├── LICENSE.md                     The license table — Apache-2.0 for every package
├── docs/superpowers/              specs/ (design records, 2026-07 onward) + plans/ (implementation plans)
├── package.json                   Workspace root; devDeps: ESLint 10 (@eslint/js, @eslint/json, globals), Prettier 3
└── eslint.config.mjs              Flat ESLint config (commonjs, browser+node globals; the @eslint/eslintrc shim was dropped)
```

Dependency direction: `core` is standalone → `web-framework` depends on `core` → **`web-content` depends on both**, and `tester` on `core` alone. Keep framework concerns in `core`/`web-framework` and application concerns in the consumer. Each package has its own independent semver version and `CHANGELOG.md`.

The out-of-repository consumer, `competence`, depends on `core` + `web-framework` by semver range from npm. A breaking change here therefore reaches it only when that range is bumped — which is *after* `npm-publish.yml` has published. That is the regression net this repository lost in CA-120: competence's ~1050-test suite used to run in this workspace on every change.

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
- **Commit as the maintainer, disclose the assist in trailers.** `cla.yml` runs the CLA Assistant on every PR and
  fails it unless each commit author has signed `CLA.md`; the allowlist holds `Belleal` only. The CLA's §1 defines a
  contributor as "the individual … or the legal entity" — an agent is neither and holds no rights to grant, so the
  correct resolution is to author the commit as the maintainer rather than to exempt a bot identity. **Set
  `git config user.name "Boris Kostadinov"` and `git config user.email "kostadinov.boris@gmail.com"` before the
  first commit of a session**, and keep the `Co-Authored-By:` / `Claude-Session:` trailers, which are what record
  the assist. A commit authored as `Claude <noreply@anthropic.com>` fails `CLAssistant` and needs re-authoring
  (`git rebase <base> --exec 'git commit --amend --no-edit --reset-author'`) before the PR can go green.
- **Config shipped in a release does not reach a seeded deployment on its own.** The store writes a file default
  only when a document has never been written, so a competency or setting added in a release is invisible on any
  environment started before it. That is what the **Configuration drift** panel (web-framework 1.24.0 /
  competence 3.20.0) exists to reconcile — never assume a shipped config change is live, and never tell an operator
  to wipe the Redis volume as the remedy.

---

## Package: core (v1.11.1)

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

**Public exports** (`package.json` `exports`): `.` (start-instance), `./tools`, `./cache`, `./exceptions`, `./logger`, `./localization`, `./service-instance`, `./service-consumer`, `./service-provider`, `./definitions` (the shared typedefs).

**Since the skill's last sync (1.9.0 → 1.11.1):**
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

## Package: web-framework (v1.32.0)

**Role**: Express.js web server + authentication layer + a reusable **admin config-management subsystem** for web-facing UIs + a CSP-safe **charting primitive library** (`ti-charts.js`) + the container-deployment surface (`TI_WEB_*` env overrides, `GET /health`) and the **route-registration seams** (1.17.0) a subclass uses to mount its own routes — what `web-content` is built on.

**Key files**:
| File | Purpose |
|------|---------|
| `bin/web-server.js` | `TiWebServer` (extends ServiceConsumer); Express app, middleware stack; applies the `TI_WEB_*` overrides, mounts `GET /health`, hosts the `registerRoute` / `addUnprotectedRoute` seams (1.17.0) and the `/static` cache decision (`resolveStaticCachePolicy` / `staticCacheControlFor`, 1.19.0) |
| `bin/web-app-manager.js` | `TiWebAppManager` **abstract**; HTML fragment rendering, nonces, CSRF, the `registerConfigDocument` / `registerConfigEditor` API, the default `verifyAccess` that enforces a fragment's declared `roles` (1.13.0), and login-page gating to the effective auth methods (1.14.0/1.15.0) |
| `bin/web-server.json` | Server config (host, port, TLS, auth methods, `auth.admins`, `trustedOrigins`) — most fields overridable via `TI_WEB_*`. **`staticCache` defaults deliberately live on the class, not here**: the constructor's `_.merge` merges arrays by index, so a consumer's empty `immutablePaths` could otherwise never clear a default entry |
| `bin/build/post-install.js` | `postinstall` step (refreshes bundled static libs) |
| `components/auth-manager.js` | OpenID Connect (Azure/Google) + local auth; session token generation; `getOAuth2CallbackPath()` + the pure `toCallbackPath( callbackUrl )` (1.18.1) reduce a configured callback to its Express route path |
| `components/authorization.js` | Role checks/guards — `requireRole`, `hasRole`, and the pure `isAccessAllowed(requiredRoles, userRoles)` (1.13.0) backing the fragment gate; backs admin gating |
| `components/session-store.js` | Express session storage |
| `components/web-handlers.js` | Middleware: CSP headers, CSRF validation, auth verification, `healthHandler` (`GET /health`, 1.15.0), `originRefererValidationHandler` (reconstructed origin **or** a configured trusted origin, 1.16.0), error formatting (`resolveHttpCode` derives 4xx from the exception family when no explicit `httpCode`: `E_WEB_*`/`E_APP_*`→422, `E_SEC_*`→403, not-found→404, already-exists→409, method/content→405/415; only internal/comm/unknown stay 500) |
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
| `test/*.test.js` | `node --test` suites for the config subsystem + authorization + `ti-charts` (layout math + render structure) + the serving/deployment surface (`web-server-env-overrides`, `web-server.static-cache`, `web-server.route-seams`, `web-server.unprotected-routes`, `web-handlers.health`, `web-handlers.origin`, `web-app-manager.auth-visibility`, `auth-manager`) |

**Public exports**: `./config-management` (config-service), `./web-application` (web-app-manager), `./web-server`, `./definitions`.

**Since the skill's last sync (1.25.1 → 1.32.0):**
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
- `TI_WEB_AUTH_ADMINS` — admin allowlist; replaces `auth.admins`, matched against the session user's user ID, username, or email (1.18.0)
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
| `test/*.test.js` | `node --test` — 17 suites (schema, loader, repository, taxonomy, transliterate, markdown + markdown-editorial, document, html, page, feeds, media, capture, sources, content-routes, routes-index, routes-not-found) |

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

- **`cla.yml` (CLA Assistant)** fails a PR unless every commit author has signed `CLA.md`; the allowlist is
  `Belleal` alone. See the commit-authorship convention above — the fix is to author as the maintainer, not to
  widen the allowlist.
- **CodeRabbit** reviews each PR and runs `markdownlint-cli2` over changed markdown. **MD022** (a heading must be
  surrounded by blank lines) is the one that bites documentation edits; only the violations inside your diff get
  flagged, so a file with pre-existing ones is not your problem unless you touch those lines.
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

1. **Abstract base classes** — never instantiate `ServiceInstance`, `MessageExchange`, `TiWebAppManager` directly; subclass them.
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
4. **Testing**: Node.js built-in `node --test` (no external framework); each package's `test/` directory. `npm test` at the root fans out across workspaces; `npm run lint` runs ESLint over everything.
5. **Bumping versions**: update the affected package's `package.json` + `CHANGELOG.md`.
6. **Design-first**: for non-trivial work, start from / update the relevant design record — package `design/*.md` or repo-root `docs/superpowers/specs/` (see Conventions) — and land small checkpointed commits. Never commit `.run/*.run.xml` (live creds).
7. **Adding a screen to web-content**: add the section type to `SECTION_TYPES` in `content/schema.js`, a body renderer under `render/editorial/`, and document it in `design/authoring-guide.md` — a type in the schema but in neither the documented nor the deferred list fails the suite. Mount routes only through the `routes/index.js` API (`mountContentRoutes` and friends) on top of the web-framework 1.17.0 seams; never reach into private server state.
8. **The container build**: `packages/tester/Dockerfile` is CI's `docker-build` target. It exists to prove the packages still compose into a bootable service — a regression class unit tests cannot see. It exercises `core` only; the web tier has no container-level coverage here since competence left (CA-120).
9. **Tracking work**: create a `CA-###` card in YouTrack under its epic (features/tasks are `subtask of` their epic; only truly standalone items stay unparented) and reference the ID in commit messages so the GitHub integration links them. See *Issue Tracking — YouTrack* above.
