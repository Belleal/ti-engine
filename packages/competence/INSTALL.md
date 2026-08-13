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
- **Organization structure:** the org chart is loaded from a configuration file baked into the image. Reflecting *your* organization requires supplying/adjusting that configuration (via the framework's admin configuration system or a custom build) — plan this with the application owner; it is not an environment variable.
- **Admin access:** the admin configuration screens are gated to identities listed in the web-server config `auth.admins` (empty by default → no admins). Set it per environment with **`TI_WEB_AUTH_ADMINS`** (comma-separated; matched against the session user's user ID, username or email — so an OpenID deployment lists emails), or in the config file for a baked-in default. Other non-env config such as the organization structure remains a configuration step — coordinate with the application owner.
- **First login:** browse to your HTTPS host. With the default `TI_WEB_AUTH_METHODS=openid-azure`, you sign in via Azure — so Azure must be configured (§7), otherwise the page shows "no sign-in method is configured." (Adding `local` to `TI_WEB_AUTH_METHODS` makes its sign-in form appear immediately — the form itself does not depend on a users file existing — but no sign-in can *succeed* until you provision a record for that identity in the file at `TI_WEB_AUTH_LOCAL_USERS_PATH`; with no matching record, or a wrong password, it's refused; dev/break-glass only, see §1 and §7, "Local auth".)

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

---

## 14. Upgrades

1. Review the competence `CHANGELOG.md` for the target version.
2. Pull the new pinned tag (e.g. `:3.14.0`) and redeploy (rolling restart / `docker compose up -d`).
3. Data is **forward-only** — the app migrates/backfills as needed on start; there is no downgrade path for data written by a newer version. **Back up Redis before upgrading** (§15).
4. If you customized framework/app configuration through the admin system, use its export/restore to carry it forward.

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
