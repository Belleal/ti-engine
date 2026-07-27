# Design — Competence Research-Use Consent (capture, register, export gate)

| | |
|---|---|
| **Date** | 2026-07-27 |
| **Packages** | `packages/competence` (only) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | competence `3.14.0` → `3.15.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack `CA-###` — to be created, suggested parent `E4 — Evaluation Workflow` (`area:evaluation`) |

---

## 1. Background & motivation

The competence app collects a rich per-employee appraisal dataset: self / team / manager grades against a frozen competency snapshot, written feedback, interview outcomes, and closure artefacts. Since 3.4.0 an analytics layer aggregates that data into the Insights screens and, on cycle close, into an immutable per-cycle `ResultsSnapshot`.

That analytics layer is already privacy-reduced — every cohort cell with `n < 3` is suppressed, the snapshot carries no identities and no peer-individual grades, and it is never back-fillable. But all of it runs **without ever asking the people it describes**. That is defensible for *operating the appraisal process* (legitimate interest). It is not a basis for **secondary use** — analysis and research beyond running the cycle.

This feature adds the missing consent layer: each employee is asked, once per cycle, whether their anonymized evaluation information may be used for analysis and research; the answer is recorded as a provable electronic consent; and a consent-scoped chokepoint governs every research use of that data.

### 1.1 A note on lawful basis (raised during brainstorming, unresolved by design)

Under GDPR, consent is a weak lawful basis in an employment context — the power imbalance between employer and employee makes "freely given" hard to establish (Recital 43). Consent is only meaningful here because **refusing costs the employee nothing**: both answers let them proceed identically, and refusal changes no operational behaviour.

Whether this is legally *consent* or a *transparency notice over legitimate interest* is a determination for the DPO, not for this design. It changes the **wording**, which is configurable by design. It does not change the mechanics below, which are built the same either way.

Related deliberate choices that follow from this framing are marked **[lawful-basis]** throughout.

## 2. Decisions taken during brainstorming (2026-07-27)

1. **A refusal excludes the person from research exports only.** In-app Insights, `buildCohortFrame`, and `ResultsSnapshot` continue to cover everyone — that is the operational side, running on legitimate interest. Secondary research use is consent-gated.
2. **Consent is scoped per cycle** and re-asked each cycle.
3. **Captured in the evaluation form**, as a mandatory choice before the self-evaluation can be submitted. Both answers proceed identically.
4. **v1 builds the consent register and the consent-scoped export API, not a research dataset format.** The dataset schema is deferred until an actual research use case defines it.
5. **Storage is a dedicated append-only store** (option B of three considered), not a field on the evaluation and not the audit log alone.

## 3. Goals & non-goals

**Goals**

- Ask every evaluee, once per appraisal cycle, for consent to secondary research use of their anonymized evaluation data.
- Record each answer as a **provable** electronic consent: who, when, which decision, and the **verbatim text they saw**.
- Make the consent text **configurable** and admin-editable, with a version guard.
- Allow the answer to be **changed or withdrawn at any time**, without destroying the prior record.
- Provide a **Supervisor-facing register** for later review, per cycle, with per-employee evidence.
- Provide a **single consent-scoped chokepoint** that all future research use of evaluation data must pass through, failing closed.

**Non-goals**

- **No change to the existing analytics.** `results-analytics.js`, the Insights screens, `buildCohortFrame` and `ResultsSnapshot` are untouched. No existing report changes and no existing test changes.
- **No research dataset format** in v1 (decision 4). The chokepoint returns evaluations plus a provenance stub; what a dataset looks like is a later decision.
- **No downloadable evidence bundle** in v1 — see §9.3.
- **No dashboard task** for consent — see §9.2.
- **No backfill** of consent for evaluations submitted before this ships — see §8.
- **No proxy capture.** Nobody records consent on another person's behalf (§4.1).
- **No IP address or user-agent capture** (§4.1).
- **No web-framework changes.** Everything lands in `packages/competence`.

## 4. Verified facts (the contract we build against)

Established by reading the code during brainstorming:

1. `DataManager` owns eight Redis-JSON root keys, all seeded non-destructively (`setJSON(key, {}, "$", 1)` — NX) in `initialize()` at [data-manager.js:70](../../../packages/competence/application/data-manager.js#L70). The role-grants store (`ti:competence:data:role-grants`, 3.6.0) is the precedent for a dedicated, audited, application-owned store.
2. The audit log is append-only, bucketed by `employee` / `cycle` / `activeCompetencySet` / `evaluation`, written via `appendAuditEntry` (auto-fills `entryID` + ISO `timestamp`) and read via `getAuditEntriesForEmployee` / `getAuditEntriesForEvaluation`. Its shape is a change journal (`field` / `oldValue` / `newValue`), not a state store.
3. `appendAuditEntry` **resolves optimistically when the cache is not operational** ([data-manager.js:1086](../../../packages/competence/application/data-manager.js#L1086)) — it does not reject. The role-grants writes mirror optimistically for the same reason.
4. The self-evaluation submit path is the `isEmployee` branch of `#submitEvaluation` at [competence-web-application.js:730](../../../packages/competence/bin/competence-web-application.js#L730): status check → already-completed check → deadline check → grade write → completeness validation → `selfEvaluationCompleted = true`. Business-rule failures throw `E_APP_SERVICE_ERROR` with a `details` label key and `httpCode.C_422`.
5. Config documents register in [config-registration.js](../../../packages/competence/application/config-registration.js) via `registerConfigDocument(key, { schema, validators, defaultValue, metadata })`. Once registered they are versioned, audited, validated, restorable and exportable through the framework's `/admin/config/*` API with no additional app plumbing.
6. `ValidatorContext.getConfig(name)` resolves the **currently stored** value of any document, so a semantic validator can compare an incoming save against what is live.
7. Store-backed config values holding **inline text** are live on save. Only values that are *label keys* need the export → commit → redeploy cycle. The consent statement therefore lives inline in its config document, not in `competence-labels.json`.
8. Fragments register via `addFragment(name, { title, path, components?, roles? })`; a declared `roles` requirement is enforced server-side by the web-framework `verifyAccess` gate (≥1.13.0), so a role-restricted screen is unreachable by direct URL, not merely hidden.
9. Alpine runs in **CSP mode**: no inline `style="…"`, no optional chaining (`?.`), no `Array`/`Object` in template expressions. Radio inputs bound with `x-model` are the established idiom ([frame-cycle-setup.html:377](../../../packages/competence/bin/static/fragments/frame-cycle-setup.html#L377)).
10. `EvaluationStatus` enum **values** are title-case (`"Open"`, `"In Review"`, `"Ready"`, `"Closed"`), not the uppercase keys. Front-end comparisons must use the value.
11. `results-analytics.js` reads evaluations through `buildCohortFrame(evaluations, cycleID, filter)` and suppresses cohort cells below `MIN_COHORT_SIZE = 3`. Nothing in this design calls into it.
12. `test/fragment-input-bindings.test.js` exists (added 3.11.1) to guard against form controls bound to events that are never dispatched — the bug class this feature's radios could reintroduce.

### 4.1 Two invariants that carry the legal weight

**Self-attestation only.** `decidedBy` is always the subject. The server rejects any write where `decidedBy !== employeeID` with `E_SEC_UNAUTHORIZED_ACCESS` (403). There is deliberately no administrative or proxy capture path — "someone else recorded it for them" is the single most likely challenge to an electronic consent, and the cleanest answer is that the code makes it impossible. **[lawful-basis]**

**No IP address, no user agent.** Common in e-consent tooling, but both are personal data that would then need their own justification and retention answer, and an authenticated session identity is stronger evidence than an IP anyway.

## 5. Data model

### 5.1 Store — ninth `data-manager` key

`ti:competence:data:research-consent`, seeded `{ texts: {}, decisions: {} }` in `initialize()` using the same non-destructive NX form as the other eight.

```
{
  texts: {
    "<sha256>": { locale, version, body, firstSeenAt }
  },
  decisions: {
    "<employeeID>": {
      "<cycleID>": {                      // append-only, keyed by recordID
        "<recordID>": {
          recordID,      // UUID
          decision,      // "granted" | "declined"
          decidedAt,     // ISO-8601
          decidedBy,     // always === employeeID (§4.1)
          textHash,      // SHA-256 of the exact body shown
          textVersion,   // config `version` at time of decision
          locale,        // language the body was shown in
          source,        // "evaluation-submit" | "scores-screen"
          supersedes     // recordID this replaces, or null
        }
      }
    }
  }
}
```

**The chain is a map keyed by `recordID`, not an array** — mirroring how the audit log stores its entries (`{ [entryID]: entry }`) and reads them back with `Object.values(...)` sorted by timestamp. Two reasons this matters:

1. **Appending is a single merge-patch with no read.** An array leaf would require read-modify-write, which is a real lost-update race if the same person answers from two tabs. A keyed map has no such race — `editJSON` merges the new `recordID` in and touches nothing else.
2. **It avoids an unwrap hazard.** `getJSON` returns values wrapped in an array (RedisJSON `$`-path semantics), so an array-valued leaf comes back as `[[rec, rec]]` and the codebase's standard `( result instanceof Array ) ? result[ 0 ] : result` idiom happens to work — but only by coincidence, and it silently returns the wrong thing under a different path form. An object leaf has no ambiguity.

Chronological order is recovered on read by sorting on `decidedAt`, exactly as `getAuditEntriesForEmployee` sorts on `timestamp`.

**`decision` has exactly two stored values.** "Not asked yet" is the *absence* of a chain, never a stored null — an absent chain cannot be accidentally written over a real answer, and a null one can.

**Resolution is newest-wins** by `decidedAt` over the chain.

**Writes are strictly append.** A change or withdrawal pushes a new record whose `supersedes` names the record it replaces; the original is still there to show. Nothing in the code path updates or deletes an existing record.

**Employee-first keying** (`employeeID → cycleID`) is deliberate: it makes "everything we hold about this person's consent" a single read, which is the shape a subject-access request takes. The per-cycle register reads the root map and filters — acceptable at this scale, and rare compared to rendering one person's panel.

**`texts` is a hash-keyed registry** so the verbatim wording is stored once rather than duplicated across every employee, while each decision still resolves to the exact string that person saw.

### 5.2 Typedefs

Added to [data-objects.types.js](../../../packages/competence/application/data-objects.types.js):

```js
/**
 * @typedef {"granted"|"declined"} ResearchConsentDecisionValue
 */

/**
 * @typedef {Object} ResearchConsentRecord
 * @property {string} recordID - UUID.
 * @property {ResearchConsentDecisionValue} decision
 * @property {string} decidedAt - ISO-8601 timestamp.
 * @property {string} decidedBy - Employee ID of the subject; always equal to the chain's employeeID.
 * @property {string} textHash - SHA-256 (hex) of the exact consent body shown.
 * @property {string} textVersion - The consent config `version` at the time of the decision.
 * @property {string} locale - Language the body was shown in.
 * @property {"evaluation-submit"|"scores-screen"} source
 * @property {string|null} supersedes - recordID this record replaces, or null for the first.
 */

/**
 * @typedef {Object} ResearchConsentText
 * @property {string} locale
 * @property {string} version
 * @property {string} body - The verbatim consent statement.
 * @property {string} firstSeenAt - ISO-8601 timestamp this text was first recorded against a decision.
 */
```

### 5.3 Config document

New store-backed document `research-consent`, backed by `bin/config/config.research-consent.json` and `bin/data/schemas/research-consent.schema.json`, registered in `config-registration.js` alongside the existing seven:

```json
{
  "$schema": "config.research-consent.schema.json",
  "enabled": true,
  "version": "1.0",
  "text": {
    "en": { "body": "…" },
    "bg": { "body": "…" }
  }
}
```

One field per locale — `body`, the whole statement. Panel heading, radio labels, help text and the register's column headers are chrome and live in `competence-labels.json` as usual. **The hash is over `body` alone**, so there is never an argument about what was and was not part of the statement.

Plain text only, rendered as one `<p>` per blank-line-separated block. No HTML — matching the posture the user-guide build already takes, and removing the injection surface.

Registration:

```js
app.registerConfigDocument( "research-consent", {
    schema: researchConsentSchema,
    validators: [ validators.consentTextVersionBumped ],
    defaultValue: configurationLoader.configResearchConsent,
    metadata: { path: "bin/config/config.research-consent.json", label: "consent.research", editable: true }
} );
```

**`consentTextVersionBumped`** — a semantic validator that reads `context.getConfig("research-consent")` and raises a `ValidationIssue` if any locale's `body` differs from the live one while `version` is unchanged. This stops an admin silently editing text that people have already consented to. It does not prevent the edit; it forces the version to move with it, so the historical records stay unambiguous.

**`enabled: false` is a fail-closed kill switch:** no panel, no submit gate, and the export chokepoint returns **empty** rather than everything.

Because it is a store-backed document, it is live-editable, versioned, audited, exportable and restorable through the existing `/admin/config/*` machinery with no new admin screens.

## 6. Module boundaries

Three layers, each independently testable.

### 6.1 `application/data-manager.js` — persistence only

| Method | Returns |
|---|---|
| `saveConsentDecision(employeeID, cycleID, record, text, previousDecision)` | `Promise<ResearchConsentRecord>` — merge-patch appends the record, registers `text` under its hash when not already present, and writes the audit entry using the caller-supplied `previousDecision` |
| `fetchConsentChain(employeeID, cycleID)` | `Promise<ResearchConsentRecord[]>` — sorted by `decidedAt` ascending, `[]` when absent |
| `fetchConsentDecisions(cycleID)` | `Promise<Object.<string, ResearchConsentRecord[]>>` — every employee's chain for one cycle |
| `fetchConsentText(textHash)` | `Promise<ResearchConsentText\|null>` |
| `fetchConsentHistory(employeeID)` | `Promise<Object.<string, ResearchConsentRecord[]>>` — all cycles, for subject-access requests |

It appends and reads. It resolves nothing and decides nothing — `previousDecision` is passed in by the service layer (which owns `resolveEffective`) rather than derived here, so the "newest wins" rule lives in exactly one place.

**Divergence from the role-grants precedent:** when `cache.instance.isOperational` is false, `saveConsentDecision` **rejects** with `E_APP_SERVICE_ERROR` raised explicitly with `httpCode.C_500`, rather than resolving optimistically. A consent record you cannot prove is worse than a visible failure. This is a conscious departure from §4 fact 3 and must not be "fixed" for consistency.

### 6.2 `application/research-consent.js` — new pure frozen-singleton

Modelled on [task-resolver.js](../../../packages/competence/application/task-resolver.js): no Redis, no I/O, dependencies injected, exports a single frozen `instance`.

| Method | Purpose |
|---|---|
| `hashText(body)` | SHA-256 hex of the exact string (`node:crypto`) |
| `buildDecisionRecord(input)` | Validates and constructs a `ResearchConsentRecord` + its `ResearchConsentText`; throws on an unknown decision value or on `decidedBy !== employeeID` |
| `requireDecision(rawValue, enabled)` | The submit gate's decision logic, extracted so it is testable without the web application: returns `null` when `enabled` is false, the normalized decision when valid, and throws the §10 exception otherwise |
| `resolveEffective(chain)` | Newest record by `decidedAt`, or `null` for an empty chain |
| `isConsented(chain)` | `true` only when the effective record is `granted`; `false` for empty, `declined`, or anything unrecognized |
| `buildConsentRegister(employeeIDs, chains)` | Register rows + `{ granted, declined, notAsked }` counts |
| `filterConsentedEvaluations(evaluations, chains, options)` | **The chokepoint** — see §7.3 |

### 6.3 `bin/competence-web-application.js` — HTTP surface

| Service | Access |
|---|---|
| `get-research-consent` | Self only — own effective decision for the active cycle + the active text in the caller's locale |
| `submit-research-consent` | Self only — record or change a decision |
| `get-consent-register` | `SUPERVISOR` — per-cycle counts and per-employee rows |
| `get-consent-evidence` | `SUPERVISOR`, or the employee for themselves — full chain with verbatim texts resolved |

Register and evidence are **`SUPERVISOR`, not `admin`**. `admin` is a config-management role; `isAccessAllowed` has no implicit hierarchy; and this is per-person personal data, not configuration.

## 7. Behaviour

### 7.1 The submit gate

In the `isEmployee` branch of `#submitEvaluation`, after the deadline check and before the grade write:

1. If `enabled` is false → skip the gate entirely.
2. If `evaluation.researchConsent` is absent or not one of `granted` / `declined` → throw `E_APP_SERVICE_ERROR`, `details: "error.consent.decision-required"` (or `"error.consent.invalid-decision"`), `httpCode.C_422`.
3. Otherwise record the decision **before** the evaluation is persisted.

**Ordering rationale.** Consent-first means a submit that then fails on incomplete grades leaves a valid consent record and no evaluation change — harmless, because the consent is per-cycle and true regardless of whether that submit succeeded. The reverse ordering can leave a submitted evaluation with no consent record, which is the state that cannot be defended.

**Idempotency.** A write whose decision *and* `textHash` both match the current effective record is a no-op. This is what makes consent-first safe against retries: a user who fixes their grades and resubmits does not accumulate duplicate records.

### 7.2 Changing or withdrawing

The Scores screen (`my-results`) carries the same panel in editable mode for the subject. It is available **at any evaluation status, including `CLOSED`** — withdrawal cannot be conditional on workflow state. **[lawful-basis]**

A change appends a new record with `supersedes` set and `source: "scores-screen"`.

Because the chokepoint resolves consent **at the time it runs**, a withdrawal genuinely takes effect for every subsequent research use. It cannot retroactively affect an export already produced; that is what the `basis` manifest in §7.3 exists to document.

### 7.3 The chokepoint

```js
researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID, enabled } )
  → {
      included,          // Evaluation[] — consenting subjects only
      consentedCount,
      excludedCount,
      basis: { cycleID, resolvedAt, textHashes }
    }
```

Fail-closed throughout:

| Condition | Result |
|---|---|
| `enabled === false` | `included: []` |
| No chain for the employee | excluded |
| Effective record is `declined` | excluded |
| Effective record is `granted` | included |
| Anything unrecognized | excluded |

`basis` is the provenance stub a future export writes as its manifest — the cycle, the resolution moment, and the set of consent-text hashes the included population agreed to. Returning it now means the dataset format can be added later without reopening consent logic.

**This function is the only sanctioned path from evaluation data to research use.** Nothing else in v1 calls it; its existence is what makes the consent decision consequential and what a future export must go through.

### 7.4 Audit

Every decision also writes:

```js
appendAuditEntry( {
    subjectType: "employee",
    subjectID: employeeID,
    changedBy: employeeID,
    field: `researchConsent.${ cycleID }`,
    oldValue: <prior decision or null>,
    newValue: <decision>
} );
```

Existing `employees` bucket, visible through `getAuditEntriesForEmployee`, no new plumbing. The store is the register; the audit entry is the independent cross-check.

## 8. Migration

**No backfill.** Anyone who already submitted a self-evaluation before this ships simply has no chain, which reads as not-consented, and nothing is inferred on their behalf. They can opt in afterwards from the Scores screen at any time. **[lawful-basis]**

The store seeds NX, so deploying against an existing Redis is non-destructive.

## 9. UI

### 9.1 Consent panel — evaluation form

In [frame-competence-evaluation.html](../../../packages/competence/bin/static/fragments/frame-competence-evaluation.html), rendered only when **all** of: the viewer is the evaluee, `status === "Open"` (the value, not the `OPEN` key — §4 fact 10), `selfEvaluationCompleted` is false, and `enabled` is true.

A `.ti-panel` with `.ti-panel-head` + `.ti-panel-body-intro`, the statement rendered as paragraphs, and a `<fieldset>`/`<legend>` holding two `x-model`-bound radios. `aria-describedby` on the fieldset points at the statement block so the text is programmatically associated with the choice. `.ti-form-error` carries the required-decision message.

**Neither option is pre-selected, and both carry identical visual weight** — no default, no "recommended" affordance, no difference in button prominence. A pre-ticked "yes" is not consent (Recital 32), and a visually louder "yes" is the first thing a reviewer would pick at. **[lawful-basis]**

A client-side check mirrors the server's 422 so nobody loses a screen of grades to a round-trip.

### 9.2 Consent panel — Scores

The same fragment in results-only mode. Hidden entirely when a manager or supervisor is viewing someone else's scores. For the subject: the current decision as `.ti-kv-label` / `.ti-kv-value` with the decision date and the text version agreed to, plus a *change* affordance that reveals the radios.

**No dashboard task.** The mandatory gate makes one redundant — nobody can submit without answering. The only population a nudge would serve is people who submitted before this shipped, which is a one-off migration concern, not a permanent feature.

### 9.3 Supervisor register

New `bin/static/fragments/frame-consent-register.html`, registered as `consent-register` with `roles: [ SUPERVISOR ]` so the framework fragment gate blocks direct-URL access, plus a matching sidebar entry hidden for other roles.

- Cycle selector.
- Three counts: granted / declined / not asked.
- A `.ti-data-grid` of employee · decision · decision date · text version.
- Row-level evidence view: the verbatim text that person saw, plus the full chain including superseded records.

**The downloadable evidence bundle is deferred.** On-screen review plus the per-employee evidence view covers "reviewed"; a file is better for "proven", but a file full of per-person consent records is itself a personal-data export that needs a retention and handling answer from the DPO before it exists. Straightforward to add once that is settled.

### 9.4 Labels

New `consent` section in `competence-labels.json`, `en` + `bg`, bg pending native review as usual.

## 10. Error handling

| Detail key | Exception | HTTP |
|---|---|---|
| `error.consent.decision-required` | `E_APP_SERVICE_ERROR` | 422 |
| `error.consent.invalid-decision` | `E_APP_SERVICE_ERROR` | 422 |
| `error.consent.not-self` | `E_SEC_UNAUTHORIZED_ACCESS` | 403 |
| `error.consent.no-active-cycle` | `E_APP_SERVICE_ERROR` | 422 |
| `error.consent.disabled` | `E_APP_SERVICE_ERROR` | 422 |
| `error.consent.storage-unavailable` | `E_APP_SERVICE_ERROR` | 500 |

Every row is raised with an **explicit** `httpCode`. This matters for the last one: `resolveHttpCode` maps `E_APP_*` to 422 by default, and a storage failure is a server fault, not a rejected request — so it must pass `exceptions.httpCode.C_500` rather than rely on the default. It is the non-operational-cache rejection from §6.1, the deliberate divergence from the optimistic-resolve pattern.

## 11. Testing

Node's built-in `node --test`, per package convention.

**`test/research-consent.test.js`** — the pure module:
- `hashText` is stable across calls and sensitive to whitespace changes
- `resolveEffective` returns the newest record by `decidedAt`, and `null` for an empty chain
- `isConsented` is fail-closed: `false` for empty, `declined`, and unrecognized values
- `buildDecisionRecord` throws on an unknown decision value
- `buildDecisionRecord` throws when `decidedBy !== employeeID` (§4.1)
- `supersedes` chains correctly across a grant → withdraw → re-grant sequence
- `buildConsentRegister` counts granted / declined / not-asked, including employees with no chain

**`test/research-consent.filter.test.js`** — the chokepoint:
- `enabled: false` yields `included: []` even when everyone consented
- an employee with no chain is excluded
- a `declined` effective record is excluded even when an earlier `granted` exists in the chain
- a `granted` effective record is included even when an earlier `declined` exists
- `basis.textHashes` covers only the included population

**`test/data-manager.research-consent.test.js`** — persistence:
- a second write appends rather than overwriting
- an identical decision + `textHash` is a no-op
- the text registry deduplicates by hash and preserves `firstSeenAt`
- NX seeding does not clobber an existing store
- a non-operational cache **rejects** rather than resolving

**`test/research-consent.gate.test.js`** — the submit gate, exercised through the pure `requireDecision` (§6.2) so no web-application harness is needed:
- rejects with `error.consent.decision-required` / 422 when no decision is supplied
- returns the normalized decision for either valid value
- returns `null` (gate skipped) when `enabled` is false
- rejects with `error.consent.invalid-decision` / 422 for an unrecognized value

The ordering guarantee from §7.1 — consent settling before the evaluation persists — is **not** unit-tested. It lives in `#submitEvaluation`, a private method on the web application, and the package has no HTTP-level test harness; standing one up for this single assertion is not worth the fixture weight. It is instead enforced structurally (the consent promise is chained ahead of `saveEvaluation` in the one place all three submit branches converge) and confirmed in the browser verification step. If a web-application harness is ever introduced, this is the first case to add.

**Extend `test/fragment-input-bindings.test.js`** — the new radios bind a real, dispatched event, guarding the exact 3.11.1 silent-drop bug class.

**CSP guards** on the new fragments, in line with the existing suites: no inline `style=`, no `?.`.

**`npm run test:json`** — the new schema validates the new config file.

## 12. Delivery

- competence `3.14.0` → `3.15.0` (`feat`), with a `CHANGELOG.md` entry.
- This spec is the design record; following the 3.14.0 / CA-92 precedent there is no separate `design/*.md` for the feature.
- A `CA-###` card created under its epic (suggested: `E4 — Evaluation Workflow`), referenced in every commit so the GitHub integration links commit ↔ issue, with time logged against it.
- Commits bundled thematically — roughly: store + typedefs; pure module; config document + schema + validator; services + submit gate; UI fragments + labels; tests; release bump.

## 13. Follow-ups (explicitly out of scope)

1. **Research dataset format + export producer** — the thing the chokepoint feeds. Needs a research use case to define its schema.
2. **Downloadable evidence bundle** for the register (§9.3) — needs a DPO answer on retention and handling.
3. **DPO review of the consent wording and lawful basis** (§1.1) — the text is configurable precisely so this can land without code changes.
4. **Subject-access export** of one person's full consent history across cycles — `fetchConsentHistory` exists for it; no UI in v1.
5. **Retention policy** for consent records after an employee leaves — currently they persist indefinitely alongside the rest of the appraisal data.
