# Research-Use Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask each employee, once per appraisal cycle, whether their anonymized evaluation data may be used for analysis and research; record the answer as a provable electronic consent; and gate all future research use behind a fail-closed chokepoint.

**Architecture:** A new store-backed config document holds the configurable consent statement. A ninth `DataManager` Redis-JSON key holds append-only consent records keyed by `recordID`, each carrying the SHA-256 hash of the verbatim text the person saw. A new pure frozen-singleton (`application/research-consent.js`) owns every decision rule — hashing, record construction, newest-wins resolution, the submit-gate check, the register, and the export filter — so it unit-tests without Redis. The web application exposes four services and one gate inside the existing self-evaluation submit path. Nothing in `results-analytics.js` changes.

**Tech Stack:** Node.js ≥20 (CommonJS), Redis JSON via `@ti-engine/core/cache`, `node:crypto` for SHA-256, `node:test` + `node:assert/strict`, HTMX + Alpine.js (CSP build) for UI.

**Spec:** `docs/superpowers/specs/2026-07-27-competence-research-consent-design.md`

## Global Constraints

- **CommonJS only** — `require()` / `module.exports`. No ESM.
- **Internal imports use the `#alias` map** in `packages/competence/package.json` (`imports`), never relative paths across directories. Cross-package imports use the `exports` map (`@ti-engine/core/cache`, `@ti-engine/core/exceptions`, `@ti-engine/core/tools`, `@ti-engine/core/logger`).
- **Alpine runs in CSP mode:** no inline `style="…"` attributes in fragments, no optional chaining (`?.`) in Alpine expressions, no `Array`/`Object` globals inside template expressions.
- **`EvaluationStatus` enum values are title-case** — compare against `"Open"`, not `"OPEN"`. `CycleStatus` values are uppercase (`"ACTIVE"`).
- **Config objects are `deepFreeze`d** — never mutate `configurationLoader.config*` in place.
- **Every user-visible string is a label** in `bin/localization/competence-labels.json` with `{ "en": …, "bg": … }` leaves. Bulgarian is machine-drafted and marked pending native review, consistent with the rest of the file.
- **Tests are `node --test`** — `const { describe, it, beforeEach } = require( "node:test" )`, `const assert = require( "node:assert/strict" )`. No external test framework.
- **Commits are Conventional Commits scoped to the package** — `feat(competence): …`, `test(competence): …`, `build(release): …` — each referencing the YouTrack card as `(CA-###)`.
- **Never commit `.run/*.run.xml`** — they carry live local credentials.
- **Version target:** competence `3.14.0` → `3.15.0`.
- **Two invariants that must not be relaxed:** consent is self-attested only (`decidedBy` must equal `employeeID`; no proxy path exists), and no IP address or user-agent is ever captured.

Replace `CA-###` in every commit message with the real card number before committing.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `packages/competence/application/research-consent.js` | Pure frozen-singleton: all consent decision logic. No I/O. |
| `packages/competence/bin/config/config.research-consent.json` | The configurable consent statement (bootstrap default). |
| `packages/competence/bin/data/schemas/research-consent.schema.json` | JSON Schema for the above. |
| `packages/competence/bin/static/fragments/frame-consent-register.html` | Supervisor register screen. |
| `packages/competence/test/research-consent.test.js` | Core primitives. |
| `packages/competence/test/research-consent.filter.test.js` | Register + export chokepoint. |
| `packages/competence/test/research-consent.gate.test.js` | Submit-gate decision logic. |
| `packages/competence/test/research-consent.config.test.js` | Version-bump validator. |
| `packages/competence/test/data-manager.research-consent.test.js` | Persistence. |

**Modified:**

| Path | Change |
|---|---|
| `packages/competence/package.json` | `#config-research-consent` + `#research-consent` alias entries; version bump. |
| `packages/competence/application/configuration-loader.js` | Export `configResearchConsent`; add to `STORE_BACKED`. |
| `packages/competence/application/config-validators.js` | Add `consentTextVersionBumped`. |
| `packages/competence/application/config-registration.js` | Register the `research-consent` document. |
| `packages/competence/application/data-manager.js` | Ninth cache key, seeding, five accessors. |
| `packages/competence/application/data-objects.types.js` | Three new typedefs. |
| `packages/competence/bin/competence-web-application.js` | Four services, the submit gate, one fragment registration. |
| `packages/competence/bin/static/fragments/frame-competence-evaluation.html` | Consent panel (form mode + results mode). |
| `packages/competence/bin/static/fragments/components/component-sidebar.html` | Register nav entry. |
| `packages/competence/bin/static/scripts/competence-user-interface.js` | Consent state in `competenceEvaluation`; new `competenceConsentRegister` component. |
| `packages/competence/bin/localization/competence-labels.json` | `interface.consent` + `error.consent` sections. |
| `packages/competence/test/json-config-validation.test.js` | One validation case. |
| `packages/competence/test/fragment-input-bindings.test.js` | Guard the new radios. |
| `packages/competence/CHANGELOG.md` | 3.15.0 entry. |

---

## Task 1: Consent config document and version guard

**Files:**
- Create: `packages/competence/bin/config/config.research-consent.json`
- Create: `packages/competence/bin/data/schemas/research-consent.schema.json`
- Create: `packages/competence/test/research-consent.config.test.js`
- Modify: `packages/competence/package.json` (`imports` map)
- Modify: `packages/competence/application/configuration-loader.js`
- Modify: `packages/competence/application/config-validators.js`
- Modify: `packages/competence/application/config-registration.js`
- Modify: `packages/competence/test/json-config-validation.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `configurationLoader.configResearchConsent` → `{ enabled: boolean, version: string, text: { [locale]: { body: string } } }`, `deepFreeze`d, store-backed under config key `"research-consent"`.
  - `validators.consentTextVersionBumped( value, context ) → Promise<ValidationIssue[]>`.

- [ ] **Step 1: Write the failing validator test**

Create `packages/competence/test/research-consent.config.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

/**
 * Builds a ValidatorContext whose getConfig returns the supplied stored document for the "research-consent" key.
 */
function contextWith( stored ) {
    return {
        getConfig: ( key ) => Promise.resolve( key === "research-consent" ? stored : null )
    };
}

describe( "consentTextVersionBumped validator", () => {

    it( "accepts an unchanged document", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const issues = await validators.consentTextVersionBumped( stored, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

    it( "accepts a text change when the version is bumped", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const incoming = { enabled: true, version: "1.1", text: { en: { body: "Statement B" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

    it( "rejects a text change that leaves the version untouched", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "Statement B" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "consent-version" );
        assert.equal( issues[ 0 ].path, ".text.en.body" );
    } );

    it( "rejects removing a locale without bumping the version", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" }, bg: { body: "Б" } } };
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].path, ".text.bg" );
    } );

    it( "accepts any version when nothing is stored yet (first seed)", async () => {
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( null ) );
        assert.deepEqual( issues, [] );
    } );

    it( "allows toggling `enabled` without a version bump", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const incoming = { enabled: false, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `packages/competence`:

```bash
node --test test/research-consent.config.test.js
```

Expected: FAIL — `validators.consentTextVersionBumped is not a function`.

- [ ] **Step 3: Add the validator**

In `packages/competence/application/config-validators.js`, add this function immediately before the `fetchEmployeesForValidation` helper near the bottom of the file:

```js
/**
 * research-consent: the consent statement must never change silently. Because every stored consent record references
 * the `version` in force when it was given, editing a `body` without bumping `version` would make the historical
 * records ambiguous — two different texts sharing one version string. This does not block the edit; it forces the
 * version to move with it.
 *
 * @method
 * @param {Object} value - The pending research-consent document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function consentTextVersionBumped( value, context ) {
    return context.getConfig( "research-consent" ).then( ( storedConfig ) => {
        const issues = [];
        const stored = storedConfig || {};
        // Nothing stored yet (first seed): there is no prior text to contradict, so any version is acceptable.
        if ( !stored.version ) {
            return issues;
        }
        const incomingVersion = ( value && value.version ) || "";
        // The version moved — the admin has acknowledged the change, so any text edit is fine.
        if ( incomingVersion !== stored.version ) {
            return issues;
        }
        const incomingText = ( value && value.text ) || {};
        const storedText = stored.text || {};
        for ( const [ locale, entry ] of Object.entries( incomingText ) ) {
            const incomingBody = ( entry && entry.body ) || "";
            const storedEntry = storedText[ locale ];
            const storedBody = ( storedEntry && storedEntry.body ) || "";
            // A brand-new locale adds text that nobody has consented against yet, so it needs no bump.
            if ( storedEntry && incomingBody !== storedBody ) {
                issues.push( {
                    path: `.text.${ locale }.body`,
                    message: `the consent text changed but 'version' is still '${ incomingVersion }' — bump the version so existing consent records stay unambiguous`,
                    code: "consent-version"
                } );
            }
        }
        for ( const locale of Object.keys( storedText ) ) {
            if ( !incomingText[ locale ] ) {
                issues.push( {
                    path: `.text.${ locale }`,
                    message: `locale '${ locale }' was removed but 'version' is still '${ incomingVersion }' — bump the version`,
                    code: "consent-version"
                } );
            }
        }
        return issues;
    } );
}
```

Then add `consentTextVersionBumped,` to the `module.exports` object at the end of the file, after `labelsContentComplete`:

```js
module.exports = {
    competenciesArchetypeResolves,
    activeSetsReferenceIntegrity,
    activeSetsFloorCoverage,
    activeSetsCap,
    activeSetsWithinPool,
    poolReferenceIntegrity,
    archetypesReferentialIntegrity,
    roleFamiliesReferentialIntegrity,
    fetchEmployeesForValidation,
    labelsContentComplete,
    consentTextVersionBumped
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test test/research-consent.config.test.js
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Create the config file**

Create `packages/competence/bin/config/config.research-consent.json`. Note there is **no `$schema` key** — only `config.application.json` carries one, because its schema has no `$id`; every `$id`-bearing schema is matched by explicit key in the validation test.

```json
{
  "enabled": true,
  "version": "1.0",
  "text": {
    "en": {
      "body": "We would like to use your evaluation information for analysis and research that helps us understand and improve how performance appraisal works across the organisation.\n\nIf you agree, your evaluation data is included in this analysis in anonymized form only. It is never linked back to you by name, and results are only ever reported for groups, never for individuals.\n\nThis is entirely your choice. Whichever answer you give, it has no effect on your appraisal, your scores, or anything else in this application. You can change your answer at any time from your Scores screen."
    },
    "bg": {
      "body": "Бихме искали да използваме информацията от вашето оценяване за анализ и проучвания, които ни помагат да разберем и подобрим начина, по който работи оценяването на представянето в организацията.\n\nАко се съгласите, данните от вашето оценяване се включват в този анализ само в анонимизиран вид. Те никога не се свързват обратно с вашето име, а резултатите се отчитат само за групи, никога за отделни лица.\n\nИзборът е изцяло ваш. Какъвто и отговор да дадете, той няма никакво влияние върху вашето оценяване, вашите резултати или каквото и да е друго в това приложение. Можете да промените отговора си по всяко време от екрана с вашите оценки."
    }
  }
}
```

- [ ] **Step 6: Create the schema**

Create `packages/competence/bin/data/schemas/research-consent.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ti-engine.dev/schemas/competence/research-consent.json",
  "title": "Research-Use Consent",
  "description": "The configurable consent statement shown to employees when asked whether their anonymized evaluation data may be used for analysis and research. `version` identifies the wording in force; every stored consent record references it, so the version must be bumped whenever a body changes (enforced by the consentTextVersionBumped semantic validator). `enabled: false` is a fail-closed kill switch that hides the prompt, skips the submit gate, and makes the export chokepoint return nothing.",
  "type": "object",
  "required": [ "enabled", "version", "text" ],
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Master switch for the whole consent capability."
    },
    "version": {
      "type": "string",
      "description": "Human-readable version of the wording, e.g. '1.0'. Must change whenever any body changes.",
      "pattern": "^[0-9]+\\.[0-9]+$"
    },
    "text": {
      "type": "object",
      "description": "The consent statement per locale. The body is the ONLY thing hashed into a consent record, so it must be the complete statement.",
      "minProperties": 1,
      "patternProperties": {
        "^(en|bg)$": {
          "type": "object",
          "required": [ "body" ],
          "properties": {
            "body": {
              "type": "string",
              "description": "The verbatim consent statement. Plain text only — rendered as one paragraph per blank-line-separated block. No HTML.",
              "minLength": 1
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 7: Add the import aliases**

In `packages/competence/package.json`, add two entries to the `imports` map, keeping it alphabetically ordered:

```json
"#config-research-consent": "./bin/config/config.research-consent.json",
```

place immediately after `"#config-relevancy-archetypes"`, and:

```json
"#research-consent": "./application/research-consent.js",
```

place immediately after `"#organization-manager"`. (The second alias is used from Task 2 onward; adding both now keeps the manifest edits in one commit.)

- [ ] **Step 8: Wire the loader**

In `packages/competence/application/configuration-loader.js`, add the export next to the other config exports (after the `configRelevancyArchetypes` line, around line 17):

```js
module.exports.configResearchConsent = tools.deepFreeze( require( "#config-research-consent" ) );
```

Then add the store-backed mapping to the `STORE_BACKED` object:

```js
const STORE_BACKED = {
    "competencies": "configCompetencies",
    "relevancy-archetypes": "configRelevancyArchetypes",
    "active-competency-sets": "configActiveCompetencySets",
    "role-families": "configRoleFamilies",
    "role-family-competencies": "configRoleFamilyCompetencies",
    "stage-levels": "configStageLevels",
    "research-consent": "configResearchConsent"
};
```

- [ ] **Step 9: Register the config document**

In `packages/competence/application/config-registration.js`, add the schema require alongside the others near the top:

```js
const researchConsentSchema = require( "../bin/data/schemas/research-consent.schema.json" );
```

and register the document inside `registerCompetenceConfig`, after the `stage-levels` registration:

```js
    app.registerConfigDocument( "research-consent", {
        schema: researchConsentSchema,
        validators: [ validators.consentTextVersionBumped ],
        defaultValue: configurationLoader.configResearchConsent,
        metadata: { path: "bin/config/config.research-consent.json", label: "consent.research", editable: true }
    } );
```

- [ ] **Step 10: Add the JSON validation case**

In `packages/competence/test/json-config-validation.test.js`, add this case inside the `"Configuration files validate against their schemas"` describe block, after the `config.role-family-competencies.json` case:

```js
    it( "config.research-consent.json validates against research-consent.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/research-consent.json", path.join( CONFIG_DIR, "config.research-consent.json" ) );
    } );
```

- [ ] **Step 11: Run the full suite**

```bash
npm test
```

Expected: PASS, including the new `config.research-consent.json validates…` case and all 6 validator tests. No previously-passing test changes.

- [ ] **Step 12: Commit**

```bash
git add packages/competence/bin/config/config.research-consent.json packages/competence/bin/data/schemas/research-consent.schema.json packages/competence/package.json packages/competence/application/configuration-loader.js packages/competence/application/config-validators.js packages/competence/application/config-registration.js packages/competence/test/research-consent.config.test.js packages/competence/test/json-config-validation.test.js && git commit -m "feat(competence): add the store-backed research-consent config document with a version guard (CA-###)"
```

---

## Task 2: Pure consent module — hashing, records, resolution, submit gate

**Files:**
- Create: `packages/competence/application/research-consent.js`
- Create: `packages/competence/test/research-consent.test.js`
- Create: `packages/competence/test/research-consent.gate.test.js`
- Modify: `packages/competence/application/data-objects.types.js`

**Interfaces:**
- Consumes: `configurationLoader.configResearchConsent` (Task 1) — read by callers, not by this module.
- Produces (`require( "#research-consent" ).instance`):
  - `decisionGranted` → `"granted"`, `decisionDeclined` → `"declined"` (getters)
  - `hashText( body: string ) → string` (SHA-256 hex)
  - `requireDecision( rawValue: *, enabled: boolean ) → "granted"|"declined"|null` (throws)
  - `buildDecisionRecord( input ) → { record: ResearchConsentRecord, text: ResearchConsentText }` (throws)
  - `resolveEffective( chain: ResearchConsentRecord[] ) → ResearchConsentRecord|null`
  - `isConsented( chain: ResearchConsentRecord[] ) → boolean`

- [ ] **Step 1: Write the failing core test**

Create `packages/competence/test/research-consent.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

const BODY = "We would like to use your evaluation information for research.";

function baseInput( overrides ) {
    return Object.assign( {
        employeeID: "7",
        decidedBy: "7",
        decision: "granted",
        body: BODY,
        locale: "en",
        version: "1.0",
        source: "evaluation-submit"
    }, overrides || {} );
}

describe( "ResearchConsent hashing", () => {

    it( "is stable across calls", () => {
        assert.equal( researchConsent.hashText( BODY ), researchConsent.hashText( BODY ) );
    } );

    it( "produces a 64-character hex digest", () => {
        assert.match( researchConsent.hashText( BODY ), /^[0-9a-f]{64}$/ );
    } );

    it( "is sensitive to whitespace — a reformatted statement is a different statement", () => {
        assert.notEqual( researchConsent.hashText( BODY ), researchConsent.hashText( BODY + " " ) );
        assert.notEqual( researchConsent.hashText( "a\n\nb" ), researchConsent.hashText( "a\nb" ) );
    } );

    it( "treats null and empty as the same empty string", () => {
        assert.equal( researchConsent.hashText( null ), researchConsent.hashText( "" ) );
    } );

} );

describe( "ResearchConsent.buildDecisionRecord", () => {

    it( "builds a record carrying the hash of the exact body shown", () => {
        const { record, text } = researchConsent.buildDecisionRecord( baseInput() );
        assert.equal( record.decision, "granted" );
        assert.equal( record.decidedBy, "7" );
        assert.equal( record.textHash, researchConsent.hashText( BODY ) );
        assert.equal( record.textVersion, "1.0" );
        assert.equal( record.locale, "en" );
        assert.equal( record.source, "evaluation-submit" );
        assert.equal( record.supersedes, null );
        assert.match( record.recordID, /^[0-9a-f-]{36}$/ );
        assert.match( record.decidedAt, /^\d{4}-\d{2}-\d{2}T/ );
        assert.equal( text.body, BODY );
        assert.equal( text.firstSeenAt, record.decidedAt );
    } );

    it( "accepts a declined decision", () => {
        const { record } = researchConsent.buildDecisionRecord( baseInput( { decision: "declined" } ) );
        assert.equal( record.decision, "declined" );
    } );

    it( "throws on an unknown decision value", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { decision: "maybe" } ) ) );
    } );

    it( "throws when decidedBy is not the subject — no proxy consent", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { decidedBy: "22" } ) ) );
    } );

    it( "throws on an unrecognized source", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { source: "backfill" } ) ) );
    } );

    it( "throws when the body is empty — there would be nothing to prove", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { body: "" } ) ) );
    } );

    it( "carries a supersedes pointer when one is supplied", () => {
        const { record } = researchConsent.buildDecisionRecord( baseInput( { supersedes: "prior-id" } ) );
        assert.equal( record.supersedes, "prior-id" );
    } );

} );

describe( "ResearchConsent.resolveEffective", () => {

    it( "returns null for an empty or absent chain", () => {
        assert.equal( researchConsent.resolveEffective( [] ), null );
        assert.equal( researchConsent.resolveEffective( null ), null );
        assert.equal( researchConsent.resolveEffective( undefined ), null );
    } );

    it( "returns the newest record by decidedAt regardless of array order", () => {
        const chain = [
            { recordID: "b", decision: "declined", decidedAt: "2026-08-02T10:00:00.000Z" },
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "b" );
    } );

    it( "breaks a decidedAt tie deterministically on recordID", () => {
        const chain = [
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" },
            { recordID: "b", decision: "declined", decidedAt: "2026-08-01T10:00:00.000Z" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "b" );
        assert.equal( researchConsent.resolveEffective( chain.slice().reverse() ).recordID, "b" );
    } );

    it( "ignores malformed records with no timestamp", () => {
        const chain = [
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" },
            { recordID: "junk", decision: "granted" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "a" );
    } );

} );

describe( "ResearchConsent.isConsented", () => {

    it( "is false for an empty chain — silence is never consent", () => {
        assert.equal( researchConsent.isConsented( [] ), false );
        assert.equal( researchConsent.isConsented( null ), false );
    } );

    it( "is true only when the newest record is granted", () => {
        const granted = { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" };
        const declined = { recordID: "b", decision: "declined", decidedAt: "2026-08-02T10:00:00.000Z" };
        assert.equal( researchConsent.isConsented( [ granted ] ), true );
        assert.equal( researchConsent.isConsented( [ granted, declined ] ), false );
        assert.equal( researchConsent.isConsented( [ declined, granted ] ), true );
    } );

    it( "is false for an unrecognized decision value", () => {
        const odd = { recordID: "a", decision: "probably", decidedAt: "2026-08-01T10:00:00.000Z" };
        assert.equal( researchConsent.isConsented( [ odd ] ), false );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test test/research-consent.test.js
```

Expected: FAIL — `Cannot find module '#research-consent'`.

- [ ] **Step 3: Create the module**

Create `packages/competence/application/research-consent.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Every decision rule for research-use consent, as a pure frozen singleton: hashing the statement, constructing a
 * record, resolving which record is in force, the submit-gate check, the register, and the export chokepoint.
 * Deliberately performs no I/O — persistence lives in {@link DataManager} and orchestration in the web application —
 * so the rules that carry the legal weight are unit-testable without Redis.
 *
 * @module research-consent
 */

const crypto = require( "node:crypto" );
const tools = require( "@ti-engine/core/tools" );
const exceptions = require( "@ti-engine/core/exceptions" );

const DECISION_GRANTED = "granted";
const DECISION_DECLINED = "declined";
const DECISION_VALUES = [ DECISION_GRANTED, DECISION_DECLINED ];
const SOURCE_VALUES = [ "evaluation-submit", "scores-screen" ];

/**
 * Used to create and/or return a Research Consent singleton instance.
 *
 * @class ResearchConsent
 * @singleton
 * @public
 */
class ResearchConsent {

    static #instance = null;

    /**
     * @constructor
     * @returns {ResearchConsent}
     */
    constructor() {
        if ( !ResearchConsent.#instance ) {
            ResearchConsent.#instance = this;
        }
        return ResearchConsent.#instance;
    }

    /* Public interface */

    /**
     * @returns {"granted"}
     * @public
     */
    get decisionGranted() {
        return DECISION_GRANTED;
    }

    /**
     * @returns {"declined"}
     * @public
     */
    get decisionDeclined() {
        return DECISION_DECLINED;
    }

    /**
     * SHA-256 (hex) of the exact statement shown. This — not a pointer to a config value an admin can later edit — is
     * what makes a stored consent provable, so it is deliberately sensitive to every byte including whitespace.
     *
     * @method
     * @param {string} body
     * @returns {string}
     * @public
     */
    hashText( body ) {
        return crypto.createHash( "sha256" ).update( String( body == null ? "" : body ), "utf8" ).digest( "hex" );
    }

    /**
     * The submit gate's decision logic, kept here (rather than inline in the web application) so it is testable
     * without an HTTP harness. Returns null when the capability is switched off — the caller then skips the gate
     * entirely — the normalized decision when one was supplied, and throws otherwise.
     *
     * @method
     * @param {*} rawValue - The `researchConsent` value from the request body.
     * @param {boolean} enabled - The `enabled` flag from the research-consent config document.
     * @returns {"granted"|"declined"|null}
     * @exception {TiException.E_APP_SERVICE_ERROR} When absent (`error.consent.decision-required`) or unrecognized (`error.consent.invalid-decision`).
     * @public
     */
    requireDecision( rawValue, enabled ) {
        if ( enabled !== true ) {
            return null;
        }
        if ( rawValue === undefined || rawValue === null || rawValue === "" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.decision-required" }, exceptions.httpCode.C_422 );
        }
        const decision = String( rawValue ).trim().toLowerCase();
        if ( !DECISION_VALUES.includes( decision ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.invalid-decision" }, exceptions.httpCode.C_422 );
        }
        return decision;
    }

    /**
     * Constructs a consent record plus the text-registry entry it references. Throws rather than returning a partial
     * record: a malformed consent is worse than none.
     *
     * @method
     * @param {Object} input
     * @param {string} input.employeeID - The subject.
     * @param {string} input.decidedBy - Must equal employeeID; there is no proxy path.
     * @param {"granted"|"declined"} input.decision
     * @param {string} input.body - The verbatim statement shown.
     * @param {string} input.locale
     * @param {string} input.version - The config `version` in force.
     * @param {"evaluation-submit"|"scores-screen"} input.source
     * @param {string} [input.decidedAt] - ISO-8601; defaults to now.
     * @param {string|null} [input.supersedes] - recordID this replaces.
     * @returns {{record: ResearchConsentRecord, text: ResearchConsentText}}
     * @exception {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On missing employeeID/version/body or an unrecognized source.
     * @exception {TiException.E_APP_SERVICE_ERROR} On an unrecognized decision value.
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} When decidedBy is not the subject.
     * @public
     */
    buildDecisionRecord( input ) {
        const source = input || {};
        const employeeID = String( source.employeeID || "" ).trim();
        const decidedBy = String( source.decidedBy || "" ).trim();
        const decision = String( source.decision || "" ).trim().toLowerCase();
        const body = ( source.body == null ) ? "" : String( source.body );
        const locale = String( source.locale || "" ).trim() || "en";
        const version = String( source.version || "" ).trim();
        const origin = String( source.source || "" ).trim();
        const decidedAt = source.decidedAt || new Date().toISOString();
        const supersedes = source.supersedes || null;

        if ( !employeeID || !version || !body || !SOURCE_VALUES.includes( origin ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, version, source: origin } );
        }
        if ( !DECISION_VALUES.includes( decision ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.invalid-decision" }, exceptions.httpCode.C_422 );
        }
        // Self-attestation is the invariant that carries the legal weight. "Someone else recorded it for them" is the
        // likeliest challenge to an electronic consent, and the cleanest answer is that no such code path exists.
        if ( decidedBy !== employeeID ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.consent.not-self" }, exceptions.httpCode.C_403 );
        }

        const textHash = this.hashText( body );
        return {
            record: {
                recordID: tools.getUUID(),
                decision: decision,
                decidedAt: decidedAt,
                decidedBy: decidedBy,
                textHash: textHash,
                textVersion: version,
                locale: locale,
                source: origin,
                supersedes: supersedes
            },
            text: {
                locale: locale,
                version: version,
                body: body,
                firstSeenAt: decidedAt
            }
        };
    }

    /**
     * The record currently in force: newest by `decidedAt`, tie-broken on `recordID` so the result is deterministic
     * regardless of the order the store returned them in. Records without a timestamp are ignored as malformed.
     *
     * @method
     * @param {Array<ResearchConsentRecord>} chain
     * @returns {ResearchConsentRecord|null}
     * @public
     */
    resolveEffective( chain ) {
        if ( !Array.isArray( chain ) || chain.length === 0 ) {
            return null;
        }
        let newest = null;
        for ( const record of chain ) {
            if ( !record || !record.decidedAt ) {
                continue;
            }
            if ( !newest ) {
                newest = record;
                continue;
            }
            const stamp = String( record.decidedAt );
            const newestStamp = String( newest.decidedAt );
            if ( stamp > newestStamp || ( stamp === newestStamp && String( record.recordID || "" ) > String( newest.recordID || "" ) ) ) {
                newest = record;
            }
        }
        return newest;
    }

    /**
     * Whether research use is permitted for this chain. Fail-closed: an empty chain, a declined record, and anything
     * unrecognized all return false. Only an explicit newest-record `granted` returns true.
     *
     * @method
     * @param {Array<ResearchConsentRecord>} chain
     * @returns {boolean}
     * @public
     */
    isConsented( chain ) {
        const effective = this.resolveEffective( chain );
        return !!effective && effective.decision === DECISION_GRANTED;
    }

}

const instance = new ResearchConsent();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test test/research-consent.test.js
```

Expected: PASS — 19 tests.

- [ ] **Step 5: Write the failing gate test**

Create `packages/competence/test/research-consent.gate.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

/**
 * Extracts the `details` label key from a raised TiException so the assertions read against the contract the UI sees.
 */
function detailsOf( error ) {
    return error && error.data && error.data.details;
}

describe( "ResearchConsent.requireDecision (submit gate)", () => {

    it( "returns null when the capability is disabled — the gate is skipped entirely", () => {
        assert.equal( researchConsent.requireDecision( undefined, false ), null );
        assert.equal( researchConsent.requireDecision( "granted", false ), null );
    } );

    it( "returns the normalized decision for either valid answer", () => {
        assert.equal( researchConsent.requireDecision( "granted", true ), "granted" );
        assert.equal( researchConsent.requireDecision( "declined", true ), "declined" );
        assert.equal( researchConsent.requireDecision( "  GRANTED  ", true ), "granted" );
    } );

    it( "rejects a missing decision with error.consent.decision-required", () => {
        for ( const missing of [ undefined, null, "" ] ) {
            assert.throws( () => researchConsent.requireDecision( missing, true ), ( error ) => {
                assert.equal( detailsOf( error ), "error.consent.decision-required" );
                return true;
            } );
        }
    } );

    it( "rejects an unrecognized value with error.consent.invalid-decision", () => {
        assert.throws( () => researchConsent.requireDecision( "maybe", true ), ( error ) => {
            assert.equal( detailsOf( error ), "error.consent.invalid-decision" );
            return true;
        } );
    } );

    it( "treats a non-boolean enabled as disabled — fail-closed on a malformed config", () => {
        assert.equal( researchConsent.requireDecision( undefined, "yes" ), null );
        assert.equal( researchConsent.requireDecision( undefined, undefined ), null );
    } );

} );
```

- [ ] **Step 6: Run the gate test**

```bash
node --test test/research-consent.gate.test.js
```

Expected: PASS — 5 tests. (The implementation from Step 3 already satisfies it; if `detailsOf` returns `undefined`, inspect the raised exception's shape and adjust `detailsOf` to match how `exceptions.raise` stores the payload in this version of core — the assertion target is the `details` string either way.)

- [ ] **Step 7: Add the typedefs**

In `packages/competence/application/data-objects.types.js`, append these three typedefs at the end of the file:

```js
/**
 * @typedef {"granted"|"declined"} ResearchConsentDecisionValue
 */

/**
 * @typedef {Object} ResearchConsentRecord
 * @property {string} recordID - UUID; also the key this record is stored under within its chain.
 * @property {ResearchConsentDecisionValue} decision
 * @property {string} decidedAt - ISO-8601 timestamp.
 * @property {string} decidedBy - Employee ID of the subject; always equal to the chain's employeeID (no proxy consent).
 * @property {string} textHash - SHA-256 (hex) of the exact consent body shown.
 * @property {string} textVersion - The research-consent config `version` at the time of the decision.
 * @property {string} locale - Language the body was shown in.
 * @property {"evaluation-submit"|"scores-screen"} source - Where the decision was captured.
 * @property {string|null} supersedes - recordID this record replaces, or null for the first in a chain.
 */

/**
 * @typedef {Object} ResearchConsentText
 * @property {string} locale
 * @property {string} version
 * @property {string} body - The verbatim consent statement, stored once per distinct hash.
 * @property {string} firstSeenAt - ISO-8601 timestamp this text was first recorded against a decision.
 */
```

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: PASS. No previously-passing test changes.

- [ ] **Step 9: Commit**

```bash
git add packages/competence/application/research-consent.js packages/competence/application/data-objects.types.js packages/competence/test/research-consent.test.js packages/competence/test/research-consent.gate.test.js && git commit -m "feat(competence): add the pure research-consent module — hashing, record construction, newest-wins resolution, submit gate (CA-###)"
```

---

## Task 3: Register and export chokepoint

**Files:**
- Modify: `packages/competence/application/research-consent.js`
- Create: `packages/competence/test/research-consent.filter.test.js`

**Interfaces:**
- Consumes: `resolveEffective` / `isConsented` from Task 2.
- Produces:
  - `buildConsentRegister( employeeIDs: string[], chains: Object.<string, ResearchConsentRecord[]> ) → { rows: Array<{employeeID, decision, decidedAt, textVersion, textHash}>, counts: {granted, declined, notAsked} }` — `decision` is `null` on a not-asked row.
  - `filterConsentedEvaluations( evaluations: Object[], chains: Object.<string, ResearchConsentRecord[]>, options: {cycleID: string, enabled: boolean} ) → { included: Object[], consentedCount: number, excludedCount: number, basis: {cycleID, resolvedAt, textHashes: string[]} }`

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/research-consent.filter.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

const HASH_A = "a".repeat( 64 );
const HASH_B = "b".repeat( 64 );

function record( overrides ) {
    return Object.assign( {
        recordID: "r1",
        decision: "granted",
        decidedAt: "2026-08-01T10:00:00.000Z",
        decidedBy: "1",
        textHash: HASH_A,
        textVersion: "1.0",
        locale: "en",
        source: "evaluation-submit",
        supersedes: null
    }, overrides || {} );
}

describe( "ResearchConsent.buildConsentRegister", () => {

    it( "counts granted, declined and not-asked across the supplied population", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2" } ) ]
        };
        const result = researchConsent.buildConsentRegister( [ "1", "2", "3" ], chains );
        assert.deepEqual( result.counts, { granted: 1, declined: 1, notAsked: 1 } );
        assert.equal( result.rows.length, 3 );
    } );

    it( "reports a not-asked employee with a null decision rather than omitting them", () => {
        const result = researchConsent.buildConsentRegister( [ "3" ], {} );
        assert.equal( result.rows.length, 1 );
        assert.equal( result.rows[ 0 ].employeeID, "3" );
        assert.equal( result.rows[ 0 ].decision, null );
        assert.equal( result.rows[ 0 ].decidedAt, null );
        assert.equal( result.rows[ 0 ].textVersion, null );
    } );

    it( "reports only the record in force for an employee who changed their mind", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z", textVersion: "1.1", textHash: HASH_B } )
            ]
        };
        const result = researchConsent.buildConsentRegister( [ "1" ], chains );
        assert.equal( result.rows[ 0 ].decision, "declined" );
        assert.equal( result.rows[ 0 ].textVersion, "1.1" );
        assert.deepEqual( result.counts, { granted: 0, declined: 1, notAsked: 0 } );
    } );

} );

describe( "ResearchConsent.filterConsentedEvaluations", () => {

    const evaluations = [
        { evaluationID: "e1", employeeID: "1", cycleID: "2026-H2" },
        { evaluationID: "e2", employeeID: "2", cycleID: "2026-H2" },
        { evaluationID: "e3", employeeID: "3", cycleID: "2026-H2" }
    ];

    it( "includes only employees whose newest record is granted", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2" } ) ]
            // "3" has no chain at all
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
        assert.equal( result.consentedCount, 1 );
        assert.equal( result.excludedCount, 2 );
    } );

    it( "returns nothing at all when the capability is disabled — fail-closed", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "granted", decidedBy: "2" } ) ],
            "3": [ record( { recordID: "r3", decision: "granted", decidedBy: "3" } ) ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: false } );
        assert.deepEqual( result.included, [] );
        assert.equal( result.consentedCount, 0 );
        assert.equal( result.excludedCount, 3 );
    } );

    it( "honours a withdrawal that came after an earlier grant", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z" } )
            ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included, [] );
    } );

    it( "honours a re-grant that came after an earlier withdrawal", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "declined", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "granted", decidedAt: "2026-08-05T10:00:00.000Z" } )
            ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
    } );

    it( "excludes evaluations belonging to another cycle", () => {
        const mixed = evaluations.concat( [ { evaluationID: "e9", employeeID: "1", cycleID: "2026-H1" } ] );
        const chains = { "1": [ record( { decision: "granted" } ) ] };
        const result = researchConsent.filterConsentedEvaluations( mixed, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
    } );

    it( "reports a basis manifest covering only the included population", () => {
        const chains = {
            "1": [ record( { decision: "granted", textHash: HASH_A } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2", textHash: HASH_B } ) ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.equal( result.basis.cycleID, "2026-H2" );
        assert.match( result.basis.resolvedAt, /^\d{4}-\d{2}-\d{2}T/ );
        assert.deepEqual( result.basis.textHashes, [ HASH_A ] );
    } );

    it( "tolerates an empty evaluation list", () => {
        const result = researchConsent.filterConsentedEvaluations( [], {}, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included, [] );
        assert.deepEqual( result.basis.textHashes, [] );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test test/research-consent.filter.test.js
```

Expected: FAIL — `researchConsent.buildConsentRegister is not a function`.

- [ ] **Step 3: Add both methods**

In `packages/competence/application/research-consent.js`, add these two methods after `isConsented` and before the closing brace of the class:

```js
    /**
     * The per-cycle consent register: one row per employee in the supplied population, whether or not they have ever
     * been asked. A not-asked employee is reported with a null decision rather than omitted — the register's purpose
     * is to show who was asked and what they said, and "nobody asked them" is part of that answer.
     *
     * @method
     * @param {Array<string>} employeeIDs - The population to report on.
     * @param {Object.<string, Array<ResearchConsentRecord>>} chains - Consent chains keyed by employeeID.
     * @returns {{rows: Array<Object>, counts: {granted: number, declined: number, notAsked: number}}}
     * @public
     */
    buildConsentRegister( employeeIDs, chains ) {
        const population = Array.isArray( employeeIDs ) ? employeeIDs : [];
        const source = ( chains && typeof chains === "object" ) ? chains : {};
        const counts = { granted: 0, declined: 0, notAsked: 0 };
        const rows = [];

        for ( const employeeID of population ) {
            const effective = this.resolveEffective( source[ employeeID ] );
            if ( !effective ) {
                counts.notAsked++;
                rows.push( { employeeID: employeeID, decision: null, decidedAt: null, textVersion: null, textHash: null } );
                continue;
            }
            if ( effective.decision === DECISION_GRANTED ) {
                counts.granted++;
            } else {
                counts.declined++;
            }
            rows.push( {
                employeeID: employeeID,
                decision: effective.decision,
                decidedAt: effective.decidedAt,
                textVersion: effective.textVersion || null,
                textHash: effective.textHash || null
            } );
        }

        return { rows: rows, counts: counts };
    }

    /**
     * THE CHOKEPOINT. The only sanctioned path from evaluation data to research use — every future research export
     * must go through this function, and its fail-closed rules are what make a refusal consequential.
     *
     * Fail-closed in four ways: a disabled capability yields nothing, an employee with no chain is excluded, a
     * declined record is excluded, and any unrecognized decision is excluded. Only an explicit newest-record
     * `granted` gets in.
     *
     * Consent is resolved at CALL TIME, not at evaluation time, so a withdrawal genuinely takes effect for every
     * subsequent export. The returned `basis` is the provenance manifest an export should persist alongside its
     * dataset to record which consents backed it.
     *
     * @method
     * @param {Array<Object>} evaluations - Candidate evaluations (any cycle; filtered to options.cycleID here).
     * @param {Object.<string, Array<ResearchConsentRecord>>} chains - Consent chains keyed by employeeID.
     * @param {Object} options
     * @param {string} options.cycleID
     * @param {boolean} options.enabled - The research-consent config `enabled` flag.
     * @returns {{included: Array<Object>, consentedCount: number, excludedCount: number, basis: {cycleID: string, resolvedAt: string, textHashes: Array<string>}}}
     * @public
     */
    filterConsentedEvaluations( evaluations, chains, options ) {
        const settings = options || {};
        const cycleID = settings.cycleID;
        const candidates = Array.isArray( evaluations ) ? evaluations.filter( ( evaluation ) => !!evaluation && evaluation.cycleID === cycleID ) : [];
        const basis = { cycleID: cycleID, resolvedAt: new Date().toISOString(), textHashes: [] };

        if ( settings.enabled !== true ) {
            return { included: [], consentedCount: 0, excludedCount: candidates.length, basis: basis };
        }

        const source = ( chains && typeof chains === "object" ) ? chains : {};
        const included = [];
        const hashes = new Set();

        for ( const evaluation of candidates ) {
            const chain = source[ evaluation.employeeID ];
            const effective = this.resolveEffective( chain );
            if ( !effective || effective.decision !== DECISION_GRANTED ) {
                continue;
            }
            included.push( evaluation );
            if ( effective.textHash ) {
                hashes.add( effective.textHash );
            }
        }

        basis.textHashes = Array.from( hashes ).sort();
        return {
            included: included,
            consentedCount: included.length,
            excludedCount: candidates.length - included.length,
            basis: basis
        };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test test/research-consent.filter.test.js
```

Expected: PASS — 10 tests.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/application/research-consent.js packages/competence/test/research-consent.filter.test.js && git commit -m "feat(competence): add the consent register and the fail-closed research-export chokepoint (CA-###)"
```

---

## Task 4: DataManager consent store

**Files:**
- Modify: `packages/competence/application/data-manager.js`
- Create: `packages/competence/test/data-manager.research-consent.test.js`

**Interfaces:**
- Consumes: `ResearchConsentRecord` / `ResearchConsentText` shapes from Task 2.
- Produces (`dataManager.instance`):
  - `saveConsentDecision( employeeID, cycleID, record, text, previousDecision ) → Promise<ResearchConsentRecord>`
  - `fetchConsentChain( employeeID, cycleID ) → Promise<ResearchConsentRecord[]>` (sorted ascending by `decidedAt`)
  - `fetchConsentDecisions( cycleID ) → Promise<Object.<string, ResearchConsentRecord[]>>`
  - `fetchConsentText( textHash ) → Promise<ResearchConsentText|null>`
  - `fetchConsentHistory( employeeID ) → Promise<Object.<string, ResearchConsentRecord[]>>`

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/data-manager.research-consent.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const cache = require( "@ti-engine/core/cache" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const dataManager = require( "#data-manager" );

const CYCLE = "2026-H2";
const HASH_A = "a".repeat( 64 );
const HASH_B = "b".repeat( 64 );

function record( overrides ) {
    return Object.assign( {
        recordID: "r1",
        decision: "granted",
        decidedAt: "2026-08-01T10:00:00.000Z",
        decidedBy: "7",
        textHash: HASH_A,
        textVersion: "1.0",
        locale: "en",
        source: "evaluation-submit",
        supersedes: null
    }, overrides || {} );
}

function text( overrides ) {
    return Object.assign( {
        locale: "en",
        version: "1.0",
        body: "Statement A",
        firstSeenAt: "2026-08-01T10:00:00.000Z"
    }, overrides || {} );
}

describe( "DataManager research-consent store", () => {

    beforeEach( async () => {
        installInMemoryCache();
        await dataManager.instance.initialize();
    } );

    it( "seeds the store shape on initialize", async () => {
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.deepEqual( chain, [] );
    } );

    it( "persists a decision and reads it back", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.equal( chain.length, 1 );
        assert.equal( chain[ 0 ].recordID, "r1" );
        assert.equal( chain[ 0 ].decision, "granted" );
    } );

    it( "appends rather than overwriting — the original grant survives a withdrawal", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( {
            recordID: "r2",
            decision: "declined",
            decidedAt: "2026-08-05T10:00:00.000Z",
            supersedes: "r1"
        } ), text(), "granted" );

        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.equal( chain.length, 2 );
        assert.deepEqual( chain.map( ( entry ) => entry.recordID ), [ "r1", "r2" ] );
        assert.equal( chain[ 1 ].supersedes, "r1" );
    } );

    it( "returns the chain sorted ascending by decidedAt regardless of write order", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "late", decidedAt: "2026-09-01T10:00:00.000Z" } ), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "early", decidedAt: "2026-08-01T10:00:00.000Z" } ), text(), null );
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.deepEqual( chain.map( ( entry ) => entry.recordID ), [ "early", "late" ] );
    } );

    it( "registers the consent text once and preserves the original firstSeenAt", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "8", CYCLE, record( { recordID: "r9", decidedBy: "8", decidedAt: "2026-08-09T10:00:00.000Z" } ), text( { firstSeenAt: "2026-08-09T10:00:00.000Z" } ), null );

        const stored = await dataManager.instance.fetchConsentText( HASH_A );
        assert.equal( stored.body, "Statement A" );
        assert.equal( stored.firstSeenAt, "2026-08-01T10:00:00.000Z", "the second write must not re-stamp an existing text entry" );
    } );

    it( "stores distinct texts under distinct hashes", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "r2", textHash: HASH_B, textVersion: "1.1", decidedAt: "2026-08-05T10:00:00.000Z" } ), text( { version: "1.1", body: "Statement B" } ), "granted" );

        assert.equal( ( await dataManager.instance.fetchConsentText( HASH_A ) ).body, "Statement A" );
        assert.equal( ( await dataManager.instance.fetchConsentText( HASH_B ) ).body, "Statement B" );
    } );

    it( "returns null for an unknown text hash", async () => {
        assert.equal( await dataManager.instance.fetchConsentText( HASH_B ), null );
    } );

    it( "keeps cycles separate", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        assert.deepEqual( await dataManager.instance.fetchConsentChain( "7", "2027-H1" ), [] );
    } );

    it( "fetchConsentDecisions returns every employee's chain for one cycle", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "8", CYCLE, record( { recordID: "r8", decision: "declined", decidedBy: "8" } ), text(), null );
        await dataManager.instance.saveConsentDecision( "7", "2027-H1", record( { recordID: "r7b" } ), text(), null );

        const decisions = await dataManager.instance.fetchConsentDecisions( CYCLE );
        assert.deepEqual( Object.keys( decisions ).sort(), [ "7", "8" ] );
        assert.equal( decisions[ "7" ].length, 1 );
        assert.equal( decisions[ "8" ][ 0 ].decision, "declined" );
    } );

    it( "fetchConsentHistory returns every cycle for one employee", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", "2027-H1", record( { recordID: "r7b" } ), text(), null );

        const history = await dataManager.instance.fetchConsentHistory( "7" );
        assert.deepEqual( Object.keys( history ).sort(), [ "2026-H2", "2027-H1" ] );
    } );

    it( "writes an employee-scoped audit entry carrying the prior decision", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z" } ), text(), "granted" );

        const entries = await dataManager.instance.getAuditEntriesForEmployee( "7" );
        const consentEntries = entries.filter( ( entry ) => entry.field === `researchConsent.${ CYCLE }` );
        assert.equal( consentEntries.length, 2 );
        const newest = consentEntries[ 0 ];
        assert.equal( newest.newValue, "declined" );
        assert.equal( newest.oldValue, "granted" );
        assert.equal( newest.changedBy, "7" );
    } );

    it( "rejects when the cache is unavailable — an unprovable consent must fail loudly", async () => {
        installInMemoryCache();
        await dataManager.instance.initialize();
        Object.defineProperty( cache.instance, "isOperational", { value: false, configurable: true } );

        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null ) );
    } );

    it( "rejects a write with missing identifiers", async () => {
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "", CYCLE, record(), text(), null ) );
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", "", record(), text(), null ) );
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", CYCLE, null, text(), null ) );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test test/data-manager.research-consent.test.js
```

Expected: FAIL — `dataManager.instance.fetchConsentChain is not a function`.

- [ ] **Step 3: Add the cache key and seeding**

In `packages/competence/application/data-manager.js`, add the key constant after `cacheEntryKeyRoleGrants` (line 24):

```js
const cacheEntryKeyResearchConsent = "ti:competence:data:research-consent"; // { texts: { [textHash]: ResearchConsentText }, decisions: { [employeeID]: { [cycleID]: { [recordID]: ResearchConsentRecord } } } }
```

In `initialize()`, add the seed alongside the other eight (after the `cacheEntryKeyRoleGrants` line):

```js
        promises.push( cache.instance.setJSON( cacheEntryKeyResearchConsent, { texts: {}, decisions: {} }, "$", 1 ) );
```

- [ ] **Step 4: Add the five accessors**

In `packages/competence/application/data-manager.js`, add a new section immediately before the `/* Private interface */` marker:

```js
    /* ------------------------------------------------------------------ */
    /*                        Research-use consent                        */

    /* ------------------------------------------------------------------ */

    /**
     * Appends a consent record and, when the referenced text is not yet in the registry, stores it under its hash.
     *
     * The chain is a map keyed by `recordID` (mirroring the audit log's `{ [entryID]: entry }` shape) rather than an
     * array, so the append is a single RFC-7396 merge-patch with no read-modify-write — there is no lost-update race
     * if the same person answers from two tabs. Records are never updated or removed; a withdrawal is a new record
     * whose `supersedes` names the one it replaces.
     *
     * `previousDecision` is supplied by the caller rather than derived here: the "newest wins" rule belongs to
     * research-consent.js, and duplicating it here would give it two homes.
     *
     * @method
     * @param {string} employeeID - The subject.
     * @param {string} cycleID
     * @param {ResearchConsentRecord} record
     * @param {ResearchConsentText} text - The verbatim text this record references.
     * @param {ResearchConsentDecisionValue|null} previousDecision - The decision in force before this one, for the audit trail.
     * @returns {Promise<ResearchConsentRecord>}
     * @exception {TiException.E_APP_SERVICE_ERROR} When the cache is not operational.
     * @public
     */
    saveConsentDecision( employeeID, cycleID, record, text, previousDecision ) {
        return new Promise( ( resolve, reject ) => {
            const targetID = String( employeeID || "" ).trim();
            const cycle = String( cycleID || "" ).trim();
            if ( !targetID || !cycle || !record || !record.recordID || !record.decision || !record.textHash ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, cycleID } ) );
            }
            // DELIBERATE DIVERGENCE from the role-grants store, which resolves optimistically when the cache is down:
            // a consent record that was never persisted cannot be proven, and silently reporting success for one is
            // worse than a visible failure. Do not "fix" this for consistency.
            if ( !cache.instance.isOperational ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.storage-unavailable" }, exceptions.httpCode.C_500 ) );
            }

            this.fetchConsentText( record.textHash ).then( ( existingText ) => {
                const update = { decisions: { [ targetID ]: { [ cycle ]: { [ record.recordID ]: record } } } };
                // Only register the text the first time this hash is seen, so `firstSeenAt` keeps recording when the
                // wording entered circulation rather than when it was last used.
                if ( !existingText && text && text.body ) {
                    update.texts = { [ record.textHash ]: text };
                }
                return cache.instance.editJSON( cacheEntryKeyResearchConsent, update );
            } ).then( () => {
                // The consent is committed. The audit append is a best-effort cross-check: a failed audit write must
                // not reject an already-recorded consent, or the UI would report failure for a stored decision and a
                // retry would append a duplicate record.
                this.appendAuditEntry( {
                    subjectType: "employee",
                    subjectID: targetID,
                    changedBy: String( record.decidedBy || targetID ),
                    field: `researchConsent.${ cycle }`,
                    oldValue: previousDecision || null,
                    newValue: record.decision
                } ).catch( ( auditError ) => {
                    logger.log( `Research consent for employee '${ targetID }' in cycle '${ cycle }' was recorded, but the audit append failed.`, logger.logSeverity.WARNING, auditError );
                } );
                resolve( _.cloneDeep( record ) );
            } ).catch( reject );
        } );
    }

    /**
     * Every consent record this employee has given for the cycle, oldest first. Ordering is recovered by sorting on
     * `decidedAt` because the store keys records by `recordID` (see saveConsentDecision).
     *
     * @method
     * @param {string} employeeID
     * @param {string} cycleID
     * @returns {Promise<Array<ResearchConsentRecord>>} Empty when nothing was ever recorded.
     * @public
     */
    fetchConsentChain( employeeID, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            const targetID = String( employeeID || "" ).trim();
            const cycle = String( cycleID || "" ).trim();
            if ( !targetID || !cycle ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, cycleID } ) );
            }
            if ( !cache.instance.isOperational ) {
                return resolve( [] );
            }
            cache.instance.getJSON( cacheEntryKeyResearchConsent, [ "decisions", targetID, cycle ] ).then( ( result ) => {
                resolve( this.#sortConsentChain( ( result instanceof Array ) ? result[ 0 ] : result ) );
            } ).catch( reject );
        } );
    }

    /**
     * Every employee's consent chain for one cycle, keyed by employeeID. Employees who were never asked are absent
     * from the result — the caller supplies the population it wants reported on.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Object.<string, Array<ResearchConsentRecord>>>}
     * @public
     */
    fetchConsentDecisions( cycleID ) {
        return new Promise( ( resolve, reject ) => {
            const cycle = String( cycleID || "" ).trim();
            if ( !cycle ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }
            if ( !cache.instance.isOperational ) {
                return resolve( {} );
            }
            cache.instance.getJSON( cacheEntryKeyResearchConsent, [ "decisions" ] ).then( ( result ) => {
                const source = ( result instanceof Array ) ? result[ 0 ] : result;
                const decisions = {};
                if ( source && typeof source === "object" ) {
                    for ( const [ employeeID, byCycle ] of Object.entries( source ) ) {
                        if ( !byCycle || typeof byCycle !== "object" || !byCycle[ cycle ] ) {
                            continue;
                        }
                        const chain = this.#sortConsentChain( byCycle[ cycle ] );
                        if ( chain.length > 0 ) {
                            decisions[ employeeID ] = chain;
                        }
                    }
                }
                resolve( decisions );
            } ).catch( reject );
        } );
    }

    /**
     * Every cycle's consent chain for one employee, keyed by cycleID. Backs subject-access requests.
     *
     * @method
     * @param {string} employeeID
     * @returns {Promise<Object.<string, Array<ResearchConsentRecord>>>}
     * @public
     */
    fetchConsentHistory( employeeID ) {
        return new Promise( ( resolve, reject ) => {
            const targetID = String( employeeID || "" ).trim();
            if ( !targetID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID } ) );
            }
            if ( !cache.instance.isOperational ) {
                return resolve( {} );
            }
            cache.instance.getJSON( cacheEntryKeyResearchConsent, [ "decisions", targetID ] ).then( ( result ) => {
                const source = ( result instanceof Array ) ? result[ 0 ] : result;
                const history = {};
                if ( source && typeof source === "object" ) {
                    for ( const [ cycleID, chain ] of Object.entries( source ) ) {
                        const sorted = this.#sortConsentChain( chain );
                        if ( sorted.length > 0 ) {
                            history[ cycleID ] = sorted;
                        }
                    }
                }
                resolve( history );
            } ).catch( reject );
        } );
    }

    /**
     * The verbatim consent statement behind a record's `textHash` — what the person actually saw.
     *
     * @method
     * @param {string} textHash
     * @returns {Promise<ResearchConsentText|null>}
     * @public
     */
    fetchConsentText( textHash ) {
        return new Promise( ( resolve, reject ) => {
            const hash = String( textHash || "" ).trim();
            if ( !hash ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { textHash } ) );
            }
            if ( !cache.instance.isOperational ) {
                return resolve( null );
            }
            cache.instance.getJSON( cacheEntryKeyResearchConsent, [ "texts", hash ] ).then( ( result ) => {
                const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                resolve( ( source && typeof source === "object" ) ? source : null );
            } ).catch( reject );
        } );
    }
```

Then add the private sort helper alongside the other private methods (next to `#auditLogBucketForSubject`):

```js
    /**
     * Normalizes a stored consent chain (a `{ [recordID]: record }` map) into an array ordered oldest-first by
     * `decidedAt`, tie-broken on `recordID` so the order is deterministic.
     *
     * @method
     * @private
     * @param {Object} stored
     * @returns {Array<ResearchConsentRecord>}
     */
    #sortConsentChain( stored ) {
        if ( !stored || typeof stored !== "object" ) {
            return [];
        }
        const entries = _.cloneDeep( Object.values( stored ) ).filter( ( entry ) => !!entry && !!entry.decidedAt );
        entries.sort( ( a, b ) => {
            const byTime = String( a.decidedAt ).localeCompare( String( b.decidedAt ) );
            return ( byTime !== 0 ) ? byTime : String( a.recordID || "" ).localeCompare( String( b.recordID || "" ) );
        } );
        return entries;
    }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test test/data-manager.research-consent.test.js
```

Expected: PASS — 13 tests.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS. Watch specifically that `data-manager.role-grants.test.js` and every `competence-framework.*` suite still pass — `initialize()` gained a seed call.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/application/data-manager.js packages/competence/test/data-manager.research-consent.test.js && git commit -m "feat(competence): add the append-only research-consent store as the ninth data-manager key (CA-###)"
```

---

## Task 5: Employee services and the submit gate

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js`

**Interfaces:**
- Consumes: `researchConsent.requireDecision` / `buildDecisionRecord` / `resolveEffective` (Tasks 2–3); `dataManager.saveConsentDecision` / `fetchConsentChain` (Task 4); `configurationLoader.configResearchConsent` (Task 1).
- Produces:
  - **View** `load-research-consent` → `{ enabled, version, locale, body, decision, decidedAt, cycleID }` (`decision` null when never asked).
  - **Service** `submit-research-consent` with params `{ decision }` → `{ decision, decidedAt, cycleID }`.

> **This codebase has two dispatchers.** Reads are *views* handled by `processDataRequest( session, view, options = {} )` (line ~239), named `load-*`, with query parameters arriving as `options.query.<name>`; the client calls them with `tiApplication.sendRequest( "/app/load-x" )` — no method, no body. Writes are *services* handled by `processServiceRequest( session, service, params )` (line ~406); the client calls `tiApplication.sendRequest( "/app/x", "POST", body )`. Put each endpoint in the right one.
  - Private `#recordConsentDecision( userID, cycleID, decision, source ) → Promise<ResearchConsentRecord|null>` — resolves `null` when the decision is idempotent (no-op).
  - `#submitEvaluation` now rejects a self-submit that carries no decision.

- [ ] **Step 1: Add the module require**

In `packages/competence/bin/competence-web-application.js`, add the require alongside the other application requires near the top of the file:

```js
const researchConsent = require( "#research-consent" );
```

- [ ] **Step 2: Add the consent config helper and the recording method**

Add these three private methods near the other private helpers in the class:

```js
    /**
     * The active research-consent configuration for a locale, with the statement resolved. Falls back to `en` when
     * the requested locale has no body, and reports `enabled: false` if the document is malformed — fail-closed, so a
     * broken config suppresses the prompt rather than showing an empty one.
     *
     * @method
     * @param {string} [locale="en"]
     * @returns {{enabled: boolean, version: string, locale: string, body: string}}
     * @private
     */
    #resolveConsentConfig( locale ) {
        const config = configurationLoader.configResearchConsent || {};
        const text = config.text || {};
        const requested = String( locale || "en" ).trim() || "en";
        const entry = text[ requested ] || text.en || null;
        const body = ( entry && entry.body ) ? String( entry.body ) : "";
        const version = config.version ? String( config.version ) : "";
        return {
            enabled: ( config.enabled === true ) && !!body && !!version,
            version: version,
            locale: ( text[ requested ] && text[ requested ].body ) ? requested : "en",
            body: body
        };
    }

    /**
     * Records a consent decision for the caller against a cycle. Idempotent: when the incoming decision matches the
     * one already in force AND references the same text, nothing is written and null is returned. That is what makes
     * it safe to call this ahead of a submit that may fail validation and be retried.
     *
     * @method
     * @param {string} userID - The subject; consent is self-attested only.
     * @param {string} cycleID
     * @param {"granted"|"declined"} decision
     * @param {"evaluation-submit"|"scores-screen"} source
     * @param {string} [locale]
     * @returns {Promise<ResearchConsentRecord|null>} The stored record, or null when the write was a no-op.
     * @private
     */
    #recordConsentDecision( userID, cycleID, decision, source, locale ) {
        const consentConfig = this.#resolveConsentConfig( locale );
        if ( !consentConfig.enabled ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.disabled" }, exceptions.httpCode.C_422 ) );
        }
        return dataManager.instance.fetchConsentChain( userID, cycleID ).then( ( chain ) => {
            const effective = researchConsent.instance.resolveEffective( chain );
            const textHash = researchConsent.instance.hashText( consentConfig.body );
            if ( effective && effective.decision === decision && effective.textHash === textHash ) {
                return null;
            }
            const built = researchConsent.instance.buildDecisionRecord( {
                employeeID: userID,
                decidedBy: userID,
                decision: decision,
                body: consentConfig.body,
                locale: consentConfig.locale,
                version: consentConfig.version,
                source: source,
                supersedes: effective ? effective.recordID : null
            } );
            return dataManager.instance.saveConsentDecision( userID, cycleID, built.record, built.text, effective ? effective.decision : null );
        } );
    }

    /**
     * The caller's own consent state for the active cycle, plus the statement to show them. Self-scoped only — there
     * is no parameter to read anyone else's.
     *
     * @method
     * @param {TiSession} session
     * @returns {Promise<Object>}
     * @private
     */
    #loadResearchConsent( session ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireSessionUser( session );
            const consentConfig = this.#resolveConsentConfig( session && session.language );
            if ( !consentConfig.enabled ) {
                return resolve( { enabled: false, version: "", locale: consentConfig.locale, body: "", decision: null, decidedAt: null, cycleID: null } );
            }
            dataManager.instance.getActiveCycle().then( ( activeCycle ) => {
                if ( !activeCycle ) {
                    return resolve( { enabled: false, version: consentConfig.version, locale: consentConfig.locale, body: consentConfig.body, decision: null, decidedAt: null, cycleID: null } );
                }
                return dataManager.instance.fetchConsentChain( userID, activeCycle.cycleID ).then( ( chain ) => {
                    const effective = researchConsent.instance.resolveEffective( chain );
                    resolve( {
                        enabled: true,
                        version: consentConfig.version,
                        locale: consentConfig.locale,
                        body: consentConfig.body,
                        decision: effective ? effective.decision : null,
                        decidedAt: effective ? effective.decidedAt : null,
                        cycleID: activeCycle.cycleID
                    } );
                } );
            } ).catch( reject );
        } );
    }

    /**
     * Records or changes the caller's own consent decision for the active cycle. Available at any evaluation status —
     * withdrawal cannot be conditional on workflow state.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.decision
     * @returns {Promise<Object>}
     * @private
     */
    #submitResearchConsent( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireSessionUser( session );
            const consentConfig = this.#resolveConsentConfig( session && session.language );
            let decision;
            try {
                decision = researchConsent.instance.requireDecision( params && params.decision, consentConfig.enabled );
            } catch ( error ) {
                return reject( error );
            }
            if ( decision === null ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.disabled" }, exceptions.httpCode.C_422 ) );
            }
            dataManager.instance.getActiveCycle().then( ( activeCycle ) => {
                if ( !activeCycle ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.no-active-cycle" }, exceptions.httpCode.C_422 );
                }
                return this.#recordConsentDecision( userID, activeCycle.cycleID, decision, "scores-screen", session && session.language ).then( ( record ) => {
                    resolve( {
                        decision: decision,
                        decidedAt: record ? record.decidedAt : null,
                        cycleID: activeCycle.cycleID
                    } );
                } );
            } ).catch( reject );
        } );
    }
```

- [ ] **Step 3: Wire the endpoints into their respective dispatchers**

The read is a **view**. In `processDataRequest`, add a branch alongside the other `load-*` views (e.g. after `load-cycle-list`):

```js
        } else if ( view === "load-research-consent" ) {
            return this.#loadResearchConsent( session );
```

The write is a **service**. In `processServiceRequest`, add a branch after `close-evaluation`:

```js
        } else if ( service === "submit-research-consent" ) {
            return this.#submitResearchConsent( session, params );
```

- [ ] **Step 4: Add the submit gate**

In `#submitEvaluation`, inside the `isEmployee` branch, insert the gate immediately after the self-evaluation deadline check and before the `evaluation.comment` assignment:

```js
                    // Research-use consent (CA-###): a self-submit must carry an explicit decision when the
                    // capability is enabled. Both answers proceed identically — refusing costs the employee nothing,
                    // which is the only reading under which this is genuine consent.
                    const consentConfig = this.#resolveConsentConfig( session && session.language );
                    consentDecision = researchConsent.instance.requireDecision( evaluation.researchConsent, consentConfig.enabled );
```

Declare `consentDecision` alongside the other mutable locals at the top of `#submitEvaluation`:

```js
            let consentDecision = null;
```

Then, at the point where the self-evaluation branch has finished validating (immediately after `existingEvaluation.workflow.selfEvaluationCompleted = true;`), chain the consent write ahead of the evaluation persist by replacing that single line with:

```js
                    existingEvaluation.workflow.selfEvaluationCompleted = true;
                    // Consent is written BEFORE the evaluation persists. If the submit then fails, a valid consent
                    // record with no evaluation change is harmless — the consent is per-cycle and true regardless.
                    // The reverse ordering can leave a submitted evaluation with no consent record, which is the
                    // state that cannot be defended. The write is idempotent, so a retry adds no duplicate.
                    if ( consentDecision ) {
                        consentWrite = this.#recordConsentDecision( existingEvaluation.employeeID, existingEvaluation.cycleID, consentDecision, "evaluation-submit", session && session.language );
                    }
```

and declare `consentWrite` next to `consentDecision`:

```js
            let consentWrite = Promise.resolve( null );
```

Finally, make the consent write settle before the evaluation persists. All three branches (employee, team-member, manager) converge on a single persist call — currently at [competence-web-application.js:847](../../packages/competence/bin/competence-web-application.js#L847), immediately below the `// TODO: Make sure to update the 'currentStep'…` comment. Change exactly that line from:

```js
                return dataManager.instance.saveEvaluation( existingEvaluation ).then( ( saved ) => {
```

to:

```js
                // Research consent settles BEFORE the evaluation persists, so a failed consent write aborts the
                // submit rather than leaving a submitted evaluation with no consent record. `consentWrite` is an
                // already-resolved promise for every non-employee branch and whenever the capability is disabled.
                return consentWrite.then( () => dataManager.instance.saveEvaluation( existingEvaluation ) ).then( ( saved ) => {
```

Nothing else in the chain changes — the `proxyAuditReason` block inside that `.then` and the `.then( ( savedEvaluation ) => …)` that follows it are untouched.

- [ ] **Step 5: Verify nothing regressed**

```bash
npm test
```

Expected: PASS. The gate is inert in every existing test because those fixtures do not enable the consent config through the store; `#resolveConsentConfig` reads the file default where `enabled` is `true`, so **if any `competence-framework.*` submit test now fails with `error.consent.decision-required`, that is the gate working correctly** — update those fixtures to pass `researchConsent: "granted"` on the submitted evaluation rather than weakening the gate.

- [ ] **Step 6: Verify the ordering guarantee by inspection**

The §7.1 ordering guarantee is not unit-testable here — `#submitEvaluation` is private and the package has no HTTP-level harness. Confirm it structurally instead. Read the final `#submitEvaluation` and check all four:

1. `consentDecision` is assigned only inside the `isEmployee` branch, after the deadline check.
2. `consentWrite` is initialized to `Promise.resolve( null )` so the non-employee branches are unaffected.
3. The single `saveEvaluation` call is chained behind `consentWrite`, so a rejected consent write aborts the submit.
4. No `catch` between the consent write and the persist swallows a consent failure.

If any is false, fix it before committing — this ordering is the whole reason a failed submit cannot produce an unconsented evaluation.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/bin/competence-web-application.js && git commit -m "feat(competence): capture research consent at self-evaluation submit; add the self-scoped consent services (CA-###)"
```

---

## Task 6: Supervisor register and evidence services

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js`

**Interfaces:**
- Consumes: `researchConsent.buildConsentRegister` (Task 3); `dataManager.fetchConsentDecisions` / `fetchConsentChain` / `fetchConsentText` / `fetchEmployees` (Task 4).
- Produces (both are **views** on `processDataRequest`, not services — see the dispatcher note in Task 5):
  - View `load-consent-register`, query `cycleID` → `{ cycleID, counts: {granted, declined, notAsked}, rows: Array<{employeeID, employeeName, decision, decidedAt, textVersion, textHash}> }`.
  - View `load-consent-evidence`, query `employeeID` + `cycleID` → `{ employeeID, cycleID, records: Array<ResearchConsentRecord & {body: string}> }`.

- [ ] **Step 1: Add the two private methods**

In `packages/competence/bin/competence-web-application.js`, add after `#submitResearchConsent`:

```js
    /**
     * The per-cycle consent register. Supervisor-only: the rows are per-person consent decisions, which is personal
     * data rather than configuration, so this is NOT gated on the `admin` role (there is no implicit role hierarchy).
     *
     * @method
     * @param {TiSession} session
     * @param {string} cycleID
     * @returns {Promise<Object>}
     * @private
     */
    #loadConsentRegister( session, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }
            Promise.all( [
                dataManager.instance.fetchEmployees(),
                dataManager.instance.fetchConsentDecisions( cycleID )
            ] ).then( ( [ employees, chains ] ) => {
                const population = ( employees || [] ).map( ( employee ) => employee.employeeID );
                const nameByID = new Map( ( employees || [] ).map( ( employee ) => {
                    const personal = employee.personal || {};
                    return [ employee.employeeID, `${ personal.firstName || "" } ${ personal.lastName || "" }`.trim() || employee.employeeID ];
                } ) );
                const register = researchConsent.instance.buildConsentRegister( population, chains );
                resolve( {
                    cycleID: cycleID,
                    counts: register.counts,
                    rows: register.rows.map( ( row ) => Object.assign( {}, row, { employeeName: nameByID.get( row.employeeID ) || row.employeeID } ) )
                } );
            } ).catch( reject );
        } );
    }

    /**
     * The full consent chain for one employee in one cycle, with each record's verbatim statement resolved from the
     * text registry — the evidence view. Available to a Supervisor, and to the employee for their own record.
     *
     * @method
     * @param {TiSession} session
     * @param {string} employeeID
     * @param {string} cycleID
     * @returns {Promise<Object>}
     * @private
     */
    #loadConsentEvidence( session, employeeID, cycleID ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireSessionUser( session );
            if ( !employeeID || !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, cycleID } ) );
            }
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );
            if ( !isSupervisor && employeeID !== userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.consent.not-self" }, exceptions.httpCode.C_403 ) );
            }
            dataManager.instance.fetchConsentChain( employeeID, cycleID ).then( ( chain ) => {
                const hashes = Array.from( new Set( chain.map( ( entry ) => entry.textHash ).filter( Boolean ) ) );
                return Promise.all( hashes.map( ( hash ) => dataManager.instance.fetchConsentText( hash ) ) ).then( ( texts ) => {
                    const bodyByHash = new Map();
                    hashes.forEach( ( hash, index ) => {
                        const entry = texts[ index ];
                        bodyByHash.set( hash, ( entry && entry.body ) ? entry.body : "" );
                    } );
                    resolve( {
                        employeeID: employeeID,
                        cycleID: cycleID,
                        records: chain.map( ( entry ) => Object.assign( {}, entry, { body: bodyByHash.get( entry.textHash ) || "" } ) )
                    } );
                } );
            } ).catch( reject );
        } );
    }
```

- [ ] **Step 2: Wire the two views**

Both are reads, so they go in `processDataRequest` next to `load-research-consent`. Query parameters are read from `options.query`, matching the `load-cycle-setup` branch:

```js
        } else if ( view === "load-consent-register" ) {
            const cycleID = String( options?.query?.cycleID || "" ).trim();
            return this.#loadConsentRegister( session, cycleID );
        } else if ( view === "load-consent-evidence" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            const cycleID = String( options?.query?.cycleID || "" ).trim();
            return this.#loadConsentEvidence( session, employeeID, cycleID );
```

Note `?.` is permitted here — the CSP restriction applies to Alpine template expressions in fragments, not to server-side JavaScript, and the neighbouring view branches already use this exact form.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/competence/bin/competence-web-application.js && git commit -m "feat(competence): add the Supervisor consent register and per-employee evidence services (CA-###)"
```

---

## Task 7: Consent panel UI and labels

**Files:**
- Modify: `packages/competence/bin/localization/competence-labels.json`
- Modify: `packages/competence/bin/static/fragments/frame-competence-evaluation.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`
- Modify: `packages/competence/test/fragment-input-bindings.test.js`

**Interfaces:**
- Consumes: view `load-research-consent` and service `submit-research-consent` (Task 5).
- Produces: Alpine state on `competenceEvaluation` — `consent` object `{ enabled, body, paragraphs, decision, decidedAt, version, cycleID, error }`, plus methods `loadConsent()`, `setConsentDecision(value)`, `saveConsentChange()`.

- [ ] **Step 1: Add the labels**

In `packages/competence/bin/localization/competence-labels.json`, add a `consent` section under `interface` (alongside `evaluation`, `insights`, …):

```json
"consent": {
  "panel-title": { "en": "Use of your data for research", "bg": "Използване на вашите данни за проучвания" },
  "panel-intro": { "en": "Please choose one option. Your answer does not affect your appraisal in any way.", "bg": "Моля, изберете една опция. Вашият отговор по никакъв начин не влияе върху вашето оценяване." },
  "legend": { "en": "Do you agree?", "bg": "Съгласни ли сте?" },
  "grant": { "en": "Yes, my anonymized data may be used", "bg": "Да, моите анонимизирани данни могат да бъдат използвани" },
  "decline": { "en": "No, do not use my data", "bg": "Не, не използвайте моите данни" },
  "required": { "en": "Please choose an option before submitting.", "bg": "Моля, изберете опция преди изпращане." },
  "current-label": { "en": "Your answer", "bg": "Вашият отговор" },
  "decided-label": { "en": "Answered on", "bg": "Отговорено на" },
  "version-label": { "en": "Statement version", "bg": "Версия на текста" },
  "not-answered": { "en": "Not answered", "bg": "Няма отговор" },
  "change": { "en": "Change my answer", "bg": "Промяна на отговора" },
  "save": { "en": "Save answer", "bg": "Запазване на отговора" },
  "saved": { "en": "Your answer has been recorded.", "bg": "Вашият отговор беше записан." },
  "register-title": { "en": "Research Consent Register", "bg": "Регистър на съгласията за проучвания" },
  "register-intro": { "en": "Who was asked for research-use consent in this cycle, what they answered, and when.", "bg": "Кой е бил попитан за съгласие за проучвания в този цикъл, какво е отговорил и кога." },
  "count-granted": { "en": "Granted", "bg": "Дадено" },
  "count-declined": { "en": "Declined", "bg": "Отказано" },
  "count-not-asked": { "en": "Not asked", "bg": "Непопитани" },
  "column-employee": { "en": "Employee", "bg": "Служител" },
  "column-decision": { "en": "Decision", "bg": "Решение" },
  "column-decided": { "en": "Date", "bg": "Дата" },
  "column-version": { "en": "Version", "bg": "Версия" },
  "evidence-title": { "en": "Consent evidence", "bg": "Доказателство за съгласие" },
  "evidence-intro": { "en": "Every record for this employee in this cycle, including superseded answers, with the exact statement shown at the time.", "bg": "Всички записи за този служител в този цикъл, включително заменените отговори, с точния текст, показан по това време." },
  "evidence-superseded": { "en": "Superseded", "bg": "Заменено" }
}
```

And an `error.consent` section alongside `error.evaluation`:

```json
"consent": {
  "decision-required": { "en": "Please answer the research-use consent question before submitting.", "bg": "Моля, отговорете на въпроса за съгласие за проучвания преди изпращане." },
  "invalid-decision": { "en": "The consent answer was not recognized.", "bg": "Отговорът за съгласие не беше разпознат." },
  "not-self": { "en": "Consent can only be given by the person it concerns.", "bg": "Съгласие може да бъде дадено само от лицето, за което се отнася." },
  "no-active-cycle": { "en": "There is no active cycle to record consent against.", "bg": "Няма активен цикъл, за който да бъде записано съгласие." },
  "disabled": { "en": "Research-use consent is not currently being collected.", "bg": "В момента не се събира съгласие за проучвания." },
  "storage-unavailable": { "en": "The consent could not be stored and was therefore not recorded. Please try again.", "bg": "Съгласието не можа да бъде съхранено и затова не беше записано. Моля, опитайте отново." }
}
```

> Bulgarian strings here are machine-drafted and pending native review, consistent with the rest of the file.

- [ ] **Step 2: Add the Alpine state**

In `packages/competence/bin/static/scripts/competence-user-interface.js`, inside `configureCompetenceEvaluation`, add `consent` to the returned object's initial state and these three methods next to `saveDraft`:

```js
        consent: { enabled: false, body: "", paragraphs: [], decision: null, decidedAt: null, version: "", cycleID: null, editing: false, error: "" },

        loadConsent() {
            // A view request: no method, no body — matching load-dashboard / load-cycle-list.
            tiApplication.sendRequest( "/app/load-research-consent" ).then( ( result ) => {
                const body = ( result && result.body ) ? result.body : "";
                this.consent = {
                    enabled: !!( result && result.enabled ),
                    body: body,
                    // Split on blank lines so the fragment can render one <p> per block without any HTML in the config.
                    paragraphs: body ? body.split( /\n\s*\n/ ).map( ( block ) => block.trim() ).filter( ( block ) => block.length > 0 ) : [],
                    decision: ( result && result.decision ) ? result.decision : null,
                    decidedAt: ( result && result.decidedAt ) ? result.decidedAt : null,
                    version: ( result && result.version ) ? result.version : "",
                    cycleID: ( result && result.cycleID ) ? result.cycleID : null,
                    editing: false,
                    error: ""
                };
            } ).catch( () => {
                this.consent = { enabled: false, body: "", paragraphs: [], decision: null, decidedAt: null, version: "", cycleID: null, editing: false, error: "" };
            } );
        },

        setConsentDecision( value ) {
            this.consent.decision = value;
            this.consent.error = "";
        },

        beginConsentChange() {
            this.consent.editing = true;
            this.consent.error = "";
        },

        saveConsentChange() {
            if ( !this.consent.decision ) {
                this.consent.error = tiApplication.getLabel( "interface.consent.required", "Please choose an option before submitting." );
                return;
            }
            tiApplication.sendRequest( "/app/submit-research-consent", "POST", { decision: this.consent.decision } ).then( ( result ) => {
                this.consent.decidedAt = ( result && result.decidedAt ) ? result.decidedAt : this.consent.decidedAt;
                this.consent.editing = false;
                tiApplication.notify( tiApplication.getLabel( "interface.consent.saved" ) );
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },
```

Then call it from the component's existing `init()` hook. In `configureCompetenceEvaluation`, `init()` defines an `onInitialized` closure that runs once the application store is ready — add the consent load as its last statement:

```js
        init() {
            const onInitialized = () => {
                this.grades = tiApplication.configuration.grades;
                this.employeeID = tiToolbox.getUrlParam( "employeeID" );
                this.loadEmployeeEvaluation( this.employeeID );
                this.loadConsent();
            };
```

The rest of `init()` (the `tiApplication.isInitialized` check and the `$watch` fallback) is unchanged.

- [ ] **Step 3: Guard the submit action**

In the same component, extend `openSubmitModal` so a missing decision is caught before the round-trip:

```js
        openSubmitModal( event ) {
            if ( this.consent.enabled && this.isSelfEvaluation && !this.consent.decision ) {
                this.consent.error = tiApplication.getLabel( "interface.consent.required", "Please choose an option before submitting." );
                return;
            }
            modalReturnFocus = ( event && event.currentTarget ) || null;
            this.modal = { kind: "submit-confirm", payload: { reason: "" }, busy: false };
        },
```

and include the decision in the submit payload:

```js
        submitEvaluation() {
            this.modal.busy = true;
            const reason = ( this.modal.payload && this.modal.payload.reason ) || "";
            const payload = Object.assign( {}, this.evaluation );
            if ( this.consent.enabled && this.consent.decision ) {
                payload.researchConsent = this.consent.decision;
            }
            tiApplication.sendRequest( "/app/submit-evaluation", "POST", { evaluation: payload, reason: reason } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.evaluation.messages.submitted" ) );
                this.closeModal();
                tiApplication.openScreen( "dashboard" );
            } ).catch( ( error ) => {
                this.closeModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },
```

> `isSelfEvaluation` is the component's existing predicate for the evaluee-in-form-mode case. If it is named differently in the current code, use that name — do not introduce a second flag.

- [ ] **Step 4: Add the fragment markup**

In `packages/competence/bin/static/fragments/frame-competence-evaluation.html`, add the panel above the submit actions. No inline `style=` and no `?.` anywhere — CSP mode.

```html
<section class="ti-panel" x-show="consent.enabled && isSelfEvaluation && !isResultsOnly">
    <div class="ti-panel-head">
        <span class="ti-panel-head-icon ti-icon check-clipboard md"></span>
        <div class="ti-panel-head-text">
            <h2 class="ti-panel-title" x-text-label="interface.consent.panel-title">Use of your data for research</h2>
        </div>
    </div>
    <p class="ti-panel-body-intro" x-text-label="interface.consent.panel-intro">Please choose one option.</p>

    <div class="ti-form" id="consent-statement">
        <template x-for="block in consent.paragraphs">
            <p x-text="block"></p>
        </template>
    </div>

    <fieldset class="ti-form-section" aria-describedby="consent-statement">
        <legend class="ti-form-section-title" x-text-label="interface.consent.legend">Do you agree?</legend>
        <div class="ti-form-row">
            <label>
                <input type="radio" name="research-consent" value="granted"
                       x-bind:checked="consent.decision === 'granted'"
                       @change="setConsentDecision('granted')"/>
                <span x-text-label="interface.consent.grant">Yes</span>
            </label>
        </div>
        <div class="ti-form-row">
            <label>
                <input type="radio" name="research-consent" value="declined"
                       x-bind:checked="consent.decision === 'declined'"
                       @change="setConsentDecision('declined')"/>
                <span x-text-label="interface.consent.decline">No</span>
            </label>
        </div>
        <p class="ti-form-error" x-show="consent.error" x-text="consent.error"></p>
    </fieldset>
</section>
```

> **Three codebase idioms this markup follows — do not substitute your own.** Labels use the `x-text-label="<key>"` directive with the English text as inline fallback (there are 43 uses in `frame-insights-cycle.html` alone and **zero** uses of an `x-text="label(...)"` helper). The icon variant `check-clipboard` is a real entry in the `.ti-icon` set — `shield` does not exist, and inventing a variant yields a silently blank icon. Buttons are `.ti-btn` with modifiers (`primary`, `ghost`, `danger`, `sm`, `lg`, `icon`); **there is no `.ti-button` class**.

And the read/change panel for the Scores route, shown only to the subject:

```html
<section class="ti-panel" x-show="consent.enabled && isResultsOnly && isOwnResults">
    <div class="ti-panel-head">
        <span class="ti-panel-head-icon ti-icon check-clipboard md"></span>
        <div class="ti-panel-head-text">
            <h2 class="ti-panel-title" x-text-label="interface.consent.panel-title">Use of your data for research</h2>
        </div>
    </div>

    <div class="ti-kv-grid" x-show="!consent.editing">
        <span class="ti-kv-label" x-text-label="interface.consent.current-label">Your answer</span>
        <span class="ti-kv-value" x-text="consentDecisionText"></span>
        <span class="ti-kv-label" x-text-label="interface.consent.decided-label">Answered on</span>
        <span class="ti-kv-value" x-text="formatDateTime(consent.decidedAt)"></span>
        <span class="ti-kv-label" x-text-label="interface.consent.version-label">Statement version</span>
        <span class="ti-kv-value" x-text="consent.version"></span>
    </div>

    <div class="ti-form-actions" x-show="!consent.editing">
        <button type="button" class="ti-btn ghost" @click="beginConsentChange()" x-text-label="interface.consent.change">Change my answer</button>
    </div>

    <div x-show="consent.editing">
        <div class="ti-form" id="consent-statement-results">
            <template x-for="block in consent.paragraphs">
                <p x-text="block"></p>
            </template>
        </div>
        <fieldset class="ti-form-section" aria-describedby="consent-statement-results">
            <legend class="ti-form-section-title" x-text-label="interface.consent.legend">Do you agree?</legend>
            <div class="ti-form-row">
                <label>
                    <input type="radio" name="research-consent-change" value="granted"
                           x-bind:checked="consent.decision === 'granted'"
                           @change="setConsentDecision('granted')"/>
                    <span x-text-label="interface.consent.grant">Yes</span>
                </label>
            </div>
            <div class="ti-form-row">
                <label>
                    <input type="radio" name="research-consent-change" value="declined"
                           x-bind:checked="consent.decision === 'declined'"
                           @change="setConsentDecision('declined')"/>
                    <span x-text-label="interface.consent.decline">No</span>
                </label>
            </div>
            <p class="ti-form-error" x-show="consent.error" x-text="consent.error"></p>
        </fieldset>
        <div class="ti-form-actions">
            <button type="button" class="ti-btn primary" @click="saveConsentChange()" x-text-label="interface.consent.save">Save answer</button>
        </div>
    </div>
</section>
```

`consentDecisionText` is a getter on the component, because a nested ternary calling a label helper is not expressible in a CSP-mode Alpine expression. Add it next to the other consent methods:

```js
        get consentDecisionText() {
            if ( this.consent.decision === "granted" ) {
                return tiApplication.getLabel( "interface.consent.grant" );
            }
            if ( this.consent.decision === "declined" ) {
                return tiApplication.getLabel( "interface.consent.decline" );
            }
            return tiApplication.getLabel( "interface.consent.not-answered" );
        },
```

> `formatDateTime(...)`, `isSelfEvaluation`, `isResultsOnly` and `isOwnResults` must be the names actually present in `configureCompetenceEvaluation`. Read the component before writing the markup; if `isOwnResults` does not exist, derive it from the existing comparison of the viewed `employeeID` against the session user and give it that name. Do not introduce a second flag that duplicates an existing one.

- [ ] **Step 5: Extend the input-bindings guard**

In `packages/competence/test/fragment-input-bindings.test.js`, add a case asserting the consent radios use a real, dispatched event. Follow the file's existing assertion style; the property under test is that each `input[name^="research-consent"]` carries an `@change` (or `x-on:change`) binding, not a custom `ti-input` event — the exact bug fixed in 3.11.1.

```js
    it( "the research-consent radios bind the native change event", () => {
        const markup = readFragment( "frame-competence-evaluation.html" );
        const radios = markup.match( /<input[^>]*name="research-consent[^"]*"[^>]*>/g ) || [];
        assert.ok( radios.length >= 4, "expected the consent radios in both the form and results panels" );
        for ( const radio of radios ) {
            assert.ok( /@change=|x-on:change=/.test( radio ), `consent radio must bind a dispatched change event: ${ radio }` );
            assert.ok( !/ti-input/.test( radio ), "consent radios must not bind the never-dispatched ti-input event" );
        }
    } );
```

> `readFragment` is the helper the file already uses to load fragment markup. Match its actual name and signature.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS, including the new binding guard and the existing CSP guards (no inline `style=`, no `?.`).

- [ ] **Step 7: Verify in the browser**

Start the app and check the panel renders, both options are unselected by default, and submitting without choosing is blocked:

```bash
docker compose up --build
```

Open `http://localhost:3000`, sign in as an employee with an `Open` evaluation, and confirm: the panel appears above the submit action, neither radio is pre-selected, pressing submit with no choice shows the inline error, and choosing either option allows the submit to proceed.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/bin/localization/competence-labels.json packages/competence/bin/static/fragments/frame-competence-evaluation.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/test/fragment-input-bindings.test.js && git commit -m "feat(competence): add the research-consent panel to the evaluation form and Scores screen (CA-###)"
```

---

## Task 8: Supervisor consent register screen

**Files:**
- Create: `packages/competence/bin/static/fragments/frame-consent-register.html`
- Modify: `packages/competence/bin/competence-web-application.js` (fragment registration)
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`

**Interfaces:**
- Consumes: views `load-consent-register` / `load-consent-evidence` (Task 6); labels from Task 7.
- Produces: Alpine component `competenceConsentRegister`; fragment route `consent-register` gated on `SUPERVISOR`.

- [ ] **Step 1: Register the fragment**

In `packages/competence/bin/competence-web-application.js`, add alongside the other role-gated screens (near the `insights-trends` registration):

```js
        this.addFragment( "consent-register", {
            title: "interface.consent.register-title",
            path: "frame-consent-register.html",
            roles: [ configurationLoader.roleCode.SUPERVISOR ]
        } );
```

> Match the exact option names and title-key convention used by the neighbouring `addFragment` calls — read them before editing.

- [ ] **Step 2: Add the Alpine component**

In `packages/competence/bin/static/scripts/competence-user-interface.js`, add the factory next to the other screen factories:

```js
function configureConsentRegister() {
    return {
        cycleID: "",
        cycles: [],
        counts: { granted: 0, declined: 0, notAsked: 0 },
        rows: [],
        evidence: null,
        busy: false,

        init() {
            tiApplication.sendRequest( "/app/load-cycle-list" ).then( ( result ) => {
                this.cycles = ( result && result.cycles ) ? result.cycles : [];
                // CycleStatus values are UPPERCASE (unlike EvaluationStatus, which is title-case).
                const active = this.cycles.find( ( cycle ) => cycle.status === "ACTIVE" );
                this.cycleID = active ? active.cycleID : ( this.cycles.length > 0 ? this.cycles[ 0 ].cycleID : "" );
                if ( this.cycleID ) {
                    this.loadRegister();
                }
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        loadRegister() {
            this.busy = true;
            this.evidence = null;
            tiApplication.sendRequest( `/app/load-consent-register?cycleID=${ encodeURIComponent( this.cycleID ) }` ).then( ( result ) => {
                this.counts = ( result && result.counts ) ? result.counts : { granted: 0, declined: 0, notAsked: 0 };
                this.rows = ( result && result.rows ) ? result.rows : [];
                this.busy = false;
            } ).catch( ( error ) => {
                this.busy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openEvidence( employeeID ) {
            const query = `employeeID=${ encodeURIComponent( employeeID ) }&cycleID=${ encodeURIComponent( this.cycleID ) }`;
            tiApplication.sendRequest( `/app/load-consent-evidence?${ query }` ).then( ( result ) => {
                this.evidence = result || null;
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        closeEvidence() {
            this.evidence = null;
        }
    };
}
```

and register it beside the others:

```js
    Alpine.data( "competenceConsentRegister", configureConsentRegister );
```

> Confirm `load-cycle-list`'s actual response shape in `#loadCycleList` before relying on `result.cycles` — adjust the destructuring to whatever it really returns. Confirm the query-string form against how another view with parameters is called from the client (e.g. the `load-cycle-setup` caller); if the client passes parameters differently, follow that.
>
> There is no `label()` helper on these components — labels come from the `x-text-label` directive in markup, and `tiApplication.getLabel(...)` in JavaScript.

- [ ] **Step 3: Create the fragment**

Create `packages/competence/bin/static/fragments/frame-consent-register.html`, modelled on the structure of `frame-insights-cycle.html` (page head, cycle selector, counts, data grid). No inline `style=`, no `?.`:

```html
<div x-data="competenceConsentRegister">
    <div class="ti-page-head">
        <h1 x-text-label="interface.consent.register-title">Research Consent Register</h1>
        <p x-text-label="interface.consent.register-intro">Who was asked, what they answered, and when.</p>
    </div>

    <div class="ti-form-row">
        <select x-model="cycleID" @change="loadRegister()">
            <template x-for="cycle in cycles">
                <option x-bind:value="cycle.cycleID" x-text="cycle.name"></option>
            </template>
        </select>
    </div>

    <div class="ti-kv-grid">
        <span class="ti-kv-label" x-text-label="interface.consent.count-granted">Granted</span>
        <span class="ti-kv-value" x-text="counts.granted"></span>
        <span class="ti-kv-label" x-text-label="interface.consent.count-declined">Declined</span>
        <span class="ti-kv-value" x-text="counts.declined"></span>
        <span class="ti-kv-label" x-text-label="interface.consent.count-not-asked">Not asked</span>
        <span class="ti-kv-value" x-text="counts.notAsked"></span>
    </div>

    <table class="ti-data-grid">
        <thead>
            <tr>
                <th x-text-label="interface.consent.column-employee">Employee</th>
                <th x-text-label="interface.consent.column-decision">Decision</th>
                <th x-text-label="interface.consent.column-decided">Date</th>
                <th x-text-label="interface.consent.column-version">Version</th>
            </tr>
        </thead>
        <tbody>
            <template x-for="row in rows">
                <tr @click="openEvidence(row.employeeID)">
                    <td x-text="row.employeeName"></td>
                    <td x-text="row.decisionText"></td>
                    <td x-text="row.decidedAt"></td>
                    <td x-text="row.textVersion"></td>
                </tr>
            </template>
        </tbody>
    </table>

    <section class="ti-panel" x-show="evidence">
        <div class="ti-panel-head">
            <div class="ti-panel-head-text">
                <h2 class="ti-panel-title" x-text-label="interface.consent.evidence-title">Consent evidence</h2>
            </div>
            <div class="ti-panel-head-actions">
                <button type="button" class="ti-btn ghost sm" @click="closeEvidence()" x-text-label="interface.consent.evidence-close">Close</button>
            </div>
        </div>
        <p class="ti-panel-body-intro" x-text-label="interface.consent.evidence-intro">Every record for this employee in this cycle.</p>
        <template x-for="entry in evidence.records">
            <div class="ti-form-section">
                <div class="ti-kv-grid">
                    <span class="ti-kv-label" x-text-label="interface.consent.column-decision">Decision</span>
                    <span class="ti-kv-value" x-text="entry.decision"></span>
                    <span class="ti-kv-label" x-text-label="interface.consent.column-decided">Date</span>
                    <span class="ti-kv-value" x-text="entry.decidedAt"></span>
                    <span class="ti-kv-label" x-text-label="interface.consent.column-version">Version</span>
                    <span class="ti-kv-value" x-text="entry.textVersion"></span>
                </div>
                <p class="ti-form-readonly" x-text="entry.body"></p>
                <p class="ti-form-hint" x-show="entry.supersedes" x-text-label="interface.consent.evidence-superseded">Superseded</p>
            </div>
        </template>
    </section>
</div>
```

Two supporting changes this markup needs:

1. **`row.decisionText`** — a nested ternary over label lookups is not expressible in a CSP-mode Alpine expression, so resolve it in `loadRegister()` when the rows arrive:

```js
                const decisionLabel = ( decision ) => {
                    if ( decision === "granted" ) return tiApplication.getLabel( "interface.consent.count-granted" );
                    if ( decision === "declined" ) return tiApplication.getLabel( "interface.consent.count-declined" );
                    return tiApplication.getLabel( "interface.consent.not-answered" );
                };
                this.rows = ( ( result && result.rows ) ? result.rows : [] ).map( ( row ) => Object.assign( {}, row, { decisionText: decisionLabel( row.decision ) } ) );
```

2. **`interface.consent.evidence-close`** — add to the `consent` label section from Task 7:

```json
"evidence-close": { "en": "Close", "bg": "Затваряне" }
```

- [ ] **Step 4: Add the sidebar entry**

In `packages/competence/bin/static/fragments/components/component-sidebar.html`, add the entry directly after the `insights-trends` button (currently around line 136), inside the same Supervisor-visible group. It mirrors that entry exactly — note the `x-text-label` directive (not `x-text`) and the numeric role code `3` for SUPERVISOR:

```html
            <button hx-get="/app/consent-register" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'consent-register'"
                    x-show="$store.tiApplication.hasRole(3)"
                    x-bind:class="{ active: active === 'consent-register' }" class="ti-sidebar-item" data-tip="Consent" aria-label="Consent Register" type="button">
                <span class="ti-sidebar-item-icon ti-icon check-clipboard md"></span>
                <span class="ti-sidebar-item-label" x-text-label="interface.navigation.consent-register">Consent</span>
            </button>
```

Copy the icon `<span>`'s exact class structure from the neighbouring `insights-trends` button — the icon element's classes differ slightly between sidebar groups, and the variant name must be one that exists in `ti-framework.css`.

Add the matching navigation label to `competence-labels.json` under `interface.navigation`:

```json
"consent-register": { "en": "Consent", "bg": "Съгласия" }
```

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS, including the CSP guards over the new fragment.

- [ ] **Step 6: Verify in the browser**

```bash
docker compose up --build
```

Sign in as a Supervisor, open the register, confirm the counts and rows render for the active cycle, and that clicking a row shows the evidence panel with the verbatim statement. Then sign in as a non-Supervisor and confirm `http://localhost:3000/app/consent-register` is rejected (403), not merely hidden.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-consent-register.html packages/competence/bin/competence-web-application.js packages/competence/bin/static/fragments/components/component-sidebar.html packages/competence/bin/static/scripts/competence-user-interface.js && git commit -m "feat(competence): add the Supervisor consent register screen with per-employee evidence (CA-###)"
```

---

## Task 9: Release

**Files:**
- Modify: `packages/competence/package.json`
- Modify: `packages/competence/CHANGELOG.md`

- [ ] **Step 1: Run everything**

```bash
npm test && npm run test:json
```

Expected: PASS on both. Do not proceed on a failure.

- [ ] **Step 2: Bump the version**

In `packages/competence/package.json`, change `"version": "3.14.0"` to `"version": "3.15.0"`.

- [ ] **Step 3: Add the changelog entry**

At the top of `packages/competence/CHANGELOG.md`, immediately below the title paragraph:

```markdown
## Version 3.15.0

Research-use consent: employees are asked once per cycle whether their anonymized evaluation data may be used for analysis and research, and the answer is recorded as a provable electronic consent. In-app Insights and the per-cycle `ResultsSnapshot` are unchanged — they run on legitimate interest and continue to cover everyone; consent gates secondary research use only. See `docs/superpowers/specs/2026-07-27-competence-research-consent-design.md` (CA-###).

* feat(competence): add the store-backed `research-consent` config document — the consent statement is admin-editable per locale, with a `consentTextVersionBumped` semantic validator that forces the version to move whenever a body changes, and `enabled: false` as a fail-closed kill switch
* feat(competence): add `application/research-consent.js`, a pure frozen-singleton owning every consent rule — SHA-256 statement hashing, record construction (self-attested only: `decidedBy` must equal the subject), newest-wins resolution, the submit-gate check, the register, and the fail-closed export chokepoint
* feat(competence): add the append-only consent store as the ninth `data-manager` key `ti:competence:data:research-consent` — records keyed by `recordID` so an append is a single merge-patch with no lost-update race, a hash-keyed registry holding each verbatim statement once, and an employee-scoped audit entry per decision; unlike the role-grants store it rejects rather than resolving optimistically when the cache is down, because an unprovable consent is worse than a visible failure
* feat(competence): capture the decision at self-evaluation submit — mandatory when enabled, both answers proceeding identically, written before the evaluation persists and idempotent so a retried submit adds no duplicate; changeable at any time (including after closure) from the Scores screen
* feat(competence): add the Supervisor consent register with per-employee evidence showing the exact statement each person saw, including superseded answers; gated on `SUPERVISOR` rather than `admin`, since the rows are personal data rather than configuration
* build(release): bump package version from `3.14.0` to `3.15.0`
```

- [ ] **Step 4: Commit**

```bash
git add packages/competence/package.json packages/competence/CHANGELOG.md && git commit -m "build(release): competence 3.14.0 -> 3.15.0 — research-use consent capture, register, and export gate (CA-###)"
```

- [ ] **Step 5: Log the work**

Update the YouTrack `CA-###` card: set `State: Verified`, `Stage: Done`, `Version: v3.15.0`, `Shipped` to the release date **+1** (the MCP stores it a day early), and log the time spent.

---

## Follow-ups (not in this plan)

Carried from the spec, deliberately out of scope:

1. Research dataset format and export producer — the consumer the chokepoint was built for.
2. Downloadable evidence bundle for the register — needs a DPO answer on retention and handling first.
3. DPO review of the consent wording and lawful basis (spec §1.1) — the text is configurable so this lands without code changes.
4. Subject-access export of one person's full consent history across cycles — `fetchConsentHistory` exists for it; no UI.
5. Retention policy for consent records after an employee leaves.
