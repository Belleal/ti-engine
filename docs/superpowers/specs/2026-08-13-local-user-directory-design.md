# Design — A real local user directory for local authentication

| | |
|---|---|
| **Date** | 2026-08-13 |
| **Packages** | `packages/web-framework` (the whole change); `packages/competence` (documentation only) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | web-framework `1.22.0` → `1.23.0` (minor, with a `!` entry); competence `3.19.0` → `3.19.1` (patch, docs only); core **no bump** |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-100`](https://belleal.youtrack.cloud/issue/CA-100) — subtask of `CA-11` Platform & Quality, alongside `CA-95` |

---

## 1. Background & motivation

Local (username/password) authentication has never been implemented. Three pieces of
`packages/web-framework/components/auth-manager.js` make that concrete:

- **`:76-79`** — when `local` is enabled the constructor overwrites whatever was configured with
  `username = "admin"`, `password = "admin"`, behind a `// TODO: For testing purposes only!`.
- **`#authenticateLocal` (`:365-374`)** — a plain `===` comparison of both username and password, marked
  `// TODO: Implement this!`. Not timing-safe.
- **`authorize()` (`:201`)** — returns `new User( { userID: \`local:${ tools.getUUID() }\`, username } )`. No `email`,
  no `name`, and a **different `userID` on every login**.

The missing `email` became blocking with `CA-95`. Competence now derives the acting employee from the
authenticated login's email; a local-auth session carries no email, so `identity-resolver` refuses it as
`no-email`. An identity on the admin allowlist is admitted, but only to the administration screens. **Local auth
therefore cannot reach the application at all** — which contradicts the intent of offering it where there is no
Google or Azure tenant.

The random per-login `userID` is a second, quieter defect: `auth.admins` matches against userID, username or email
(`components/authorization.js:44-49`), so a local user could never be allowlisted by userID.

## 2. Goals & non-goals

**Goals**

- A real local user directory: a JSON file loaded on boot, reconciled into Redis, whose records carry an `email` —
  which is what makes a local login resolvable to an employee.
- **No plaintext password at rest anywhere** — not in the repository, a mounted config, or a backup.
- Password verification that is timing-safe and does not leak whether a username exists.
- The hardcoded `admin`/`admin` is gone, and a stable `userID` per local user.
- Every failure mode fails closed, with a log line naming the reason.

**Non-goals**

- **A management screen.** Backend load and login only, by explicit decision. The file is the only writer.
- **Rate limiting, lockout, password policy.** Required before `local` is the sole method on an internet-facing
  deployment; own card (§9).
- Password reset, self-service registration, or any change to the OIDC paths.
- Any change to competence beyond documentation.

## 3. Decisions taken during brainstorming

| Question | Decision | Rationale |
|---|---|---|
| How do passwords reach the seed file? | **Pre-hashed only.** A bundled CLI generates hashes; the loader never sees a plaintext password | No plaintext ever exists at rest. A plaintext field would be one `git add` from being committed, and would have to be treated as a mounted secret in every deployment. Also what the organization's secret-handling rules require |
| Boot reconcile semantics | **The file is the source of truth** — add, update, **and remove** | Editing the file takes effect, and deleting a user genuinely revokes access. Correct while the file is the only writer; a future management screen must revisit it (§9) |
| Hash algorithm | **`scrypt` from `node:crypto`** | Zero new dependencies in a published npm package, and the repo already relies on `node:crypto` for core's HMAC message hash. Argon2id is marginally stronger but needs a native dependency. Decided rather than asked; the parameters are recorded in the hash string so this can change later |

## 4. Layering

The whole change lives in `web-framework`. Authentication is framework-owned, and **competence needs no code
change at all** — it starts working because `session.user.email` is finally populated and the existing
`identity-resolver` has something to match. Competence's only change is documentation.

## 5. Components

### 5.1 `components/local-user-directory.js` (new)

One module, three responsibilities behind a narrow interface. The pure parts are separated from the Redis part so
they are unit-testable with plain objects, mirroring `authorization.js` and competence's resolvers.

**I/O-free** (no filesystem, no Redis — unit-testable with plain values):

- `parseRecords( raw )` → `{ records: LocalUserRecord[], problems: string[] }`. Validates each entry and reports
  why any was dropped. Never throws on bad input — a malformed row is data, not a crash. **A duplicate `username`
  is a reported problem, not a silent overwrite:** the directory is keyed by username, so a second entry would
  otherwise quietly replace the first and the operator would have no idea which password is live.
- `hashPassword( password )` → the encoded hash string. Used only by the CLI. Not deterministic — it draws a fresh
  random salt per call, so tests must assert via `verifyPassword` rather than comparing to a fixed string.
- `verifyPassword( password, encoded )` → boolean. Timing-safe.

Usernames are matched **exactly, case-sensitively**, at both load and lookup. Case-insensitive matching would need
one normalization rule applied identically in the file, the reconcile and the lookup, and a mismatch between any two
of them is the kind of bug that silently admits or locks out the wrong person. Exact matching has no such failure
mode; the cost is that `Admin` and `admin` are two different users, which is worth documenting rather than papering
over. (Email, by contrast, is normalized case-insensitively downstream by the consuming application, which is that
application's rule to make.)

**Impure (Redis, via `@ti-engine/core/cache`):**

- `reconcile( records )` — writes the directory under `ti:web:auth:local-users`, keyed by username: adds new,
  updates changed, and removes any username no longer in the file.
- `findByUsername( username )` → `LocalUserRecord | null`.

### 5.2 Record shape

```
{ userID, username, email, name, passwordHash, disabled? }
```

`username`, `email` and `passwordHash` are **required**; a record missing any is dropped with a warning naming the
username (never the hash). `email` is required specifically because it is the field an application resolves an
identity by — a record without one would authenticate and then be refused downstream, which is a worse experience
than being rejected at load with a clear reason. `userID` defaults to `local:<username>` when absent, giving the
stable identifier `auth.admins` needs.

### 5.3 The hash encoding

`scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>` — self-describing, so the cost parameters are recorded per hash and can
be raised later without invalidating existing ones. `verifyPassword` reads the parameters out of the stored string
rather than assuming the current defaults.

Verification is `crypto.timingSafeEqual` on the derived key. **An unknown username still performs a hash
computation** against a dummy encoded value before returning false, so a missing user and a wrong password take
comparable time — otherwise the login form is a username-enumeration oracle. This is the one place where doing
redundant work is the correct implementation.

### 5.4 The hash-generation CLI

`bin/build/hash-password.js`, run as `npm run hash-password -w @ti-engine/web-framework`.

Reads the password from **stdin** and writes only the encoded hash to stdout. Deliberately **not** an argv
parameter: an argument lands in shell history and is visible in `ps` to every other user on the machine. The
password is never echoed, never logged, and never written to a file by the tool.

### 5.5 Changes to `components/auth-manager.js`

- Delete the `:76-79` hardcoded credential block entirely.
- `#authenticateLocal` looks the username up in the directory, rejects a `disabled` record, and verifies the
  password through `verifyPassword`. Its rejection stays `E_SEC_UNAUTHORIZED_ACCESS` / `401`, unchanged, so the
  login page's generic message continues to apply and nothing distinguishes the failure reasons to a visitor.
- `authorize()` for `LOCAL` returns a `User` built from the record — `userID`, `username`, `email`, `name` —
  instead of the UUID stub.

### 5.6 Configuration

`auth.local.usersPath` in `web-server.json`, overridable by **`TI_WEB_AUTH_LOCAL_USERS_PATH`**, applied by
`applyWebConfigEnvOverrides` alongside the other `TI_WEB_*` values. No default path and no directory file ships
with the framework; `bin/config/local-users.example.json` is shipped as an example carrying **placeholder hashes
only**.

## 6. Data flow

```
boot
  → TiWebServer starts, auth manager initializes
    → local enabled?  no  → nothing to do
                      yes → usersPath configured?  no → WARNING, directory stays empty
                                                   yes → read file
                                                          → parseRecords()  → problems logged per record
                                                          → reconcile()     → ti:web:auth:local-users

POST /login/local
  → authenticate( LOCAL, { username, password } )
    → findByUsername()  → null      → dummy hash, reject 401
                        → disabled  → reject 401
                        → record    → verifyPassword()  → false → reject 401
                                                        → true  → resolve
  → authorize( LOCAL )  → User { userID, username, email, name }
    → session.user = user.asJSON()
      → app's augmentSession() resolves the email to its own principal
```

## 7. Failure modes — all fail closed

| Condition | Behaviour |
|---|---|
| `local` enabled, no `usersPath` configured | WARNING at startup; every local login refused |
| File missing or unreadable | WARNING naming the path; every local login refused |
| File is not valid JSON, or not an array | WARNING naming the path and the parse error; every local login refused |
| A record is missing `username`, `email` or `passwordHash`, or its hash is unparseable | That record dropped with a WARNING naming the username; the rest load |
| Every record invalid | WARNING; every local login refused |
| Redis unavailable during reconcile | Startup WARNING; local logins refused rather than falling back to an in-process copy |

A malformed file never fails startup. A deployment whose other auth method works must not be taken down by a bad
local-users file — but neither may it admit anyone.

**A failed load does not reconcile.** When the file is missing, unreadable or unparseable, the stored directory is
left exactly as it is rather than being cleared. Two reasons: a broken volume mount is far more likely than a
deliberate mass revocation, and clearing on read failure would turn a transient mount problem into destroyed state.
It costs nothing in security terms, because the same condition already refuses every local login — the stored
records are inert while the load is failing. Only a **successfully parsed** file reconciles, and only then does an
absent username remove a stored record.

## 8. Testing

`packages/web-framework/test/local-user-directory.test.js` (pure) and
`packages/web-framework/test/local-user-directory.store.test.js` (reconcile, against the in-memory cache stub):

- `parseRecords`: a valid record; missing `username` / `email` / `passwordHash` each dropped with a problem
  reported; a non-array input; a non-object entry; `userID` defaulting to `local:<username>`; `disabled` preserved;
  a duplicate username reported as a problem rather than silently overwriting.
- Hash round-trip: `verifyPassword( p, hashPassword( p ) )` is true; a wrong password is false; a truncated or
  garbage encoded string is false rather than throwing; a hash carrying **different cost parameters** than the
  current defaults still verifies (this is what proves the encoding is genuinely self-describing).
- `reconcile`: adds, updates a changed record, and **removes** a username absent from the new set; an empty input
  clears the directory.
- `findByUsername` returns null for an unknown username and is case-sensitive on username.
- The fail-closed paths from §7 that are reachable without Redis.

`test/auth-manager.test.js` gains: local auth rejects when the directory is empty; rejects a `disabled` record;
resolves for a valid pair; and `authorize()` returns a `User` carrying `email` and a **stable** `userID` across two
calls (the regression that the old UUID stub would fail).

**Every fixture uses an obvious placeholder** — no real or realistic credential appears in a test, an example file,
or a documentation snippet.

## 9. Follow-up work (not in this change)

- **Rate limiting, lockout and password policy** — own card. Required before `local` is the sole method on an
  internet-facing deployment. Without them this is a correctly-implemented password check with no brute-force
  protection.
- **A management screen** — and with it, revisiting §3's "file is the source of truth" decision, since a second
  writer changes the reconcile semantics.
- **Password rotation / expiry** — no mechanism here; a rotation is an operator editing the file.

## 10. Documentation

- **`packages/competence/INSTALL.md`** — five passages describe local auth as a dev-only stand-in with hardcoded
  `admin`/`admin` (§1, §7 "Local auth", §10 Method D "Locked out?", §11 First run, §16 Troubleshooting). All were
  reconciled under `CA-95` against the *refusal* behaviour and must now be rewritten against the *directory*
  behaviour: local auth becomes a real option, a local user has an email and so resolves to an employee normally,
  and the break-glass story changes from "hardcoded credentials" to "a directory entry you provision".
- **`packages/web-framework/README.md`** — the directory, the record shape, the CLI, and the `TI_WEB_*` override.
- Both packages' `CHANGELOG.md`. The web-framework entry is a `feat(auth-manager)!`: removing `admin`/`admin`
  breaks any deployment relying on it, which is the point.
