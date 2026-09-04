# ti-engine web framework

![Logo](https://raw.githubusercontent.com/Belleal/ti-engine/master/packages/core/docs/ti-engine-icon.ico)

Flexible framework for the creation of microservices with node.js.

## Information

This is a customizable web framework based on the **ti-engine** framework. Currently under development.

## Environment variables

The web server configuration (host, port, TLS, cookies, etc.) is normally provided via the service configuration file merged in the `TiWebServer` constructor. The following environment variables can override individual values at runtime — useful for container/12-factor deployments where the same image is configured per environment:

* `TI_WEB_HOST` overrides the bind address (e.g. `0.0.0.0` in a container). Defaults to the value in the web server config.
* `TI_WEB_PORT` overrides the listen port.
* `TI_WEB_USE_TLS` (`true`/`false`) toggles in-app TLS. Set `false` when a reverse proxy / ingress terminates TLS.
* `TI_WEB_TLS_CERT_PATH` / `TI_WEB_TLS_KEY_PATH` override the TLS certificate/key paths (only used when TLS is enabled).
* `TI_WEB_COOKIE_SECRET` sets the session cookie signing secret. Set a stable, private value for durable sessions and multi-replica deployments (otherwise a random per-process value is used).
* `TI_WEB_TLS_CERT_PATH` is also read by the container liveness probe (below), which verifies against that certificate.
* `TI_WEB_SESSION_IDLE_TIMEOUT` (whole minutes) sets how long a signed-in session survives **without activity**, overriding `cookies.maxAge`. The window is rolling: every response re-stamps the cookie, so a session ends only after that long with no request at all. Note that a user typing into a form makes no requests, so set this comfortably longer than the longest form a user fills in one sitting. Defaults to 480 (eight hours).
* `TI_WEB_AUTH_METHODS` (comma-separated) **replaces** the enabled authentication methods (`auth.enabledMethods`), e.g. `openid-google` or `local,openid-google`.
* `TI_WEB_AUTH_LOCAL_USERS_PATH` overrides the local user directory's file path (`auth.local.usersPath`), which backs `local` sign-in. An explicitly empty value means *no directory*, so every local sign-in is refused. See [Local (username/password) authentication](#local-usernamepassword-authentication).
* `TI_WEB_AUTH_ADMINS` (comma-separated) **replaces** the admin allowlist (`auth.admins`). Entries are matched against the session user's user ID, username or email, so an OpenID deployment lists emails. An explicitly empty value means *no admins*.
* `TI_WEB_TRUSTED_ORIGINS` (comma-separated) **replaces** the trusted request origins (`trustedOrigins`) — needed behind proxies that do not present the real external origin.
* `TI_WEB_STATIC_MAX_AGE` (whole seconds) overrides `staticCache.maxAge`. See [Static asset caching](#static-asset-caching).
* `TI_WEB_STATIC_IMMUTABLE` (`true`/`false`) overrides `staticCache.immutable`.
* `TI_WEB_STATIC_IMMUTABLE_PATHS` (comma-separated) **replaces** `staticCache.immutablePaths`. An explicitly empty value means *no long-lived paths*.

OpenID Connect providers are configured with their own variables — `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET` / `TI_AZURE_AUTH_CALLBACK_URL` / `TI_AZURE_AUTH_DISCOVERY_URL`, and the `TI_GCLOUD_AUTH_*` equivalents. A callback URL may be given either as the full absolute URL registered with the provider (`https://your-host/login/azure-callback`) or as a path (`/login/azure-callback`): the server always listens on the path, while the `redirect_uri` sent to the provider is the absolute value verbatim if one was configured, and otherwise assembled from the request's forwarded protocol/host.

## Authentication and authorization

`TiWebServer#augmentSession` is the hook through which an application derives its own session roles — from an identity store, the org chart, or wherever a deployment keeps that mapping — once per login, before the framework's own additive `admin` role (`auth.admins`, see [Environment variables](#environment-variables)) is applied on top; the default is a no-op that returns the session unchanged. Throwing from the hook refuses the sign-in rather than admitting a session the application could not map to a principal: the framework destroys the freshly regenerated session so nothing usable survives the refusal, the login handler responds `401`, and the error handler sends the browser back to the login page with the exception code in the `?error=` query parameter — the same path a failed OpenID callback takes, regardless of which auth method was used.

## Local (username/password) authentication

`local` is one of the configurable `auth.enabledMethods` sign-in methods (see [Environment variables](#environment-variables), `TI_WEB_AUTH_METHODS`). It is backed by a JSON file of user records — there is no built-in account of any kind.

### The users file

`auth.local.usersPath` (override: `TI_WEB_AUTH_LOCAL_USERS_PATH`) points at a JSON file holding an array of records:

```json
[
  {
    "username": "jdoe",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "passwordHash": "scrypt$16384$8$1$<salt-base64>$<hash-base64>"
  }
]
```

* `username`, `email`, `name` and `passwordHash` are required. `email` is required because a consuming application resolves the signed-in identity by it, the same way it would for an OpenID identity — a record with no email cannot reach an application at all.
* `userID` is optional. When omitted, one is derived from the username, so it stays stable across restarts and logins; supply it explicitly only when something else needs to match a specific value (e.g. `auth.admins`).
* `disabled: true` keeps the record (and its username) in the file while refusing every sign-in for it.

Generate `passwordHash` with the bundled CLI. It reads the password from **stdin**, never an argument, so it never lands in shell history or a process listing (`ps`), and it never echoes the password back:

```bash
npm run hash-password -w @ti-engine/web-framework
```

Type or pipe the password, then EOF; only the resulting hash is written to stdout.

That `npm run` form only works inside this monorepo (it is a workspace script). A consumer of the published `@ti-engine/web-framework` package has no `bin` entry to run it by name — the script ships under `bin/build/` regardless, so invoke it by its path inside `node_modules` instead:

```bash
node ./node_modules/@ti-engine/web-framework/bin/build/hash-password.js
```

### The file is the source of truth

On every boot, the file is read and reconciled into the running directory: an added record starts working, a changed `passwordHash` takes effect, and — this is the point — **a record removed from the file is removed from the directory**, revoking that user's access on the next restart. Editing the file and restarting is the whole revocation mechanism; there is no separate delete action.

### Every failure refuses rather than admits

`local` enabled with no `auth.local.usersPath` configured, a file that cannot be read, a file that is not valid JSON, or a file that yields zero valid records after validation — each of these logs a startup **WARNING** and refuses every local sign-in, rather than admitting one or falling back to a default. A failed *read* deliberately does not reconcile, so a temporarily broken volume mount leaves previously stored records untouched instead of wiping them; those records stay inert (unused) while the load keeps failing, because sign-ins are refused anyway.

**There is no rate limiting, no lockout after repeated failures, and no password policy.** Treat `local` on an internet-facing deployment as a deliberate risk until those exist.

## Static asset caching

Everything under `/static` is served with a `Cache-Control` policy configured by the `staticCache` block:

```json
{
  "staticCache": {
    "maxAge": 0,
    "immutable": false,
    "immutablePaths": [ "/fonts/" ]
  }
}
```

* `maxAge` — the `max-age` in **whole seconds** (not an express-style `"1y"` duration string; one is rejected with a warning rather than reinterpreted as milliseconds). `0`, the default, emits `public, max-age=0, must-revalidate`.
* `immutable` — adds the `immutable` directive. Defaults to `false`, and is **ignored with a warning when `maxAge` is 0**, since a response that is stale on arrival cannot also promise never to change.
* `immutablePaths` — path prefixes under `/static` (matched case-sensitively, on a path-segment boundary) served `public, max-age=31536000, immutable` regardless of the two settings above. Defaults to `[ "/fonts/" ]`. This **replaces** rather than merges, so `[]` means no long-lived paths.

**The default revalidates, and that is deliberate.** `immutable` tells a browser the bytes behind a URL will never change, and browsers honour it so completely that not even a manual reload revalidates. On a stable filename — which is what the framework's own assets use (`/static/scripts/ti-framework.js`, the theme sheets) — the promise is false, and a deployed CSS or JS fix simply never reaches anyone who has already visited, for up to a year, with no way to tell them otherwise. Revalidating costs a conditional request per asset, answered with a `304` from the `ETag`/`Last-Modified` that `express.static` still attaches — headers, no body.

**Opt back into `immutable` once your filenames are content-addressed.** If your build emits `app.a1b2c3.css`, or your application appends a content hash to each asset URL, the promise becomes true and there is real value in making it:

```json
{
  "staticCache": { "maxAge": 31536000, "immutable": true }
}
```

Fonts are the default exception because a released `.woff2` is an artifact rather than something edited in place, and its filename already carries the family, weight and style. If that is not how a given deployment manages its fonts, clear the list.

## Configure HTTPS for development

Use the `mkcert` tool to create a certificate for development.

Step 1: Install the tool:
```text
choco install mkcert
```
Step 2: Install certificate authority:
```text
mkcert -install
```
Step 3: Generate certificate files for localhost:
```text
mkcert localhost 127.0.0.1 ::1
```

## License

Apache-2.0 © Boris Kostadinov. See [LICENSE](LICENSE).

## Container liveness probe

`bin/healthcheck.js` asks a running server whether it is still serving and exits 0 only if it says yes. Point a
Dockerfile `HEALTHCHECK` at it:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "/app/node_modules/@ti-engine/web-framework/bin/healthcheck.js"]
```

It reads `TI_WEB_USE_TLS` through the same `tools.toBool` the server uses, so the probe's transport cannot drift
from the server's, and calls `/health` — the unprotected route `webHandlers.healthHandler` serves. Writing this
inline in a Dockerfile is the mistake it exists to prevent: an `http://` URL hardcoded there reports a TLS-enabled
container unhealthy forever, and Docker restarts a server that is answering correctly.

With TLS on it verifies the certificate rather than skipping verification, anchoring trust to the server's own
certificate at `TI_WEB_TLS_CERT_PATH` and taking the name to check from that certificate — so a certificate issued
for a public hostname still passes while the probe connects to `127.0.0.1`. Set that variable when you terminate
TLS inside the container. Without it there is nothing to anchor to and the probe falls back to establishing that
the port accepts connections, which is weaker but neither disables verification nor restarts a healthy container.
