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
    --member="serviceAccount:${RUNTIME_SA}" --role="roles/storage.objectAdmin" --project "${PROJECT_ID}"

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
if [[ -n "${DRY_RUN}" ]]; then
    printf '    [dry-run] gcloud billing budgets create --billing-account=<account> --display-name=competence-test --budget-amount=%s --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --filter-projects=projects/%s\n' "${BUDGET_AMOUNT}" "${PROJECT_NUMBER}"
elif [[ -z "${BILLING_ACCOUNT}" ]]; then
    echo "    SKIPPED: could not read the billing account (needs billing permissions)."
    echo "    Create it by hand: Console → Billing → Budgets & alerts → Create budget (${BUDGET_AMOUNT}/month)."
else
    EXISTING_BUDGET="$( gcloud billing budgets list --billing-account="${BILLING_ACCOUNT##*/}" --filter="displayName=competence-test" --format='value(name)' 2>/dev/null || true )"
    if [[ -n "${EXISTING_BUDGET}" ]]; then
        echo "    budget competence-test already exists — left untouched"
    else
        gcloud billing budgets create \
            --billing-account="${BILLING_ACCOUNT##*/}" \
            --display-name="competence-test" \
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

  1. Create the app's OAuth client (Console → APIs & Services → Credentials →
     Create credentials → OAuth client ID → Web application). Consent screen
     must be INTERNAL. Leave the redirect URI empty for now — deploy.sh prints
     the exact value to add once the service URL exists.

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

  5. Grant each tester roles/iap.httpsResourceAccessor on the service.

  6. GitHub repository variables for CD:
       GCP_PROJECT_ID=${PROJECT_ID}
       GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}
       GCP_DEPLOY_SA=${DEPLOY_SA}
EOF
