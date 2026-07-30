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

OpenID Connect providers are configured with their own variables — `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET` / `TI_AZURE_AUTH_CALLBACK_URL` / `TI_AZURE_AUTH_DISCOVERY_URL`, and the `TI_GCLOUD_AUTH_*` equivalents. A callback URL may be given either as the full absolute URL registered with the provider (`https://your-host/login/azure-callback`) or as a path (`/login/azure-callback`): the server always listens on the path, while the `redirect_uri` sent to the provider is the absolute value verbatim if one was configured, and otherwise assembled from the request's forwarded protocol/host.

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