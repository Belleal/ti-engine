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
