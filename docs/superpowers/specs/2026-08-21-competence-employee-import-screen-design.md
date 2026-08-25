# Design — Competence Employee Import Screen

| | |
|---|---|
| **Date** | 2026-08-21 |
| **Packages** | `packages/competence` only |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | competence `3.22.0` → `3.23.0` (minor). No `web-framework` change |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-108`](https://belleal.youtrack.cloud/issue/CA-108) (subtask of `CA-6` Employee & Organization Management) |
| **Follows** | [`2026-08-19-competence-org-chart-import-design.md`](2026-08-19-competence-org-chart-import-design.md) (CA-107) |

---

## 1. Background & motivation

CA-107 shipped a CSV employee importer as a pure pipeline — `parseDelimited` → `mapRows` → `reconcile` → `applyPlan` — behind a dry-run-by-default operator CLI, and an HR-facing spreadsheet template at `docs/templates/employee-import-template.xlsx`.

That design listed **"an admin-facing upload screen"** as an explicit non-goal: *"deferred; the CLI covers the one-time load, and the sync phase makes the screen partly redundant."* This picks that item up. The pipeline was deliberately shaped so a screen becomes a **new driver against the same module**, not a rework, and that is exactly what this is.

The gap the screen closes is operational rather than technical. Today the flow is: HR fills the template, exports a CSV, and then sends it to somebody with shell access to a container. Every correction round — and there will be rounds, because a rejected row is the normal case on a first load — costs another handoff. A screen collapses that loop to the person holding the data.

It also fixes something the CLI structurally cannot. Every org-chart and email-index rebuild call site is in-process, so a CLI import leaves the running server stale until it restarts (recorded as finding I5 of the CA-107 whole-branch review). A screen runs *inside* the server, so it can rebuild immediately.

## 2. Decisions taken during brainstorming (2026-08-21)

1. **CSV only — no `.xlsx` upload.** The template already instructs HR to return a CSV, so this completes the intended workflow. Accepting `.xlsx` would need an xlsx parser as competence's first runtime dependency beyond `graphology`, shipped in the container image and parsing untrusted zip input. Hand-rolling a zip + XML reader for untrusted uploads was rejected outright; taking the dependency was deferred until returning a CSV is shown to be a real problem.
2. **Gated on `admin`.** Considered against `SUPERVISOR`, which is the precedent for every existing employee write (`#createEmployee`, `#updateEmployee`) and for the consent register — gated `SUPERVISOR` specifically because its rows are personal data rather than configuration. The owner chose `admin`, treating bulk import as deployment tooling alongside the org-structure configuration screen it depends on. See §7 for the consequence this carries.
3. **Preview *and* apply, with apply behind a confirmation** that names the counts and states there is no rollback. Preview-only was considered and rejected: it means two tools for one job and HR still waits on an operator.

## 3. Goals & non-goals

**Goals**

- Let an admin upload an HR-exported CSV, see the reconciliation plan, and apply it, without shell access.
- Reuse the CA-107 pipeline unchanged — the screen adds no validation, mapping or reconciliation logic.
- Leave the running server consistent after an apply: no restart needed for imported employees to appear in the org chart and sign in.
- Never put employee personal data into a browser payload.

**Non-goals**

- `.xlsx` upload (§2, decision 1).
- Editing rows in the browser. A rejected row is fixed in the spreadsheet and the file re-uploaded; the importer is idempotent, so a corrected re-run touches only what changed.
- A scheduled or automated sync — still deferred, still a future driver against the same module.
- Replacing the CLI. It remains the path for an operator who wants a shell, a Redis snapshot first, and a scriptable exit code.

## 4. Current state that constrains the design

| Fact | Consequence |
|---|---|
| No multipart handling exists anywhere in `web-framework` — no `multer`, `busboy` or `formidable` | The CSV travels as a **string** in the existing JSON service call. Nothing new to plumb, and CSRF + session + role gating come for free |
| `express.json({ limit: "1mb" })` (`web-server.js:315`) | ~36KB for 300 employees, so roughly 25× headroom. A client-side size check must fail politely *before* the server would reject the body |
| competence's runtime dependencies are `core`, `web-framework`, `graphology` | The CSV parser was hand-written to keep that list short. Nothing here may lengthen it |
| `#requireRole( session, ...roles )` tests `roles.some( r => userRoles.includes( r ) )` | It accepts the string `"admin"` as-is; no new gating mechanism is needed |
| ~~`#requireSessionUser( session )` returns `{ userID, userRoles }`, and `userID` exists even for a break-glass admin with no employee record~~ **This was wrong.** `userID` is `session.user.employeeID`, which is `null` for a break-glass admin, so the helper throws 401 for exactly that identity | Corrected during Task 2 (see §4.1). Audit attribution still works and still carries a real user rather than the CLI's literal `"import-cli"` — but through a separate guard, not this one |
| The three whole-file failure conditions live **inline in the CLI** | Duplicating them in a handler guarantees drift. They move to the shared module (§5.3) |
| Alpine runs in **CSP mode** | The fragment may carry no inline `style="..."` and no optional chaining in template expressions |

### 4.1 Correction made during implementation — admin gating needs its own guard

The table row above asserted that `#requireSessionUser` yields a usable `userID` for a break-glass admin. It does not: `userID` is `session.user.employeeID`, and `IdentityResolver` sets that to `null` (with `roles: []`) for an allowlisted identity holding no employee record. So the helper throws 401 for precisely the account this feature must admit — and `#requireRole` funnels through it, meaning an `admin`-gated handler could not have worked as this design first described.

The first attempt at a remedy relaxed `#requireSessionUser` to `employeeID || userID`. That was rejected: the helper has **52 call sites**, 15 of which gate on authentication alone, and its refusal is a fail-closed guard — a session with no employee identity should not reach an employee-scoped handler. Loosening it for all 52 to serve 2 would have opened those 15 to a session whose "employee ID" is an email.

The shipped resolution is a separate `#requireAdmin( session )` used only by the two import services. It reads the framework `userID` directly, checks the `admin` role, and deliberately does not route through `#requireSessionUser`, which keeps that guard intact for every other caller. A regression test pins the fail-closed property: a break-glass-shaped session must still be refused by an employee-scoped handler, asserting the specific `E_SEC_UNAUTHORIZED_ACCESS` code rather than merely that it rejects — under the relaxed version the call still rejected, just with a different error, so a bare rejection assertion would have passed.

## 5. Design

### 5.1 Surface

One fragment and two services:

- `addFragment( "employee-import", { title, path: "fragments/frame-employee-import.html", roles: [ "admin" ] } )`, with ~~`"employee-import": "administration"` added to the sidebar-section map so it sits beside the existing configuration screens~~ **`"employee-import": "employee-import"`** added to `sidebarNavMapping`. The map is not a section map: it decides which sidebar **item** highlights, and `"administration"` is the Configuration item's own key. Mapping to it made Configuration light up whenever the import screen was open. A *sub*-screen maps to its parent's key (`"cycle-setup"`, `"competency-text-editor"`); a top-level item maps to itself, and this screen is top-level. Fixed in `33e9bee`.
- `preview-employee-import` and `apply-employee-import`, both entering the existing service dispatch chain and both opening with ~~`this.#requireRole( session, "admin" )`~~ **`this.#requireAdmin( session )`** — `#requireRole` funnels through `#requireSessionUser` and so could not have admitted a break-glass admin at all. See §4.1 for why, and for why the fix is a second guard rather than a change to the shared one.

The browser reads the chosen file with `FileReader.readAsText`, checks its size, and posts the text. No new transport.

### 5.2 The two calls, and why apply does not trust the client

**`preview-employee-import( { csv } )`** runs the full pipeline and returns a **projection for display**: the four counts (`create` / `update` / `unchanged` / `rejected`), the rejection list, and the absent list as bare `employee_id` values. It returns **no employee records** — no name, email, birth date or grading. A rejection carries `employee_id`, the source line, a code and a message, the same shape the CLI prints, for the same reason: this payload reaches a browser, and from there a screenshot or a ticket. `employee_id` is the one field that crosses — and ~~an `employee_id` is an identifier the operator supplied, not personal data~~ **that is data minimisation, not an exemption**. GDPR Art. 4(1) names an identification number as an identifier of an identifiable person, so the projection is *pseudonymised* personal data and keeps every handling obligation that implies. What minimisation buys is that the disclosure surface is an opaque id rather than a name, an email and a birth date.

**`apply-employee-import( { csv } )`** takes the CSV again and **re-derives the entire plan server-side** before writing.

That is the load-bearing decision of this design. The obvious implementation — preview returns a plan, the client posts it back to apply — would make a client-supplied plan the input to a mass employee write. A tampered plan could then create or terminate arbitrary records while passing every check, because the checks already ran. Re-deriving from the CSV means the only client input is the file, and every validator runs again on the write path.

The cost is that the CSV is uploaded twice and the pipeline runs twice. At 36KB and a pure in-memory pipeline, that is not a cost worth optimising against a whole class of privilege escalation.

### 5.3 One refactor: the whole-file checks become shared

Three conditions reject a file outright rather than a row — an undecodable encoding, a header missing required columns, and a header repeating a column. All three currently sit inline in `bin/build/import-organization.js`.

They move into `application/organization-import.js` as a single pure check returning a structured result, and both the CLI and the new handler call it. This is the codebase's one-chokepoint-per-invariant habit, and it is not theoretical here: the duplicate-header check exists *because* review found that `toRecords` silently overwrites a repeated column, and the encoding check exists because Node's `'utf8'` substitutes U+FFFD rather than throwing. A second, drifting copy of rules with that history is a liability.

Behaviour is unchanged for the CLI. The extraction is covered by its existing tests plus new unit tests on the shared function.

### 5.4 What happens on apply

1. Re-derive the plan (§5.2).
2. `applyPlan` with a writer over `dataManager.saveEmployee` and `appendAuditEntry`, `changedBy` set to the acting admin's `userID`. **The good rows are written and the rejected ones reported — exactly as the CLI behaves.**
3. **`organizationManager.buildOrganizationChart()`** — in-process, so imported employees enter the org chart and the login email index immediately. This is what the CLI cannot do.
4. Return the applied counts alongside the rejections.

Step 2 was nearly specified the other way — refuse the whole apply if any row rejects, on the reasoning that a partial import is worse than none. **That would have contradicted the CA-107 spec's §6 principle directly:** *"Validation is per row: a bad row is rejected on its own and must never block the 299 good ones around it."* That reasoning holds just as firmly on a screen as at a shell, and all-or-nothing would let a single typo block a 300-person load.

It is also unnecessary. Because `reconcile` is idempotent, correcting the rejected rows and re-uploading the same file is safe: the already-written rows come back as `unchanged` and are skipped, so only the corrections are applied. Partial application followed by re-upload is the intended loop, not a failure mode.

### 5.5 The confirmation

Applying opens a modal naming the exact counts and stating plainly that there is no rollback. It is not a generic "are you sure" — the numbers are the point, because "update 287" on a file the operator believed was a small correction is the signal that something is wrong with the file.

## 6. Error handling

- **Whole-file failures** (§5.3) surface as a single message naming the cause; no plan is shown.
- **Row rejections** surface as a list, identified by `employee_id` and source line. Both preview and apply produce them identically, because both run the same pipeline.
- **Oversized file** is caught client-side with an explicit size and limit, before the request is made.
- **A non-CSV file** — the header check rejects it, since it will not resolve the required columns. No content sniffing.

## 7. Privacy, and the two risks this design accepts

**Only minimised data crosses to the browser.** The projection carries counts and pseudonymous identifiers only — no name, email, birth date or grade. This is the same chokepoint the CLI already respects for stdout, extended to an HTTP payload. It reduces what a leak exposes; it does not put the payload outside the regime (§5.2).

**Risk 1 — the screen cannot enforce a backup.** `INSTALL.md` §11 tells operators to snapshot Redis before applying, because an import has no rollback. A screen cannot make that happen. The confirmation states it, and §11 gains a line noting the screen path carries the same irreversibility as `--apply`. This is a real cost of convenience and is recorded as such, not mitigated away.

**Risk 2 — `admin` may not be an employee.** A break-glass identity in `TI_WEB_AUTH_ADMINS` signs in with no employee record and no application roles, which exists so a deployment with broken employee data can still be repaired. That same identity can now bulk-write employee records. Audit attribution still works — through `#requireAdmin` reading the framework `userID` directly, ~~since `userID` is present~~ **which is the whole reason that guard exists**; the `userID` `#requireSessionUser` exposes is the employee ID, and it is `null` for precisely this identity (§4.1) — so every change is traceable to a named account — but the reviewer of this spec should be comfortable that mass employee writes belong to the recovery account. Choosing `SUPERVISOR` instead would have coupled the screen to correct org data, which is precisely what the recovery account exists to work without.

## 8. Testing

- **Shared whole-file check** — unit tests on the extracted function: undecodable encoding, each missing required column, a repeated column, and a clean header.
- **Handlers** — a non-`admin` session is refused 403 on both services; the payload of *both* services contains no directly identifying field (assert against a fixture with distinctive names and emails, the way the CLI's no-leak proof is written — apply returns everything preview does plus `applied`, so pinning preview alone leaves half the surface unpinned); and apply with a rejecting row ~~writes nothing~~ **writes the good rows and reports the rejected one**. The struck version contradicted §5.4, which argues at length for exactly the opposite and cites CA-107's per-row principle to get there. Left as written it would have led an implementer to build the all-or-nothing behaviour §5.4 rejects, and the contradiction is not visible from §8 alone.
- **Apply re-derives** — the decisive test. The handler takes **no plan parameter**, so a request carrying an extra `plan` field alongside a clean `csv` must apply exactly what the CSV derives and ignore the field entirely. Assert the applied counts match the CSV, not the fabricated plan — a test that merely checks the parameter is absent from the signature would pass against a handler that later starts reading `params.plan`.
- **Post-apply rebuild** — `buildOrganizationChart` is called after a successful apply. The prototype is stubbable (`Object.freeze` on the singleton does not freeze its prototype), the technique already used by the CA-107 reload test.
- **Fragment** — CSP-clean: no inline styles, no optional chaining. The existing `fragment-input-bindings` guard style applies, since this screen binds a file input.

## 9. Out of scope

`.xlsx` upload; per-row editing in the browser; scheduled sync; any change to the pipeline's validation, mapping or reconciliation rules.

## 10. Delivery

One package, `competence 3.22.0` → `3.23.0`. Sequenced so each step is independently reviewable:

1. Extract the shared whole-file check; CLI switches to it, behaviour unchanged.
2. The two service handlers, with the role gate and the no-personal-data projection.
3. The fragment and its Alpine component, including the size guard and the confirmation modal.
4. Labels (en + bg), `INSTALL.md` §11, and the release.
