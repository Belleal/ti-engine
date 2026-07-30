# Design — Deploy `competence` to Google Cloud Run (scale-to-zero test environment)

| | |
|---|---|
| **Date** | 2026-07-29 |
| **Packages** | `packages/competence` (deploy artifacts + INSTALL.md), `packages/web-framework` (`TI_WEB_AUTH_ADMINS` override), repo root (`.dockerignore`, `.github/workflows/cd.yml`) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | web-framework `1.17.0` → `1.18.0` (minor); competence `3.15.0` → `3.16.0` (minor); root **no bump** (repo-level CI change, per the CA-90 precedent) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-94`](https://belleal.youtrack.cloud/issue/CA-94) (subtask of `CA-11` Platform & Quality, where `CA-90` sits); follow-ups `CA-95`, `CA-96` |

---

## 1. Background & motivation

`CA-90` made `competence` containerized and continuously delivered: `packages/competence/Dockerfile` builds the app, `docker compose` runs it locally against Redis Stack, and `.github/workflows/cd.yml` publishes to `ghcr.io/belleal/ti-engine-competence` (`:edge` on `master`, `:X.Y.Z` on `competence-v*` tags). What does not exist is a hosted environment anyone other than the developer can open.

The goal is a **hosted test environment in Google Cloud that costs approximately nothing when nobody is using it**, and that only named colleagues can reach. It is a test environment, not production: it runs the **synthetic seed dataset**, and the dev-only test-user identity picker stays enabled because it is the only way to exercise the Employee / Manager / Supervisor screens today.

## 2. Goals & non-goals

**Goals**

- The app is reachable at an HTTPS URL, and **nothing runs — and nothing is billed — while nobody is testing**.
- Data a tester enters **survives idle periods and cold starts**.
- Only people on an explicit allowlist can reach it, enforced **before** the request touches the app.
- The one-time setup is a **committed, idempotent script** the user runs in Cloud Shell; re-running it is safe and it doubles as the redeploy path.
- Existing CD keeps working; the image reaches Cloud Run **without any long-lived credential**.
- Realistic running cost: **€0–1 / month**, with a billing budget as the backstop.

**Non-goals**

- **No mapping of Google identities to employee records.** The app cannot do this yet (see §4.1); the test-user picker remains the identity mechanism. This is the single most valuable follow-up and gets its own card.
- No custom domain, no managed TLS beyond what Cloud Run provides on `run.app`.
- No HA, no multi-instance, no autoscaling beyond one instance (§7.1 explains why one is a correctness requirement).
- No real appraisal data, and therefore no DPIA-triggering processing. If real employee records are ever wanted here, that is a DPO conversation first.
- No change to application behaviour, data model, scoring, or config semantics.
- No Terraform. Shell + `gcloud` matches the repo's existing tooling level and is auditable line by line.

## 3. Verified facts about the runtime (the contract we build against)

Established by reading the code during brainstorming:

1. **Redis needs the JSON module.** `core/integrations/redis-integration.js` uses `JSON.MERGE` / `JSON.MGET`. Redis 8 bundles JSON as a core data structure, so **`redis:8-alpine` is sufficient** — Redis Stack is not required (the existing `docker-compose.yml` already says as much).
2. **Redis is the only stateful dependency, and it holds everything.** Sessions live in Redis via `web-framework/components/session-store.js` (`ti:web:sessions`), as does all application data (`data-manager.js`). The app process itself is stateless ⇒ it can be killed and restarted freely, but **Redis contents must outlive the instance**.
3. **`trust proxy` is unconditional** (`web-framework/bin/web-server.js:243`) and the CSRF origin check honours `x-forwarded-proto` / `x-forwarded-host` (`web-handlers.js:94`, `:743`). Running plain HTTP behind Cloud Run's TLS terminator is the supported shape, exactly as behind any reverse proxy.
4. **`GET /health` is registered as an unprotected route** (`web-server.js:531`, `:572`) ⇒ usable as a Cloud Run startup and liveness probe without authentication.
5. **Local auth is a hardcoded `admin`/`admin`** with a `TODO: For testing purposes only!` (`web-framework/components/auth-manager.js:76`). It is disabled in this deployment (§7.4).
6. **Identity is not wired to SSO.** `augmentSession` takes `employeeID` from the dev `ti-test-user` cookie, else from the session, else the hardcoded fallback `"20"` (`competence/bin/competence-web-server.js:101`). The Google OIDC callback builds the session through the *same* path as local auth (`web-handlers.js:340` → `augmentSession`), so **Google sign-in and the test-user picker compose correctly**: Google authenticates the person, the cookie selects the acting employee. The cookie is `SameSite=Lax` and the OAuth callback is a top-level navigation, so it survives the redirect.
7. **The test-user panel is not gated by the auth method.** Its Alpine component sits on the root element of `frame-login.html:1`, outside every `<!--ti-auth-method:...-->` marker block, so disabling `local` strips the username/password form (`applyAuthMethodVisibility`, `web-app-manager.js:75`) without removing the identity picker. Only the *server-side honouring* of the cookie is gated, by `COMPETENCE_TEST_USER_ENABLED`.
8. **Admin gating has no env override.** `isAdminIdentity` matches `userID` / `username` / `email` against `auth.admins` (`authorization.js:48`), which defaults to `[]` in `web-framework/bin/web-server.json` and is settable **only from the config file** — every other web setting has a `TI_WEB_*` override. Without a new override, the admin config screens are unreachable in any container deployment. §7.8 adds one.
9. **`auth.enabledMethods` defaults to `["local","openid-google"]`** in `web-server.json`; the image overrides it to `openid-azure`. An enabled-but-unconfigured OpenID provider is skipped with a warning rather than crashing the instance (`#dropUnconfiguredOpenIDProviders`, added during the CA-90 smoke test) — so a partial OAuth misconfiguration degrades instead of failing to boot.

## 4. Verified facts about Google Cloud

Checked against current documentation during brainstorming, because the design's cost and security claims rest on them:

1. **IAP attaches directly to a Cloud Run service** — one `--iap` flag, no load balancer, and Google's announcement states it carries no added cost. It forces `--no-allow-unauthenticated`, grants the IAP service agent `roles/run.invoker`, and protects *all* ingress paths including the `run.app` URL. First-time enablement should be done in the Console because the CLI cannot create the OAuth client. ([enable](https://docs.cloud.google.com/iap/docs/enabling-cloud-run), [configure](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run), [announcement](https://cloud.google.com/blog/products/serverless/iap-integration-with-cloud-run))
2. **Managed Redis on GCP cannot serve this app cheaply.** Memorystore for Redis is 7.2-and-earlier with no JSON; only **Memorystore for Redis Cluster 8.0+** has native JSON (API-compatible with JSON module v2), and it is an always-on, shard-priced product. ([supported versions](https://docs.cloud.google.com/memorystore/docs/redis/supported-versions), [cluster JSON](https://docs.cloud.google.com/memorystore/docs/cluster/about-json))
3. **Cloud Run supports up to 10 containers per instance**, sharing a network namespace (so `127.0.0.1` works between them) and able to share volumes. ([container contract](https://docs.cloud.google.com/run/docs/container-contract), [sidecars](https://cloud.google.com/blog/products/serverless/cloud-run-now-supports-multi-container-deployments))
4. **Instance CPU is the *sum* of the per-container CPU limits** — this constrains the resource split in §7.1. Startup CPU boost applies to all containers when enabled. ([CPU limits](https://docs.cloud.google.com/run/docs/configuring/services/cpu))
5. **Cloud Storage buckets mount into Cloud Run** via the `gcsfuse.run.googleapis.com` CSI driver; with multiple containers, volumes are declared once and mounted per container. ([volume mounts](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts))
6. **gcsfuse supports single-file rename, atomically from the perspective of the new name** — which is precisely what a Redis RDB save does (write temp file, rename over `dump.rdb`). *Directory* rename is the operation restricted to hierarchical-namespace buckets; this design never renames a directory. ([gcsfuse semantics](https://github.com/GoogleCloudPlatform/gcsfuse/blob/master/docs/semantics.md))
7. **Cloud Run's free tier applies to both billing models**, applied as a spend-based discount at Tier 1 pricing. ([billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings))
8. **Free-tier allowances, with a caveat.** Google's own pages disagree: the pricing page quotes 240,000 vCPU-seconds / 450,000 GiB-seconds per month, the free-features page quotes 180,000 vCPU-seconds / 360,000 GiB-seconds / 2M requests. **This design uses the lower figures throughout.** Other relevant allowances: Artifact Registry 0.5 GB storage; Secret Manager 6 active versions and 10,000 access operations; Cloud Storage's free 5 GB is **US-regions-only** and therefore does not apply to a `europe-west1` bucket. ([free features](https://docs.cloud.google.com/free/docs/free-cloud-features), [Cloud Run pricing](https://cloud.google.com/run/pricing))
9. **Artifact Registry is the only registry Cloud Run pulls from**, which is why the image has to be mirrored there (§7.9) rather than pulled from `ghcr.io` directly.

## 5. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Compute | **Cloud Run**, `min-instances=0`, `max-instances=1`, request-based billing |
| Redis | **`redis:8-alpine` sidecar** in the same instance, reached at `127.0.0.1:6379` |
| Persistence | **Redis RDB snapshot on a mounted Cloud Storage bucket** — survives scale-to-zero. Rejected: reset-to-seed on every cold start (loses multi-day workflow testing); always-on `e2-micro` VM (kept as the fallback) |
| Access gate | **IAP on the Cloud Run service** with an email allowlist; no load balancer |
| App authentication | **`openid-google` only** — `local` and `openid-azure` disabled |
| Tester accounts | All inside the user's Google Workspace domain ⇒ **both OAuth consent screens configured as Internal** |
| Image delivery | **Extend CD to push to Artifact Registry**, authenticated by **Workload Identity Federation** (no service-account keys) |
| Deliverable | **Committed, idempotent bootstrap script** + service manifest + INSTALL.md section; the user runs it in Cloud Shell |
| Region | **`europe-west1`** (Belgium) — Tier 1 pricing, EU data residency, ~40 ms from Sofia |
| Admin access | **Add `TI_WEB_AUTH_ADMINS`** to web-framework so admin screens are reachable without committing an email address (§7.8) |

## 6. Architecture

```
        tester's browser
               │  https
               ▼
    ┌──────────────────────┐   Google sign-in + email allowlist (roles/iap.httpsResourceAccessor)
    │  IAP  (free, no LB)  │   rejects everything else before it reaches Cloud Run
    └──────────┬───────────┘
               ▼
 ┌─── Cloud Run service "competence" (europe-west1) ───┐
 │  min-instances 0   max-instances 1   gen2           │
 │                                                     │
 │  ┌──────────────────┐      ┌──────────────────┐     │
 │  │ app (ingress)    │─────▶│ redis:8-alpine   │     │
 │  │ :8080  /health   │ 127. │ :6379            │     │
 │  └──────────────────┘ 0.0.1└────────┬─────────┘     │
 └──────────▲──────────────────────────│───────────────┘
            │ image pull               │ /data (gcsfuse CSI)
            │                          ▼
   Artifact Registry           gs://PROJECT-competence-redis
   (CD pushes via WIF)         holds dump.rdb — survives scale-to-zero
            ▲                          ▲
            │                          │  runtime service account:
   GitHub Actions CD           objectAdmin on this bucket only,
   (no stored keys)            secretAccessor on 3 secrets only
```

## 7. Component specs

### 7.1 Cloud Run service (`service.yaml`)

Multi-container services need a YAML manifest (`gcloud run services replace`), not flags. Key contents:

| Setting | Value | Why |
|---|---|---|
| `autoscaling.knative.dev/minScale` | `0` | nothing runs when idle — the core requirement |
| `autoscaling.knative.dev/maxScale` | `1` | **correctness, not just cost**: two instances would mean two Redis processes writing the same `dump.rdb` object |
| `run.googleapis.com/execution-environment` | `gen2` | required for Cloud Storage volume mounts |
| `run.googleapis.com/cpu-throttling` | `true` | request-based billing (§7.11) |
| `run.googleapis.com/startup-cpu-boost` | `true` | trims cold start; applies to both containers |
| `run.googleapis.com/container-dependencies` | `{"app":["redis"]}` | the app starts only once Redis is *listening*. Note this does not prove the snapshot finished loading — Redis opens its socket before `loadDataFromDisk()` completes — so the app's Redis client retries cover the remainder |
| `containerConcurrency` | `80` | default; ample for a handful of testers |
| `serviceAccountName` | the dedicated runtime SA (§7.7) | not the default compute SA |

Resource split, constrained by §4.4 (instance CPU is the sum of container limits):

| Container | CPU | Memory |
|---|---|---|
| `app` (ingress, port 8080) | `600m` | `1Gi` |
| `redis` | `400m` | `512Mi` |
| **instance total** | **1 vCPU** | **1.5 GiB** |

Probes: `app` gets an HTTP startup + liveness probe on `/health`; `redis` gets a TCP startup probe on 6379 (which is what the container dependency waits for).

**Deploy-time check:** if Cloud Run rejects fractional per-container CPU in this combination, fall back to `1` + `1` (a 2-vCPU instance) and accept double CPU-seconds — still inside the free tier. The implementation plan must treat this as a verify-and-adjust step, not an assumption.

### 7.2 Redis sidecar configuration

Passed as container `args` — note that `--save`'s value is **one array element containing two words**, not two elements:

```yaml
args: ["redis-server", "--dir", "/data", "--dbfilename", "dump.rdb",
       "--save", "30 1", "--appendonly", "no",
       "--maxmemory", "384mb", "--maxmemory-policy", "noeviction"]
```

- `--dir /data` is the mounted bucket ⇒ Redis loads the previous snapshot on start and saves back to it.
- `--save "30 1"` checkpoints 30 seconds after a write, whenever the instance has CPU.
- **`--maxmemory-policy noeviction` is deliberate**: this Redis is the system of record, not a cache. Hitting the ceiling must fail writes loudly rather than silently discard appraisal data.
- `--appendonly no`: AOF's append pattern is a poor fit for object storage; RDB's write-then-rename is the operation gcsfuse supports atomically (§4.6).
- `stop-writes-on-bgsave-error` stays at its default (`yes`) so a broken bucket mount surfaces immediately.

### 7.3 Persistence & durability model

Two save triggers:

1. **Periodic** — the `save 30 1` point, effective whenever requests are flowing (under request-based billing CPU is throttled between requests, so this is opportunistic rather than guaranteed).
2. **Shutdown** — Cloud Run sends `SIGTERM` before terminating an instance, and Redis performs a blocking save on `SIGTERM` when save points are configured. This is the primary durability mechanism for scale-to-zero.

**Exposure:** writes made after the last successful save, if the instance dies without a clean `SIGTERM` or the save exceeds the ~10-second shutdown grace. Acceptable for a test environment holding synthetic data; stated in INSTALL.md rather than hidden.

Bucket hardening: uniform bucket-level access, **object versioning on**, lifecycle rule deleting noncurrent versions after 7 days — cheap insurance on the one object that matters.

**This is the design's one unproven assumption** (§9.1).

### 7.4 Access control

Two independent layers, and it is worth being explicit about which one is load-bearing:

**Layer 1 — IAP (the real boundary).** `--iap` on the service; testers hold `roles/iap.httpsResourceAccessor`; consent screen **Internal**, so accounts outside the Workspace domain are refused automatically. Because IAP rejects unauthenticated requests before Cloud Run, crawlers cannot wake the container — a cost control as much as a security control.

**Layer 2 — the app's own Google sign-in.** `TI_WEB_AUTH_METHODS=openid-google` strips the local form and the Azure button from the login screen (§3.7). Requires its own OAuth client, separate from IAP's:

| Variable | Source |
|---|---|
| `TI_GCLOUD_AUTH_CLIENT_ID` | plain env var (not secret) |
| `TI_GCLOUD_AUTH_CLIENT_SECRET` | Secret Manager |
| `TI_GCLOUD_AUTH_CALLBACK_URL` | `https://<service-url>/login/google-callback` |

Testers see Google sign-in (usually one click, since IAP already established the session), then pick their test identity on the login screen.

**Two consequences the plan must handle:**

- The `run.app` URL is unknown until the service exists ⇒ **the bootstrap is two-phase**: deploy, read the URL back, patch `TI_WEB_TRUSTED_ORIGINS` and `TI_GCLOUD_AUTH_CALLBACK_URL`, then register the redirect URI on the OAuth client (a Console step). Recreating the service changes the URL and requires repeating this.
- With `local` disabled there is **no fallback login**. A broken OAuth client locks everyone out of the app — recoverable in seconds by re-enabling `local` with `gcloud run services update`, and safe because IAP still stands in front. Documented in INSTALL.md as the recovery procedure.

### 7.5 Configuration

| Variable | Value | Note |
|---|---|---|
| `TI_MEMORY_CACHE_REDIS_HOST` / `_PORT` / `_DB` | `127.0.0.1` / `6379` / `0` | shared network namespace |
| `TI_WEB_HOST` / `TI_WEB_PORT` / `TI_WEB_USE_TLS` | `0.0.0.0` / `8080` / `false` | Cloud Run terminates TLS |
| `TI_WEB_AUTH_METHODS` | `openid-google` | replaces the image default `openid-azure` |
| `TI_WEB_TRUSTED_ORIGINS` | the `run.app` URL | phase two; CSRF origin validation |
| `TI_WEB_AUTH_ADMINS` | the admin's email | new override, §7.8 |
| `COMPETENCE_TEST_USER_ENABLED` | `true` | the reason IAP is mandatory |
| `COMPETENCE_PRELOAD_DATA` | `true` for the first boot, then `false` | it re-merges the seed on **every** start, which would resurrect seed records a tester deleted |
| `TI_AUDITING_LOG_MIN_LEVEL` | `300` (NOTICE) | drops DEBUG (100) and INFO (200); verbose logging is the one thing here that could quietly cost money |

### 7.6 Secrets

Three: `TI_WEB_COOKIE_SECRET`, `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`, `TI_GCLOUD_AUTH_CLIENT_SECRET` — three of the six free active versions.

- The first two are generated **inside Cloud Shell** with `openssl rand -base64 32` piped straight into `gcloud secrets create --data-file=-`. Never echoed, never written to disk, never committed, never present in the assistant's context.
- The OAuth client secret is supplied by the user via `gcloud secrets versions add --data-file=-` and pasted at the prompt, for the same reason.
- Referenced by the service with `--set-secrets`, so values live only in Secret Manager.
- `service.yaml` is committed as a **template with placeholders** (`PROJECT_ID`, `REGION`, `IMAGE_TAG`); it never contains a value.

### 7.7 IAM (least privilege)

A dedicated runtime service account, `competence-run@PROJECT.iam.gserviceaccount.com`:

| Role | Scope |
|---|---|
| `roles/storage.objectUser` | the one Redis-state bucket (resource-scoped, not project-wide). Not `objectAdmin`, which additionally grants object `getIamPolicy`/`setIamPolicy` that a gcsfuse read-write mount never needs |
| `roles/secretmanager.secretAccessor` | the three secrets individually |

Nothing else. The IAP service agent separately holds `roles/run.invoker`, granted automatically on IAP enablement.

For CD: a **Workload Identity Federation** pool and provider trusting only `repo:Belleal/ti-engine` on the `master` branch and `competence-v*` tags, impersonating a deploy service account with `roles/artifactregistry.writer` on the one repository.

### 7.8 `TI_WEB_AUTH_ADMINS` (web-framework `1.18.0`)

Add to `web-framework/components/web-config-env.js`, following the exact shape of the existing `TI_WEB_AUTH_METHODS` override (comma-separated, **replaces** rather than merges the array, applied only when the variable is defined):

```js
if ( env.TI_WEB_AUTH_ADMINS !== undefined ) {
    config.auth = config.auth || {};
    config.auth.admins = env.TI_WEB_AUTH_ADMINS.split( "," ).map( ( entry ) => entry.trim() ).filter( ( entry ) => entry.length > 0 );
}
```

Plus a unit test in the existing `web-config-env` suite covering: absent variable leaves `auth.admins` untouched; a set variable replaces it; whitespace and empty entries are trimmed away. Documented in `packages/web-framework/README.md` alongside the other overrides, and in `.env.example`.

Rationale: without it, admin-gated screens are unreachable in *any* container deployment, and the alternative is committing a real email address to a public GPL repo. Additive and backward compatible.

### 7.9 CD → Artifact Registry

The image must be **built once and pushed to both registries in the same step**, so GHCR and Artifact Registry hold byte-identical digests. Concretely, in `.github/workflows/cd.yml`:

1. **Before** the existing build step, add `google-github-actions/auth@v2` with `workload_identity_provider` + `service_account` (never `credentials_json`), followed by `gcloud auth configure-docker europe-west1-docker.pkg.dev`.
2. Add `europe-west1-docker.pkg.dev/PROJECT/competence/ti-engine-competence` to the **`images:` list of the existing `docker/metadata-action`** step, so it derives the same tag set for both registries.
3. Leave `docker/build-push-action` otherwise untouched — one build, one push, two registries.

A separate post-push step is explicitly *not* the approach: it would either rebuild (producing a different digest) or need an extra copy tool for no benefit.

The `permissions:` block gains `id-token: write` (required for WIF). Project ID and provider path come from repository **variables**, not secrets — they are not sensitive, and nothing in this step can leak a credential.

`bootstrap.sh` also mirrors `redis:8-alpine` into the same repository, since Cloud Run cannot pull from Docker Hub (§4.9). It mirrors **by tag, not by digest** — the manifest consumes `…/competence/redis:8-alpine`. The mirror step is guarded by an existence check, so it runs once and is never re-pulled: after the first bootstrap the mirrored tag is effectively frozen, and upstream movement cannot reach the deployment without someone deleting the mirrored image. That is weaker than a digest reference, which would make the sidecar reproducible from the manifest alone; tightening it is tracked as a follow-up (see §10). An Artifact Registry **cleanup policy keeps the last 3 versions** of the app image against the 0.5 GB free allowance.

### 7.10 Scripts

`packages/competence/deploy/gcp/bootstrap.sh` — one-time, idempotent, echoing every resource it creates:

1. enable the required APIs (`run`, `artifactregistry`, `secretmanager`, `storage`, `iap`, `iamcredentials`)
2. create the Artifact Registry repository + cleanup policy; mirror `redis:8-alpine`
3. create the state bucket (uniform access, versioning, 7-day noncurrent lifecycle)
4. create the runtime service account + the two resource-scoped bindings
5. create the three secrets (generating the two random ones in place)
6. create the WIF pool/provider + deploy service account
7. create a billing budget with email alerts at €5/month — **conditional**: budgets live on the *billing account*, not the project, so this needs `roles/billing.admin` on the billing account. If the caller lacks it, the script must skip the step, say so, and print the exact Console path instead of failing. The budget is a guardrail, not a dependency of the deployment.

`packages/competence/deploy/gcp/deploy.sh` — repeatable: renders `service.yaml` with project/region/tag, `gcloud run services replace`, reads the URL back, patches the URL-dependent env vars, prints the redirect URI to register and the final URL.

`.dockerignore` gains `**/deploy` so these never ship inside the image.

### 7.11 Cost model

Request-based billing means CPU and memory accrue only while a request is in flight, plus startup and shutdown — so an hour of human testing bills a small fraction of that hour.

| Item | Monthly |
|---|---|
| Cloud Run | **€0** — realistically single-digit vCPU-hours against ≥180,000 free vCPU-seconds |
| Cloud Storage (`europe-west1`, free tier is US-only) | **< €0.01** — a 10–50 MB snapshot at $0.020/GB/month, plus a few hundred Class A operations |
| Artifact Registry | €0 to a few cents, depending on proximity to the 0.5 GB allowance |
| Secret Manager (3 of 6 free versions) | €0 |
| IAP | €0 |
| Egress (free 1 GB is North America only) | cents |
| **Total** | **€0–1** |

Guardrails: `min-instances=0`; `max-instances=1`; IAP blocking bot wake-ups; the image cleanup policy; a raised log level; and the **billing budget alert** as the backstop that catches whatever this model got wrong.

## 8. Verification plan

Split honestly by what can be proven where — the assistant has no `gcloud` and no access to the user's cloud.

**Provable in-repo (assistant):**
- `npm test` in `packages/web-framework` — full suite plus the new `TI_WEB_AUTH_ADMINS` cases.
- `npm test` in `packages/competence` — unchanged suite must stay green.
- `eslint .` clean on the tracked tree.
- `bash -n` syntax check on both scripts.
- Line-by-line review of `service.yaml` against the Cloud Run multi-container schema and the resource-sum rule (§4.4).

**Requires the user's cloud (runbook steps in INSTALL.md):**
1. `bootstrap.sh` in Cloud Shell — completes, and re-running it changes nothing.
2. `deploy.sh` — revision goes healthy; logs show no Redis connection errors on cold start (dependency ordering works).
3. Browser: Google sign-in → app login → dashboard renders; console clean.
4. **The durability round-trip — the test that matters.** Create a cycle or an evaluation; leave it idle past scale-down; reload; confirm the data is still there and that `gs://.../dump.rdb`'s timestamp advanced.
5. Admin screens reachable for the `TI_WEB_AUTH_ADMINS` identity, and *not* for another tester.
6. A non-allowlisted account is refused by IAP.
7. After a few days: the billing report matches §7.11 and the budget alert exists.

## 9. Risks & fallbacks

1. **Redis-on-gcsfuse is unproven by the assistant.** The reasoning is sound (§4.6: single-file rename is what an RDB save does) but it has not been executed. Detected by verification step 4. **Fallback: option B** — Redis on an Always-Free `e2-micro` VM reached over Direct VPC egress, which needs no application change, only a different `TI_MEMORY_CACHE_REDIS_HOST`. Cost impact roughly €0 for the VM within Always-Free limits.
2. **The ~10-second shutdown grace bounds what can be saved** (§7.3). Mitigated by keeping the dataset small; documented rather than engineered around.
3. **Cold start of roughly 5–15 seconds** for the first page after idle. Startup CPU boost trims it; it will not eliminate it. Testers should expect it.
4. **Fractional per-container CPU may be rejected** (§7.1) — verify-and-adjust at deploy time.
5. **The `run.app` URL is a configuration dependency** in two places (trusted origins, OAuth redirect URI). Recreating the service breaks sign-in until both are re-patched. Called out in INSTALL.md.
6. **`COMPETENCE_TEST_USER_ENABLED=true` on a hosted URL is only as safe as IAP.** If IAP were ever disabled, the deployment would let anyone act as any employee. INSTALL.md must state this as a hard coupling, not a soft recommendation. The dev cookie also carries a numeric **roles** override, so an IAP-allowlisted tester can act as any employee *with any application role, Supervisor included* — while the string `admin` role is correctly unreachable, because the cookie's roles are coerced with `Number()` and non-finite values dropped.
7. **`maxScale` is per-revision, not per-service.** A deploy creates two revisions — the draining old one and the starting new one — so a redeploy while the service is under active use can let the old instance's shutdown save land after the new instance has already loaded, overwriting a newer snapshot with a stale one. Mitigated by redeploying while idle; the durable fix is to read the service URL *before* rendering the manifest so the whole deploy produces a single revision instead of two — carded as a follow-up (§10).
8. **The durability margin is thinner than "two save triggers" suggests.** With `cpu-throttling: true`, the `save 30 1` point is opportunistic between requests, so the `SIGTERM` save is effectively the only reliable trigger — and within roughly 10 seconds it must serialize, write through gcsfuse's staging buffer, upload, and rename (a GCS rename being a server-side copy plus delete, not an atomic filesystem rename). Treat the `e2-micro` fallback (§9.1) as a live possibility rather than a remote one, run the durability round-trip as the first post-deploy action, and check the `dump.rdb` timestamp as a habit.

## 10. Follow-ups (not in this scope)

- **Map OIDC identities to employee records** in `augmentSession` (employees already carry an `email` field), which would let `COMPETENCE_TEST_USER_ENABLED` be turned off and remove the risk in §9.6. Own card, worth doing.
- Custom domain + managed certificate, if testers dislike the `run.app` URL.
- Marking the session cookie `secure` (`web-server.json` sets `httpOnly` and `sameSite` but not `secure`); harmless behind Cloud Run's HTTPS, but it is a one-line hardening.
- **Pin the mirrored Redis sidecar by digest** rather than by tag (§7.9), so the sidecar is reproducible from the manifest alone. Needs `bootstrap.sh` to resolve and report the digest and the manifest to carry it as a placeholder — a two-phase dependency the current single-pass render does not have.
- **Pin the GitHub Actions used by CI/CD to commit SHAs.** `zizmor`'s blanket policy flags every floating tag reference (`actions/checkout@v4`, `docker/build-push-action@v6`, `google-github-actions/auth@v2`, …). This is a repo-wide convention change, not something to do for two newly-added steps in isolation.

## 11. Delivery

- **YouTrack:** [`CA-94`](https://belleal.youtrack.cloud/issue/CA-94) as a subtask of `CA-11`, referenced in every commit; log time; close as `Verified` / `Done` once the user's round-trip passes.
- **Commits:** thematic and few, per house convention — expect roughly three (`feat(web-framework)` for the override, `build(competence)` for the deploy artifacts + `.dockerignore` + CD step, `docs(competence)` for INSTALL.md), plus the version/changelog bump commit.
- **Versions:** web-framework `1.18.0`, competence `3.16.0`, each with its `CHANGELOG.md` entry in house style (intro paragraph, bullets, closing `build(release)` bullet). No root bump.
- **Branch:** `current`, PR to `master`, following `finishing-a-development-branch`.
