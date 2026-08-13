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
* `TI_WEB_AUTH_METHODS` (comma-separated) **replaces** the enabled authentication methods (`auth.enabledMethods`), e.g. `openid-google` or `local,openid-google`.
* `TI_WEB_AUTH_ADMINS` (comma-separated) **replaces** the admin allowlist (`auth.admins`). Entries are matched against the session user's user ID, username or email, so an OpenID deployment lists emails. An explicitly empty value means *no admins*.
* `TI_WEB_TRUSTED_ORIGINS` (comma-separated) **replaces** the trusted request origins (`trustedOrigins`) — needed behind proxies that do not present the real external origin.
* `TI_WEB_STATIC_MAX_AGE` (whole seconds) overrides `staticCache.maxAge`. See [Static asset caching](#static-asset-caching).
* `TI_WEB_STATIC_IMMUTABLE` (`true`/`false`) overrides `staticCache.immutable`.
* `TI_WEB_STATIC_IMMUTABLE_PATHS` (comma-separated) **replaces** `staticCache.immutablePaths`. An explicitly empty value means *no long-lived paths*.

OpenID Connect providers are configured with their own variables — `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET` / `TI_AZURE_AUTH_CALLBACK_URL` / `TI_AZURE_AUTH_DISCOVERY_URL`, and the `TI_GCLOUD_AUTH_*` equivalents. A callback URL may be given either as the full absolute URL registered with the provider (`https://your-host/login/azure-callback`) or as a path (`/login/azure-callback`): the server always listens on the path, while the `redirect_uri` sent to the provider is the absolute value verbatim if one was configured, and otherwise assembled from the request's forwarded protocol/host.

## Authentication and authorization

`TiWebServer#augmentSession` is the hook through which an application derives its own session roles — from an identity store, the org chart, or wherever a deployment keeps that mapping — once per login, before the framework's own additive `admin` role (`auth.admins`, see [Environment variables](#environment-variables)) is applied on top; the default is a no-op that returns the session unchanged. Throwing from the hook refuses the sign-in rather than admitting a session the application could not map to a principal: the framework destroys the freshly regenerated session so nothing usable survives the refusal, the login handler responds `401`, and the error handler sends the browser back to the login page with the exception code in the `?error=` query parameter — the same path a failed OpenID callback takes, regardless of which auth method was used.

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