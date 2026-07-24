# Running competence in GitHub Codespaces (test / demo only)

This `.devcontainer/` lets you run the **competence** app straight from GitHub, in the browser, for
**testing and demos** — not production. It starts the repo's dev `docker-compose.yml` (the app +
Redis Stack) inside a Codespace and forwards the app on port **3000**. Sign-in uses **local auth**
plus the dev **Test User** panel (`TI_WEB_AUTH_METHODS=local`, `COMPETENCE_TEST_USER_ENABLED=true`
from the dev compose), so no Azure/OIDC setup is needed. The startup script sets `TI_WEB_TRUSTED_ORIGINS`
to both `http(s)://localhost:3000` (VS Code tunnels the port to localhost, so that's the browser origin) and
the public `https://<name>-3000.<domain>` URL, so login POSTs pass the app's CSRF Origin/Referer check whichever
way you open the app.

> Production hosting is different — deploy the published image (`ghcr.io/belleal/ti-engine-competence`)
> to a container platform. See [`packages/competence/INSTALL.md`](../packages/competence/INSTALL.md).

## Launch it

1. On GitHub, open the repo and switch to a branch that contains this `.devcontainer/` (e.g. `current`,
   or `master` once merged).
2. **Code ▸ Codespaces ▸ Create codespace on `<branch>`**.
3. Wait for the first build (a few minutes — it builds the app image and pulls Redis Stack).
4. When the **Ports** panel shows port **3000**, open its URL. Sign in via the Test User pills or
   `admin` / `admin`.

Useful terminal commands inside the Codespace:

```bash
docker compose logs -f competence        # app logs
docker compose ps                         # status/health
docker compose up -d --build competence   # rebuild + restart after a code change
docker compose down                       # stop the stack
```

## Viewing the app's console output

The stack starts **detached** (`docker compose up -d`), so the app's log does not stream into the
Codespace's startup terminal. Open a terminal and follow it:

```bash
docker compose logs -f competence   # follow just the app
docker compose logs -f              # follow all services (competence + redis)
```

## Loading demo data

Redis starts **empty**. To populate demo data (employees, a cycle, sample evaluations), seed once:

```bash
COMPETENCE_PRELOAD_DATA=true docker compose up -d
```

This is **destructive** — while the flag is `true` it wipes and reloads the seed data on *every* start. After
seeding, run plain `docker compose up -d` (the flag defaults to `false`) to keep your changes; the `redis-data`
volume persists them across restarts.

## What to set up in GitHub

For personal repos, Codespaces is on by default (with a monthly free quota). For an **organization
repo** an owner may need to configure it:

- **Enable Codespaces for the org** — Org **Settings ▸ Codespaces**: allow the repo/members and set a
  **spending limit / billing** (Codespaces compute is billed beyond the free quota).
- **Port sharing (only if you want to share a demo link)** — forwarded ports are **private** by
  default. In the **Ports** panel you can set port 3000 to **Org** (signed-in members of your
  organization only) or **Public** (**anyone on the internet with the URL**). Org policy can restrict
  public forwarding (Org Settings ▸ Codespaces ▸ *port visibility*).

  > ⚠️ **Disposable test data only.** This stack runs with **test/local authentication** and
  > **dev-only fallback secrets** (see the intro). Never put real or sensitive data in it, and only
  > make port 3000 **Public** for a short-lived demo — a Public URL is reachable by anyone who has it.
- **Machine type (optional)** — the 2-core default works; pick 4-core when creating the Codespace for
  a faster build.

Nothing else is required for testing:

- **No registry auth** — the Codespace **builds** the image from source; it does not pull from GHCR.
- **No secrets** — the dev compose supplies throwaway dev values for the message-hash and cookie
  secrets. (You *may* add Codespaces secrets under repo/org settings if you later want to test with
  real OIDC, but it's not needed for local-auth testing.)
