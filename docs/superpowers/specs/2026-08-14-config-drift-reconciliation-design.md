# Design — Config drift detection & admin-applied reconciliation

| | |
|---|---|
| **Date** | 2026-08-14 |
| **Packages** | `packages/web-framework` (the mechanism), `packages/competence` (reporting, UI, cycle-setup warning) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | web-framework `1.23.0` → `1.24.0` (minor); competence `3.19.1` → `3.20.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-103`](https://belleal.youtrack.cloud/issue/CA-103) (subtask of `CA-9` Configuration Admin) |

---

## 1. Background & motivation

The admin config subsystem (web-framework 1.4.0 onward, CA-9) made competence's configuration documents **store-backed**: an application registers each document at startup with a schema, semantic validators and a file default; the store seeds itself from that default, serves the live value, versions every change, and hot-reloads consumers through `config:changed`.

The seeding step is deliberately one-way:

- [`config-store.js:65`](../../../packages/web-framework/components/config-store.js) — `seedIfEmpty` writes the default **only when the document has never been written**. Otherwise it returns what is already stored.
- [`configuration-loader.js:283`](../../../packages/competence/application/configuration-loader.js) — `initialize()` does `seedDefault` → `getCurrent` → `applyStoreValue`, so the **stored value overwrites the file value** in the exported config objects on every boot.

Together these mean a file default is consulted exactly once in a deployment's lifetime. Every subsequent release that changes a config file changes nothing an existing deployment can see.

### 1.1 How this surfaced

CA-98 added the QE role-family competencies (commit `19c4786`, shipped as competence 3.17.0): the dictionary grew from 108 to 134 competencies, the QE pool from 30 to 57 codes, and the QE `2026-H2` baseline from empty to 22 codes. All three files are correct, and `npm run test:json` passes.

On a deployment whose Redis was seeded before that commit, none of it is visible. The Cycle Setup screen builds its picker from `competenciesByCode` and `poolByFamily` ([`competence-web-application.js:2885`](../../../packages/competence/bin/competence-web-application.js)), both sourced from the exported config objects — which have been overwritten with the pre-CA-98 store values. The picker cannot show competencies the store does not have.

There is no in-app remedy. Admin **restore** replays a *previous version* from history, and the store was seeded at version 1 with the old content, so no stored version anywhere contains the new competencies. The only fix available today is deleting `ti:config:cur:*` and `ti:config:hist:*` keys in Redis by hand — which also discards every admin edit and the entire audit history.

### 1.2 Second-order: stale family exclusions

[`data-manager.js:1523-1529`](../../../packages/competence/application/data-manager.js) derives `cycle.excludedFamilies` **once, at seed time**, as "every family with no codes for this cycle". Before CA-98 that set was `[QE, XD, DA, IO, MC, PD]`. It is cycle *data*, never re-derived, so a family that later gains competencies stays excluded on existing cycle records — with its specializations hidden in the tree and an "excluded" banner in the panel.

So even a fully reconciled config leaves QE invisible in an existing cycle until a Supervisor toggles it back in. Half a fix is worse than none here, because the remaining half is silent.

The 3.17.0 changelog records that "the seeded cycle derives `excludedFamilies` from which families have competencies, so QE is now automatically included in that cycle". That is true — and true **only of a cycle seeded after the change**. On any deployment whose cycle record predates it, the derivation has already run and its result is frozen. The claim reads as a general statement and holds only for fresh installs, which is precisely the class of mistake this whole spec is about.

## 2. Decisions taken during brainstorming (2026-08-14)

1. **Detect and report; an admin applies.** Startup compares every registered default against the store and reports drift, but changes nothing. Rejected: auto-applying on a content-version bump (silently discards admin edits), auto-applying for `editable: false` documents only (split behaviour, harder to audit), and additive merge (per-shape semantics, deletions never propagate, result matches neither side).
2. **The apply unit is the whole document,** previewed as a structural diff. Rejected: raw JSON side-by-side (a 134-entry dictionary is unreadable, so review becomes a rubber stamp) and per-entry cherry-pick (reintroduces the merge semantics decision 1 avoided).
3. **The stale-exclusion issue is in scope,** handled the same way: Cycle Setup flags it, the Supervisor acts. The derivation itself is not changed — inclusion is a governance decision, not something to recompute behind a Supervisor's back.
4. **The mechanism lives in web-framework.** "Compare a registered default against its stored value" knows nothing about competencies.

## 3. Goals & non-goals

**Goals**

- Make a config file change in a release **visible** on an already-seeded deployment, without shell access to Redis.
- Give an admin a **legible** preview of what applying would change, sufficient to recognise a destructive apply before confirming it.
- Route every application through the existing validated, versioned, audited write path, so it is reversible by the restore machinery that already exists.
- Never clobber an admin edit without a human seeing the diff first.
- Close the QE case end to end, including the stale family exclusion.

**Non-goals**

- Per-entry selective apply.
- Any automatic application of a file default.
- Diffing configuration that is not a registered document.
- Changing the `excludedFamilies` derivation.
- Cross-document atomicity beyond what `saveChangeSet` already provides (its pre-write lock check; a Lua/MULTI write remains deferred, as documented on `ConfigStore`).

## 4. Architecture

### 4.1 The pure diff engine — `components/config-drift.js` (new, web-framework)

No I/O, no cache access, no logger. Unit-testable in isolation, in the same spirit as the `ti-charts` layout helpers and `authorization.isAccessAllowed`.

```js
diffDocument( fileDefault, storedValue ) → { status, entries, counts }
```

| Field | Meaning |
|---|---|
| `status` | `in-sync` · `drifted` · `absent` · `no-default` — derived from the two arguments alone: a `fileDefault` of `undefined` gives `no-default`, a `storedValue` of `null`/`undefined` gives `absent` (never seeded), otherwise `in-sync` or `drifted` by the entries found |
| `entries` | `[ { path, kind } ]` where `kind` is `added` · `removed` · `changed` |
| `counts` | `{ added, removed, changed }` |

Paths use the dot/bracket convention `instancePathToDataPath` already produces for schema issues ([`config-registry.js:21`](../../../packages/web-framework/components/config-registry.js)), so the whole config subsystem speaks one path dialect.

**Traversal rules.** These are what make the preview legible rather than noise:

| Shape | Treatment | Rationale |
|---|---|---|
| Plain object | Recurse | Reaches `.competencies.E1-48`, not "competencies changed" |
| Array of primitives | Set diff — report added/removed members | Yields `QE +27 codes`, the single most informative line in the QE case |
| Array of objects | Atomic compare (`changed`) | Element-wise diffing of unkeyed objects produces unreadable churn |
| Scalar | Compare | — |

Against the real CA-98 change this produces (counts verified against the commit):

```text
role-family-competencies   8 changed   .QE +27 codes · .SE +1 · .PM +1 ·
                                       .XD .DA .IO .MC .PD +1 each (E1-10) · BA unchanged
competencies              26 added     .competencies.E1-48 … .competencies.I1-10
active-competency-sets     1 changed   .QE.baseline.2026-H2 +22 codes
competence-labels          added       label entries for the new competencies
```

The `role-family-competencies` line is the one that repays the set-diff rule: without it the entry would read "8 families changed" and an admin would have no way to tell a 27-code addition from a deletion.

### 4.2 `ConfigService` additions

```js
getDrift( configKey )              → { configKey, status, storedVersion, editable, label, counts, entries }
listDrift()                        → summaries (counts, no entries) for every registered document
applyDefaults( configKeys, meta )  → delegates to applyEdits()
```

`getDrift` reads `registry.getDefault(key)`, `registry.metadataFor(key)` (for `label` and `editable`) and `store.getCurrent(key)`. `listDrift` iterates `registry.list()` — an in-memory map, so no key scan.

`applyDefaults` builds `{ configKey, value: registry.getDefault(key), expectedVersion: <current version> }` per key and hands the batch to the existing `applyEdits`. Everything else comes for free: ajv + semantic validation, change-set correlation, per-document history snapshots, optimistic locking, the audit feed, and the `config:changed` publish that makes consumers hot-reload. No new write path is introduced.

**Interdependent documents must apply as one change-set.** Applying `active-competency-sets` alone would fail the `activeSetsWithinPool` validator, because the new QE codes are not in the old 30-code pool. `applyEdits` resolves siblings at their *pending* value through the validator context's `getConfig`, so applying `competencies` + `role-family-competencies` + `active-competency-sets` together validates correctly. This is not a convenience — it is the only way the QE case passes validation at all. The UI therefore preselects every drifted document that has never been touched since it was seeded (`storedVersion === 1`) — an admin's own edit is indistinguishable from a release change by content alone, so `storedVersion` is the signal used to avoid making a destructive revert of that edit the one-click default — and a partial selection that fails reports per-document errors rather than half-applying.

**Validation on apply is load-bearing, not ceremony.** `research-consent` carries the `consentTextVersionBumped` guard: a release that changed the statement body without moving its version would be *rejected* on apply. That is the correct outcome, and it only works because apply goes through the same validation pipeline as a hand edit.

**A note on `competence-labels`, which is a special case twice over.** It is registered as a document ([`config-registration.js:54`](../../../packages/competence/application/config-registration.js)) but is deliberately absent from `STORE_BACKED`, with two consequences:

1. The running app reads labels from file, so drift there is harmless at runtime. It still matters, because a stale stored value means the **export bundle** carries stale labels — reconciling keeps export fidelity.
2. `initialize()` never seeds it. It is first written only when a composite editor saves (every one of them spans `competence-labels`). So on a fresh deployment, and on any deployment where no competency text has ever been edited, its status is legitimately `absent` rather than `drifted`.

That second point is why `absent` must be a distinct status rather than folded into `drifted`: treating "never seeded" as drift would flag `competence-labels` on every boot of a clean install and train operators to ignore the warning. Applying an `absent` document is still valid and simply seeds it — `applyEdits` with `expectedVersion: 0` creates the document.

### 4.3 Hardening the file-default source

Drift detection depends entirely on `registry.getDefault(key)` returning the **file** default rather than the store value. Today it does, but only by ordering coincidence:

- `registerCompetenceConfig` runs in the `CompetenceWebApplication` **constructor** ([`competence-web-application.js:65`](../../../packages/competence/bin/competence-web-application.js)), during `super.onStart()`.
- `configurationLoader.initialize()` runs after, at [`competence-web-server.js:55`](../../../packages/competence/bin/competence-web-server.js).
- `applyStoreValue` *reassigns* `module.exports.configX` rather than mutating it, so the reference captured at registration still points at the original frozen file-default object.

If a future consumer ever registered after initializing, drift would compare the store against itself and report `in-sync` forever. That is a **silent false negative** — the worst possible failure for a feature whose entire job is noticing a difference.

`configuration-loader.js` already captures a private `fileDefaults` map at module load ([line 252](../../../packages/competence/application/configuration-loader.js)), genuinely immune to ordering. Export it, and have `config-registration.js` pass `fileDefaults[configKey]` as `defaultValue` instead of the live export. Order-independent, self-documenting, and pinned by the test in §7.

## 5. Surfaces

### 5.1 Startup reporting

After seeding and loading, `configurationLoader.initialize()` calls `listDrift()` and logs one line per non-`in-sync` document with its counts. This is the half of the feature that needs no UI and no human present — it makes the condition visible in container logs on a Cloud Run deploy where nobody is watching an admin screen.

**Severity distinguishes the two conditions.** `drifted` logs at **WARNING**: a release changed something this deployment is not serving, and someone should act. `absent` logs at **INFO**: nothing is wrong, the document has simply never been written (the normal state of `competence-labels` on a clean install — see §4.2). Logging both at WARNING would make a clean install look broken and teach operators to ignore the message, which costs exactly the signal this feature exists to provide.

Drift computation failure (cache unavailable) logs at WARNING and continues. Drift reporting is diagnostics; it must never gate boot.

The framework computes; competence decides when to report. Another consumer that wants startup reporting calls `listDrift()` itself.

### 5.2 Admin HTTP API

Three routes beside the existing seven in [`web-server.js:579`](../../../packages/web-framework/bin/web-server.js), all behind `requireAdmin`, with handlers in `admin-config-handlers.js` following the established `(service) => (request, response, next)` curry:

```text
GET  /admin/config/drift                 → listDrift()
GET  /admin/config/drift/:configKey      → getDrift( configKey )
POST /admin/config/drift/apply           → applyDefaults( body.configKeys, { adminID, note: body.note } )
```

The POST is state-changing and so already carries the framework's CSRF and origin/referer validation.

### 5.3 Admin UI (competence)

A **Configuration drift** panel on the admin-config landing screen, alongside the existing export and change-feed/restore panels: one row per document with label, status badge, `+N / −N / ~N` counts, an expandable path list, and a checkbox; a shared note field and an Apply button beneath.

Documents with status `drifted` **and** `storedVersion === 1` (never touched since seeding) are **preselected**, for the interdependency reason in §4.2. A drifted document with a higher `storedVersion` has been written to since — by an admin, and that edit is indistinguishable from a release change by content alone — so it is listed but left unticked, with a marker noting it carries local changes, rather than defaulting to a destructive revert of that edit. Documents with status `absent` are also listed but **not** preselected — seeding one is valid but is not what the admin came to do, and silently folding `competence-labels` into an unrelated apply would be a surprise. The empty state reads *"All configuration documents match their file defaults."* — the normal case, and it should look calm rather than alarming.

Built from the framework primitives: `.ti-panel-head*`, `.ti-panel-body-intro`, `.ti-data-grid*`, `.ti-tag`, `.ti-form*`. Alpine CSP rules apply — no inline `style` attributes, no optional chaining in template expressions.

### 5.4 Cycle Setup stale exclusion (competence)

`#loadCycleSetup` already returns both `excludedFamilies` and `sets`, so the derived flag costs one pass: a family that is **excluded** *and* has ≥1 resolved code for this cycle is a stale exclusion.

The existing excluded-family banner in `frame-cycle-setup.html` gains a line — *"This family now has competencies configured for this cycle"* — next to the include toggle that already exists. Shown only while the cycle is in `PLANNING`, since the toggle is read-only otherwise.

## 6. Error handling

| Condition | Behaviour |
|---|---|
| Unregistered `configKey` | `E_WEB_INVALID_REQUEST_PARAMETERS` (the existing registry pattern) |
| Document has no registered default | `status: no-default`; refused on apply, never applyable |
| Schema or semantic validation fails on apply | `{ ok: false, errors }` per document; **nothing is written** |
| Version conflict between preview and apply | The existing `version-conflict` error; the UI tells the admin to re-read before applying |
| Cache unavailable | `getDrift` rejects rather than reporting `in-sync` — fail closed, matching the codebase's stated principle |
| Drift computation fails at startup | Logged at WARNING; boot continues |

## 7. Testing

**web-framework**

`test/config-drift.test.js` (pure): identical values → `in-sync`; added / removed / changed keys; nested recursion produces leaf paths; primitive arrays set-diffed; object arrays atomic; `absent` and `no-default` statuses; path format matches the dot/bracket convention.

`test/config-service.drift.test.js`: `getDrift` / `listDrift` over a fake store and registry; `applyDefaults` commits through `applyEdits` and publishes `config:changed`; **interdependent documents in one change-set pass cross-document validation** (the QE pool/sets case); `no-default` refused; version conflict surfaces; validation failure returns `{ ok: false, errors }` and writes nothing.

`test/admin-config-handlers.test.js` extended for the three routes.

**competence**

The **ordering guard** is the most valuable test in the set: assert that `registry.getDefault(key)` returns the *file* default and not the store value, after a full register-then-initialize sequence. This is the one failure mode that would be silent.

Alongside it, an **end-to-end characterization of the actual bug**: seed a store with pre-CA-98 defaults, register post-CA-98 defaults, assert drift is detected with the expected counts, apply, then assert the resolved QE competency set is non-empty. This proves the original symptom is fixed, not merely that a differ works.

Plus a cycle-setup stale-exclusion derivation test.

## 8. Versioning & delivery

| Package | Bump | Notes |
|---|---|---|
| web-framework | 1.23.0 → **1.24.0** | New capability, backward compatible; publishes to npm on merge to master |
| competence | 3.19.1 → **3.20.0** | New capability |

Competence depends on `@ti-engine/web-framework` as `"*"` (npm workspace), so there is no dependency range to bump. State the real floor — **requires web-framework ≥ 1.24.0** — in the competence changelog prose, which is the convention the 3.18.0 entry already follows for the ≥ 1.21.0 profile/about dependency.

Both get `CHANGELOG.md` sections. A version bump plus its changelog section is the entire release ritual for web-framework.

**Docs.** `INSTALL.md` gains an upgrade-step note — after deploying a new image, check the drift panel — since this is precisely the sys-admin's problem. The administrator user-guide chapter gains a mention of the panel, which requires `npm run build:guide` and committing the regenerated fragments, or `test/user-guide-build.test.js` fails.

**Commits.** Roughly four thematic Conventional Commits, not one per micro-step:

1. `feat(web-framework)` — pure `config-drift` module + tests
2. `feat(web-framework)` — `ConfigService` drift methods, admin API, version bump + changelog
3. `feat(competence)` — file-default hardening, startup reporting, admin UI
4. `feat(competence)` — cycle-setup stale exclusion warning, version bump + changelog, docs

All referencing `CA-103`.

## 9. Out of scope

Per-entry cherry-pick; automatic application of any kind; diffing unregistered configuration; changing the `excludedFamilies` derivation; cross-document write atomicity beyond the existing pre-write lock check.
