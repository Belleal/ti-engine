# Competence Docker CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `competence` app trivially buildable and deployable via a Docker-based GitHub Actions pipeline that publishes versioned images to GHCR.

**Architecture:** A multi-stage Dockerfile builds `competence` from the npm-workspace monorepo (it needs `core` + `web-framework` linked). Local dev runs via `docker compose` (app + Redis Stack). GitHub Actions provide CI (lint/test/build on PRs & branch pushes) and CD (build & push to GHCR on `master` + `competence-v*` tags). A small `web-framework` change adds `TI_WEB_*` env overrides so one image is 12-factor configurable.

**Tech Stack:** Node 22 (Alpine), Docker/Buildx, docker compose, Redis Stack (JSON module), GitHub Actions, GHCR, `node --test`.

## Global Constraints

- **Runtime facts (verified):** app boots via `node /app/node_modules/@ti-engine/core/bin/start-instance.js` with **cwd = the competence package dir**; env `TI_INSTANCE_CLASS=bin/competence-web-server.js`, `TI_INSTANCE_CONFIG=bin/competence-web-server.json`, `TI_INSTANCE_NAME=ti-competence`.
- **Redis requires the JSON module** (`JSON.MERGE`/`JSON.MGET`) — use `redis/redis-stack-server` (or Redis 8+). Never plain `redis:7`.
- **Dependency install:** `npm install --omit=dev` (NOT `npm ci`). `package-lock.json` stays **gitignored**; do not copy or commit it. Builds are intentionally not version-pinned.
- **postinstall ordering:** `web-framework`'s `postinstall` (copies HTMX/Alpine libs) needs its own source present — install with `--ignore-scripts`, copy source, then run `npm run postinstall -w @ti-engine/web-framework`.
- **No native modules** in the tree → `node:22-alpine` needs no build toolchain. The `allowScripts.zeromq` entry in root `package.json` is stale — leave it or remove only if trivial; do not add a build toolchain for it.
- **No secrets anywhere** in the repo or image. GHCR auth uses the built-in `${{ secrets.GITHUB_TOKEN }}`. Runtime secrets (`TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`, `TI_WEB_COOKIE_SECRET`, Redis auth, OAuth) come only from env. `.env` and `bin/tls/**` must be excluded from the build context.
- **GPL header:** every new `.js` file starts with the standard GPL-3.0 header block (copy verbatim from an existing file such as `packages/web-framework/test/authorization.test.js:1-7`, keeping `Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>`).
- **Conventions:** CommonJS; `#alias` internal imports; `node --test` tests using `const { describe, it } = require("node:test")` + `const assert = require("node:assert/strict")`; commits are Conventional-Commit, thematically bundled (few, coherent), each referencing the `CA-###` id from Task 1.
- **Image name:** `ghcr.io/belleal/ti-engine-competence`.
- **Version targets:** web-framework `1.13.2` → `1.14.0`; competence `3.12.0` → `3.13.0`.
- **No Docker/Redis in this environment.** Docker build / `compose up` are verified by the user locally (Task 8 produces the checklist); here, verify everything statically + run the JS unit tests and eslint.

---

### Task 1: Create the YouTrack tracking card

**Files:** none (tracking only).

- [ ] **Step 1: Load the YouTrack MCP tools**

Run a ToolSearch for: `select:mcp__youtrack__search_issues,mcp__youtrack__create_issue,mcp__youtrack__get_issue,mcp__youtrack__update_issue,mcp__youtrack__log_work`

- [ ] **Step 2: Find the right parent epic**

Search issues in project `CA` for a DevOps / infrastructure / CI-CD epic:
```
mcp__youtrack__search_issues query: "project: CA Type: Epic (DevOps OR infrastructure OR CI OR Docker OR deployment)"
```
Expected: either an infra/DevOps epic (use as `parentIssue`) or none (create the card standalone and `relates to` the competence capability epic).

- [ ] **Step 3: Create the card**

```
mcp__youtrack__create_issue
  project: CA
  summary: "Containerize competence app + GHCR CI/CD pipeline"
  description: (short summary + link to docs/superpowers/specs/2026-07-16-competence-docker-cicd-design.md)
  parentIssue: <epic id if found>
```
Record the returned `CA-###` id. Use it in every commit message below (`... (CA-###)`).

- [ ] **Step 4: No commit** (tracking only). Proceed to Task 2.

---

### Task 2: web-framework `TI_WEB_*` env overrides (v1.14.0)

**Files:**
- Create: `packages/web-framework/components/web-config-env.js`
- Modify: `packages/web-framework/package.json` (imports map + version)
- Modify: `packages/web-framework/bin/web-server.js:123-124` (constructor)
- Test: `packages/web-framework/test/web-server-env-overrides.test.js`
- Modify: `packages/web-framework/README.md` (ENV section), `packages/web-framework/CHANGELOG.md`

**Interfaces:**
- Produces: `applyWebConfigEnvOverrides(config, env = process.env) → config` (default export of `#web-config-env`). Mutates and returns `config`, applying an override only when the env var is defined.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/web-server-env-overrides.test.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );

const baseConfig = () => ( {
    host: "127.0.0.1",
    port: 3000,
    useTLS: true,
    tlsCertPath: "bin/tls/localhost+2.pem",
    tlsKeyPath: "bin/tls/localhost+2-key.pem",
    cookies: { path: "/", httpOnly: true }
} );

describe( "applyWebConfigEnvOverrides", () => {

    it( "leaves config untouched when no TI_WEB_* vars are set", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, {} );
        assert.deepEqual( config, baseConfig() );
    } );

    it( "overrides host, port (as Number), and useTLS (as bool via toBool)", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_HOST: "0.0.0.0", TI_WEB_PORT: "8080", TI_WEB_USE_TLS: "false" } );
        assert.equal( config.host, "0.0.0.0" );
        assert.equal( config.port, 8080 );
        assert.equal( typeof config.port, "number" );
        assert.equal( config.useTLS, false );
    } );

    it( "treats TI_WEB_USE_TLS=true as boolean true", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_USE_TLS: "true" } );
        assert.equal( config.useTLS, true );
    } );

    it( "overrides TLS cert/key paths", () => {
        const config = baseConfig();
        applyWebConfigEnvOverrides( config, { TI_WEB_TLS_CERT_PATH: "/certs/tls.crt", TI_WEB_TLS_KEY_PATH: "/certs/tls.key" } );
        assert.equal( config.tlsCertPath, "/certs/tls.crt" );
        assert.equal( config.tlsKeyPath, "/certs/tls.key" );
    } );

    it( "sets cookies.secret and creates cookies object if absent", () => {
        const config = { host: "127.0.0.1" };
        applyWebConfigEnvOverrides( config, { TI_WEB_COOKIE_SECRET: "s3cr3t" } );
        assert.equal( config.cookies.secret, "s3cr3t" );
    } );

    it( "returns the same config object reference", () => {
        const config = baseConfig();
        assert.equal( applyWebConfigEnvOverrides( config, {} ), config );
    } );

    it( "tolerates a null/non-object config", () => {
        assert.equal( applyWebConfigEnvOverrides( null, { TI_WEB_HOST: "0.0.0.0" } ), null );
    } );

} );
```

- [ ] **Step 2: Add the `#web-config-env` import alias**

In `packages/web-framework/package.json`, add to the `imports` map (keep alphabetical order — insert before `#web-handlers`):
```json
    "#web-config-env": "./components/web-config-env.js",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @ti-engine/web-framework -- --test-name-pattern="applyWebConfigEnvOverrides"`
(or from the package dir: `node --test test/web-server-env-overrides.test.js`)
Expected: FAIL — cannot find module `#web-config-env`.

- [ ] **Step 4: Implement the pure helper**

Create `packages/web-framework/components/web-config-env.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

const tools = require( "@ti-engine/core/tools" );

/**
 * Applies TI_WEB_* environment-variable overrides onto an (already-merged) web server configuration object.
 * Each override is applied ONLY when its environment variable is defined, so an absent variable leaves the
 * configured/default value untouched (fully backward compatible). This gives ti-engine web servers 12-factor,
 * container-friendly control over network binding, TLS, and the session cookie secret without editing config files.
 *
 * @method
 * @param {Object} config The web server configuration to augment (mutated in place and returned).
 * @param {Object} [env=process.env] The environment source (injectable for testing).
 * @returns {Object} The same config object, with any present overrides applied.
 * @public
 */
function applyWebConfigEnvOverrides( config, env = process.env ) {
    if ( !config || typeof config !== "object" ) {
        return config;
    }
    if ( env.TI_WEB_HOST !== undefined ) {
        config.host = env.TI_WEB_HOST;
    }
    if ( env.TI_WEB_PORT !== undefined ) {
        config.port = Number( env.TI_WEB_PORT );
    }
    if ( env.TI_WEB_USE_TLS !== undefined ) {
        config.useTLS = tools.toBool( env.TI_WEB_USE_TLS );
    }
    if ( env.TI_WEB_TLS_CERT_PATH !== undefined ) {
        config.tlsCertPath = env.TI_WEB_TLS_CERT_PATH;
    }
    if ( env.TI_WEB_TLS_KEY_PATH !== undefined ) {
        config.tlsKeyPath = env.TI_WEB_TLS_KEY_PATH;
    }
    if ( env.TI_WEB_COOKIE_SECRET !== undefined ) {
        config.cookies = config.cookies || {};
        config.cookies.secret = env.TI_WEB_COOKIE_SECRET;
    }
    return config;
}

module.exports = applyWebConfigEnvOverrides;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/web-server-env-overrides.test.js` (from `packages/web-framework`)
Expected: PASS — all 7 assertions green.

- [ ] **Step 6: Wire the helper into the web server constructor**

In `packages/web-framework/bin/web-server.js`, add the require near the other `#` requires (with the config-related ones, ~line 90 area where `#web-server-config` is required):
```js
const applyWebConfigEnvOverrides = require( "#web-config-env" );
```
Then change the constructor's `super(...)` call (currently line 124):
```js
        super( serviceDomainName, _.merge( {}, webServerConfig, ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : {} ) );
```
to:
```js
        super( serviceDomainName, applyWebConfigEnvOverrides( _.merge( {}, webServerConfig, ( _.isObjectLike( serviceConfig ) ) ? serviceConfig : {} ) ) );
```

- [ ] **Step 7: Run the full web-framework test suite + lint**

Run: `node --test test/*.test.js` (from `packages/web-framework`) → Expected: all suites PASS.
Run: `npx eslint packages/web-framework/components/web-config-env.js packages/web-framework/bin/web-server.js packages/web-framework/test/web-server-env-overrides.test.js` (from repo root) → Expected: no errors.

- [ ] **Step 8: Update README + CHANGELOG + version**

In `packages/web-framework/README.md`, find the ENV-variables section and add:
```markdown
* `TI_WEB_HOST` overrides the bind address (e.g. `0.0.0.0` in a container). Defaults to the value in the web server config.
* `TI_WEB_PORT` overrides the listen port.
* `TI_WEB_USE_TLS` (`true`/`false`) toggles in-app TLS. Set `false` when a reverse proxy / ingress terminates TLS.
* `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` override the TLS certificate/key paths (only used when TLS is enabled).
* `TI_WEB_COOKIE_SECRET` sets the session cookie signing secret. Set a stable, private value for durable sessions and multi-replica deployments (otherwise a random per-process value is used).
```
In `packages/web-framework/package.json`, bump `"version": "1.13.2"` → `"1.14.0"`.
In `packages/web-framework/CHANGELOG.md`, add at the top:
```markdown
## Version 1.14.0
* feat(web-framework): add TI_WEB_* env overrides (host, port, TLS toggle, cert/key paths, cookie secret) for 12-factor container configuration
```

- [ ] **Step 9: Commit**

```bash
git add packages/web-framework/components/web-config-env.js \
        packages/web-framework/test/web-server-env-overrides.test.js \
        packages/web-framework/bin/web-server.js \
        packages/web-framework/package.json \
        packages/web-framework/README.md \
        packages/web-framework/CHANGELOG.md
git commit -m "feat(web-framework): add TI_WEB_* env overrides for container config (CA-###)"
```

---

### Task 3: Docker build artifacts

**Files:**
- Create: `packages/competence/Dockerfile`
- Create: `.dockerignore` (repo root)
- Create: `docker-compose.yml` (repo root)
- Create: `.env.example` (repo root)
- Modify: `.gitignore` (repo root) — ignore root `.env`, keep `.env.example`

- [ ] **Step 1: Create the Dockerfile**

Create `packages/competence/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1

# ---------- deps stage: install workspace deps + materialize static libs ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Manifest-only layer first for better dependency-layer caching.
# NOTE: package-lock.json is intentionally NOT copied (it is gitignored); we use `npm install`.
COPY package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/web-framework/package.json ./packages/web-framework/
COPY packages/competence/package.json ./packages/competence/
COPY packages/tester/package.json ./packages/tester/

# Install runtime deps only, skipping lifecycle scripts (web-framework's postinstall needs source, copied next).
RUN npm install --omit=dev --ignore-scripts

# Copy the source of the packages the app needs at runtime (tester source is not needed).
COPY packages/core ./packages/core
COPY packages/web-framework ./packages/web-framework
COPY packages/competence ./packages/competence

# Now that web-framework source exists, run its postinstall to copy the bundled HTMX/Alpine static libs.
RUN npm run postinstall -w @ti-engine/web-framework

# ---------- runtime stage: minimal, non-root ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TI_INSTANCE_NAME=ti-competence \
    TI_INSTANCE_CLASS=bin/competence-web-server.js \
    TI_INSTANCE_CONFIG=bin/competence-web-server.json \
    TI_LOCALIZATION_LABELS_PATH=bin/localization/competence-labels.json \
    TI_WEB_HOST=0.0.0.0 \
    TI_WEB_PORT=3000 \
    TI_WEB_USE_TLS=false

WORKDIR /app
COPY --from=deps --chown=node:node /app /app

USER node
# The instance bootstrap resolves TI_INSTANCE_CLASS/CONFIG relative to cwd, so cwd must be the competence package dir.
WORKDIR /app/packages/competence
EXPOSE 3000

# Liveness probe: any HTTP response with status < 500 means the server is up (auth redirects are fine).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.TI_WEB_PORT||3000)+'/login',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# @ti-engine/core is hoisted to /app/node_modules and symlinked to /app/packages/core.
CMD ["node", "/app/node_modules/@ti-engine/core/bin/start-instance.js"]
```

- [ ] **Step 2: Create the .dockerignore (repo root)**

Create `.dockerignore`:
```gitignore
# Git & CI metadata
.git
.github
.gitignore

# Dependencies are installed inside the image
node_modules
**/node_modules

# Local dev / IDE / tooling
.idea
.vscode
.claude
**/.run

# Environment & secrets — never ship these into the image
**/.env
.env.*
!.env.example
**/bin/tls

# Tests, docs and design artifacts (not needed at runtime)
**/test
docs

# Lockfile is gitignored and builds use `npm install`
package-lock.json
**/package-lock.json
```

- [ ] **Step 3: Create docker-compose.yml (repo root)**

Create `docker-compose.yml`:
```yaml
# Local development stack for the competence app.
# Usage: `docker compose up --build` then open http://localhost:3000/login
services:
  redis:
    # Redis Stack bundles the JSON module the app requires (JSON.MERGE / JSON.MGET).
    # Alternative smaller image if you prefer: image: redis:8-alpine
    image: redis/redis-stack-server:latest
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 10s
      timeout: 3s
      retries: 5

  competence:
    build:
      context: .
      dockerfile: packages/competence/Dockerfile
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      TI_MEMORY_CACHE_REDIS_HOST: redis
      TI_MEMORY_CACHE_REDIS_PORT: "6379"
      TI_MEMORY_CACHE_REDIS_DB: "0"
      TI_WEB_HOST: 0.0.0.0
      TI_WEB_PORT: "3000"
      TI_WEB_USE_TLS: "false"
      TI_AUDITING_LOG_MIN_LEVEL: "0"
      # Dev-only application flags:
      COMPETENCE_PRELOAD_DATA: "false"        # set "true" once to seed demo data (destructive)
      COMPETENCE_TEST_USER_ENABLED: "true"    # dev-only login test panel; MUST be false in production
      # Secrets — dev-only fallbacks; ALWAYS override with real values in production:
      TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY: "${TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY:-dev-only-not-for-prod-change-me}"
      TI_WEB_COOKIE_SECRET: "${TI_WEB_COOKIE_SECRET:-dev-only-not-for-prod-change-me}"

volumes:
  redis-data:
```

- [ ] **Step 4: Create .env.example (repo root)**

Create `.env.example`:
```gitignore
# ---------------------------------------------------------------------------
# competence — environment template. Copy to `.env` and fill in real values.
# `.env` is gitignored. NEVER commit real secrets. Placeholders below are safe.
# ---------------------------------------------------------------------------

# --- Instance identity (defaults are baked into the image; override only if needed) ---
TI_INSTANCE_NAME=ti-competence
TI_INSTANCE_CLASS=bin/competence-web-server.js
TI_INSTANCE_CONFIG=bin/competence-web-server.json
TI_LOCALIZATION_LABELS_PATH=bin/localization/competence-labels.json
TI_AUDITING_LOG_MIN_LEVEL=0

# --- Web binding (container-friendly; a reverse proxy should terminate TLS) ---
TI_WEB_HOST=0.0.0.0
TI_WEB_PORT=3000
TI_WEB_USE_TLS=false
TI_WEB_APP_STATIC_CACHE_DISABLED=false

# --- Redis (must have the JSON module: Redis Stack or Redis 8+) ---
TI_MEMORY_CACHE_REDIS_HOST=redis
TI_MEMORY_CACHE_REDIS_PORT=6379
TI_MEMORY_CACHE_REDIS_DB=0
TI_MEMORY_CACHE_AUTH_KEY=

# --- Secrets (set to strong random values in production) ---
TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY=<set-a-strong-random-value>
TI_WEB_COOKIE_SECRET=<set-a-strong-random-value>

# --- Application flags ---
COMPETENCE_PRELOAD_DATA=false
COMPETENCE_TEST_USER_ENABLED=false

# --- Optional OAuth (leave unset to disable) ---
#TI_GCLOUD_AUTH_CLIENT_ID=<google-client-id>
#TI_GCLOUD_AUTH_CLIENT_SECRET=<google-client-secret>
#TI_GCLOUD_AUTH_CALLBACK_URL=https://your-host/login/google-callback
#TI_AZURE_AUTH_CLIENT_ID=<azure-client-id>
#TI_AZURE_AUTH_CLIENT_SECRET=<azure-client-secret>
#TI_AZURE_AUTH_CALLBACK_URL=https://your-host/login/azure-callback
```

- [ ] **Step 5: Ignore root `.env` (keep `.env.example`)**

In the repo-root `.gitignore`, append:
```gitignore
# Local environment files (root, for docker compose) — keep the template
.env
!.env.example
```
Do NOT remove the existing `package-lock.json` ignore lines (the lockfile stays ignored per the accepted decision).

- [ ] **Step 6: Static validation**

Run from repo root (these do not require Docker):
- `git check-ignore .env` → Expected: prints `.env` (confirms it is ignored).
- `git check-ignore .env.example` → Expected: **no output / exit 1** (confirms the template is NOT ignored).
- YAML sanity: `node -e "const fs=require('fs');const s=fs.readFileSync('docker-compose.yml','utf8');if(!/services:/.test(s)||!/competence:/.test(s))process.exit(1);console.log('compose yaml ok')"` → Expected: `compose yaml ok`.
- If `docker` is available: `docker compose config -q` → Expected: no error. If Docker is not installed, skip and note it for the Task 8 user smoke test.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/Dockerfile .dockerignore docker-compose.yml .env.example .gitignore
git commit -m "build(competence): add Docker image, compose stack, and env template (CA-###)"
```

---

### Task 4: CI + CD GitHub Actions workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/cd.yml`

**Pre-check (determines whether prettier goes into CI):**

- [ ] **Step 1: Establish the lint/format baseline locally**

Run from repo root:
- `npx eslint .` → note whether it passes cleanly on the current tree.
- `npx prettier --check .` → note whether it passes cleanly.
Decision rule: include a workflow step only for a checker that passes on the **current** tree. If eslint reports only pre-existing issues unrelated to this work, still include eslint (it is the project's linter) but do not attempt a mass fix here; if prettier reports pre-existing violations, **omit the prettier step** (or the whole format check) rather than shipping a red pipeline. Record the decision inline.

- [ ] **Step 2: Create the CI workflow**

Create `.github/workflows/ci.yml` (include the `Format check` step **only if** Step 1 showed prettier is clean — otherwise delete that one step):
```yaml
name: CI

on:
  pull_request:
    branches: [ master ]
  push:
    branches: [ current, master ]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
      # No npm cache: it keys off package-lock.json, which is gitignored in this repo.
      - name: Install dependencies
        run: npm install
      - name: Lint
        run: npx eslint .
      - name: Format check
        run: npx prettier --check .
      - name: Unit tests
        run: npm test --workspaces --if-present
      - name: JSON config validation
        run: npm run test:json -w @ti-engine/competence

  docker-build:
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build image (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: packages/competence/Dockerfile
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Create the CD workflow**

Create `.github/workflows/cd.yml`:
```yaml
name: CD

on:
  push:
    branches: [ master ]
    tags: [ 'competence-v*' ]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Derive image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/belleal/ti-engine-competence
          tags: |
            type=edge,branch=master
            type=sha
            type=match,pattern=competence-v(.*),group=1
            type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/competence-v') }}
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: packages/competence/Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 4: Static validation**

- YAML sanity for both files: `node -e "['ci','cd'].forEach(n=>{const s=require('fs').readFileSync('.github/workflows/'+n+'.yml','utf8');if(!/jobs:/.test(s))throw new Error(n);});console.log('workflows ok')"` → Expected: `workflows ok`.
- If `actionlint` is available, run `actionlint .github/workflows/ci.yml .github/workflows/cd.yml`; otherwise review by eye against the code above (action version pins, indentation, `${{ }}` expressions).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/cd.yml
git commit -m "ci(competence): add GitHub Actions CI + GHCR publish workflows (CA-###)"
```

---

### Task 5: Modernize the stale CodeQL workflow

**Files:**
- Modify: `.github/workflows/codeql-analysis.yml`

- [ ] **Step 1: Replace the file contents**

Overwrite `.github/workflows/codeql-analysis.yml` with:
```yaml
name: "CodeQL"

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]
  schedule:
    - cron: '29 9 * * 1'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [ 'javascript-typescript' ]
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

- [ ] **Step 2: Static validation**

Run: `node -e "const s=require('fs').readFileSync('.github/workflows/codeql-analysis.yml','utf8');if(!/codeql-action\/analyze@v3/.test(s))process.exit(1);console.log('codeql ok')"` → Expected: `codeql ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql-analysis.yml
git commit -m "ci: modernize CodeQL workflow to codeql-action@v3 / checkout@v4 (CA-###)"
```

---

### Task 6: competence start script, deployment docs, version bump + root scripts

**Files:**
- Modify: `packages/competence/package.json` (start script + version)
- Modify: `packages/competence/README.md` (Deployment / Docker section)
- Modify: `packages/competence/CHANGELOG.md`
- Modify: `package.json` (repo root — convenience scripts)

- [ ] **Step 1: Add the competence `start` script and bump the version**

In `packages/competence/package.json`:
- In `scripts`, add (keep `test`/`test:json`):
```json
    "start": "node ../../node_modules/@ti-engine/core/bin/start-instance.js",
```
- Bump `"version": "3.12.0"` → `"3.13.0"`.

- [ ] **Step 2: Verify the start script resolves (sanity, no Redis needed)**

Run from `packages/competence`: `node -e "require.resolve('@ti-engine/core/bin/start-instance.js'); console.log('entry resolves')"`
Expected: `entry resolves` (confirms the CMD/entry path is valid in the workspace layout).
> Note: do NOT run `npm start` here — it would try to connect to Redis, which is unavailable in this environment. Full boot is covered by the Task 8 user smoke test.

- [ ] **Step 3: Add the Deployment / Docker section to the competence README**

In `packages/competence/README.md`, add a top-level section (place it after the intro / before deep internals):
```markdown
## Deployment (Docker)

The competence app ships as a container built from the monorepo. It requires a Redis
instance **with the JSON module** (Redis Stack, or Redis 8+).

### Local development

```bash
cp .env.example .env   # then set the two secret values
docker compose up --build
# open http://localhost:3000/login
```

The compose stack starts Redis Stack + the app. `COMPETENCE_TEST_USER_ENABLED=true` (dev only)
enables the login test panel.

### Building the image standalone

```bash
docker build -f packages/competence/Dockerfile -t ti-engine-competence:local .
docker run --rm -p 3000:3000 \
  -e TI_MEMORY_CACHE_REDIS_HOST=<redis-host> \
  -e TI_WEB_HOST=0.0.0.0 -e TI_WEB_USE_TLS=false \
  -e TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY=<strong-random> \
  -e TI_WEB_COOKIE_SECRET=<strong-random> \
  ti-engine-competence:local
```

### Production notes

- Put a TLS-terminating reverse proxy / ingress in front (the container runs plain HTTP;
  it trusts `X-Forwarded-*`). Keep `TI_WEB_USE_TLS=false`.
- Set `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` and `TI_WEB_COOKIE_SECRET` to strong, private values.
- Set `COMPETENCE_TEST_USER_ENABLED=false` (default).
- Point `TI_MEMORY_CACHE_*` at your JSON-capable Redis; set `TI_MEMORY_CACHE_AUTH_KEY` if it requires auth.
- See `.env.example` for the full variable list. Images are published to
  `ghcr.io/belleal/ti-engine-competence` (`:latest`, `:X.Y.Z` on `competence-v*` tags, `:edge` on master).
```

- [ ] **Step 4: Add the CHANGELOG entry**

In `packages/competence/CHANGELOG.md`, add at the top:
```markdown
## Version 3.13.0
* feat(competence): containerize the app — multi-stage Dockerfile, docker compose dev stack, `.env` template, and a `start` script
* build(competence): GitHub Actions CI (lint/test/build) and CD (publish to ghcr.io/belleal/ti-engine-competence)
* docs(competence): add a Deployment (Docker) section to the README
```

- [ ] **Step 5: Add root convenience scripts**

In the repo-root `package.json`, add a `scripts` block (it currently has none — insert before `devDependencies`):
```json
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "npm test --workspaces --if-present"
  },
```

- [ ] **Step 6: Validate**

Run from repo root: `node -e "require('./packages/competence/package.json'); require('./package.json'); console.log('json ok')"` → Expected: `json ok` (both files parse).
Run: `npm test --workspaces --if-present` → Expected: all package suites PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/package.json packages/competence/README.md packages/competence/CHANGELOG.md package.json
git commit -m "feat(competence): add start script, deployment docs, version 3.13.0 + root scripts (CA-###)"
```

---

### Task 7: Full static verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run all unit tests across the workspace**

Run from repo root: `npm test --workspaces --if-present`
Expected: core, web-framework (incl. the new env-override suite), and competence suites all PASS.

- [ ] **Step 2: Run the linter on the whole tree**

Run: `npx eslint .`
Expected: no new errors introduced by this work (pre-existing issues, if any, unchanged).

- [ ] **Step 3: Confirm no secrets or certs are in the build context**

Run: `git ls-files | grep -Ei "\.env$|/bin/tls/" || echo "no committed secrets/certs"`
Expected: only `packages/competence/.env` (the existing non-secret app env) may appear; confirm no `bin/tls` files and no root `.env` are tracked.

- [ ] **Step 4: Confirm the commit series is clean**

Run: `git log --oneline -6`
Expected: the Task 2–6 commits present, each referencing `CA-###`; working tree clean (`git status --short` empty).

---

### Task 8: Hand-off — user smoke test + YouTrack update

**Files:** none (hand-off + tracking).

- [ ] **Step 1: Produce the local smoke-test checklist for the user**

Present this checklist (Docker/Redis are unavailable in the implementation environment, so the user runs it):
1. `docker build -f packages/competence/Dockerfile -t ti-engine-competence:local .` → builds without error.
2. `cp .env.example .env`; set `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` and `TI_WEB_COOKIE_SECRET`.
3. `docker compose up --build` → both services start; `redis` becomes healthy; app logs show Redis connected and `Starting new instance of type 'ti-competence'` + listening on `0.0.0.0:3000`.
4. Open `http://localhost:3000/login` → login screen renders; a dev test-user login works.
5. `docker compose down` → clean shutdown (SIGTERM handled).

- [ ] **Step 2: Update YouTrack**

- Load `mcp__youtrack__update_issue` + `mcp__youtrack__log_work` (ToolSearch if not loaded).
- Set `CA-###` `State: Verified` / `Stage: Done` after the user confirms the smoke test (or `In Progress` pending their confirmation).
- Log the time spent on the task.

- [ ] **Step 3: Offer branch completion**

Invoke `superpowers:finishing-a-development-branch` to choose how to integrate (`current` → PR to `master`, etc.).

---

## Self-Review

**Spec coverage:**
- §5.1 web-framework env overrides → Task 2 ✅
- §5.2 Dockerfile → Task 3 Step 1 ✅
- §5.3 docker-compose → Task 3 Step 3 ✅
- §5.4 .dockerignore → Task 3 Step 2 ✅
- §5.5 .env.example + root `.env` ignore → Task 3 Steps 4-5 ✅
- §5.6 CI workflow → Task 4 ✅ (prettier gated on the local baseline, per spec)
- §5.7 CD workflow → Task 4 Step 3 ✅
- §5.8 CodeQL modernization → Task 5 ✅
- §5.9 competence start/README/version + root scripts → Task 6 ✅
- §8 verification (static here + user smoke test) → Tasks 7-8 ✅
- §9 YouTrack tracking → Task 1 + Task 8 ✅

**Placeholder scan:** `CA-###` is the intentional tracking id from Task 1 (resolved before commits) — not a plan placeholder. No `TODO`/`TBD`/"add error handling"/"similar to" left; every code step shows full content.

**Type/name consistency:** `applyWebConfigEnvOverrides(config, env)` (default export of `#web-config-env`) is named identically in the module (Task 2 Step 4), its require/wire-in (Task 2 Step 6), and its test (Task 2 Step 1). Env var names (`TI_WEB_HOST/PORT/USE_TLS/TLS_CERT_PATH/TLS_KEY_PATH/COOKIE_SECRET`) match across the helper, Dockerfile, compose, `.env.example`, and README. Image name `ghcr.io/belleal/ti-engine-competence` matches across CD workflow and README.
