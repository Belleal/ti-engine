# Work Site, Position Name & Gender Constraint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable work-site nomenclature, a free-text contract position name, and an M/F gender constraint to the competence employee record, the CSV importer, and the admin UI.

**Architecture:** `work-sites` becomes the tenth registered / ninth store-backed configuration document, guarded by two semantic validators and edited through a new admin screen that goes over the framework's composite-editor API. Two optional fields join the employee record and the CSV column contract; `gender` gains an enum enforced identically on both write paths.

**Tech Stack:** Node.js 22 CommonJS, `node --test`, JSON Schema (ajv, draft 2020-12), Alpine.js in CSP mode, HTMX.

**Spec:** `docs/superpowers/specs/2026-08-25-competence-work-site-and-position-design.md`
**Issue:** CA-109 · **Branch:** `feat/work-site-and-position` (already created, off `master`)

## Global Constraints

- **Every commit message ends with `(CA-109)`.** Conventional Commits, scoped `competence`.
- **Never add a `Co-Authored-By: Claude` trailer** — it adds a `claude` PR author that fails this repo's CLA check.
- **Never `git add` any `.run/*.run.xml`** — git-tracked but carrying live local credentials.
- **AGPL header on every new `.js` file**, copied verbatim from an existing file **in `packages/competence`** (e.g. `packages/competence/application/employee-rules.js` lines 1–7). Do not copy from `core` or `web-framework` — their header is Apache-2.0.
- **CommonJS + `#alias` imports.** No relative paths for internal modules.
- **Alpine CSP mode** in every fragment: no inline `style="..."`, no optional chaining (`?.`), no `Array`/`Object` builtins inside template expressions. Derived values become methods on the Alpine component.
- **`competence-labels.json` must never be JSON round-tripped.** Insert new label blocks as text at a known line. After editing, `git diff --numstat` must show **0 removed lines**. A `json.dumps`-style rewrite reindents all ~10,000 lines.
- **The file is CRLF on disk** (repo runs `core.autocrlf=true`). If editing with Python, use `io.open(f, 'w', encoding='utf-8')` with the **default** `newline=None` — passing `newline=''` converts the file to LF.
- **Every new user-visible string needs both `en` and `bg`.**
- **Do not run `npm run check:types`** — it reports a known Windows CRLF false positive and rewrites a declaration file. Verify with `npm test -w @ti-engine/competence` and `npm run lint`.
- **Node 22/26 `node --test <dir>` does not glob.** Run the whole suite with `npm test -w @ti-engine/competence`, a single file with `node --test packages/competence/test/<file>.test.js`.
- **`tools.enum()` gotcha:** an enum member's value is the **first element of its seed array**, not the key. Not used by this plan's new code, but do not introduce one.
- **No new runtime dependency.** competence's runtime deps are `core`, `web-framework`, `graphology`, and nothing here may lengthen that list.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `packages/competence/bin/data/schemas/work-sites.schema.json` | Structural shape of one site: `id`, `type`, bilingual `name` |
| `packages/competence/bin/config/config.work-sites.json` | Bootstrap demo default (three generic sites) |
| `packages/competence/bin/static/fragments/frame-work-sites.html` | The Work Sites admin screen |
| `packages/competence/test/work-sites-config.test.js` | Schema + `workSiteIdMatchesKey` |
| `packages/competence/test/work-sites-referential-integrity.test.js` | The removal guard, including its fail-closed branch |
| `packages/competence/test/work-sites-editor.test.js` | `compose`/`decompose` round-trip |
| `packages/competence/test/work-sites-screen-wiring.test.js` | Fragment registered, sidebar mapped, labels present, CSP-clean |
| `packages/competence/test/employee-new-fields.test.js` | `validateEmployee` + `mapRow` for the three fields |
| `packages/competence/docs/templates/build-import-template.py` | Manual, documented generator for the XLSX template |

**Modify:**

| Path | Change |
|---|---|
| `packages/competence/package.json` | `imports` alias `#config-work-sites`; version 3.23.0 → 3.24.0 |
| `packages/competence/application/configuration-loader.js:20` area | `configWorkSites` export; `STORE_BACKED` entry |
| `packages/competence/application/config-validators.js` | Two new validators + exports |
| `packages/competence/application/config-registration.js` | `registerConfigDocument( "work-sites", … )` |
| `packages/competence/application/config-editors.js` | `composeWorkSites` / `decomposeWorkSites` / `workSitesEditor` / registration |
| `packages/competence/application/employee-rules.js` | `workSites` context property; two new checks |
| `packages/competence/application/organization-import.js` | Columns, `mapRow`, `LEAVE_UNCHANGED_WHEN_OMITTED`, confusable folding |
| `packages/competence/application/data-objects.types.js` | Typedefs for the new fields + `WorkSite` |
| `packages/competence/bin/data/schemas/employee.schema.json` | `workSite`, `positionName`, `gender` enum |
| `packages/competence/bin/competence-web-application.js` | Three context sites, fragment + nav registration, Employee Management options/detail/draft |
| `packages/competence/bin/build/import-organization.js` | Context site; `--template` header |
| `packages/competence/bin/static/fragments/components/component-sidebar.html` | Work Sites entry |
| `packages/competence/bin/static/fragments/frame-employee-management.html` | Three fields, edit + create |
| `packages/competence/bin/static/fragments/frame-employee-import.html` | Download CSV template button |
| `packages/competence/bin/static/scripts/competence-user-interface.js` | `configureWorkSites`; Employee Management options; import-screen download |
| `packages/competence/bin/localization/competence-labels.json` | All new labels, en + bg |
| `packages/competence/docs/templates/employee-import-template.xlsx` | Regenerated |
| `packages/competence/INSTALL.md`, `README.md`, `CHANGELOG.md` | Documentation |

---

## Task 1: The `work-sites` configuration document

**Files:**
- Create: `packages/competence/bin/data/schemas/work-sites.schema.json`
- Create: `packages/competence/bin/config/config.work-sites.json`
- Create: `packages/competence/test/work-sites-config.test.js`
- Modify: `packages/competence/package.json` (`imports` map)
- Modify: `packages/competence/application/configuration-loader.js` (exports ~line 20, `STORE_BACKED` ~line 248)
- Modify: `packages/competence/application/config-validators.js` (new validator + exports)
- Modify: `packages/competence/application/config-registration.js` (require + registration)

**Interfaces:**
- Consumes: nothing.
- Produces: `configurationLoader.configWorkSites` — `Object<string, WorkSite>` where `WorkSite` is `{ id: string, type: "office"|"client", name: { en: string, bg: string } }`. Also `validators.workSiteIdMatchesKey( value ) → Promise<Array<ValidationIssue>>`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/work-sites-config.test.js` (AGPL header from `packages/competence/application/employee-rules.js` lines 1–7):

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * The work-sites configuration document (CA-109) — structural schema plus the one document-intrinsic rule the
 * schema cannot express. JSON Schema has no way to say "this property's value equals its property name", so an
 * `id` that disagrees with its map key would otherwise go unenforced, exactly as it did for organization units
 * before CA-107 added organizationIdMatchesKey.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const Ajv = require( "ajv" );

const schema = require( "../bin/data/schemas/work-sites.schema.json" );
const defaultValue = require( "../bin/config/config.work-sites.json" );
const validators = require( "../application/config-validators" );

const validate = new Ajv( { allErrors: true, strict: false } ).compile( schema );

const site = ( id, type ) => ( { id: id, type: type, name: { en: `${ id } EN`, bg: `${ id } BG` } } );

describe( "work-sites schema", () => {

    it( "accepts the shipped default", () => {
        assert.equal( validate( defaultValue ), true, JSON.stringify( validate.errors ) );
    } );

    it( "accepts both permitted types", () => {
        assert.equal( validate( { A: site( "A", "office" ), B: site( "B", "client" ) } ), true );
    } );

    it( "rejects an unknown type", () => {
        assert.equal( validate( { A: site( "A", "warehouse" ) } ), false );
    } );

    it( "rejects a missing or empty name side", () => {
        assert.equal( validate( { A: { id: "A", type: "office", name: { en: "A" } } } ), false );
        assert.equal( validate( { A: { id: "A", type: "office", name: { en: "A", bg: "" } } } ), false );
    } );

    it( "rejects an unknown property", () => {
        assert.equal( validate( { A: { ...site( "A", "office" ), address: "Sofia" } } ), false );
    } );

} );

describe( "workSiteIdMatchesKey", () => {

    it( "passes when every id equals its key", async () => {
        assert.deepEqual( await validators.workSiteIdMatchesKey( { HQ: site( "HQ", "office" ) } ), [] );
    } );

    it( "reports an id that disagrees with its key", async () => {
        // The key is what an operator edits, so a mismatch means the two name different sites.
        const issues = await validators.workSiteIdMatchesKey( { HQ: site( "HQX", "office" ) } );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "id-key-mismatch" );
        assert.equal( issues[ 0 ].path, ".HQ" );
        assert.match( issues[ 0 ].message, /HQX/ );
    } );

    it( "reports an absent id rather than throwing", async () => {
        const issues = await validators.workSiteIdMatchesKey( { HQ: { type: "office", name: { en: "x", bg: "x" } } } );
        assert.equal( issues.length, 1 );
        assert.match( issues[ 0 ].message, /\(absent\)/ );
    } );

    it( "treats a null document as empty", async () => {
        assert.deepEqual( await validators.workSiteIdMatchesKey( null ), [] );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/work-sites-config.test.js`
Expected: FAIL — `Cannot find module '../bin/data/schemas/work-sites.schema.json'`

- [ ] **Step 3: Create the schema**

`packages/competence/bin/data/schemas/work-sites.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ti-engine.dev/schemas/competence/work-sites.json",
  "title": "Work Sites",
  "description": "The work-site nomenclature, keyed by site code. A site is a place an employee reports to — distinct from personal.workLocation, which records the On-site/Hybrid/Remote arrangement. Names are stored inline rather than as localization keys so an edit takes effect on save; label-keyed text needs an export, commit and redeploy to appear. That a site's `id` equals its map key, and that a site in use cannot be removed, are enforced by semantic validators, not by this schema.",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "required": [ "id", "type", "name" ],
    "additionalProperties": false,
    "properties": {
      "id": { "type": "string", "minLength": 1, "description": "Site code; must equal the map key" },
      "type": { "type": "string", "enum": [ "office", "client" ], "description": "A company office, or client premises the employee works from" },
      "name": {
        "type": "object",
        "required": [ "en", "bg" ],
        "additionalProperties": false,
        "description": "Inline bilingual display name; both sides required and non-empty",
        "properties": {
          "en": { "type": "string", "minLength": 1 },
          "bg": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Create the demo default**

`packages/competence/bin/config/config.work-sites.json`. **Generic placeholders only** — this file is committed to a public repository, and the deployment's real sites are entered through the screen:

```json
{
  "HQ": {
    "id": "HQ",
    "type": "office",
    "name": { "en": "Head Office", "bg": "Централно управление" }
  },
  "OF1": {
    "id": "OF1",
    "type": "office",
    "name": { "en": "Branch Office", "bg": "Клонов офис" }
  },
  "CL1": {
    "id": "CL1",
    "type": "client",
    "name": { "en": "Client Site", "bg": "Клиентски обект" }
  }
}
```

- [ ] **Step 5: Add the import alias**

In `packages/competence/package.json`, in the `imports` map, immediately after the `#config-stage-levels` line:

```json
    "#config-work-sites": "./bin/config/config.work-sites.json",
```

- [ ] **Step 6: Export it from the configuration loader**

In `packages/competence/application/configuration-loader.js`, after the `configStageLevels` export line (~line 26):

```js
/** @type {Object<string, WorkSite>} The work-site nomenclature: site code → its type and inline bilingual name. */
module.exports.configWorkSites = tools.deepFreeze( require( "#config-work-sites" ) );
```

Then add the `STORE_BACKED` entry (~line 256), after `"organization-structure"`:

```js
    "work-sites": "configWorkSites"
```

Note the preceding line needs a trailing comma.

- [ ] **Step 7: Add the validator**

In `packages/competence/application/config-validators.js`, after `organizationIdMatchesKey` (~line 587):

```js
/**
 * work-sites: every site's `id` must equal its map key. Same constraint, and the same reason, as
 * {@link organizationIdMatchesKey}: JSON Schema cannot express "this property's value equals its property name", and
 * the map key is what an operator actually edits — an employee's `personal.workSite` is matched against the key, so
 * a site whose `id` disagrees with it is a site nobody can be assigned to.
 *
 * Document-intrinsic — no `context` parameter needed; see {@link organizationSingleRoot}.
 *
 * @method
 * @param {Object} value
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function workSiteIdMatchesKey( value ) {
    const issues = [];
    for ( const [ rawID, siteEntry ] of Object.entries( value || {} ) ) {
        const declared = siteEntry && siteEntry.id;
        if ( declared !== rawID ) {
            issues.push( {
                path: `.${ rawID }`,
                message: `work site id '${ declared === undefined ? "(absent)" : declared }' does not match its key '${ rawID }'`,
                code: "id-key-mismatch"
            } );
        }
    }
    return Promise.resolve( issues );
}
```

Add `workSiteIdMatchesKey` to the `module.exports` block at the end of the file, after `organizationIdMatchesKey`.

- [ ] **Step 8: Register the document**

In `packages/competence/application/config-registration.js`, add the schema require next to `organizationStructureSchema` (~line 43):

```js
const workSitesSchema = require( "../bin/data/schemas/work-sites.schema.json" );
```

Then, after the `organization-structure` registration block (~line 109), add:

```js
    app.registerConfigDocument( "work-sites", {
        schema: workSitesSchema,
        validators: [ validators.workSiteIdMatchesKey, validators.workSitesReferentialIntegrity ],
        defaultValue: configurationLoader.fileDefaults[ "work-sites" ],
        metadata: { path: "bin/config/config.work-sites.json", label: "work.sites", editable: true, driftTracked: false }
    } );
```

`driftTracked: false` for the same reason `organization-structure` carries it: the document holds deployment data, not content shipped with the release, so it differs from the image default by design and reporting that as drift is noise.

`workSitesReferentialIntegrity` does not exist yet — Task 2 adds it. Registering it now would throw, so **for this task register only `workSiteIdMatchesKey`** and add the second validator in Task 2, Step 6.

- [ ] **Step 9: Run the test to verify it passes**

Run: `node --test packages/competence/test/work-sites-config.test.js`
Expected: PASS, 9 tests.

Then the whole suite: `npm test -w @ti-engine/competence`
Expected: PASS. The count rises from 781 to at least 790. Treat every count in this plan as a floor: it is
the base measured on `master` plus the tests each task adds, so a count that comes out higher is fine and one that
comes out lower means something was skipped.

- [ ] **Step 10: Commit**

```bash
git add packages/competence/bin/data/schemas/work-sites.schema.json packages/competence/bin/config/config.work-sites.json packages/competence/test/work-sites-config.test.js packages/competence/package.json packages/competence/application/configuration-loader.js packages/competence/application/config-validators.js packages/competence/application/config-registration.js
git commit -m "feat(competence): register work-sites as a store-backed configuration document (CA-109)"
```

---

## Task 2: The removal guard, on a shared employee-reference helper

**Files:**
- Create: `packages/competence/test/work-sites-referential-integrity.test.js`
- Modify: `packages/competence/application/config-validators.js`
- Modify: `packages/competence/application/config-registration.js`

**Interfaces:**
- Consumes: `validators.fetchEmployeesForValidation()` — the existing overridable seam, already exported.
- Produces: `withEmployeeReferences( issues, inspect ) → Promise<Array<ValidationIssue>>` (module-private) and `validators.workSitesReferentialIntegrity( value, context ) → Promise<Array<ValidationIssue>>`.

**This task refactors a shipped validator.** `roleFamiliesReferentialIntegrity` and the new work-sites guard would otherwise share ~18 near-identical lines — the seam call, the fail-closed catch, and the de-duplication filter. The project owner decided the shared scaffolding is extracted **now** rather than duplicated. That means `roleFamiliesReferentialIntegrity` changes, so its existing coverage is the safety net: **14 cases in `packages/competence/test/config-management.test.js` must still pass, unmodified.** If making them pass requires editing them, stop and report — the refactor was supposed to preserve behaviour exactly.

- [ ] **Step 1: Read what you are extracting from**

```bash
sed -n '276,347p' packages/competence/application/config-validators.js
```

That is `roleFamiliesReferentialIntegrity` in full. Three parts are the shared scaffolding:

1. `Promise.resolve().then( () => module.exports.fetchEmployeesForValidation() ).then( ( employees ) => employees || [] )` — the deferred call, written that way so a *synchronous* throw from a test stub and an async rejection both reach the catch.
2. The `.catch()` that pushes the "could not be verified" issue and returns `[]` — the fail-closed branch.
3. The trailing de-duplication filter keyed on `issue.path`.

What is **not** shared: role families additionally consult `context.getConfig( "active-competency-sets" )` before reaching employees, and the two inspect different fields.

- [ ] **Step 2: Write the failing test for the new validator**

Create `packages/competence/test/work-sites-referential-integrity.test.js` (AGPL header from `packages/competence/application/employee-rules.js`):

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * work-sites removal guard (CA-109). A site still assigned to somebody cannot be removed.
 *
 * The spec first argued this could not be a validator, citing CA-107's decision to make the unresolved-manager
 * check a startup diagnostic. That was wrong, and the distinction is worth keeping straight: CA-107's check is a
 * PRESENCE check — "every unit's managerID must resolve to an employee" — which fires on a fresh install, where the
 * tree must exist before any employee can reference it, and therefore deadlocks. This is a REMOVAL check. It fires
 * only when something is being taken away, and a fresh install takes nothing away.
 *
 * The property that matters most: an employee fetch that genuinely FAILS blocks the save rather than being
 * skipped. Skipping would let a transient cache error orphan every employee on a site.
 */

const { describe, it, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

const original = validators.fetchEmployeesForValidation;
afterEach( () => {
    validators.fetchEmployeesForValidation = original;
} );

const site = ( id ) => ( { id: id, type: "office", name: { en: id, bg: id } } );
const employeeAt = ( employeeID, workSite ) => ( {
    employeeID: employeeID,
    personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: workSite }
} );

describe( "workSitesReferentialIntegrity", () => {

    it( "allows a document that still contains every referenced site", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "1", "HQ" ) ] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( { HQ: site( "HQ" ) }, {} ), [] );
    } );

    it( "refuses to remove a site an employee is assigned to", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "1", "HQ" ) ] );
        const issues = await validators.workSitesReferentialIntegrity( { OF1: site( "OF1" ) }, {} );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "reference-integrity" );
        assert.equal( issues[ 0 ].path, ".HQ" );
    } );

    it( "names no employee in the message", async () => {
        // The issue text reaches an admin screen. A site code is configuration; a person is not.
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "90001", "HQ" ) ] );
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues[ 0 ].message.includes( "90001" ), false );
    } );

    it( "reports a site held by many employees exactly once", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [
            employeeAt( "1", "HQ" ), employeeAt( "2", "HQ" ), employeeAt( "3", "HQ" )
        ] );
        assert.equal( ( await validators.workSitesReferentialIntegrity( {}, {} ) ).length, 1 );
    } );

    it( "ignores an employee with no work site", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [
            { employeeID: "1", personal: { firstName: "A", lastName: "B" } },
            { employeeID: "2" }
        ] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( {}, {} ), [] );
    } );

    it( "skips the check when the data layer is absent, so config-only validation still works", async () => {
        // fetchEmployeesForValidation resolves [] rather than rejecting when there is no data layer at all.
        validators.fetchEmployeesForValidation = () => Promise.resolve( [] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( {}, {} ), [] );
    } );

    it( "BLOCKS when the employee fetch fails, rather than passing", async () => {
        validators.fetchEmployeesForValidation = () => Promise.reject( new Error( "cache down" ) );
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].path, "." );
        assert.match( issues[ 0 ].message, /could not be verified/ );
    } );

    it( "blocks on a synchronous throw from the seam too", async () => {
        validators.fetchEmployeesForValidation = () => { throw new Error( "boom" ); };
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues.length, 1 );
        assert.match( issues[ 0 ].message, /could not be verified/ );
    } );

} );
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test packages/competence/test/work-sites-referential-integrity.test.js`
Expected: FAIL — `validators.workSitesReferentialIntegrity is not a function`

- [ ] **Step 4: Extract the shared helper**

In `packages/competence/application/config-validators.js`, add above `roleFamiliesReferentialIntegrity`:

```js
/**
 * Runs a per-employee reference check against the live employee records, owning the three parts every such check
 * needs to get right: the deferred seam call, the fail-closed branch, and de-duplication by path.
 * <br/>
 * **Fail-closed is the load-bearing property.** {@link fetchEmployeesForValidation} resolves `[]` when the data
 * layer is simply absent — outside the running service — so config-only validation still works. Reaching the catch
 * therefore means a *genuine* fetch failure against an operational data layer, and the removal is refused rather
 * than allowed: a transient cache error must not be the thing that orphans employee records.
 * <br/>
 * The seam call is deferred through `Promise.resolve()` so that a synchronous throw (from a test stub) and an
 * async rejection both route to the same branch.
 *
 * @method
 * @param {Array<ValidationIssue>} issues - Issues collected so far; appended to and returned de-duplicated.
 * @param {function(Object, Array<ValidationIssue>): void} inspect - Called once per employee to append any issue.
 * @returns {Promise<Array<ValidationIssue>>}
 * @private
 */
function withEmployeeReferences( issues, inspect ) {
    return Promise.resolve()
        .then( () => module.exports.fetchEmployeesForValidation() )
        .then( ( employees ) => employees || [] )
        .catch( () => {
            issues.push( {
                path: ".",
                message: "employee references could not be verified against the data layer; the change was rejected to avoid orphaning employee records — retry once the data layer is reachable",
                code: "reference-integrity"
            } );
            return [];
        } )
        .then( ( employees ) => {
            for ( const employee of employees ) {
                inspect( employee, issues );
            }
            const seen = {};
            return issues.filter( ( issue ) => {
                if ( seen[ issue.path ] ) {
                    return false;
                }
                seen[ issue.path ] = true;
                return true;
            } );
        } );
}
```

- [ ] **Step 5: Rewrite the shipped validator to use it**

Replace `roleFamiliesReferentialIntegrity`'s employee half. Its active-competency-sets half is unchanged; only the tail changes, from the inline scaffolding to:

```js
        return withEmployeeReferences( issues, ( employee, collected ) => {
            const career = employee && employee.career;
            if ( !career || !career.roleFamily ) {
                return;
            }
            const family = families[ career.roleFamily ];
            if ( !family ) {
                collected.push( { path: `.${ career.roleFamily }`, message: `role family '${ career.roleFamily }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
            } else if ( career.specialization && !( family.specializations || {} )[ career.specialization ] ) {
                collected.push( { path: `.${ career.roleFamily }.specializations.${ career.specialization }`, message: `specialization '${ career.roleFamily }.${ career.specialization }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
            }
        } );
```

Every issue message must stay **byte-identical** to what it was. The 14 existing cases assert on them, and this is a behaviour-preserving refactor — a changed message is a behaviour change wearing a refactor's clothes.

Note the structural change: the active-sets `.then()` previously returned the employees array and a second `.then()` consumed it. Now the first `.then()` returns `withEmployeeReferences(...)` directly. Read the existing promise chain carefully before restructuring it, and keep the active-sets checks running *before* the employee fetch, exactly as now.

- [ ] **Step 6: Prove the refactor preserved behaviour**

Run: `node --test packages/competence/test/config-management.test.js`
Expected: PASS, all 14 cases, **with the test file unmodified**. If a case fails, the refactor changed behaviour — fix the code, never the test. If you believe a test is genuinely wrong, stop and report rather than editing it.

- [ ] **Step 7: Write the new validator on the same helper**

After `workSiteIdMatchesKey`:

```js
/**
 * work-sites: a site may only be removed when no employee is assigned to it. Shares the seam, the fail-closed
 * branch and the de-duplication with {@link roleFamiliesReferentialIntegrity} through
 * {@link withEmployeeReferences}, so the two cannot drift on the part that is easy to get wrong.
 * <br/>
 * This is a *removal* check, which is why it can be a validator at all. CA-107's unresolved-manager rule is a
 * *presence* check — "every unit's managerID must resolve to an employee" — and had to become a startup diagnostic
 * because it fires on a fresh install, where the tree must exist before any employee can reference it. Nothing is
 * removed on a fresh install, so this one never fires there.
 * <br/>
 * No message names an employee: the text reaches an admin screen, and a site code is configuration while a person
 * is not.
 *
 * @method
 * @param {Object} value - The pending work-sites document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function workSitesReferentialIntegrity( value, context ) {
    const sites = value || {};
    return withEmployeeReferences( [], ( employee, collected ) => {
        const workSite = employee && employee.personal && employee.personal.workSite;
        if ( workSite && !sites[ workSite ] ) {
            collected.push( {
                path: `.${ workSite }`,
                message: `work site '${ workSite }' is assigned to an employee and cannot be removed`,
                code: "reference-integrity"
            } );
        }
    } );
}
```

The `context` parameter is unused but kept for consistency with every other referential validator.

Add `workSitesReferentialIntegrity` to `module.exports`, after `workSiteIdMatchesKey`. Do **not** export `withEmployeeReferences` — nothing outside this module calls it, and exporting it would invite a caller that bypasses the fail-closed contract.

- [ ] **Step 8: Run both suites**

Run: `node --test packages/competence/test/work-sites-referential-integrity.test.js` — expected PASS, 8 cases.
Run: `node --test packages/competence/test/config-management.test.js` — expected PASS, unmodified.

- [ ] **Step 9: Wire it into the registration**

In `packages/competence/application/config-registration.js`, change the `work-sites` registration's `validators` array from:

```js
        validators: [ validators.workSiteIdMatchesKey ],
```

to:

```js
        validators: [ validators.workSiteIdMatchesKey, validators.workSitesReferentialIntegrity ],
```

- [ ] **Step 10: Run the full suite and lint**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 798 tests.

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 11: Commit**

Two commits, because the refactor and the feature are separately reviewable and separately revertable:

```bash
git add packages/competence/application/config-validators.js
git commit -m "refactor(competence): share the employee-reference scaffolding between referential validators (CA-109)"

git add packages/competence/application/config-validators.js packages/competence/application/config-registration.js packages/competence/test/work-sites-referential-integrity.test.js
git commit -m "feat(competence): refuse to remove a work site an employee is assigned to (CA-109)"
```

If the first `git add` would stage both validators at once because they live in one file, commit once instead with the `feat` message and note in the report that the refactor could not be separated.

---

## Task 3: The employee record fields

**Files:**
- Modify: `packages/competence/bin/data/schemas/employee.schema.json`
- Modify: `packages/competence/application/data-objects.types.js`
- Modify: `packages/competence/application/employee-rules.js`
- Modify: `packages/competence/bin/competence-web-application.js` (two context sites)
- Modify: `packages/competence/bin/build/import-organization.js` (one context site)
- Create: `packages/competence/test/employee-new-fields.test.js`

**Interfaces:**
- Consumes: `configurationLoader.configWorkSites` (Task 1).
- Produces: `EmployeeRulesContext` gains `workSites: Object<string, WorkSite>`. `validateEmployee` returns the new keys `"error.employee.invalid-work-site"` and `"error.employee.invalid-gender"`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/employee-new-fields.test.js` (AGPL header from `packages/competence/application/employee-rules.js`). This file covers `validateEmployee` only; Task 4 appends the `mapRow` describes to it.

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * The three fields added in CA-109 — personal.workSite, career.positionName and the M/F constraint on
 * personal.gender — checked at the rules layer.
 *
 * Constraining gender here as well as in mapRow is the point: Employee Management and the importer are two write
 * paths onto the same record, and a value one accepts while the other rejects is a record that cannot be
 * re-imported. validateEmployee is what both of them call.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const employeeRules = require( "../application/employee-rules" );

const CONTEXT = {
    roleFamilies: { SE: { specializations: { BACKEND: {} } } },
    organizationStructure: { "1": { id: "1" } },
    workSites: { HQ: { id: "HQ", type: "office", name: { en: "HQ", bg: "HQ" } } }
};

const employee = ( personal, career ) => ( {
    employeeID: "1",
    personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", ...personal },
    career: { organizationUnitID: "1", roleFamily: "SE", level: "R", stage: 2, ...career }
} );

describe( "validateEmployee — workSite", () => {

    it( "accepts a record with no work site at all", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    it( "accepts a known site", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "HQ" } ), CONTEXT ), null );
    } );

    it( "rejects an unknown site", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "NOPE" } ), CONTEXT ),
            "error.employee.invalid-work-site" );
    } );

    it( "rejects any site when the context carries no nomenclature", () => {
        // A caller that forgets to pass workSites must fail closed, not silently accept every value.
        const { workSites, ...withoutSites } = CONTEXT;
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "HQ" } ), withoutSites ),
            "error.employee.invalid-work-site" );
    } );

} );

describe( "validateEmployee — gender", () => {

    for ( const value of [ "M", "F" ] ) {
        it( `accepts '${ value }'`, () => {
            assert.equal( employeeRules.instance.validateEmployee( employee( { gender: value } ), CONTEXT ), null );
        } );
    }

    it( "accepts an absent gender", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    for ( const value of [ "m", "Male", "X", "Ж" ] ) {
        it( `rejects '${ value }'`, () => {
            assert.equal( employeeRules.instance.validateEmployee( employee( { gender: value } ), CONTEXT ),
                "error.employee.invalid-gender" );
        } );
    }

} );

describe( "validateEmployee — positionName", () => {

    it( "accepts any free text, and its absence", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( {}, { positionName: "Старши експерт" } ), CONTEXT ), null );
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

} );
```

Note `validateEmployee` receives an already-normalized record: `mapRow` upper-cases `gender` before this point, which is why `"m"` is rejected *here* while the CSV accepts it (Task 4).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/employee-new-fields.test.js`
Expected: FAIL — the unknown-site case returns `null` instead of the new key.

- [ ] **Step 3: Extend the rules**

In `packages/competence/application/employee-rules.js`, extend the `EmployeeRulesContext` typedef (~line 10):

```js
 * @property {Object} workSites - The work-sites nomenclature, keyed by site code.
```

Add the permitted genders beside the other frozen constants (~line 18):

```js
const GENDERS = Object.freeze( [ "M", "F" ] );
```

In `validateEmployee`, after the `structure` line (~line 62):

```js
        const sites = ctx.workSites || {};
```

Then, immediately after the `workLocation` check (~line 74):

```js
        const workSite = employee.personal.workSite;
        if ( workSite && !sites[ workSite ] ) {
            return "error.employee.invalid-work-site";
        }
        const gender = employee.personal.gender;
        if ( gender && !GENDERS.includes( gender ) ) {
            return "error.employee.invalid-gender";
        }
```

`positionName` is free text and needs no check — its absence from this function is deliberate, not an omission.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/competence/test/employee-new-fields.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Extend the employee schema**

In `packages/competence/bin/data/schemas/employee.schema.json`, inside `personal.properties`, replace the `gender` block with:

```json
        "gender": {
          "type": "string",
          "enum": [
            "M",
            "F"
          ],
          "description": "Gender of the employee. Constrained to M/F so the importer and Employee Management cannot disagree about what is valid; absent when unspecified."
        },
```

and add, after `workLocation`:

```json
        ,
        "workSite": {
          "type": "string",
          "minLength": 1,
          "description": "Work-site code — the office or client premises this employee reports to. Distinct from workLocation, which records the On-site/Hybrid/Remote arrangement. Runtime-validated against the work-sites configuration."
        }
```

(Adjust the comma placement to keep the JSON valid: `workLocation` gains a trailing comma and `workSite` becomes the last property.)

Inside `career.properties`, after `specialization`, add:

```json
        "positionName": {
          "type": "string",
          "description": "The employee's position exactly as written in their contract. Free text, and deliberately not an input to grading — roleFamily, level and stage are what the appraisal system uses."
        },
```

Both `personal` and `career` declare `"additionalProperties": false`, so a field absent from the schema is rejected outright — this step is what makes the rest of the feature storable at all.

- [ ] **Step 6: Extend the typedefs**

In `packages/competence/application/data-objects.types.js`, in `EmployeePersonalInformation` (~line 237), change the `gender` line and add `workSite`:

```js
 * @property {"M"|"F"} [gender] - Gender of the employee. Absent when unspecified.
 * @property {string} [workSite] - Work-site code, from the work-sites configuration. The place the employee reports
 *                                 to, as opposed to `workLocation`, which is the On-site/Hybrid/Remote arrangement.
```

In `EmployeeCareerInformation` (~line 246), after `specialization`:

```js
 * @property {string} [positionName] - The position as written in the employee's contract. Free text; not an input
 *                                     to grading.
```

And add a new typedef near the other configuration ones (after `ConfigRoleFamilies`, ~line 40):

```js
/**
 * @typedef {Object} WorkSite
 * @property {string} id - Site code; equals its map key (enforced by `workSiteIdMatchesKey`).
 * @property {"office"|"client"} type - A company office, or client premises.
 * @property {{en: string, bg: string}} name - Inline bilingual display name. Inline rather than a localization key
 *                                             so an edit takes effect on save rather than after a redeploy.
 */
```

- [ ] **Step 7: Pass the nomenclature at all three context sites**

Every caller that builds an `EmployeeRulesContext` must now supply `workSites`, or the check above fails closed and rejects every assigned site. There are exactly three:

`packages/competence/bin/competence-web-application.js` ~line 4163 (`#deriveImportPlan`):

```js
            const plan = organizationImport.instance.reconcile( employees, existing, {
                roleFamilies: configurationLoader.configRoleFamilies,
                organizationStructure: configurationLoader.configOrganizationStructure,
                workSites: configurationLoader.configWorkSites
            } );
```

`packages/competence/bin/competence-web-application.js` ~line 4651 (`#validateEmployeeFields`):

```js
        return employeeRules.instance.validateEmployee( employee, {
            roleFamilies: configurationLoader.configRoleFamilies,
            organizationStructure: configurationLoader.configOrganizationStructure,
            workSites: configurationLoader.configWorkSites
        } );
```

`packages/competence/bin/build/import-organization.js` ~line 310:

```js
            const plan = organizationImport.instance.reconcile( employees, existing, {
                roleFamilies: configurationLoader.configRoleFamilies,
                organizationStructure: configurationLoader.configOrganizationStructure,
                workSites: configurationLoader.configWorkSites
            } );
```

Verify none were missed:

```bash
grep -c "workSites: configurationLoader.configWorkSites" packages/competence/bin/competence-web-application.js packages/competence/bin/build/import-organization.js
```

Expected: `2` and `1`.

- [ ] **Step 8: Run the full suite**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 810 tests.

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/competence/bin/data/schemas/employee.schema.json packages/competence/application/data-objects.types.js packages/competence/application/employee-rules.js packages/competence/bin/competence-web-application.js packages/competence/bin/build/import-organization.js packages/competence/test/employee-new-fields.test.js
git commit -m "feat(competence): add workSite and positionName to the employee record and constrain gender (CA-109)"
```

---

## Task 4: The CSV contract

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Modify: `packages/competence/test/employee-new-fields.test.js` (append)

**Interfaces:**
- Consumes: `validateEmployee`'s new keys (Task 3).
- Produces: `OPTIONAL_COLUMNS` gains `work_site` and `position_name`; `mapRow` emits `personal.workSite` and `career.positionName` when non-blank and omits them when blank; `LEAVE_UNCHANGED_WHEN_OMITTED` gains both.

- [ ] **Step 1: Write the failing test**

Append to `packages/competence/test/employee-new-fields.test.js`:

```js
const organizationImport = require( "../application/organization-import" );

const row = ( overrides ) => ( {
    __row: 2,
    employee_id: "1", email: "a@b.com", first_name: "A", last_name: "B",
    work_mode: "Full-time", work_location: "On-site",
    organization_unit_id: "1", role_family: "SE", level: "R", stage: "2",
    ...overrides
} );

describe( "mapRow — work_site and position_name", () => {

    it( "carries a supplied work_site through verbatim", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { work_site: "HQ" } ) );
        assert.equal( error, null );
        assert.equal( employee.personal.workSite, "HQ" );
    } );

    it( "OMITS workSite entirely when the cell is blank", () => {
        // Not an explicit null. Redis JSON.MERGE is RFC 7386 merge-patch: an omitted key is left untouched, while
        // an explicit null DELETES it. Omitting is what makes "blank leaves the stored value alone" true.
        const { employee } = organizationImport.instance.mapRow( row( { work_site: "   " } ) );
        assert.equal( Object.hasOwn( employee.personal, "workSite" ), false );
    } );

    it( "carries position_name through verbatim, trimmed", () => {
        const { employee } = organizationImport.instance.mapRow( row( { position_name: "  Старши експерт  " } ) );
        assert.equal( employee.career.positionName, "Старши експерт" );
    } );

    it( "OMITS positionName when the cell is blank", () => {
        const { employee } = organizationImport.instance.mapRow( row( { position_name: "" } ) );
        assert.equal( Object.hasOwn( employee.career, "positionName" ), false );
    } );

    it( "does not require either column", () => {
        const { employee, error } = organizationImport.instance.mapRow( row() );
        assert.equal( error, null );
        assert.equal( Object.hasOwn( employee.personal, "workSite" ), false );
        assert.equal( Object.hasOwn( employee.career, "positionName" ), false );
    } );

    it( "lists both as optional columns, never required", () => {
        assert.equal( organizationImport.instance.COLUMNS.optional.includes( "work_site" ), true );
        assert.equal( organizationImport.instance.COLUMNS.optional.includes( "position_name" ), true );
        assert.equal( organizationImport.instance.COLUMNS.required.includes( "work_site" ), false );
        assert.equal( organizationImport.instance.COLUMNS.required.includes( "position_name" ), false );
    } );

} );

describe( "mapRow — gender", () => {

    it( "accepts M and F", () => {
        assert.equal( organizationImport.instance.mapRow( row( { gender: "M" } ) ).employee.personal.gender, "M" );
        assert.equal( organizationImport.instance.mapRow( row( { gender: "F" } ) ).employee.personal.gender, "F" );
    } );

    it( "upper-cases a lower-case cell", () => {
        // Mechanical normalization — trim and case — is permitted. This is not a synonym table.
        assert.equal( organizationImport.instance.mapRow( row( { gender: " f " } ) ).employee.personal.gender, "F" );
    } );

    it( "omits gender when the cell is blank", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { gender: "" } ) );
        assert.equal( error, null );
        assert.equal( Object.hasOwn( employee.personal, "gender" ), false );
    } );

    it( "rejects 'Male' rather than guessing it meant M", () => {
        // Guessing what a value meant is how a person is silently recorded wrong. The module has no synonym table
        // for work_mode or work_location either.
        const { employee, error } = organizationImport.instance.mapRow( row( { gender: "Male" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "gender" );
        assert.equal( error.code, "not-a-permitted-value" );
        assert.match( error.message, /M, F/ );
    } );

    it( "names no cell value other than the column in the rejection", () => {
        const { error } = organizationImport.instance.mapRow( row( { gender: "Жена" } ) );
        assert.equal( error.message.includes( "Жена" ), false );
    } );

} );

describe( "blank cells cannot clear a stored value", () => {

    it( "lists work_site and position_name among the leave-unchanged fields", () => {
        // A record already carrying either must re-import as `unchanged`, not reclassify as `update` forever.
        const stored = {
            employeeID: "1", email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: "HQ" },
            career: { organizationUnitID: "1", roleFamily: "SE", specialization: null, level: "R", stage: 2, positionName: "Expert" }
        };
        const { employee } = organizationImport.instance.mapRow( row() );
        const plan = organizationImport.instance.reconcile( [ employee ], [ stored ], {
            roleFamilies: { SE: { specializations: {} } },
            organizationStructure: { "1": { id: "1" } },
            workSites: { HQ: { id: "HQ", type: "office", name: { en: "HQ", bg: "HQ" } } }
        } );
        assert.equal( plan.unchanged.length, 1, "a blank cell must not read as a change" );
        assert.equal( plan.update.length, 0 );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/employee-new-fields.test.js`
Expected: FAIL — `employee.personal.workSite` is `undefined`.

- [ ] **Step 3: Extend the column contract**

In `packages/competence/application/organization-import.js` (~line 18), extend `OPTIONAL_COLUMNS`:

```js
const OPTIONAL_COLUMNS = Object.freeze( [ "employment_status", "birth_date", "gender", "specialization", "starting_date", "work_site", "position_name" ] );
```

Add the permitted genders beside `WORK_LOCATIONS` (~line 21):

```js
const GENDERS = Object.freeze( [ "M", "F" ] );
```

Extend `LEAVE_UNCHANGED_WHEN_OMITTED` (~line 42) and its comment. Add to the array:

```js
    { group: "personal", field: "workSite" },
    { group: "career", field: "positionName" }
```

and append to the block comment above it:

```js
// <br/>
// `personal.workSite` and `career.positionName` (CA-109) join them for the same mechanical reason and one
// deliberate one: an HR export that omits a column's values must not wipe every office assignment in a single
// irreversible apply. The cost is that neither field can be CLEARED by re-importing a blank cell — that is
// Employee Management's job, exactly as it already is for birthDate and gender.
```

- [ ] **Step 4: Extend `mapRow`**

In `mapRow`, after the `workLocation` check (~line 285):

```js
        const rawGender = read( "gender" );
        const gender = rawGender.length === 0 ? "" : this.#matchEnum( rawGender, GENDERS );
        if ( rawGender.length > 0 && !gender ) {
            return fail( "gender", "not-a-permitted-value", `'gender' must be one of: ${ GENDERS.join( ", " ) }` );
        }
```

Delete the existing `const gender = read( "gender" );` line further down (~line 308) — the new binding replaces it.

Add the two reads beside the others (~line 306):

```js
        const workSite = read( "work_site" );
        const positionName = read( "position_name" );
```

In the `personal` object literal, after the existing `gender` spread:

```js
                ...( workSite ? { workSite: workSite } : {} )
```

In the `career` object literal, after the `startingDate` spread:

```js
                ...( positionName ? { positionName: positionName } : {} )
```

Verify `#matchEnum` upper-cases correctly for single letters — it trims, lower-cases and collapses separators, then compares against each permitted value normalized the same way, returning the **permitted** value. So `" f "` returns `"F"`. Read the method before relying on this; if it returns the input rather than the permitted value, use `GENDERS.find( ( g ) => g === rawGender.trim().toUpperCase() )` instead.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test packages/competence/test/employee-new-fields.test.js`
Expected: PASS, 24 tests.

- [ ] **Step 6: Update the CLI template header**

`--template` emits the header from the column contract, so confirm it now includes both columns:

```bash
node packages/competence/bin/build/import-organization.js --template
```

Expected: a single header line ending `...,starting_date,work_site,position_name`. If it does not, find where the template line is built (`packages/competence/bin/build/import-organization.js` ~line 363) and make it derive from `organizationImport.instance.COLUMNS` rather than a literal.

- [ ] **Step 7: Run the full suite**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 822 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/employee-new-fields.test.js packages/competence/bin/build/import-organization.js
git commit -m "feat(competence): accept work_site and position_name, and constrain gender, in the CSV contract (CA-109)"
```

---

## Task 5: The confusable-code guard

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Create: `packages/competence/test/work-site-confusables.test.js`

**Interfaces:**
- Consumes: `OPTIONAL_COLUMNS` and `mapRow` from Task 4.
- Produces: `organizationImport.instance.foldConfusables( text ) → string`, and a `work_site` rejection whose message names the offending character when the code is a confusable near-match.

A `work_site` that names no known site is **not** rejected by `mapRow` — `mapRow` has no access to the nomenclature, and `validateEmployee` (Task 3) owns that check. So this task adds the folding helper plus its use in the *rules* layer's message path. Read Step 3 carefully: the guard lives where the nomenclature is.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/work-site-confusables.test.js` (AGPL header from `packages/competence/application/employee-rules.js`):

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * Confusable work-site codes (CA-109).
 *
 * The real HR data mixes alphabets: the Stara Zagora office is 'О5', beginning with CYRILLIC О (U+041E), while
 * every other code uses LATIN O (U+004F). The two render identically in every font and compare unequal.
 *
 * Without this, an unknown-code rejection lists the permitted codes — so the operator is shown 'O5' as permitted,
 * pixel-identical to the 'О5' they typed, with no way to see the difference. Folding exists to phrase that error,
 * and for nothing else: the value stays REJECTED. Accepting a Cyrillic О as a Latin O would be the synonym table
 * mapRow forbids, and would write a person to the wrong site rather than telling anyone.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "../application/organization-import" );

const CYRILLIC_O5 = "О5";
const LATIN_O5 = "O5";

describe( "foldConfusables", () => {

    it( "folds a Cyrillic О onto a Latin O", () => {
        assert.equal( organizationImport.instance.foldConfusables( CYRILLIC_O5 ), LATIN_O5 );
    } );

    it( "leaves an all-Latin code untouched", () => {
        assert.equal( organizationImport.instance.foldConfusables( LATIN_O5 ), LATIN_O5 );
    } );

    it( "folds every pair in the table", () => {
        assert.equal( organizationImport.instance.foldConfusables( "АВЕКМНОРСТУХ" ), "ABEKMHOPCTYX" );
    } );

    it( "leaves a Cyrillic letter with no Latin lookalike alone", () => {
        // Ж, Ъ, Щ and friends are not confusable with anything and must not be mangled.
        assert.equal( organizationImport.instance.foldConfusables( "ЖЪЩ" ), "ЖЪЩ" );
    } );

    it( "tolerates a non-string", () => {
        assert.equal( organizationImport.instance.foldConfusables( null ), "" );
        assert.equal( organizationImport.instance.foldConfusables( undefined ), "" );
    } );

} );

describe( "describeWorkSiteMiss", () => {

    const SITES = { O5: { id: "O5", type: "office", name: { en: "x", bg: "x" } }, HQ: { id: "HQ", type: "office", name: { en: "y", bg: "y" } } };

    it( "names the confusable character when the code folds onto a real one", () => {
        const detail = organizationImport.instance.describeWorkSiteMiss( CYRILLIC_O5, SITES );
        assert.equal( detail.code, "confusable-character" );
        assert.equal( detail.match, LATIN_O5 );
    } );

    it( "reports a plain miss as a plain miss", () => {
        const detail = organizationImport.instance.describeWorkSiteMiss( "ZZ9", SITES );
        assert.equal( detail.code, "unknown-work-site" );
        assert.equal( detail.match, null );
    } );

    it( "does not claim a confusable when the code already matches", () => {
        assert.equal( organizationImport.instance.describeWorkSiteMiss( "O5", SITES ), null );
    } );

    it( "never treats folding as acceptance", () => {
        // The whole point: this reports, it does not resolve. The caller must still reject the value.
        const detail = organizationImport.instance.describeWorkSiteMiss( CYRILLIC_O5, SITES );
        assert.notEqual( detail, null, "a confusable code is still a miss" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/work-site-confusables.test.js`
Expected: FAIL — `foldConfusables is not a function`

- [ ] **Step 3: Implement both helpers**

In `packages/competence/application/organization-import.js`, add the table beside the other frozen constants (~line 22):

```js
// Cyrillic letters whose uppercase glyph is indistinguishable from a Latin one in every common font. Used ONLY to
// explain a failed match (see foldConfusables) — never to resolve one.
const CONFUSABLE_TO_LATIN = Object.freeze( {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X"
} );
```

Then add both public methods to the class, after `mapRows`:

```js
    /**
     * Replaces every Cyrillic character that is glyph-identical to a Latin one with that Latin letter. Pure.
     * <br/>
     * **This exists to phrase an error, never to accept a value.** The real HR data contains a Stara Zagora site
     * coded `О5` with a Cyrillic О while every sibling uses a Latin O; the two render identically and compare
     * unequal, so an unknown-code rejection would list `O5` as permitted, pixel-identical to what the operator
     * typed. Folding lets {@link OrganizationImport#describeWorkSiteMiss} say which character is wrong. Folding to
     * *match* would be the synonym table this module refuses everywhere else, and would file a person under a site
     * they were never assigned to.
     *
     * @method
     * @param {string} [text]
     * @returns {string}
     * @public
     */
    foldConfusables( text ) {
        return String( text == null ? "" : text ).replace( /[Ѐ-ӿ]/g, ( character ) => CONFUSABLE_TO_LATIN[ character ] || character );
    }

    /**
     * Explains why a work-site code matched nothing, or returns `null` when it in fact matched. Pure.
     * <br/>
     * Returns `{ code: "confusable-character", match }` when the code folds onto a real site — the operator typed a
     * lookalike letter — and `{ code: "unknown-work-site", match: null }` otherwise. A non-null return always means
     * the value is **rejected**; the distinction only changes what the operator is told.
     *
     * @method
     * @param {string} rawCode - The code as supplied.
     * @param {Object<string, WorkSite>} sites - The work-sites nomenclature.
     * @returns {{code: string, match: string|null}|null}
     * @public
     */
    describeWorkSiteMiss( rawCode, sites ) {
        const known = sites || {};
        const code = String( rawCode == null ? "" : rawCode );
        if ( known[ code ] ) {
            return null;
        }
        const folded = this.foldConfusables( code );
        if ( folded !== code && known[ folded ] ) {
            return { code: "confusable-character", match: folded };
        }
        return { code: "unknown-work-site", match: null };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/competence/test/work-site-confusables.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Surface it in the rejection message**

`reconcile` turns a `validateEmployee` key into a rejection. Find where that happens (`packages/competence/application/organization-import.js`, in `reconcile`, the `reject( candidate, violation, violation )` call around line 579) and special-case the work-site key so the message carries the detail. Read the surrounding code first, then extend it:

```js
            const violation = employeeRules.instance.validateEmployee( candidate, context );
            if ( violation ) {
                if ( violation === "error.employee.invalid-work-site" ) {
                    const miss = this.describeWorkSiteMiss( candidate.personal && candidate.personal.workSite, context.workSites );
                    if ( miss && miss.code === "confusable-character" ) {
                        reject( candidate, violation, `work_site '${ candidate.personal.workSite }' uses a Cyrillic character; the permitted code '${ miss.match }' is spelled with Latin letters` );
                        continue;
                    }
                }
                reject( candidate, violation, violation );
                continue;
            }
```

Match the exact shape of the existing call — the surrounding loop may use a different control flow than `continue`. Do not restructure it; only add the branch.

- [ ] **Step 6: Add an end-to-end test**

Append to `packages/competence/test/work-site-confusables.test.js`:

```js
describe( "a confusable code end to end", () => {

    it( "rejects the row and explains the character rather than listing lookalikes", () => {
        const employee = {
            employeeID: "1", email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: CYRILLIC_O5 },
            career: { organizationUnitID: "1", roleFamily: "SE", specialization: null, level: "R", stage: 2 }
        };
        const plan = organizationImport.instance.reconcile( [ employee ], [], {
            roleFamilies: { SE: { specializations: {} } },
            organizationStructure: { "1": { id: "1" } },
            workSites: { O5: { id: "O5", type: "office", name: { en: "x", bg: "x" } } }
        } );
        assert.equal( plan.rejected.length, 1, "the value is rejected, never folded into a match" );
        assert.equal( plan.create.length, 0 );
        assert.match( plan.rejected[ 0 ].message, /Cyrillic/ );
        assert.match( plan.rejected[ 0 ].message, /Latin/ );
    } );

} );
```

Run: `node --test packages/competence/test/work-site-confusables.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 832 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/test/work-site-confusables.test.js
git commit -m "fix(competence): explain a confusable work-site code instead of listing lookalike values (CA-109)"
```

---

## Task 6: The Work Sites composite editor

**Files:**
- Modify: `packages/competence/application/config-editors.js`
- Create: `packages/competence/test/work-sites-editor.test.js`

**Interfaces:**
- Consumes: the `work-sites` document (Task 1).
- Produces: `composeWorkSites( docs ) → { sites: Array<{ code, type, name: {en, bg} }> }` and `decomposeWorkSites( editedView, docs ) → { "work-sites": Object<string, WorkSite> }`. Registered as editor name `"work-sites"`, reachable at `/admin/config/editors/work-sites`.

Unlike role families, site identities are **not** fixed by schema — the whole point is that an admin adds and removes them. So `decompose` treats the submitted list as the complete set: unlisted codes are removed.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/work-sites-editor.test.js` (AGPL header from `packages/competence/application/employee-rules.js`):

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * The work-sites composite editor (CA-109).
 *
 * Unlike role families, whose codes are fixed by schema and whose decompose ignores unknown ones, a work site's
 * whole purpose is to be added and removed by an admin. So the submitted list is the COMPLETE set: an omitted code
 * is a removal. That is only safe because workSitesReferentialIntegrity refuses to remove a site somebody is
 * assigned to — the editor deliberately does not repeat that check, so the rule has exactly one home.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const editors = require( "../application/config-editors" );

const DOCS = {
    "work-sites": {
        HQ: { id: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } },
        CL1: { id: "CL1", type: "client", name: { en: "Client Site", bg: "Клиентски обект" } }
    }
};

describe( "composeWorkSites", () => {

    it( "projects every site as an editable row", () => {
        const view = editors.composeWorkSites( DOCS );
        assert.equal( view.sites.length, 2 );
        const hq = view.sites.find( ( s ) => s.code === "HQ" );
        assert.deepEqual( hq, { code: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } } );
    } );

    it( "returns an empty list rather than throwing on an absent document", () => {
        assert.deepEqual( editors.composeWorkSites( {} ), { sites: [] } );
        assert.deepEqual( editors.composeWorkSites( null ), { sites: [] } );
    } );

} );

describe( "decomposeWorkSites", () => {

    it( "round-trips compose output unchanged", () => {
        const result = editors.decomposeWorkSites( editors.composeWorkSites( DOCS ), DOCS );
        assert.deepEqual( result[ "work-sites" ], DOCS[ "work-sites" ] );
    } );

    it( "adds a new site, stamping its id from its code", () => {
        // id must equal the key or workSiteIdMatchesKey blocks the save; deriving it removes the chance to disagree.
        const view = { sites: [ { code: "O3", type: "office", name: { en: "Plovdiv", bg: "Пловдив" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].O3.id, "O3" );
    } );

    it( "removes a site omitted from the submitted list", () => {
        const view = { sites: [ { code: "HQ", type: "office", name: { en: "Head Office", bg: "Централно управление" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( Object.hasOwn( result[ "work-sites" ], "CL1" ), false );
    } );

    it( "renames and retypes in place", () => {
        const view = { sites: [ { code: "HQ", type: "client", name: { en: "Renamed", bg: "Преименуван" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].HQ.type, "client" );
        assert.equal( result[ "work-sites" ].HQ.name.en, "Renamed" );
    } );

    it( "keeps the stored side of a name the payload omits", () => {
        // A client that drops the read-only reference language must not blank it.
        const view = { sites: [ { code: "HQ", type: "office", name: { en: "Only EN" } } ] };
        const result = editors.decomposeWorkSites( view, DOCS );
        assert.equal( result[ "work-sites" ].HQ.name.bg, "Централно управление" );
    } );

    it( "skips a row with no code rather than writing an empty key", () => {
        const result = editors.decomposeWorkSites( { sites: [ { code: "", type: "office", name: { en: "x", bg: "y" } } ] }, DOCS );
        assert.deepEqual( result[ "work-sites" ], {} );
    } );

    it( "accepts a bare array as well as the wrapped view", () => {
        const result = editors.decomposeWorkSites( [ { code: "HQ", type: "office", name: { en: "A", bg: "Б" } } ], DOCS );
        assert.equal( result[ "work-sites" ].HQ.name.en, "A" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/work-sites-editor.test.js`
Expected: FAIL — `editors.composeWorkSites is not a function`

- [ ] **Step 3: Implement the editor**

In `packages/competence/application/config-editors.js`, before `registerCompetenceEditors`, add:

```js
/**
 * Projects the work-sites document as a flat list of editable rows.
 *
 * @method
 * @param {Object} docs `{ "work-sites" }`
 * @returns {{sites: Array<Object>}}
 * @public
 */
function composeWorkSites( docs ) {
    const sites = ( docs && docs[ "work-sites" ] ) || {};
    const rows = Object.keys( sites ).map( ( code ) => {
        const entry = sites[ code ] || {};
        return {
            code: code,
            type: entry.type === "client" ? "client" : "office",
            name: pair( entry.name )
        };
    } );
    return { sites: rows };
}

/**
 * Rebuilds the work-sites document from the edited rows. **The submitted list is the complete set** — a code that
 * is not in it is removed. That differs deliberately from {@link decomposeRoleFamilies}, whose family identities are
 * fixed by schema: a work site exists precisely so an admin can add and remove it.
 * <br/>
 * Removal is safe here only because `workSitesReferentialIntegrity` refuses to drop a site an employee is assigned
 * to. This function deliberately does **not** repeat that check — the rule has one home, and duplicating it here
 * would let the two drift while making the screen the only guarded path.
 * <br/>
 * `id` is stamped from the row's `code` rather than trusted from the payload: they must be equal or
 * `workSiteIdMatchesKey` blocks the save, and deriving it removes the chance for them to disagree at all.
 *
 * @method
 * @param {Array<Object>|{sites: Array<Object>}} editedView rows from {@link composeWorkSites}
 * @param {Object} docs current `{ "work-sites" }`
 * @returns {Object<string, Object>} `{ "work-sites": newValue }`
 * @public
 */
function decomposeWorkSites( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.sites ) || [] );
    const existing = ( docs && docs[ "work-sites" ] ) || {};
    const next = {};

    rows.forEach( ( row ) => {
        if ( !row || !row.code ) {
            return;
        }
        const stored = existing[ row.code ] || {};
        next[ row.code ] = {
            id: row.code,
            type: row.type === "client" ? "client" : "office",
            name: mergePair( row.name, stored.name )
        };
    } );

    return { "work-sites": next };
}

/**
 * The `work-sites` composite editor definition (the office/client nomenclature; text stored inline, not in labels).
 *
 * @constant
 * @type {Object}
 */
const workSitesEditor = {
    documents: [ "work-sites" ],
    compose: composeWorkSites,
    decompose: decomposeWorkSites,
    metadata: { label: "work.sites", writes: [ "work-sites" ] }
};
```

`mergePair` is the existing private helper documented at `config-editors.js:50` ("Merges an edited `{ en, bg }` over the existing leaf…"). **Read its actual name at that line before using it** — if it is named differently, use the real name.

Register it in `registerCompetenceEditors`:

```js
    app.registerConfigEditor( "work-sites", workSitesEditor );
```

Export `composeWorkSites` and `decomposeWorkSites` alongside the other editor functions in the module's `module.exports` block so the test can reach them. Check how the existing compose/decompose pairs are exported and match it exactly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/competence/test/work-sites-editor.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 841 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/application/config-editors.js packages/competence/test/work-sites-editor.test.js
git commit -m "feat(competence): add the work-sites composite config editor (CA-109)"
```

---

## Task 7: The Work Sites admin screen

**Files:**
- Create: `packages/competence/bin/static/fragments/frame-work-sites.html`
- Create: `packages/competence/test/work-sites-screen-wiring.test.js`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`
- Modify: `packages/competence/bin/competence-web-application.js`
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html`
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Consumes: `/admin/config/editors/work-sites` (Task 6).
- Produces: Alpine component `configureWorkSites`, fragment key `work-sites`.

**Read `frame-role-families.html` and the `configureRoleFamilies` component in full before starting.** This screen is a simplification of it: a flat list instead of families-with-specializations, and no label document to write.

- [ ] **Step 1: Write the failing wiring test**

Create `packages/competence/test/work-sites-screen-wiring.test.js` (AGPL header from `packages/competence/application/employee-rules.js`):

```js
/*
 * <copy the 7-line AGPL header block verbatim from packages/competence/application/employee-rules.js>
*/

/*
 * Static wiring guard for the Work Sites screen (CA-109).
 *
 * CA-108 shipped two wiring defects on a new admin screen that no test would have caught: the fragment's key
 * collided with Configuration's, and then sidebarNavMapping still pointed at "administration" so Configuration
 * highlighted instead. Both were found by a human clicking the screen. This closes that class.
 *
 * The mapping rule, stated once: sidebarNavMapping decides which sidebar ITEM highlights. A SUB-screen maps to its
 * parent's key; a TOP-LEVEL item maps to its own. Work Sites is top-level.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const LANGUAGES = [ "en", "bg" ];
const labels = require( "../bin/localization/competence-labels.json" );

const read = ( ...parts ) => fs.readFileSync( path.join( PACKAGE_ROOT, ...parts ), "utf8" );
const application = read( "bin", "competence-web-application.js" );
const sidebar = read( "bin", "static", "fragments", "components", "component-sidebar.html" );
const fragment = read( "bin", "static", "fragments", "frame-work-sites.html" );
const script = read( "bin", "static", "scripts", "competence-user-interface.js" );

describe( "Work Sites screen wiring", () => {

    it( "registers the fragment, admin-gated", () => {
        assert.match( application, /this\.addFragment\( "work-sites", \{[\s\S]{0,240}?roles: \[ "admin" \]/ );
        assert.match( application, /path: "fragments\/frame-work-sites\.html"/ );
    } );

    it( "maps the sidebar entry to its OWN key, not to administration", () => {
        assert.match( application, /"work-sites": "work-sites"/ );
        assert.equal( /"work-sites": "administration"/.test( application ), false,
            "mapping a top-level screen to administration highlights Configuration instead — the CA-108 bug" );
    } );

    it( "has a sidebar button that opens it", () => {
        assert.match( sidebar, /hx-get="\/app\/work-sites"/ );
        assert.match( sidebar, /active = 'work-sites'/ );
    } );

    it( "binds the fragment to its Alpine component, which exists", () => {
        assert.match( fragment, /x-data="competenceWorkSites"/ );
        assert.match( script, /function configureWorkSites\(\)/ );
    } );

    it( "stays CSP-clean", () => {
        assert.equal( /\sstyle="/.test( fragment ), false, "inline styles are forbidden under Alpine CSP mode" );
        assert.equal( /\?\./.test( fragment ), false, "optional chaining is rejected by the CSP expression evaluator" );
        assert.equal( /\b(Array|Object)\./.test( fragment ), false, "builtins are unavailable inside CSP template expressions" );
    } );

    it( "carries en and bg for every label key it references", () => {
        const keys = [ ...fragment.matchAll( /x-text-label="([^"]+)"/g ) ].map( ( m ) => m[ 1 ] );
        assert.ok( keys.length > 0, "the fragment references no labels at all — did the selector change?" );
        for ( const key of keys ) {
            const leaf = key.split( "." ).reduce( ( node, part ) => ( node || {} )[ part ], labels );
            assert.ok( leaf, `${ key } is missing from competence-labels.json` );
            for ( const language of LANGUAGES ) {
                assert.ok( leaf[ language ] && leaf[ language ].trim().length > 0, `${ key }.${ language } is empty` );
            }
        }
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/competence/test/work-sites-screen-wiring.test.js`
Expected: FAIL — `ENOENT ... frame-work-sites.html`

- [ ] **Step 3: Add the labels**

Insert a new `"work-sites"` block into `competence-labels.json` under `interface`, adjacent to the `interface.employee-import` block (~line 9761). **Insert as text at a known line — never round-trip the JSON.** Keys needed:

`eyebrow` (Administration / Администрация), `title` (Work Sites / Работни обекти), `intro`, `add` (Add site / Добави обект), `code` (Code / Код), `type` (Type / Тип), `type-office` (Office / Офис), `type-client` (Client / Клиент), `name-en` (Name (EN) / Име (EN)), `name-bg` (Name (BG) / Име (BG)), `remove` (Remove / Премахни), `save` (Save / Запази), `saved` (Saved / Записано), `empty` (No sites configured yet / Все още няма конфигурирани обекти), `code-required`, `code-duplicate`, `name-required`.

Also add `interface.topbar.work-sites` (Work Sites / Работни обекти) beside `interface.topbar.employee-import` (~line 7336), and two error keys under the `error.employee` block used by Task 3:

- `error.employee.invalid-work-site` — en: "Selected work site does not exist." / bg: "Избраният работен обект не съществува."
- `error.employee.invalid-gender` — en: "Gender must be M or F." / bg: "Полът трябва да е M или F."

After inserting, verify:

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/competence/bin/localization/competence-labels.json','utf8'));console.log('valid')"
git diff --numstat -- packages/competence/bin/localization/competence-labels.json
```

Expected: `valid`, and the numstat's **removed** column must be `0`.

- [ ] **Step 4: Create the fragment**

`packages/competence/bin/static/fragments/frame-work-sites.html`. Model the chrome on `frame-role-families.html`; the body is a `.ti-panel` containing a list of rows, each with a code input, a type select, two name inputs and a remove button, plus an add button and a save button. Every derived value must be a method on the component (CSP mode forbids builtins in expressions). Structure:

```html
<div class="ti-page" x-data="competenceWorkSites">

    <div class="ti-page-head">
        <div>
            <div class="ti-page-eyebrow" x-text-label="interface.work-sites.eyebrow">Administration</div>
            <h1 class="ti-page-title" x-text-label="interface.work-sites.title">Work Sites</h1>
            <p class="ti-page-subtitle" x-text-label="interface.work-sites.intro">The offices and client premises an employee can be assigned to. A site that is still assigned to someone cannot be removed.</p>
        </div>
    </div>

    <section class="ti-panel">
        <div class="ti-panel-head bar">
            <div class="ti-panel-head-text">
                <div class="ti-panel-title" x-text-label="interface.work-sites.title">Work Sites</div>
                <div class="ti-panel-subtitle" x-text="countSummary()"></div>
            </div>
            <div class="ti-panel-head-aside">
                <button class="ti-btn" type="button" @click="addSite()" x-text-label="interface.work-sites.add">Add site</button>
                <button class="ti-btn primary" type="button" x-bind:disabled="busy" @click="save()" x-text-label="interface.work-sites.save">Save</button>
            </div>
        </div>

        <div class="competence-panel-body">
            <!-- Replaced in Step 5 once saveErrors holds { label, message } objects. -->
            <template x-if="saveErrors.length > 0">
                <div class="ti-form-section">
                    <template x-for="(issue, idx) in saveErrors" x-bind:key="idx">
                        <div class="ti-form-readonly">
                            <span class="ti-tag mono" x-text="issue.label"></span>
                            <span class="ti-form-error" x-text="issue.message"></span>
                        </div>
                    </template>
                </div>
            </template>

            <template x-if="isEmpty()">
                <p class="ti-form-hint" x-text-label="interface.work-sites.empty">No sites configured yet.</p>
            </template>

            <template x-for="(site, index) in sites" x-bind:key="index">
                <div class="ti-form-row">
                    <label class="ti-field-label" x-text-label="interface.work-sites.code">Code</label>
                    <input class="ti-input" type="text" x-model="site.code">

                    <label class="ti-field-label" x-text-label="interface.work-sites.type">Type</label>
                    <select class="ti-select" x-model="site.type">
                        <option value="office" x-text-label="interface.work-sites.type-office">Office</option>
                        <option value="client" x-text-label="interface.work-sites.type-client">Client</option>
                    </select>

                    <label class="ti-field-label" x-text-label="interface.work-sites.name-en">Name (EN)</label>
                    <input class="ti-input" type="text" x-model="site.name.en">

                    <label class="ti-field-label" x-text-label="interface.work-sites.name-bg">Name (BG)</label>
                    <input class="ti-input" type="text" x-model="site.name.bg">

                    <button class="ti-btn" type="button" @click="removeSite(index)" x-text-label="interface.work-sites.remove">Remove</button>
                </div>
            </template>
        </div>
    </section>

</div>
```

- [ ] **Step 5: Add the Alpine component**

**Read `configureRoleFamilies` (`competence-user-interface.js:5819` onward) before writing this.** The composite-editor API has three properties that are not guessable and that this screen depends on:

1. `compose()`'s result arrives wrapped: the payload is `data.rows`, **not** `data`. Reading `data.sites` returns `undefined` and the screen renders empty with no error.
2. **A validation failure comes back as HTTP 200 with `data.ok === false` and `data.errors`** — not as a rejected promise. This is the single most important path on this screen: a refused removal arrives here, so a `.then` that assumes success would report "Saved" on a save the server rejected.
3. The save body is `{ edited, expectedVersions, note }`, and `expectedVersions` comes from `data.versions` captured at load. A `409` means someone else edited concurrently, and the right response is to reload rather than retry.

Add `configureWorkSites` next to `configureRoleFamilies`, and register it with Alpine beside the others (`Alpine.data( "competenceWorkSites", configureWorkSites );` — the registration block is around line 6551).

The file carries two declaration styles: `const configureRoleFamilies = () => {` and `function configureEmployeeImport() {`. Use `function`, matching the most recent screen; the wiring test asserts it.

```js
/**
 * Alpine component for the Work Sites admin screen (frame-work-sites.html). Reads and writes the work-sites
 * nomenclature through the framework's composite-editor API, so versioning, validation, audit and validated restore
 * come from the config subsystem rather than being reimplemented here.
 *
 * The submitted list is the complete set — an omitted code is a removal — and a removal of a site somebody is
 * assigned to is refused by `workSitesReferentialIntegrity` and rendered here as a save error. This component
 * deliberately performs no such check of its own: the rule has one home, and a second copy would let the two drift
 * while guarding only this screen.
 *
 * @returns {Object}
 */
function configureWorkSites() {
    const tiApplication = Alpine.store( "tiApplication" );
    const EDITOR_KEY = "work-sites";

    return {
        loaded: false,
        saving: false,
        sites: [],
        versions: {},
        saveErrors: [],

        init() {
            const onInitialized = () => {
                if ( !tiApplication.hasRole( "admin" ) ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.admin.not-authorized", "Administrator access required." ) );
                    tiApplication.openScreen( "dashboard" );
                    return;
                }
                this.loadData();
            };
            if ( tiApplication.isInitialized ) {
                onInitialized();
            } else {
                this.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
                    if ( isInitialized ) {
                        onInitialized();
                    }
                } );
            }
        },

        getLabel( key, fallback = "" ) {
            return tiApplication.getLabel( key, fallback );
        },

        backToConfig() {
            tiApplication.openScreen( "admin-config" );
        },

        loadData() {
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY ).then( ( result ) => {
                const data = ( result && result.data ) || {};
                // composeView wraps the editor's compose() result under `data.rows`; this editor returns { sites }.
                const view = ( data.rows && typeof data.rows === "object" && !Array.isArray( data.rows ) ) ? data.rows : {};
                this.sites = Array.isArray( view.sites ) ? tiToolbox.structuredClone( view.sites ) : [];
                this.versions = data.versions ? tiToolbox.structuredClone( data.versions ) : {};
                this.saveErrors = [];
                this.loaded = true;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loaded = true;
                tiApplication.notify( tiApplication.formatException( error ) );
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 401 || httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        // Alpine's CSP build cannot call Array/Object inside a template expression, so every derived value the
        // fragment needs is a method here.
        isEmpty() {
            return this.sites.length === 0;
        },

        countSummary() {
            return tiApplication.getLabel( "interface.work-sites.count", "{n} sites" ).replace( "{n}", String( this.sites.length ) );
        },

        addSite() {
            this.sites.push( { code: "", type: "office", name: { en: "", bg: "" } } );
        },

        removeSite( index ) {
            // Removing the row is all this does. Whether the removal is ALLOWED is the validator's answer, and it
            // arrives on save — a site still assigned to somebody comes back as a save error, not a client-side veto.
            this.sites.splice( index, 1 );
        },

        save() {
            this.saveErrors = this.localIssues();
            if ( this.saveErrors.length > 0 ) {
                return;
            }
            this.saving = true;
            const body = {
                edited: { sites: this.sites },
                expectedVersions: this.versions,
                note: tiApplication.getLabel( "interface.work-sites.save-note", "Work sites edit" )
            };
            tiApplication.sendRequest( "/admin/config/editors/" + EDITOR_KEY, "POST", body ).then( ( result ) => {
                this.saving = false;
                const data = ( result && result.data ) || {};
                // A REFUSED save arrives HERE with ok === false and HTTP 200 — not in the catch. This is the branch
                // that renders "work site 'HQ' is assigned to an employee and cannot be removed".
                if ( data.ok === false ) {
                    this.saveErrors = this.flattenErrors( data.errors );
                    tiApplication.notify( tiApplication.getLabel( "interface.work-sites.save-invalid", "Some changes are invalid — see the issues listed." ) );
                    return;
                }
                tiApplication.notify( tiApplication.getLabel( "interface.work-sites.saved", "Work sites saved." ) );
                this.loadData();
            } ).catch( ( error ) => {
                this.saving = false;
                const httpCode = error && error.exception && error.exception.httpCode;
                if ( httpCode === 409 ) {
                    tiApplication.notify( tiApplication.getLabel( "interface.work-sites.save-conflict", "Configuration changed elsewhere — reloading the latest version." ) );
                    this.loadData();
                    return;
                }
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        // Server issues are keyed by document, each carrying { path, message }. The path is ".<code>" for a site
        // issue and "." for the fail-closed "could not be verified" one; strip the dot so the tag reads as a code.
        flattenErrors( errors ) {
            const out = [];
            const byKey = errors || {};
            Object.keys( byKey ).forEach( ( key ) => {
                ( byKey[ key ] || [] ).forEach( ( issue ) => {
                    const rawPath = ( issue && ( issue.path || issue.dataPath ) ) || "";
                    const parts = rawPath.split( "." ).filter( Boolean );
                    out.push( { label: parts[ 0 ] || "—", message: ( issue && issue.message ) || "" } );
                } );
            } );
            return out;
        },

        // Only the two things the server cannot phrase better than the form can: an empty code, and a duplicate one.
        // Everything else — including whether a removal is allowed — is the validator's answer, rendered above.
        localIssues() {
            const issues = [];
            const seen = {};
            for ( const site of this.sites ) {
                const code = ( site.code || "" ).trim();
                if ( code.length === 0 ) {
                    issues.push( { label: "—", message: tiApplication.getLabel( "interface.work-sites.code-required", "Every site needs a code." ) } );
                    continue;
                }
                if ( seen[ code ] ) {
                    issues.push( { label: code, message: tiApplication.getLabel( "interface.work-sites.code-duplicate", "This code is used twice." ) } );
                }
                seen[ code ] = true;
                if ( !site.name || !( site.name.en || "" ).trim() || !( site.name.bg || "" ).trim() ) {
                    issues.push( { label: code, message: tiApplication.getLabel( "interface.work-sites.name-required", "Both an English and a Bulgarian name are required." ) } );
                }
            }
            return issues;
        }
    };
}
```

`tiToolbox.structuredClone` is the helper `configureRoleFamilies` uses. Confirm it is in scope in this file before relying on it:

```bash
grep -n "tiToolbox" packages/competence/bin/static/scripts/competence-user-interface.js | head -3
```

Because `saveErrors` holds `{ label, message }` objects rather than strings, the fragment from Step 4 must render two spans per issue. Replace its error block with:

```html
            <template x-if="saveErrors.length > 0">
                <div class="ti-form-section">
                    <template x-for="(issue, idx) in saveErrors" x-bind:key="idx">
                        <div class="ti-form-readonly">
                            <span class="ti-tag mono" x-text="issue.label"></span>
                            <span class="ti-form-error" x-text="issue.message"></span>
                        </div>
                    </template>
                </div>
            </template>
```

Add the labels `interface.work-sites.save-note`, `.save-invalid`, `.save-conflict` and `.count` to Step 3's block.

- [ ] **Step 6: Register the fragment and the nav mapping**

In `packages/competence/bin/competence-web-application.js`, after the `employee-import` fragment registration (~line 146):

```js
        this.addFragment( "work-sites", {
            title: "Work Sites",
            path: "fragments/frame-work-sites.html",
            roles: [ "admin" ]
        } );
```

And in `sidebarNavMapping` (~line 331), after the `"employee-import"` entry:

```js
                    "work-sites": "work-sites",
```

The comment already above `"employee-import"` explains the rule; do not duplicate it.

- [ ] **Step 7: Add the sidebar button**

In `packages/competence/bin/static/fragments/components/component-sidebar.html`, after the Employee Import button (~line 176):

```html
            <button hx-get="/app/work-sites" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'work-sites'"
                    x-bind:class="{ active: active === 'work-sites' }" class="ti-sidebar-item" data-tip="Work Sites" aria-label="Work Sites" type="button">
                <span class="ti-sidebar-item-icon">
                    <span class="ti-icon location md" aria-hidden="true"></span>
                </span>
                <span class="ti-sidebar-item-label" x-text-label="interface.topbar.work-sites">Work Sites</span>
            </button>
```

Confirm `location` is a real `.ti-icon` variant:

```bash
grep -c "ti-icon.location" packages/web-framework/bin/static/scripts/ti-framework.css
```

If it is `0`, pick a variant that exists — `grep -o "\.ti-icon\.[a-z-]*" packages/web-framework/bin/static/scripts/ti-framework.css | sort -u` lists them.

- [ ] **Step 8: Run the wiring test**

Run: `node --test packages/competence/test/work-sites-screen-wiring.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the full suite and lint**

Run: `npm test -w @ti-engine/competence`
Expected: PASS, at least 847 tests.

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-work-sites.html packages/competence/bin/static/fragments/components/component-sidebar.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/competence-web-application.js packages/competence/bin/localization/competence-labels.json packages/competence/test/work-sites-screen-wiring.test.js
git commit -m "feat(competence): add the Work Sites admin screen (CA-109)"
```

---

## Task 8: Employee Management

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js`
- Modify: `packages/competence/bin/static/fragments/frame-employee-management.html`
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Consumes: `configurationLoader.configWorkSites`, the schema fields from Task 3.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Read the three anchors**

```bash
sed -n '3920,3935p;4310,4330p;4395,4410p;4495,4510p' packages/competence/bin/competence-web-application.js
```

These are, in order: the create-employee defaults, the draft projection, the read-only detail rows, and the `options` payload. Every change below lands in one of them.

- [ ] **Step 2: Make `#createEmployee` read the two new fields**

**Found by the Task 3 review; this is the one place in the feature where data is silently lost.** `#createEmployee`
(~line 3920) builds the new record from a **fixed object literal**. It is not a generic copy — a field it does not
name is dropped with no error. `gender` is already read there, so it is fine; `workSite` and `positionName` are not.
Without this step, an admin fills in the create modal (Step 5), presses save, and the two values vanish silently.

In the `personal` block, after the `gender` spread:

```js
                        ...( input.personal?.workSite ? { workSite: input.personal.workSite } : {} )
```

In the `career` block, after the `startingDate` spread:

```js
                        ...( input.career?.positionName ? { positionName: String( input.career.positionName ).trim() } : {} )
```

The conditional-spread idiom is what the surrounding lines already use, and it matters here beyond style: writing
`workSite: input.personal?.workSite` unconditionally would store `undefined`, which `#validateEmployeeFields` treats
as absent but which then serializes into the record. Follow the existing shape exactly.

`#updateEmployee` needs no equivalent change — it goes through a generic field-path setter that already handles any
path the schema permits. Verify that claim rather than trusting it: find `#updateEmployee` and confirm it writes by
path rather than by literal.

- [ ] **Step 3: Add the work-site options**

In the `options` payload (~line 4503), after `workLocations`:

```js
            workLocations: [ "On-site", "Hybrid", "Remote" ],
            genders: [ "M", "F" ],
            workSites: Object.entries( configurationLoader.configWorkSites ).map( ( [ code, site ] ) => ( {
                code: code,
                type: site.type,
                name: ( site.name && site.name[ language ] ) ? site.name[ language ] : ( ( site.name && site.name.en ) || code )
            } ) ).sort( ( a, b ) => ( a.name || "" ).localeCompare( b.name || "" ) )
```

**Resolve the name server-side**, to the single active language, exactly as the `organizationUnits` projection twenty lines above already does. The method opens with `const language = session?.language;`, so the binding is already in scope. Role families go through `localization.getLabel` instead only because their names are label keys; a work site's name is stored inline, so there is no key to look up. Sending the `{ en, bg }` pair down and picking in the browser would put the same decision in two places.

- [ ] **Step 4: Add the fields to the draft projection**

In the draft projection (~line 4320):

```js
                workMode: employee?.personal?.workMode || "",
                workLocation: employee?.personal?.workLocation || "",
                workSite: employee?.personal?.workSite || "",
                gender: employee?.personal?.gender || ""
```

and in the career half of the same projection, `positionName: employee?.career?.positionName || ""`.

**This file is server-side JavaScript, not an Alpine template** — optional chaining is fine here and is already used on these very lines. The CSP restriction applies only to fragment expressions.

- [ ] **Step 5: Add the read-only detail rows**

After the `work-location` row (~line 4403):

```js
                { label: label( "interface.employee-management.form.work-site" ), value: this.#resolveWorkSiteName( detail.personal.workSite, language ) },
                { label: label( "interface.employee-management.form.position-name" ), value: detail.career.positionName || "—" },
                { label: label( "interface.employee-management.form.gender" ), value: detail.personal.gender || "—" }
```

Add the private helper near `#validateEmployeeFields`:

```js
    /**
     * Resolves a work-site code to its localized name, falling back to the raw code. A code that no longer resolves
     * is shown as-is rather than blanked: the validator prevents removing an assigned site, so a miss here means
     * data written before this feature or restored around it — and an operator needs to see the value to fix it.
     *
     * @method
     * @param {string} [code]
     * @param {string} language
     * @returns {string}
     * @private
     */
    #resolveWorkSiteName( code, language ) {
        if ( !code ) {
            return "—";
        }
        const site = configurationLoader.configWorkSites[ code ];
        return ( site && site.name && site.name[ language ] ) ? site.name[ language ] : code;
    }
```

- [ ] **Step 6: Add the fields to the fragment**

In `packages/competence/bin/static/fragments/frame-employee-management.html`, after the work-location block (~line 231–237), add three blocks in the same shape. Read the existing block first and mirror it exactly, including the `isFieldEditable` binding:

```html
                                        <div class="ti-form-row">
                                            <label class="ti-field-label" x-text-label="interface.employee-management.form.work-site"></label>
                                            <select class="ti-select" x-model="draft.personal.workSite"
                                                    x-bind:disabled="!isFieldEditable('personal.workSite')">
                                                <option value="" x-text-label="interface.employee-management.work-site.none"></option>
                                                <template x-for="site in options.workSites" x-bind:key="site.code">
                                                    <option x-bind:value="site.code" x-text="workSiteOptionLabel(site)"></option>
                                                </template>
                                            </select>
                                        </div>

                                        <div class="ti-form-row">
                                            <label class="ti-field-label" x-text-label="interface.employee-management.form.gender"></label>
                                            <select class="ti-select" x-model="draft.personal.gender"
                                                    x-bind:disabled="!isFieldEditable('personal.gender')">
                                                <option value="" x-text-label="interface.employee-management.gender.none"></option>
                                                <template x-for="value in options.genders" x-bind:key="value">
                                                    <option x-bind:value="value" x-text="value"></option>
                                                </template>
                                            </select>
                                        </div>

                                        <div class="ti-form-row">
                                            <label class="ti-field-label" x-text-label="interface.employee-management.form.position-name"></label>
                                            <input class="ti-input" type="text" x-model="draft.career.positionName"
                                                   x-bind:disabled="!isFieldEditable('career.positionName')">
                                        </div>
```

Repeat the same three blocks in the create modal (~line 631), binding to `modal.payload.personal.*` / `modal.payload.career.*` and without the `isFieldEditable` bindings — match exactly what the neighbouring create-modal fields do.

Add `workSiteOptionLabel` to the Employee Management Alpine component. It must show the type so an office and a client site are distinguishable, and must not use builtins:

```js
        // `site.name` arrives already resolved to the session language (see Step 2), so this only prefixes the
        // type — otherwise an office and a client site with similar names are indistinguishable in the list.
        workSiteOptionLabel( site ) {
            const type = ( site.type === "client" )
                ? tiApplication.getLabel( "interface.work-sites.type-client", "Client" )
                : tiApplication.getLabel( "interface.work-sites.type-office", "Office" );
            return type + " · " + site.name;
        },
```

- [ ] **Step 7: Add the labels**

Insert into `competence-labels.json` under `interface.employee-management`: `form.work-site` (Work site / Работен обект), `form.position-name` (Position (contract) / Длъжност (по договор)), `form.gender` (Gender / Пол), `work-site.none` (— none — / — няма —), `gender.none` (— not specified — / — не е посочен —).

Verify as in Task 7, Step 3: valid JSON, 0 removed lines.

- [ ] **Step 8: Verify in the running app**

```bash
docker compose up --build -d
```

Then browse to `http://localhost:3000`. Sign in as an admin, open **Administration → Work Sites**, add a site, save, and confirm it appears in **Employee Management**'s work-site dropdown. Then try to remove that site while an employee holds it and confirm the save is refused with the validator's message.

**Drive the walkthrough with `javascript_tool` `element.click()`** — the Browser pane's coordinate clicks are unreliable on this app and silently no-op.

- [ ] **Step 9: Run the full suite and lint**

Run: `npm test -w @ti-engine/competence` — expected PASS, at least 847 tests (this task adds no test file; its behaviour is covered by Task 3's rules tests and the wiring test's label check).

Run: `npm run lint` — expected 0 errors.

- [ ] **Step 10: Commit**

```bash
git add packages/competence/bin/competence-web-application.js packages/competence/bin/static/fragments/frame-employee-management.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/localization/competence-labels.json
git commit -m "feat(competence): edit work site, position name and gender from Employee Management (CA-109)"
```

---

## Task 9: Download CSV template

**Files:**
- Modify: `packages/competence/bin/static/fragments/frame-employee-import.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`
- Modify: `packages/competence/bin/competence-web-application.js`
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Consumes: `organizationImport.instance.COLUMNS` (Task 4).
- Produces: service `template-employee-import` returning `{ header: string }`.

The browser cannot be handed a file by a plain `<a download>` inside the app shell reliably, so the button builds a Blob and triggers a download from script — the ordinary in-app pattern, not an artifact-viewer one.

- [ ] **Step 1: Add the service**

In `packages/competence/bin/competence-web-application.js`, beside the other two import services (~line 592):

```js
        } else if ( service === "template-employee-import" ) {
            return this.#templateEmployeeImport( session );
```

and the handler beside `#previewEmployeeImport`:

```js
    /**
     * Returns the CSV header row the importer expects, derived from the column contract rather than a literal so it
     * cannot go stale when a column is added. Admin-gated like the other two import services — it discloses nothing
     * sensitive, but there is no reason for a non-admin to reach an admin screen's endpoint.
     *
     * @method
     * @param {Object} session
     * @returns {Promise<{header: string}>}
     * @private
     */
    #templateEmployeeImport( session ) {
        this.#requireAdmin( session );
        const columns = organizationImport.instance.COLUMNS;
        return Promise.resolve( { header: columns.required.concat( columns.optional ).join( "," ) } );
    }
```

Confirm the exact shape of `COLUMNS` first:

```bash
grep -n "COLUMNS" packages/competence/application/organization-import.js | head -5
```

If it is not `{ required, optional }`, adjust to the real shape.

- [ ] **Step 2: Add the button**

In `frame-employee-import.html`, inside the panel head aside — but as a sibling that always renders, unlike the two conditional children. Extend `hasAsideContent()` to return `true` unconditionally, or place the button in the `competence-panel-body` above the export hint. Prefer the body:

```html
            <div class="ti-form-row">
                <button class="ti-btn" type="button" @click="downloadTemplate()" x-text-label="interface.employee-import.download-template">Download CSV template</button>
            </div>
```

- [ ] **Step 3: Add the component method**

In `configureEmployeeImport`:

```js
        // Builds the file in the browser from the header the server derives, so the column list can never drift
        // from what the importer actually accepts.
        downloadTemplate() {
            tiApplication.sendRequest( "/app/template-employee-import", "POST", {} ).then( ( result ) => {
                const header = ( result && result.data && result.data.header ) ? result.data.header : "";
                // The BOM is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the system codepage — the
                // exact failure the importer's not-utf8 check exists to catch.
                const blob = new Blob( [ "﻿" + header + "\n" ], { type: "text/csv;charset=utf-8" } );
                const url = URL.createObjectURL( blob );
                const anchor = document.createElement( "a" );
                anchor.href = url;
                anchor.download = "employees-template.csv";
                document.body.appendChild( anchor );
                anchor.click();
                document.body.removeChild( anchor );
                URL.revokeObjectURL( url );
            } ).catch( ( error ) => {
                this.applyError( error );
            } );
        },
```

- [ ] **Step 4: Add the label**

`interface.employee-import.download-template` — en "Download CSV template" / bg "Изтегли CSV шаблон".

- [ ] **Step 5: Verify**

Run: `npm test -w @ti-engine/competence` — expected PASS.

In the running container, click the button and confirm a `employees-template.csv` downloads whose single line ends `,work_site,position_name`.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-employee-import.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/competence-web-application.js packages/competence/bin/localization/competence-labels.json
git commit -m "feat(competence): offer the current CSV header as a download from the import screen (CA-109)"
```

---

## Task 10: The XLSX template and its generator

**Files:**
- Create: `packages/competence/docs/templates/build-import-template.py`
- Modify: `packages/competence/docs/templates/employee-import-template.xlsx`

**Interfaces:**
- Consumes: the column contract (Task 4).
- Produces: nothing later tasks depend on.

The current template's measured structure, so you do not have to rediscover it:

| Sheet | Size | Contents |
|---|---|---|
| `Instructions` | 32 × 17 | Prose, plus a header/example pair at rows 30–31 that repeats the column list |
| `Employees` | 401 × 15 | Header row + 400 blank rows |
| `Valid values` | 64 × 4 | Reference lists |

`Employees` header, in order: `employee_id, email, first_name, last_name, work_mode, work_location, organization_unit_id, role_family, level, stage, employment_status, birth_date, gender, specialization, starting_date` — the same order as the CSV contract, which is what keeps the sheet and `--template` aligned.

Six list validations, all spanning row 2 to 401: `E` work_mode `"Full-time,Part-time,Contract"`, `F` work_location `"On-site,Hybrid,Remote"`, `H` role_family `"BA,DA,IO,MC,PD,PM,QE,SE,XD"`, `I` level `"N,J,R,S,X,T"`, `J` stage `"1,2,3"`, `K` employment_status `"active,on-leave,terminated"`.

Text (`@`) number format on `A` (employee_id) and `L` (birth_date) — this is what stops Excel eating the leading zeros of `00123` and reformatting dates. Check `O` (starting_date) and match it. Conditional formatting highlights duplicates on `A2:A401` and `B2:B401`.

**The generator extends the workbook rather than rebuilding it**, and says so in its docstring. That is the honest scope: what goes stale when a column is added is the *column set, the validations and the formats* — not the prose, which is authored content and would be worse re-expressed as Python string literals. Rebuilding from scratch would also silently drop any formatting nobody thought to re-encode.

- [ ] **Step 1: Confirm the structure for yourself**

```bash
python -c "import openpyxl; wb=openpyxl.load_workbook('packages/competence/docs/templates/employee-import-template.xlsx'); ws=wb['Employees']; print([c.value for c in ws[1]]); print([(d.type, d.formula1, str(d.sqref)) for d in ws.data_validations.dataValidation])"
```

Expected: the header and six validations above. If they differ, the template has moved on since this plan was written — trust the file, and adjust the script.

- [ ] **Step 2: Write the generator**

Create `packages/competence/docs/templates/build-import-template.py`:

```python
"""Bring the HR employee-import template in line with the CSV column contract.

Run manually, from the repository root:

    python packages/competence/docs/templates/build-import-template.py

This is NOT part of the Node build or of CI. It exists because the template was originally hand-built, so when
CA-109 added two columns there was no way to regenerate it except by hand again.

It EXTENDS the existing workbook rather than rebuilding it. What goes stale when the contract changes is the column
set, the dropdowns and the cell formats; the Instructions prose is authored content, and re-expressing it as Python
string literals would make it harder to edit and would silently drop any formatting nobody thought to re-encode.

Requires openpyxl (a local dev tool only -- it is deliberately not a dependency of the competence package, whose
runtime dependencies are limited to core, web-framework and graphology).
"""

import pathlib
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation

TEMPLATE = pathlib.Path(__file__).with_name("employee-import-template.xlsx")
LAST_ROW = 401

# Columns appended by CA-109, in CSV-contract order. `work_site` is deliberately FREE TEXT: the valid codes are a
# per-deployment configuration document edited in Administration > Work Sites, so a dropdown baked into a file
# committed to a public repository would carry the demo codes and be wrong in every real install.
NEW_COLUMNS = ["work_site", "position_name"]

# `gender` is constrained to M/F on every write path as of CA-109, so the sheet should stop accepting free text.
GENDER_CHOICES = '"M,F"'


def header_map(sheet):
    """Column name -> 1-based index, from row 1."""
    return {cell.value: cell.column for cell in sheet[1] if cell.value}


def append_missing_columns(sheet):
    columns = header_map(sheet)
    for name in NEW_COLUMNS:
        if name in columns:
            print(f"  {name}: already present, left alone")
            continue
        index = sheet.max_column + 1
        sheet.cell(row=1, column=index, value=name)
        # Copy the header style from an existing OPTIONAL column so the new ones read as optional (grey), not
        # required (dark blue). employment_status is the first optional column.
        source = sheet.cell(row=1, column=columns["employment_status"])
        target = sheet.cell(row=1, column=index)
        target.font = source.font.copy()
        target.fill = source.fill.copy()
        target.border = source.border.copy()
        target.alignment = source.alignment.copy()
        sheet.column_dimensions[target.column_letter].width = 22
        print(f"  {name}: added as column {target.column_letter}")


def constrain_gender(sheet):
    columns = header_map(sheet)
    letter = sheet.cell(row=1, column=columns["gender"]).column_letter
    target = f"{letter}2:{letter}{LAST_ROW}"
    for existing in list(sheet.data_validations.dataValidation):
        if str(existing.sqref) == target:
            print("  gender: validation already present, left alone")
            return
    validation = DataValidation(type="list", formula1=GENDER_CHOICES, allow_blank=True, showDropDown=False)
    validation.error = "Enter M or F, or leave the cell blank."
    validation.errorTitle = "Not a permitted value"
    sheet.add_data_validation(validation)
    validation.add(target)
    print(f"  gender: dropdown added on {target}")


def refresh_instructions(book):
    """Extend the header/example pair on the Instructions sheet to cover the new columns."""
    sheet = book["Instructions"]
    employees = book["Employees"]
    names = [cell.value for cell in employees[1] if cell.value]
    for offset, name in enumerate(names):
        sheet.cell(row=30, column=1 + offset, value=name)
    print(f"  Instructions: example header rewritten with {len(names)} columns")


def main():
    book = openpyxl.load_workbook(TEMPLATE)
    print(f"Updating {TEMPLATE.name}")
    append_missing_columns(book["Employees"])
    constrain_gender(book["Employees"])
    refresh_instructions(book)
    book.save(TEMPLATE)
    print("Saved. Open it in Excel or LibreOffice before committing -- see Step 4.")


if __name__ == "__main__":
    main()
```

The script is idempotent: running it twice adds nothing twice. That matters because it is the only defence against a half-applied run.

- [ ] **Step 3: Run it and verify against the CSV contract**

```bash
python packages/competence/docs/templates/build-import-template.py
python -c "import openpyxl; wb=openpyxl.load_workbook('packages/competence/docs/templates/employee-import-template.xlsx'); print(','.join(c.value for c in wb['Employees'][1] if c.value))"
node packages/competence/bin/build/import-organization.js --template
```

The last two commands must print **the same line**. If they do not, the sheet and the importer disagree about the column contract, which is exactly the drift this task exists to close.

- [ ] **Step 4: Update the Instructions prose by hand**

Two passages the script cannot rewrite, because they are sentences rather than data:

- The blank-cell paragraph at rows 24–25 currently names `birth_date`, `gender` and `starting_date` as the fields a blank cell leaves unchanged. Add `work_site` and `position_name`.
- Add a line under "What to do" stating that `work_site` takes a site **code**, that the valid codes for a deployment are listed in **Administration → Work Sites**, and that a code typed with a Cyrillic lookalike letter (`О` for `O`) is rejected — the import will say which character is wrong.

Edit these in Excel or LibreOffice and save.

- [ ] **Step 5: Open the file and check it by hand**

Open the regenerated template in Excel or LibreOffice. Confirm: the gender dropdown offers M and F and accepts a blank; `employee_id` still keeps a leading zero when you type `00123`; the two new headers are styled as optional, not required; and the Instructions sheet reads correctly.

A corrupt xlsx frequently loads fine in `openpyxl` and fails in the application, so this step is not optional.

Confirm `.gitattributes` still declares the file binary — a single LF→CRLF rewrite inside the zip container corrupts it irrecoverably:

```bash
grep "xlsx" .gitattributes
```

Expected: `*.xlsx          binary`

- [ ] **Step 6: Commit**

```bash
git add packages/competence/docs/templates/build-import-template.py packages/competence/docs/templates/employee-import-template.xlsx
git commit -m "build(competence): add work_site and position_name to the HR import template (CA-109)"
```

---

## Task 11: Documentation and the version bump

**Files:**
- Modify: `packages/competence/INSTALL.md`
- Modify: `packages/competence/README.md`
- Modify: `packages/competence/CHANGELOG.md`
- Modify: `packages/competence/package.json`

- [ ] **Step 1: INSTALL.md — the column table**

The table at `INSTALL.md:448` lists each column and whether it is required. Add two rows:

| `work_site` | no | Must exist in the current work-site nomenclature (**Administration → Work Sites**). Blank leaves any stored value unchanged |
| `position_name` | no | Free text, as written in the contract. Blank leaves any stored value unchanged |

and amend the `gender` row to state `M` or `F`, or blank.

- [ ] **Step 2: INSTALL.md — a Work Sites subsection**

Add a subsection in §11 near "The Employee Import screen" covering: what a site is and how it differs from `work_location`; that the shipped file is a demo default and the real list is entered in the screen; that a site in use cannot be removed and what the refusal looks like; and the confusable-character warning — that a code typed with a Cyrillic lookalike is rejected and how the message identifies it.

Also add the migration note: **a deployment whose stored records carry a gender other than `M` or `F` must correct them**, because the schema now constrains the field and the next write of such a record will fail validation.

- [ ] **Step 3: README.md**

Add **Work Sites** to both places the Administration screens are listed — the `[UI]` feature-summary line (~line 40) and the Administration bullet list (~line 594) — noting it is the nomenclature backing the employee work-site field.

- [ ] **Step 4: CHANGELOG.md**

Add a `## Version 3.24.0` section above 3.23.0 with a short lede and one bullet per theme: the config document and its two validators, the two employee fields, the gender constraint across both write paths, the Work Sites screen, the confusable-code message, the CSV template download, and the regenerated XLSX template plus its generator. State the migration note from Step 2 explicitly.

- [ ] **Step 5: Bump the version**

In `packages/competence/package.json`, `"version": "3.23.0"` → `"version": "3.24.0"`.

- [ ] **Step 6: Two cleanups found during review**

Both are small, both were deferred here deliberately so they land in one commit rather than interrupting a task.

**(a) Clearing a work site or position from the UI should omit the key, not store `""`.**
`#setFieldByPath` in `packages/competence/bin/competence-web-application.js` (~line 4614) keeps an explicit
allowlist of paths that are *deleted* when cleared rather than set to the empty string. It names `email`,
`personal.birthDate`, `personal.gender` and `career.startingDate`. Add the two new fields:

```js
            } else if ( path === "email" || path === "personal.birthDate" || path === "personal.gender" || path === "career.startingDate" || path === "personal.workSite" || path === "career.positionName" ) {
```

Why it matters even though nothing currently breaks: the CSV importer *omits* these keys rather than writing
`""`, so without this the same logical state is stored two different ways depending on which write path produced
it. `employee.schema.json` also types `personal.workSite` with `minLength: 1`, so `""` is schema-invalid — latent
today because that schema is only enforced in a seeder test, but a trap for whoever adds write-time validation.
The spec makes Employee Management the *designated* way to clear these fields, so it should produce the same
result the importer does.

**(b) Use the `#alias` form in two new test files.** The plan's own Global Constraints require `#alias` imports
for internal modules, and four CA-109 test files were specified with relative paths. Two are fixable:

- `packages/competence/test/work-site-confusables.test.js` — `require( "../application/organization-import" )` → `require( "#organization-import" )`
- `packages/competence/test/employee-new-fields.test.js` — `require( "../application/employee-rules" )` → `require( "#employee-rules" )` and `require( "../application/organization-import" )` → `require( "#organization-import" )`

Leave `work-sites-config.test.js` and `work-sites-referential-integrity.test.js` alone: they import
`config-validators`, which has **no alias** in the package's `imports` map, and adding one is out of scope.

Run `node --test` on both edited files afterwards to confirm they still resolve.

- [ ] **Step 7: Full verification**

```bash
npm test -w @ti-engine/competence
npm test
npm run lint
node -e "JSON.parse(require('fs').readFileSync('packages/competence/bin/localization/competence-labels.json','utf8'));console.log('labels valid')"
```

Expected: all pass, lint 0 errors. Do **not** run `npm run check:types`.

Confirm the user-guide freshness guard still passes — it is part of the suite and fails if a generated fragment is stale. If it fails, run `npm run build:guide` and commit the regenerated fragments.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/INSTALL.md packages/competence/README.md packages/competence/CHANGELOG.md packages/competence/package.json
git commit -m "build(release): document work sites and position name, and release competence 3.24.0 (CA-109)"
```

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin feat/work-site-and-position
```

Then open a PR to `master` titled `feat(competence): add work site nomenclature, position name and an M/F gender constraint (CA-109)`. **Do not add a `Co-Authored-By: Claude` trailer** anywhere.

- [ ] **Step 10: Update YouTrack**

Move CA-109 to `Stage: Review`, add a comment linking the PR and recording any deviation from this plan. Do not log time — the owner does that.

---

## Deliverable outside the repository

The owner's real 12 sites are **not** committed, and are deliberately not reproduced here either — this file
is tracked in a public repository, and the list names the company's office footprint plus two client
engagements (spec §5.2). Produce the snippet at implementation time and hand it over in chat only.

Shape: the `work-sites` document keyed by code, each entry `{ id, type: "office"|"client", name: { en, bg } }`.
One thing to carry across: the owner's source list codes Stara Zagora with a **Cyrillic О** while every
sibling uses a Latin O. Use Latin throughout, which is what §8.1's confusable guard then explains to anyone
who types the other one.
