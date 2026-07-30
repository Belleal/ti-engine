# Deploying competence to Google Cloud Run — first-time walkthrough

A step-by-step setup guide for a **scale-to-zero test environment**: while nobody is testing, no
Cloud Run instance runs and no compute is billed. A few resources do persist — the stored container
image, the Redis snapshot and three secrets — which is where the €0–1/month below comes from.
Every step says *which* surface you should be on — **Cloud Shell**,
**GCP Console**, **GitHub**, or a **browser** — because the usual way to lose an hour here is doing
the right thing in the wrong place.

| | |
|---|---|
| **Region** | `europe-west1` |
| **Hands-on time** | roughly 60–90 minutes |
| **Expected cost** | €0–1 / month |
| **You need** | Owner on the GCP project, admin on the GitHub repository |

For the operational reference (full variable list, TLS, upgrades, backups) see
[INSTALL.md](../../INSTALL.md) — this file is the guided first run. For *why* each piece is shaped the
way it is, see `docs/superpowers/specs/2026-07-29-competence-gcp-scale-to-zero-design.md`.

## What you will end up with

- One Cloud Run service holding **two containers** — the app and a `redis:8-alpine` sidecar reached
  over `127.0.0.1` — that scales to zero when idle.
- Redis writing its snapshot to a Cloud Storage bucket, so data outlives the idle shutdown.
- A normal HTTPS link fronted by **Identity-Aware Proxy**: only the colleagues you name get through.

---

## Before you start: the ordering that matters

**Google Cloud has to exist before GitHub can talk to it.** The release pipeline pushes the image
into an Artifact Registry repository and signs in through a Workload Identity provider, and
`bootstrap.sh` is what creates both. So until you have run bootstrap *and* set the three repository
variables, every CD run fails at its Google Cloud authentication step with:

```text
google-github-actions/auth failed with: the GitHub Action workflow must
specify exactly one of "workload_identity_provider" or "credentials_json"
```

That failure happens **before** the build, so such a run publishes no image anywhere — not even to
GHCR, where it would otherwise land. It is not a broken pipeline; it is the pipeline telling you the
Google Cloud side is not ready yet. Work through the phases in order and it goes green.

Two more things that look like faults but are not:

- **`deploy.sh` fails on its last step the first time.** Its final action asserts IAP, and IAP must be
  switched on in the Console once before the CLI can touch it. Everything before that step succeeded.
- **The OAuth redirect URI cannot be registered in advance**, because it contains the service URL,
  which does not exist until after the first deploy. Phase 7 loops back to fill it in.

---

## Phase 1 — Pick the project and confirm billing

**Where: GCP Console**

- [ ] Open [console.cloud.google.com](https://console.cloud.google.com/) and use the project picker
    to create a project (e.g. `competence-test`) or select an existing one.
- [ ] **Write down the project *ID*, not the display name.** It is the lowercase-with-digits string
    such as `competence-test-431807`, shown under *Project info*. Everything below calls it
    `<PROJECT_ID>`.
- [ ] Under **Billing**, confirm a billing account is linked. Cloud Run and Artifact Registry refuse
    to work without one even when your usage sits inside the free tier.

A dedicated project is worth it: it keeps this environment's cost, permissions and audit trail
separate, and teardown becomes "delete the project".

## Phase 2 — Run the bootstrap script

**Where: Cloud Shell**

Cloud Shell is a Linux terminal in the browser with `gcloud`, `docker`, `git` and `openssl` already
installed and already signed in as you. Nothing to install locally.

- [ ] In the Console top bar, click the terminal icon (**Activate Cloud Shell**) and wait for a prompt.
- [ ] Point it at your project:
    ```bash
    gcloud config set project <PROJECT_ID>
    ```
- [ ] Clone the repository and enter the deploy directory:
    ```bash
    git clone https://github.com/Belleal/ti-engine.git
    cd ti-engine/packages/competence/deploy/gcp
    ```
- [ ] **Preview first.** This prints every command the script would run and executes none of them:
    ```bash
    DRY_RUN=1 ./bootstrap.sh
    ```
- [ ] Run it for real:
    ```bash
    ./bootstrap.sh
    ```

What it creates:

| Resource | Why |
|---|---|
| Enabled APIs | Cloud Run, Artifact Registry, Secret Manager, Storage, IAP, IAM Credentials, STS, Billing Budgets |
| Artifact Registry repo `competence` | Where the image lives — Cloud Run can only pull from here |
| Mirrored `redis:8-alpine` | The sidecar image; Cloud Run cannot pull from Docker Hub |
| Bucket `<PROJECT_ID>-competence-redis` | Holds the Redis snapshot. Versioned, noncurrent versions expire after 7 days |
| Service account `competence-run` | What the app runs as: read on three secrets, write on that one bucket, nothing else |
| Two generated secrets | Cookie secret and message-integrity key, created by `openssl` and piped straight into Secret Manager — never printed |
| Workload Identity pool + provider | Lets GitHub Actions sign in with no stored key, and only from `master` or a `competence-v*` tag |
| Budget alert | €5/month. Skipped with instructions if you lack billing-admin rights, which is fine |

**Keep the output.** The script ends with a `NEXT STEPS` block containing the three GitHub variable
values needed in phase 4. Re-running the script prints it again, so nothing is lost — it is safe to
re-run, because every step checks for existing state first.

**Already have a budget for this project?** The existence check matches on the display name
`competence-test`, so a budget of your own with a different name is not recognised and you would end
up with two budgets alerting on the same project. Either skip the step or point it at yours:

```bash
SKIP_BUDGET=1 ./bootstrap.sh                         # you manage the budget yourself
BUDGET_NAME="<your budget's display name>" ./bootstrap.sh   # recognise the existing one
```

To see what yours is called: `gcloud billing budgets list --billing-account=<account-id>
--format="table(displayName,amount.specifiedAmount)"`.

## Phase 3 — Create the app's OAuth client

**Where: GCP Console, then Cloud Shell**

**You create one client here: the app's own sign-in client.** IAP does not need you to make one —
enabling it directly on a Cloud Run service provisions its own, named `IAP-<project>-app`, and it does
this **even for a project with no organization** (verified on one).

> Google's IAP documentation says a *custom* OAuth client is required for "web applications that are
> in projects that aren't in a Google Cloud organization". That predates the direct-on-Cloud-Run
> integration and does not match its behaviour. Do not pre-create a client for IAP. If the Console
> ever does ask you for a client ID and secret, create a **Web application** client, then reopen it and
> add the redirect URI `https://iap.googleapis.com/v1/oauth/clientIds/<IAP_CLIENT_ID>:handleRedirect`
> using its own ID — but expect not to need this.

The app's client is the sign-in *the app itself* shows, separate from the IAP gate. You will sign in
twice when you first open the service, which is normal and usually one click the second time.

> The script's output says *APIs & Services → Credentials*. Google has since moved this under
> **Google Auth Platform**, with *Branding*, *Audience* and *Clients* sections. If your menu differs,
> search the Console for "Google Auth Platform".

- [ ] Open **Google Auth Platform**. If prompted to configure the app, fill in *Branding* — an app
    name and support email are enough.
- [ ] Set the **Audience**. Which option you get depends on the project:
    - **Internal** — only offered when the project belongs to a Google Cloud organization. Restricts
      sign-in to your Workspace domain and needs no further decisions.
    - **External** — the only option for a project with no organization. Then pick a publishing
      status: leave it **Testing** and add each tester under *Test users* (capped at 100), or set it
      to **In production**, which removes the cap. Either way **no Google verification is required
      here**, because the app requests only the non-sensitive `openid email profile` scopes — so
      testers see no "unverified app" warning and their grants do not expire after seven days.
    - With External, anyone with a Google account could in principle complete this sign-in. That is
      acceptable only because IAP decides who reaches the app at all — see phase 7, and do not skip it.
- [ ] **The app's client.** Clients → **Create client**, type **Web application**, name it e.g.
    `competence app sign-in`. **Leave the redirect URI empty** — phase 7 fills it in, once the
    service URL exists.
- [ ] Copy both values. The **Client ID** ends in `.apps.googleusercontent.com` and is not sensitive.
    The **Client secret** is — do not put it in a file, a chat, or a commit.
- [ ] That is the only client to create. **Do not make one for IAP** — phase 7 provisions it.
- [ ] Store the secret. This reads from your keyboard, so nothing lands in shell history:
    ```bash
    gcloud secrets create competence-google-client-secret \
      --data-file=- --replication-policy=user-managed --locations=europe-west1 \
      --project <PROJECT_ID>
    ```
    Paste the secret, press **Enter**, then **Ctrl-D**.
- [ ] Re-run `./bootstrap.sh` so the runtime service account is granted read access to it. It will
    report what already exists and add only the missing binding.

### Reusing an OAuth client you already have

This applies to the **app's sign-in client**. IAP is unaffected — it provisions its own client either
way, so reuse has no bearing on it.

The script never creates the client, so reuse means skipping the create bullet above — but **not** the
secret one. Three things still apply:

- **Store its secret under the expected name.** `service.yaml` mounts
  `competence-google-client-secret`, so the existing client's secret has to go into Secret Manager
  under exactly that name. Retrieve it from Google Auth Platform → **Clients** → your client; if the
  value is no longer displayable, add an additional secret to that client rather than creating a new
  client.
- **Add the redirect URI, do not replace it.** A client can hold several authorised redirect URIs, so
  append the one `deploy.sh` prints in phase 7 and leave any existing entries alone.
- **Know what you are sharing.** A client reused across deployments shares one consent screen and one
  secret: rotating the secret for one deployment breaks the other. If the client lives in a different
  GCP project that is fine — Google validates the client, not the project — but its branding and
  Audience belong to that other project.

Pass the existing client's ID as `GOOGLE_CLIENT_ID` in phase 6. IAP is untouched by any of this — it
provisions and manages its own client.

## Phase 4 — Give GitHub the three variables

**Where: GitHub**

- [ ] Repository → **Settings** → **Secrets and variables** → **Actions**.
- [ ] Select the **Variables** tab (*not* Secrets) → **New repository variable**, three times:

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | your project ID |
| `GCP_WIF_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github-oidc` |
| `GCP_DEPLOY_SA` | `competence-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |

None of the three is sensitive — they are identifiers, and the security comes from the provider
trusting only this repository on `master` or a `competence-v*` tag.

## Phase 5 — Get the image into Artifact Registry

**Where: GitHub, then Cloud Shell**

Pick either route. The tag gives you a pinned version to point at deliberately; the re-run is quicker.

**Option A — re-run the pipeline.** Repository → **Actions** → the most recent failed **CD** run →
**Re-run failed jobs**. It rebuilds from the same commit, which is what you want.

**Option B — cut a release tag**, from a local clone on `master`. Derive the version from the package
rather than typing one, so the tag always matches what the image will report:

```bash
git checkout master && git pull
VERSION=$(node -p "require('./packages/competence/package.json').version")
git tag "competence-v${VERSION}"
git push origin "competence-v${VERSION}"
```

That publishes `:<version>` and `:latest` alongside `:edge`, to both registries from a single build.
Tag only a version whose changelog entry is in place — the tag is what the release is named after.

- [ ] Watch the run go green, then confirm the image arrived:
    ```bash
    gcloud artifacts docker images list \
      europe-west1-docker.pkg.dev/<PROJECT_ID>/competence --include-tags
    ```
    You should see `ti-engine-competence` and the mirrored `redis`. Note the tag you want to deploy.

## Phase 6 — Deploy the service

**Where: Cloud Shell**

- [ ] Optional preview:
    ```bash
    DRY_RUN=1 GOOGLE_CLIENT_ID=<client-id> ./deploy.sh
    ```
- [ ] Deploy. `ADMIN_EMAILS` is your own Google address — without it the admin configuration screens
    stay unreachable, because the allowlist is empty:
    ```bash
    GOOGLE_CLIENT_ID=<client-id> \
    ADMIN_EMAILS=<your-google-address> \
    IMAGE_TAG=edge \
    ./deploy.sh
    ```

> **The last step will fail on a first deploy, and that is expected.** IAP has to be enabled in the
> Console once before the CLI can assert it. Everything before that step succeeded; phase 7 enables
> IAP and you re-run the script, after which it succeeds every time.

- [ ] Copy the two things it prints: the **service URL** and the **redirect URI** to register.

Behind the scenes it rendered the manifest, applied it, asserted that unauthenticated access is
refused, then patched the two settings that could not be known until the URL existed — the trusted
origin and the OAuth callback.

## Phase 7 — Close the gate, then let testers in

**Where: GCP Console, then Cloud Shell**

> **Do not share the URL before finishing this phase.** This environment runs with the developer
> test-user picker enabled, which lets anyone who reaches the login screen act as *any* employee,
> Supervisor included. IAP is the only thing preventing that.

- [ ] **Register the redirect URI.** Google Auth Platform → **Clients** → your client → under
    *Authorised redirect URIs*, add the exact value `deploy.sh` printed:
    ```text
    https://competence-<hash>-<region>.a.run.app/login/google-callback
    ```
    Sign-in fails with a redirect-mismatch error until this matches character for character.
- [ ] **Cloud Run gives the service two URLs, and only one of them is configured.** Check both:
    ```bash
    gcloud run services describe competence --region europe-west1 --project <PROJECT_ID> \
      --format="value(status.url, metadata.annotations['run.googleapis.com/urls'])"
    ```
    You will see a legacy `https://competence-<hash>-<region>.a.run.app` and a newer
    `https://competence-<project-number>.<region>.run.app`. **Both reach this same service**, but
    `deploy.sh` configures only `status.url`, so a tester who opens the other one fails both the CSRF
    origin check and the OAuth callback. Either circulate just the configured URL, or register the
    callback for both hosts and trust both:
    ```bash
    gcloud run services update competence --region europe-west1 --project <PROJECT_ID> \
      --container app \
      --update-env-vars '^|^TI_WEB_TRUSTED_ORIGINS=https://<url-one>,https://<url-two>'
    ```
    Note the delimiter is `^|^`, **not** the `^:^` used elsewhere in this guide — these values contain
    `:` in `https://`, so a colon delimiter would split them. Pick a character the value cannot contain.
- [ ] **Enable IAP.** Cloud Run → `competence` → **Security** tab → **Require authentication** →
    **Identity-Aware Proxy**. Accept the prompt granting IAP permission to invoke the service.

    **It should not ask you for anything.** IAP creates its own OAuth client, which appears in
    Google Auth Platform → Clients as `IAP-<project>-app`. This holds for projects with no
    organization too, despite what the IAP docs imply. If it *does* ask, see the note in phase 3.
- [ ] **Add your testers — on the IAP page, not the Security tab.** The Cloud Run Security tab only
    *enables* IAP; access is a policy on a separate IAP resource
    (`projects/<number>/iap_web/cloud_run-<region>/services/competence`), so the grant lives elsewhere:

    1. Open **Security → Identity-Aware Proxy** ([console.cloud.google.com/security/iap](https://console.cloud.google.com/security/iap)).
    2. Tick the `competence` Cloud Run service.
    3. In the **info panel on the right**, add the person's email as a principal.
    4. Give them the role **IAP-secured Web App User** (`roles/iap.httpsResourceAccessor`) and click
       **Add**.

    Add yourself too, or you will lock yourself out. For the CLI equivalent, check
    `gcloud iap web add-iam-policy-binding --help` for the resource-type flags your gcloud version
    accepts — and note that granting this role with `gcloud run services add-iam-policy-binding`
    puts it on the *Cloud Run* resource, which is not where IAP reads its policy, so it would appear
    to succeed while changing nothing.
- [ ] Re-run the deploy so its final IAP assertion passes and the script finishes clean.
- [ ] **Prove the gate is on** before sharing anything. The first command must show
    `iap-enabled: 'true'`; the second must **not** list `allUsers`:
    ```bash
    gcloud run services describe competence --region europe-west1 \
      --project <PROJECT_ID> --format='yaml(metadata.annotations)'

    gcloud run services get-iam-policy competence --region europe-west1 \
      --project <PROJECT_ID>
    ```

## Phase 8 — Seed the demo data and sign in

**Where: Cloud Shell, then a browser**

- [ ] Turn the seed on:
    ```bash
    gcloud run services update competence --region europe-west1 \
      --project <PROJECT_ID> --update-env-vars COMPETENCE_PRELOAD_DATA=true
    ```
- [ ] Open the service URL. Expect **5–15 seconds** for the first load — that is the cold start, and
    it recurs after each idle period. Sign in with Google (IAP), then again on the app's own login
    screen.
- [ ] On the login screen pick an identity from the **Test user** panel — `#22` holds all three roles
    and is the best starting point — and confirm the dashboard renders with demo data.

    **This is how every tester chooses who they are.** The app does not yet map a Google identity to
    an employee record, so signing in tells it *that* you are authenticated, not *who* you are: without
    a pick it falls back to employee `20` for everyone. The choice is stored in a cookie in each
    person's own browser, so testers do not collide — each picks independently. Retiring this in favour
    of real identity mapping is tracked as CA-95.
- [ ] Need an employee who is not in the seeded org chart? The app has its own **Employee Management**
    screen (visible to a Manager or Supervisor — pick `#22`), which creates and edits employee records.
    Note that adding a record still does not give that person a login of their own; it adds an identity
    that testers can select in the panel above.
- [ ] **Turn the seed back off.** While it stays on, the seed is re-applied on every boot and will
    resurrect records a tester deleted:
    ```bash
    gcloud run services update competence --region europe-west1 \
      --project <PROJECT_ID> --update-env-vars COMPETENCE_PRELOAD_DATA=false
    ```

## Phase 9 — The one test that actually matters

**Where: browser, then Cloud Shell**

Everything else here has been exercised. The Redis-snapshot-to-bucket path has not — it is reasoned
from documented behaviour, never run against a live deployment (design §9.1). Until this passes, do
not trust the environment with anything a tester would be annoyed to lose.

- [ ] In the app, create something recognisable — a cycle, or an evaluation. Note the time.
- [ ] Leave it alone for **~20 minutes** so Cloud Run shuts the instance down. Do not reload.
- [ ] Reload, sign in, and confirm what you created is still there.
- [ ] Confirm the snapshot was written — the timestamp must be **later** than your change:
    ```bash
    gcloud storage ls -l gs://<PROJECT_ID>-competence-redis/dump.rdb
    ```

**If the data is gone or `dump.rdb` is missing, stop.** That is the documented fallback trigger:
Redis moves to an Always-Free `e2-micro` VM reached over a private address, which needs **no
application change** — only a different `TI_MEMORY_CACHE_REDIS_HOST`. Note that the durability margin
is thinner than it first appears: under CPU throttling the periodic save is opportunistic, so the
shutdown save is effectively the only reliable one, and it has about ten seconds to serialise, upload
and rename.

Worth checking once more:

- A colleague *without* the IAP role is refused; one with it gets in.
- Admin screens open for the address in `ADMIN_EMAILS`, and not for another tester.
- A few days later: Billing → Reports shows roughly nothing, and the €5 budget alert exists.

---

## Living with it

### Shipping a new version

A merge to `master` publishes the image automatically, but **it does not reach the running service**.
Re-run the deploy to pick it up:

```bash
cd ~/ti-engine && git pull
cd packages/competence/deploy/gcp
GOOGLE_CLIENT_ID=<client-id> ADMIN_EMAILS=<your-google-address> IMAGE_TAG=edge ./deploy.sh
```

Redeploy while the service is **idle**. A deploy briefly creates two revisions, and if someone is
actively using the app the draining instance can overwrite the snapshot with a staler one (CA-96).

### Locked out of the app

If the OAuth client breaks nobody can sign in, because local credentials are disabled. Re-enable them
briefly — the `^:^` prefix changes the list separator so the comma stays part of the value, and
`--project` keeps you off the wrong service:

```bash
gcloud run services update competence --region europe-west1 \
  --project <PROJECT_ID> \
  --update-env-vars ^:^TI_WEB_AUTH_METHODS=local,openid-google
```

That enables a hardcoded `admin`/`admin` login, safe only because IAP still fronts the service.
**Revert the moment sign-in works again:**

```bash
gcloud run services update competence --region europe-west1 \
  --project <PROJECT_ID> \
  --update-env-vars TI_WEB_AUTH_METHODS=openid-google
```

### Tearing it down

Deleting the project removes everything including billing. To keep the project, delete the Cloud Run
service, the bucket, the Artifact Registry repository and the three secrets.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Pipeline: `must specify exactly one of workload_identity_provider` | The three repository variables are missing or misspelled (phase 4). Check you used the *Variables* tab, not Secrets. |
| Pipeline: `Security Token Service API has not been used` | Bootstrap has not run. Run `./bootstrap.sh`. |
| Pipeline: permission denied pushing the image | The Artifact Registry repository does not exist yet — bootstrap creates it. Phase 2 before phase 5. |
| `deploy.sh`: unsubstituted placeholders remain | A guard doing its job; the manifest and script disagree. Re-clone rather than hand-editing. |
| `deploy.sh`: the final `--iap` step fails | Expected on a first deploy. Enable IAP in the Console, then re-run (phase 7). |
| Sign-in: `redirect_uri_mismatch` | The callback is not registered on the OAuth client, or does not match exactly (phase 7). |
| "No sign-in method is configured" | The client ID never reached the service. Re-run `deploy.sh` with `GOOGLE_CLIENT_ID` set. |
| A Google error before the app appears at all | IAP refusing you. Your account needs *IAP-secured Web App User* (phase 7). |
| IAP setup asks for an OAuth client ID and secret | Not expected — IAP normally creates its own `IAP-<project>-app` client, including without an organization. If it asks, see the note in phase 3. |
| Sign-in blocked with "access blocked" or an app-not-verified screen | An External consent screen still in *Testing* with your account not listed under *Test users*, or a client whose type is not *Web application* (phase 3). |
| Admin screens missing for you | `ADMIN_EMAILS` was empty or a different address. Re-run `deploy.sh` with it set. |
| First page load takes ages | Cold start, 5–15 seconds, by design — the service was scaled to zero and cost nothing while idle. |
| Writes start failing under heavy use | Redis hit its memory ceiling and refuses writes rather than silently dropping them. Check the logs; raise the sidecar's `--maxmemory` if this is real usage. |

**Where to look:** Cloud Run → `competence` → **Logs** shows both containers. A healthy boot shows
Redis connecting, then `Web server started at address 'http://0.0.0.0:8080'`, then
`Instance '…' started successfully`.

---

Only **synthetic seed data** belongs in this environment. No real employee records.
