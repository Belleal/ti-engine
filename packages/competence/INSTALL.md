# Competence — Installation & Operations Guide

**Audience:** system administrators deploying the **competence** HR appraisal application.
**Scope:** installing, configuring, running, upgrading, and troubleshooting the app as a container. Application usage (running appraisal cycles, etc.) is out of scope.

> **Package versions this guide targets:** competence `3.19.1`, `@ti-engine/web-framework` `1.23.0`, `@ti-engine/core` `1.11.0`. Container image: `ghcr.io/belleal/ti-engine-competence`.
>
> `core` 1.8.0 raises the framework's own Redis floor to 6.0 (`ioredis` 6 defaults to the RESP3 protocol). This guide already requires Redis Stack or Redis 8+ for the JSON module, so nothing here changes.

---

## 1. Read first — maturity & security notices

The competence app is functional but still evolving. Please account for the following **before a production rollout**:

1. **Azure SSO is the default; local auth is off.** The container ships with `TI_WEB_AUTH_METHODS=openid-azure`, so the only sign-in method is Azure OpenID Connect — **you must configure the Azure credentials** (§7) or the login page will show "no sign-in method is configured." Local username/password auth is **disabled by default**. It is a real, directory-backed sign-in method, not hardcoded credentials: it is provisioned from a JSON file of `username`/`email`/`name`/`passwordHash` records (§7, "Local auth"), and because a record carries an email, a local sign-in resolves to an employee exactly like an SSO identity does. It still has **no rate limiting, no lockout and no password policy**, so do not enable `local` for an internet-facing deployment. If you need a break-glass path, provision a directory entry deliberately and briefly — point `TI_WEB_AUTH_LOCAL_USERS_PATH` at a users file and add `local` via `TI_WEB_AUTH_METHODS` (§7) — giving that entry either an email matching an active employee record, or an identity on the admin allowlist (§7, "Employee identity and sign-in").
2. **Disable the test-user panel in production.** The login screen has a developer "test user" selector gated behind `COMPETENCE_TEST_USER_ENABLED`. It **must be `false`** (the default) in production — when on, it lets the client choose the acting identity and roles.
3. **Redis is the system of record, not a cache.** Application data (evaluations, cycles, employees, role grants, results snapshots, audit log) is stored in Redis via the JSON module. **Redis must be persisted and backed up** (see §6, §15). Losing Redis means losing application data.
4. **Secrets must be supplied at deploy time.** The message-integrity key and session cookie secret default to insecure/ephemeral values; set strong ones (§8) or sessions and tamper-protection are ineffective.
5. **TLS is terminated outside the container.** The container serves plain HTTP; put a TLS-terminating reverse proxy / ingress in front (§9).
6. **Admin screens default to no admins.** The admin configuration UI is gated to identities listed in the web-server config's `auth.admins`, which is empty by default (§11).

---

## 2. Architecture

```
                        HTTPS                     HTTP (:3000)                 RESP/JSON
   Browser  ───────────────────────►  Reverse proxy / ingress  ─────────────►  competence container  ◄──────────►  Redis (with JSON module)
                                       (terminates TLS,                          (Node 22, non-root)                 (Redis Stack or Redis 8+)
                                        sets X-Forwarded-*)
```

- **competence container** — a Node.js 22 web server (built on the ti-engine framework). Listens on port **3000**, binds `0.0.0.0`, runs as a non-root user, serves plain HTTP, and trusts `X-Forwarded-*` headers from the proxy.
- **Redis** — **must include the JSON module** (RedisJSON). Use **Redis Stack** or **Redis 8+**. Plain `redis:7` will not work.
- **Reverse proxy / ingress** — terminates TLS and forwards to the container on port 3000 (§9).

There are no other required services. (The framework can call peer ti-engine services over Redis, but competence needs only Redis to run.)

---

## 3. Prerequisites

| Requirement              | Notes                                                                                                                                                     |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Container runtime        | Docker Engine 20.10+ (verified on 29.x) or any OCI runtime. Docker Compose v2+ for the compose method (verified on v5.x).                                 |
| Redis with JSON module   | Redis Stack (`redis/redis-stack-server`) or Redis 8+. Reachable from the container.                                                                       |
| Reverse proxy / ingress  | nginx, Traefik, HAProxy, or a Kubernetes ingress to terminate TLS.                                                                                        |
| Outbound registry access | To pull `ghcr.io/belleal/ti-engine-competence` (GHCR).                                                                                                    |
| CPU / memory (guidance)  | The app is lightweight (single Node process). Start with 0.5 vCPU / 512 MB for the app; size Redis to your dataset + persistence. Adjust from monitoring. |

> If you build the image yourself instead of pulling it, you also need the monorepo source and Node 22; see §5.

---

## 4. The container image

- **Name:** `ghcr.io/belleal/ti-engine-competence`
- **Tags:**
  - `:X.Y.Z` — a released version (e.g. `:3.16.0`), published from a `competence-v*` git tag. **Use a pinned version tag in production.**
  - `:latest` — the most recent released version.
  - `:edge` — the tip of `master` (pre-release; for staging only).

### Cutting a release

Two ways, both producing the same `competence-v<version>` tag and the same images.

**From the Actions tab (no local git needed).** Run the **CD** workflow with *Run workflow*, choose the ref you are releasing, and enter the bare version — `3.31.0`, not `v3.31.0`. The workflow creates and pushes the tag, then builds and publishes in the same run.

It refuses to proceed unless the version matches `packages/competence/package.json` **at the ref you selected**, so a tag can never point at a commit that declares a different version. A back-dated release is simply dispatched from the commit that declares it. It also refuses to overwrite an existing tag — releases are immutable, so bump the version instead.

**By pushing the tag yourself**, which is unchanged:

```bash
git tag -a competence-v3.31.0 -m "competence 3.31.0"
git push origin competence-v3.31.0
```

> The dispatch path builds and publishes inside the run that creates the tag rather than relying on the `push: tags:` trigger, because a tag pushed with `GITHUB_TOKEN` does not start another workflow.
- **Base:** `node:22-alpine`, non-root (`node` user), `NODE_ENV=production`.
- **Pulling:** if the package is public, `docker pull ghcr.io/belleal/ti-engine-competence:3.19.1`. If private, authenticate to GHCR first:
  ```bash
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-username> --password-stdin
  ```

---

## 5. Building the image yourself (optional)

The image builds from the monorepo root as the build context:

```bash
git clone https://github.com/Belleal/ti-engine.git
cd ti-engine
docker build -f packages/competence/Dockerfile -t competence:local .
```

The build is a multi-stage Node 22 Alpine build (no native toolchain needed). It installs workspace dependencies and bundles the front-end assets automatically.

---

## 6. Redis (required)

competence needs Redis **with the JSON module**.

- **Recommended image:** `redis/redis-stack-server:latest` (bundles RedisJSON). `redis:8-alpine` (or newer) also works.
- **Persistence:** enable AOF (and/or RDB) and mount a durable volume — Redis holds application data. Example for Redis Stack: run with `--appendonly yes` and a mounted `/data` volume.
- **Auth:** if Redis requires a password, set it and pass it to the app via `TI_MEMORY_CACHE_AUTH_KEY` (§7).
- **Network:** the app connects to `TI_MEMORY_CACHE_REDIS_HOST:TI_MEMORY_CACHE_REDIS_PORT` (default `6379`), DB `TI_MEMORY_CACHE_REDIS_DB` (default `0`). Note: some managed Redis offerings only allow DB `0`.

---

## 7. Configuration — environment variables

All configuration is via environment variables. **Bold = must set for production.**

### Instance identity (baked defaults; override only if needed)
| Variable                      | Default                                   | Purpose                                               |
|-------------------------------|-------------------------------------------|-------------------------------------------------------|
| `TI_INSTANCE_NAME`            | `ti-competence`                           | Service instance name.                                |
| `TI_INSTANCE_CLASS`           | `bin/competence-web-server.js`            | Entry class (leave as-is).                            |
| `TI_INSTANCE_CONFIG`          | `bin/competence-web-server.json`          | Service config path (leave as-is).                    |
| `TI_LOCALIZATION_LABELS_PATH` | `bin/localization/competence-labels.json` | Localization labels (leave as-is).                    |
| `TI_AUDITING_LOG_MIN_LEVEL`   | `0`                                       | Log verbosity floor (0 = all; raise to reduce noise). |

### Web binding
| Variable                                       | Default (image) | Purpose                                                             |
|------------------------------------------------|-----------------|---------------------------------------------------------------------|
| `TI_WEB_HOST`                                  | `0.0.0.0`       | Bind address. Keep `0.0.0.0` in a container.                        |
| `TI_WEB_PORT`                                  | `3000`          | Listen port.                                                        |
| `TI_WEB_USE_TLS`                               | `false`         | Keep `false` — TLS is terminated by the proxy (§9).                 |
| `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` | —               | Only if you terminate TLS *inside* the container (not recommended). |
| `TI_WEB_APP_STATIC_CACHE_DISABLED`             | `false`         | Leave `false` in production so static assets are cached.            |

### Application identity (shown on the in-app **About** screen)
| Variable                  | Default                       | Purpose                                                                                                     |
|---------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------------|
| `TI_WEB_APP_NAME`         | `Competence`                  | Display name on the About screen. Useful to distinguish environments, e.g. `Competence (staging)`.          |
| `TI_WEB_APP_VERSION`      | version from `package.json`   | Overrides the reported version. Leave unset unless you are repackaging.                                     |
| `TI_WEB_APP_RELEASE_DATE` | `releaseDate` in `package.json` | Overrides the reported release date. Set this to the build date when you build your own image from source. |

All three are display-only — nothing behaves differently based on them. Signed-in users see the name, version, release date, license and the ti-engine component versions; the Node/platform/instance block is shown to **admins only** (`TI_WEB_AUTH_ADMINS`, §7 Secrets).

### Authentication methods
| Variable                      | Default (image) | Purpose                                                                                                                                                                                                     |
|--------------------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TI_WEB_AUTH_METHODS`         | `openid-azure`  | Comma-separated list of enabled sign-in methods; **replaces** the configured set. Valid values: `openid-azure`, `openid-google`, `local`. The image default is Azure SSO only. Configure the chosen providers below. |
| `TI_WEB_AUTH_LOCAL_USERS_PATH` | *(empty)*       | Path to the local users file backing `local` sign-in — a JSON array of `{ username, email, name, passwordHash }` records (see "Local auth" below). Required for `local` to accept any sign-in at all.       |

- The login page renders **only** the methods listed here — e.g. the default `openid-azure` shows just the Azure button and **no** local form. An OpenID Connect provider that is listed but not configured (no client ID) is dropped with a startup warning and its button hidden. **`local` is different: it has no such check.** Listing `local` here always renders the sign-in form, whether or not a usable users file exists at `TI_WEB_AUTH_LOCAL_USERS_PATH` — without one, the form renders but no sign-in can succeed (every attempt is refused; see "Local auth" below).
- To also offer Google: `TI_WEB_AUTH_METHODS=openid-azure,openid-google`. For a local break-glass (dev/emergency only): add `local` and point `TI_WEB_AUTH_LOCAL_USERS_PATH` at a users file containing one provisioned record (see "Local auth" below, and §1) — there are no hardcoded credentials to fall back on.
- If the effective list is empty (e.g. Azure listed but unconfigured), the login page shows a "no sign-in method is configured" message instead of a broken form.

### Redis
| Variable                     | Default     | Purpose                                          |
|------------------------------|-------------|--------------------------------------------------|
| `TI_MEMORY_CACHE_REDIS_HOST` | `127.0.0.1` | Redis host. Set to your Redis service name/host. |
| `TI_MEMORY_CACHE_REDIS_PORT` | `6379`      | Redis port.                                      |
| `TI_MEMORY_CACHE_REDIS_DB`   | `0`         | Redis DB index.                                  |
| `TI_MEMORY_CACHE_AUTH_KEY`   | *(empty)*   | Redis password, if required.                     |

### Secrets — set strong values in production
| Variable                                    | Purpose                                                                                                                                                          |
|---------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **`TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`** | Keyed HMAC for message-integrity/tamper protection. If unset, a startup **warning** is logged and tamper protection is ineffective.                              |
| **`TI_WEB_COOKIE_SECRET`**                  | Session cookie signing secret. Set a stable, private value so sessions survive restarts and work across replicas (otherwise a random per-process value is used). |

### Application flags
| Variable                           | Default | Purpose                                                                    |
|------------------------------------|---------|----------------------------------------------------------------------------|
| `COMPETENCE_PRELOAD_DATA`          | `false` | **Demo-data seed** — merges seed data on startup (re-applied each boot while `true`; does not wipe your data). Leave `false` for real installs (see §11). |
| **`COMPETENCE_TEST_USER_ENABLED`** | `false` | Dev-only login test-user panel. **Must be `false` in production.**         |

### Employee identity and sign-in

The acting employee is resolved from the email the user signs in with, matched against the `email` field of their
employee record. **Employee emails must match the addresses your identity provider issues** — an authenticated user
with no matching record cannot sign in, and sees a generic "we couldn't sign you in" message.

Sign-in is refused when:

- no employee record carries that email;
- the matching record's `employmentStatus` is anything other than `active` or `on-leave`;
- two or more employee records share the email (the app refuses rather than guessing; the duplicate is also logged as
  a `WARNING` at startup).

**Recovery.** An identity listed in `TI_WEB_AUTH_ADMINS` (or `auth.admins`) may sign in *without* an employee record.
That session has no employee identity and no application roles — it reaches only the administration screens — and
exists so a deployment with wrong or missing employee data can still be fixed through the admin UI. Set at least one
admin before enabling SSO.

**Local auth.** A local user is a record — `username`, `email`, `name` and a `passwordHash` — in the JSON file at
`TI_WEB_AUTH_LOCAL_USERS_PATH` (see "Authentication methods" above). Generate `passwordHash` with
`npm run hash-password -w @ti-engine/web-framework`, which reads the password from stdin and never writes it
anywhere. Because the record carries an email, a successful local sign-in resolves to an employee exactly like an
SSO identity does — through the same rules above, including the admin-allowlist recovery path for an email with no
employee record.

The file is the source of truth: it is reconciled into the running directory on every boot, so removing an entry
and restarting revokes that user's access — there is no separate delete action. `local` enabled with no users file
configured, a file that cannot be read, or a file with zero valid records, each logs a startup **WARNING** and
refuses every local sign-in rather than admitting one; a failed *read* leaves previously stored records untouched
rather than wiping them.

**There is still no rate limiting, no lockout after repeated failures, and no password policy** — see §1. The
dev-only test-user cookie (`COMPETENCE_TEST_USER_ENABLED`) is unaffected and continues to work normally for local
development, independent of `local`.

### OpenID Connect (Azure is the default SSO — configure it)
Azure is enabled by default (`TI_WEB_AUTH_METHODS=openid-azure`), so **you must set the Azure credentials below** for a working sign-in. Google is available if you add `openid-google` to `TI_WEB_AUTH_METHODS`. A method that is enabled but unconfigured (no client ID) is skipped with a warning and its button hidden, so the app still boots (and shows the "no method configured" message if nothing remains).

| Variable                                                    | Purpose                                         |
|-------------------------------------------------------------|-------------------------------------------------|
| `TI_GCLOUD_AUTH_CLIENT_ID` / `TI_GCLOUD_AUTH_CLIENT_SECRET` | Google OIDC client credentials.                 |
| `TI_GCLOUD_AUTH_CALLBACK_URL`                               | e.g. `https://your-host/login/google-callback`. |
| `TI_GCLOUD_AUTH_DISCOVERY_URL`                              | Google discovery URL (defaulted).               |
| `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET`   | Azure OIDC client credentials.                  |
| `TI_AZURE_AUTH_CALLBACK_URL`                                | e.g. `https://your-host/login/azure-callback`.  |
| `TI_AZURE_AUTH_DISCOVERY_URL`                               | Azure discovery URL.                            |

> Which methods are offered is controlled by `TI_WEB_AUTH_METHODS` (see *Authentication methods* above) — it cleanly overrides the web-server config's `auth.enabledMethods`. Callback URLs must match what you register with the provider and resolve against your public host.

**Callback URL form.** A callback variable accepts either the full absolute URL (`https://your-host/login/azure-callback`) or just the path (`/login/azure-callback`); the server listens on the path either way. The absolute form is the safer default — it is sent to the provider as the `redirect_uri` verbatim, so it always matches your registration. With the path form the redirect URI is assembled from the request's `X-Forwarded-Proto` / `X-Forwarded-Host` headers instead, so your reverse proxy must set them correctly or the provider will reject the sign-in (Azure `AADSTS50011`). Either way the **path** must be the one the app actually receives — if your proxy strips a path prefix before forwarding, use the stripped path.

---

## 8. Secrets management

- Generate strong values, e.g. `openssl rand -base64 48`, for `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` and `TI_WEB_COOKIE_SECRET`.
- Inject secrets via your orchestrator's secret store (Docker/Swarm secrets, Kubernetes `Secret`, your vault) — **never** bake them into the image or commit them.
- Rotate the Redis password and OAuth client secrets per your policy; treat any leaked value as compromised.

---

## 9. TLS / reverse proxy

The container serves plain HTTP on `:3000` and sets `trust proxy`, so it honors `X-Forwarded-Proto` / `X-Forwarded-Host`. Terminate TLS at the proxy and forward those headers.

**nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name competence.example.com;
    ssl_certificate     /etc/ssl/certs/competence.crt;
    ssl_certificate_key /etc/ssl/private/competence.key;

    location / {
        proxy_pass         http://competence:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }
}
```
Keep `TI_WEB_USE_TLS=false`. (Only set it `true` + provide certs if there is no TLS-terminating layer.)

**Trusted origins.** The app validates the `Origin`/`Referer` of state-changing requests (e.g. login) against the origin it reconstructs from the forwarded headers. If your proxy does not forward the external host faithfully (so the reconstructed origin differs from the browser's), those POSTs are rejected with HTTP 403 (`E_WEB_INVALID_REQUEST_PARAMETERS`, code 4005). Set **`TI_WEB_TRUSTED_ORIGINS`** (comma-separated, e.g. `https://competence.example.com`) to the public origin(s) the app is served under. The nginx example above forwards `X-Forwarded-Host`, so it does not need this; environments like GitHub Codespaces port forwarding do (the test Codespaces setup sets it automatically).

---

## 10. Installation

### Method A — Docker Compose (single host)

Create a `docker-compose.yml` (production-oriented; secrets from a `.env` file next to it or your secret store):

```yaml
services:
  redis:
    image: redis/redis-stack-server:latest
    command: [ "redis-stack-server", "--appendonly", "yes" ]
    volumes:
      - redis-data:/data
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  competence:
    image: ghcr.io/belleal/ti-engine-competence:3.19.1
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "3000:3000"           # expose only to your reverse proxy / internal network
    environment:
      TI_MEMORY_CACHE_REDIS_HOST: redis
      TI_WEB_HOST: 0.0.0.0
      TI_WEB_USE_TLS: "false"
      COMPETENCE_PRELOAD_DATA: "false"
      COMPETENCE_TEST_USER_ENABLED: "false"
      TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY: "${TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY}"
      TI_WEB_COOKIE_SECRET: "${TI_WEB_COOKIE_SECRET}"
      # Auth: the image defaults to Azure SSO (TI_WEB_AUTH_METHODS=openid-azure) — configure Azure:
      TI_AZURE_AUTH_CLIENT_ID: "${TI_AZURE_AUTH_CLIENT_ID}"
      TI_AZURE_AUTH_CLIENT_SECRET: "${TI_AZURE_AUTH_CLIENT_SECRET}"
      TI_AZURE_AUTH_CALLBACK_URL: "https://competence.example.com/login/azure-callback"
      TI_AZURE_AUTH_DISCOVERY_URL: "https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration"
      # To also offer Google, set: TI_WEB_AUTH_METHODS: "openid-azure,openid-google" and add the TI_GCLOUD_AUTH_* vars.
    restart: unless-stopped

volumes:
  redis-data:
```

Bring it up:
```bash
docker compose up -d
docker compose logs -f competence      # watch startup
```

> The repository also ships a **dev** `docker-compose.yml` at its root (with dev flags on and throwaway secret defaults) for local evaluation — do not use that one in production.

### Method B — standalone container

Behind your own Redis + proxy:
```bash
docker run -d --name competence \
  -p 3000:3000 \
  -e TI_MEMORY_CACHE_REDIS_HOST=<redis-host> \
  -e TI_MEMORY_CACHE_REDIS_PORT=6379 \
  -e TI_MEMORY_CACHE_AUTH_KEY=<redis-password-if-any> \
  -e TI_WEB_HOST=0.0.0.0 -e TI_WEB_USE_TLS=false \
  -e COMPETENCE_TEST_USER_ENABLED=false \
  -e TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY=<strong-random> \
  -e TI_WEB_COOKIE_SECRET=<strong-random> \
  ghcr.io/belleal/ti-engine-competence:3.19.1
```

### Method C — Kubernetes (pointers)

- Map the env vars above to a `ConfigMap` (non-secret) + `Secret` (the two secrets, Redis password, OAuth secrets).
- Run Redis Stack (or Redis 8+) as a `StatefulSet` with a `PersistentVolumeClaim`, or use a managed JSON-capable Redis.
- Expose the app with a `Service` (port 3000) + `Ingress` that terminates TLS and forwards `X-Forwarded-*`.
- Liveness/readiness probe: HTTP `GET /health` on port 3000 (returns `200` while serving); for readiness you can additionally gate on the JSON body's `broker` field being `connected` (see §12).

### Method D — Google Cloud Run (scale-to-zero test environment)

A hosted environment that costs approximately nothing when idle: one Cloud Run
service holding the app plus a `redis:8-alpine` sidecar, with Redis snapshotting
to a mounted Cloud Storage bucket so data survives scale-to-zero. Fronted by
Identity-Aware Proxy with an email allowlist.

> **First-time setup:** follow [`deploy/gcp/WALKTHROUGH.md`](deploy/gcp/WALKTHROUGH.md),
> a guided nine-phase run through both the Google Cloud and GitHub sides. It covers the
> ordering that must be respected (Google Cloud before GitHub), the two steps that fail
> by design on a first deploy, and the post-deploy checks. The summary below is the
> reference form.

Scripts live in [`deploy/gcp/`](deploy/gcp/README.md); run them in Cloud Shell:

```bash
cd packages/competence/deploy/gcp
./bootstrap.sh                                  # one-time, idempotent
GOOGLE_CLIENT_ID=<client-id> ADMIN_EMAILS=<your-email> ./deploy.sh
```

`ADMIN_EMAILS` populates `TI_WEB_AUTH_ADMINS`; omit it and the admin
configuration screens stay unreachable.

`bootstrap.sh` prints the manual steps it cannot script: creating the app's
OAuth client (consent screen **Internal**), storing its client secret, enabling
IAP in the Console, and granting testers `roles/iap.httpsResourceAccessor`.

**Before merging this branch to `master`:** set the three GitHub repository
variables `bootstrap.sh` prints at the end of its run — `GCP_PROJECT_ID`,
`GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` (repo Settings → Secrets and variables →
Actions → Variables). The CD workflow's Google Cloud authentication step is
unconditional, so without them the whole `publish` job fails on every push to
`master` — including the GHCR push that works today. Setting the variables
does not, by itself, update the running service: a new `master` build only
reaches it once `deploy.sh` is re-run.

**Properties and limits of this shape:**

- **`max-instances=1` is mandatory, not tuning.** Two instances would mean two
  Redis processes writing the same snapshot object.
- **Durability window.** Redis saves 30 seconds after a write and again on
  `SIGTERM` when Cloud Run stops the instance. Writes after the last save are
  lost if the instance dies without a clean shutdown, or if the save exceeds the
  ~10-second shutdown grace. Fine for synthetic test data; not a production
  durability guarantee.
- **Redeploy while idle.** A deploy creates two revisions — the old one
  draining while the new one starts — so redeploying while someone is actively
  using the app can let the draining instance's shutdown save overwrite the
  snapshot with a stale one. Redeploy when the service is idle.
- **`/health` doesn't see Redis write-health.** It returns `200` whenever the
  app is serving, regardless of whether the bucket mount is actually writable —
  a broken mount shows up as write failures in the app, not as an unhealthy
  instance. The Redis-aware signal is the `broker` field in the same JSON body
  (§12).
- **Cold start of roughly 5–15 seconds** for the first request after idle.
- **The service URL is a configuration dependency.** It is baked into
  `TI_WEB_TRUSTED_ORIGINS` and the OAuth callback; recreating the service changes
  it and breaks sign-in until `deploy.sh` is re-run and the redirect URI updated.
- **Test-user mode is on**, so any authenticated visitor can act as any
  employee. IAP is the only thing preventing that. Do not disable it, and do not
  put real employee data here.
- **Locked out?** Re-enabling `local` now actually helps: rebuild and redeploy
  with a local users file baked into the image (or mounted from a Secret
  Manager volume) at the path you set in `TI_WEB_AUTH_LOCAL_USERS_PATH`,
  containing one record whose `email` is also in `ADMIN_EMAILS`, with its
  `passwordHash` generated by `npm run hash-password -w @ti-engine/web-framework`.
  Add `local` to `TI_WEB_AUTH_METHODS` and redeploy; that identity then signs
  in as an admin the same way an allowlisted OAuth identity would (§7, "Local
  auth" and "Recovery"). If the OAuth client itself is broken for every
  identity, repair it directly — its secret, its redirect URI — and
  redeploy, rather than trying to route around it through the login page.


---

## 11. First run & data

- **Demo data:** `COMPETENCE_PRELOAD_DATA=true` seeds demo data (employees, a cycle, sample evaluations) by merging it into the collections on startup. It does **not** wipe existing data — collections are only initialized when empty, so data you create persists across restarts. While the flag stays `true` the seed is re-applied on every boot (re-adding seeded records), so set it back to `false` once seeded. Leave it `false` for a real install (you start empty).
- **Organization structure:** the org chart is a store-backed configuration document, editable in
  **Administration → Configuration** like any other. The file baked into the image is only the bootstrap default,
  seeded on a first run; from then on the stored value wins. Reflecting *your* organization is therefore a
  configuration task, not a rebuild. It is deliberately excluded from the configuration-drift report: it holds your
  data rather than content shipped with the release, so it differs from the image default by design.
- **Admin access:** the admin configuration screens are gated to identities listed in the web-server config `auth.admins` (empty by default → no admins). Set it per environment with **`TI_WEB_AUTH_ADMINS`** (comma-separated; matched against the session user's user ID, username or email — so an OpenID deployment lists emails), or in the config file for a baked-in default. Other non-env config such as the organization structure remains a configuration step — coordinate with the application owner.
- **First login:** browse to your HTTPS host. With the default `TI_WEB_AUTH_METHODS=openid-azure`, you sign in via Azure — so Azure must be configured (§7), otherwise the page shows "no sign-in method is configured." (Adding `local` to `TI_WEB_AUTH_METHODS` makes its sign-in form appear immediately — the form itself does not depend on a users file existing — but no sign-in can *succeed* until you provision a record for that identity in the file at `TI_WEB_AUTH_LOCAL_USERS_PATH`; with no matching record, or a wrong password, it's refused; dev/break-glass only, see §1 and §7, "Local auth".)

### Importing employee data

Once the organization structure reflects your organization, load employees either from the **Employee Import
screen** in the application (admin-only, no shell needed — see "The Employee Import screen" below) or with the
bundled CLI. Both run the same importer against the same CSV; the CLI is described first because it is the path
that works before anyone can sign in, and it is the one to use when you want a shell, a Redis snapshot taken
first, and a scriptable exit code.

The CLI is `bin/build/import-organization.js` (`npm run import:org`). It reads a CSV export from your HRIS,
reconciles it against whatever is already in Redis, and either prints or applies the resulting plan — it never touches employee
data on its own. Run it with access to the same Redis your deployment uses: `docker exec` into the running
container (the image's `WORKDIR` is already the competence package directory, so the command below runs as-is), or
run it from any host with the Redis connection variables (§7, "Redis") pointed at that Redis. A file is not already
inside the container — copy it in first with `docker cp employees.csv <container>:/tmp/employees.csv`.

**Handing the work to HR.** `docs/templates/employee-import-template.xlsx` is a ready-made spreadsheet to give to
whoever collects the data. It carries the columns in the right order, dropdowns for every fixed-vocabulary field —
except `work_site`, deliberately left free text, since the valid codes are per-deployment configuration
(**Administration → Work Sites**) and a committed dropdown would carry the demo codes into every real install —
text-formatted ID and date columns so Excel cannot strip a leading zero or reformat a date, duplicate-email and
duplicate-ID highlighting, and its own export instructions. Fill in the organization-unit table on its *Valid
values* sheet before sending it, since those IDs come from your configured structure and the template cannot know
them. Whoever fills it in returns a CSV, not the spreadsheet.

**The column contract.** One row per employee, UTF-8, first row a header. Column order is irrelevant; column names
are matched case-insensitively after trimming. `--template` prints the exact header row so you always start from a
valid one:

```bash
node bin/build/import-organization.js --template > employees.csv
```

| Column                 | Required | Notes                                                                                |
|------------------------|----------|---------------------------------------------------------------------------------------|
| `employee_id`          | yes      | The reconciliation key (see below). Matched verbatim — a leading zero must survive intact; see the warning below |
| `email`                | yes      | Lower-cased on import; must be unique across employees                              |
| `first_name`           | yes      |                                                                                       |
| `last_name`            | yes      |                                                                                       |
| `work_mode`            | yes      | `Full-time` / `Part-time` / `Contract`                                              |
| `work_location`        | yes      | `On-site` / `Hybrid` / `Remote`                                                      |
| `organization_unit_id` | yes      | Must exist in the current organization structure                                    |
| `role_family`          | yes      | `SE` `QE` `BA` `PM` `XD` `DA` `IO` `MC` `PD`                                         |
| `level`                | yes      | `N` `J` `R` `S` `X` `T`                                                              |
| `stage`                | yes      | `1`–`3`; `N`, `X` and `T` admit only stage `1`                                       |
| `employment_status`    | no       | `active` (default) / `on-leave` / `terminated`                                      |
| `birth_date`           | no       | `YYYY-MM-DD`                                                                         |
| `gender`               | no       | `M` or `F`, or blank                                                                 |
| `specialization`       | no       | One of the role family's configured specializations; an empty cell means a generalist |
| `starting_date`        | no       | `YYYY-MM-DD`                                                                         |
| `work_site`            | no       | Must exist in the current work-site nomenclature (**Administration → Work Sites**). Blank leaves any stored value unchanged |
| `position_name`        | no       | Free text, as written in the contract. Blank leaves any stored value unchanged      |

Enum columns are matched case-insensitively after trimming (`full time`, `FULL-TIME` and `Full-time` all match), but
never guessed at: a value that still does not match is rejected with the permitted values named, rather than mapped
to the closest one.

**Encoding and delimiter.** The file must be valid UTF-8 — an undecodable byte (e.g. a Windows-1251/CP1251 export of
Cyrillic names) fails the whole file rather than writing corrupted names. The delimiter (`,` or the `;` a
European-locale Excel export uses) is auto-detected from the header row; override it with `--delimiter ";"` if
detection ever picks the wrong one.

**Leading zeros.** If `employee_id` carries a leading zero (`00123`), opening the CSV in Excel and saving it again
silently strips it — and the importer then reconciles that row against a *different* employee, with no error from
anywhere in the pipeline to catch it. Prepare and edit the export with a text editor, or a spreadsheet with the
column explicitly formatted as text, never a spreadsheet's default cell format. This is also why `--template` emits
a bare header rather than a filled-in example: so a bulk edit does not start from, and get silently laundered
through, a spreadsheet.

**Dry run first, always.** Without `--apply`, the CLI only prints the plan — how many records it would create,
update, or leave unchanged, every rejection, and every employee on record in Redis but missing from the file. Nothing
is written. Resolve whatever is rejected and dry-run again until the plan is clean, or until only expected
rejections remain, before ever passing `--apply`:

```bash
node bin/build/import-organization.js --file /tmp/employees.csv                 # dry run — prints the plan, writes nothing
node bin/build/import-organization.js --file /tmp/employees.csv --apply         # writes
node bin/build/import-organization.js --file /tmp/employees.csv --delimiter ";" # override delimiter detection
```

**Restart the application after `--apply`.** Every org-chart rebuild and login email-index rebuild happens
in-process, inside the running server. This CLI is a separate process writing straight to Redis, so it cannot
trigger either one. Until you restart, an employee this run just wrote is in the store but invisible to the running
app — missing from the org chart and unable to sign in.

**Back up Redis before you `--apply` (§15) — an import has no rollback.** Applying is audited like any other
change, but employee records are not versioned the way store-backed configuration is, so there is no restore
action to undo one. Take a fresh Redis backup immediately before every `--apply`, not only the first.

**Exit codes** make a run scriptable: `0` — completed, nothing rejected; `1` — completed with one or more rows
rejected (a dry run never writes regardless of the exit code; with `--apply`, only the rejected rows were left out);
`2` — the run did not complete at all: the file itself was unusable, the Redis cache could not be reached (stderr
names the required env vars), or an `--apply` failed partway through (stderr then reports how many records were
written before it stopped, and which one didn't finish — see "no rollback" above).

Three conditions fail the whole file rather than the one row responsible, because each means the wrong file was
supplied rather than one flawed record among good ones: the file is not valid UTF-8, the header is missing a
required column, or the header repeats a column (case-insensitively — `Note` and `NOTE` collide). All three exit `2`.

**Only an `employee_id` is ever printed.** A rejection is identified by that and its source line number — never a
name, email, birth date or grade — because this runs against real HR data and a terminal or CI log is not a place
for it. Treat the output accordingly: an identification number is an identifier under GDPR Art. 4(1), so a
rejection list is pseudonymised personal data, not anonymous. It is safe to *reason about* without exposing anyone,
and it still belongs in a log, ticket or screenshot only where employee data is allowed to go.

Three behaviors are worth understanding before the first real import:

- **A leaver is marked `employment_status=terminated`, never removed from the file.** An employee who is in Redis
  but missing from the CSV is reported as absent from the file and left completely untouched. A departure is never
  inferred from an omission — a partial export would otherwise terminate half the organization.
- **Reconciliation is keyed on `employee_id`, not email or name.** An employee who changes their name or email keeps
  the same record, and with it their evaluation history — only a changed `employee_id` looks like a different
  person to the importer.
- **A blank optional cell means leave unchanged, not clear.** For `birth_date`, `gender` and `starting_date`, an
  empty cell leaves whatever is already stored for that person exactly as it is — it does not erase it. This
  importer cannot clear one of those three fields for someone. **Nor, at present, can Employee Management** —
  it clears them by omitting the key, and an employee record is written as a merge-patch, where an omitted key
  means "leave as it is". The screen reports success and shows the field blank, but the stored value survives and
  reappears on the next load. Correcting that is tracked separately; until then, treat those three as set-only.
  `work_site` and `position_name` are **not** affected — they are cleared by writing an empty value, which the
  merge does apply. (`specialization` is different again: an empty cell in the CSV is applied and does clear a
  previously-set specialization, turning the person into a generalist.)

### The Employee Import screen

**Administration → Employee Import** (admin-only) is the same importer without a shell. It accepts the same CSV,
subject to the same column contract, encoding rule and reconciliation logic described above — the handler behind it
calls the identical `organization-import` pipeline the CLI does, not a parallel implementation, so a file that is
clean for one is clean for the other. Choosing a file previews the plan (counts, rejections, and everyone on record
but absent from the file) without writing anything, the same as a dry run; **Apply import** then re-derives that
same plan from the CSV on the server rather than trusting the one the browser is showing, and only then writes it.

**An apply through the screen is exactly as irreversible as `--apply` — and the screen cannot take a Redis snapshot
for you.** Back up Redis first (§15), exactly as you would before the CLI's `--apply`; neither path leaves a restore
action to undo an import.

**It differs from the CLI in three ways, and only three:**

- **No restart.** The screen's apply runs inside the already-running server, so it rebuilds the organization chart
  and the login email index itself before returning — an imported employee is immediately reachable and can sign in
  without anyone restarting anything. Every org-chart rebuild call site is in-process; a CLI `--apply` writes to
  Redis from a separate process and has no way to trigger one, which is exactly why the CLI section above tells you
  to restart.
- **A 512 KB file-size limit.** The browser refuses a larger file before uploading it, with "That file is too
  large to upload." The cap sits well inside the server's 1 MB request-body limit so the refusal is a clear message
  rather than a rejected request; 512 KB of this CSV is well over 4000 employees, so a file that trips it is far
  more likely to be the wrong file than a real staff list. The CLI reads from disk and has no such limit — use it
  for a genuinely larger import.
- **No delimiter override.** Detection from the header row is all the screen has; there is no equivalent of the
  CLI's `--delimiter ";"`. In practice detection handles both `,` and the `;` a European-locale Excel export
  produces. If it ever picks wrong for your export the whole file is refused up front with "The header is missing
  required columns" naming every required column, because the header row parsed as one unsplit cell — run that file
  through the CLI with an explicit `--delimiter`.

### Work Sites

**Administration → Work Sites** (admin-only) edits the work-site nomenclature — the office or client premises an
employee reports to. This is a different fact from `work_location` (`On-site` / `Hybrid` / `Remote`), which records
the *arrangement* rather than the *place*: a Hybrid employee still reports to a specific office, and two people at
the same office can hold different arrangements. Each site is a code, a `type` (`office` or `client`), and a
bilingual `{ en, bg }` name; unlike role-family text, site names are stored inline, so an edit takes effect on save
with no export → commit → redeploy step.

**The file baked into the image is a generic demo default** — `HQ`, `OF1`, `CL1` — the same posture as the
organization structure (earlier in this section): it exists only to seed a first run. Enter your real sites through
the screen; the stored value wins from the first save onward, and because the `ti-engine` repository is public, the
real office and client list is never committed to it.

**A site still assigned to an employee cannot be removed.** The screen refuses the save with an error naming the
site, for example `work site 'HQ' is assigned to an employee and cannot be removed` — reassign every affected
employee's `work_site` to a different code (Employee Import or Employee Management), or clear it from Employee
Management (a blank cell on import leaves the stored value unchanged, so re-importing cannot clear it), then remove
the site.

**A confusable character is named, not silently accepted.** The CSV importer folds look-alike Cyrillic/Latin
letters (for example Cyrillic `О` U+041E vs. Latin `O` U+004F, visually identical in every common font) only to
explain a rejection — never to accept the value. A `work_site` cell typed with a Cyrillic look-alike of a real code
is still rejected, but the message names the specific offending character and the Latin one it should be instead of
listing the permitted codes (which would otherwise show what looks like an exact match on screen), for example:
`work_site 'О5' uses a Cyrillic О; the permitted code 'O5' uses a Latin O`.

**Migration note — gender.** `gender` is now constrained to `M` or `F` (or blank) on both write paths — the CSV
importer and Employee Management. A deployment whose stored employee records already carry some other value must
have them corrected: the field is now constrained, so the next write of such a record fails validation.

### Unresolved-manager warnings

On every startup, the app cross-checks each organization unit's `managerID` against the employee store and logs one
`WARNING` per unit whose manager does not resolve to an active employee, for example:

- `Organization unit '<unitID>' names manager '<managerID>', which does not resolve to an active employee (manager-not-found). That unit's employees have no manager, and nobody holds MANAGER over them.`

The warning names only a unit ID and a manager ID — never a person's name. This diagnostic has no admin-screen
surface; the startup log is the only place it currently appears.

**Expect a screenful of these between applying the org tree and importing employees.** The tree must exist before
an employee record can reference one of its units, so at that point in a fresh install no employee has been
imported yet and every unit that names a manager will report unresolved. That is expected, not a sign that anything
is broken — it clears once the matching employees are imported and the app is restarted.

**A warning that survives *after* the employee import is a different matter — an access-control problem, not a
cosmetic one.** Roles are derived from the org chart at login, so that unit's people genuinely have no MANAGER over
them (and, depending on where the unit sits in the tree, possibly no SUPERVISOR either). Fix it by correcting the
unit's `managerID` in **Administration → Configuration**, or by importing the employee it names if that employee
is simply missing from the store.

---

## 12. Health, logging & lifecycle

- **Health check:** the app exposes a dedicated unprotected **`GET /health`** endpoint that returns `200` with a small JSON body `{ status, broker, uptime }` (`broker` = `connected`/`disconnected` for the Redis link). The image `HEALTHCHECK` probes it (healthy on `200`). Use `/health` for orchestrator liveness probes, and optionally gate readiness on `broker: "connected"`.
- **What "healthy" requires:** the server only finishes startup once Redis is connected; if Redis is unreachable the process fails fast and the container is unhealthy/exits.
- **Logs:** structured logs go to **stdout** (collect them with your platform's log driver). Expect these lines on a good boot:
  - `Connection to Redis server '<host>:<port>' established …`
  - `Web server started at address 'http://0.0.0.0:3000' …`
  - `Instance '…' started successfully.`
- **Graceful shutdown:** the process handles `SIGTERM`/`SIGINT` and shuts down cleanly — normal `docker stop` / orchestrator termination is safe.

---

## 13. Post-install verification

1. Container reports **healthy** (`docker ps` / probe green) and Redis is healthy.
2. Logs show Redis connected + `Web server started …` + `started successfully`.
3. `GET /health` returns `200` (body reports `broker: "connected"` once Redis is up).
4. Through the proxy, `https://<host>/` returns the login screen showing your configured method(s) — e.g. the Azure button, and **no** local form under the default config; a sign-in via your provider reaches the dashboard.
5. No `error`/`alert` severity lines in the logs (a *warning* about an unconfigured OAuth provider or a missing security hash key is informational — address the latter for production).
6. **Once the org tree and employees are both loaded and the app has been restarted, no unresolved-manager
   `WARNING` remains in the logs (§11).** A screenful was expected while the tree existed without employees;
   checking only for `error`/`alert` severity in step 5 would pass a deployment where an entire unit's people have
   no manager, because that finding is logged as a warning. Treat any that still appear as named units to fix, not
   as noise.

---

## 14. Upgrades

1. Review the competence `CHANGELOG.md` for the target version.
2. Pull the new pinned tag (e.g. `:3.14.0`) and redeploy (rolling restart / `docker compose up -d`).
3. Data is **forward-only** — the app migrates/backfills as needed on start; there is no downgrade path for data written by a newer version. **Back up Redis before upgrading** (§15).
4. If you customized framework/app configuration through the admin system, use its export/restore to carry it forward.

### After upgrading the image

A new image may ship changed configuration content — new competencies, an
expanded role-family pool, a revised consent statement. The configuration store
seeds from those files only on a **first** run, so an existing deployment keeps
serving what it was seeded with.

After an upgrade, sign in as an administrator and open **Administration →
Configuration → Configuration drift**. The panel lists every document that
either differs from the defaults shipped in the new image, or has never been
written to the store at all (shown with `+0 / -0 / ~0` — not a difference,
just nothing seeded yet). Review the differing documents and apply them; the
application is recorded as a normal, restorable configuration change.

The container log reports the same condition at startup, one `WARNING` line per
drifted document, so this is also visible without opening the UI.

If a document is rejected on apply, apply it together with the documents it
depends on — the competency dictionary, the role-family pool and the active
competency sets validate against one another, so they generally move together.

---

## 15. Backup & disaster recovery

- **Back up Redis** — it is the datastore. Snapshot the RDB/AOF files (or use your managed Redis backup) on a schedule and before every upgrade.
- Application data keys are namespaced under `ti:competence:*` (plus framework keys under `ti:*`).
- Recovery = restore the Redis data volume/snapshot and start a matching (or newer) app version.
- The container itself is stateless — no per-container backup needed beyond your config/secrets.

---

## 16. Troubleshooting

| Symptom                                                               | Likely cause                                                        | Fix                                                                         |
|-----------------------------------------------------------------------|---------------------------------------------------------------------|-----------------------------------------------------------------------------|
| Startup errors mentioning `JSON.*` / RedisJSON                        | Redis without the JSON module                                       | Use Redis Stack or Redis 8+ (§6).                                           |
| App exits immediately; logs show it can't reach Redis                 | Wrong `TI_MEMORY_CACHE_REDIS_HOST/PORT`, Redis down, or auth needed | Fix host/port; set `TI_MEMORY_CACHE_AUTH_KEY`; confirm Redis healthy.       |
| Page unreachable though container is "up"                             | App bound to loopback                                               | Ensure `TI_WEB_HOST=0.0.0.0` (image default).                               |
| Browser shows insecure / mixed content, or redirect loops             | Proxy not forwarding `X-Forwarded-Proto`                            | Set the forwarded headers (§9); keep `TI_WEB_USE_TLS=false`.                |
| Login (or other POST) returns **HTTP 403, code 4005** behind a proxy  | Origin/Referer mismatch — the app can't reconstruct its external origin from the forwarded headers | Set `TI_WEB_TRUSTED_ORIGINS` to your public origin(s) (§9).                 |
| Startup **warning**: security hash key missing/default                | `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` unset                       | Set a strong value (§8).                                                    |
| Startup **warning**: an OpenID provider "skipped (missing client ID)" | Provider enabled but not configured                                 | Expected — configure the provider's env vars (§7) or ignore if intentional. |
| `GET /logout` returns Not Found                                       | Logout is `POST /logout` (by design)                                | Use the in-app Logout button; not a GET URL.                                |
| Sessions drop on restart / don't work across replicas                 | `TI_WEB_COOKIE_SECRET` unset (random per process)                   | Set a stable secret (§8).                                                   |
| Login page says "no sign-in method is configured"                     | Every method in `TI_WEB_AUTH_METHODS` is unconfigured (e.g. the Azure default with no creds) | Configure the provider credentials (§7), or set `TI_WEB_AUTH_METHODS` to a method you have configured. |
| A local sign-in succeeds unexpectedly                                 | `local` is enabled **and** the file at `TI_WEB_AUTH_LOCAL_USERS_PATH` has a matching, non-disabled record — there are no hardcoded credentials to disable | Remove `local` from `TI_WEB_AUTH_METHODS`, or remove the record from the users file and restart, for production (§1). |

---

## 17. Quick reference

- **Image:** `ghcr.io/belleal/ti-engine-competence:<version>`
- **Port:** `3000` (HTTP, behind a TLS proxy)
- **Dependency:** Redis with JSON module (Redis Stack / Redis 8+), persisted
- **Auth:** default `TI_WEB_AUTH_METHODS=openid-azure` (Azure SSO; local off) — configure Azure credentials
- **Must-set for prod:** `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`, `TI_WEB_COOKIE_SECRET`, `COMPETENCE_TEST_USER_ENABLED=false`, Redis connection, Azure OIDC credentials
- **Health probe:** `GET /health` → `200` (JSON body's `broker` = Redis connection state)
- **Data location:** Redis (`ti:competence:*`) — back it up
- **Source & issues:** https://github.com/Belleal/ti-engine
