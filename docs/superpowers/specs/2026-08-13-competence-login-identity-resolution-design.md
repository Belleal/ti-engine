# Design — Derive competence identity from the authenticated login (retire the employee-20 fallback)

| | |
|---|---|
| **Date** | 2026-08-13 |
| **Packages** | `packages/web-framework` (fail-closed session on a refused augment, login error surface), `packages/competence` (email→employee resolution, `augmentSession` rewrite) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | web-framework `1.20.1` → `1.21.0` (minor); competence `3.17.0` → `3.18.0` (minor); core **no bump** (see §6.3) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-95`](https://belleal.youtrack.cloud/issue/CA-95) — *Map OIDC identities to employee records (retire the test-user cookie)*, subtask of `CA-11` |

---

## 1. Background & motivation

`competence` has never derived a user's application identity from their login. `augmentSession`
(`packages/competence/bin/competence-web-server.js:99`) resolves it like this:

```js
session.user.employeeID = ( testUser && testUser.employeeID ) || session.user.employeeID || "20";
session.user.roles = overrideRoles || this.#resolveUserRoles( session.user.employeeID );
```

Three facts collapse that into a constant in any deployment where the dev cookie is off:

1. `#readTestUserSelection` returns `null` unless `COMPETENCE_TEST_USER_ENABLED` is set, so `testUser` is `null`.
2. The framework's `User.asJSON()` (`packages/web-framework/components/user.js:120`) has **no `employeeID` field**,
   so the second operand is always `undefined`.
3. The expression therefore falls through to the hard-coded literal `"20"`, and roles are derived for employee 20 —
   a unit manager (`config.organization-structure.json:22`), i.e. `[EMPLOYEE(1), MANAGER(2)]`.

This surfaced on the Azure-SSO staging environment: every user logged in as employee 20 with that employee's manager
scope over their team. It is not a display bug — it is a live authorization defect, and it blocks production use.

The fix is the one already carded as `CA-95` and recorded as a follow-up in the CA-94 spec (§9.6): resolve the
authenticated identity to an employee record by **email**, which employee records already carry
(`bin/data/schemas/employee.schema.json:19`), and **refuse the login** when no record matches.

## 2. Goals & non-goals

**Goals**

- A user's `employeeID` is derived from the identity they authenticated with (email), not from a literal.
- An authenticated identity with no usable employee record **cannot obtain a session** — refusal is fail-closed at the
  moment of login, not on a later request.
- The refused user sees a clear, localized message on the login page instead of a blank form.
- **Login failures present identically across every auth method** — local, Google and Azure — because local auth is
  intended to become a production-viable option for deployments with no external identity provider (§7).
- `COMPETENCE_TEST_USER_ENABLED` keeps working unchanged for local development.
- Reusable mechanism lands in `web-framework`; everything that knows what an *employee* is stays in `competence`.

**Non-goals**

- Removing the test-user cookie and its login panel. That is the rest of `CA-95` and lands once identity mapping is
  proven in staging.
- Provisioning or self-registration of employee records. An unknown identity is refused, not created.
- Any change to role derivation itself. `role-resolver` and the supervisor-grant mirror are untouched.
- Hardening local auth itself (rate limiting, lockout, password policy). Making it production-viable is a separate
  concern; this spec only unifies how its *failures* are presented.

## 3. Decisions taken during brainstorming

| Question | Decision | Rationale |
|---|---|---|
| May an admin-allowlisted identity log in with no employee record? | **Yes** — admin-only session, no `employeeID`, no application roles | Preserves a recovery path. If employee data is empty or wrong, the admin config UI is still reachable to fix it; a strict rule would need a redeploy or a direct Redis edit to recover. |
| Which `employmentStatus` values may log in? | **`active` + `on-leave`**; `terminated` refused | An employee on parental or sick leave keeps access to their own appraisal data, which is the intent of the status; a departed employee loses access when HR marks them terminated. |
| What does a refused user see? | **One generic localized message** for every cause | No cause-specific copy to maintain or translate; the specific reason goes to the server log for support. |
| Duplicate emails across employee records | **Refuse** (ambiguous identity) | Fail closed, consistent with the codebase's stated principle. Guessing which of two records is "the" user is an authorization decision made on a coin flip. |

## 4. Layer split

The governing rule: **`web-framework` owns the mechanism, `competence` owns the policy.** The framework must not learn
what an employee is; the app must not reimplement session or login-error plumbing.

### 4.1 `web-framework` — reusable

**(a) A refused login must not leave a usable session.** `session.user` is assigned *in place*
(`web-handlers.js:295`, `:343`) before `augmentSession` runs, and `verifySession` is only
`Boolean(session.user)` (`web-server.js:426`). Today a hook that throws leaves that mutation on a dirty session which
`express-session` persists at response end — so the refused user would still be admitted. The `catch` in
`regenerateAndSaveSession` (`web-handlers.js:174`) must **destroy the session before rejecting**.

This is a correctness bug in the framework, not in competence: it affects any consumer whose augment hook throws, and
neither `web-content` nor a future consumer should have to know about it.

**(b) A first-class refusal contract on the `augmentSession` hook.** Throwing from the hook becomes the documented way
an application refuses a login: the framework destroys the session, the login handler's existing `.catch` raises `401`,
and the error handler's existing HTML-GET branch (`web-handlers.js:532`) redirects to `/?error=<code>`. The hook's
JSDoc (`web-server.js:429-440`) states this contract; today it says only that the default is a no-op.

**(c) The login error surface.** `#ti-error` (`frame-login.html:15`) is an empty div and the `getUrlParam` helper
(`ti-framework.js:193`) has no call sites, so `/?error=` currently renders a blank login page. A small Alpine
component bound to that div toggles its visibility when an `error` parameter is present; the text stays declarative via
`x-text-label` so it localizes through the normal path. Generic copy, so it is app-neutral and belongs in
`web-server-labels.json`.

**(d) Method-agnostic login-failure redirect.** The error handler currently redirects to `/?error=` only for
`GET` (`web-handlers.js:531`), so the Azure callback is covered but the local login POST falls through to a raw
payload response. The condition widens to include **any 401**:

```js
} else if ( isAcceptingResponseType( request, "html" ) && ( request.method === "GET" || status === 401 ) ) {
```

This is principled rather than a special case: a 401 on an HTML request means *you are not signed in*, and the correct
answer is to put the browser on the sign-in page with the reason. The error handler learns nothing about routes.

The mechanism is reliable in both directions: both login handlers wrap their failure as
`exceptions.raise( error, null, C_401 )`, the explicit `httpCode` argument is applied last and always wins
(`exceptions.js:354`), and `resolveHttpCode` returns an explicit `httpCode` before any family-derived default
(`web-handlers.js:72`). So a `TiException` thrown by `augmentSession` arrives at the handler as a 401 regardless of its
own family.

Scope of the widening is small in practice: HTMX requests are handled by the branch above, and a non-HTMX
HTML-accepting POST that produces a 401 is a login attempt. Unauthenticated access to a protected route is handled
earlier by `resourceProtectionHandler` and is unaffected.

**(e) Export the authorization helpers.** `components/authorization.js` is currently internal — the `exports` map lists
only `./config-management`, `./web-application`, `./web-server` and `./definitions` — so `isAdminIdentity` is
unreachable by a consumer. Competence needs it for the admin exception (§4.2c), and reimplementing an allowlist match
in the app would duplicate the framework's own matching rules. It is exposed as
`@ti-engine/web-framework/authorization`, following the `types`/`default` condition shape the other entries use.

CSP discipline applies: the component only reads a URL parameter and sets a boolean — no inline styles, no optional
chaining in the template, per the Alpine CSP-build constraints. It is registered separately from
`tiLoginTestUserPanel` so it survives that panel's eventual deletion.

### 4.2 `competence` — application-specific

**(a) `application/identity-resolver.js` — a new pure frozen-singleton**, mirroring `role-resolver.js` and
`task-resolver.js`: no I/O, the caller injects the facts. It answers one question and is unit-testable with plain
objects.

```
resolve({ email, lookup, isAdmin }) →
    { employeeID }                    // resolved
  | { employeeID: null, adminOnly }   // admin exception
  | { reason }                        // refused
```

`reason` ∈ `no-email` | `no-record` | `terminated` | `ambiguous-email`. The taxonomy is competence's, because only
competence knows these categories exist.

**(b) `organizationManager.resolveEmployeeIDByEmail( email )`** — synchronous, backed by an email index built inside
`buildOrganizationChart()`, where the graph already stores `email` and `employmentStatus` per employee node
(`organization-manager.js:142-143`). This is what makes the whole design work inside a synchronous hook without any
framework surgery.

- Both sides normalized with trim + lowercase.
- Employees with no email are skipped — they simply cannot be matched.
- **Duplicate emails are detected once at build time**, logged as a startup WARNING naming the colliding IDs, and any
  lookup hitting a collision returns an ambiguous result. Detecting at build time means the operator learns about bad
  data at deploy, not from one user's failed login.

**(c) `augmentSession` rewrite.** Precedence:

1. **Dev cookie** — only when `COMPETENCE_TEST_USER_ENABLED` is on. Unchanged in spirit, with one addition: the named
   employee must **exist**, so a typo fails in dev the same way it would in production instead of silently working. All
   eight panel profile IDs exist in the seed, so this breaks no current dev flow. Existence is the *only* check on this
   path — `employmentStatus` is deliberately **not** enforced, so a developer can still select a terminated employee to
   exercise that state. The cookie is an explicit override of identity; it is not a second production gate.
2. **Email lookup** via the resolver above.
3. **Admin exception** — competence decides this, using the framework's exported `isAdminIdentity` predicate
   (`authorization.js:44`) against `this.serviceConfig?.auth?.admins`. The framework supplies the predicate; the app
   makes the decision, because only the app knows an `employeeID` was required in the first place.

   The exception applies to **every** refusal reason, not only `no-record`: an allowlisted admin whose employee record
   is terminated or whose email is ambiguous still gets an admin-only session. The admin allowlist is a
   deployment-level grant that exists independently of employment, and the recovery path it protects is worth least
   exactly when the employee data is in a bad state.
4. **Refuse** — log the specific reason, throw.

The `|| "20"` literal is deleted. No code path may invent an identity.

## 5. Data flow

```
Azure callback (GET)
  → authorizedOAuth2CallbackHandler
    → regenerateAndSaveSession( modifier )
      → session.user = user.asJSON()          // no employeeID
      → competence.augmentSession( session, request )
          ├─ dev cookie (flag on) ─────────────→ employeeID, roles
          ├─ identityResolver.resolve( email ) ─→ employeeID, roles
          ├─ isAdminIdentity( user, admins ) ──→ employeeID: null, roles: []
          └─ throw TiException                 ─┐
      → applyAdminRole( session, admins )       │
      → session.save()                          │
  → 303 → "/"                                   │
                                                │
  catch ─→ session.destroy() ─→ reject ─────────┘
    → next( raise( error, null, 401 ) )
    → errorHandler → 303 → "/?error=<code>"
    → login page renders #ti-error
```

## 6. Detailed decisions

### 6.1 Why refusal throws rather than returning a sentinel

The hook's signature is `(session, request) → session`, and `regenerateAndSaveSession` already wraps the call in
`try/catch`. Throwing needs no signature change and no new branch in the framework's login handlers; a sentinel return
would change the contract for every existing consumer. The only missing piece is the session destroy, which is
required for correctness regardless (§4.1a).

### 6.2 Why the admin exception lives in competence

The framework has no concept of an application principal, so it cannot know that "no employee record" is a refusable
condition — only competence can. Putting the exception in the framework would mean teaching it about `employeeID`.
The framework already exports the reusable half (`isAdminIdentity`); competence composes it.

### 6.3 Why no new core exception code

`E_SEC_UNAUTHORIZED_ACCESS` (2002) is reused. A dedicated code was considered and rejected: the user-facing message is
generic by decision (§3), so the UI never needs to distinguish causes, and the reason taxonomy is competence-specific —
putting it in core would push application policy down two layers, against the layering rule. Competence logs the
specific reason at its own layer, which is where support triage reads it. This also keeps the change to two packages.

### 6.4 Session-user shape for the admin exception

An admin without an employee record gets `employeeID: null` and `roles: []`, then `applyAdminRole` adds the string
`admin` role. Consequences, accepted deliberately:

- Every role-gated screen is unreachable (no numeric roles), which is correct — they have no appraisal identity.
- Admin config screens are reachable, which is the point of the exception.
- Screens must tolerate a null `employeeID`. The dashboard is the one that assumes it; it is gated on numeric roles, so
  an admin-only session cannot reach it. Implementation must confirm this rather than assume it.

## 7. Local auth as a first-class method

Local (username/password) auth is intended to become a supported production option for deployments with no Google or
Azure tenant, so it is not treated as dev-only scaffolding here: its failures present exactly like an SSO failure, via
§4.1(d).

**Consequence for the message copy.** The single generic message (§3) now covers two different situations:
*authentication* failure (wrong credentials) and *authorization* refusal (authenticated, but no usable employee
record). It must read sensibly for both while confirming neither — telling an anonymous visitor whether a username
exists is exactly the disclosure a login form should avoid. Proposed English copy:

> **We couldn't sign you in.** Check your credentials, or contact your administrator if your account is not set up for
> this application.

Bulgarian follows the repo's convention for new labels (translated, flagged for native review). This is user-visible
copy, so it is easy to change later without touching any logic — the string lives in `web-server-labels.json` and the
component renders whatever key it is given.

**Not covered here:** rate limiting, lockout, and password policy. A production-viable local auth wants all three, and
none of them belong in this change; they are noted as follow-up work in §11.

## 8. Testing

**web-framework**

- `test/web-handlers.session-fail-closed.test.js` — drive `authorizedOAuth2CallbackHandler` with a stub instance whose
  `augmentSession` throws; assert `session.destroy()` is called, the promise rejects, `save()` is never called, and the
  response is the `/?error=` redirect. `regenerateAndSaveSession` is module-private, so this is tested through the
  handler with fakes — which also tests the real path rather than an internal.
- `test/web-handlers.login-error-redirect.test.js` — the §4.1(d) rule: an HTML-accepting **POST** with a 401 redirects
  to `/?error=<code>`; an HTMX request still takes the `HX-Trigger` branch; a non-401 HTML POST still sends the payload
  (proving the widening did not swallow ordinary form errors); a `TiException` from a non-security family still
  arrives as 401 when raised with an explicit code.
- Existing `authorization.test.js` unchanged (`isAdminIdentity` is not modified).

**competence**

- `test/identity-resolver.test.js` — the pure resolver: match; case and whitespace normalization; user with no email;
  no matching record; `terminated` refused; `on-leave` admitted; ambiguous refused; admin exception.
- `test/organization-email-index.test.js` — index build and lookup; case-insensitive match; employees without email
  skipped; duplicate emails detected and reported.
- `augmentSession` precedence — cookie honored only with the flag on; cookie naming an unknown employee refused; email
  path; admin exception; refusal throws.

Both packages use `node --test`, consistent with the rest of the monorepo.

**Type declarations.** Since web-framework 1.20.0 the package ships generated `.d.ts` files, gated against a consumer
type-checking with `skipLibCheck: false`. The `augmentSession` JSDoc change and any new exported signature must be
followed by `npm run build:types -w @ti-engine/web-framework`, with the regenerated `types/` committed alongside the
source. A stale declaration is a release defect, not a cosmetic one.

## 9. Risks

1. **A deployment whose employee emails don't match the SSO tenant's emails locks everyone out.** This is the intended
   behavior — but it turns a data mismatch into a total outage rather than a silent wrong-identity. Mitigations: the
   startup duplicate-detection log, the admin exception as a recovery path, and an INSTALL.md note that employee emails
   must match the identity provider's before enabling SSO.
2. **The email index is process-local**, rebuilt with the org chart. Same single-instance assumption already documented
   for the supervisor-grant mirror (`data-manager.js:42`, tracked as `CA-73`); no new class of problem, but the index
   must be rebuilt wherever the org chart is.
3. **`employeeID: null` sessions are new.** Nothing produced them before. §6.4 covers the reasoning; implementation
   must verify no screen dereferences `employeeID` before checking roles.

## 10. Documentation

- `INSTALL.md` — employee emails must match the identity provider; what a refused login looks like; the admin
  exception as the recovery path.
- `packages/competence/README.md` — the `COMPETENCE_TEST_USER_ENABLED` row gains a note that identity now derives from
  the login when the flag is off.
- `packages/web-framework/README.md` — the `augmentSession` refusal contract, so a future consumer finds it.
- Both packages' `CHANGELOG.md`.

## 11. Follow-up work (not in this change)

- **Retire the test-user cookie and its login panel** — the remainder of `CA-95`, once identity mapping is proven in
  staging.
- **Harden local auth for production use** — rate limiting, lockout after repeated failures, and password policy.
  Required before local auth is offered as the sole method in a real deployment (§7); worth its own card.
- **Employee-email uniqueness at the data layer** — this spec detects duplicates at org-chart build time and refuses
  the ambiguous login, which is the safe read side. Preventing the duplicate from being stored in the first place
  belongs with employee management.
