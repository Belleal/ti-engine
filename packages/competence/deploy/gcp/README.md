# competence on Google Cloud Run — scale-to-zero test environment

Two scripts and one manifest. While nobody is testing, no Cloud Run instance runs
and no compute is billed — only the stored image, the Redis snapshot and the
secrets persist, for a few cents a month. Data survives idle periods because Redis
snapshots onto a Cloud Storage bucket.

**Setting this up for the first time?** Follow **[WALKTHROUGH.md](WALKTHROUGH.md)** —
a guided, nine-phase run through both the Google Cloud and GitHub sides, including
the ordering that trips people up and the two steps that fail by design on a first
deploy. The rest of this file is the short reference.

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

`bootstrap.sh` is safe to re-run, but it does not *reconcile* resources that
already exist — notably, the Workload Identity provider's attribute condition
and any of the three secrets are left untouched once present, even if the
inputs change.

**Before merging to `master`:** the three GitHub repository variables
`bootstrap.sh` prints at the end (`GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SA`) must already be set, or the CD workflow's publish job fails —
see the CD precondition in **[INSTALL.md](../../INSTALL.md), Method D**.

Guided first-time setup: **[WALKTHROUGH.md](WALKTHROUGH.md)**. Cost model and the
recovery procedure for a locked-out sign-in: **[INSTALL.md](../../INSTALL.md),
Method D**.

Design rationale: `docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`.

> **This environment is only as private as IAP.** It runs with
> `COMPETENCE_TEST_USER_ENABLED=true`, which lets any authenticated visitor act
> as any employee. Never disable IAP on it, and never load real employee data.
