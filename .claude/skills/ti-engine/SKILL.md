---
name: ti-engine
description: "Use whenever working in the ti-engine monorepo (core / web-framework / web-content / competence / tester), the competence HR appraisal app, or the web-content publishing engine — architecture, package layout, conventions (CommonJS, #alias imports, Alpine CSP, deepFreeze, frozen singletons), the competence data model and enum gotchas, web-content's content model and visibility rules, deployment (Docker, ghcr.io, Cloud Run), node --test testing, versioning/changelog, and the commit-bundling + YouTrack (CA) delivery process. Orient before answering about or editing ti-engine code."
---

# ti-engine Developer Skill

You are working on the **ti-engine** monorepo — an open-source (GPL-3.0) Node.js microservices framework by Boris Kostadinov, plus the **competence** HR application built on top of it. Whenever this skill is invoked, orient yourself fully before answering or making changes.

---

## Monorepo Layout

```
ti-engine/                         npm workspace root (v1.2.7; workspaces = packages/*)
├── packages/
│   ├── core/          v1.8.0      Framework foundation (Redis messaging, lifecycle, utils)
│   ├── web-framework/ v1.19.0     Express server + auth + admin config-management + ti-charts + role gate + TI_WEB_* env overrides + /health + route seams
│   ├── web-content/   v0.2.0      Content-publishing engine — path-index routing, deny-by-default visibility, SEO documents, feeds, email capture (WIP)
│   ├── competence/    v3.16.0     HR competency appraisal application (108-competency dictionary); ships as a container image
│   └── tester/        v1.3.3      Reference/example service implementation
├── .github/workflows/             ci.yml (lint/test/build) · cd.yml (competence image → GHCR + Artifact Registry) · codeql-analysis.yml
├── docker-compose.yml             Dev stack for competence (app + Redis Stack); dev flags + throwaway secrets — never production
├── docs/superpowers/              specs/ (design records, 2026-07 onward) + plans/ (implementation plans)
├── package.json                   Workspace root; devDeps: ESLint 10 (@eslint/js, @eslint/json, globals), Prettier 3
└── eslint.config.mjs              Flat ESLint config (commonjs, browser+node globals; the @eslint/eslintrc shim was dropped)
```

Dependency direction: `core` is standalone → `web-framework` depends on `core` → **`competence` and `web-content` each depend on both and never on each other** (two sibling applications of the same framework: competence is a protect-by-default internal app, web-content a public-by-default site engine). Keep framework concerns in `core`/`web-framework` and application concerns in the consumer. Each package has its own independent semver version and `CHANGELOG.md`.

Node: the workspace root and `competence` require **`>=20.19.0`**; `core` and `web-content` require `>=20.12` (core because of native `process.loadEnvFile`, adopted in core 1.7.0); `web-framework` declares `>=20`. Develop on ≥20.19 to satisfy all of them.

Branches: `current` is the active feature branch; `master` is the release branch (PR target).

---

## Conventions & Constraints (read before editing)

- **CommonJS everywhere** — `"type": "commonjs"`; use `require()` / `module.exports`.
- **Internal imports use `#alias`** from each package.json `imports` map (e.g. `#configuration-loader`, `#config-competencies`), not relative paths. Cross-package imports use the `exports` map (e.g. `@ti-engine/core/tools`, `@ti-engine/web-framework/config-management`).
- **Alpine.js runs in CSP mode** — in the `web-framework` shell and the `competence` UI (**not** `web-content`, which is server-rendered HTML plus one vanilla script). In HTML Alpine expressions: **no inline `style="..."` attributes** (CSP forbids them — use CSS classes) and **no optional chaining (`?.`)** (the CSP expression evaluator rejects it). `Array`, `Object`, etc. are also unavailable inside template expressions — use the `tiApplication.hasRole(...)`-style JS helpers instead of `Array.isArray(...)` inline.
- **Design-first cadence.** Non-trivial features start from a design record (meta header + running implementation log) and land as small, checkpointed Conventional-Commit steps. **Look in two places:** the owning package's `design/` directory (the older convention, still where competence's shipped feature records and all content source-of-truth docs live) and the repo-root `docs/superpowers/specs/` + `plans/` (the convention from 2026-07 onward).
- **Some committed files are generated — regenerate, don't hand-edit.** The competence Help fragments (`bin/static/fragments/guide/`) come from `npm run build:guide`, and archetype-derived relevancy data from `bin/build/build-competency-relevancy.js`. A stale generated fragment fails `test/user-guide-build.test.js`.
- **Never promise `immutable` for a URL that isn't content-addressed** — a lesson learned the hard way in both `web-framework` 1.19.0 and `web-content` (browsers honour `immutable` through a manual reload, so a shipped fix never reaches a returning visitor).
- **`.run/*.run.xml` are git-tracked but carry live local credentials** in the working tree — never commit changes to them.
- **deepFreeze on config** — once settings/config are loaded they are immutable; never mutate them in place.

---

## Package: core (v1.8.0)

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

## Package: web-framework (v1.19.0)

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

**Public exports**: `./config-management` (config-service), `./web-application` (web-app-manager), `./web-server`.

**Config-management subsystem** (the reusable machinery; competence is its first consumer):
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

**Charting primitives** (`bin/static/scripts/ti-charts.js`, added 1.10.0 — backs the competence Statistics & Results reporting):
- A single `renderChart(figure, spec)` dispatcher over a `{ type, data, options, a11yLabel, provisional }` spec; eight `type`s: `gauge`, `bars` (modes `stacked`/`grouped`/`diverging`), `stat`, `scatter`, `heatmap` (scales `sequential`/`diverging`), `box`, `radar`, `line` (mean + p25–p75 band, `sparkline`, stacked, `provisionalLastPoint` dashed trailing segment). Grouped `bars` and `radar` take optional legends + value labels, and `radar` optional per-axis tones (1.12.0).
- **Pure layout helpers are unit-tested in isolation** (`gaugeArcPath`, `barSegments`, `scatterLayout`, `heatmapLayout`, `boxLayout`, `radarLayout`, `lineLayout`, …) — add a new primitive by adding its layout + render + a `SUPPORTED_TYPES` entry + a dispatch case, mirroring an existing pair.
- **CSP discipline (enforced by tests):** build SVG with `createElementNS` + `setAttribute` only — **never** `element.style.*` except `setProperty("--var", …)`; every chart ships a visually-hidden `.ti-chart-sr` table; interactivity via `addEventListener` (the `ti-chart:select` CustomEvent).
- Bind from Alpine with the `x-ti-chart="someSpec"` directive on a `<figure class="ti-chart">`; per-type size caps come from `figure[data-ti-chart-type]` CSS (set by `renderChart`). Tones use `--chart-seq-1…5` + grade colours in both themes.

**ENV variables (web-framework)** — applied by `applyWebConfigEnvOverrides`; every list-valued one **replaces** the configured array (an explicitly empty value means "none"):
- `TI_WEB_HOST` / `TI_WEB_PORT` / `TI_WEB_USE_TLS` / `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` / `TI_WEB_COOKIE_SECRET` — binding, TLS, session-cookie secret (1.14.0)
- `TI_WEB_AUTH_METHODS` — enabled auth methods (`local`, `openid-google`, `openid-azure`); replaces `auth.enabledMethods` (1.15.0)
- `TI_WEB_TRUSTED_ORIGINS` — extra accepted `Origin`/`Referer` values for state-changing requests behind a proxy that doesn't present the external host (1.16.0)
- `TI_WEB_AUTH_ADMINS` — admin allowlist; replaces `auth.admins`, matched against the session user's user ID, username, or email (1.18.0)
- `TI_WEB_STATIC_MAX_AGE` / `TI_WEB_STATIC_IMMUTABLE` / `TI_WEB_STATIC_IMMUTABLE_PATHS` — the `/static` `Cache-Control` policy (1.19.0)
- `TI_WEB_APP_STATIC_CACHE_DISABLED` — **unrelated to the three above**: turns off the app manager's *in-process* memoization of read fragment/static file contents (`#locateStaticFile`), not any HTTP cache header

---

## Package: web-content (v0.2.0 — WIP)

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

## Package: competence (v3.16.0)

**Role**: Complete HR application for competency-based performance appraisals. Models competencies in three dimensions — **Role Family × Specialization × Stage-Level** — with a first-class appraisal **Cycle** (`PLANNING → ACTIVE → CLOSED`). Evaluations snapshot their resolved competency set at creation so later configuration drift never affects in-flight evaluations. Depends on `core` + `web-framework`; uses `graphology` for the org graph, and `marked` as a **build-time devDependency** (Help-screen generation only — not a runtime dep). Node `>=20.19.0`. Ships as the container image `ghcr.io/belleal/ti-engine-competence` (also mirrored to Artifact Registry) and deploys to a scale-to-zero Cloud Run test environment — see *Deployment* below.

**v3.0.0 = the 108-competency content rebuild** (from the prior 164): SE 31, BA 22, PM 25, plus 30 shared canonical, regenerated from the source-of-truth docs in `design/`. Six families (QE/XD/DA/IO/MC/PD) are defined but unpopulated. This was a content replacement — config shapes, schemas, and framework logic were unchanged — but old competency codes were dropped/renumbered, so stored evaluations keyed by old codes need migration.

**Relevancy model**: per-family competency importance is expressed via **editable archetype curves** in `config.relevancy-archetypes.json` plus a per-competency `relevancyArchetype` pointer. (This superseded the earlier materialized `config.competency-relevancy.json`, which no longer exists.) `bin/build/build-competency-relevancy.js` is the re-runnable generator/expander for archetype-derived data.

**Competency pool** (restored in 3.1.0 as `config.role-family-competencies.json`, shape `{ <family>: [codes] }`): the per-family *applicability universe* — which competencies a family may draw on. Populated families carry family-specific + the 30 shared canonical (SE 61 / BA 52 / PM 55); the six unpopulated families carry the 30 shared only. The **pool** (which competencies *can* apply to a family) is distinct from **relevancy** (how much each *matters*, which is global via archetypes). The `build-competency-relevancy.js` generator emits both from `design/competency-relevancy-model.md`. The pool backs the `pool-membership` lock rule and scopes the Cycle Setup competency picker; it is registered as a store-backed, exportable/restorable config document (read-only — no inline editor yet).

**Team feedback & dashboard tasks (3.3.0)**: team members discover pending peer reviews as derived **dashboard tasks** (`application/task-resolver.js` — pure, org lookups injected); a manager — or a Supervisor via a read-only **facilitator** view — can `finalizeTeamFeedback` after a **cycle-level** team-feedback deadline (`cycle.teamFeedbackDeadline`, defaulted from `teamFeedbackWindowDays` and editable in Cycle Setup). Finalize records an evaluation-scoped audit entry; once an evaluation reaches `Ready` the employee sees the manager grade + team cumulative while individual peer grades stay anonymous.

**Statistics & Results reporting (3.4.0, CA-61 — design `design/completed/statistics-and-results.md`)**: a competency-analytics layer over the appraisal data. `application/results-analytics.js` is a pure frozen-singleton — it builds a `CohortRow[]` frame from evaluations, computes the reports, and resolves **live (active cycle) vs snapshot (closed cycle)** via `resolve()`/`_resolveWith()`. On cycle close, `#closeCycle → persistResultsSnapshot` writes an **immutable, anonymized per-cycle `ResultsSnapshot`** (the **eighth** `data-manager` cache key `ti:competence:data:results-snapshots`; accessors `saveResultsSnapshot`/`getResultsSnapshot`/`getAllResultsSnapshots`) carrying only counts/means/percentiles + a stable cross-cycle substrate — **never identities or peer-individual grades, and never back-fillable** (`schemaVersion` 2). **Privacy invariant: every cohort cell with `n < MIN_COHORT_SIZE` (3) is suppressed at aggregation time.** The Insights screens (Manager/Supervisor): **Cycle** + **Team** analytics (six reports — coverage, time, alignment, heatmap, level, drivers — Team re-scoped to a subtree via `isSuperiorManagerOfEmployee` + grader calibration), **individual results** (the evaluee's READY/CLOSED view + self-scoped "My Scores"; the client decomposition reconciles exactly to the server score), and **cross-cycle Trends** (Supervisor: overall/gap-closure/ladder/cohort over `getAllResultsSnapshots()`, legacy-tolerant) + a per-employee history line (access-gated, raw evals). Charts use the web-framework `ti-charts.js` primitives; each report carries a labels-sourced methodology block (en/bg).

**Org-derived roles & Supervisor grants (3.6.0, CA-72)**: a user's `EMPLOYEE`/`MANAGER`/`SUPERVISOR` roles are **derived from org-chart position at login** (everyone is EMPLOYEE; a unit's manager is MANAGER; the top manager plus any direct report heading a ≥2-level sub-org is a *structural* SUPERVISOR) instead of being manually injected. A structural Supervisor can additionally **grant** the Supervisor role to others from Employee Management — an audited, Redis-persisted grant (`ti:competence:data:role-grants`) with a synchronous in-memory mirror consulted at login; structural roles are immutable and merely-granted Supervisors cannot manage roles. Peer-reviewer eligibility (`OrganizationManager.isEligibleTeamReviewer`, 3.5.0/CA-71) excludes the evaluatee and their whole management chain and scopes the New-Evaluation team picker.

**Role-based screen access (3.8.0, CA-74/75)**: every role-restricted screen declares a `roles` requirement on its registered fragment; the web-framework default `verifyAccess` (≥1.13.0) enforces it, so a screen's chrome can no longer be fetched by direct URL by a role that cannot use it (rejected `E_SEC_UNAUTHORIZED_ACCESS` 403). Sidebar entries are hidden to match, and admin editor screens gate on the `admin` role. The per-screen `#requireRole(...)` **data** gates remain the source of truth for the data behind each screen.

**Evaluation / Scores screen split (3.9.0, CA-76)**: the grading screen (`competence-evaluation`) no longer renders full results — it shows a compact final-score panel plus a *results-are-ready* bar linking to the read-only **Scores** screen. Scores is the `my-results` route (it reuses the evaluation fragment in results-only mode): *My Scores* for the evaluee, *{name}'s Scores* / *Performance Scores* for an authorized manager/supervisor (`#loadResults(session, employeeID)` — org-superior or supervisor; employee-level anonymization for every viewer). Uses web-framework `setScreenTitle` (≥1.13.0) so a manager's view isn't titled *My …*.

**Dashboard interview tasks (3.10.0, CA-77)**: `task-resolver.js` also derives interview tasks from `READY` evaluations — a Supervisor's aggregate `interview-schedule` (count of READY evals with no booked slot) and `interview-scheduled` self/manager notifications once a slot is booked. The manager notification targets the **owner of the booked calendar slot** (the actual interviewer, resolved from the active cycle's booked slots in `#loadDashboard`), **not** the reporting line — so a stand-in covering an absent manager is notified while non-participant superiors are not. `#loadDashboard` fetches the whole-cycle slots only for MANAGER/SUPERVISOR.

**Interview meeting outcome & formal closure — Step 8 (3.11.0, CA-78 — design `design/interview-closure.md`)**: the appraisal's final step. On a `READY` evaluation the **conducting manager** (the booked calendar slot's owner), an **org-line superior**, or the **Supervisor** records the interview outcome via `recordInterviewOutcome` — written feedback, up to `numberOfNextPeriodGoals` next-period goals, and an optional Performance Improvement Plan (interview-held precondition: `interviewDate` set and `<= today`, tightened in CA-85) — and the **Supervisor** then formally closes it via `closeEvaluation` (`READY → CLOSED`, irreversible) once the interview has been held and an outcome recorded. Grades stay immutable; a nested `closure` object (`feedback`, `goals[]`, `pip{required,plan}`, `closedAt`, `closedBy`) holds the artifacts, revealed to the employee on the Scores screen only at `CLOSED`. New services `save-interview-outcome` / `close-evaluation`; the Interview Schedule screen is now the interviews **hub** (schedule → record outcome → close); new dashboard tasks `interview-close` (Supervisor aggregate) + `evaluation-closed` (evaluee, 14-day window); the cycle-close modal warns about not-yet-closed evaluations.

**Feedback capture & anonymization fix (3.11.1, CA-88/CA-89)**: the evaluation screen's three Written Feedback textareas (self / manager / team) silently dropped input — they bound a never-dispatched `ti-input` event; switched to the native `@input` event. Also closed a data-exposure in `anonymizeEvaluationScores`: the employee now receives the manager's written `managerComment` only at `READY`/`CLOSED` (mirroring the manager-grade reveal) and **never** the raw anonymous `teamComments` (only the team *cumulative grade* is shown). Guard test `test/fragment-input-bindings.test.js` added.

**Deadline governance & manual stall recovery (3.12.0, CA-59 — design `design/deadline-governance.md`, status *Implemented*)**: closes the three ways an appraisal could stall forever — with **no scheduler, no notification channel, and no automatic skipping of anyone's judgement**; every recovery is a manual, reason-justified, audited action. `createNewEvaluation` now populates `workflow.selfEvaluationDeadline` / `managerEvaluationDeadline` from the cycle's own dates (self = `teamFeedbackDeadline || cycleDate`, manager = `cycleDate`), which activates four late-submit guards that had been **dead code** because both fields were hard-coded `""` and never written. `backfillMissingEvaluationDeadlines()` — invoked once in `onStart` — stamps the same cycle-derived deadlines onto pre-existing `Open`/`In Review` evaluations; it fills only an empty field (so re-running is a no-op), never touches `Closed`/`Deleted`, skips an evaluation whose cycle can't be resolved (DEBUG log, not a startup failure), and writes **no** audit entries because it is a system migration rather than a user action. Two Supervisor-only, reason-required, audited escapes: **`finalizeSelfEvaluation`** waives a stalled self round once its deadline has passed (`Open → In Review`, or held open awaiting the team round) and persists `workflow.selfEvaluationWaived` so a repeat waiver is rejected and a self round waived while the team round is still pending advances on team completion instead of re-stalling; **`withdrawEvaluation`** cancels any `Open`/`In Review`/`Ready` evaluation to `Deleted` (irreversible, releases a booked interview slot, immediately frees the employee for a new evaluation) — before this, `DELETED` was in the enum and handled read-side but **no code path ever wrote it**, so a mistaken evaluation bricked the employee's whole cycle. The **manager** deadline is a nudge, not a block: a late manager submit is never rejected (blocking the decisive 50% input would just create a new stall), and a Supervisor may proxy-complete the manager grades on an `In Review` evaluation with a reason (audited `grades.managerProxy`, captured in the submit-confirmation modal) while an org-line superior needs none. `task-resolver.js` derives the Supervisor aggregates `overdue-self` / `overdue-manager`, both deep-linking to the new SUPERVISOR-only **Evaluations Oversight** screen (`load-evaluations-oversight` + `frame-evaluations-oversight.html`) — the cockpit for all three actions, listing the active cycle's in-progress evaluations with overdue badges behind a shared reason modal.

**Containerized deployment & CI/CD (3.13.0–3.13.3, CA-90/91 — spec `docs/superpowers/specs/2026-07-16-competence-docker-cicd-design.md`)**: the app ships as **`ghcr.io/belleal/ti-engine-competence`** (`:X.Y.Z` from a `competence-v*` git tag, `:latest`, `:edge` = master tip) built by a multi-stage `node:22-alpine` `Dockerfile` (workspace install → web-framework `postinstall` → minimal **non-root** runtime), with baked `TI_INSTANCE_*` defaults, **`TI_WEB_AUTH_METHODS=openid-azure`** since 3.13.3 (Azure SSO default; the placeholder `local` credentials auth is off) and a `HEALTHCHECK` on `GET /health` rather than the user-facing `/login`. The repo-root `docker-compose.yml` is the **dev** stack (app + Redis Stack, `local` auth, throwaway secret defaults, `COMPETENCE_PRELOAD_DATA` / `TI_WEB_TRUSTED_ORIGINS` passthrough) — explicitly *not* for production. **`INSTALL.md`** is the sys-admin installation & operations guide (17 sections: image/tags, the Redis-with-JSON requirement, env reference, secrets, TLS proxy, four installation methods, first run, health, verification, upgrades, backup, troubleshooting). 3.13.1/3.13.2 (CA-91) hardened employee field-path traversal against prototype pollution — a shared `assertSafeFieldPath()` **plus** inline `__proto__`/`constructor`/`prototype` guards adjacent to each access/write (CodeQL doesn't recognise an interprocedural sanitizer, so the alerts stayed open until the guards sat at the sink); unsafe paths are rejected 422 either way.

**End-user documentation — guide + in-app Help (3.14.0, CA-92 — spec `docs/superpowers/specs/2026-07-24-competence-user-guide-design.md`)**: nine markdown chapters under **`docs/user-guide/en/`** (package-relative: `packages/competence/docs/user-guide/en/`, `01-overview` … `09-faq-glossary`) are the single source. `bin/build/build-user-guide.js` (`npm run build:guide`; `marked` pinned as a **build-time devDependency**) generates one **committed** static fragment per chapter into `bin/static/fragments/guide/frame-help-*.html` with chapter nav, prev/next and a version stamp — raw HTML, images, relative or non-`http(s)` links, inline styles and scripts are **build errors** (CSP discipline). The nine Help screens are public; `frame-process-guide.html` is a hand-authored walkthrough of the eight appraisal steps with role badges, the status lifecycle and deep links into the chapters. Both sidebar Quick Links ("Process Guide", "Help") were disabled placeholders until now and are live. Freshness, wiring and CSP guards live in `test/user-guide-build.test.js` — **regenerate and commit** the fragments when a chapter changes, or that suite fails.

**Research-use consent (3.15.0, CA-93 — spec `docs/superpowers/specs/2026-07-27-competence-research-consent-design.md`)**: employees are asked **once per appraisal cycle** whether their anonymized evaluation data may be used for analysis and research, recorded as a provable electronic consent. **Scope matters:** in-app Insights and the per-cycle `ResultsSnapshot` are unchanged — they run on *legitimate interest* and continue to cover every employee; consent gates **secondary research use only**. `application/research-consent.js` is a pure frozen-singleton owning every rule: SHA-256 statement hashing (`hashText`), **self-attested** record construction (`decidedBy` must equal the subject), newest-wins `resolveEffective`, the submit gate `requireDecision`, an exact-match no-op guard (`isNoOpDecision`) so a repeated answer writes no duplicate, the per-cycle `buildConsentRegister`, and the fail-closed export chokepoint `filterConsentedEvaluations`. The store-backed **`research-consent` config document** makes the statement admin-editable per locale (en/bg) with a `consentTextVersionBumped` semantic validator forcing the version to move whenever a body changes (this is the validator that needed web-framework 1.17.1's `getStoredConfig`), plus `enabled: false` as a fail-closed kill switch. The append-only store is the **tenth** `data-manager` cache key `ti:competence:data:research-consent` — records keyed by `recordID` so an append is a single merge-patch with no lost-update race, a hash-keyed registry holding each verbatim statement once, and an employee-scoped audit entry per decision; unlike role-grants it **rejects rather than resolving optimistically when the cache is unavailable**, because an unprovable consent is worse than a visible failure. The decision is captured at self-evaluation submit (mandatory when enabled, both answers proceeding identically, written before the evaluation persists, idempotent on retry) and is changeable at any time — including after `Closed` — from the Scores screen. The Supervisor **consent register** (`frame-consent-register.html`) shows per-employee evidence including superseded answers, gated on `SUPERVISOR` rather than `admin` because the rows are personal data, not configuration.

**Hosted test environment on Google Cloud Run (3.16.0, CA-94 — spec `docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`)**: a shared test environment that costs approximately nothing when idle — a single Cloud Run instance holding the app plus a `redis:8-alpine` sidecar, with Redis snapshotting onto a mounted Cloud Storage bucket so cycles, evaluations and feedback are *intended* to survive scale-to-zero. **Treat that durability as unproven**: the snapshot-to-object-storage path is unverified against a live deployment, and `INSTALL.md` **Method D** documents the loss window it carries, along with the cold-start cost, the IAP coupling and the locked-out recovery procedure. **Identity-Aware Proxy** fronts it with an email allowlist and the app itself is **Google-sign-in only** there (a different posture from the image's Azure default). `deploy/gcp/` holds the artifacts: `service.yaml` (the Cloud Run manifest — placeholder tokens substituted by the script, never applied directly, never a secret value), the one-time idempotent `bootstrap.sh` (every step probes for existing state; secrets are generated by `openssl` straight into Secret Manager and never printed; `SKIP_BUDGET=1` / `BUDGET_NAME` defer to a budget you already own) and `deploy.sh`, **both supporting `DRY_RUN=1` to preview every command without touching the cloud**, plus `README.md` (operator overview) and `WALKTHROUGH.md` (first-time setup). CD publishes the image to **Artifact Registry alongside GHCR from a single build**, authenticated with **Workload Identity Federation** (no stored credentials), and excludes `**/deploy` from the build context. Note the two enabling framework fixes: `TI_WEB_AUTH_ADMINS` (1.18.0) so a container can name an admin at all, and the absolute-callback-URL crash fix (1.18.1/CA-97) that `deploy.sh`'s patched-in callback depends on.

**Key files**:
| File | Purpose |
|------|---------|
| `application/competence-framework.js` | Singleton (`module.exports.instance`); `getActiveCompetencySet`, `buildEvaluationSnapshot`, `validateCycleForLock`, `lockCycle`, `closeCycle`, `finalizeTeamFeedback`, `calculateTeamCumulativeGrades`, `calculateFinalEvaluationScores` (**renormalizing** since 3.12.0), `recordInterviewOutcome`, `closeEvaluation`, `finalizeSelfEvaluation` / `withdrawEvaluation` / `backfillMissingEvaluationDeadlines` (3.12.0), `buildCompetenciesTreeFromSnapshot`, `generateShortID` |
| `application/configuration-loader.js` | Loads config JSONs; exports frozen config objects + enums; helpers `getSpecializationCodes`, `getStageLevelCodes`, `getStageLevelLadder`, `getArchetypeStageLevels`, `getSetting`; `initialize(service)` brings the store-backed configs under admin-config control |
| `application/config-registration.js` | Registers competence config documents + composite editors with the framework registry (`registerCompetenceConfig`) |
| `application/config-editors.js` | Composite (entity) editors: `competency-text`, `archetype-assignment`, `relevancy-archetype`, `role-families` |
| `application/config-validators.js` | Semantic validators (Promise-chain style; `ValidationIssue` / `ValidatorContext` typedefs) incl. floor-coverage, cap, pool-membership (`activeSetsWithinPool` / `poolReferenceIntegrity`), and referential-integrity guards |
| `application/data-manager.js` | Singleton; CRUD over **ten** `ti:competence:data:*` cache keys (Redis JSON) — role families, cycles, active sets, calendars, employees, evaluations, audit log, **results-snapshots** (8th), **role grants** (9th), **research-consent** (10th). `initialize()` creates each collection only when absent (`setJSON` NX), so existing data survives a restart |
| `application/organization-manager.js` | Singleton; directed graph (graphology) for org chart; resolves manager + role-family attributes, `resolveOrganizationUnitName`, `getOrganizationUnitSubtree`, `isSuperiorManagerOfEmployee`, `isEligibleTeamReviewer`, and the org-derived role helpers (unit-manager / auto-supervisor — CA-72) |
| `application/task-resolver.js` | Pure singleton; derives dashboard **tasks** (`team-feedback` / `team-finalize`; `interview-schedule` / `interview-scheduled` self/manager — 3.10.0; `interview-close` / `evaluation-closed` — 3.11.0; the Supervisor aggregates `overdue-self` / `overdue-manager` — 3.12.0) from evaluation/workflow state with injected org lookups — persistence-free and unit-tested (3.3.0; seed for the future web-framework tasks module) |
| `application/results-analytics.js` | Pure frozen-singleton (3.4.0); cohort-frame + report computes, the live/snapshot `resolve()`, `buildResultsSnapshot`/`persistResultsSnapshot`, `computeTrend` (cross-cycle), `buildEmployeeHistory`. See *Statistics & Results reporting* above |
| `application/research-consent.js` | Pure frozen-singleton (3.15.0) owning every research-consent rule — `hashText`, record construction, `resolveEffective`, `requireDecision`, `isNoOpDecision`, `buildConsentRegister`, `filterConsentedEvaluations`. See *Research-use consent* above |
| `application/data-objects.types.js` | Shared JSDoc typedefs for data objects |
| `bin/competence-web-server.js` | Main entry point (extends ServiceConsumer); `onStart` initializes data-manager → org chart → role grants → `configurationLoader.initialize()` → `backfillMissingEvaluationDeadlines()` (3.12.0) |
| `bin/competence-web-application.js` | UI renderer (extends TiWebAppManager); registers config via `registerCompetenceConfig`; serves all fragments |
| `bin/build/build-competency-relevancy.js` | Re-runnable generator for archetype-derived relevancy data + archetype labels |
| `bin/build/build-user-guide.js` | `npm run build:guide` — generates the nine **committed** Help fragments from `docs/user-guide/en/*.md`; raw HTML, images, relative/non-`http(s)` links, inline styles and scripts are build errors (3.14.0) |
| `bin/config/config.application.json` | App settings under `performanceAppraisals` (weights, thresholds, `activeCompetencySetCap`, interview calendar) + `config.application.schema.json` |
| `bin/config/config.competencies.json` | Competency dictionary — categories E/I/C × subcategories, scope/relevancy per stage-level, optional `eCFMapping` |
| `bin/config/config.relevancy-archetypes.json` | Editable archetype curves (keyed by flattened stage-levels) |
| `bin/config/config.research-consent.json` | The research-consent statement per locale (en/bg) + `enabled` kill switch; store-backed, admin-editable, version-bump enforced (3.15.0) |
| `bin/config/config.role-families.json` | Nine families (`SE`,`QE`,`BA`,`PM`,`XD`,`DA`,`IO`,`MC`,`PD`) with permitted specializations |
| `bin/config/config.role-family-competencies.json` | Per-family competency **pool** (applicability universe) `{ <family>: [codes] }`; backs `pool-membership` lock rule + Cycle Setup picker (restored 3.1.0) |
| `bin/config/config.active-competency-sets.json` | Baselines + specialization extensions, keyed `family → "baseline"|<SPEC> → cycleID → [codes]` (seed populates per-family baselines for `2026-H2`) |
| `bin/config/config.stage-levels.json` | The ladder (see below) |
| `bin/config/config.organization-structure.json` | Org-chart hierarchy; managers inferred via unit-walk |
| `bin/data/schemas/` | JSON schemas for config + seed validation (incl. `relevancy-archetypes.schema.json`) |
| `bin/data/seeders/` | Demo seed data merged on startup while `COMPETENCE_PRELOAD_DATA=true` — **non-destructive** (collections are only initialized when empty, so your data persists), but the seed is **re-applied on every boot** while the flag is on, so set it back to `false` once seeded |
| `bin/localization/competence-labels.json` | en/bg labels for every user-visible string (incl. a `relevancy-archetype` label section; BG pending native review) |
| `bin/static/scripts/competence-user-interface.js` | Alpine components for all screens (calls the framework `/admin/config/*` API for admin screens) |
| `bin/static/scripts/competence-main.css` | App-specific styles layered on the framework primitives |
| `Dockerfile` | Multi-stage `node:22-alpine` image — non-root, Azure-SSO default, `HEALTHCHECK` on `GET /health`; **built from the repo root as context** (3.13.0+) |
| `INSTALL.md` | Sys-admin installation & operations guide — image/tags, Redis, env reference, TLS proxy, installation Methods A–D (Compose / standalone / Kubernetes / **Cloud Run**), health, upgrades, backup, troubleshooting |
| `deploy/gcp/` | Cloud Run test environment (3.16.0) — `service.yaml`, idempotent `bootstrap.sh` + `deploy.sh` (both honour `DRY_RUN=1`), `README.md`, `WALKTHROUGH.md` |
| `docs/user-guide/en/*.md` | The nine end-user guide chapters — **single source** for the in-app Help screens (3.14.0) |
| `design/` | Source-of-truth content docs — see below |
| `test/*.test.js` | `node --test` — JSON validation, content integrity, config-management/editors/live, framework resolution/validation/lifecycle/snapshot/finalize/closure/anonymize + **deadlines/backfill/scoring** (3.12.0), task-resolver, organization + role-grants + role-resolver, results-analytics (coverage/reports/snapshot-builder/substrate/persist/trend/history), fragment-input-bindings, the CA-91 guards (`employee-field-path-safety`, `in-memory-cache.proto-pollution`), and `user-guide-build` (3.14.0) |

**UI fragments** (`bin/static/fragments/`): dashboard, employees-list, employee-management, cycles, cycle-setup, competence-evaluation (the grading screen; its **my-results** route reuses the fragment in results-only mode as the read-only **Scores** screen), new-evaluation, manager-calendar, interview-schedule, **evaluations-oversight** (SUPERVISOR-only stall-recovery cockpit, 3.12.0), **consent-register** (SUPERVISOR-only, 3.15.0), **process-guide** + the nine generated `guide/frame-help-*.html` Help chapters (public, 3.14.0); the **Insights** group (Manager/Supervisor): `frame-insights-cycle`, `frame-insights-team`, `frame-insights-trends` (SUPERVISOR-only); plus admin-gated config screens: **admin-config** (landing: export + change feed/restore), **competency-text-editor**, **archetype-assignment**, **archetype-editor**, **role-families**. Role-restricted screens declare a `roles` requirement enforced by the web-framework fragment gate (see *Role-based screen gate*, 1.13.0); admin screens live under an admin-only "Administration" sidebar section.

**Design docs** (`design/`, source of truth for content): `competency-definitions-final.md`, `competency-master-index.md`, `competency-bg-translations.md`, `competency-relevancy-model.md`; completed records are archived under `design/completed/` (the phase-0 inventories, `role-family-pool-restoration.md`, `dashboard-team-feedback-tasks.md`, and `statistics-and-results.md` — the reporting capability's meta + Phases 0–4 implementation log), and the YouTrack backfill log is `youtrack-backfill-inventory.md`. Per-feature design records for shipped work remain in `design/` root — `auto-org-derived-roles.md` (3.6.0), `screen-access-control.md` (3.8.0), `evaluation-scores-split.md` (3.9.0), `dashboard-interview-tasks.md` (3.10.0), `interview-closure.md` (3.11.0), `deadline-governance.md` (3.12.0 — **shipped**, meta status *Implemented*) — not moved to `completed/`. **From 3.13.0 on, new design records live at the repo root under `docs/superpowers/specs/`** rather than in the package: `2026-07-16-competence-docker-cicd-design.md` (CA-90), `2026-07-24-competence-user-guide-design.md` (CA-92), `2026-07-27-competence-research-consent-design.md` (CA-93), `2026-07-29-competence-gcp-scale-to-zero-design.md` (CA-94); implementation plans live alongside under `docs/superpowers/plans/`.

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

**Evaluation weights** (`performanceAppraisals.evaluationWeights`): self ×0.2 + team ×0.3 + manager ×0.5. Collective team mode grades by subcategory (3–5 members). **Since 3.12.0 the score renormalizes to the sources that actually participated** — a source counts only if it submitted ≥1 grade (and a team round finalized with zero submissions does not count), so an absent source no longer silently depresses the result by its own weight. Forward-only: already-stored scores and closed-cycle snapshots are not recomputed.

**Store-backed configs**: `competencies`, `relevancy-archetypes`, `active-competency-sets`, `role-families`, `role-family-competencies` (read-only), `stage-levels` (read-only), `research-consent` (3.15.0 — per-locale statement + `enabled` kill switch, guarded by the `consentTextVersionBumped` validator) — editable via the admin config API once `configurationLoader.initialize()` has run. Until then (and without it) the exported config objects are the file defaults, so the app works before/without store init. Liveness nuance: archetype *assignment* + *weights* are store-backed (live for future evaluations); competency texts and archetype names/descriptions are *labels* (versioned/exportable, but need export → commit → redeploy to show).

**Cycle lock validation & family exclusion**: `validateCycleForLock(cycleID)` is a pure structured validator returning `{ valid, errors: [{ family, specialization?, rule, detail }] }`. Six rules: `baseline-floor-coverage` (each of the nine subcategories present in the baseline), `cap` (resolved set ≤ `activeCompetencySetCap`, default 30), `reference-integrity` (codes exist in the dictionary), `no-empty-baseline` (a family with specialization data needs a non-empty baseline), `pool-membership` (every code ∈ the family's pool — added 3.1.0), and `family-not-configured` (an *included* family must be configured — added 3.2.0). A family can be **excluded** from a cycle via `cycle.excludedFamilies` (`DataManager.setCycleExcludedFamilies`; Supervisor + PLANNING only, toggled on the Cycle Setup baseline editor) — excluded families are skipped by validation and hidden in the tree, so a cycle can lock with only the families that can be completed. Un-marking an intentionally-empty specialization clears it via `DataManager.deleteActiveCompetencySet`.

**Test & build commands**:
```bash
npm test               # node --test test/*.test.js
npm run test:json      # validate JSON config schemas
npm run build:guide    # regenerate the in-app Help fragments from docs/user-guide/en/ (commit the output)
npm start              # run the instance without Docker (bin/competence-web-server.js via core's start-instance)
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
- **`web-content` is pre-1.0**, so breaking changes land inside `0.x` — marked `!` on the commit and called out as **BREAKING** in the changelog body (e.g. the 0.2.0 path-decoding change) rather than forcing a major bump. Note that `web-framework` did the same for the 1.19.0 `/static` cache default: a `fix(web-server)!` inside a minor bump, because the framework is the one deciding the default.
- **A version bump can be a release trigger.** Pushing a `competence-v*` tag to `master` makes CD publish the image to GHCR **and** Artifact Registry as `:X.Y.Z` + `:latest`; a plain `master` push publishes only `:edge` + `:sha`. So tag deliberately.

### Publishing to npm — automatic on merge into `master`

`core`, `web-framework`, `web-content` and `tester` are published by `.github/workflows/npm-publish.yml` on every push to `master`, which in normal use means every merged pull request. **A version bump plus its changelog section is the entire release ritual** — there is nothing to tag or trigger by hand. `competence` is deliberately excluded: it is the application, and ships as a container image through `cd.yml`.

- **The plan comes from the registry and the tags, not from the diff.** Each package's declared version is compared against npm; a merge that bumps nothing publishes nothing and skips even the test job. A cancelled run, a hand-published version, or two bumps landing at once all leave the registry right where a diff of the merge commit would be wrong.
- **A release is the version on npm *and* its `<package>-v<version>` tag plus GitHub release.** Only the npm half is irreversible, so a version that published but never got tagged stays in the plan until it has one — a re-run finishes it rather than skipping it forever. `workflow_dispatch` is therefore a safe retry.
- **A version bump with no matching `## Version X.Y.Z` section fails the run before anything is published.** The release notes are built from that section; the plan job is the last point at which failing is free.
- **Authentication is npm trusted publishing (OIDC)** — no `NPM_TOKEN`, and provenance is attached automatically. Each package has a trusted publisher on npmjs.com keyed to the **workflow filename**, so renaming `npm-publish.yml` breaks publishing until those entries are updated. A brand-new package must be published by hand once before a trusted publisher can be added for it.
- **Provenance validates `repository.url`.** A package whose manifest lacks a `repository` block fails to publish with a `422` (this is what caught `tester` 1.3.3). A new package needs `repository` (with `directory`), `bugs` and `homepage` matching the others.
- Actions in every workflow are **pinned to commit SHAs** with the version as a trailing comment; Dependabot's `github-actions` ecosystem keeps them current.
- Dependabot scans from the workspace root only — with npm workspaces that already reaches every `packages/*/package.json` — and its **version updates target `current`**, so bumps arrive through the normal release pull request. Security updates always target the default branch regardless.

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
9. **One chokepoint per invariant** — enforce a rule at a single place every caller must pass through, then let every surface inherit it: `web-content`'s `repository.resolveVisibility` (all listings/feeds/sitemap/counts/prev-next), competence's `anonymizeEvaluationScores` and `research-consent.filterConsentedEvaluations`. Adding a new query surface should require no new enforcement code.
10. **Fail closed** — an absent guard selects the built-in check, never none (web-content capture admin); an unprovable consent is a visible failure rather than an optimistic pass (competence research-consent); a missing/unrecognised `visibility` is visible to nobody.

---

## When Working on This Codebase

1. **New service (tester/competence)**: add the handler file in `services/v1/` and register it in the `.json` service registry.
2. **Extending the web UI**: subclass `TiWebAppManager`, add an HTML fragment + matching Alpine component; reuse framework CSS primitives; obey the Alpine CSP rules (no inline styles, no `?.`).
3. **Adding/changing config**: edit `bin/config/*.json`, update the JSON schema in `bin/data/schemas/`, add/adjust the enum or loader helper in `configuration-loader.js`, and — if it should be admin-editable — register it in `config-registration.js` (document + schema + semantic validator + optional composite editor).
4. **New admin-editable entity**: register a config document and, for structured editing, a composite editor in `config-editors.js`; add referential-integrity guards in `config-validators.js`.
5. **Competency content**: drive changes from the `design/` source-of-truth docs; re-run `bin/build/build-competency-relevancy.js` for archetype-derived data; the content-integrity test guards against empty names/descriptions/scopes.
6. **Testing**: Node.js built-in `node --test` (no external framework); each package's `test/` directory. `npm test` at the root fans out across workspaces; `npm run lint` runs ESLint over everything.
7. **Bumping versions**: update the affected package's `package.json` + `CHANGELOG.md`.
8. **Design-first**: for non-trivial work, start from / update the relevant design record — package `design/*.md` or repo-root `docs/superpowers/specs/` (see Conventions) — and land small checkpointed commits. Never commit `.run/*.run.xml` (live creds).
9. **Editing end-user docs**: change the markdown chapter under `packages/competence/docs/user-guide/en/`, then `npm run build:guide` and **commit the regenerated fragments**.
10. **Adding a screen to web-content**: add the section type to `SECTION_TYPES` in `content/schema.js`, a body renderer under `render/editorial/`, and document it in `design/authoring-guide.md` — a type in the schema but in neither the documented nor the deferred list fails the suite. Mount routes only through the `routes/index.js` API (`mountContentRoutes` and friends) on top of the web-framework 1.17.0 seams; never reach into private server state.
11. **Deployment work (competence)**: the container story is `Dockerfile` + `INSTALL.md`; the Cloud Run test environment is `deploy/gcp/` — always dry-run first (`DRY_RUN=1 ./bootstrap.sh`, `DRY_RUN=1 ./deploy.sh`). Never put a secret value in `service.yaml` or any committed file; secrets go to Secret Manager / your orchestrator's store.
12. **Tracking work**: create a `CA-###` card in YouTrack under its epic (features/tasks are `subtask of` their epic; only truly standalone items stay unparented) and reference the ID in commit messages so the GitHub integration links them. See *Issue Tracking — YouTrack* above.
