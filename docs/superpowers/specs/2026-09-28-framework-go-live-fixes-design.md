# Design — Framework fixes for competence's go-live

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Packages** | `packages/core`, `packages/web-framework`; `Belleal/competence` adopts them separately |
| **Status** | Implemented — see §6 |
| **Version targets** | core `1.17.0` → `1.18.0`; web-framework `1.41.0` → `1.42.0` (both minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-197`](https://belleal.youtrack.cloud/issue/CA-197), [`CA-198`](https://belleal.youtrack.cloud/issue/CA-198), [`CA-187`](https://belleal.youtrack.cloud/issue/CA-187), [`CA-215`](https://belleal.youtrack.cloud/issue/CA-215), [`CA-192`](https://belleal.youtrack.cloud/issue/CA-192), under the go-live umbrella [`CA-286`](https://belleal.youtrack.cloud/issue/CA-286) |
| **Source** | competence's pre-launch review, YouTrack article [`CA-A-14`](https://belleal.youtrack.cloud/articles/CA-A-14) |

---

## 1. What prompted it

A pre-launch review of competence produced 147 verified findings and 13 items that block its go-live. Five of those
items trace to the framework, and two more of them have a framework half. They are fixed here so that the
application can adopt them by a range bump:

| Card | Item | The framework's part |
|---|---|---|
| CA-197 | Anybody can register a Google account under the organization's address and sign in as that employee | Bind each OpenID provider to the e-mail domains it may admit |
| CA-198 | The Bulgarian deployment turns English after sign-in; every error reads `!!! label not found !!!` | Start a session in the deployment's language; ship Bulgarian exception messages |
| CA-187 | The request that wakes the container signs its user out | Serve nothing until the instance has finished starting |
| CA-215 | Server errors are never logged; stack traces reach the client; the crash reason is lost | Log 5xx at ERROR under a reference; send the client no internals; serialize `TiException` |
| CA-192 | Two admins saving one configuration at once both succeed; one edit is lost | Serialize a document's saves |

Every one of them was reproduced before it was fixed, and each reproduction is now the regression test (§5).

## 2. Decisions

### 2.1 Allowed domains per provider (CA-197)

`auth.oauth2.<provider>.allowedDomains`, replaced by `TI_AZURE_AUTH_ALLOWED_DOMAINS` / `TI_GCLOUD_AUTH_ALLOWED_DOMAINS`.
The check is the pure `AuthManager.isIdentityDomainAllowed( identity, allowedDomains )`. It is enforced in
`#authorizeOpenID` after the `email_verified` check, and a refusal is `E_SEC_UNAUTHORIZED_ACCESS` (401).

- **Every e-mail-shaped identifier is checked.** That is the e-mail, and the username whenever it holds an `@`. An
  Entra UPN carries the domain when the directory supplies no e-mail. The username can also fall back to a display
  name the account holder chooses. The admin allowlist matches the username too, so checking the e-mail alone would
  have let a display name spelled like an allowlisted address through.
- **An identity with no address is refused** once a list is set. A domain that cannot be established is not on it.
- **Exact matching, case aside.** Suffix matching was rejected, because `evilgmail.com` ends in `gmail.com`. Implicit
  subdomains were rejected too: a subdomain is a different administrative domain, and has to be listed in its own
  right. An Entra guest's UPN ends in the tenant's `onmicrosoft.com` domain, so a guest is refused unless that domain
  is listed.
- **A malformed entry is kept, not dropped.** Dropping entries that do not look like domains turns a list made only of
  mistakes into an empty one, and an empty list admits everyone. Kept, a malformed entry simply matches nothing.
- **Rejected: Google's `hd` claim.** It exists only for Workspace accounts, so it cannot express "consumer `gmail.com`
  accounts only", and it would have worked for one provider only.

### 2.2 The language a session starts in (CA-198)

A session takes, in order:

1. the user's language;
2. the service configuration's `language`, when one is set;
3. `localization.getSystemLanguage()`, which is new in core.

The shipped `"language": "en"` is removed.

- **Rejected: removing the default and leaving the session's language unset.** A lookup with no language already
  falls back to the system language. But consumers read `session.language` directly: competence records a consent
  answer against the statement in that language. Every consumer would have needed its own fallback, and a concrete
  value is the stronger contract.
- **Resolved where it is consumed, at sign-in.** Resolving it in the `TiWebServer` constructor would work too, but it
  can only be tested by instantiating the server, which the framework's tests avoid. The handler can be driven
  directly.
- **The core range is now `>=1.18.0`, not `*`.** Against an older core, `getSystemLanguage` is missing, and every
  sign-in would throw inside the session modifier and be refused. `*` claimed any core works, which stopped being
  true. The floor keeps the "latest" intent. It also makes npm update a consumer's locked core when it installs this
  web-framework. With `*`, the old core would have stayed locked.
- **Exception messages.** Core ships Bulgarian for every code (41, counting the new 1011). It also adds the English message for 5006, which had
  none in any language. A test keeps the code table and the catalogue in step.

### 2.3 Hold requests until the instance has started (CA-187)

`TiWebServer#start()` marks the instance `starting` until `super.start()` resolves. That is after the whole `onStart`,
an application's own chain included, and after core's post-start. `webHandlers.startupGateHandler` holds requests
until then. It is mounted after static content and before the session, so a held request neither reads nor touches
the session. `/health` is never held.

- **Rejected: listening only once initialization has finished.** A platform's port probe would then fail for the whole
  initialization. Cloudflare's container wrapper has its own timeout for that, and `/health` could not answer. Holding
  at the gate keeps liveness and bounds the wait.
- **Rejected: a new hook the application must override.** One example is an `initializeApplication()` that the
  framework awaits before opening. Every application would have to change to be covered. Wrapping `start()` covers
  the documented `super.onStart().then( … )` pattern as it stands.
- **Rejected: answering `503` straight away.** The first click after every wake would fail. With the hold, it is only
  slow.
- **The hold is bounded at 30 s.** Past that, or after a failed start, the answer is `503`, `Retry-After: 5`, and the
  new core code `E_GEN_SERVICE_STARTING` (1011).
  - The default error handler answers a `503` on a navigation as text. Redirecting it to `/`, as other errors are,
    would send it back into the held request.
  - An instance started through `onStart()` directly, as tests do, has no start-up state and is never held.

### 2.4 Failed requests (CA-215)

- **A 5xx** is logged at ERROR with the exception, the method and the path, without the query string, which can carry
  tokens.
  - The client gets the code, the localized message and the exception's ID, but no data.
  - The ID is the correlation ID: it is in the response and in the log line. **Rejected: minting a separate one.**
    The exception already carries a UUID that appears in its JSON.
- **A 503** is logged at WARNING: it is a condition, not a defect.
- **A 4xx** keeps its data and its DEBUG level.
  - **Rejected: hiding data for every error.** A form learns what was wrong from it.
  - **Rejected: logging client errors above DEBUG.** Anyone could then fill the log.
- **An `Error` carrying a 4xx `status`** is raised as the client's error, with nothing it carried. This is the
  `http-errors` convention every body parser follows. It was the path by which a malformed JSON body came back as a
  500 carrying the stack and the echoed body.
- **Core.**
  - `TiException#toJSON()` returns `asJSON()`.
  - `start-instance` logs a rejection's reason through `asJSON()`. It works in console mode, where `toJSON` is not
    consulted, and in JSON mode, where the reason used to be `{}`.

### 2.5 Concurrent configuration saves (CA-192)

`ConfigStore#saveChangeSet` runs its version check and its writes with every document of the change-set held.
`#exclusively( keys, task )` queues a task behind the tasks already queued for any of its keys.

- Queueing is synchronous, and a task waits only for tasks queued before it, so no two tasks can wait for each other.
  A multi-document change-set and a save of one of its documents simply run in arrival order.
- A failed task releases its keys.
- `seedIfEmpty` takes the same lock. Its read-absent-then-write is the same check-then-write.
- **Deferred: a true compare-and-set in the store** (Redis `WATCH`/`MULTI` or Lua, or a conditional D1 write). The
  cache abstraction exposes per-key commands only, and the store's own documentation had already deferred a
  transactional write. Every deployment in use runs one instance, which the in-process queue covers.

## 3. Deliberately not done

- **competence's adoption.** It is a separate PR, once these versions are on npm. It covers:
  - the two domain variables;
  - the consent fallback language;
  - moving the backfill off the fatal start path;
  - a `.catch` on the `config:changed` listener;
  - the data-layer fallbacks (CA-186).
- **Showing the reference in the notification.** The client shows the message only. The ID is in the response for
  whoever reads it.
- **Ordering configuration writes across instances.** See §2.5.
- **Existing sessions.** Sessions signed in before the upgrade keep `language: "en"` until their next sign-in. There is
  no safe way to tell an explicitly chosen English from the old default.
- **The bundled Alpine and htmx copies.** Running `npm install` rewrote `bin/static/scripts/lib/alpinejs-csp.min.js`
  and `htmx.min.js` from the installed `@alpinejs/csp` 3.17.4 and `htmx.org` 2.0.11. The committed copies were last
  refreshed in July. The drift predates this work and was restored, not committed.

## 4. Compatibility

- **Minor versions.** Every change is additive or fixes behaviour nobody could have wanted.
  - A consumer that set `language` explicitly keeps it.
  - An empty `allowedDomains`, the default, admits any domain as before.
  - The gate holds only an instance started through `start()`.
  - A 5xx payload no longer carries `data`. That data was the stack.
- **web-framework 1.42.0 needs core ≥ 1.18.0**, and says so in its dependency range.

## 5. Testing

| Change | Where | Tests | Reproduction |
|---|---|---|---|
| Allowed domains | `auth-manager.allowed-domains.test.js` | 24 | Through the real `openid-client`, against an in-process provider (`helpers/fake-openid-provider.js`): discovery, a real RS256-signed ID token, `userinfo`. A verified `@is-bg.net` Google identity was admitted while Google was meant for `gmail.com` |
| Session language | `web-handlers.session-language.test.js` | 7 | Both sign-in handlers, with `TI_LOCALIZATION_LANGUAGE=bg`: the session came out without the deployment's language |
| System language, exception messages | core `localization.system-language`, `exception-labels` | 2 + 4 | 40 codes missing `bg`; 5006 missing `en` |
| Start-up gate | `web-server.startup-gate.test.js`, `web-handlers.startup-gate.test.js` | 2 + 8 | A real `TiWebServer` (no broker, in-memory cache) whose application initialization waits on the test: a request was answered before it finished |
| Failed requests | `web-handlers.default-error.test.js` | 8 | A real Express app behind `express.json()`: a malformed body came back as a 500 with the stack and the echoed body |
| Rejection reason, serialization | core `start-instance.rejection-reason`, `exception-serialization` | 2 + 2 | `bin/start-instance.js` in a child process: the reason was `{}` in JSON mode and absent in console mode |
| Concurrent saves | `config-store.concurrent-saves.test.js` | 6 | Two saves at one version both committed version 2 |

Totals: web-framework 649 → 704, core 222 → 233, web-content 408 (unchanged).

## 6. Implementation log

- **2026-09-28** — All five implemented test-first on `claude/gifted-goodall-ia65ew`, each reproduced before its fix.
  - Gates: `npm test` green across the workspace; lint 0 errors, the same 65 pre-existing warnings in the same 10 files
    as `master`; `build:types` / `check:types` clean.
  - Versions and changelogs: core 1.18.0, web-framework 1.42.0.
