# Employee Import Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload an HR-exported employee CSV in the browser, see the reconciliation plan, and apply it — without shell access, and without a restart afterwards.

**Architecture:** The screen is a **fourth driver** over the existing CA-107 import pipeline (`parseDelimited` → `mapRows` → `reconcile` → `applyPlan`), alongside the CLI. It adds no validation, mapping or reconciliation logic. The CSV travels as a **string in the existing JSON service call**, so CSRF, session and role gating are inherited and no multipart plumbing or new dependency is needed. Apply re-derives the whole plan server-side from the CSV rather than trusting a plan posted back by the client.

**Tech Stack:** Node.js ≥ 20.19.0, CommonJS, `node --test`, Alpine.js in CSP mode, Express (existing `express.json({ limit: "1mb" })`). **No new runtime dependencies.**

**Design record:** [`docs/superpowers/specs/2026-08-21-competence-employee-import-screen-design.md`](../specs/2026-08-21-competence-employee-import-screen-design.md)

## Global Constraints

- **Version:** competence `3.22.0` → `3.23.0` (minor). Bump `packages/competence/package.json` **and** `CHANGELOG.md`. No `web-framework` change.
- **No new runtime dependencies.** competence's list is `@ti-engine/core`, `@ti-engine/web-framework`, `graphology`, and it stays that way. The CSV parser was hand-written to keep it short.
- **CommonJS only** — `require()` / `module.exports`. No ESM.
- **Internal imports use `#alias`** from the package's `imports` map, never relative paths.
- **License header:** copy verbatim from an existing file in the competence package (`AGPL-3.0-or-later`). Never from web-framework, which is Apache-2.0.
- **Alpine runs in CSP mode:** no inline `style="..."` attributes in the fragment, and **no optional chaining (`?.`)** in template expressions. `Array`, `Object` and friends are unavailable inside template expressions — use component methods instead.
- **Tests are `node --test`** with `node:assert/strict`. Focused: `node --test packages/competence/test/<file>.test.js`. Full package suite: `npm test -w @ti-engine/competence`. **The bare directory form does not glob on Node 26** and running it from the repo root breaks tests that resolve paths relative to the package — do not use it.
- **Also run `npm run check:types`** at the root before the final commit. The CA-107 branch had a CI failure from a stale generated declaration; if a JSDoc `@returns` on an exported class changes, run `npm run build:types` and commit the result.
- **No employee personal data in any browser payload.** Counts, `employee_id` values, source line numbers, codes and label keys only — never a name, email, birth date or grading.
- **Commit convention:** Conventional Commits scoped to the package, referencing `CA-108`.
- **Never add a `Co-Authored-By: Claude` trailer** — it adds a `claude` PR author that fails this repo's CLA check.
- **Never `git add` any `.run/*.run.xml` file** — git-tracked but carrying live local credentials.

---

## File Structure

| File | Responsibility |
|---|---|
`packages/competence/application/organization-import.js` (modify) | Gains two pure whole-file checks, `findEncodingFailure` and `findHeaderFailure`, extracted from the CLI |
`packages/competence/bin/build/import-organization.js` (modify) | Calls the two extracted checks instead of its own inline copies; stderr wording unchanged |
`packages/competence/bin/competence-web-application.js` (modify) | `employee-import` fragment + sidebar entry; `#deriveImportPlan`, `#projectImportPlan`, `#previewEmployeeImport`, `#applyEmployeeImport`; two dispatch entries |
`packages/competence/bin/static/fragments/frame-employee-import.html` (create) | The screen: file picker, plan summary, rejection list, confirmation modal |
`packages/competence/bin/static/scripts/competence-user-interface.js` (modify) | `configureEmployeeImport` Alpine component + its `Alpine.data` registration |
`packages/competence/bin/localization/competence-labels.json` (modify) | en + bg labels for the screen and every failure code |
`packages/competence/test/organization-import.file-checks.test.js` (create) | Unit tests for the two extracted checks |
`packages/competence/test/employee-import-screen.test.js` (create) | Handler tests: role gate, no-personal-data projection, apply re-derives, post-apply rebuild |
`packages/competence/INSTALL.md` (modify) | §11: the screen as an alternative to the CLI, with its irreversibility |
`packages/competence/package.json`, `CHANGELOG.md` (modify) | 3.23.0 |

---

## Task 1: Extract the whole-file checks into the pure module

The three conditions that reject a file outright — undecodable encoding, a header missing required columns, a header repeating a column — currently sit **inline in the CLI**. The screen needs the same three. A second copy would drift, and these rules have history: the duplicate-header check exists because review found that `toRecords` silently overwrites a repeated column, and the encoding check exists because Node's `'utf8'` substitutes U+FFFD rather than throwing.

This task is **behaviour-preserving for the CLI**: same conditions, same order, same stderr wording, same exit code.

**Files:**
- Modify: `packages/competence/application/organization-import.js`
- Modify: `packages/competence/bin/build/import-organization.js`
- Create: `packages/competence/test/organization-import.file-checks.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, on `organizationImport.instance`:
  - `findEncodingFailure( text ) → null | { code: "not-utf8" }`
  - `findHeaderFailure( header ) → null | { code: "missing-columns" | "duplicate-columns", columns: string[] }`
  - Tasks 2 and 3 consume both. The module reports **codes**; each driver phrases them — the CLI to stderr, the handler as a label key. This mirrors how `employee-rules` returns label keys rather than prose.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-import.file-checks.test.js`. Copy the license header block **verbatim** from `packages/competence/application/organization-rules.js`.

```js
const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

const REQUIRED = [ "employee_id", "email", "first_name", "last_name", "work_mode",
    "work_location", "organization_unit_id", "role_family", "level", "stage" ];

describe( "organizationImport.findEncodingFailure", () => {

    it( "passes clean UTF-8 text", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "employee_id,email\n1,a@b.co" ), null );
    } );

    it( "passes text carrying non-ASCII that decoded correctly", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "first_name\nЗеленка" ), null );
    } );

    it( "reports a replacement character, which is what a mis-decoded file leaves behind", () => {
        assert.deepEqual( organizationImport.instance.findEncodingFailure( "first_name\n��" ), { code: "not-utf8" } );
    } );

    it( "treats an empty or absent input as clean, leaving the header check to report it", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "" ), null );
        assert.equal( organizationImport.instance.findEncodingFailure( undefined ), null );
    } );

} );

describe( "organizationImport.findHeaderFailure", () => {

    it( "passes a complete header", () => {
        assert.equal( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender" ] ) ), null );
    } );

    it( "reports every missing required column, not just the first", () => {
        const header = REQUIRED.filter( ( c ) => c !== "email" && c !== "stage" );
        assert.deepEqual( organizationImport.instance.findHeaderFailure( header ),
            { code: "missing-columns", columns: [ "email", "stage" ] } );
    } );

    it( "reports a repeated column", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender", "gender" ] ) ),
            { code: "duplicate-columns", columns: [ "gender" ] } );
    } );

    it( "reports each repeated column once even when it appears three times", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender", "gender", "gender" ] ) ),
            { code: "duplicate-columns", columns: [ "gender" ] } );
    } );

    it( "ignores empty header cells, which a trailing delimiter produces", () => {
        assert.equal( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "", "" ] ) ), null );
    } );

    it( "reports missing columns ahead of duplicates when a header has both", () => {
        const header = REQUIRED.filter( ( c ) => c !== "email" ).concat( [ "gender", "gender" ] );
        assert.deepEqual( organizationImport.instance.findHeaderFailure( header ),
            { code: "missing-columns", columns: [ "email" ] } );
    } );

    it( "reports an empty header as missing everything rather than throwing", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( [] ),
            { code: "missing-columns", columns: REQUIRED } );
    } );

} );
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/organization-import.file-checks.test.js
```

Expected: every case fails with `organizationImport.instance.findEncodingFailure is not a function` (and the same for `findHeaderFailure`).

- [ ] **Step 3: Add the two checks to the pure module**

In `packages/competence/application/organization-import.js`, add to the public interface after `mapRows` and before `reconcile`:

```js
    /**
     * Whether the file's text shows evidence of a decoding failure. Node's `'utf8'` decoding substitutes U+FFFD for
     * an undecodable byte instead of throwing, so a CP1251 export of Cyrillic names arrives as a string full of
     * replacement characters rather than as an error — and would otherwise be written to the store as mojibake.
     * Returns a code, not prose: each driver phrases it for its own audience. Pure.
     *
     * @method
     * @param {string} [text]
     * @returns {{code: string}|null}
     * @public
     */
    findEncodingFailure( text ) {
        return String( text == null ? "" : text ).includes( "�" ) ? { code: "not-utf8" } : null;
    }

    /**
     * Whether the parsed header is unusable as a whole, as opposed to a row being invalid. Two conditions qualify,
     * checked in this order:
     *  - a required column is absent, so no row could ever be mapped;
     *  - a column is repeated, which is fatal rather than per-row because {@link OrganizationImport#toRecords} keys
     *    each record by header cell — two columns normalizing to the same key silently overwrite, and the earlier
     *    column's data vanishes with no error anywhere.
     * Empty header cells are ignored: a trailing delimiter produces them and they name nothing. Pure.
     *
     * @method
     * @param {Array<string>} [header]
     * @returns {{code: string, columns: Array<string>}|null}
     * @public
     */
    findHeaderFailure( header ) {
        const cells = Array.isArray( header ) ? header : [];
        const missing = REQUIRED_COLUMNS.filter( ( column ) => !cells.includes( column ) );
        if ( missing.length > 0 ) {
            return { code: "missing-columns", columns: missing };
        }
        const duplicated = cells.filter( ( column, index ) => column.length > 0 && cells.indexOf( column ) !== index );
        if ( duplicated.length > 0 ) {
            return { code: "duplicate-columns", columns: Array.from( new Set( duplicated ) ) };
        }
        return null;
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test packages/competence/test/organization-import.file-checks.test.js
```

Expected: 11 passing.

- [ ] **Step 5: Switch the CLI to the extracted checks**

In `packages/competence/bin/build/import-organization.js`, replace the inline encoding check:

```js
    if ( organizationImport.instance.findEncodingFailure( text ) ) {
        process.stderr.write( "The file is not valid UTF-8. Re-export it as UTF-8 — a Windows-1251 export would store names as mojibake.\n" );
        return Promise.resolve( 2 );
    }
```

and replace both inline header checks (the `missing` block and the `duplicated` block) with one call, keeping the existing stderr wording for each case:

```js
    const headerFailure = organizationImport.instance.findHeaderFailure( header );
    if ( headerFailure && headerFailure.code === "missing-columns" ) {
        process.stderr.write( `The header is missing required column(s): ${ headerFailure.columns.join( ", " ) }\n` );
        process.stderr.write( "Run with --template to see the expected header row.\n" );
        return Promise.resolve( 2 );
    }
    if ( headerFailure && headerFailure.code === "duplicate-columns" ) {
        process.stderr.write( `The header repeats column(s): ${ headerFailure.columns.join( ", " ) }\n` );
        process.stderr.write( "Header names are matched case-insensitively after trimming, so 'Note' and 'NOTE' collide.\n" );
        return Promise.resolve( 2 );
    }
```

Delete the now-unused local `missing` and `duplicated` declarations. Keep the explanatory comment about why a duplicate header is fatal — move it to the `findHeaderFailure` JSDoc if it reads better there, but do not lose it.

- [ ] **Step 6: Prove the CLI is unchanged**

The existing CLI test file covers these paths. Run it, then the full suite:

```bash
node --test packages/competence/test/import-organization-cli.test.js
```

```bash
npm test -w @ti-engine/competence
```

Expected: both green. Any failure means the extraction changed behaviour.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/application/organization-import.js packages/competence/bin/build/import-organization.js packages/competence/test/organization-import.file-checks.test.js
git commit -m "refactor(competence): share the whole-file import checks between drivers (CA-108)"
```

---

## Task 2: The two service handlers

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js`
- Create: `packages/competence/test/employee-import-screen.test.js`
- Modify: `packages/competence/application/organization-import.js` and `packages/competence/bin/build/import-organization.js` — the three pure mapping-rejection helpers (`mapRowsToEmployeeIDs`, `toMappingRejection`, `excludeMappingErrorsFromAbsent`) move from the CLI onto the shared singleton so both drivers call one copy. Added after the task shipped with them reimplemented inline; recorded here so the declared scope matches what landed.

**Interfaces:**
- Consumes: `findEncodingFailure`, `findHeaderFailure` (Task 1); the existing `parseDelimited` / `toRecords` / `mapRows` / `reconcile` / `applyPlan`; `dataManager.instance.fetchEmployees` / `saveEmployee` / `appendAuditEntry`; `organizationManager.instance.buildOrganizationChart`.
- Produces: services `preview-employee-import` and `apply-employee-import`, each taking `{ csv }` and returning the projection shape below. Task 3 consumes both.

```
Projection = {
    counts:     { create: number, update: number, unchanged: number, rejected: number },
    rejections: Array<{ employeeID: string, row: number|null, code: string, message: string }>,
    absent:     Array<string>,
    applied:    { created: number, updated: number, skipped: number } | null
}
```

`applied` is `null` from preview and populated from apply. **No employee record ever appears in this shape.**

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/employee-import-screen.test.js` with the AGPL header. Read `packages/competence/test/competence-web-application.consent-fallback.test.js` first — it documents mocking `DataManager.prototype` obtained via the frozen `instance` (freezing an instance does not freeze its prototype), which is the technique this suite needs.

```js
const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let cacheStub;
let app;
let dataManager;
let organizationManager;

// A CSV whose values are deliberately distinctive, so a leak into the payload is unmistakable.
const CSV = [
    "employee_id,email,first_name,last_name,work_mode,work_location,organization_unit_id,role_family,level,stage",
    "90001,zelenka.vorobyeva@example.com,Zelenka,Vorobyeva,Full-time,On-site,1-1-1,SE,R,2",
    "90002,bartholomew.quintavalle@example.com,Bartholomew,Quintavalle,Contract,Remote,1-1-2,PM,S,1"
].join( "\n" );

// A third row whose organization_unit_id does not exist, so it rejects while the other two stand.
const CSV_WITH_REJECT = CSV + "\n90003,mireille.aubertin@example.com,Mireille,Aubertin,Full-time,Hybrid,9-9,SE,R,2";

const adminSession = () => ( { user: { userID: "admin@example.com", roles: [ "admin" ] } } );
const employeeSession = () => ( { user: { userID: "1", employeeID: "1", roles: [ 1 ] } } );

before( () => {
    cacheStub = installInMemoryCache();
    dataManager = require( "#data-manager" );
    organizationManager = require( "#organization-manager" );
    const CompetenceWebApplication = require( "../bin/competence-web-application" );
    app = Object.create( CompetenceWebApplication.prototype );
} );

beforeEach( async () => {
    cacheStub.storage = {};
    await cacheStub.setJSON( "ti:competence:data:employees", {} );
    await organizationManager.instance.buildOrganizationChart();
} );

describe( "employee import screen — access", () => {

    it( "refuses preview to a session without the admin role", async () => {
        await assert.rejects( () => app.processServiceRequest( employeeSession(), "preview-employee-import", { csv: CSV } ) );
    } );

    it( "refuses apply to a session without the admin role", async () => {
        await assert.rejects( () => app.processServiceRequest( employeeSession(), "apply-employee-import", { csv: CSV } ) );
    } );

} );

describe( "employee import screen — preview", () => {

    it( "returns counts for a clean file and writes nothing", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV } );

        assert.equal( result.counts.create, 2 );
        assert.equal( result.counts.rejected, 0 );
        assert.equal( result.applied, null );
        const stored = await dataManager.instance.fetchEmployees();
        assert.equal( stored.length, 0, "preview must not write" );
    } );

    it( "leaks no personal field into the payload", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV_WITH_REJECT } );
        const serialized = JSON.stringify( result );

        for ( const secret of [ "Zelenka", "Vorobyeva", "Bartholomew", "Quintavalle", "Mireille", "Aubertin", "example.com" ] ) {
            assert.equal( serialized.includes( secret ), false, `payload leaked '${ secret }'` );
        }
    } );

    it( "names a rejected row by employee_id and source line", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV_WITH_REJECT } );
        const rejection = result.rejections.find( ( entry ) => entry.employeeID === "90003" );

        assert.ok( rejection, "the invalid row must be reported" );
        assert.equal( rejection.row, 4 );
    } );

    it( "rejects a header missing a required column as a whole-file failure", async () => {
        const bad = "employee_id,email\n90001,a@b.co";
        await assert.rejects( () => app.processServiceRequest( adminSession(), "preview-employee-import", { csv: bad } ) );
    } );

    it( "rejects text carrying replacement characters as a whole-file failure", async () => {
        const bad = CSV.replace( "Zelenka", "��" );
        await assert.rejects( () => app.processServiceRequest( adminSession(), "preview-employee-import", { csv: bad } ) );
    } );

} );

describe( "employee import screen — apply", () => {

    it( "writes the good rows and reports the rejected one", async () => {
        const result = await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV_WITH_REJECT } );

        assert.equal( result.applied.created, 2 );
        assert.equal( result.counts.rejected, 1 );
        const stored = await dataManager.instance.fetchEmployees();
        assert.deepEqual( stored.map( ( e ) => e.employeeID ).sort(), [ "90001", "90002" ] );
    } );

    it( "attributes the audit entries to the acting admin", async () => {
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
        const entries = await dataManager.instance.getAuditEntriesForEmployee( "90001" );

        assert.ok( entries.length > 0, "an audit entry must be written" );
        assert.equal( entries[ 0 ].changedBy, "admin@example.com" );
    } );

    it( "IGNORES a plan posted by the client and applies what the CSV derives", async () => {
        const fabricated = {
            create: [ { employeeID: "66666", email: "attacker@example.com", personal: {}, career: {} } ],
            update: [], unchanged: [], rejected: [], absent: []
        };
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV, plan: fabricated } );

        const stored = await dataManager.instance.fetchEmployees();
        assert.deepEqual( stored.map( ( e ) => e.employeeID ).sort(), [ "90001", "90002" ] );
        assert.equal( stored.some( ( e ) => e.employeeID === "66666" ), false, "a client-supplied plan must never be written" );
    } );

    it( "rebuilds the organization chart so an imported employee is reachable without a restart", async () => {
        const prototype = Object.getPrototypeOf( organizationManager.instance );
        const original = prototype.buildOrganizationChart;
        let calls = 0;
        prototype.buildOrganizationChart = function ( ...args ) {
            calls++;
            return original.apply( this, args );
        };
        try {
            await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
            assert.ok( calls >= 1, "the chart must be rebuilt after a successful apply" );
        } finally {
            prototype.buildOrganizationChart = original;
        }
    } );

    it( "is idempotent — applying the same CSV twice creates nothing the second time", async () => {
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
        const second = await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );

        assert.equal( second.applied.created, 0 );
        assert.equal( second.applied.updated, 0 );
        assert.equal( second.counts.unchanged, 2 );
    } );

} );
```

**If `app = Object.create( CompetenceWebApplication.prototype )` cannot reach `processServiceRequest` because the constructor sets required state, do not fight it** — instantiate however `competence-web-application.consent-fallback.test.js` does, and say in your report which approach you used. Do not weaken an assertion to accommodate the harness.

`getAuditEntriesForEmployee( employeeID )` is the real accessor (`application/data-manager.js:1106`), verified — it orders entries by `timestamp` descending.

- [ ] **Step 2: Run it and confirm it fails**

```bash
node --test packages/competence/test/employee-import-screen.test.js
```

Expected: failures reporting that the services are unhandled — `processServiceRequest` falls through to `super`, which does not know `preview-employee-import`.

- [ ] **Step 3: Add the shared derive and project helpers**

In `packages/competence/bin/competence-web-application.js`, add to the private interface. `#deriveImportPlan` is the single place a plan is produced, which is what makes "apply re-derives" structural rather than a convention:

```js
    /**
     * Produces a reconciliation plan from raw CSV text. The ONLY input is the text — no caller may supply a plan.
     * That is deliberate: preview and apply both route through here, so a plan posted back by a client is never an
     * input to a write. A client-supplied plan would pass every check precisely because the checks already ran.
     *
     * @method
     * @param {string} csv
     * @returns {Promise<Object>} The plan from {@link OrganizationImport#reconcile}, with mapping errors merged in.
     * @private
     */
    #deriveImportPlan( csv ) {
        const text = String( csv == null ? "" : csv );
        if ( organizationImport.instance.findEncodingFailure( text ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS,
                { details: "error.employee-import.not-utf8" }, exceptions.httpCode.C_422 );
        }

        const parsed = organizationImport.instance.parseDelimited( text, { withLines: true } );
        const { header, records } = organizationImport.instance.toRecords( parsed.rows, parsed.lines );

        const headerFailure = organizationImport.instance.findHeaderFailure( header );
        if ( headerFailure ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, {
                details: `error.employee-import.${ headerFailure.code }`,
                columns: headerFailure.columns
            }, exceptions.httpCode.C_422 );
        }

        const { employees, errors } = organizationImport.instance.mapRows( records );

        return dataManager.instance.fetchEmployees().then( ( existing ) => {
            const plan = organizationImport.instance.reconcile( employees, existing, {
                roleFamilies: configurationLoader.configRoleFamilies,
                organizationStructure: configurationLoader.configOrganizationStructure
            } );

            // Mapping errors never reached reconcile, so merge them into one list the operator can read as the whole
            // truth — and drop their ids from `absent`, which would otherwise advise terminating an employee whose
            // row is present but unmapped. Mirrors the CLI exactly.
            const mappingRejections = errors.map( ( error ) => ( {
                employeeID: error.employeeID ? String( error.employeeID ) : "(unmapped)",
                row: error.row,
                code: error.code,
                message: `${ error.column }: ${ error.message }`
            } ) );
            const mappedIDs = new Set( mappingRejections.map( ( entry ) => entry.employeeID ) );
            plan.rejected = mappingRejections.concat( plan.rejected );
            plan.absent = plan.absent.filter( ( id ) => !mappedIDs.has( id ) );
            return plan;
        } );
    }

    /**
     * Reduces a plan to what may cross to a browser: counts, rejections and absent identifiers. No employee record,
     * and no personal field — this payload is rendered in a page and pasted into tickets. An `employee_id` is an
     * identifier the operator supplied rather than personal data, which is why it is the one field that crosses.
     *
     * @method
     * @param {Object} plan
     * @param {Object} [applied] Result of {@link OrganizationImport#applyPlan}, or null for a preview.
     * @returns {Object}
     * @private
     */
    #projectImportPlan( plan, applied ) {
        return {
            counts: {
                create: plan.create.length,
                update: plan.update.length,
                unchanged: plan.unchanged.length,
                rejected: plan.rejected.length
            },
            rejections: plan.rejected.map( ( entry ) => ( {
                employeeID: String( entry.employeeID ),
                row: ( entry.row === undefined ) ? null : entry.row,
                code: entry.code,
                message: entry.message
            } ) ),
            absent: plan.absent.map( ( id ) => String( id ) ),
            applied: applied ? applied : null
        };
    }
```

Add the require for `#organization-import` alongside the other `#`-alias requires at the top of the file if it is not already present.

- [ ] **Step 4: Add the two handlers**

Still in `competence-web-application.js`, add to the private interface:

```js
    /**
     * Previews an employee import. Admin-gated, writes nothing.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.csv
     * @returns {Promise<Object>}
     * @private
     */
    #previewEmployeeImport( session, params ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, "admin" );
            this.#deriveImportPlan( params ? params.csv : "" ).then( ( plan ) => {
                resolve( this.#projectImportPlan( plan, null ) );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Applies an employee import. Admin-gated. Re-derives the plan from the CSV — see {@link #deriveImportPlan} —
     * writes the good rows, reports the rejected ones, then rebuilds the organization chart so imported employees
     * are reachable and can sign in without a restart, which the CLI cannot do.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.csv
     * @returns {Promise<Object>}
     * @private
     */
    #applyEmployeeImport( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, "admin" );
            this.#deriveImportPlan( params ? params.csv : "" ).then( ( plan ) => {
                return organizationImport.instance.applyPlan( plan, {
                    save: ( employee ) => dataManager.instance.saveEmployee( employee ),
                    audit: ( entry ) => dataManager.instance.appendAuditEntry( Object.assign( { changedBy: userID }, entry ) )
                } ).then( ( applied ) => {
                    return organizationManager.instance.buildOrganizationChart().then( () => {
                        resolve( this.#projectImportPlan( plan, applied ) );
                    } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
```

- [ ] **Step 5: Wire the dispatch**

In the `processServiceRequest` chain, immediately after the `update-employee` entry:

```js
        } else if ( service === "preview-employee-import" ) {
            return this.#previewEmployeeImport( session, params );
        } else if ( service === "apply-employee-import" ) {
            return this.#applyEmployeeImport( session, params );
```

- [ ] **Step 6: Run the tests**

```bash
node --test packages/competence/test/employee-import-screen.test.js
```

Expected: all cases pass. Then the full suite:

```bash
npm test -w @ti-engine/competence
```

- [ ] **Step 7: Commit**

```bash
git add packages/competence/bin/competence-web-application.js packages/competence/test/employee-import-screen.test.js
git commit -m "feat(competence): add the employee import preview and apply services (CA-108)"
```

---

## Task 3: The screen

**Files:**
- Create: `packages/competence/bin/static/fragments/frame-employee-import.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`
- Modify: `packages/competence/bin/competence-web-application.js` (fragment + sidebar registration)

**Interfaces:**
- Consumes: `preview-employee-import` and `apply-employee-import` (Task 2), called via `tiApplication.sendRequest( "/app/<service>", "POST", { csv } )`.
- Produces: the `employee-import` screen at `/app/employee-import`, and the `competenceEmployeeImport` Alpine component.

- [ ] **Step 1: Register the fragment and sidebar entry**

In `packages/competence/bin/competence-web-application.js`, after the `admin-config` fragment registration:

```js
        this.addFragment( "employee-import", {
            title: "Employee Import",
            path: "fragments/frame-employee-import.html",
            roles: [ "admin" ]
        } );
```

and in the sidebar-section map, after `"admin-config": "administration",`:

```js
                    "employee-import": "administration",
```

- [ ] **Step 2: Write the Alpine component**

In `packages/competence/bin/static/scripts/competence-user-interface.js`, add the factory alongside the other `configure*` functions:

```js
/**
 * Alpine component for the admin employee-import screen (frame-employee-import.html). Reads the chosen CSV in the
 * browser and posts its TEXT through the ordinary service call — there is no multipart handling in the framework,
 * and none is needed at this size. Preview writes nothing; applying re-derives the plan server-side, so the plan
 * shown here is never an input to the write.
 *
 * @returns {Object}
 */
function configureEmployeeImport() {
    // express.json caps a request body at 1mb. Guard well inside it: 512KB of CSV is over 4000 employees, and
    // failing here with a clear message beats a raw 413 from the server.
    const MAX_CSV_BYTES = 512 * 1024;

    return {
        csv: "",
        fileName: "",
        busy: false,
        error: "",
        plan: null,
        confirming: false,

        reset() {
            this.csv = "";
            this.fileName = "";
            this.error = "";
            this.plan = null;
            this.confirming = false;
        },

        chooseFile( event ) {
            const file = event && event.target && event.target.files ? event.target.files[ 0 ] : null;
            this.reset();
            if ( !file ) {
                return;
            }
            if ( file.size > MAX_CSV_BYTES ) {
                this.error = tiApplication.getLabel( "interface.employee-import.error.too-large", "That file is too large to upload." );
                return;
            }
            this.fileName = file.name;
            const reader = new FileReader();
            reader.onload = () => {
                this.csv = String( reader.result || "" );
                this.preview();
            };
            reader.onerror = () => {
                this.error = tiApplication.getLabel( "interface.employee-import.error.unreadable", "That file could not be read." );
            };
            reader.readAsText( file, "utf-8" );
        },

        preview() {
            if ( !this.csv ) {
                return;
            }
            this.busy = true;
            this.error = "";
            tiApplication.sendRequest( "/app/preview-employee-import", "POST", { csv: this.csv } ).then( ( result ) => {
                this.plan = ( result && result.data ) ? result.data : null;
            } ).catch( ( error ) => {
                this.plan = null;
                this.error = tiApplication.formatException( error );
            } ).finally( () => {
                this.busy = false;
            } );
        },

        beginApply() {
            this.confirming = true;
        },

        cancelApply() {
            this.confirming = false;
        },

        confirmApply() {
            this.busy = true;
            this.confirming = false;
            tiApplication.sendRequest( "/app/apply-employee-import", "POST", { csv: this.csv } ).then( ( result ) => {
                this.plan = ( result && result.data ) ? result.data : null;
                tiApplication.notify( {
                    message: tiApplication.getLabel( "interface.employee-import.applied", "Import applied." ),
                    details: this.appliedSummary()
                } );
            } ).catch( ( error ) => {
                this.error = tiApplication.formatException( error );
            } ).finally( () => {
                this.busy = false;
            } );
        },

        // Alpine's CSP build cannot call Array/Object inside a template expression, so every derived value the
        // fragment needs is a method here.
        hasPlan() {
            return this.plan !== null;
        },

        wasApplied() {
            return this.plan !== null && this.plan.applied !== null;
        },

        canApply() {
            return this.hasPlan() && !this.wasApplied() && !this.busy &&
                ( this.plan.counts.create > 0 || this.plan.counts.update > 0 );
        },

        appliedSummary() {
            if ( !this.wasApplied() ) {
                return "";
            }
            const applied = this.plan.applied;
            return applied.created + " created, " + applied.updated + " updated, " + applied.skipped + " unchanged";
        },

        pendingSummary() {
            if ( !this.hasPlan() ) {
                return "";
            }
            const counts = this.plan.counts;
            return counts.create + " to create, " + counts.update + " to update, " +
                counts.unchanged + " unchanged, " + counts.rejected + " rejected";
        },

        rejectionLabel( entry ) {
            const where = entry.row ? tiApplication.getLabel( "interface.employee-import.line", "line" ) + " " + entry.row
                : tiApplication.getLabel( "interface.employee-import.unknown-line", "unknown line" );
            return where + ", employee_id '" + entry.employeeID + "': " + entry.message;
        }
    };
}
```

Register it beside the others:

```js
    Alpine.data( "competenceEmployeeImport", configureEmployeeImport );
```

These three helpers are verified against `packages/web-framework/bin/static/scripts/ti-framework.js`: `getLabel( label, fallback )` takes a fallback and house style always passes one; `formatException( error )` takes the error; and `notify( message )` accepts either a string or a `{ message, details }` object, which is why the applied toast can carry a details line.

- [ ] **Step 3: Write the fragment**

Create `packages/competence/bin/static/fragments/frame-employee-import.html` with exactly this markup. It follows the idiom of `frame-consent-register.html`: `x-text-label` for localized text with an English fallback as the element's content, `x-text` for dynamic values, `<template x-if>` / `<template x-for>` for conditionals and lists, and the framework's `ti-*` primitives rather than screen-specific CSS.

**No `style="..."` attribute and no `?.` appears anywhere below — that is the CSP constraint, not a stylistic preference.**

```html
<div class="ti-page" x-data="competenceEmployeeImport">

    <div class="ti-page-head">
        <div>
            <div class="ti-page-eyebrow" x-text-label="interface.employee-import.eyebrow">Administration</div>
            <h1 class="ti-page-title" x-text-label="interface.employee-import.title">Employee Import</h1>
            <p class="ti-page-subtitle" x-text-label="interface.employee-import.intro">Upload a UTF-8 CSV exported from the employee import template. Applying an import cannot be undone.</p>
        </div>
    </div>

    <section class="ti-panel">
        <div class="ti-panel-head bar">
            <div class="ti-panel-head-icon">
                <span class="ti-icon upload md" aria-hidden="true"></span>
            </div>
            <div class="ti-panel-head-text">
                <div class="ti-panel-title" x-text-label="interface.employee-import.choose">Choose CSV file</div>
                <div class="ti-panel-subtitle">
                    <template x-if="fileName">
                        <span x-text="fileName"></span>
                    </template>
                    <template x-if="!fileName">
                        <span x-text-label="interface.employee-import.no-file">No file chosen</span>
                    </template>
                </div>
            </div>
        </div>
        <div class="ti-panel-body">
            <p class="ti-panel-body-intro" x-text-label="interface.employee-import.export-hint">Export from the template with File &gt; Save As &gt; CSV UTF-8. Another encoding stores names incorrectly and is refused.</p>
            <div class="ti-form-row">
                <input class="ti-input" type="file" accept=".csv,text/csv" x-bind:disabled="busy" @change="chooseFile($event)">
            </div>
            <template x-if="busy">
                <p class="ti-form-hint" x-text-label="interface.employee-import.working">Working…</p>
            </template>
            <template x-if="error">
                <p class="ti-form-error" x-text="error"></p>
            </template>
        </div>
    </section>

    <template x-if="hasPlan()">
        <section class="ti-panel">
            <div class="ti-panel-head bar">
                <div class="ti-panel-head-icon">
                    <span class="ti-icon check-clipboard md" aria-hidden="true"></span>
                </div>
                <div class="ti-panel-head-text">
                    <div class="ti-panel-title" x-text-label="interface.employee-import.plan-title">Import plan</div>
                    <div class="ti-panel-subtitle" x-text="pendingSummary()"></div>
                </div>
                <div class="ti-panel-head-aside">
                    <template x-if="canApply()">
                        <button class="ti-button primary" type="button" @click="beginApply()" x-text-label="interface.employee-import.apply">Apply import</button>
                    </template>
                    <template x-if="wasApplied()">
                        <span class="ti-status-pill positive" x-text="appliedSummary()"></span>
                    </template>
                </div>
            </div>
            <div class="ti-panel-body">

                <template x-if="plan.rejections.length > 0">
                    <div>
                        <div class="ti-kv-label" x-text-label="interface.employee-import.rejections-title">Rejected rows</div>
                        <p class="ti-panel-body-intro" x-text-label="interface.employee-import.rejections-intro">Fix these in the spreadsheet and upload again. Re-uploading is safe — rows already written come back as unchanged.</p>
                        <ul class="ti-data-list">
                            <template x-for="entry in plan.rejections" x-bind:key="entry.employeeID + ':' + entry.row">
                                <li class="ti-data-list-item" x-text="rejectionLabel(entry)"></li>
                            </template>
                        </ul>
                    </div>
                </template>

                <template x-if="plan.absent.length > 0">
                    <div>
                        <div class="ti-kv-label" x-text-label="interface.employee-import.absent-title">In the system but not in this file</div>
                        <p class="ti-panel-body-intro" x-text-label="interface.employee-import.absent-intro">These are left untouched — a departure is never inferred from an omission. Mark a leaver with employment_status=terminated.</p>
                        <p class="ti-kv-value" x-text="absentSummary()"></p>
                    </div>
                </template>

            </div>
        </section>
    </template>

    <template x-if="confirming">
        <div class="ti-modal-backdrop">
            <div class="ti-modal" role="dialog" aria-modal="true">
                <div class="ti-modal-head">
                    <div class="ti-modal-title" x-text-label="interface.employee-import.confirm-title">Apply this import?</div>
                </div>
                <div class="ti-modal-body">
                    <p class="ti-kv-value" x-text="pendingSummary()"></p>
                    <p class="ti-form-error" x-text-label="interface.employee-import.confirm-warning">There is no rollback. A Redis backup taken before applying is the only way to undo this.</p>
                </div>
                <div class="ti-modal-foot">
                    <button class="ti-button" type="button" @click="cancelApply()" x-text-label="interface.employee-import.cancel">Cancel</button>
                    <button class="ti-button primary" type="button" x-bind:disabled="busy" @click="confirmApply()" x-text-label="interface.employee-import.confirm">Apply</button>
                </div>
            </div>
        </div>
    </template>

</div>
```

The markup references one component method the component in Step 2 does not yet have — `absentSummary()`. Add it there:

```js
        absentSummary() {
            return this.hasPlan() ? this.plan.absent.join( ", " ) : "";
        },
```

**Before committing, verify every class and directive against a shipped fragment.** `ti-data-list`, `ti-status-pill`, `ti-form-error`, `ti-form-hint`, `ti-modal-backdrop` and the `upload` icon are used above because they follow the framework's naming, but confirm each exists in `packages/web-framework/bin/static/ti-framework.css` (and the competence stylesheet) and substitute the nearest real primitive where one does not. Do not invent a new CSS class to make the markup above work — prefer an existing primitive, and say in your report which substitutions you made.

- [ ] **Step 4: Pin `absent` through the real handler**

`#projectImportPlan` threads `plan.absent` into the payload, and the panel you just built renders it — but no test asserts it through the actual service. Every existing case checks `counts`, `rejections`, `applied` or the stored employees. If the threading is wrong the list silently renders empty and nothing fails.

Add one case to `packages/competence/test/employee-import-screen.test.js`: seed an employee into the store, preview a CSV that does **not** contain that employee's `employee_id`, and assert the returned `absent` array contains exactly that id. Reuse the file's existing fixtures and session helpers rather than adding new ones.

```bash
node --test packages/competence/test/employee-import-screen.test.js
```

Expected: green, with the new case covering `absent`.

- [ ] **Step 5: Extend the fragment-binding guard**

`packages/competence/test/fragment-input-bindings.test.js` exists because three Written Feedback textareas silently dropped every keystroke — they bound a `ti-input` event that is never dispatched, and nothing caught it until a user reported lost input. This screen binds a **file input**, which is the same class of hazard: a wrong event name produces a control that looks fine and does nothing.

Read that file, then extend it to cover the new fragment. It must assert that `frame-employee-import.html`:
- binds its file input with the native `@change`, not `ti-input` or any other non-native event name;
- contains **no `style="`** attribute anywhere (the CSP rule);
- contains **no `?.`** anywhere (the CSP expression evaluator rejects optional chaining).

Follow whatever assertion style that file already uses — if it reads fragments and greps their text, do the same rather than introducing a parser.

```bash
node --test packages/competence/test/fragment-input-bindings.test.js
```

Expected: green, with the new assertions covering the new fragment.

- [ ] **Step 6: Verify in a browser**

Bring the stack up and check the screen end to end. Docker is available; run `docker compose up --build` from the repo root and open `http://localhost:3000`.

Sign in as an identity listed in `TI_WEB_AUTH_ADMINS`, open Administration → Employee Import, and confirm:
1. The screen loads and the sidebar entry appears **only** for an admin.
2. Choosing a valid CSV shows a plan with correct counts.
3. Choosing a file with a bad `organization_unit_id` lists the rejection by `employee_id` and line.
4. Choosing a header-broken file shows the whole-file error and no plan.
5. Apply asks for confirmation, and cancelling writes nothing.
6. Confirming applies, shows the applied summary, and the imported employee then appears in Employee Management **without a restart**.
7. At 375px width nothing overflows.

Capture a screenshot of the plan view. **Note:** a coordinate click can silently no-op in this environment — drive the walkthrough with `javascript_tool` `element.click()` rather than coordinate clicks.

- [ ] **Step 7: Run the suite and lint**

```bash
npm test -w @ti-engine/competence
```

```bash
npm run lint
```

Expected: green, 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-employee-import.html packages/competence/test/employee-import-screen.test.js packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/competence-web-application.js
git commit -m "feat(competence): add the employee import admin screen (CA-108)"
```

---

## Task 4: Labels, documentation, release

**Files:**
- Modify: `packages/competence/bin/localization/competence-labels.json`
- Modify: `packages/competence/INSTALL.md`
- Modify: `packages/competence/package.json`, `packages/competence/CHANGELOG.md`

- [ ] **Step 1: Add the labels**

In `packages/competence/bin/localization/competence-labels.json`, add every key the component and fragment reference, in **both** `en` and `bg`. That file is nested by dot-path with `{en, bg}` leaves — check a neighbouring `interface.*` entry and match its real shape.

The set, with their English text:
- `interface.employee-import.title` — "Employee Import"
- `interface.employee-import.intro` — "Upload a UTF-8 CSV exported from the employee import template. Applying an import cannot be undone."
- `interface.employee-import.choose` — "Choose CSV file"
- `interface.employee-import.applied` — "Import applied."
- `interface.employee-import.line` — "line"
- `interface.employee-import.unknown-line` — "unknown line"
- `interface.employee-import.error.too-large` — "That file is too large to upload. Split it, or use the command-line importer."
- `interface.employee-import.error.unreadable` — "That file could not be read."
- `error.employee-import.not-utf8` — "The file is not valid UTF-8. Re-export it as CSV UTF-8 — another encoding would store names incorrectly."
- `error.employee-import.missing-columns` — "The header is missing required columns."
- `error.employee-import.duplicate-columns` — "The header repeats a column. Names are matched case-insensitively after trimming, so 'Note' and 'NOTE' collide."

Add any further key your fragment references. Bulgarian text should read naturally rather than transliterate the English.

- [ ] **Step 2: Document the screen in INSTALL.md**

In `packages/competence/INSTALL.md` §11, in the "Importing employee data" section, add a short subsection presenting the screen as the alternative to the CLI. State:
- where it is (Administration → Employee Import, admin-only);
- that it takes the same CSV and applies the same rules, because it runs the same importer;
- that an apply through the screen is **as irreversible as `--apply`**, and the screen cannot take a Redis snapshot for you — so back up first exactly as for the CLI;
- that imported employees appear immediately, with **no restart needed**, which is the one way the screen differs from the CLI.

Match the file's existing voice.

- [ ] **Step 3: Bump the version and changelog**

Set `packages/competence/package.json` to `3.23.0`. Add a `## Version 3.23.0` section to the top of `CHANGELOG.md`, under the intro paragraph and above `## Version 3.22.0`. Match the format of the two sections above it, including whatever release-date convention they use.

Cover: the screen and its two services; that the CSV travels as a string in the ordinary service call so no multipart handling or dependency was added; that apply re-derives the plan server-side rather than trusting a client-supplied one, and why; that the payload carries no employee personal data; the shared whole-file checks refactor; and that a successful apply rebuilds the org chart so no restart is needed — naming that as the difference from the CLI.

- [ ] **Step 4: Full verification**

```bash
npm test -w @ti-engine/competence
```

```bash
npm run test:json -w @ti-engine/competence
```

```bash
npm run lint
```

```bash
npm run check:types
```

Expected: all green, no type drift. The competence package has a guide-freshness test that fails if the generated Help fragments go stale — a version bump alone must **not** make them stale, because they carry a placeholder substituted at serve time. If that test fails, stop and report rather than regenerating anything.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/bin/localization/competence-labels.json packages/competence/INSTALL.md packages/competence/package.json packages/competence/CHANGELOG.md
git commit -m "build(release): document the employee import screen and release competence 3.23.0 (CA-108)"
```

---

## Verification before opening the pull request

- [ ] `npm test` at the workspace root — every package's suite passes
- [ ] `npm run lint` — 0 errors
- [ ] `npm run test:json -w @ti-engine/competence` — passes
- [ ] `npm run check:types` — no drift (this is the check that failed CI on the CA-107 branch and is absent from most local checklists)
- [ ] `git diff --stat master -- '*.run.xml'` is empty
- [ ] The browser walkthrough of Task 3 Step 4 was completed, including the admin-only sidebar check
- [ ] CA-108 has its time logged and moves to `State: Verified` / `Stage: Done`
