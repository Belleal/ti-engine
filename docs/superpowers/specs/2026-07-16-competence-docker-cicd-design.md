# Design — Containerize `competence` + GHCR CI/CD

| | |
|---|---|
| **Date** | 2026-07-16 |
| **Packages** | `packages/competence` (primary), `packages/web-framework` (env-override support), repo root (Docker + CI/CD) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | web-framework `1.13.2` → `1.14.0` (minor); competence `3.12.0` → `3.13.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack `CA-###` (to be created under the DevOps/infra epic, else standalone) |

---

## 1. Background & motivation

The `competence` HR appraisal app currently has **no container or CI/CD tooling**. It is launched from IDE run-configs via `core`'s `bin/start-instance.js`, with no `start` script, no Dockerfile, and only a **stale CodeQL workflow** (pinned to retired `codeql-action@v1` / `checkout@v2`, which fail on today's GitHub runners). The goal is to make the app trivially buildable and deployable through a Docker-based pipeline that publishes versioned images to a registry.

This is delivered against a **public, GPL-3.0 GitHub repo** (`Belleal/ti-engine`) under Information Services org rules, so: **no secret ever enters the repo or an image**, artifacts get heightened review, and secure defaults (non-root, minimal base) are mandatory.

## 2. Goals & non-goals

**Goals**
- A production-grade, reproducible **container image** for `competence`, buildable from a clean checkout.
- **Local dev parity** via `docker compose` (app + Redis with the JSON module).
- **CI** (lint + test + image build) on pull requests and branch pushes.
- **CD** that publishes to **GHCR** on `master` pushes and version tags, with no stored credentials.
- Make the web server **12-factor configurable** (bind address / TLS / cookie secret via env) so the same image runs locally and behind a TLS-terminating proxy.

**Non-goals**
- No Kubernetes manifests / Helm charts (out of scope; the image is orchestrator-agnostic).
- No containerization of `tester` or a generic per-package image factory (this is competence-specific; the Dockerfile lives under `packages/competence/`).
- No change to the app's runtime behavior, data model, auth, or config semantics.
- No production Redis/secret provisioning (deployment concern; the image consumes them via env).
- No multi-arch build by default (linux/amd64; arm64 is a trivial later addition, noted but not enabled).

## 3. Verified facts about the runtime (the contract we build against)

Established by reading the code during brainstorming:

1. **Boot:** the app runs `core`'s `bin/start-instance.js` with **cwd = the competence package dir** and env `TI_INSTANCE_CLASS=bin/competence-web-server.js`, `TI_INSTANCE_CONFIG=bin/competence-web-server.json`, `TI_INSTANCE_NAME=ti-competence`. `start-instance.js` loads `.env` from cwd if present (a missing file is non-fatal — env may come entirely from the container) and does **not** override existing `process.env`.
2. **Workspace linkage:** `competence` depends on `@ti-engine/core` and `@ti-engine/web-framework` via `*` (workspace links). The build context **must** include all three packages + the root `package.json`/`package-lock.json`, installed from the workspace root. npm hoists `@ti-engine/core` to `/<root>/node_modules/@ti-engine/core`.
3. **Redis needs the JSON module:** `core/integrations/redis-integration.js` uses `JSON.MERGE` / `JSON.MGET`. Plain `redis:7` will not work — Redis Stack (or Redis 8+, which bundles JSON) is required.
4. **No native modules:** the entire dependency tree is pure-JS (ioredis, lodash, node-schedule, graphology, express, helmet, etc.). The `allowScripts.zeromq@6.5.0` entry in root `package.json` is **stale** — zeromq is absent from the lockfile and all manifests. ⇒ `node:22-alpine` needs **no build toolchain**.
5. **`postinstall`:** `web-framework`'s `bin/build/post-install.js` copies `htmx.min.js` and `@alpinejs/csp` into `bin/static/scripts/lib`. Both are **runtime `dependencies`**, so a `--omit=dev` install still has them. The script requires **its own source file to exist**, so it cannot run during a manifest-only (`package.json`-only) cached install layer — it must run after source is copied.
6. **Web config source:** `TiWebServer` merges `web-framework/bin/web-server.json` (defaults: `host:127.0.0.1`, `port:3000`, `useTLS:true`, local mkcert cert paths) with the instance config via `_.merge` (web-server.js:124). `host`/`port`/`useTLS`/cert-paths are **file-only — no env override exists today**. The session cookie secret (web-server.js:264) falls back to a random per-process value.
7. **Host allow-list is TLS-gated:** `isAllowedHost` is consulted **only** inside `httpRedirectHandler`, which is registered **only when `useTLS === true`** (web-server.js:232-243). `trust proxy` is set **unconditionally** (web-server.js:223). ⇒ with `TI_WEB_USE_TLS=false`, the container serves plain HTTP with **no host-allowlist gate** and honors `X-Forwarded-Proto` — correct behind a TLS-terminating proxy. No allowed-hosts env var is needed.

## 4. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Deliverable scope | **Full CI/CD**: Docker artifacts + CI + CD |
| Registry / auth | **GHCR** (`ghcr.io/belleal/ti-engine-competence`) via built-in `GITHUB_TOKEN` — no stored secrets |
| CD trigger / tagging | **Tags + branch builds**: PR → test+build (no push); `master` push → `:edge`+`:sha`; tag `competence-v*` → `:X.Y.Z`+`:latest` |
| Container config override | **Add `TI_WEB_*` env overrides to web-framework** (12-factor) |
| Dockerfile location | `packages/competence/Dockerfile`, build context = repo root |
| Base image | `node:22-alpine` |
| Dependency install | **`npm install --omit=dev`** (not `npm ci`). `package-lock.json` stays **gitignored** (existing policy) — a fresh CI checkout has no lockfile, so `npm ci` is unavailable. Trade-off: builds are **not version-pinned** (a rebuild may resolve newer patch/minor deps). Accepted by the user. |
| CodeQL | **Modernize** the stale workflow in the same pass (see §5.8) — flagged optional; user may veto at spec review |

## 5. Component specs

### 5.1 web-framework env overrides (`bin/web-server.js`, v1.14.0)

In the `TiWebServer` constructor, build the merged config into a local, apply env overrides, then pass to `super(...)`. New helper (private module function or static) applying, when the env var is **defined**:

| Env var | Config path | Coercion |
|---|---|---|
| `TI_WEB_HOST` | `host` | string |
| `TI_WEB_PORT` | `port` | `Number(...)` |
| `TI_WEB_USE_TLS` | `useTLS` | `tools.toBool(...)` |
| `TI_WEB_TLS_CERT_PATH` | `tlsCertPath` | string |
| `TI_WEB_TLS_KEY_PATH` | `tlsKeyPath` | string |
| `TI_WEB_COOKIE_SECRET` | `cookies.secret` | string |

Rules: only override when the env var is present (absent ⇒ unchanged, fully backward compatible); reuse `@ti-engine/core/tools`'s `toBool` for the boolean (consistent with `start-instance.js` / config.js usage). Keep the GPL header. Do not change `web-server.json` defaults (local dev keeps TLS + localhost certs).

**Tests** (`test/web-server-env-overrides.test.js`, `node --test`): assert each env var lands in the merged `serviceConfig`; assert absence leaves defaults; assert `toBool`/`Number` coercion. Since `serviceConfig` is set by the base ctor, test via a small subclass/instance or by extracting the override function as a pure, exported-for-test helper (preferred — pure function, unit-testable without constructing a full server + Redis).

**Docs:** add the six vars to the web-framework README ENV section. CHANGELOG + version bump to `1.14.0`.

### 5.2 Dockerfile (`packages/competence/Dockerfile`, context = repo root)

Multi-stage, `node:22-alpine`:

**Stage `deps`:**
1. `WORKDIR /app`
2. Copy root `package.json` and each `packages/*/package.json` (manifest-only layer for cache; the lockfile is gitignored and intentionally not copied).
3. `RUN npm install --omit=dev --ignore-scripts`
4. Copy the three package source trees (`packages/core`, `packages/web-framework`, `packages/competence`). *(tester not needed at runtime; excluded via .dockerignore or simply not copied.)*
5. `RUN npm run postinstall -w @ti-engine/web-framework` — materialize static libs (see §3.5).

**Stage `runtime`:**
1. `FROM node:22-alpine`, `ENV NODE_ENV=production`
2. `WORKDIR /app`; `COPY --from=deps --chown=node:node /app /app`
3. Baked non-secret env defaults: `TI_INSTANCE_NAME=ti-competence`, `TI_INSTANCE_CLASS=bin/competence-web-server.js`, `TI_INSTANCE_CONFIG=bin/competence-web-server.json`, `TI_LOCALIZATION_LABELS_PATH=bin/localization/competence-labels.json`, `TI_WEB_HOST=0.0.0.0`, `TI_WEB_PORT=3000`, `TI_WEB_USE_TLS=false`.
4. `USER node`
5. `WORKDIR /app/packages/competence` (cwd for relative config/label/publicPath resolution)
6. `EXPOSE 3000`
7. `HEALTHCHECK` — node one-liner GET `http://127.0.0.1:3000/login`, exit 0 if status `< 500`, else 1 (Redis-down ⇒ server not listening ⇒ fails, as desired).
8. `CMD ["node", "/app/node_modules/@ti-engine/core/bin/start-instance.js"]`

**No secrets baked.** `TI_MEMORY_CACHE_*`, `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`, `TI_WEB_COOKIE_SECRET`, OAuth secrets are supplied at runtime only.

### 5.3 docker-compose.yml (repo root) — local dev

- **`redis`:** image `redis/redis-stack-server:latest` (JSON module guaranteed; comment noting Redis 8+ also works), `healthcheck: redis-cli ping`, named volume `redis-data`, port `6379` (dev convenience).
- **`competence`:** `build: { context: ., dockerfile: packages/competence/Dockerfile }`, `depends_on: { redis: { condition: service_healthy } }`, `ports: ["3000:3000"]`, `environment:` sets `TI_MEMORY_CACHE_REDIS_HOST=redis`, `TI_WEB_HOST=0.0.0.0`, `TI_WEB_USE_TLS=false`, dev flags `COMPETENCE_TEST_USER_ENABLED=true`, `COMPETENCE_PRELOAD_DATA=false` (documented how to flip to seed), and pulls secrets from a gitignored root `.env` (`${TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY:-dev-only-not-for-prod}` style defaults so `up` works out of the box for dev while making the prod obligation explicit).

### 5.4 .dockerignore (repo root)

Exclude to keep context lean and secrets/certs out: `**/node_modules`, `.git`, `.github`, `.claude`, `.run`, `.idea`/IDE files, `**/.env`, `**/bin/tls/**` (never ship local mkcert certs), `**/test`, `docs`, `**/CHANGELOG.md` optional-keep, `*.md` at package level optional. Must sit at the **build-context root** (repo root) to be honored.

### 5.5 .env.example (repo root)

Documented placeholders, grouped. **Secrets are placeholders only.** Sections:
- **Identity/instance:** `TI_INSTANCE_NAME`, `TI_INSTANCE_CLASS`, `TI_INSTANCE_CONFIG`, `TI_LOCALIZATION_LABELS_PATH`, `TI_AUDITING_LOG_MIN_LEVEL`.
- **Web binding:** `TI_WEB_HOST=0.0.0.0`, `TI_WEB_PORT=3000`, `TI_WEB_USE_TLS=false`, `TI_WEB_APP_STATIC_CACHE_DISABLED=false`.
- **Redis:** `TI_MEMORY_CACHE_REDIS_HOST=redis`, `TI_MEMORY_CACHE_REDIS_PORT=6379`, `TI_MEMORY_CACHE_REDIS_DB=0`, `TI_MEMORY_CACHE_AUTH_KEY=`.
- **Secrets (set to strong random values in prod):** `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY=<set-a-strong-random-value>`, `TI_WEB_COOKIE_SECRET=<set-a-strong-random-value>`.
- **App flags:** `COMPETENCE_PRELOAD_DATA=false`, `COMPETENCE_TEST_USER_ENABLED=false` (note: `true` only for local dev).
- **Optional OAuth:** `TI_GCLOUD_AUTH_CLIENT_ID/SECRET/CALLBACK_URL/DISCOVERY_URL`, `TI_AZURE_AUTH_CLIENT_ID/SECRET/CALLBACK_URL/DISCOVERY_URL` — commented, placeholders.

Ensure root `.env` is gitignored (add if missing). The existing committed `packages/competence/.env` (non-secret, app-relative) is unchanged.

### 5.6 CI workflow (`.github/workflows/ci.yml`)

- **on:** `pull_request: [master]`, `push: [current, master]`.
- **Job `lint-and-test`** (`ubuntu-latest`, Node 22 via `actions/setup-node@v4`, **no npm cache** — the cache keys off `package-lock.json`, which is gitignored): `npm install` → `npx eslint .` → `npm test --workspaces --if-present` → `npm run test:json -w @ti-engine/competence`. **Prettier check is included only if the repo is already prettier-clean** (verified locally during implementation — see §10); if it is not, `prettier --check` is omitted (or scoped to changed files) rather than shipping a red pipeline over pre-existing formatting.
- **Job `docker-build`** (needs lint-and-test): `docker/setup-buildx-action@v3` → `docker/build-push-action@v6` with `context: .`, `file: packages/competence/Dockerfile`, `push: false`, GHA cache (`cache-from/to: type=gha`). Validates the image builds.
- Pin actions to current major versions (`checkout@v4`, `setup-node@v4`, buildx/build-push current).

### 5.7 CD workflow (`.github/workflows/cd.yml`)

- **on:** `push: { branches: [master], tags: ['competence-v*'] }`.
- **permissions:** `contents: read`, `packages: write`.
- **Steps:** `checkout@v4` → `setup-buildx@v3` → `docker/login-action@v3` (registry `ghcr.io`, username `${{ github.actor }}`, password `${{ secrets.GITHUB_TOKEN }}`) → `docker/metadata-action@v5` (image `ghcr.io/belleal/ti-engine-competence`; tags: `type=edge,branch=master`, `type=sha`, `type=match,pattern=competence-v(.*),group=1`, `type=raw,value=latest,enable=${{ startsWith(github.ref,'refs/tags/competence-v') }}`) → `build-push-action@v6` (`context: .`, `file: packages/competence/Dockerfile`, `push: true`, `platforms: linux/amd64`, `tags`/`labels` from metadata, GHA cache).
- **Result:** `master` push → `:edge` + `:sha-<short>`; tag `competence-v3.13.0` → `:3.13.0` + `:latest`.

### 5.8 CodeQL modernization (`.github/workflows/codeql-analysis.yml`)

Update retired pins: `checkout@v4`, `github/codeql-action/init@v3`, `.../analyze@v3`; language `javascript-typescript`; drop the `autobuild` step (not needed for JS); keep the existing triggers (push/PR to master + weekly cron). Clearly a separate commit so it can be dropped.

### 5.9 competence package + root (v3.13.0)

- `packages/competence/package.json`: add `"start": "node ../../node_modules/@ti-engine/core/bin/start-instance.js"`; bump `3.12.0` → `3.13.0`.
- `packages/competence/README.md`: new **Deployment / Docker** section — env contract, `docker compose up`, standalone `docker build`/`run`, prod notes (set the two secrets; put a TLS-terminating proxy in front; point Redis at a JSON-capable instance).
- `packages/competence/CHANGELOG.md`: `3.13.0` entry.
- Root `package.json`: add convenience scripts `lint` (`eslint .`), `format:check` (`prettier --check .`), `test` (`npm test --workspaces --if-present`). (No version bump required for root; optional.)

## 6. File inventory

**New:** `packages/competence/Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, `packages/web-framework/test/web-server-env-overrides.test.js`.

**Changed:** `packages/web-framework/bin/web-server.js`, `.../README.md`, `.../CHANGELOG.md`, `.../package.json`; `packages/competence/package.json`, `.../README.md`, `.../CHANGELOG.md`; root `package.json`; `.gitignore` (root `.env`); `.github/workflows/codeql-analysis.yml` (modernize).

## 7. Versioning & commits

- web-framework `1.13.2` → **1.14.0** (`feat(web-framework): TI_WEB_* env overrides`).
- competence `3.12.0` → **3.13.0** (`feat(competence): containerization + start script + deployment docs`).
- Commits bundled thematically (per repo convention — few, coherent): (1) web-framework env overrides + test + docs + version; (2) Docker artifacts (Dockerfile, compose, .dockerignore, .env.example); (3) CI/CD workflows (+ CodeQL modernization as its own commit); (4) competence start script + README + versions/changelogs. Each commit references `CA-###`.

## 8. Testing & verification

This environment has **no Docker/Redis** (see project memory). Therefore:
- **Run here:** the new web-framework `node --test` suite; `npm test --workspaces`; `npx eslint .` / `npx prettier --check .`; a static review of every YAML/Dockerfile (structure, action pins, no secrets, `.dockerignore` coverage). YAML/Dockerfile linted by inspection (optionally `hadolint`/`actionlint` if available).
- **Handed to the user (local smoke test):** `docker build -f packages/competence/Dockerfile -t competence:local .`; `docker compose up` → open `http://localhost:3000/login`, confirm boot logs show Redis connected + server listening on `0.0.0.0:3000`; verify a dev login works. A short checklist will be provided.
- **Pipeline validation:** CI runs on the PR that lands this work; CD dry-validated by the image-build job before any real publish.

## 9. Tracking

Create `CA-###` in YouTrack (under the DevOps/infra epic if one exists; otherwise standalone, `relates to` the competence epic). Reference the ID in every commit; log time spent; move `State`/`Stage` to Verified/Done on completion.

## 10. Risks & mitigations

- **postinstall in a cached layer** → mitigated by the `--ignore-scripts` + explicit post-source `npm run postinstall` split (§5.2).
- **Wrong Redis image (no JSON module)** → compose pins `redis/redis-stack-server`; README + `.env.example` call it out for prod.
- **Secret leakage** → `.dockerignore` excludes `**/.env` and `**/bin/tls/**`; nothing secret is baked; GHCR uses `GITHUB_TOKEN`; `.env.example` holds placeholders only.
- **Relative `start` path fragility** → the container `CMD` uses an absolute path (`/app/node_modules/...`); the npm `start` script's relative path is for local/dev parity only.
- **CodeQL change unwanted** → isolated in its own commit, trivially reverted.
- **Non-pinned builds** (consequence of `npm install` without a committed lockfile) → accepted by the user; semver ranges in the manifests bound drift. Revisit by committing the lockfile if a rebuild ever resolves an incompatible dep.
- **CI lint/format failing on pre-existing code** → before wiring `eslint`/`prettier` into CI, run both locally against the current tree; if either flags pre-existing (non-our-change) violations, either fix them in a clearly-separate commit only if trivial and in-scope, or relax the CI step (eslint with `--max-warnings` tolerance / prettier scoped to changed files or dropped). The pipeline must be green on first run without a mass reformat.
