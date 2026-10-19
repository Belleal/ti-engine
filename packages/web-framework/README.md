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
* `TI_WEB_SERVER_TIMING` (`true`/`false`) overrides `serverTiming`: whether every response says, in a `Server-Timing` header, where its time went in the process. Off by default. See [Timing a response](#timing-a-response).
* `TI_WEB_LANGUAGES` (comma-separated) **replaces** `languages`: the interface languages a visitor may choose between on the sign-in screen. See [Choosing the language on the sign-in screen](#choosing-the-language-on-the-sign-in-screen).
* `TI_WEB_PUBLIC_URL` overrides `publicUrl`, the deployment's public base URL, which every link in a notice starts from. See [E-mail notices](#e-mail-notices).
* `TI_WEB_NOTIFY_TRANSPORT` (`off`/`log`/`cloudflare`), `TI_WEB_NOTIFY_SENDER`, `TI_WEB_NOTIFY_SENDER_NAME`, `TI_WEB_NOTIFY_REPLY_TO` and `TI_WEB_NOTIFY_RELAY_URL` override the `notifications` settings: how notices are sent, and from whom. Off by default.
* `TI_WEB_JOBS_TRIGGER` (`internal`/`route`/`off`) and `TI_WEB_JOBS_BEHIND_WORKER` (`true`/`false`) override the `jobs` settings: what runs the scheduled jobs. See [Scheduled jobs](#scheduled-jobs).

OpenID Connect providers are configured with their own variables — `TI_AZURE_AUTH_CLIENT_ID` / `TI_AZURE_AUTH_CLIENT_SECRET` / `TI_AZURE_AUTH_CALLBACK_URL` / `TI_AZURE_AUTH_DISCOVERY_URL` / `TI_AZURE_AUTH_ALLOWED_DOMAINS`, and the `TI_GCLOUD_AUTH_*` equivalents. `…_ALLOWED_DOMAINS` (comma-separated) **replaces** the provider's `allowedDomains`: see [Which domains may sign in through which provider](#which-domains-may-sign-in-through-which-provider). A callback URL may be given either as the full absolute URL registered with the provider (`https://your-host/login/azure-callback`) or as a path (`/login/azure-callback`): the server always listens on the path, while the `redirect_uri` sent to the provider is the absolute value verbatim if one was configured, and otherwise assembled from the request's forwarded protocol/host.

## Authentication and authorization

`TiWebServer#augmentSession` is the hook through which an application derives its own session roles — from an identity store, the org chart, or wherever a deployment keeps that mapping — once per login, before the framework's own additive `admin` role (`auth.admins`, see [Environment variables](#environment-variables)) is applied on top; the default is a no-op that returns the session unchanged. Throwing from the hook refuses the sign-in rather than admitting a session the application could not map to a principal: the framework destroys the freshly regenerated session so nothing usable survives the refusal, the login handler responds `401`, and the error handler sends the browser back to the login page with the exception code in the `?error=` query parameter — the same path a failed OpenID callback takes, regardless of which auth method was used.

`TiWebServer#withholdsAdminRole( session, request )` lets an application run a session **without** the `admin` role its identity would hold, for example to show an administrator the application as everyone else sees it (1.50.0). The framework asks it at sign-in, on the session `augmentSession` returned, and again on every request; returning `true` removes the role, and returning `false` restores it on the next request. It can only withhold: the allowlist stays the only thing that grants the role, only a strict `true` counts, and a hook that throws withholds nothing. The default returns `false`.

### The identity an OpenID sign-in puts on the session

A sign-in is resolved from the validated ID token claims and the `userinfo` response **together**, not from `userinfo` alone. Within a single claim `userinfo` wins — it is the fresher of the two, and `openid-client` has already verified that both describe the same subject — and the ID token fills the gaps.

| Session field | Resolved from, in order                                                          |
|---------------|----------------------------------------------------------------------------------|
| `userID`      | `oauth2:` + the subject (`sub`)                                                  |
| `username`    | `preferred_username`, then `upn`, then the e-mail, then `name`, then `sub:<sub>` |
| `email`       | the `email` claim from either source — and nothing else                          |
| `name`        | the `name` claim from either source                                              |

Both sources are needed because of what the Microsoft identity platform returns. Its `userinfo` endpoint answers with `sub`, `name`, `family_name`, `given_name`, `picture` and — only when the optional claim is configured — an `email` taken from the directory's `mail` attribute. It never returns `preferred_username`: on Entra that claim lives in the ID token, and it holds the UPN. The UPN is the address an operator actually knows and lists in `auth.admins`, so reading `userinfo` alone dropped the one identifier such a deployment is configured around, and an allowlisted administrator had nothing on their session for `isAdminIdentity` to match.

`username` is the one field choosing between two *different* claims, and there the claim outranks the source: `preferred_username` beats `upn` whichever response carried it. `preferred_username` is the standard OIDC claim for a human-readable identifier and `upn` a Microsoft extension, and "fresher" earns nothing between two stable identifiers that do not differ across the two responses. No ordering can rescue a deployment whose allowlist names the claim that lost, since only one string can be the `username` — what covers that is the allowlist matching user ID, username **or** e-mail, and a consumer naming all three when it refuses a sign-in.

Each resolved value also carries its provenance (`claims.preferred_username`, `userinfo.email`, …), so a deployment can report how its provider was understood without writing anybody's identifiers to a log — which matters because `auditing.logMinLevel` ships at `0` with console logging on.

The UPN is offered as the `username`, **never** as the `email`. It is e-mail-shaped and usually routable, but it is a sign-in name rather than a mailbox, and `email` is what a consuming application resolves its own directory by — widening that would change which principal an identity maps to. The admin allowlist matches user ID, username **or** e-mail, so listing a UPN there works either way.

An address the provider reports as unverified (`email_verified: false`, in **either** source) is refused. An absent claim is not a rejection: Google emits the claim, Entra does not emit it at all, and treating "absent" as "unverified" would refuse every sign-in on an Azure deployment.

### Which domains may sign in through which provider

Each OpenID provider takes a list of the e-mail domains it may admit — `auth.oauth2.azure.allowedDomains` and `auth.oauth2.google.allowedDomains`, or `TI_AZURE_AUTH_ALLOWED_DOMAINS` / `TI_GCLOUD_AUTH_ALLOWED_DOMAINS` (comma-separated), which replace them. An empty list, the default, admits any domain.

```jsonc
"oauth2": {
  "azure":  { "allowedDomains": [ "example.org" ] },   // the organization's own tenant
  "google": { "allowedDomains": [ "gmail.com" ] }      // a fallback sign-in for personal accounts only
}
```

This is what makes two providers safe to enable together. An application maps a signed-in identity to its own principal by e-mail, and the admin allowlist matches user ID, username or e-mail — so without a list, the weaker provider can claim an identity the stronger one owns. Anybody can register a consumer Google account under an organization's address, and Google reports it as verified once the mailbox has confirmed a code; the sign-in then arrives carrying the organization's address. With Entra bound to `example.org` and Google to `gmail.com`, an `@example.org` address can arrive only through the organization's tenant.

The rules:

* **Every e-mail-shaped identifier is checked** — the e-mail, and the username whenever it holds an `@` (an Entra UPN, or a display name the account holder chose). All of them must be in a listed domain.
* **An identity carrying no address is refused** once a list is set: a domain that cannot be established is not on the list.
* **Domains are compared exactly**, without regard to case. A subdomain is a different domain and is listed in its own right; an Entra guest, whose UPN ends in the tenant's `onmicrosoft.com` domain, is refused unless that domain is listed. A leading `@` in an entry is ignored.
* **A malformed entry narrows access, never widens it**: it is kept, and simply matches no address.

A refused sign-in is logged at `WARNING` with the subject and the domain it carried — never the address — and the start-up notice for each provider names the list in effect after the environment has been applied.

### The language a session starts in

A new session takes, in order:
1. the language the visitor chose on the sign-in screen, when the deployment offers it;
2. the user's own language;
3. the service configuration's `language`, when one is set;
4. the deployment's: `TI_LOCALIZATION_LANGUAGE` as core resolved it (`localization.getSystemLanguage()`).

The shipped configuration sets no `language`. It used to set `"en"`, and since no identity provider puts a language
on the user, a deployment configured for another language turned English at sign-in while its login page did not.

### Choosing the language on the sign-in screen

List the languages a visitor may choose between in `languages` (or `TI_WEB_LANGUAGES`), as core's two-letter codes:
`"languages": [ "en", "bg" ]`. A code core does not know is left out, with a warning at start. With two or more, the
sign-in card gains a footer row of links, `EN` / `BG`. List only languages the application's labels carry: the codes
are checked against core's, not against the catalogue, so a code core knows and the catalogue lacks is offered, and
every label then reads core's not-found placeholder.
- **Each link** is `GET /language/<code>`. It keeps the choice in a `ti-language` cookie for a year (`HttpOnly`,
  `SameSite=Lax`, `Secure` on HTTPS) and redirects home, so the page is rendered again in the language chosen.
- **A signed-in session** that follows such a link switches at once, so an application may link to it from inside.
- **Configuring nothing** offers only the deployment's language: the switch is not drawn and the cookie is ignored.

The language a request is answered in is the signed-in session's, else the visitor's choice, else the configured one,
else the deployment's. `resolveRequestLanguage( request, instance )` in `web-handlers` decides it, and the rest follows
from it:
- `/app/config` points at the label catalogue in that language, so the sign-in screen itself switches.
- `transformHtml` receives it as `options.language`, and the offered list as `options.languages`.
- `{ti-language-placeholder}` is filled with it. The framework's `index.html` writes `<html lang>` with it.
- `{ti-language-switch-placeholder}` becomes the switch, or nothing with fewer than two languages.
- **A fragment's `path` may contain `{language}`:** `fragments/guide/{language}/frame-help.html` is served from the
  request's language. A language with no file falls back to the deployment's, then to English, with one warning per
  fragment and language.
- **Immutable fragments are addressed once per language.** The URL changes with the language, so a browser keeps one
  copy per language and never serves one for the other.

The switch is plain links drawn by the server, so it needs no script. Each link shows its code, and is named for
assistive technology by the language's name for itself (`interface.language-name` read in that language, else a
built-in table: "English", "Български"). The current one carries `aria-current`. Its look is `.ti-login-card-foot`,
`.ti-login-languages` and `.ti-login-language`; restyle those to fit an application. As with every framework string,
the labels (`interface.language-name`, `interface.default.login.language-switch`) resolve only in an application that
carries them in its own catalogue.

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

## The login screen

The login screen renders before sign-in, so none of an application's own fragments are in play. It has three slots an application fills by shipping a file of the same relative path in its own static directory; the static-path search is reverse-order, so the application's copy wins:

| Slot | Where | Framework default |
|---|---|---|
| `fragments/components/component-login-brand.html` | above the sign-in card | the framework's mark, "Welcome back" and "Sign in to continue" |
| `fragments/components/component-login-card-head.html` | inside the sign-in card, before its controls | empty |
| `fragments/components/component-login-extra.html` | below the sign-in card | empty |

Use the brand slot to name the application and say what it is for. Use the heading slot to title the card, and say which account to sign in with. Use the extra slot for anything a first-time visitor should read after the sign-in controls. No slot can change the sign-in controls themselves; those stay the framework's, gated to the enabled methods. The Microsoft button carries Microsoft's four-square logo and reads "Sign in with Microsoft", as Microsoft's branding guidelines ask; the method is still `openid-azure`.

Every string on the screen goes through `x-text-label` under `interface.default.login.*`: `welcome`, `sign-in-prompt`, `username`, `username-placeholder`, `password`, `password-placeholder`, `sign-in`, `or-continue-with`, `sign-in-google`, `sign-in-azure`, `no-sign-in-method` and `error-sign-in-failed`. An application normally points `TI_LOCALIZATION_LABELS_PATH` at its own catalogue alone, so the framework's translations never reach it. It adds the keys it wants translated to its own catalogue, and a key it leaves out renders the English text written in the fragment.

## The busy indicator

While a request the user is waiting on has been outstanding for 400 ms, the shell says so: every element shows the
`progress` cursor, and an hourglass in the topbar fades in and turns over until the last outstanding request settles.
Both `sendRequest` calls and HTMX requests count, so a screen and the data it asks for read as one wait. A request that
answers inside the delay shows nothing. The indicator exists for the slow first request to a server that has to wake
first, such as a container scaled to zero.

The state is `$store.tiApplication.busy`, mirrored as `ti-busy` on `<html>`, so a stylesheet can key anything else off
it. The hourglass is a component:

| Slot | Where | Framework default |
|---|---|---|
| `fragments/components/component-busy-indicator.html` | wherever its placeholder is; the framework's topbar carries one | the hourglass, and a `role="status"` region that says "Working…" to a screen reader |

**An application that ships its own `component-topbar.html` places the placeholder itself**, as a
`<ti-component-busy-indicator-placeholder></ti-component-busy-indicator-placeholder>` element where it wants the
hourglass. Without one the cursor still changes, and nothing else shows. Never write that tag inside an HTML comment
ahead of the real one: placeholders are found by a text search, and the first occurrence is the one replaced.

The status line is `interface.busy-indicator.status`. As with the login screen, an application that does not carry the
key in its own catalogue gets the English written in the fragment. Under `prefers-reduced-motion` the hourglass appears
but does not turn.

## Only the newest screen lands

HTMX keeps no order between requests made by different elements, so the shell keeps it for `#ti-content` (1.50.1):

- **A request aimed at `#ti-content` aborts every other GET still on its way there** before it is sent. That covers the
  requests aimed at it, and those made from inside it wherever they land, which belong to the content it replaces. Of
  two sidebar entries clicked in a row, the second wins, however slowly the first answers.
- **`openScreen` does the same before it pushes its URL.** A screen opened before the landing Dashboard has arrived is
  not overwritten by the Dashboard's answer or by the URL that answer pushes. A second `openScreen` no longer waits
  behind the first.
- **Only the newest screen's failure leaves for the start page.** HTMX rejects the promise of a request it aborted as
  it does one that failed, so `openScreen` goes to `/` only while its request is still the newest aimed at
  `#ti-content`. A screen replaced by a newer one has not failed.
- **A POST is left to finish**, and so is a GET that is neither aimed at `#ti-content` nor made from inside it.

A screen can therefore read its URL as it starts, which `openScreen` pushes before the swap for that reason, and get
its own.

## On a narrow screen

Below 900px the shell is one column, and the sidebar is a drawer. A menu button at the start of the topbar slides it
in over the screen, and a scrim covers the rest of the page. It closes on Escape, on the scrim, and when any screen is
requested: the sidebar's own entries load into `#ti-content` through HTMX, and `openScreen` closes it too.

- **While it is shut,** its entries are out of the tab order and the accessibility tree.
- **While it is open,** the topbar and the screen under it are `inert` (`#ti-content-wrapper`, or `#ti-content` in a
  frame without that wrapper), so the keyboard and a screen reader stay in the drawer. The focus moves into it: to
  the active entry, or else the first.
- **When it closes with the focus inside it,** on Escape, on the scrim or on a screen chosen from it, the focus goes
  to the menu button.
- **The collapsed state belongs to the column.** A visitor who collapsed the sidebar on a wide screen gets the full
  drawer on a narrow one, and the collapsed column back on the wide one.
- **Height:** the shell takes `100dvh` there, so a phone's toolbar does not hide the bottom of the screen.
- **The topbar keeps its buttons on the page:** its subtitle is hidden there, and its title takes an ellipsis when
  it still runs out of room.

The state is `$store.tiApplication.navigationDrawer` (whether there is a drawer at all) and `navigationOpen`. The
second is mirrored as `ti-navigation-open` on `<html>`, which is what the stylesheet draws from, so the drawer works
whatever the application's shell frame binds. The button is a component:

| Slot | Where | Framework default |
|---|---|---|
| `fragments/components/component-navigation-toggle.html` | wherever its placeholder is; the framework's topbar carries one, first | the menu button, which reports `aria-expanded`, and the scrim, teleported to `<body>` |

**An application that ships its own `component-topbar.html` places the placeholder itself,** as a
`<ti-component-navigation-toggle-placeholder></ti-component-navigation-toggle-placeholder>` element first in it.

**Without one, nothing changes:** the stylesheet turns a sidebar into a drawer only in a page that holds the button
(`:has()`). Such an application keeps its sidebar in the column on a phone, cramped but reachable, rather than hidden
with nothing to open it. The same rule as for the busy indicator applies: never write that tag inside an HTML comment
ahead of the real one.

The button's name is `interface.navigation-toggle.label` ("Menu"). The 900px is written in two places, the
stylesheet's `@media` block and `NAVIGATION_DRAWER_QUERY` in `ti-framework.js`, and
`test/ti-framework.navigation-drawer.test.js` holds them together.

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

**Since 1.39.0 the framework content-addresses its own references.** Every `src` or `href` pointing at `/static/…` in a fragment the framework serves — the shell included — is written with `?v=<content hash>` of the file that would be served for it (an application's override, where one exists). A request whose `v` matches the file's current bytes is answered `public, max-age=31536000, immutable` whatever `staticCache` says; a bare URL, or one with a stale hash, gets the policy above. A reference the application writes into its own fragments is fingerprinted the same way; one built at run time in JavaScript is not, and keeps revalidating.

## What the browser downloads

Since 1.39.0:

* **Responses are compressed** (brotli, else gzip), except a view that embeds a CSRF token.
* **The label catalogue is not in `/app/config`.** The configuration carries `labelsBundle: { hash, url }`, and `GET /app/labels/<hash>` serves the catalogue `immutable` — the browser downloads it once per release and language. Override `getClientLabels( language )` in your `TiWebAppManager` to leave out what the browser never reads; the result must not change for the life of the process, since it is hashed once.
* **Screen fragments requested by HTMX revalidate** (`private, no-cache`), so a repeat visit to a screen is a `304`. Full pages stay `no-store`.
* **`/static` is served before the session middleware**, so an asset never reads or writes a session.

## The bundled browser libraries

htmx and Alpine's CSP build ship inside the package as `bin/static/scripts/lib/htmx.min.js` and
`bin/static/scripts/lib/alpinejs-csp.min.js`, so a consumer serves them from its own origin, under its own
Content-Security-Policy. They are committed files:

* **`npm install` regenerates them.** The postinstall, `bin/build/post-install.js`, copies them from `htmx.org` and
  `@alpinejs/csp` in `node_modules`.
* **`htmx.org` and `@alpinejs/csp` are pinned exactly**, so the version installed, bundled and declared is one
  version.
* **To move a library:** change its pin, run `npm install`, and commit `bin/static/scripts/lib/` with the pin. A
  change made without an install (an editor on GitHub, a bot's pull request) leaves the old copy in place.
* **CI and the publish workflow check this.** Each fails when its own install changes the committed copies, and so
  does `test/bundled-libraries.test.js`. The publish job packs what is committed, with no install, so this check is
  what keeps a stale copy from shipping. Releases 1.39.0 to 1.46.0 shipped htmx 2.0.10 and Alpine 3.17.3 while
  declaring `^2.0.11` and `^3.17.4`.

## Shared components

Since 1.51.0, `ti-framework.css` ends with the components an application builds its screens from: tones
(`.tone-accent` … `.tone-grade-n`, which set `--tone` and `--tone-soft`), stacks (`.ti-stack-0` … `.ti-stack-4`), the
meter (`.ti-meter`, its width from `--value`), the stat, card rows, steps, the legend, the dot, tag and status-pill
variants, the segmented control, the filter chip (`.ti-chip`), text-style danger buttons, the row drawer
(`.ti-drawer`), the banner, `kbd`, the sticky action bar and a compact empty state. They read only the framework's
tokens, and `--font-sans`, `--font-mono` and `--font-display` are theirs for an application to set. They are the last
section of the file, after the `.ti-btn`, `.ti-tag`, `.ti-status-pill` and `.ti-empty-state` rules they extend;
`test/shared-components.test.js` holds that order, the tokens and the absence of any application's name.

## Screens that never change

A screen fragment is served at an address that names the screen, not a version of it, so by default it revalidates:
a repeat visit costs a request answered `304`. That saves the bytes, but not the round trip. On a hosted deployment
the round trip is the whole cost: a user guide chapter took 4–7 ms in the process and 0.6–0.9 s in the browser.

A fragment whose markup is the same for every viewer until the next deployment can be declared `immutable` (since
1.41.0):

```js
this.addFragment( "help-overview", { title: "User Guide", path: "fragments/frame-help-overview.html", immutable: true } );
```

How it behaves:

* **Every reference carries an address.** Every `hx-get="/app/help-overview"` in every fragment the framework serves,
  the shell included, is written `hx-get="/app/help-overview?v=<version>"`. A `hx-push-url="true"` (or
  `hx-replace-url`) on the same element becomes `hx-push-url="/app/help-overview"`, so the address bar shows the
  plain path.
* **A request for the current version is kept for good.** It is answered `private, max-age=31536000, immutable`, and
  a revisit makes no request at all. A stale or missing `v` gets the normal revalidating answer.
* **One version covers every immutable fragment together.** Chapters link to one another, so any change to any of them
  moves every address. A deployment that changes none of them keeps every cached copy.

The declaration is a promise the framework also checks:

* **Each response is compared with the markup its address was computed from.** A fragment whose output depends on the
  request (the nonce placeholder, a CSRF token, anything `transformHtml` adds per request) never matches. It is served
  revalidating, and a warning is logged once.
* **A fragment with `roles` cannot be `immutable`.** `addFragment` throws. The browser keeps the copy, not the session,
  so it would be served to whoever next uses that browser, without a role check.
* **Nothing is addressed while `TI_WEB_APP_STATIC_CACHE_DISABLED=true`**, a development setting. A file edited under a
  running process would change its bytes without changing its address.

Only declare content that anyone signed in may see and that carries nothing about the viewer, such as help,
documentation or a static reference page. A screen whose data arrives by a separate request gains nothing: its `304`
is already cheap in bytes, and its template changes with releases just the same.

## Timing a response

With `serverTiming: true` (or `TI_WEB_SERVER_TIMING=true`), every response carries a `Server-Timing` header (since
1.41.0), which the browser's developer tools show under *Timing*:

```text
Server-Timing: app;dur=4.1;desc="Frankfurt am Main (WEUR, DE)", session;dur=2.4
```

* `app`: from the request reaching the process to its headers being written.
* `session`: how long reading the session took, which is the state-store round trip. It is absent for `/static`, which
  is served before the session.

A header already set, for example by a proxy that adds its own metrics, is appended to. Override
`describeInstance()` in your `TiWebServer` subclass to give `app` a description, such as where a container platform
placed the instance. It is read once, at start, reduced to printable ASCII, and quoted.

It is off by default: response timings are a small disclosure of how the server works, and a deployment chooses to
make it.

## While the instance starts

`TiWebServer#start()` holds every request but `/health` until the instance has finished starting — its whole
`onStart`, an application's own initialization included. The server has to listen before an application's
`super.onStart().then( … )` continues, so without the hold a request was served against state the application had
not built yet: competence's org chart, for one, where the request that woke a sleeping container found no chart and
signed its user out. An application needs no change; whatever its `onStart` chains on is waited for.

* Static content is served before the hold, and `/health` is never held — it is the liveness probe.
* A request held for 30 seconds, or one that arrives after a failed start, is answered `503` with `Retry-After: 5`
  (`E_GEN_SERVICE_STARTING`). A navigation gets that as text rather than the redirect to `/` other errors get.
* `TiWebServer#startup` says where the instance is: `{ state: "starting" | "started" | "failed", settled }`. An
  instance started through `onStart()` directly, as a test might, has no state and is never held.

## E-mail notices

`@ti-engine/web-framework/notifications` sends an application's notices by e-mail, each at most once. The application
says what its notices are and when its events happen; a configuration document says which events send which notice.

```js
const notifications = require( "@ti-engine/web-framework/notifications" ).instance;

notifications
    .registerNotice( "task-new", {
        subject: "notice.task-new.subject",            // label keys, with {placeholders}
        text: "notice.task-new.text",
        link: ( data ) => "/app/tasks/" + data.taskID, // a path, joined to TI_WEB_PUBLIC_URL
        // `label` honours an administrator's edit of the labels it reads; the values fill the placeholders.
        format: ( data, language, label ) => ( { task: label( "task." + data.task ), date: data.date } ),
        placeholders: [ "task", "date" ],              // what the subject and the text may use
        labels: { "task.review": [] }                  // the other labels `format` reads, each editable
    } )
    .registerEvent( "task.created", { attributes: [ "task" ] } )
    .setLayout( {                                      // how the HTML looks: a wordmark, colours, a button, a footer
        name: "Example",
        colors: { brand: "#123456", brandText: "#FFFFFF", accent: "#ABCDEF" },
        action: "notice.action",                       // label keys: "Open Example", "Sent automatically."
        footer: "notice.footer"
    } );

// In the web application manager: the rules, with this application's defaults, editable and drift-tracked.
this.registerConfigDocument( "notifications", notifications.configDocument( {
    enabled: true,
    rules: [ { id: "new-task", event: "task.created", notice: "task-new", when: { task: [ "review" ] } } ]
} ) );

// After the write that created the task has settled, never under a write lock:
await notifications.emit( "task.created", { key: "review:" + taskID + ":" + ownerID, recipient: { id: ownerID, email: owner.email }, data: { task: "review", taskID, date } } );
```

* **Rules.** `{ enabled, rules: [ { id, event, notice, when, enabled } ] }`. `when` maps an attribute to the values that
  pass; an empty or absent `when` passes everything. The validator refuses a rule naming an event or notice that is not
  registered, or an attribute its event does not declare. `enabled: false` on the document stops every rule.
* **Once per key.** `emit` queues each matching rule's notice under `<notice>:<key>`, and `notify( { kind, key,
  recipient, data } )` queues one directly. A key already queued or sent is not queued again, so a write and a nightly
  catch-up raising one notice send it once. Both resolve once the notice is in the outbox, never on delivery.
* **The outbox and the ledger** are values in the state store, under `ti:notify:pending:` and `ti:notify:done:`.
  Ledger entries hold the kind, the recipient's ID, the outcome and the time, never an address or a text, and expire
  after `notifications.retentionDays` (180). `forget( recipientID )` removes a person's entries, for an erasure path.
* **Sending** is one message at a time, after each queued notice, and on a job tick once in each interval of the
  document's `sendEveryHours`: 1, 2, 3, 4, 6, 8, 12 or 24, counted from midnight UTC, every hour when absent
  (`getSendEveryHours()`). A transient failure is retried after 1, 5, 15 and 60 minutes on the dispatcher's own timer
  while the process runs, then given up, and a permanent one is given up at once; the interval bounds how long a
  notice waits when the process has slept through its retry, and holds back nothing. A daily limit pauses sending until the
  next UTC day, a rate limit for a minute. Delivery is at least once: a crash between the provider accepting and the
  ledger entry repeats one notice.
* **Transports.** `off` (the default) queues nothing. `log` sends nothing and logs that it would have. `cloudflare`
  posts to `TI_WEB_NOTIFY_RELAY_URL`, which `@ti-engine/cloudflare` sets to its Worker's relay, and needs
  `TI_WEB_NOTIFY_SENDER`. `setTransport( { name, send } )` takes an application's own: `send( message )` resolves to
  `{ messageId }` or rejects with an error carrying `code` and, optionally, `transient`.
* **No log line carries an address or a rendered text**, and a recipient ID holding `@` is refused, because the ID is
  what the logs name.
* **Rendering.** In the recipient's `language`, else the deployment's. The HTML is laid out by `setLayout`: the
  name as a wordmark on a band, the text in a card, a button to the link with the address under it, and the footer.
  Tables and inline styles, the colour scheme pinned to light, and nothing fetched when it opens: no image, font or
  stylesheet, no tracking pixel. A colour must be `#rgb` or `#rrggbb`. The plain text ends with the button's label and
  the link, and the footer under `-- `. `render( kind, recipient, data, texts )` shows what would be sent, with draft
  texts if given.
* **Edited texts.** The document's optional `texts`, `{ "<label key>": { "<language>": "<text>" } }`, wins over the
  shipped label, and holds only what was edited, so a release that rewords a text reaches a deployment that never
  touched it. `editableTexts()` lists what may be edited, with the placeholders each may use. The validator refuses an
  unknown key or language, an empty text, a line break where the part takes one line, and a placeholder the text does
  not offer. An edit reaches notices already queued, since a notice is rendered when it is sent.
* **Options.** `configDocument( defaults, metadata, { options: schema } )` lets the document hold the application's
  own settings, validated by its schema. `getOptions()` reads them over the defaults, one key at a time.
* **A test send.** `sendTest( kind, recipient, data, texts )` sends one rendered notice through the transport, past the
  outbox and the ledger, so nothing records it and it never stops the real one.
* **Attachments.** A notice may declare `attachments: ( data, language, label ) => [ { filename, type, content } ]`,
  such as a calendar entry (`interview.ics`, `text/calendar; charset=utf-8; method=PUBLISH`), with `content` as text.
  `render` returns them as `attachments: [ { filename, type, disposition: "attachment", content } ]`, the content
  base64 of its UTF-8 bytes, and the message sent carries them. They are built from the notice's data at send time,
  like the texts, so build them from the data alone: a retry renders again, and must attach the same file. At most 10
  files and 3 MiB together, none empty; a name in plain ASCII with no path, quote or line break; a type in RFC 2045
  tokens, with only a space or a tab around a `;`. A
  notice whose files break those rules is given up as `E_NOTICE_ATTACHMENT_INVALID`, not retried. A notice that
  attaches nothing has no `attachments` key at all.

## Scheduled jobs

`@ti-engine/web-framework/jobs` runs application code on a schedule: anything that becomes due with the passing of
time, such as a deadline coming close, which no request would otherwise notice.

```js
require( "@ti-engine/web-framework/jobs" ).instance.registerJob( "deadline-reminders", {
    every: "day",          // or "hour"
    at: "04:00",           // UTC, for a daily job
    run: ( { now } ) => remindOfDeadlines( now )
} );
```

A tick runs each job whose period began since it last ran, one at a time, then the notification dispatcher's pass
when its interval is due (`sendDue( now )`).
A job is recorded as run only once it finished; one that fails is logged, stops no other, and runs again on the next
tick, so a job must be harmless to run twice. `TI_WEB_JOBS_TRIGGER` decides what ticks:

* `internal` (the default): a timer in the process, once the instance has started and every 15 minutes, only when a
  job or a transport is there to run. It never holds the process open, so it suits a server that stays up.
* `route`: `POST /_ti/jobs/run` runs a tick and answers `204` when it has finished. It is outside sign-in, so **the
  server refuses to start with it** unless `TI_WEB_JOBS_BEHIND_WORKER=true` says a Worker refuses the path from the
  internet, as `@ti-engine/cloudflare`'s does. Its `createWorker( { jobs: true } )` posts it on the Worker's cron,
  waking a container that sleeps between requests.
* `off`.

Both triggers assume one instance, as the configuration store's lock does. `runJobTick()` on the server runs a tick
on demand.

## What's new and Feedback

Two screens an application turns on in its manager's constructor; without the call, neither exists.

```js
class MyApplication extends TiWebAppManager {
    constructor() {
        super( "my-application" );
        this.enableWhatsNew( {
            notes: require( "./whats-new.json" ).releases,     // newest first
            baseline: "2.4.0",                                  // the release before the application had What's new
            audiences: { manager: [ 2 ], supervisor: [ 3 ] }    // a name a note may use → the roles it covers
        } );
        this.enableFeedback( { dateLocales: { en: "en-GB" } } );
    }
}
```

* **What's new** (`whats-new`) shows each person, in their language, the notes of every release since the one the
  deployment ran before, then the earlier ones. A note is `{ id, kind, audience, screen?, title, text }`, `kind` one of
  `new`, `improved`, `fixed`, `title` and `text` by language. Its audience is `everyone`, `admin` or a name the
  application maps; its `screen` becomes a link only for someone that screen's roles admit. The notes are checked when
  `enableWhatsNew` runs (`WhatsNew.validateNotes` says why), so a malformed file stops the start. The browser's
  `tiWhatsNew` store holds how many notes are new and unseen and the first one's title, for a dashboard notice or a
  sidebar count to bind to.
* **Feedback**: Send Feedback (`send-feedback`) for everyone signed in, a suggestion, problem, praise or other, up to
  4000 characters, optionally anonymous; a problem carries the screen the person came from, the version, the language
  and the browser. Feedback (`feedback-inbox`, `admin` only) lists every item newest first with a status. Each new item
  raises `feedback.received`, which the `feedback-received` notice sends to every allowlisted administrator whose
  entry is an e-mail address, never the sender, once the application's `notifications` document has a rule for it.
* **Who a person is.** Override `resolveSubject( session )` to return `{ id, name }` from the application's own record;
  the default is the session user's ID and name. The marker and the feedback are kept under that ID, and
  `@ti-engine/web-framework/whats-new` (`markerOf`, `forget`) and `@ti-engine/web-framework/feedback` (`sentBy`,
  `eraseSentBy`) are what a personal-data export and erasure call.
* **Storage.** Every record is a value in the state store (`ti:whats-new:*`, `ti:feedback:item:*`), never a JSON
  document, because D1 cannot delete a document. Nothing needs a partition spec.
* **Texts.** The screens carry their English; an application translates them by holding the keys in its own catalogue
  (`interface.whats-new.*`, `interface.feedback.*`, `interface.send-feedback.*`, `interface.feedback-inbox.*`,
  `interface.notice.feedback-received.*`, `error.feedback.*`). A page title's label may mark its emphasis, `What's *new*`.

## When a request fails

`webHandlers.defaultErrorHandler` answers every error nothing else handled.

* **A server error** (5xx) reaches the client as its exception code, its localized message and its ID. Its data is
  the server's business — for a raised `Error` it holds the stack — and it is logged at `ERROR` instead, with the
  method, the path (never the query string) and that ID, which ties a user's report to the line.
  * **The one exception is a `details` label** (1.42.1). A `data.details` that names a label the session's
    language has text for is kept, because it is written for the user, and the notification shows it under the
    message. Raw text in `details` is withheld like the rest.
* **A `503`** is logged at `WARNING`: the instance starting or shutting down is a condition, not a defect.
* **A client error** (4xx) keeps its data, which is how a form learns what was wrong with it, and is logged at `DEBUG`
  so that nobody can fill the log by sending bad requests.
* **An `Error` carrying a 4xx `status`**, the `http-errors` convention the body parsers follow, is the client's error:
  a malformed JSON body is a `400` (`E_WEB_INVALID_REQUEST_BODY`), an oversized one a `413`, an unsupported encoding a
  `415` — none of it echoing the body back.

## Adding sources to the Content-Security-Policy

The framework sends one Content-Security-Policy, built per response so that it can carry the response's nonce:
- Scripts are admitted by that nonce under `'strict-dynamic'`.
- There is no `frame-src`, so a frame from anywhere but this origin falls back to `default-src 'self'` and is refused.

An embedded third-party widget, such as Cloudflare Turnstile, is exactly such a frame. To admit it, name its host in the
web server configuration:

```json
"contentSecurityPolicy": {
  "additionalSources": {
    "frameSrc": [ "https://challenges.cloudflare.com" ]
  }
}
```

**Which directives can be extended.** Only `frameSrc`, `connectSrc`, `imgSrc`, `mediaSrc` and `fontSrc` can be
extended:
- A directive the base policy declares keeps its sources and gains the new ones.
- One it does not declare starts from `'self'`, which is what `default-src` gave it.
- `scriptSrc` cannot be extended. Under `'strict-dynamic'` a browser ignores host sources there, so a host would read
  as permission and grant none. Give the script tag the response's nonce instead.

**What a source can be.** Only an `https://` host can be added, optionally with a leading `*.`, a port or a path.
Anything else is dropped when the server starts, each one logged at ERROR, so a typo cannot quietly widen the policy.
That covers:
- a keyword such as `'unsafe-inline'`;
- `*`;
- a scheme source such as `https:` or `data:`;
- a plain `http://` host;
- a value containing a quote, a comma, whitespace or a `;`.

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
