# Competence GCP Scale-to-Zero Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the `competence` app to Google Cloud Run as an IAP-gated, scale-to-zero test environment whose data survives idle periods, costing €0–1/month.

**Architecture:** One Cloud Run service with two containers — the app (ingress, :8080) and a `redis:8-alpine` sidecar reached at `127.0.0.1:6379` — where Redis snapshots its RDB onto a Cloud Storage bucket mounted through the gcsfuse CSI driver, so state outlives scale-to-zero. IAP fronts the service with a Workspace-internal email allowlist; the app itself uses Google-only sign-in. Setup and deploy are committed, idempotent, dry-runnable shell scripts the user executes in Cloud Shell.

**Tech Stack:** Cloud Run (gen2, multi-container), Cloud Storage + gcsfuse CSI, Secret Manager, Artifact Registry, Identity-Aware Proxy, Workload Identity Federation, GitHub Actions, Bash, Node.js `node --test`.

**Spec:** [`docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`](../specs/2026-07-29-competence-gcp-scale-to-zero-design.md) — read §3, §4 and §7 before starting. Section references below (§N) point at it.

**Tracking:** YouTrack [`CA-94`](https://belleal.youtrack.cloud/issue/CA-94) (subtask of `CA-11`); follow-ups `CA-95` (map OIDC identities to employee records) and `CA-96` (single-revision deploy + conditional CD auth).

## Global Constraints

- **Node `>=20.19.0`**, **CommonJS** (`require` / `module.exports`) everywhere. No ESM.
- Internal imports use the package's `#alias` map (e.g. `#web-config-env`), never relative paths.
- **No secret value ever enters the repo, an image, a log, or a plan/spec document.** Secrets are generated inside Cloud Shell and piped straight into Secret Manager. Committed manifests carry `__PLACEHOLDER__` tokens only.
- Never commit `.run/*.run.xml` (they hold live local credentials).
- Region is **`europe-west1`** everywhere; secret replication is user-managed and pinned to that region (EU data residency).
- Shell scripts must stay **LF**; `.gitattributes` already enforces `*.sh text eol=lf` — do not add a BOM and do not convert.
- Tests are Node's built-in runner: `node --test`. No external test framework.
- Conventional Commits, scoped to the package, with the YouTrack ID from Task 1 appended: `feat(web-framework): … (CA-94)`.
- **Bundle commits thematically — fewer is better.** This plan's tasks each end in exactly one commit; do not split further. This is the authoritative commit structure for this work (the spec's §11 delivery note defers to it), with one additional `fix(...)` commit per review round.
- All new shell scripts support `DRY_RUN=1`, which prints every mutating command and executes none. This is what makes them testable without cloud access.

---

### Task 1: Create the YouTrack tracking card

**Files:** none (tracker only).

**Interfaces:**
- Produces: the YouTrack issue ID that every later commit message in this plan must reference. **Outcome: `CA-94`** — already created, so the commit examples below name it directly.

- [ ] **Step 1: Find the parent epic**

Use the YouTrack MCP tool `mcp__youtrack__search_issues` with query `project: CA #Epic Platform`. Confirm `CA-11` (Platform & Quality) exists — it is the epic `CA-90` (the Docker/CI-CD work) sits under.

- [ ] **Step 2: Create the card as a subtask of CA-11**

Use `mcp__youtrack__create_issue` with:
- project: `CA`
- summary: `Deploy competence to Google Cloud Run (IAP-gated, scale-to-zero test environment)`
- description: a short paragraph plus a link to the spec path `docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`
- parentIssue: `CA-11`
- Type: `Task`, State: `Open`, Stage: `In Progress`, Priority: `Normal`

- [ ] **Step 3: Record the ID**

Write the returned ID into this plan's header area and use it in every commit message below. **Do not proceed without it** — commits without the ID break the GitHub↔YouTrack link. Outcome: **`CA-94`**, created as a subtask of `CA-11`.

---

### Task 2: Add the `TI_WEB_AUTH_ADMINS` env override (web-framework)

Spec §7.8. Without this, admin config screens are unreachable in any container deployment (§3.8).

**Files:**
- Modify: `packages/web-framework/components/web-config-env.js` (append a block after the `TI_WEB_AUTH_METHODS` block, currently lines 54-57)
- Modify: `packages/web-framework/test/web-server-env-overrides.test.js` (add cases before the closing `} );`)
- Modify: `packages/web-framework/README.md` (the "Environment variables" list, currently ending at `TI_WEB_COOKIE_SECRET` on line 19)
- Modify: `.env.example` (the web-binding section)

**Interfaces:**
- Consumes: `applyWebConfigEnvOverrides( config, env )` from `#web-config-env` — mutates and returns `config`.
- Produces: `config.auth.admins` as `string[]` whenever `env.TI_WEB_AUTH_ADMINS` is defined. Consumed at runtime by `authorization.isAdminIdentity` (`packages/web-framework/components/authorization.js:48`), which matches it against the session user's `userID` / `username` / `email`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web-framework/test/web-server-env-overrides.test.js`, immediately before the final `} );` that closes the `describe` block:

```js
    it( "replaces auth.admins from a comma-separated TI_WEB_AUTH_ADMINS (trimmed, empties dropped)", () => {
        const config = { auth: { enabledMethods: [ "openid-google" ], admins: [ "old@example.com" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: " one@example.com , two@example.com ,, " } );
        assert.deepEqual( config.auth.admins, [ "one@example.com", "two@example.com" ] );
        assert.deepEqual( config.auth.enabledMethods, [ "openid-google" ], "other auth settings are preserved" );
    } );

    it( "creates the auth object when TI_WEB_AUTH_ADMINS is set on a config without one", () => {
        const config = { host: "127.0.0.1" };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: "admin@example.com" } );
        assert.deepEqual( config.auth.admins, [ "admin@example.com" ] );
    } );

    it( "leaves a configured auth.admins untouched when TI_WEB_AUTH_ADMINS is absent", () => {
        const config = { auth: { admins: [ "keep@example.com" ] } };
        applyWebConfigEnvOverrides( config, {} );
        assert.deepEqual( config.auth.admins, [ "keep@example.com" ] );
    } );

    it( "clears auth.admins when TI_WEB_AUTH_ADMINS is set to an empty string", () => {
        const config = { auth: { admins: [ "gone@example.com" ] } };
        applyWebConfigEnvOverrides( config, { TI_WEB_AUTH_ADMINS: "" } );
        assert.deepEqual( config.auth.admins, [], "an explicitly empty value means no admins, not 'keep the default'" );
    } );
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packages/web-framework/test/web-server-env-overrides.test.js
```

Expected: FAIL — `tests 15`, `pass 12`, `fail 3`. Three of the four new cases fail on `config.auth.admins` being unchanged or `undefined`. The fourth ("leaves a configured auth.admins untouched when TI_WEB_AUTH_ADMINS is absent") passes even at this stage — it asserts a no-op, and before Step 3 the override function does nothing at all, so an absent env var trivially leaves `auth.admins` untouched. The **11** pre-existing cases must still pass.

- [ ] **Step 3: Implement the override**

In `packages/web-framework/components/web-config-env.js`, insert directly after the `TI_WEB_AUTH_METHODS` block (after its closing `}` on line 57) and before the `TI_WEB_TRUSTED_ORIGINS` block:

```js
    if ( env.TI_WEB_AUTH_ADMINS !== undefined ) {
        config.auth = config.auth || {};
        config.auth.admins = env.TI_WEB_AUTH_ADMINS.split( "," ).map( ( entry ) => entry.trim() ).filter( ( entry ) => entry.length > 0 );
    }
```

Then extend the JSDoc block at the top of the file: in the sentence listing what the overrides control, add the admin allowlist, and add `TI_WEB_AUTH_ADMINS` to the existing note that `TI_WEB_AUTH_METHODS` / `TI_WEB_TRUSTED_ORIGINS` **REPLACE** their config arrays rather than merging.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test packages/web-framework/test/web-server-env-overrides.test.js
```

Expected: PASS — `tests 15`, `pass 15`, `fail 0`.

- [ ] **Step 5: Run the whole web-framework suite**

```bash
npm test --workspace @ti-engine/web-framework
```

Expected: PASS, no regressions.

- [ ] **Step 6: Document the variable**

In `packages/web-framework/README.md`, append to the "Environment variables" bullet list (after the `TI_WEB_COOKIE_SECRET` bullet). Note the list is currently missing two shipped variables — add all three so it stops being stale:

```markdown
* `TI_WEB_AUTH_METHODS` (comma-separated) **replaces** the enabled authentication methods (`auth.enabledMethods`), e.g. `openid-google` or `local,openid-google`.
* `TI_WEB_AUTH_ADMINS` (comma-separated) **replaces** the admin allowlist (`auth.admins`). Entries are matched against the session user's user ID, username or email, so an OpenID deployment lists emails. An explicitly empty value means *no admins*.
* `TI_WEB_TRUSTED_ORIGINS` (comma-separated) **replaces** the trusted request origins (`trustedOrigins`) — needed behind proxies that do not present the real external origin.
```

In `.env.example`, add under the `# --- Web binding ... ---` section:

```
# Comma-separated admin allowlist; matched against the session user's ID, username or email.
TI_WEB_AUTH_ADMINS=
```

- [ ] **Step 7: Commit**

```bash
git add packages/web-framework/components/web-config-env.js packages/web-framework/test/web-server-env-overrides.test.js packages/web-framework/README.md .env.example
git commit -m "feat(web-framework): add TI_WEB_AUTH_ADMINS env override for the admin allowlist (CA-94)"
```

---

### Task 3: Add the Cloud Run service manifest

Spec §7.1, §7.2, §7.5. Multi-container services cannot be expressed with `gcloud run deploy` flags, so the service is a Knative manifest.

**Files:**
- Create: `packages/competence/deploy/gcp/service.yaml`
- Modify: `.dockerignore` (add `**/deploy` so these never ship inside the image)

**Interfaces:**
- Produces: a manifest with exactly these `sed` placeholders, consumed by `deploy.sh` in Task 5: `__PROJECT_ID__`, `__REGION__`, `__IMAGE_TAG__`, `__BUCKET__`, `__RUNTIME_SA__`, `__GOOGLE_CLIENT_ID__`, `__ADMIN_EMAILS__`.
- Note: the Artifact Registry **repository name is fixed as `competence`** in the image paths here. Tasks 4, 5 and 6 must hardcode it to match — do not make it configurable in one place and literal in another.
- Produces: container names `app` and `redis` — referenced by the `container-dependencies` annotation and by `deploy.sh`'s verification output.

- [ ] **Step 1: Create the manifest**

Create `packages/competence/deploy/gcp/service.yaml`:

```yaml
# Cloud Run service manifest for the competence scale-to-zero test environment.
# Rendered and applied by ./deploy.sh — do not apply this file directly, its
# placeholder tokens must be substituted first. Never put a secret VALUE here.
#
# CAUTION: do not write a placeholder-shaped token (double underscore, capitals,
# double underscore) anywhere in a comment. deploy.sh aborts on any such token
# left after substitution, so a merely illustrative one would block every deploy.
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: competence
  labels:
    cloud.googleapis.com/location: __REGION__
spec:
  template:
    metadata:
      annotations:
        # Nothing runs — and nothing is billed — while nobody is testing.
        autoscaling.knative.dev/minScale: "0"
        # HARD REQUIREMENT, not a cost knob: two instances would mean two Redis
        # processes writing the same dump.rdb object in the bucket.
        autoscaling.knative.dev/maxScale: "1"
        # gen2 is required for Cloud Storage volume mounts.
        run.googleapis.com/execution-environment: gen2
        # Request-based billing: CPU only while serving, plus start/stop.
        run.googleapis.com/cpu-throttling: "true"
        # Applies to both containers; trims the cold start.
        run.googleapis.com/startup-cpu-boost: "true"
        # The app must never boot against a Redis still loading its snapshot.
        run.googleapis.com/container-dependencies: '{"app":["redis"]}'
    spec:
      serviceAccountName: __RUNTIME_SA__
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - name: app
          image: __REGION__-docker.pkg.dev/__PROJECT_ID__/competence/ti-engine-competence:__IMAGE_TAG__
          ports:
            - name: http1
              containerPort: 8080
          resources:
            limits:
              cpu: 600m
              memory: 1Gi
          env:
            - name: TI_MEMORY_CACHE_REDIS_HOST
              value: "127.0.0.1"
            - name: TI_MEMORY_CACHE_REDIS_PORT
              value: "6379"
            - name: TI_MEMORY_CACHE_REDIS_DB
              value: "0"
            - name: TI_WEB_HOST
              value: "0.0.0.0"
            - name: TI_WEB_PORT
              value: "8080"
            - name: TI_WEB_USE_TLS
              value: "false"
            - name: TI_WEB_AUTH_METHODS
              value: "openid-google"
            # Admin allowlist (web-framework >= 1.18.0). Empty means no admins,
            # which leaves the admin config screens unreachable.
            - name: TI_WEB_AUTH_ADMINS
              value: "__ADMIN_EMAILS__"
            - name: TI_AUDITING_LOG_MIN_LEVEL
              value: "300"
            - name: TI_GCLOUD_AUTH_CLIENT_ID
              value: "__GOOGLE_CLIENT_ID__"
            # TI_WEB_TRUSTED_ORIGINS and TI_GCLOUD_AUTH_CALLBACK_URL are patched in
            # by deploy.sh once the run.app URL exists (spec §7.4, phase two).
            # Dev-only identity picker. SAFE ONLY BEHIND IAP — see spec §9.6.
            - name: COMPETENCE_TEST_USER_ENABLED
              value: "true"
            # Seed once, then flip to "false": the seed re-merges on every boot and
            # would resurrect seed records a tester deleted.
            - name: COMPETENCE_PRELOAD_DATA
              value: "false"
            - name: TI_WEB_COOKIE_SECRET
              valueFrom:
                secretKeyRef:
                  name: competence-cookie-secret
                  key: latest
            - name: TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY
              valueFrom:
                secretKeyRef:
                  name: competence-message-hash-key
                  key: latest
            - name: TI_GCLOUD_AUTH_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: competence-google-client-secret
                  key: latest
          startupProbe:
            httpGet:
              path: /health
              port: 8080
            periodSeconds: 2
            failureThreshold: 60
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            periodSeconds: 30
        - name: redis
          image: __REGION__-docker.pkg.dev/__PROJECT_ID__/competence/redis:8-alpine
          # NOTE: "30 1" is ONE argument containing two words, not two arguments.
          # noeviction is deliberate: this Redis is the system of record, not a
          # cache — a full instance must fail writes loudly, never discard data.
          args:
            - "redis-server"
            - "--dir"
            - "/data"
            - "--dbfilename"
            - "dump.rdb"
            - "--save"
            - "30 1"
            - "--appendonly"
            - "no"
            - "--maxmemory"
            - "384mb"
            - "--maxmemory-policy"
            - "noeviction"
          resources:
            limits:
              cpu: 400m
              memory: 512Mi
          volumeMounts:
            - name: redis-state
              mountPath: /data
          startupProbe:
            tcpSocket:
              port: 6379
            periodSeconds: 2
            failureThreshold: 60
      volumes:
        - name: redis-state
          csi:
            driver: gcsfuse.run.googleapis.com
            volumeAttributes:
              bucketName: __BUCKET__
  traffic:
    - percent: 100
      latestRevision: true
```

- [ ] **Step 2: Keep the deploy directory out of the image**

In `.dockerignore`, add to the section that already excludes tests/docs/design (after the `**/design` line):

```
**/deploy
```

- [ ] **Step 3: Verify the placeholder set is exactly what deploy.sh will substitute**

```bash
grep -o '__[A-Z_]*__' packages/competence/deploy/gcp/service.yaml | sort -u
```

Expected output — exactly these **seven** lines (`__REGION__` appears three times in the file, `__PROJECT_ID__` twice, but `sort -u` collapses them):

```
__ADMIN_EMAILS__
__BUCKET__
__GOOGLE_CLIENT_ID__
__IMAGE_TAG__
__PROJECT_ID__
__REGION__
__RUNTIME_SA__
```

Count them. A token here that `deploy.sh` does not substitute ships a literal `__…__` into the running service; a token in `deploy.sh` that is absent here is a silent no-op.

- [ ] **Step 4: Confirm no secret values are present**

```bash
grep -nE 'secret|password|key' packages/competence/deploy/gcp/service.yaml
```

Expected: every hit is either a `secretKeyRef` **name** (`competence-cookie-secret`, `competence-message-hash-key`, `competence-google-client-secret`) or an env var name. **No literal values.**

- [ ] **Step 5: Commit**

```bash
git add packages/competence/deploy/gcp/service.yaml .dockerignore
git commit -m "build(competence): add the Cloud Run service manifest for the GCP test deployment (CA-94)"
```

> YAML syntax is validated for real in Task 9 (Cloud Shell has `python3` + `yaml`); there is no YAML parser in this repo's dependency tree, so it cannot be checked locally. Do not claim it is validated before that step runs.

---

### Task 4: Write the one-time bootstrap script

Spec §7.6, §7.7, §7.9, §7.10, §7.11.

**Files:**
- Create: `packages/competence/deploy/gcp/bootstrap.sh` (mode `755`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the cloud resources `deploy.sh` (Task 5) depends on — Artifact Registry repo `competence` in `__REGION__`, the mirrored `redis:8-alpine` image, bucket `${PROJECT_ID}-competence-redis`, service account `competence-run@…`, secrets `competence-cookie-secret` / `competence-message-hash-key` / `competence-google-client-secret`, and the WIF pool/provider consumed by Task 6.
- Produces: the shell contract `DRY_RUN=1` (print, never execute) reused by Task 5.

- [ ] **Step 1: Create the script**

Create `packages/competence/deploy/gcp/bootstrap.sh`:

```bash
#!/usr/bin/env bash
#
# One-time, idempotent Google Cloud setup for the competence scale-to-zero test
# environment. Safe to re-run: every step checks for existing state first.
#
#   Run for real (in Cloud Shell):   ./bootstrap.sh
#   Preview every command, change nothing:   DRY_RUN=1 ./bootstrap.sh
#
# Design: docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md
#
# This script NEVER prints a secret value. The two random secrets are generated
# by openssl and piped straight into Secret Manager.
set -euo pipefail

DRY_RUN="${DRY_RUN:-}"
REGION="${REGION:-europe-west1}"
# Fixed, not configurable: service.yaml hardcodes this repository segment in its
# image paths, and so does the CD workflow. Changing it here alone would break both.
REPO="competence"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-competence-run}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-competence-deploy}"
GITHUB_REPO="${GITHUB_REPO:-Belleal/ti-engine}"
WIF_POOL="${WIF_POOL:-github}"
WIF_PROVIDER="${WIF_PROVIDER:-github-oidc}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:8-alpine}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-5EUR}"
# Set SKIP_BUDGET=1 if you already manage a budget for this project yourself, or point
# BUDGET_NAME at its display name so the existence check below recognises it. Without
# one of those, a differently-named existing budget is not matched and a second one is
# created, which means duplicate alerts on the same project.
BUDGET_NAME="${BUDGET_NAME:-competence-test}"
SKIP_BUDGET="${SKIP_BUDGET:-}"

if [[ -n "${DRY_RUN}" ]]; then
    PROJECT_ID="${PROJECT_ID:-dry-run-project}"
    PROJECT_NUMBER="${PROJECT_NUMBER:-000000000000}"
else
    command -v gcloud >/dev/null 2>&1 || {
        echo "ERROR: gcloud is required. Run this in Cloud Shell, or use DRY_RUN=1 to preview." >&2
        exit 1
    }
    PROJECT_ID="${PROJECT_ID:-$( gcloud config get-value project 2>/dev/null )}"
    [[ -n "${PROJECT_ID}" ]] || {
        echo "ERROR: no project set. Use 'gcloud config set project <id>' or PROJECT_ID=<id> ./bootstrap.sh" >&2
        exit 1
    }
    PROJECT_NUMBER="$( gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' )"
fi

BUCKET="${BUCKET:-${PROJECT_ID}-competence-redis}"
RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
AR_HOST="${REGION}-docker.pkg.dev"

# Every mktemp'd file is appended here; a single EXIT trap removes them all, no
# matter how many get created. (A second `trap ... EXIT` would replace rather
# than stack with the first, silently dropping earlier files from cleanup —
# this accumulator sidesteps that.) Safe when empty: bash >=4.4 expands
# "${CLEANUP_FILES[@]}" to nothing under `set -u` rather than erroring.
CLEANUP_FILES=()
trap 'rm -f "${CLEANUP_FILES[@]}"' EXIT

# Print-or-execute. Every mutating command goes through this. The dry-run form is
# %q-quoted so multi-word arguments stay visibly distinct and the line is
# copy-pasteable, rather than collapsing into an ambiguous flat string.
run() {
    if [[ -n "${DRY_RUN}" ]]; then
        printf '    [dry-run]'
        printf ' %q' "$@"
        printf '\n'
    else
        "$@"
    fi
}

# Existence probe. In dry-run mode nothing exists, so every create step prints.
exists() {
    [[ -n "${DRY_RUN}" ]] && return 1
    "$@" >/dev/null 2>&1
}

step() { printf '\n==> %s\n' "$1"; }

printf 'project=%s  region=%s  bucket=%s%s\n' \
    "${PROJECT_ID}" "${REGION}" "${BUCKET}" \
    "$( [[ -n "${DRY_RUN}" ]] && printf '  (DRY RUN)' || true )"

step "1/7 Enabling APIs"
run gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    storage.googleapis.com \
    iap.googleapis.com \
    iamcredentials.googleapis.com \
    sts.googleapis.com \
    billingbudgets.googleapis.com \
    --project "${PROJECT_ID}"

step "2/7 Artifact Registry repository + cleanup policy"
if exists gcloud artifacts repositories describe "${REPO}" --location "${REGION}" --project "${PROJECT_ID}"; then
    echo "    repository ${REPO} already exists"
else
    run gcloud artifacts repositories create "${REPO}" \
        --repository-format=docker --location "${REGION}" \
        --description="competence container images" --project "${PROJECT_ID}"
fi

# Keep the 3 most recent versions; delete anything else older than 30 days.
CLEANUP_POLICY="$( mktemp )"
CLEANUP_FILES+=("${CLEANUP_POLICY}")
cat > "${CLEANUP_POLICY}" <<'JSON'
[
  {
    "name": "keep-last-3",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 3 }
  },
  {
    "name": "delete-stale",
    "action": { "type": "Delete" },
    "condition": { "olderThan": "30d" }
  }
]
JSON
run gcloud artifacts repositories set-cleanup-policies "${REPO}" \
    --location "${REGION}" --policy="${CLEANUP_POLICY}" --no-dry-run --project "${PROJECT_ID}"

step "3/7 Mirroring ${REDIS_IMAGE} (Cloud Run cannot pull from Docker Hub)"
if exists gcloud artifacts docker images describe "${AR_HOST}/${PROJECT_ID}/${REPO}/redis:8-alpine"; then
    echo "    redis:8-alpine already mirrored"
elif [[ -n "${DRY_RUN}" ]]; then
    printf '    [dry-run] docker pull %s\n' "${REDIS_IMAGE}"
    printf '    [dry-run] docker tag %s %s/%s/%s/redis:8-alpine\n' "${REDIS_IMAGE}" "${AR_HOST}" "${PROJECT_ID}" "${REPO}"
    printf '    [dry-run] docker push %s/%s/%s/redis:8-alpine\n' "${AR_HOST}" "${PROJECT_ID}" "${REPO}"
else
    gcloud auth configure-docker "${AR_HOST}" --quiet
    docker pull "${REDIS_IMAGE}"
    docker tag "${REDIS_IMAGE}" "${AR_HOST}/${PROJECT_ID}/${REPO}/redis:8-alpine"
    docker push "${AR_HOST}/${PROJECT_ID}/${REPO}/redis:8-alpine"
fi

step "4/7 Redis state bucket (versioned, 7-day noncurrent expiry)"
if exists gcloud storage buckets describe "gs://${BUCKET}"; then
    echo "    bucket gs://${BUCKET} already exists"
else
    run gcloud storage buckets create "gs://${BUCKET}" \
        --location "${REGION}" --uniform-bucket-level-access \
        --public-access-prevention --project "${PROJECT_ID}"
fi
run gcloud storage buckets update "gs://${BUCKET}" --versioning --project "${PROJECT_ID}"

LIFECYCLE="$( mktemp )"
CLEANUP_FILES+=("${LIFECYCLE}")
cat > "${LIFECYCLE}" <<'JSON'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "daysSinceNoncurrentTime": 7 }
    }
  ]
}
JSON
run gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file="${LIFECYCLE}" --project "${PROJECT_ID}"

step "5/7 Runtime service account + least-privilege bindings"
if exists gcloud iam service-accounts describe "${RUNTIME_SA}" --project "${PROJECT_ID}"; then
    echo "    ${RUNTIME_SA} already exists"
else
    run gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
        --display-name="competence Cloud Run runtime" --project "${PROJECT_ID}"
fi

# Bucket-scoped, not project-wide.
run gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member="serviceAccount:${RUNTIME_SA}" --role="roles/storage.objectUser" --project "${PROJECT_ID}"

step "6/7 Secrets (values are generated here and never printed)"
create_random_secret() {
    local name="$1"
    if exists gcloud secrets describe "${name}" --project "${PROJECT_ID}"; then
        echo "    secret ${name} already exists — left untouched"
        return
    fi
    if [[ -n "${DRY_RUN}" ]]; then
        printf '    [dry-run] openssl rand -base64 32 | gcloud secrets create %s --data-file=- --replication-policy=user-managed --locations=%s\n' "${name}" "${REGION}"
        return
    fi
    openssl rand -base64 32 | gcloud secrets create "${name}" \
        --data-file=- --replication-policy=user-managed --locations="${REGION}" \
        --project "${PROJECT_ID}"
    echo "    secret ${name} created"
}
create_random_secret "competence-cookie-secret"
create_random_secret "competence-message-hash-key"

# Grant read on each secret individually (never project-wide secretAccessor).
# The google-client-secret is created by hand (see NEXT STEPS), so on a first run
# it is legitimately absent — say so instead of failing.
for SECRET in competence-cookie-secret competence-message-hash-key competence-google-client-secret; do
    if [[ -n "${DRY_RUN}" ]] || exists gcloud secrets describe "${SECRET}" --project "${PROJECT_ID}"; then
        run gcloud secrets add-iam-policy-binding "${SECRET}" \
            --member="serviceAccount:${RUNTIME_SA}" \
            --role="roles/secretmanager.secretAccessor" --project "${PROJECT_ID}"
    else
        echo "    secret ${SECRET} not present yet — re-run this script after creating it (see NEXT STEPS)"
    fi
done

step "7/7 Workload Identity Federation for GitHub Actions + deploy account"
if exists gcloud iam service-accounts describe "${DEPLOY_SA}" --project "${PROJECT_ID}"; then
    echo "    ${DEPLOY_SA} already exists"
else
    run gcloud iam service-accounts create "${DEPLOY_SA_NAME}" \
        --display-name="competence GitHub Actions deployer" --project "${PROJECT_ID}"
fi
run gcloud artifacts repositories add-iam-policy-binding "${REPO}" \
    --location "${REGION}" --member="serviceAccount:${DEPLOY_SA}" \
    --role="roles/artifactregistry.writer" --project "${PROJECT_ID}"

if exists gcloud iam workload-identity-pools describe "${WIF_POOL}" --location=global --project "${PROJECT_ID}"; then
    echo "    WIF pool ${WIF_POOL} already exists"
else
    run gcloud iam workload-identity-pools create "${WIF_POOL}" \
        --location=global --display-name="GitHub Actions" --project "${PROJECT_ID}"
fi

if exists gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
        --workload-identity-pool="${WIF_POOL}" --location=global --project "${PROJECT_ID}"; then
    echo "    WIF provider ${WIF_PROVIDER} already exists"
else
    # Scoped to the master branch and release tags only (spec §7.7) — a
    # workflow run from any other branch or PR cannot mint a token that
    # impersonates the deploy service account.
    #
    # NOTE: this provider is created here ONLY when absent, so re-running this
    # script does NOT reconcile the attribute condition on an existing
    # provider — editing GITHUB_REPO or the condition below has no effect once
    # the provider exists. To change it later, use:
    #   gcloud iam workload-identity-pools providers update-oidc
    run gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
        --workload-identity-pool="${WIF_POOL}" --location=global \
        --issuer-uri="https://token.actions.githubusercontent.com" \
        --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
        --attribute-condition="assertion.repository=='${GITHUB_REPO}' && (assertion.ref=='refs/heads/master' || assertion.ref.startsWith('refs/tags/competence-v'))" \
        --project "${PROJECT_ID}"
fi

run gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
    --project "${PROJECT_ID}"

step "Billing budget (optional — needs roles/billing.admin on the billing account)"
BILLING_ACCOUNT=""
if [[ -z "${DRY_RUN}" ]]; then
    BILLING_ACCOUNT="$( gcloud billing projects describe "${PROJECT_ID}" --format='value(billingAccountName)' 2>/dev/null || true )"
fi
if [[ -n "${SKIP_BUDGET}" ]]; then
    echo "    SKIPPED by request (SKIP_BUDGET is set) — you are managing the budget yourself."
elif [[ -n "${DRY_RUN}" ]]; then
    printf '    [dry-run] gcloud billing budgets create --billing-account=<account> --display-name=%s --budget-amount=%s --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --filter-projects=projects/%s\n' "${BUDGET_NAME}" "${BUDGET_AMOUNT}" "${PROJECT_NUMBER}"
elif [[ -z "${BILLING_ACCOUNT}" ]]; then
    echo "    SKIPPED: could not read the billing account (needs billing permissions)."
    echo "    Create it by hand: Console → Billing → Budgets & alerts → Create budget (${BUDGET_AMOUNT}/month)."
else
    EXISTING_BUDGET="$( gcloud billing budgets list --billing-account="${BILLING_ACCOUNT##*/}" --filter="displayName=${BUDGET_NAME}" --format='value(name)' 2>/dev/null || true )"
    if [[ -n "${EXISTING_BUDGET}" ]]; then
        echo "    budget ${BUDGET_NAME} already exists — left untouched"
    else
        gcloud billing budgets create \
            --billing-account="${BILLING_ACCOUNT##*/}" \
            --display-name="${BUDGET_NAME}" \
            --budget-amount="${BUDGET_AMOUNT}" \
            --threshold-rule=percent=0.5 \
            --threshold-rule=percent=0.9 \
            --threshold-rule=percent=1.0 \
            --filter-projects="projects/${PROJECT_NUMBER}" \
            || {
                echo "    SKIPPED: the budget could not be created (see the gcloud error above)."
                echo "    Create it by hand: Console → Billing → Budgets & alerts → Create budget (${BUDGET_AMOUNT}/month)."
            }
    fi
fi

cat <<EOF

==> DONE. Manual steps that cannot be scripted (spec §7.4):

  1. Create the app's OAuth client (Console → Google Auth Platform → Clients →
     Create client → Web application). Set the Audience to INTERNAL, which keeps
     sign-in to your Workspace domain and needs no verification. INTERNAL is only
     offered when the project belongs to an organization; without one you get
     EXTERNAL and must add each tester as an allowed test user. Leave the redirect
     URI empty for now — deploy.sh prints the exact value to add once the service
     URL exists.

  2. Store its client secret (the value is read from stdin, never echoed):
       gcloud secrets create competence-google-client-secret \\
         --data-file=- --replication-policy=user-managed --locations=${REGION} \\
         --project ${PROJECT_ID}
       # paste the secret, then press Ctrl-D
     Then re-run this script so the runtime account gets read access to it.

  3. Deploy:  GOOGLE_CLIENT_ID=<client-id> ADMIN_EMAILS=<your-email> ./deploy.sh
     (ADMIN_EMAILS is optional; without it the admin config screens stay
     unreachable, because the allowlist is empty.)

  4. Enable IAP on the service (Console → Cloud Run → competence → Security →
     Require authentication → Identity-Aware Proxy). First-time enablement must
     happen in the Console; it cannot be done from the CLI.
     NO ORGANIZATION? IAP then needs its OWN OAuth client — the Google-managed one
     is organization-only. Create a second Web application client (separate from the
     app's sign-in client in step 1) whose authorised redirect URI is
     https://iap.googleapis.com/v1/oauth/clientIds/<IAP_CLIENT_ID>:handleRedirect
     and hand IAP that client's ID and secret. You own and store those credentials.

  5. Grant each tester roles/iap.httpsResourceAccessor on the service.

  6. GitHub repository variables for CD:
       GCP_PROJECT_ID=${PROJECT_ID}
       GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}
       GCP_DEPLOY_SA=${DEPLOY_SA}
EOF
```

- [ ] **Step 2: Make it executable and check the syntax**

```bash
chmod +x packages/competence/deploy/gcp/bootstrap.sh
bash -n packages/competence/deploy/gcp/bootstrap.sh
```

Expected: no output (exit 0). Any output is a syntax error — fix before continuing.

- [ ] **Step 3: Run the dry run — this is the task's real test**

```bash
DRY_RUN=1 bash packages/competence/deploy/gcp/bootstrap.sh
```

Expected: exit 0, and the output must show:
- the header line `project=dry-run-project  region=europe-west1  bucket=dry-run-project-competence-redis  (DRY RUN)`
- all seven `==>` steps plus the billing step and the `DONE` block
- every mutating command prefixed `[dry-run]` — **and no `gcloud`/`docker` process actually invoked** (there is no gcloud on this machine, so a real call would surface as `command not found`)
- `[dry-run] openssl rand -base64 32 | gcloud secrets create competence-cookie-secret …` — confirming the generate-and-pipe shape, with **no secret value anywhere in the output**

- [ ] **Step 4: Confirm the script cannot leak a secret**

```bash
grep -nE 'echo .*(secret|SECRET)|printf .*\$\{?SECRET' packages/competence/deploy/gcp/bootstrap.sh
```

Expected: matches only lines printing secret *names* or status text (`secret ${name} already exists`, `secret ${SECRET} not present yet`). No line interpolates a secret's value.

- [ ] **Step 5: Confirm the committed file has LF endings**

```bash
git check-attr text eol -- packages/competence/deploy/gcp/bootstrap.sh
```

Expected: `text: set` and `eol: lf`.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/deploy/gcp/bootstrap.sh
git commit -m "build(competence): add the idempotent GCP bootstrap script (CA-94)"
```

---

### Task 5: Write the deploy script

Spec §7.4 (two-phase URL patching), §7.10.

**Files:**
- Create: `packages/competence/deploy/gcp/deploy.sh` (mode `755`)

**Interfaces:**
- Consumes: all seven placeholders defined in Task 3 (`__PROJECT_ID__`, `__REGION__`, `__IMAGE_TAG__`, `__BUCKET__`, `__RUNTIME_SA__`, `__GOOGLE_CLIENT_ID__`, `__ADMIN_EMAILS__`) and the resources created in Task 4.
- Consumes: `GOOGLE_CLIENT_ID` from the environment (required, no default — the OAuth client is created by hand) and `ADMIN_EMAILS` (optional, defaults to empty = no admins).
- Produces: a deployed revision, the patched URL-dependent env vars, and a printed redirect URI for the OAuth client.

- [ ] **Step 1: Create the script**

Create `packages/competence/deploy/gcp/deploy.sh`:

```bash
#!/usr/bin/env bash
#
# Deploy (or redeploy) the competence Cloud Run service. Repeatable.
#
#   GOOGLE_CLIENT_ID=<id> ./deploy.sh                        # deploy :edge
#   GOOGLE_CLIENT_ID=<id> IMAGE_TAG=3.16.0 ./deploy.sh
#   GOOGLE_CLIENT_ID=<id> ADMIN_EMAILS=you@example.com ./deploy.sh
#   DRY_RUN=1 GOOGLE_CLIENT_ID=x ./deploy.sh                 # preview, change nothing
#
# Run bootstrap.sh first. Design: see the spec referenced in bootstrap.sh.
set -euo pipefail

DRY_RUN="${DRY_RUN:-}"
REGION="${REGION:-europe-west1}"
# Fixed, not configurable: service.yaml hardcodes metadata.name, and it is not one of
# the templated tokens — an override here would replace the real service and then abort
# before the IAP re-assert. Change both together or neither.
SERVICE="competence"
IMAGE_TAG="${IMAGE_TAG:-edge}"
# Comma-separated admin allowlist. Empty = no admins, so the admin config
# screens stay unreachable (web-framework >= 1.18.0 reads TI_WEB_AUTH_ADMINS).
ADMIN_EMAILS="${ADMIN_EMAILS:-}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-competence-run}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MANIFEST="${SCRIPT_DIR}/service.yaml"

[[ -n "${GOOGLE_CLIENT_ID:-}" ]] || {
    echo "ERROR: GOOGLE_CLIENT_ID is required (the OAuth client ID for the app's Google sign-in)." >&2
    echo "       It is not a secret; the client SECRET lives in Secret Manager." >&2
    exit 1
}
[[ -f "${MANIFEST}" ]] || { echo "ERROR: ${MANIFEST} not found." >&2; exit 1; }

if [[ -n "${DRY_RUN}" ]]; then
    PROJECT_ID="${PROJECT_ID:-dry-run-project}"
else
    command -v gcloud >/dev/null 2>&1 || {
        echo "ERROR: gcloud is required. Run this in Cloud Shell, or use DRY_RUN=1 to preview." >&2
        exit 1
    }
    PROJECT_ID="${PROJECT_ID:-$( gcloud config get-value project 2>/dev/null )}"
    [[ -n "${PROJECT_ID}" ]] || { echo "ERROR: no project set." >&2; exit 1; }
fi

BUCKET="${BUCKET:-${PROJECT_ID}-competence-redis}"
RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

run() {
    if [[ -n "${DRY_RUN}" ]]; then
        printf '    [dry-run]'
        printf ' %q' "$@"
        printf '\n'
    else
        "$@"
    fi
}

step() { printf '\n==> %s\n' "$1"; }

step "1/6 Rendering the manifest"
RENDERED="$( mktemp )"
trap 'rm -f "${RENDERED}"' EXIT
sed \
    -e "s|__PROJECT_ID__|${PROJECT_ID}|g" \
    -e "s|__REGION__|${REGION}|g" \
    -e "s|__IMAGE_TAG__|${IMAGE_TAG}|g" \
    -e "s|__BUCKET__|${BUCKET}|g" \
    -e "s|__RUNTIME_SA__|${RUNTIME_SA}|g" \
    -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
    -e "s|__ADMIN_EMAILS__|${ADMIN_EMAILS}|g" \
    "${MANIFEST}" > "${RENDERED}"

# Fail loudly rather than shipping a literal placeholder into the service.
if grep -q '__[A-Z_]*__' "${RENDERED}"; then
    echo "ERROR: unsubstituted placeholders remain:" >&2
    grep -o '__[A-Z_]*__' "${RENDERED}" | sort -u >&2
    exit 1
fi
echo "    rendered ${MANIFEST} -> ${RENDERED} (image tag ${IMAGE_TAG})"

step "2/6 Applying the service"
# maxScale=1 bounds concurrent instances of ONE revision, not across
# revisions: this replace creates a new revision while the old one may still
# be draining, so for a short window two Redis processes can both hold
# gs://.../dump.rdb. If the service is under active use when this runs, the
# old instance's SIGTERM save can land after the new instance already loaded,
# overwriting dump.rdb with a stale snapshot. Harmless when idle — the normal
# case, since min-instances=0 means no instance is running to begin with — so
# redeploy while nobody is testing.
run gcloud run services replace "${RENDERED}" --region "${REGION}" --project "${PROJECT_ID}"

step "3/6 Asserting --no-allow-unauthenticated"
# `services replace` above rewrites the whole service, dropping the
# service-level IAP annotation with it — the access gate is down the instant
# the replace lands. Assert this immediately, before touching env vars or
# printing anything, so the service is never open, not even for the few
# seconds the rest of this script takes to run. IAP itself is re-asserted
# last, in step 6 below — see there for why it moved.
run gcloud run services update "${SERVICE}" --region "${REGION}" \
    --project "${PROJECT_ID}" --no-allow-unauthenticated

step "4/6 Patching the URL-dependent settings"
if [[ -n "${DRY_RUN}" ]]; then
    URL="https://competence-000000000000.${REGION}.run.app"
    printf '    [dry-run] gcloud run services describe %s --format=value(status.url)  -> %s\n' "${SERVICE}" "${URL}"
else
    URL="$( gcloud run services describe "${SERVICE}" --region "${REGION}" \
            --project "${PROJECT_ID}" --format='value(status.url)' )"
fi
# NOTE: gcloud splits --update-env-vars on commas, so this works only because
# TI_WEB_TRUSTED_ORIGINS carries exactly one origin. To trust several, use
# gcloud's alternate-delimiter form: --update-env-vars ^:^KEY=a,b:OTHER=c
#
# --container app targets this multi-container service's app container:
# container-scoped flags such as --update-env-vars generally need the target
# container named. Not verified against a live gcloud — if a gcloud version
# rejects --container on this subcommand, removing the flag is the fallback.
run gcloud run services update "${SERVICE}" --region "${REGION}" --project "${PROJECT_ID}" \
    --container app \
    --update-env-vars "TI_WEB_TRUSTED_ORIGINS=${URL},TI_GCLOUD_AUTH_CALLBACK_URL=${URL}/login/google-callback"

step "5/6 Printing operator guidance"
cat <<EOF

  Deployed: ${URL}

  If this is a first deploy (or the URL changed), add this to the OAuth
  client's "Authorised redirect URIs" — sign-in fails until you do:

      ${URL}/login/google-callback

  Verify the gate is on before sharing the URL — two checks, because IAP is a
  service-level annotation and the invoker allowlist is a separate IAM policy;
  neither one shows the other:

      gcloud run services describe ${SERVICE} --region ${REGION} \
        --project ${PROJECT_ID} --format='yaml(metadata.annotations)'
      # expect run.googleapis.com/iap-enabled: "true"

      gcloud run services get-iam-policy ${SERVICE} --region ${REGION} \
        --project ${PROJECT_ID}
      # must NOT list allUsers

  To seed the demo dataset ONCE (then set it back to false, or every boot
  re-adds seeded records):

      gcloud run services update ${SERVICE} --region ${REGION} \
        --project ${PROJECT_ID} --update-env-vars COMPETENCE_PRELOAD_DATA=true
      # open the app, confirm the data is there, then:
      gcloud run services update ${SERVICE} --region ${REGION} \
        --project ${PROJECT_ID} --update-env-vars COMPETENCE_PRELOAD_DATA=false
EOF

step "6/6 Asserting IAP (expected to fail before it has ever been enabled)"
# IAP can only be enabled for the first time in the Console (see bootstrap.sh
# NEXT STEPS), and that can only be done once the service already exists — so
# on a first deploy this command fails. That is expected: enable IAP once in
# the Console, then re-run this command (or all of deploy.sh) and it will
# succeed. This is why the guidance above is printed before this step rather
# than after it — a first-run failure here must never suppress the redirect
# URI the operator needs to register. Service-scoped, unlike --container app
# in step 4.
run gcloud run services update "${SERVICE}" --region "${REGION}" \
    --project "${PROJECT_ID}" --iap
```

- [ ] **Step 2: Make it executable and check the syntax**

```bash
chmod +x packages/competence/deploy/gcp/deploy.sh
bash -n packages/competence/deploy/gcp/deploy.sh
```

Expected: no output (exit 0).

- [ ] **Step 3: Verify the required-argument guard**

```bash
DRY_RUN=1 bash packages/competence/deploy/gcp/deploy.sh; echo "exit=$?"
```

Expected: the `ERROR: GOOGLE_CLIENT_ID is required` message and `exit=1`.

- [ ] **Step 4: Run the dry run — the task's real test**

```bash
DRY_RUN=1 GOOGLE_CLIENT_ID=test-client-id.apps.googleusercontent.com bash packages/competence/deploy/gcp/deploy.sh
```

Expected: exit 0, and the output must show:
- all six `==>` steps
- `rendered …/service.yaml -> /tmp/… (image tag edge)` with **no** unsubstituted-placeholder error — this proves Task 3's placeholder set and this script's `sed` list agree, which is the one thing that silently breaks the deploy
- `[dry-run] gcloud run services replace …`
- `[dry-run] gcloud run services update competence … --no-allow-unauthenticated` on its own (step 3), asserted before the URL patch
- the patch step (step 4) carrying `--container app` and both `TI_WEB_TRUSTED_ORIGINS=` and `TI_GCLOUD_AUTH_CALLBACK_URL=…/login/google-callback`
- the operator guidance block (step 5) printing the redirect URI and both halves of the gate-verification command — printed *before* the final step, so it still appears even when that step is expected to fail on a first run
- `[dry-run] gcloud run services update competence … --iap` as the last step (step 6)

- [ ] **Step 5: Prove the placeholder guard actually fires**

Temporarily break it to confirm the guard is not decorative:

```bash
sed -i 's|__BUCKET__|__BUCKET_TYPO__|' packages/competence/deploy/gcp/service.yaml
DRY_RUN=1 GOOGLE_CLIENT_ID=x bash packages/competence/deploy/gcp/deploy.sh; echo "exit=$?"
git checkout -- packages/competence/deploy/gcp/service.yaml
```

Expected: `ERROR: unsubstituted placeholders remain:` listing `__BUCKET_TYPO__`, and `exit=1`. Then `git checkout` restores the manifest — confirm with `git status --porcelain packages/competence/deploy/gcp/service.yaml` printing nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/deploy/gcp/deploy.sh
git commit -m "build(competence): add the Cloud Run deploy script with two-phase URL patching (CA-94)"
```

---

### Task 6: Push the image to Artifact Registry from CD

Spec §7.9. One build, two registries, identical digests, no stored keys.

**Files:**
- Modify: `.github/workflows/cd.yml`

**Interfaces:**
- Consumes: the WIF pool/provider and `competence-deploy` service account from Task 4.
- Consumes: GitHub repository **variables** `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` (printed by `bootstrap.sh`). Variables, not secrets — none of these values is sensitive.
- Produces: `europe-west1-docker.pkg.dev/<project>/competence/ti-engine-competence` carrying the same tag set as GHCR.

- [ ] **Step 1: Add the `id-token` permission**

In `.github/workflows/cd.yml`, the `publish` job's `permissions:` block currently reads:

```yaml
    permissions:
      contents: read
      packages: write
```

Add the OIDC token permission WIF requires:

```yaml
    permissions:
      contents: read
      packages: write
      id-token: write
```

- [ ] **Step 2: Authenticate to Google Cloud before the build**

Insert these two steps **after** the `Log in to GHCR` step and **before** `Derive image metadata`:

```yaml
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}
      - name: Log in to Artifact Registry
        run: gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet
```

- [ ] **Step 3: Add Artifact Registry to the image list**

In the `Derive image metadata` step, the `images:` value is currently the single line `ghcr.io/belleal/ti-engine-competence`. Replace it with both registries so one push publishes identical digests to both:

```yaml
          images: |
            ghcr.io/belleal/ti-engine-competence
            europe-west1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/competence/ti-engine-competence
```

Leave the `tags:` block and the `Build and push` step **unchanged** — `docker/metadata-action` expands its tag rules across every entry in `images:`, and `build-push-action` pushes them all from the single build.

- [ ] **Step 4: Verify the diff is exactly those three edits**

```bash
git diff .github/workflows/cd.yml
```

Expected: one added `id-token: write` line, two added steps, and the `images:` single line becoming a two-entry block. Nothing else — in particular `on:`, `cache-from`/`cache-to`, and `platforms:` must be untouched.

- [ ] **Step 5: Check the YAML indentation is consistent with the file**

```bash
grep -n "id-token\|google-github-actions\|configure-docker\|images:" -A 3 .github/workflows/cd.yml
```

Expected: the new steps sit at the same indentation as their siblings (6 spaces for `- name:`, 8 for `with:` keys). GitHub rejects the workflow on a malformed indent, and that failure only surfaces after merge.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "build(competence): publish the image to Artifact Registry via Workload Identity Federation (CA-94)"
```

> **Honest limitation:** this workflow triggers only on pushes to `master` and `competence-v*` tags, so it cannot be exercised from the `current` branch. It is verified for real on the first push to `master` after merge (Task 9, user step 8). Do not report it as verified before then.

---

### Task 7: Documentation

Spec §7 throughout. Note that INSTALL.md §11 currently states the admin allowlist is "not an env var" — Task 2 makes that stale, so it must be corrected, not merely appended to.

**Files:**
- Create: `packages/competence/deploy/gcp/README.md`
- Modify: `packages/competence/INSTALL.md` (add "Method D" in §10 after Method C, ~line 274; correct the **Admin access** bullet in §11, ~line 280)

**Interfaces:**
- Consumes: the script names, env var names and manual steps defined in Tasks 3–6. Every command shown must match those files exactly.

- [ ] **Step 1: Write the deploy directory README**

Create `packages/competence/deploy/gcp/README.md`:

```markdown
# competence on Google Cloud Run — scale-to-zero test environment

Two scripts and one manifest. Nothing runs, and nothing is billed, while nobody
is testing; data survives idle periods because Redis snapshots onto a Cloud
Storage bucket.

| File | Purpose |
|---|---|
| `bootstrap.sh` | One-time, idempotent project setup. Re-runnable. `DRY_RUN=1` previews it. |
| `deploy.sh` | Deploy or redeploy the service. Also the redeploy path for a new image tag. |
| `service.yaml` | The Cloud Run manifest (app + Redis sidecar + bucket volume). Templated — applied only through `deploy.sh`. |

Run both in **Cloud Shell** (`gcloud`, `docker` and `openssl` are preinstalled):

```bash
./bootstrap.sh
# follow the printed NEXT STEPS: create the OAuth client, store its secret, re-run
GOOGLE_CLIENT_ID=<client-id> ADMIN_EMAILS=<your-email> ./deploy.sh
```

`ADMIN_EMAILS` is optional — omit it and the admin configuration screens stay
unreachable, because the allowlist is empty.

Full walkthrough, cost model, and the recovery procedure for a locked-out
sign-in: **[INSTALL.md](../../INSTALL.md), Method D**.

Design rationale: `docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`.

> **This environment is only as private as IAP.** It runs with
> `COMPETENCE_TEST_USER_ENABLED=true`, which lets any authenticated visitor act
> as any employee. Never disable IAP on it, and never load real employee data.
```

- [ ] **Step 2: Add Method D to INSTALL.md §10**

Insert after the Method C bullet list and before the `---` that precedes `## 11. First run & data`:

```markdown
### Method D — Google Cloud Run (scale-to-zero test environment)

A hosted environment that costs approximately nothing when idle: one Cloud Run
service holding the app plus a `redis:8-alpine` sidecar, with Redis snapshotting
to a mounted Cloud Storage bucket so data survives scale-to-zero. Fronted by
Identity-Aware Proxy with an email allowlist. Scripts live in
[`deploy/gcp/`](deploy/gcp/README.md); run them in Cloud Shell:

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

**Properties and limits of this shape:**

- **`max-instances=1` is mandatory, not tuning.** Two instances would mean two
  Redis processes writing the same snapshot object.
- **Durability window.** Redis saves 30 seconds after a write and again on
  `SIGTERM` when Cloud Run stops the instance. Writes after the last save are
  lost if the instance dies without a clean shutdown, or if the save exceeds the
  ~10-second shutdown grace. Fine for synthetic test data; not a production
  durability guarantee.
- **Cold start of roughly 5–15 seconds** for the first request after idle.
- **The service URL is a configuration dependency.** It is baked into
  `TI_WEB_TRUSTED_ORIGINS` and the OAuth callback; recreating the service changes
  it and breaks sign-in until `deploy.sh` is re-run and the redirect URI updated.
- **Test-user mode is on**, so any authenticated visitor can act as any
  employee. IAP is the only thing preventing that. Do not disable it, and do not
  put real employee data here.
- **Locked out?** `local` auth is disabled, so a broken OAuth client locks
  everyone out of the app. Re-enable it temporarily — safe, because IAP still
  fronts the service (the `^:^` prefix changes the delimiter so the comma is part
  of the value):
  ```bash
  gcloud run services update competence --region europe-west1 \
    --update-env-vars ^:^TI_WEB_AUTH_METHODS=local,openid-google
  ```
```

- [ ] **Step 3: Correct the now-stale Admin access bullet in §11**

The **Admin access** bullet currently says populating `auth.admins` "is a configuration step, not an env var". Replace that bullet with:

```markdown
- **Admin access:** the admin configuration screens are gated to identities listed in the web-server config `auth.admins` (empty by default → no admins). Set it per environment with **`TI_WEB_AUTH_ADMINS`** (comma-separated; matched against the session user's user ID, username or email — so an OpenID deployment lists emails), or in the config file for a baked-in default. Other non-env config such as the organization structure remains a configuration step — coordinate with the application owner.
```

- [ ] **Step 4: Verify every command in the docs matches the real scripts**

```bash
grep -n "GOOGLE_CLIENT_ID\|bootstrap.sh\|deploy.sh\|TI_WEB_AUTH_ADMINS\|TI_WEB_AUTH_METHODS" packages/competence/INSTALL.md packages/competence/deploy/gcp/README.md
```

Expected: every flag and variable name appearing here also appears in `deploy.sh`, `bootstrap.sh` or `web-config-env.js`. A doc naming a variable the code does not read is a defect — fix the doc.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/deploy/gcp/README.md packages/competence/INSTALL.md
git commit -m "docs(competence): document the Cloud Run scale-to-zero deployment as Method D (CA-94)"
```

---

### Task 8: Version bumps and changelogs

Spec §11. House style: an intro paragraph explaining the *why*, then bullets, closing with the `build(release)` bullet.

**Files:**
- Modify: `packages/web-framework/package.json` (version `1.17.0` → `1.18.0`)
- Modify: `packages/web-framework/CHANGELOG.md` (new entry at the top, above `## Version 1.17.0`)
- Modify: `packages/competence/package.json` (version `3.15.0` → `3.16.0`)
- Modify: `packages/competence/CHANGELOG.md` (new entry at the top)
- Regenerate: `packages/competence/bin/static/fragments/guide/frame-help-*.html` (nine generated guide screens)

- [ ] **Step 1: Bump web-framework and write its changelog entry**

Set `"version": "1.18.0"` in `packages/web-framework/package.json`, then insert above `## Version 1.17.0`:

```markdown
## Version 1.18.0

Every web-server setting a container deployment needs could be supplied per environment except one: the admin allowlist. `auth.admins` was readable only from the config file baked into the image, so a containerized deployment had no way to name an administrator — leaving the admin configuration screens unreachable, or forcing a real identity to be committed to the repository. This closes that gap in the existing `TI_WEB_*` override set.

* feat(web-framework): add the `TI_WEB_AUTH_ADMINS` environment override — comma-separated, **replaces** `auth.admins` (matched against the session user's user ID, username or email), so the admin allowlist is configurable per environment like every other web setting; an explicitly empty value means no admins
* docs(web-framework): document `TI_WEB_AUTH_METHODS` and `TI_WEB_TRUSTED_ORIGINS` in the README's environment-variable list, which had never listed them
* build(release): bump package version from `1.17.0` to `1.18.0`
```

- [ ] **Step 2: Bump competence and write its changelog entry**

Set `"version": "3.16.0"` in `packages/competence/package.json`, then insert the new entry at the top of `packages/competence/CHANGELOG.md`, matching the format of the entry currently at the top:

```markdown
## Version 3.16.0

The app was containerized and continuously delivered, but there was still nowhere for anyone other than a developer to open it. This adds a hosted test environment on Google Cloud Run that costs approximately nothing when idle: a single instance holding the app plus a `redis:8-alpine` sidecar, with Redis snapshotting onto a mounted Cloud Storage bucket so cycles, evaluations and feedback survive scale-to-zero. Identity-Aware Proxy fronts it with an email allowlist, and the app itself is Google-sign-in only. Setup and deployment are idempotent, dry-runnable scripts rather than a wiki page.

* feat(competence): add `deploy/gcp/` — the Cloud Run service manifest plus idempotent `bootstrap.sh` and `deploy.sh`, both supporting `DRY_RUN=1` to preview every command without touching the cloud
* build(competence): publish the container image to Artifact Registry alongside GHCR from a single build in the CD workflow, authenticated with Workload Identity Federation (no stored credentials); exclude `**/deploy` from the image build context
* docs(competence): add INSTALL.md "Method D — Google Cloud Run (scale-to-zero test environment)" covering the durability window, the cold-start cost, the IAP coupling and the locked-out recovery procedure; correct the §11 admin-access note, which no longer needs a config-file edit
* build(release): bump package version from `3.15.0` to `3.16.0`
```

- [ ] **Step 3: Regenerate the guide screens**

The guide builder stamps the competence package version into every user guide screen's footer, so version bumps require regeneration to keep committed screens in sync with the source. Run the builder and commit the result:

```bash
npm run build:guide -w @ti-engine/competence
```

Expected: generated 9 screen(s). The diff should show only `v3.15.0` → `v3.16.0` in the version-stamp line of each screen — if the diff contains any other content change, something else is stale and must be investigated before committing.

- [ ] **Step 4: Verify both bumps and that nothing else changed**

```bash
node -e "for (const p of ['web-framework','competence']) console.log(p, require('./packages/'+p+'/package.json').version)"
git diff --stat
```

Expected: `web-framework 1.18.0`, `competence 3.16.0`, and the diff touching only the four files listed above plus the nine regenerated guide screens.

- [ ] **Step 5: Commit**

```bash
git add packages/web-framework/package.json packages/web-framework/CHANGELOG.md packages/competence/package.json packages/competence/CHANGELOG.md packages/competence/bin/static/fragments/guide/
git commit -m "build(release): bump web-framework to 1.18.0 and competence to 3.16.0 (CA-94)"
```

---

### Task 9: Verification and handoff

Spec §8. The split matters: everything in Step 1–4 can be proven here; everything from Step 5 on requires the user's Google Cloud account and **must not be reported as done until they report back**.

**Files:** none (verification only, plus the YouTrack update).

- [ ] **Step 1: Full test suites**

```bash
npm test --workspaces --if-present
```

Expected: PASS in all four packages, with two specifics to check rather than skim — the `web-server-env-overrides` suite reports **15 passing** (11 pre-existing, verified on this branch's base, plus the 4 from Task 2), and competence's suite count is **unchanged** from before this branch (nothing in this plan touches application code).

- [ ] **Step 2: Lint**

```bash
npx eslint .
```

Expected: 0 errors. Warnings are pre-existing (the CA-90 baseline recorded 25). If a new error appears in the shell scripts, note that ESLint does not lint `.sh` — an error there means a stray `.js` was added.

- [ ] **Step 3: Shell script gates**

```bash
bash -n packages/competence/deploy/gcp/bootstrap.sh
bash -n packages/competence/deploy/gcp/deploy.sh
DRY_RUN=1 bash packages/competence/deploy/gcp/bootstrap.sh > /dev/null && echo "bootstrap dry-run OK"
DRY_RUN=1 GOOGLE_CLIENT_ID=x bash packages/competence/deploy/gcp/deploy.sh > /dev/null && echo "deploy dry-run OK"
```

Expected: both `bash -n` silent, both dry-runs printing their `OK` line.

- [ ] **Step 4: No secret material anywhere in the branch**

```bash
git diff master...HEAD -- . | grep -nEi 'BEGIN (RSA|EC|OPENSSH|PRIVATE)|AIza[0-9A-Za-z_-]{35}|-----BEGIN|client_secret"?\s*[:=]\s*"[^"]' || echo "clean"
git status --porcelain
```

Expected: `clean`, and a clean working tree. Confirm no `.env`, no `.run/*.run.xml`, and no `bin/tls/` material is staged.

- [ ] **Step 5: Hand the runbook to the user**

Report the static results from Steps 1–4 with their actual output, then state plainly that the cloud-side verification is theirs to run, and give them these steps:

1. In Cloud Shell: `cd packages/competence/deploy/gcp && DRY_RUN=1 ./bootstrap.sh` — read the plan, then `./bootstrap.sh` for real.
2. Validate the manifest parses (the check that cannot run locally):
   `python3 -c "import yaml;yaml.safe_load(open('service.yaml'))" && echo "yaml OK"`
3. Create the OAuth client (consent screen **Internal**), store its secret, re-run `./bootstrap.sh` so the runtime account gets read access.
4. `GOOGLE_CLIENT_ID=<id> ./deploy.sh`, then add the printed redirect URI to the OAuth client.
5. Enable IAP in the Console; grant yourself `roles/iap.httpsResourceAccessor`.
6. Seed once with `COMPETENCE_PRELOAD_DATA=true`, confirm the dashboard renders, then set it back to `false`.
7. **The durability round-trip — the one test that matters (spec §9.1).** Create a cycle or an evaluation. Note the time. Leave it idle ~20 minutes so Cloud Run scales to zero. Reload; sign in; confirm the data is still there. Then confirm the snapshot was actually written:
   ```bash
   gcloud storage ls -l gs://<project>-competence-redis/dump.rdb
   ```
   The timestamp must be *after* your write. **If the data is gone or `dump.rdb` is absent, stop and report it** — that is the §9.1 fallback trigger (Redis on an Always-Free `e2-micro`, no application change, only a different `TI_MEMORY_CACHE_REDIS_HOST`).
8. Confirm the gate: a colleague *without* the IAP role is refused; one *with* it gets in. Confirm admin screens open for the `TI_WEB_AUTH_ADMINS` identity and not for another tester.
9. After merging to `master`, confirm the CD run pushes to Artifact Registry (Task 6 cannot be verified before this).
10. A few days later: check the billing report against spec §7.11 and confirm the budget alert exists.

- [ ] **Step 6: Update YouTrack**

Once the user reports the round-trip result:
- `mcp__youtrack__add_issue_comment` on `CA-94` summarizing what shipped and the round-trip outcome.
- `mcp__youtrack__log_work` with the time spent.
- `mcp__youtrack__update_issue` → `Stage: Test` while the user verifies; `State: Verified` / `Stage: Done` only after they confirm step 7 passed. Set `Version` to `v3.16.0` and `Shipped` to the verification date **+1 day** (the MCP stores date fields one day early).

Then create the follow-up card the spec calls for (§10), so it is not lost:
- `mcp__youtrack__create_issue`, parent `CA-11`, summary `Map OIDC identities to employee records (retire the test-user cookie)`, `State: Open` / `Stage: Backlog`. Body: employees already carry an `email` field; resolving `session.user.email` to an employee in `augmentSession` (`packages/competence/bin/competence-web-server.js:93`) would let `COMPETENCE_TEST_USER_ENABLED` be turned off and remove the hard IAP coupling recorded in spec §9.6.
- Link it to this task's card with `relates to`.

- [ ] **Step 7: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill: 8 commits on `current`, PR to `master`. Do not merge without the user's instruction.

---

## Notes for the implementer

- **The riskiest assumption is Redis-on-gcsfuse** (spec §9.1). Nothing in Tasks 3–8 proves it. If Task 9 step 7 fails, the fix is not to patch the manifest repeatedly — it is the documented `e2-micro` fallback.
- **Fractional per-container CPU** (`600m` + `400m` = 1 vCPU) may be rejected by Cloud Run in a multi-container service (spec §9.4). If `deploy.sh` step 2 fails with a resource error, set both containers to `cpu: "1"` (a 2-vCPU instance, still inside the free tier) and note the change in the INSTALL.md Method D properties list.
- **IAP after `services replace`** is re-asserted by `deploy.sh` step 6 — deliberately the *last* step, not the first thing after the replace — because a full replace rewrites the service and drops the service-level IAP annotation with it. `--no-allow-unauthenticated` is re-asserted separately and immediately, in step 3, so the service is never open even during the window before step 6 runs. If step 6 fails on a service where IAP was never enabled, enable it once in the Console, then re-run — do not remove the re-assert step; without it a redeploy could silently drop the only access gate.
- **Do not enable `COMPETENCE_TEST_USER_ENABLED` anywhere IAP is not in front.** It is the documented hard coupling in spec §9.6.
