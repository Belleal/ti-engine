# Competence — Installation & Operations Guide

**Audience:** system administrators deploying the **competence** HR appraisal application.
**Scope:** installing, configuring, running, upgrading, and troubleshooting the app as a container. Application usage (running appraisal cycles, etc.) is out of scope.

> **Package versions this guide targets:** competence `3.13.0`, `@ti-engine/web-framework` `1.14.0`, `@ti-engine/core` `1.7.1`. Container image: `ghcr.io/belleal/ti-engine-competence`.

---

## 1. Read first — maturity & security notices

The competence app is functional but still evolving. Please account for the following **before a production rollout**:

1. **Local username/password auth is a placeholder.** When the `local` auth method is enabled, the credentials are currently hard-coded to `admin` / `admin` (a development stand-in). **Do not expose this to the internet as-is.** For real deployments, configure an OpenID Connect provider (Google or Azure — see §7) and treat local auth as disabled or dev-only.
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

| Requirement | Notes |
|---|---|
| Container runtime | Docker Engine 20.10+ (verified on 29.x) or any OCI runtime. Docker Compose v2+ for the compose method (verified on v5.x). |
| Redis with JSON module | Redis Stack (`redis/redis-stack-server`) or Redis 8+. Reachable from the container. |
| Reverse proxy / ingress | nginx, Traefik, HAProxy, or a Kubernetes ingress to terminate TLS. |
| Outbound registry access | To pull `ghcr.io/belleal/ti-engine-competence` (GHCR). |
| CPU / memory (guidance) | The app is lightweight (single Node process). Start with 0.5 vCPU / 512 MB for the app; size Redis to your dataset + persistence. Adjust from monitoring. |

> If you build the image yourself instead of pulling it, you also need the monorepo source and Node 22; see §5.

---

## 4. The container image

- **Name:** `ghcr.io/belleal/ti-engine-competence`
- **Tags:**
  - `:X.Y.Z` — a released version (e.g. `:3.13.0`), published from a `competence-v*` git tag. **Use a pinned version tag in production.**
  - `:latest` — the most recent released version.
  - `:edge` — the tip of `master` (pre-release; for staging only).
- **Base:** `node:22-alpine`, non-root (`node` user), `NODE_ENV=production`.
- **Pulling:** if the package is public, `docker pull ghcr.io/belleal/ti-engine-competence:3.13.0`. If private, authenticate to GHCR first:
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
| Variable | Default | Purpose |
|---|---|---|
| `TI_INSTANCE_NAME` | `ti-competence` | Service instance name. |
| `TI_INSTANCE_CLASS` | `bin/competence-web-server.js` | Entry class (leave as-is). |
| `TI_INSTANCE_CONFIG` | `bin/competence-web-server.json` | Service config path (leave as-is). |
| `TI_LOCALIZATION_LABELS_PATH` | `bin/localization/competence-labels.json` | Localization labels (leave as-is). |
| `TI_AUDITING_LOG_MIN_LEVEL` | `0` | Log verbosity floor (0 = all; raise to reduce noise). |

### Web binding
| Variable | Default (image) | Purpose |
|---|---|---|
| `TI_WEB_HOST` | `0.0.0.0` | Bind address. Keep `0.0.0.0` in a container. |
| `TI_WEB_PORT` | `3000` | Listen port. |
| `TI_WEB_USE_TLS` | `false` | Keep `false` — TLS is terminated by the proxy (§9). |
| `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` | — | Only if you terminate TLS *inside* the container (not recommended). |
| `TI_WEB_APP_STATIC_CACHE_DISABLED` | `false` | Leave `false` in production so static assets are cached. |

### Redis
| Variable | Default | Purpose |
|---|---|---|
| `TI_MEMORY_CACHE_REDIS_HOST` | `127.0.0.1` | Redis host. Set to your Redis service name/host. |
| `TI_MEMORY_CACHE_REDIS_PORT` | `6379` | Redis port. |
| `TI_MEMORY_CACHE_REDIS_DB` | `0` | Redis DB index. |
| `TI_MEMORY_CACHE_AUTH_KEY` | *(empty)* | Redis password, if required. |

### Secrets — set strong values in production
| Variable | Purpose |
|---|---|
| **`TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`** | Keyed HMAC for message-integrity/tamper protection. If unset, a startup **warning** is logged and tamper protection is ineffective. |
| **`TI_WEB_COOKIE_SECRET`** | Session cookie signing secret. Set a stable, private value so sessions survive restarts and work across replicas (otherwise a random per-process value is used). |

### Application flags
| Variable | Default | Purpose |
|---|---|---|
| `COMPETENCE_PRELOAD_DATA` | `false` | **Destructive demo-data seed.** Leave `false` for real installs (see §11). |
| **`COMPETENCE_TEST_USER_ENABLED`** | `false` | Dev-only login test-user panel. **Must be `false` in production.** |

### OpenID Connect (optional — configure for real SSO)
Set these to enable a provider. An **enabled-but-unconfigured provider is skipped** (logged as a warning) and its login button is hidden, so the app still boots.
| Variable | Purpose |
|---|---|
| `TI_GCLOUD_AUTH_CLIENT_ID` / `TI_GCLOUD_AUTH_CLIENT_SECRET` | Google OIDC client credentials. |
| `TI_GCLOUD_AUTH_CALLBACK_URL` | e.g. `https://your-host/login/google-callback`. |
| `TI_GCLOUD_AUTH_DISCOVERY_URL` | Google discovery URL (defaulted). |
| `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET` | Azure OIDC client credentials. |
| `TI_AZURE_AUTH_CALLBACK_URL` | e.g. `https://your-host/login/azure-callback`. |
| `TI_AZURE_AUTH_DISCOVERY_URL` | Azure discovery URL. |

> Which auth methods are offered (`local`, `openid-google`, `openid-azure`) is set in the web-server configuration (`auth.enabledMethods`). See §11 for changing config that isn't env-driven.

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
    image: ghcr.io/belleal/ti-engine-competence:3.13.0
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
      # OAuth (optional):
      # TI_GCLOUD_AUTH_CLIENT_ID: "${TI_GCLOUD_AUTH_CLIENT_ID}"
      # TI_GCLOUD_AUTH_CLIENT_SECRET: "${TI_GCLOUD_AUTH_CLIENT_SECRET}"
      # TI_GCLOUD_AUTH_CALLBACK_URL: "https://competence.example.com/login/google-callback"
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
  ghcr.io/belleal/ti-engine-competence:3.13.0
```

### Method C — Kubernetes (pointers)

- Map the env vars above to a `ConfigMap` (non-secret) + `Secret` (the two secrets, Redis password, OAuth secrets).
- Run Redis Stack (or Redis 8+) as a `StatefulSet` with a `PersistentVolumeClaim`, or use a managed JSON-capable Redis.
- Expose the app with a `Service` (port 3000) + `Ingress` that terminates TLS and forwards `X-Forwarded-*`.
- Liveness/readiness probe: HTTP `GET /login` on port 3000, treat any status `< 500` as healthy (see §12).

---

## 11. First run & data

- **Demo data:** setting `COMPETENCE_PRELOAD_DATA=true` **once** seeds destructive demo data (employees, a cycle, sample evaluations). Leave it `false` for a real install; with it off you start empty.
- **Organization structure:** the org chart is loaded from a configuration file baked into the image. Reflecting *your* organization requires supplying/adjusting that configuration (via the framework's admin configuration system or a custom build) — plan this with the application owner; it is not an environment variable.
- **Admin access:** the admin configuration screens are gated to identities listed in the web-server config `auth.admins` (empty by default → no admins). Populating it (and other non-env config such as `auth.enabledMethods`) is a configuration step, not an env var — coordinate with the application owner.
- **First login:** browse to your HTTPS host; with only `local` enabled you get the placeholder `admin`/`admin` login (see §1 — configure OIDC for real use).

---

## 12. Health, logging & lifecycle

- **Health check:** the image defines a `HEALTHCHECK` that probes `GET http://127.0.0.1:3000/login` and treats status `< 500` as healthy (an auth redirect/401 still means "up"). Use the same for orchestrator liveness/readiness probes.
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
3. Through the proxy, `https://<host>/` returns the login screen.
4. A test sign-in (local placeholder, or your configured OIDC) reaches the dashboard.
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

| Symptom | Likely cause | Fix |
|---|---|---|
| Startup errors mentioning `JSON.*` / RedisJSON | Redis without the JSON module | Use Redis Stack or Redis 8+ (§6). |
| App exits immediately; logs show it can't reach Redis | Wrong `TI_MEMORY_CACHE_REDIS_HOST/PORT`, Redis down, or auth needed | Fix host/port; set `TI_MEMORY_CACHE_AUTH_KEY`; confirm Redis healthy. |
| Page unreachable though container is "up" | App bound to loopback | Ensure `TI_WEB_HOST=0.0.0.0` (image default). |
| Browser shows insecure / mixed content, or redirect loops | Proxy not forwarding `X-Forwarded-Proto` | Set the forwarded headers (§9); keep `TI_WEB_USE_TLS=false`. |
| Startup **warning**: security hash key missing/default | `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` unset | Set a strong value (§8). |
| Startup **warning**: an OpenID provider "skipped (missing client ID)" | Provider enabled but not configured | Expected — configure the provider's env vars (§7) or ignore if intentional. |
| `GET /logout` returns Not Found | Logout is `POST /logout` (by design) | Use the in-app Logout button; not a GET URL. |
| Sessions drop on restart / don't work across replicas | `TI_WEB_COOKIE_SECRET` unset (random per process) | Set a stable secret (§8). |
| Anyone can log in with `admin`/`admin` | Local placeholder auth enabled | Configure OIDC; disable/lock down local auth for production (§1). |

---

## 17. Quick reference

- **Image:** `ghcr.io/belleal/ti-engine-competence:<version>`
- **Port:** `3000` (HTTP, behind a TLS proxy)
- **Dependency:** Redis with JSON module (Redis Stack / Redis 8+), persisted
- **Must-set for prod:** `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`, `TI_WEB_COOKIE_SECRET`, `COMPETENCE_TEST_USER_ENABLED=false`, Redis connection, OIDC for real auth
- **Health probe:** `GET /login` → status `< 500` = up
- **Data location:** Redis (`ti:competence:*`) — back it up
- **Source & issues:** https://github.com/Belleal/ti-engine
