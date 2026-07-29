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
