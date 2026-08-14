# Config Drift Detection & Admin-Applied Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a release's configuration file changes reach an already-seeded deployment, by detecting drift between each registered file default and its stored value and letting an admin apply it as a normal audited change-set.

**Architecture:** A pure diff module in web-framework compares `ConfigRegistry.getDefault(key)` against `ConfigStore.getCurrent(key).value`. `ConfigService` exposes `getDrift` / `listDrift` / `applyDefaults`, the last routing through the existing `applyEdits` so every application is validated, versioned, audited and restorable. Three admin routes expose it; competence adds startup logging, an admin drift panel, and a Cycle Setup warning for family exclusions that the same staleness left behind.

**Tech Stack:** Node.js ≥ 20.19, CommonJS, `node --test`, ajv 8, RedisJSON via `@ti-engine/core/cache`, Alpine.js (CSP build) + HTMX for UI.

**Spec:** `docs/superpowers/specs/2026-08-14-config-drift-reconciliation-design.md`

## Global Constraints

- **CommonJS only** — `require()` / `module.exports`. No ESM.
- **Internal imports use the `#alias` map** in each package's `package.json` `imports`; cross-package imports use the `exports` map.
- **Alpine runs in CSP mode** — in HTML expressions: no inline `style="..."` attributes, no optional chaining (`?.`), no `Array`/`Object` globals. Use component methods instead.
- **Never mutate loaded config** — it is `deepFreeze`d.
- **Version targets:** web-framework `1.23.0` → `1.24.0`; competence `3.19.1` → `3.20.0`.
- **Competence declares `@ti-engine/web-framework` as `"*"`** (workspace wildcard) — there is no dependency range to bump. State the required floor (**web-framework ≥ 1.24.0**) in the competence changelog prose.
- **Every user-visible string is a label** in `bin/localization/competence-labels.json`, in both `en` and `bg`.
- **Commit messages** are Conventional Commits scoped to the package, referencing `CA-103`, and end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Never commit `.run/*.run.xml`** — they carry live local credentials.
- **Bash tool is Git Bash** — use heredocs for multi-line commit messages, never PowerShell `@'…'@`.

---

## File Structure

**web-framework — created**

| File | Responsibility |
|---|---|
| `components/config-drift.js` | Pure diff engine. No I/O. Exports `diffDocument` plus the status/kind constants. |
| `test/config-drift.test.js` | Unit tests for the diff engine in isolation. |
| `test/config-service.drift.test.js` | Tests for the three service methods over an in-memory cache. |

**web-framework — modified**

| File | Change |
|---|---|
| `package.json` | `#config-drift` entry in `imports`; version bump. |
| `components/config-service.js` | `getDrift`, `listDrift`, `applyDefaults`. |
| `components/admin-config-handlers.js` | `listDrift`, `getDrift`, `applyDefaults` handlers. |
| `bin/web-server.js` | Mount the three routes. |
| `test/admin-config-handlers.test.js` | Cover the three handlers. |
| `CHANGELOG.md` | 1.24.0 section. |

**competence — created**

| File | Responsibility |
|---|---|
| `test/config-drift-reporting.test.js` | Ordering guard + end-to-end characterization of the QE case. |

**competence — modified**

| File | Change |
|---|---|
| `application/configuration-loader.js` | Export `fileDefaults`; report drift at the end of `initialize()`. |
| `application/config-registration.js` | Pass `fileDefaults[key]` for the seven `STORE_BACKED` documents. |
| `bin/competence-web-application.js` | `staleExclusions` in the Cycle Setup payload. |
| `bin/static/scripts/competence-user-interface.js` | Drift panel state/methods; `isSelectedFamilyStaleExclusion`. |
| `bin/static/fragments/frame-admin-config.html` | Drift panel markup. |
| `bin/static/fragments/frame-cycle-setup.html` | Stale-exclusion line in the excluded banner. |
| `bin/localization/competence-labels.json` | New `interface.admin.drift-*` and `interface.cycle-setup.stale-exclusion` labels, en + bg. |
| `INSTALL.md`, `docs/user-guide/en/08-administrator.md` | Operator + end-user documentation. |
| `CHANGELOG.md`, `package.json` | 3.20.0. |

---

## Task 1: The pure diff engine

**Files:**
- Create: `packages/web-framework/components/config-drift.js`
- Create: `packages/web-framework/test/config-drift.test.js`
- Modify: `packages/web-framework/package.json` (the `imports` map)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `diffDocument( fileDefault, storedValue ) → { status, entries, counts }`
  - `status` is one of `"in-sync"`, `"drifted"`, `"absent"`, `"no-default"`
  - `entries` is `Array<{ path: string, kind: "added"|"removed"|"changed", addedMembers?: number, removedMembers?: number }>`
  - `counts` is `{ added: number, removed: number, changed: number }`

- [ ] **Step 1: Add the `#config-drift` alias and public export**

In `packages/web-framework/package.json`, inside `imports`, insert between `#config-change-notifier` and `#config-registry` (the map is alphabetical):

```json
    "#config-drift": {
      "types": "./types/components/config-drift.d.ts",
      "default": "./components/config-drift.js"
    },
```

And inside `exports`, alphabetically among the existing entries, so competence can diff against its own file defaults in tests:

```json
    "./config-drift": {
      "types": "./types/components/config-drift.d.ts",
      "default": "./components/config-drift.js"
    },
```

- [ ] **Step 2: Write the failing test**

Create `packages/web-framework/test/config-drift.test.js`:

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
const configDrift = require( "#config-drift" );

const pathsOf = ( result, kind ) => result.entries.filter( ( e ) => e.kind === kind ).map( ( e ) => e.path ).sort();

describe( "config-drift — statuses", () => {

    it( "reports no-default when the file default is undefined", () => {
        const result = configDrift.diffDocument( undefined, { a: 1 } );
        assert.equal( result.status, "no-default" );
        assert.deepEqual( result.entries, [] );
    } );

    it( "reports absent when the document has never been stored", () => {
        assert.equal( configDrift.diffDocument( { a: 1 }, null ).status, "absent" );
        assert.equal( configDrift.diffDocument( { a: 1 }, undefined ).status, "absent" );
    } );

    it( "reports in-sync for deep-equal values", () => {
        const result = configDrift.diffDocument( { a: { b: [ 1, 2 ] } }, { a: { b: [ 1, 2 ] } } );
        assert.equal( result.status, "in-sync" );
        assert.deepEqual( result.counts, { added: 0, removed: 0, changed: 0 } );
    } );

} );

describe( "config-drift — object traversal", () => {

    it( "reports a key present only in the file default as added", () => {
        const result = configDrift.diffDocument( { a: 1, b: 2 }, { a: 1 } );
        assert.equal( result.status, "drifted" );
        assert.deepEqual( pathsOf( result, "added" ), [ ".b" ] );
    } );

    it( "reports a key present only in the store as removed", () => {
        const result = configDrift.diffDocument( { a: 1 }, { a: 1, b: 2 } );
        assert.deepEqual( pathsOf( result, "removed" ), [ ".b" ] );
    } );

    it( "recurses into nested objects and reports leaf paths", () => {
        const result = configDrift.diffDocument(
            { competencies: { "E1-1": { name: "New" }, "E1-48": { name: "QE" } } },
            { competencies: { "E1-1": { name: "Old" } } }
        );
        assert.deepEqual( pathsOf( result, "added" ), [ ".competencies.E1-48" ] );
        assert.deepEqual( pathsOf( result, "changed" ), [ ".competencies.E1-1.name" ] );
    } );

    it( "renders numeric keys in bracket notation, matching the registry path dialect", () => {
        const result = configDrift.diffDocument( { list: { "0": "a" } }, { list: {} } );
        assert.deepEqual( pathsOf( result, "added" ), [ ".list[0]" ] );
    } );

} );

describe( "config-drift — arrays", () => {

    it( "set-diffs an array of primitives and counts the members", () => {
        const result = configDrift.diffDocument( { QE: [ "A", "B", "C" ] }, { QE: [ "A" ] } );
        const entry = result.entries.find( ( e ) => e.path === ".QE" );
        assert.equal( entry.kind, "changed" );
        assert.equal( entry.addedMembers, 2 );
        assert.equal( entry.removedMembers, 0 );
    } );

    it( "treats a reordered primitive array as in-sync (order is not meaningful for code lists)", () => {
        assert.equal( configDrift.diffDocument( { QE: [ "A", "B" ] }, { QE: [ "B", "A" ] } ).status, "in-sync" );
    } );

    it( "compares an array of objects atomically", () => {
        const result = configDrift.diffDocument( { rows: [ { n: 1 } ] }, { rows: [ { n: 2 } ] } );
        assert.deepEqual( pathsOf( result, "changed" ), [ ".rows" ] );
        assert.equal( result.entries[ 0 ].addedMembers, undefined );
    } );

} );

describe( "config-drift — counts", () => {

    it( "counts each kind", () => {
        const result = configDrift.diffDocument( { a: 1, b: 2, c: 3 }, { a: 9, b: 2, d: 4 } );
        assert.deepEqual( result.counts, { added: 1, removed: 1, changed: 1 } );
    } );

} );
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/web-framework && node --test test/config-drift.test.js`
Expected: FAIL — `Cannot find module '#config-drift'`

- [ ] **Step 4: Write the implementation**

Create `packages/web-framework/components/config-drift.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Pure structural diff between a configuration document's file default and the value currently held in the store.
 * <br/>
 * The store seeds from a file default exactly once ({@link ConfigStore#seedIfEmpty}), so a release that changes a
 * config file changes nothing an already-seeded deployment serves. This module is the detection half of the remedy:
 * it answers "how does the shipped default differ from what this deployment is running", in terms legible enough for
 * an admin to judge whether applying it is safe.
 * <br/>
 * No I/O — the caller supplies both values.
 *
 * @module config-drift
 */

const STATUS_IN_SYNC = "in-sync";
const STATUS_DRIFTED = "drifted";
const STATUS_ABSENT = "absent";
const STATUS_NO_DEFAULT = "no-default";

const KIND_ADDED = "added";
const KIND_REMOVED = "removed";
const KIND_CHANGED = "changed";

/**
 * @typedef {Object} ConfigDriftEntry
 * @property {string} path Dot/bracket data path, matching the dialect used for schema validation issues.
 * @property {string} kind One of "added", "removed", "changed".
 * @property {number} [addedMembers] For a primitive array: how many members the file default adds.
 * @property {number} [removedMembers] For a primitive array: how many members the file default drops.
 */

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && !Array.isArray( value );
}

/**
 * @param {*} value
 * @returns {boolean} True for an array holding no objects (a code list, a set of flags, …).
 */
function isPrimitiveArray( value ) {
    return Array.isArray( value ) && value.every( ( item ) => item === null || typeof item !== "object" );
}

/**
 * @param {string} base
 * @param {string} key
 * @returns {string} The child path, numeric keys in bracket notation.
 */
function joinPath( base, key ) {
    return ( /^\d+$/.test( key ) ) ? `${ base }[${ key }]` : `${ base }.${ key }`;
}

/**
 * Recursive worker. Appends to `entries` in place.
 *
 * @param {*} fileValue
 * @param {*} storedValue
 * @param {string} path
 * @param {ConfigDriftEntry[]} entries
 */
function diffValue( fileValue, storedValue, path, entries ) {
    if ( isPlainObject( fileValue ) && isPlainObject( storedValue ) ) {
        const keys = new Set( [ ...Object.keys( fileValue ), ...Object.keys( storedValue ) ] );
        for ( const key of keys ) {
            const childPath = joinPath( path, key );
            const inFile = Object.prototype.hasOwnProperty.call( fileValue, key );
            const inStored = Object.prototype.hasOwnProperty.call( storedValue, key );
            if ( inFile && !inStored ) {
                entries.push( { path: childPath, kind: KIND_ADDED } );
            } else if ( !inFile && inStored ) {
                entries.push( { path: childPath, kind: KIND_REMOVED } );
            } else {
                diffValue( fileValue[ key ], storedValue[ key ], childPath, entries );
            }
        }
        return;
    }

    // A list of codes is a set, not a sequence: report which members moved, and treat a pure reorder as no change.
    // This is what turns "role-family-competencies changed" into the far more useful "QE +27 codes".
    if ( isPrimitiveArray( fileValue ) && isPrimitiveArray( storedValue ) ) {
        const storedMembers = new Set( storedValue );
        const fileMembers = new Set( fileValue );
        const addedMembers = fileValue.filter( ( item ) => !storedMembers.has( item ) ).length;
        const removedMembers = storedValue.filter( ( item ) => !fileMembers.has( item ) ).length;
        if ( addedMembers > 0 || removedMembers > 0 ) {
            entries.push( { path: path, kind: KIND_CHANGED, addedMembers: addedMembers, removedMembers: removedMembers } );
        }
        return;
    }

    if ( JSON.stringify( fileValue ) !== JSON.stringify( storedValue ) ) {
        entries.push( { path: path, kind: KIND_CHANGED } );
    }
}

/**
 * Diffs a document's registered file default against its stored value.
 *
 * @method
 * @param {*} fileDefault The value registered with {@link ConfigRegistry#register}; `undefined` when none was.
 * @param {*} storedValue The value currently in the store; `null`/`undefined` when never written.
 * @returns {{status: string, entries: ConfigDriftEntry[], counts: {added: number, removed: number, changed: number}}}
 * @public
 */
module.exports.diffDocument = ( fileDefault, storedValue ) => {
    if ( fileDefault === undefined ) {
        return { status: STATUS_NO_DEFAULT, entries: [], counts: { added: 0, removed: 0, changed: 0 } };
    }
    if ( storedValue === undefined || storedValue === null ) {
        return { status: STATUS_ABSENT, entries: [], counts: { added: 0, removed: 0, changed: 0 } };
    }

    const entries = [];
    diffValue( fileDefault, storedValue, "", entries );

    const counts = { added: 0, removed: 0, changed: 0 };
    for ( const entry of entries ) {
        counts[ entry.kind ] += 1;
    }
    return { status: ( entries.length > 0 ) ? STATUS_DRIFTED : STATUS_IN_SYNC, entries: entries, counts: counts };
};
```

`diffDocument` is the module's only export. The status and kind strings are part of its documented return contract and are pinned by the tests above — do not add constant-export objects for them unless a caller actually needs to import one.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/web-framework && node --test test/config-drift.test.js`
Expected: PASS — 11 tests

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/components/config-drift.js packages/web-framework/test/config-drift.test.js packages/web-framework/package.json
```

```bash
git commit -F - <<'EOF'
feat(config-drift): pure structural diff between a file default and its stored value (CA-103)

The store seeds from a file default exactly once, so a release that changes a
config file changes nothing an already-seeded deployment serves. This is the
detection half: a pure diff that recurses into objects, set-diffs arrays of
primitives so a code-list change reads as "+27 codes" rather than "changed",
and compares arrays of objects atomically.

Paths use the same dot/bracket dialect as schema validation issues.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: ConfigService drift methods

**Files:**
- Modify: `packages/web-framework/components/config-service.js`
- Create: `packages/web-framework/test/config-service.drift.test.js`

**Interfaces:**
- Consumes: `configDrift.diffDocument` from Task 1.
- Produces:
  - `service.getDrift( configKey ) → Promise<{ configKey, status, counts, entries, storedVersion, editable, label }>`
  - `service.listDrift() → Promise<Array<{ configKey, status, counts, storedVersion, editable, label }>>` (no `entries`)
  - `service.applyDefaults( configKeys: string[], meta: { adminID, note? } ) → Promise<{ok: true, changeSetID, versions} | {ok: false, errors}>`

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/config-service.drift.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

// POOL is the applicability universe; SETS must stay within it. This mirrors the competence
// role-family-competencies / active-competency-sets pair that motivated the feature.
const POOL = { $id: "https://ti.test/pool.json", type: "object", additionalProperties: { type: "array", items: { type: "string" } } };
const SETS = { $id: "https://ti.test/sets.json", type: "object", additionalProperties: { type: "array", items: { type: "string" } } };

const setsWithinPool = ( value, context ) => context.getConfig( "pool" ).then( ( pool ) => {
    const issues = [];
    for ( const [ family, codes ] of Object.entries( value ) ) {
        const allowed = new Set( ( pool && pool[ family ] ) ? pool[ family ] : [] );
        for ( const code of codes ) {
            if ( !allowed.has( code ) ) issues.push( { path: `.${ family }`, message: `${ code } is outside the pool` } );
        }
    }
    return issues;
} );

let cacheStub;
let store;
let ConfigRegistry;
let ConfigService;
let ConfigChangeNotifier;
let registry;
let service;
let notifier;

before( () => {
    cacheStub = installInMemoryCache();
    store = require( "#config-store" ).instance;
    ConfigRegistry = require( "#config-registry" );
    ConfigService = require( "#config-service" );
    ConfigChangeNotifier = require( "#config-change-notifier" );
} );

beforeEach( () => {
    cacheStub.storage = {};
    registry = new ConfigRegistry();
    // The file defaults — what a new release ships.
    registry.register( "pool", { schema: POOL, defaultValue: { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] }, metadata: { label: "pool", editable: false } } );
    registry.register( "sets", { schema: SETS, validators: [ setsWithinPool ], defaultValue: { SE: [ "A" ], QE: [ "Q1" ] }, metadata: { label: "sets", editable: true } } );
    registry.register( "nodefault", { schema: POOL, metadata: { label: "nodefault" } } );
    notifier = new ConfigChangeNotifier();
    service = new ConfigService( { store: store, registry: registry, notifier: notifier } );
} );

describe( "ConfigService — getDrift / listDrift", () => {

    it( "reports absent for a document that was never seeded", async () => {
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "absent" );
        assert.equal( drift.storedVersion, 0 );
    } );

    it( "reports in-sync when the store matches the file default", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] } );
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "in-sync" );
        assert.equal( drift.storedVersion, 1 );
    } );

    it( "reports drift with entries, metadata and the stored version", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A" ] } );
        const drift = await service.getDrift( "pool" );
        assert.equal( drift.status, "drifted" );
        assert.equal( drift.label, "pool" );
        assert.equal( drift.editable, false );
        assert.equal( drift.storedVersion, 1 );
        const entry = drift.entries.find( ( e ) => e.path === ".QE" );
        assert.equal( entry.addedMembers, 2 );
    } );

    it( "reports no-default for a document registered without one", async () => {
        assert.equal( ( await service.getDrift( "nodefault" ) ).status, "no-default" );
    } );

    it( "rejects an unregistered configKey", async () => {
        await assert.rejects( () => service.getDrift( "missing" ) );
    } );

    it( "fails closed when the store is unreachable, rather than reporting in-sync", async () => {
        // An unreadable store must never be mistaken for "the deployment matches the build" — that would report
        // everything as up to date at exactly the moment nothing can be verified.
        const brokenStore = { getCurrent: () => Promise.reject( new Error( "cache unavailable" ) ) };
        const brokenService = new ConfigService( { store: brokenStore, registry: registry, notifier: notifier } );
        await assert.rejects( () => brokenService.getDrift( "pool" ), /cache unavailable/ );
        await assert.rejects( () => brokenService.listDrift(), /cache unavailable/ );
    } );

    it( "listDrift covers every registered document and omits entries", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [ "A" ] } );
        const all = await service.listDrift();
        assert.deepEqual( all.map( ( d ) => d.configKey ).sort(), [ "nodefault", "pool", "sets" ] );
        const pool = all.find( ( d ) => d.configKey === "pool" );
        assert.equal( pool.status, "drifted" );
        assert.equal( pool.entries, undefined );
        assert.equal( pool.counts.changed, 1 );
    } );

} );

describe( "ConfigService — applyDefaults", () => {

    it( "commits interdependent documents as one change-set, so cross-document validation sees pending values", async () => {
        // The pre-release state: QE has neither pool codes nor set codes.
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [ "A" ], QE: [] } );

        // Applying "sets" alone must fail — Q1 is not in the stored pool.
        const alone = await service.applyDefaults( [ "sets" ], { adminID: "admin:1" } );
        assert.equal( alone.ok, false );
        assert.ok( alone.errors.sets );

        // Applying both together succeeds, because the validator sees the pending pool.
        const together = await service.applyDefaults( [ "pool", "sets" ], { adminID: "admin:1", note: "release 2.0" } );
        assert.equal( together.ok, true );
        assert.deepEqual( ( await store.getCurrent( "pool" ) ).value, { SE: [ "A", "B" ], QE: [ "A", "Q1", "Q2" ] } );
        assert.deepEqual( ( await store.getCurrent( "sets" ) ).value, { SE: [ "A" ], QE: [ "Q1" ] } );
    } );

    it( "publishes a config:changed event naming every applied document", async () => {
        await store.seedIfEmpty( "pool", { SE: [], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [], QE: [] } );
        let event = null;
        notifier.subscribe( ( received ) => { event = received; } );
        await service.applyDefaults( [ "pool", "sets" ], { adminID: "admin:1" } );
        assert.deepEqual( event.configKeys.sort(), [ "pool", "sets" ] );
    } );

    it( "seeds an absent document, applying at expectedVersion 0", async () => {
        const result = await service.applyDefaults( [ "pool" ], { adminID: "admin:1" } );
        assert.equal( result.ok, true );
        assert.equal( result.versions.pool, 1 );
    } );

    it( "writes nothing when validation fails", async () => {
        await store.seedIfEmpty( "pool", { SE: [ "A", "B" ], QE: [] } );
        await store.seedIfEmpty( "sets", { SE: [ "A" ], QE: [] } );
        const result = await service.applyDefaults( [ "sets" ], { adminID: "admin:1" } );
        assert.equal( result.ok, false );
        assert.equal( ( await store.getCurrent( "sets" ) ).version, 1, "the stored document is untouched" );
    } );

    it( "refuses a document with no registered default", async () => {
        await assert.rejects( () => service.applyDefaults( [ "nodefault" ], { adminID: "admin:1" } ) );
    } );

    it( "rejects empty input or a missing adminID", async () => {
        await assert.rejects( () => service.applyDefaults( [], { adminID: "admin:1" } ) );
        await assert.rejects( () => service.applyDefaults( [ "pool" ], {} ) );
    } );

    it( "deduplicates repeated keys rather than failing the change-set", async () => {
        const result = await service.applyDefaults( [ "pool", "pool" ], { adminID: "admin:1" } );
        assert.equal( result.ok, true );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/web-framework && node --test test/config-service.drift.test.js`
Expected: FAIL — `service.getDrift is not a function`

- [ ] **Step 3: Import the diff module**

In `packages/web-framework/components/config-service.js`, add below the existing `exceptions` require near the top of the file:

```js
const configDrift = require( "#config-drift" );
```

- [ ] **Step 4: Add the three methods**

In `packages/web-framework/components/config-service.js`, insert immediately **before** the `seedDefault( configKey, defaultValue )` method:

```js
    /* Public interface — drift against file defaults */

    /**
     * Compares a document's registered file default against the value currently in the store. This is how a
     * configuration change shipped in a release becomes visible on a deployment that was seeded before it — the
     * store seeds only once, so a later file change is otherwise invisible.
     *
     * @method
     * @param {string} configKey
     * @returns {Promise<{configKey: string, status: string, counts: Object, entries: Array, storedVersion: number, editable: boolean, label: string}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} If the document is not registered.
     * @public
     */
    getDrift( configKey ) {
        if ( !this.#registry.has( configKey ) ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-config", configKey: configKey } ) );
        }
        const metadata = this.#registry.metadataFor( configKey ) || {};
        return this.#store.getCurrent( configKey ).then( ( current ) => {
            const diff = configDrift.diffDocument( this.#registry.getDefault( configKey ), current ? current.value : null );
            return {
                configKey: configKey,
                status: diff.status,
                counts: diff.counts,
                entries: diff.entries,
                storedVersion: current ? current.version : 0,
                editable: metadata.editable !== false,
                label: metadata.label || configKey
            };
        } );
    }

    /**
     * Drift summaries for every registered document — counts only, no entry lists, so it stays cheap enough for a
     * landing screen and a startup log.
     *
     * @method
     * @returns {Promise<Array<Object>>}
     * @public
     */
    listDrift() {
        return Promise.all( this.#registry.list().map( ( configKey ) => {
            return this.getDrift( configKey ).then( ( drift ) => ( {
                configKey: drift.configKey,
                status: drift.status,
                counts: drift.counts,
                storedVersion: drift.storedVersion,
                editable: drift.editable,
                label: drift.label
            } ) );
        } ) );
    }

    /**
     * Applies the registered file defaults for the given documents, as a single validated change-set.
     * <br/>
     * Routing through {@link ConfigService#applyEdits} is deliberate: the application is schema- and
     * semantically validated, versioned, correlated into one change-set, added to the audit feed, and restorable —
     * and, because a validator sees its siblings at their *pending* value, interdependent documents applied
     * together validate against each other rather than against the stale stored state.
     *
     * @method
     * @param {string[]} configKeys
     * @param {Object} meta
     * @param {string} meta.adminID
     * @param {string} [meta.note]
     * @returns {Promise<{ok: true, changeSetID: string, versions: Object}|{ok: false, errors: Object}>}
     * @throws {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On bad input, an unknown key, or a key with no default.
     * @public
     */
    applyDefaults( configKeys, meta ) {
        if ( !Array.isArray( configKeys ) || configKeys.length === 0 || !meta || !meta.adminID ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "invalid-apply-defaults-input" } ) );
        }
        const keys = Array.from( new Set( configKeys ) );
        const unknown = keys.filter( ( key ) => !this.#registry.has( key ) );
        if ( unknown.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-config", configKeys: unknown } ) );
        }
        const withoutDefault = keys.filter( ( key ) => this.#registry.getDefault( key ) === undefined );
        if ( withoutDefault.length > 0 ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "no-default", configKeys: withoutDefault } ) );
        }

        return Promise.all( keys.map( ( key ) => this.#store.getCurrent( key ) ) ).then( ( currents ) => {
            const edits = keys.map( ( key, index ) => ( {
                configKey: key,
                value: this.#registry.getDefault( key ),
                expectedVersion: currents[ index ] ? currents[ index ].version : 0
            } ) );
            return this.applyEdits( edits, { adminID: meta.adminID, note: meta.note || "applied file defaults" } );
        } );
    }

```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/web-framework && node --test test/config-service.drift.test.js`
Expected: PASS — 14 tests

- [ ] **Step 6: Run the whole framework suite for regressions**

Run: `cd packages/web-framework && npm test`
Expected: PASS — no previously-passing test fails

- [ ] **Step 7: Commit**

```bash
git add packages/web-framework/components/config-service.js packages/web-framework/test/config-service.drift.test.js
```

```bash
git commit -F - <<'EOF'
feat(config-service): getDrift, listDrift and applyDefaults (CA-103)

Compares each registered file default against its stored value, and applies a
selection of defaults as one validated change-set.

applyDefaults routes through applyEdits rather than writing directly, so an
application is validated, versioned, audited and restorable. Applying
interdependent documents together is not merely convenient but required: a
validator resolves its siblings at their pending value, so a document whose
constraint spans another (active sets within their pool) can only pass when
both are in the same change-set.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Admin HTTP API, version bump and changelog

**Files:**
- Modify: `packages/web-framework/components/admin-config-handlers.js`
- Modify: `packages/web-framework/bin/web-server.js` (after line 587)
- Modify: `packages/web-framework/test/admin-config-handlers.test.js`
- Modify: `packages/web-framework/package.json`, `packages/web-framework/CHANGELOG.md`

**Interfaces:**
- Consumes: `service.getDrift`, `service.listDrift`, `service.applyDefaults` from Task 2.
- Produces: `GET /admin/config/drift`, `GET /admin/config/drift/:configKey`, `POST /admin/config/drift/apply` — all admin-gated, all responding `{ isSuccessful: true, data }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/web-framework/test/admin-config-handlers.test.js`, inside the existing top-level `describe( "admin-config-handlers", ... )` block:

```js
    it( "listDrift responds with the drift summaries", async () => {
        const service = { listDrift: () => Promise.resolve( [ { configKey: "pool", status: "drifted" } ] ) };
        const res = mockRes();
        handlers.listDrift( service )( mockReq(), res, () => {} );
        await tick();
        assert.equal( res.body.isSuccessful, true );
        assert.deepEqual( res.body.data, [ { configKey: "pool", status: "drifted" } ] );
    } );

    it( "getDrift passes the configKey through", async () => {
        let receivedKey;
        const service = { getDrift: ( key ) => { receivedKey = key; return Promise.resolve( { configKey: key, status: "in-sync" } ); } };
        const res = mockRes();
        handlers.getDrift( service )( mockReq( { params: { configKey: "pool" } } ), res, () => {} );
        await tick();
        assert.equal( receivedKey, "pool" );
        assert.equal( res.body.data.status, "in-sync" );
    } );

    it( "applyDefaults forwards the configKeys, note and the acting admin", async () => {
        let received;
        const service = { applyDefaults: ( keys, meta ) => { received = { keys, meta }; return Promise.resolve( { ok: true, changeSetID: "cs1", versions: {} } ); } };
        const res = mockRes();
        handlers.applyDefaults( service )( mockReq( { body: { configKeys: [ "pool", "sets" ], note: "release 2.0" } } ), res, () => {} );
        await tick();
        assert.deepEqual( received.keys, [ "pool", "sets" ] );
        assert.equal( received.meta.note, "release 2.0" );
        assert.equal( received.meta.adminID, "oauth2:admin1" );
        assert.equal( res.body.data.ok, true );
    } );

    it( "applyDefaults forwards a rejection to the error middleware", async () => {
        const service = { applyDefaults: () => Promise.reject( conflict() ) };
        let forwarded = null;
        handlers.applyDefaults( service )( mockReq( { body: { configKeys: [ "pool" ] } } ), mockRes(), ( error ) => { forwarded = error; } );
        await tick();
        assert.ok( forwarded, "the error reached next()" );
    } );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/web-framework && node --test test/admin-config-handlers.test.js`
Expected: FAIL — `handlers.listDrift is not a function`

- [ ] **Step 3: Add the handlers**

Append to `packages/web-framework/components/admin-config-handlers.js`, after the existing `exportBundle` handler:

```js
/**
 * `GET /admin/config/drift` — drift summaries for every registered document.
 *
 * @param {ConfigService} service
 * @returns {Function} The Express handler.
 */
module.exports.listDrift = ( service ) => ( request, response, next ) => {
    service.listDrift().then( ( drift ) => sendData( response, drift ) ).catch( ( error ) => forward( next, error ) );
};

/**
 * `GET /admin/config/drift/:configKey` — one document's drift, including the full entry list.
 *
 * @param {ConfigService} service
 * @returns {Function} The Express handler.
 */
module.exports.getDrift = ( service ) => ( request, response, next ) => {
    service.getDrift( request.params.configKey ).then( ( drift ) => sendData( response, drift ) ).catch( ( error ) => forward( next, error ) );
};

/**
 * `POST /admin/config/drift/apply` — applies the file defaults for the named documents as one change-set.
 *
 * @param {ConfigService} service
 * @returns {Function} The Express handler.
 */
module.exports.applyDefaults = ( service ) => ( request, response, next ) => {
    const body = request.body || {};
    service.applyDefaults( body.configKeys, { adminID: adminID( request ), note: body.note } ).then( ( result ) => sendData( response, result ) ).catch( ( error ) => forward( next, error ) );
};
```

- [ ] **Step 4: Mount the routes**

In `packages/web-framework/bin/web-server.js`, immediately after the `/admin/config/export` line (line 587):

```js
        this.#webServer.get( "/admin/config/drift", requireAdmin, adminConfigHandlers.listDrift( service ) );
        this.#webServer.get( "/admin/config/drift/:configKey", requireAdmin, adminConfigHandlers.getDrift( service ) );
        this.#webServer.post( "/admin/config/drift/apply", requireAdmin, adminConfigHandlers.applyDefaults( service ) );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/web-framework && node --test test/admin-config-handlers.test.js`
Expected: PASS

- [ ] **Step 6: Regenerate and verify the type declarations**

The committed `types/` trees are generated, and CI gates on them being current. Use the **root** scripts, not the per-package `tsc` — `check:types` is what `.github/workflows/ci.yml` runs.

Run: `npm run build:types` (from the repo root)
Expected: succeeds, producing `packages/web-framework/types/components/config-drift.d.ts` and updating `config-service.d.ts` / `admin-config-handlers.d.ts`

Run: `npm run check:types` (from the repo root)
Expected: reports no drift.

Known Windows quirk: `check:types` compares file content read as utf8, so a git checkout (CRLF) against a fresh build (LF) can report false drift after a branch switch. If it reports drift on files this task did not touch, that is the quirk — confirm with `git diff --stat` that the reported files are genuinely unchanged before chasing it.

- [ ] **Step 7: Bump the version and write the changelog**

In `packages/web-framework/package.json`, change `"version": "1.23.0"` to `"version": "1.24.0"`.

In `packages/web-framework/CHANGELOG.md`, insert directly below the intro paragraph, above `## Version 1.23.0`:

```markdown
## Version 1.24.0

A configuration file change shipped in a release could never reach a deployment that had already been seeded. The
store writes a file default only when the document has never been written, and the consuming application then lets
the stored value overwrite the file value on every boot — so the file default is consulted exactly once in a
deployment's lifetime. Restore could not help either, since it replays a previous version and the oldest version
*is* the stale one. The framework now detects that difference and lets an admin apply it deliberately.

* feat(config-drift): new `#config-drift` module — a pure structural diff between a document's registered file
  default and its stored value. Recurses into objects to report leaf paths, **set-diffs arrays of primitives** so a
  code-list change reads as `+27 codes` rather than an opaque "changed", and compares arrays of objects atomically.
  Paths use the same dot/bracket dialect as schema validation issues
* feat(config-service): `getDrift`, `listDrift` and `applyDefaults`. Applying routes through `applyEdits`, so a
  file default lands validated, versioned, correlated into one change-set, in the audit feed, and restorable —
  never as a side-channel write
* feat(config-service): interdependent documents apply as a **single** change-set, which is required rather than
  merely convenient: a semantic validator resolves its siblings at their *pending* value, so a document whose
  constraint spans another can only pass when both are applied together
* feat(admin-config-handlers): `GET /admin/config/drift`, `GET /admin/config/drift/:configKey` and
  `POST /admin/config/drift/apply`, all admin-gated
* build(release): bump package version from `1.23.0` to `1.24.0`

**Note on statuses:** `absent` (never seeded) is deliberately distinct from `drifted`. A document that is registered
but never seeded is not a problem to act on, and folding the two together would flag it on every boot of a clean
install — training operators to ignore exactly the signal this feature exists to raise.
```

- [ ] **Step 8: Run the full framework suite**

Run: `cd packages/web-framework && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/web-framework/components/admin-config-handlers.js packages/web-framework/bin/web-server.js packages/web-framework/test/admin-config-handlers.test.js packages/web-framework/package.json packages/web-framework/CHANGELOG.md packages/web-framework/types
```

```bash
git commit -F - <<'EOF'
feat(admin-config-handlers): expose config drift over the admin API (CA-103)

Three admin-gated routes: list drift across every registered document, read one
document's full entry list, and apply a selection of file defaults as one
change-set.

Bumps web-framework to 1.24.0 and regenerates the type declarations.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: Competence — file-default hardening and startup reporting

**Files:**
- Modify: `packages/competence/application/configuration-loader.js`
- Modify: `packages/competence/application/config-registration.js`
- Create: `packages/competence/test/config-drift-reporting.test.js`

**Interfaces:**
- Consumes: `service.listDrift()` from Task 2.
- Produces: `configurationLoader.fileDefaults` — a frozen `{ [configKey]: value }` map of the seven `STORE_BACKED` file defaults, captured at module load and never overwritten by store values.

**Critical detail:** `competence-labels` is registered as a document but is **not** in `STORE_BACKED`, so `fileDefaults["competence-labels"]` is `undefined`. Leave that registration reading the directly-required `competenceLabels` constant. Only the seven `STORE_BACKED` documents change.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/config-drift-reporting.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// NOTE: this suite drives configuration-loader.initialize(), which reassigns the module's exported config objects.
// node --test isolates each file in its own process, so it must stay in a file of its own.

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const configurationLoader = require( "#configuration-loader" );
const configDrift = require( "@ti-engine/web-framework/config-drift" );

const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

describe( "configuration-loader — file defaults survive store initialization", () => {

    it( "exposes the seven store-backed file defaults", () => {
        assert.deepEqual( Object.keys( configurationLoader.fileDefaults ).sort(), [
            "active-competency-sets", "competencies", "relevancy-archetypes", "research-consent",
            "role-families", "role-family-competencies", "stage-levels"
        ] );
    } );

    it( "keeps fileDefaults pointing at the FILE value after initialize() overwrites the exports", async () => {
        const fileCompetencyCount = Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length;
        assert.ok( fileCompetencyCount > 100, "sanity: the file dictionary is populated" );

        // A store holding a deliberately truncated dictionary, standing in for a deployment seeded before a release.
        const stored = { categories: {}, competencies: { "E1-1": { relevancyArchetype: "A" } } };
        const stubService = {
            seedDefault: () => Promise.resolve( { value: stored, version: 1 } ),
            getCurrent: ( configKey ) => Promise.resolve( { value: ( configKey === "competencies" ) ? stored : {}, version: 1 } ),
            onConfigChanged: () => () => {},
            listDrift: () => Promise.resolve( [] )
        };
        await configurationLoader.initialize( stubService );

        // The export is now the store value — that is the documented behaviour.
        assert.equal( Object.keys( configurationLoader.configCompetencies.competencies ).length, 1 );
        // But the file default must be untouched, or drift detection would compare the store against itself.
        assert.equal( Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length, fileCompetencyCount );
    } );

} );

describe( "config drift — the CA-98 QE case end to end", () => {

    it( "detects the QE pool addition and resolves it once the default is applied", () => {
        const fileDefault = configurationLoader.fileDefaults[ "role-family-competencies" ];
        assert.ok( fileDefault.QE.length > 50, "sanity: QE carries its own competencies in the file" );

        // Reconstruct a pre-CA-98 store: QE holding only the shared canonical codes it had before the release.
        const storedValue = clone( fileDefault );
        storedValue.QE = storedValue.XD.slice();

        const drift = configDrift.diffDocument( fileDefault, storedValue );
        assert.equal( drift.status, "drifted" );
        const entry = drift.entries.find( ( e ) => e.path === ".QE" );
        assert.ok( entry.addedMembers > 20, "the QE family-specific competencies are reported as added members" );

        // Applying the file default is what closes the gap — the post-apply value is the file default itself.
        assert.equal( configDrift.diffDocument( fileDefault, fileDefault ).status, "in-sync" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/competence && node --test test/config-drift-reporting.test.js`
Expected: FAIL — `Cannot find module '@ti-engine/web-framework/config-drift'`, then `fileDefaults` undefined

- [ ] **Step 3: Export `fileDefaults` from the configuration loader**

In `packages/competence/application/configuration-loader.js`, immediately after the `fileDefaults` population loop (the `Object.entries( STORE_BACKED ).forEach(...)` block ending near line 255), add:

```js
/**
 * The file defaults for every store-backed document, captured at module load and **never** reassigned.
 * <br/>
 * `applyStoreValue` replaces the exported `configX` objects with store values, so those exports stop being the file
 * default the moment {@link initialize} runs. Drift detection needs the file value specifically — comparing the
 * store against itself would silently report "in sync" forever — so it reads this map instead. It is also what
 * `config-registration` registers as each document's `defaultValue`, which makes the registration independent of
 * whether it happens before or after initialization.
 *
 * @type {Object<string, Object>}
 * @public
 */
module.exports.fileDefaults = Object.freeze( fileDefaults );
```

- [ ] **Step 4: Register the file defaults explicitly**

In `packages/competence/application/config-registration.js`, replace each `defaultValue:` line for the **seven store-backed documents** with a `fileDefaults` lookup. Leave `competence-labels` alone — it is not store-backed, so `fileDefaults` has no entry for it.

```js
        defaultValue: configurationLoader.fileDefaults[ "competencies" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "relevancy-archetypes" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "active-competency-sets" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "role-families" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "role-family-competencies" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "stage-levels" ],
```
```js
        defaultValue: configurationLoader.fileDefaults[ "research-consent" ],
```

- [ ] **Step 5: Report drift at the end of initialization**

In `packages/competence/application/configuration-loader.js`, confirm the logger is imported at the top of the file; if it is not, add:

```js
const logger = require( "@ti-engine/core/logger" );
```

Then add this function directly above `module.exports.initialize`:

```js
/**
 * Logs how each store-backed document compares to its file default. This is the half of drift detection that needs
 * no UI and no human present — on a container deployment nobody is watching an admin screen when the image rolls.
 * <br/>
 * `drifted` is a WARNING: a release changed something this deployment is not serving. `absent` is only INFO —
 * `competence-labels` is registered but never seeded (it is written first by a composite editor), so treating
 * "never written" as a warning would make a clean install look broken.
 *
 * @method
 * @param {Object} configService
 * @returns {Promise}
 * @private
 */
function reportConfigDrift( configService ) {
    if ( typeof configService.listDrift !== "function" ) {
        return Promise.resolve();
    }
    return configService.listDrift().then( ( documents ) => {
        for ( const document of ( documents || [] ) ) {
            if ( document.status === "drifted" ) {
                logger.log( `Configuration document '${ document.configKey }' differs from the file default shipped with this build (+${ document.counts.added } / -${ document.counts.removed } / ~${ document.counts.changed }). Review and apply it in Administration → Configuration.`, logger.logSeverity.WARNING );
            } else if ( document.status === "absent" ) {
                logger.log( `Configuration document '${ document.configKey }' has never been written to the store.`, logger.logSeverity.INFO );
            }
        }
    } ).catch( ( error ) => {
        // Diagnostics must never gate boot.
        logger.log( "Unable to compute configuration drift at startup.", logger.logSeverity.WARNING, error );
    } );
}
```

Then chain it in `module.exports.initialize`, replacing the closing `.then( () => { configService.onConfigChanged( ... ) } );` block's terminator so the chain ends with:

```js
    } ).then( () => {
        configService.onConfigChanged( ( event ) => {
            const keys = ( event && event.configKeys ) || [];
            return Promise.all( keys.filter( ( key ) => STORE_BACKED[ key ] ).map( ( key ) => {
                return configService.getCurrent( key ).then( ( current ) => {
                    if ( current ) applyStoreValue( key, current.value );
                } );
            } ) );
        } );
    } ).then( () => reportConfigDrift( configService ) );
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/competence && node --test test/config-drift-reporting.test.js`
Expected: PASS — 3 tests

- [ ] **Step 7: Run the full competence suite**

Run: `cd packages/competence && npm test`
Expected: PASS — in particular `config-live.test.js`, `config-management.test.js` and `config-editors.test.js` still pass

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/configuration-loader.js packages/competence/application/config-registration.js packages/competence/test/config-drift-reporting.test.js
```

```bash
git commit -F - <<'EOF'
feat(competence): register file defaults explicitly and report drift at startup (CA-103)

Drift detection compares the registered default against the stored value, so it
is only correct while the registry holds the FILE default. That held before only
by ordering coincidence — registration runs in the web-application constructor,
before initialize() reassigns the exported config objects. A consumer that ever
registered after initializing would have compared the store against itself and
reported "in sync" forever, which is a silent false negative in the one feature
whose whole job is noticing a difference.

configuration-loader now exports the fileDefaults map it already captured at
module load, and config-registration registers from it. competence-labels is
left as it was: it is not store-backed, so it has no fileDefaults entry.

initialize() ends by logging drift — WARNING for a drifted document, INFO for
one that has simply never been written, and a failure to compute never gates
boot.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Competence — the admin drift panel

**Files:**
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (the `configureAdminConfig` component at line 4512)
- Modify: `packages/competence/bin/static/fragments/frame-admin-config.html`
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Consumes: `GET /admin/config/drift`, `GET /admin/config/drift/:configKey`, `POST /admin/config/drift/apply` from Task 3.
- Produces: no programmatic interface — a screen.

**CSP reminder:** no inline `style` attributes, no `?.` in any `x-*` expression, no `Array`/`Object` globals in templates. Every conditional goes through a component method.

- [ ] **Step 1: Add the component state**

In `packages/competence/bin/static/scripts/competence-user-interface.js`, in the object returned by `configureAdminConfig` (line 4518), add after `modal: emptyModal(),`:

```js
        loadingDrift: false,
        applyingDrift: false,
        drift: [],
        driftSelection: [],
        driftDetail: {},
        expandedDrift: "",
        driftNote: "",
```

- [ ] **Step 2: Load drift on init**

In the same component, in `init()`, change the `onInitialized` body so it loads drift alongside the change feed:

```js
                this.loaded = true;
                this.loadChanges();
                this.loadDrift();
```

- [ ] **Step 3: Add the component methods**

In the same component, add after the existing `loadChanges()` method:

```js
        loadDrift() {
            this.loadingDrift = true;
            tiApplication.sendRequest( "/admin/config/drift" ).then( ( result ) => {
                this.drift = ( result && Array.isArray( result.data ) ) ? result.data : [];
                // Preselect only genuinely drifted documents. An "absent" one is valid to apply but is not what the
                // admin came here to do, and folding it silently into an unrelated apply would be a surprise.
                this.driftSelection = this.drift.filter( ( row ) => row.status === "drifted" ).map( ( row ) => row.configKey );
                this.loadingDrift = false;
            } ).catch( ( error ) => {
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                this.loadingDrift = false;
                this.drift = [];
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        // Rows worth showing: in-sync and no-default documents are noise on this panel.
        driftRows() {
            return this.drift.filter( ( row ) => row.status === "drifted" || row.status === "absent" );
        },

        hasDrift() {
            return this.driftRows().length > 0;
        },

        driftCountsText( row ) {
            return `+${ row.counts.added } / -${ row.counts.removed } / ~${ row.counts.changed }`;
        },

        driftStatusLabel( row ) {
            return this.getLabel( `interface.admin.drift-status-${ row.status }`, row.status );
        },

        isDriftSelected( configKey ) {
            return this.driftSelection.indexOf( configKey ) >= 0;
        },

        toggleDriftSelected( configKey ) {
            const index = this.driftSelection.indexOf( configKey );
            if ( index >= 0 ) {
                this.driftSelection.splice( index, 1 );
            } else {
                this.driftSelection.push( configKey );
            }
        },

        isDriftExpanded( configKey ) {
            return this.expandedDrift === configKey;
        },

        toggleDriftDetail( configKey ) {
            if ( this.expandedDrift === configKey ) {
                this.expandedDrift = "";
                return;
            }
            this.expandedDrift = configKey;
            if ( this.driftDetail[ configKey ] ) {
                return;
            }
            tiApplication.sendRequest( "/admin/config/drift/" + encodeURIComponent( configKey ) ).then( ( result ) => {
                const data = result ? result.data : null;
                this.driftDetail[ configKey ] = ( data && Array.isArray( data.entries ) ) ? data.entries : [];
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        driftEntries( configKey ) {
            return this.driftDetail[ configKey ] || [];
        },

        driftEntryText( entry ) {
            if ( entry.addedMembers === undefined ) {
                return entry.path;
            }
            return `${ entry.path }  +${ entry.addedMembers } / -${ entry.removedMembers }`;
        },

        canApplyDrift() {
            return !this.applyingDrift && this.driftSelection.length > 0;
        },

        applyDrift() {
            if ( !this.canApplyDrift() ) {
                return;
            }
            this.applyingDrift = true;
            tiApplication.sendRequest( "/admin/config/drift/apply", "POST", { configKeys: this.driftSelection, note: this.driftNote } ).then( ( result ) => {
                this.applyingDrift = false;
                const data = result ? result.data : null;
                if ( data && data.ok === false ) {
                    tiApplication.notify( {
                        message: this.getLabel( "interface.admin.drift-invalid", "The file defaults did not pass validation." ),
                        details: Object.keys( data.errors ).join( ", " )
                    } );
                    return;
                }
                tiApplication.notify( this.getLabel( "interface.admin.drift-applied", "File defaults applied." ) );
                this.driftNote = "";
                this.driftDetail = {};
                this.expandedDrift = "";
                this.loadDrift();
                this.loadChanges();
            } ).catch( ( error ) => {
                this.applyingDrift = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },
```

- [ ] **Step 4: Add the panel markup**

In `packages/competence/bin/static/fragments/frame-admin-config.html`, insert a new `<section>` immediately **before** the maintenance section (the one opening at line 82):

```html
            <section class="competence-admin-section">
                <div class="competence-admin-section-head">
                    <h2 class="competence-admin-section-title" x-text-label="interface.admin.drift-title"></h2>
                    <div class="competence-admin-section-desc" x-text-label="interface.admin.drift-desc"></div>
                </div>

                <template x-if="loadingDrift">
                    <div class="competence-admin-changes-status" x-text-label="interface.admin.loading"></div>
                </template>

                <template x-if="!loadingDrift && !hasDrift()">
                    <div class="ti-empty-state">
                        <div class="ti-empty-state-icon" aria-hidden="true">
                            <span class="ti-icon check xl"></span>
                        </div>
                        <div class="ti-empty-state-title" x-text-label="interface.admin.drift-empty-title"></div>
                        <div class="ti-empty-state-desc" x-text-label="interface.admin.drift-empty-desc"></div>
                    </div>
                </template>

                <template x-if="!loadingDrift && hasDrift()">
                    <div class="competence-admin-drift">
                        <template x-for="row in driftRows()" x-bind:key="row.configKey">
                            <div class="competence-admin-drift-item">
                                <div class="competence-admin-drift-row">
                                    <label class="competence-admin-drift-main">
                                        <input type="checkbox" x-bind:checked="isDriftSelected(row.configKey)"
                                               @change="toggleDriftSelected(row.configKey)">
                                        <span class="competence-admin-drift-label" x-text="row.label"></span>
                                        <span class="ti-tag" x-text="driftStatusLabel(row)"></span>
                                        <span class="competence-admin-drift-counts" x-text="driftCountsText(row)"></span>
                                    </label>
                                    <button type="button" class="ti-btn ghost sm" @click="toggleDriftDetail(row.configKey)">
                                        <span x-text-label="interface.admin.drift-detail-btn"></span>
                                    </button>
                                </div>
                                <template x-if="isDriftExpanded(row.configKey)">
                                    <ul class="competence-admin-drift-entries">
                                        <template x-for="entry in driftEntries(row.configKey)" x-bind:key="entry.path">
                                            <li class="competence-admin-drift-entry">
                                                <span class="ti-tag" x-text="entry.kind"></span>
                                                <span x-text="driftEntryText(entry)"></span>
                                            </li>
                                        </template>
                                    </ul>
                                </template>
                            </div>
                        </template>

                        <div class="competence-admin-drift-apply">
                            <input type="text" class="ti-input" x-model="driftNote"
                                   x-bind:placeholder="getLabel('interface.admin.drift-note-placeholder')">
                            <button type="button" class="ti-btn" @click="applyDrift()" x-bind:disabled="!canApplyDrift()">
                                <span class="ti-icon check sm" aria-hidden="true"></span>
                                <span x-text-label="interface.admin.drift-apply-btn"></span>
                            </button>
                        </div>
                    </div>
                </template>
            </section>
```

- [ ] **Step 5: Add the labels**

In `packages/competence/bin/localization/competence-labels.json`, add to the `en` section alongside the existing `interface.admin.*` keys:

```json
    "interface.admin.drift-title": "Configuration drift",
    "interface.admin.drift-desc": "Configuration documents whose stored value differs from the defaults shipped with this build. Applying replaces the stored document and is recorded as a normal, restorable change.",
    "interface.admin.drift-empty-title": "Everything is up to date",
    "interface.admin.drift-empty-desc": "All configuration documents match their file defaults.",
    "interface.admin.drift-status-drifted": "Differs from build",
    "interface.admin.drift-status-absent": "Never stored",
    "interface.admin.drift-detail-btn": "Details",
    "interface.admin.drift-note-placeholder": "Why are you applying this?",
    "interface.admin.drift-apply-btn": "Apply selected",
    "interface.admin.drift-applied": "File defaults applied.",
    "interface.admin.drift-invalid": "The file defaults did not pass validation. Try applying the related documents together.",
```

And to the `bg` section:

```json
    "interface.admin.drift-title": "Разлики в конфигурацията",
    "interface.admin.drift-desc": "Конфигурационни документи, чиято съхранена стойност се различава от стойностите по подразбиране в тази версия. Прилагането заменя съхранения документ и се записва като нормална, обратима промяна.",
    "interface.admin.drift-empty-title": "Всичко е актуално",
    "interface.admin.drift-empty-desc": "Всички конфигурационни документи съвпадат със стойностите по подразбиране.",
    "interface.admin.drift-status-drifted": "Различава се от версията",
    "interface.admin.drift-status-absent": "Никога не е съхраняван",
    "interface.admin.drift-detail-btn": "Подробности",
    "interface.admin.drift-note-placeholder": "Защо прилагате тази промяна?",
    "interface.admin.drift-apply-btn": "Приложи избраните",
    "interface.admin.drift-applied": "Стойностите по подразбиране са приложени.",
    "interface.admin.drift-invalid": "Стойностите по подразбиране не преминаха валидацията. Опитайте да приложите свързаните документи заедно.",
```

- [ ] **Step 6: Add the panel styles**

In `packages/competence/bin/static/scripts/competence-main.css`, append:

The tokens below are the ones the adjacent `.competence-admin-change-*` rules already use (`--s-2`/`--s-3`/`--s-4` spacing, `--border`, `--fg-secondary`, `--r-sm`), and the mono stack is the literal this file repeats throughout. Do not invent new custom properties.

```css
/* Configuration drift panel (admin config landing). */
.competence-admin-drift {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
}

.competence-admin-drift-item {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
}

.competence-admin-drift-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
}

.competence-admin-drift-main {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
    cursor: pointer;
}

.competence-admin-drift-label {
    font-weight: 500;
}

.competence-admin-drift-counts {
    color: var(--fg-secondary);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
}

.competence-admin-drift-entries {
    margin: 0 0 0 var(--s-4);
    padding: 0;
    list-style: none;
    max-height: 18rem;
    overflow-y: auto;
}

.competence-admin-drift-entry {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: 2px 0;
    color: var(--fg-secondary);
    font-family: "JetBrains Mono", monospace;
    font-size: 0.8rem;
}

.competence-admin-drift-apply {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-top: var(--s-2);
}

.competence-admin-drift-apply .ti-input {
    flex: 1;
}
```

- [ ] **Step 7: Verify in the browser**

Run: `docker compose up --build -d` from the repo root, then open `http://localhost:3000`, sign in as an admin, and open **Administration → Configuration**.

Expected: the drift panel renders. On a store seeded from the current files every document is in sync, so the empty state shows. Check the browser console for CSP violations (an inline-style or `?.` mistake shows up as an Alpine expression error).

To see a populated panel, edit any document through an existing admin editor first, then reload — the edited document reports as drifted against its file default.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/static/fragments/frame-admin-config.html packages/competence/bin/localization/competence-labels.json packages/competence/bin/static/scripts/competence-main.css
```

```bash
git commit -F - <<'EOF'
feat(competence): configuration drift panel on the admin config screen (CA-103)

Lists every document whose stored value differs from the default shipped with
this build, with per-document counts, an expandable path list and a note field.
Drifted documents are preselected; documents that have simply never been stored
are listed but not, since applying one is valid but is not what the admin came
to do.

A failed apply reports which documents were rejected and suggests applying
related documents together, which is what a cross-document validator requires.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: Competence — Cycle Setup stale exclusion, docs and release

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` (the `#loadCycleSetup` resolve payload, lines 2862-2893)
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (the cycle-setup component near lines 3319 and 3380)
- Modify: `packages/competence/bin/static/fragments/frame-cycle-setup.html` (the excluded notice, lines 159-169)
- Modify: `packages/competence/bin/localization/competence-labels.json`
- Modify: `packages/competence/INSTALL.md`, `packages/competence/docs/user-guide/en/08-administrator.md`
- Modify: `packages/competence/package.json`, `packages/competence/CHANGELOG.md`

**Interfaces:**
- Consumes: the existing `#loadCycleSetup` payload fields `excludedFamilies` and `sets`.
- Produces: `staleExclusions: string[]` on the Cycle Setup payload — excluded families that nevertheless have at least one competency resolved for this cycle.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/cycle-setup-stale-exclusion.test.js`:

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
const { deriveStaleExclusions } = require( "#cycle-setup-tools" );

describe( "deriveStaleExclusions", () => {

    it( "flags an excluded family that now has competencies for the cycle", () => {
        const sets = { QE: { baseline: { codes: [ "E1-48", "E1-49" ] } }, XD: { baseline: { codes: [] } } };
        assert.deepEqual( deriveStaleExclusions( [ "QE", "XD" ], sets ), [ "QE" ] );
    } );

    it( "ignores an excluded family that is still empty", () => {
        assert.deepEqual( deriveStaleExclusions( [ "XD" ], { XD: { baseline: { codes: [] } } } ), [] );
    } );

    it( "ignores a family that is not excluded", () => {
        assert.deepEqual( deriveStaleExclusions( [], { SE: { baseline: { codes: [ "E1-1" ] } } } ), [] );
    } );

    it( "counts codes in a specialization, not only the baseline", () => {
        const sets = { QE: { baseline: { codes: [] }, AUTOMATION: { codes: [ "E1-55" ] } } };
        assert.deepEqual( deriveStaleExclusions( [ "QE" ], sets ), [ "QE" ] );
    } );

    it( "tolerates a missing or malformed sets entry", () => {
        assert.deepEqual( deriveStaleExclusions( [ "QE" ], {} ), [] );
        assert.deepEqual( deriveStaleExclusions( null, null ), [] );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/competence && node --test test/cycle-setup-stale-exclusion.test.js`
Expected: FAIL — `Cannot find module '#cycle-setup-tools'`

- [ ] **Step 3: Create the pure helper**

Create `packages/competence/application/cycle-setup-tools.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Pure helpers backing the Cycle Setup screen.
 *
 * @module cycle-setup-tools
 */

/**
 * Finds families excluded from a cycle that nevertheless have competencies configured for it.
 * <br/>
 * `cycle.excludedFamilies` is derived once, when the cycle record is created, from which families had competencies
 * at that moment. It is data, never re-derived — so a family that gains competencies in a later release stays
 * excluded, with its specializations hidden and its baseline unreachable in practice. This surfaces that staleness
 * so a Supervisor can act on it; it deliberately does **not** re-derive the field, because including a family in a
 * cycle is a governance decision rather than a computation.
 *
 * @method
 * @param {Array<string>} excludedFamilies
 * @param {Object} sets The Cycle Setup `sets` payload — `family → nodeKey → { codes: [] }`.
 * @returns {Array<string>} The excluded family codes that now have at least one code resolved for the cycle.
 * @public
 */
module.exports.deriveStaleExclusions = ( excludedFamilies, sets ) => {
    const excluded = Array.isArray( excludedFamilies ) ? excludedFamilies : [];
    const resolved = ( sets && typeof sets === "object" ) ? sets : {};
    return excluded.filter( ( family ) => {
        const familySets = resolved[ family ];
        if ( !familySets || typeof familySets !== "object" ) {
            return false;
        }
        return Object.values( familySets ).some( ( node ) => node && Array.isArray( node.codes ) && node.codes.length > 0 );
    } );
};
```

- [ ] **Step 4: Add the `#cycle-setup-tools` alias**

In `packages/competence/package.json`, add to `imports` (alphabetical among the existing entries):

```json
    "#cycle-setup-tools": "./application/cycle-setup-tools.js",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/competence && node --test test/cycle-setup-stale-exclusion.test.js`
Expected: PASS — 5 tests

- [ ] **Step 6: Return `staleExclusions` from the server**

In `packages/competence/bin/competence-web-application.js`, add the require alongside the other application requires at the top of the file:

```js
const cycleSetupTools = require( "#cycle-setup-tools" );
```

Then, in the `#loadCycleSetup` resolve payload (line 2887), add directly after the `excludedFamilies` line:

```js
                        staleExclusions: cycleSetupTools.deriveStaleExclusions( cycle.excludedFamilies, sets ),
```

- [ ] **Step 7: Track it in the Alpine component**

In `packages/competence/bin/static/scripts/competence-user-interface.js`, in the cycle-setup component, add after `excludedFamilies: [],` (line 3319):

```js
        staleExclusions: [],
```

After the `this.excludedFamilies = ...` assignment (line 3380), add:

```js
            this.staleExclusions = Array.isArray( data.staleExclusions ) ? tiToolbox.structuredClone( data.staleExclusions ) : [];
```

And after the `isSelectedFamilyExcluded()` method (near line 3512), add:

```js
        // An excluded family that has since gained competencies for this cycle. The exclusion was derived when the
        // cycle record was created and is never recomputed, so without this the family stays silently hidden.
        isSelectedFamilyStaleExclusion() {
            return !!this.selectedFamily && this.staleExclusions.indexOf( this.selectedFamily ) >= 0;
        },
```

- [ ] **Step 8: Show it in the excluded banner**

In `packages/competence/bin/static/fragments/frame-cycle-setup.html`, inside the `competence-cycle-excluded-notice` div, add directly after the `interface.cycle-setup.excluded-banner` span:

```html
                                            <template x-if="isSelectedFamilyStaleExclusion()">
                                                <span class="competence-cycle-stale-exclusion"
                                                      x-text-label="interface.cycle-setup.stale-exclusion"></span>
                                            </template>
```

- [ ] **Step 9: Add the labels and style**

In `packages/competence/bin/localization/competence-labels.json`, `en`:

```json
    "interface.cycle-setup.stale-exclusion": "This family now has competencies configured for this cycle.",
```

`bg`:

```json
    "interface.cycle-setup.stale-exclusion": "Това семейство вече има конфигурирани компетенции за този цикъл.",
```

In `packages/competence/bin/static/scripts/competence-main.css`:

```css
.competence-cycle-stale-exclusion {
    color: var(--fg-secondary);
    font-size: 0.8rem;
}
```

- [ ] **Step 10: Update the operator and end-user docs**

In `packages/competence/INSTALL.md`, add to the upgrade section:

```markdown
### After upgrading the image

A new image may ship changed configuration content — new competencies, an
expanded role-family pool, a revised consent statement. The configuration store
seeds from those files only on a **first** run, so an existing deployment keeps
serving what it was seeded with.

After an upgrade, sign in as an administrator and open **Administration →
Configuration → Configuration drift**. Any document listed there differs from
the defaults shipped in the new image. Review the changes and apply them; the
application is recorded as a normal, restorable configuration change.

The container log reports the same condition at startup, one `WARNING` line per
drifted document, so this is also visible without opening the UI.

If a document is rejected on apply, apply it together with the documents it
depends on — the competency dictionary, the role-family pool and the active
competency sets validate against one another, so they generally move together.
```

In `packages/competence/docs/user-guide/en/08-administrator.md`, add this subsection under the configuration section. The build rejects raw HTML, images, relative links, non-`http(s)` links, inline styles and scripts, so keep it to plain markdown:

```markdown
### Configuration drift

Competence ships with a set of default configuration values — the competency
dictionary, the role-family pools, the active competency sets, the research
consent statement. When the application first starts, those defaults are copied
into the configuration store, and from then on the store is what the application
uses. That is what makes your edits stick across restarts.

It also means a later update that changes those defaults does not overwrite what
you already have. If a new version adds competencies, your installation keeps
serving the set it was started with until someone applies the change.

The **Configuration drift** panel on the Configuration screen shows you where
that has happened. Each row is a configuration document whose stored value
differs from the defaults in the version you are running, with a count of what
was added, removed and changed. Open **Details** to see exactly which entries
differ.

Select the documents you want to bring up to date, add a short note explaining
why, and choose **Apply selected**. The change is recorded in the change history
like any other configuration edit, so you can see who applied it and restore the
previous state if you need to.

Some documents depend on each other — the competency dictionary, the role-family
pools and the active competency sets are checked against one another. If an
apply is rejected, select the related documents and apply them together.

If the panel says everything is up to date, there is nothing to do.
```

- [ ] **Step 11: Regenerate the Help fragments**

Run: `cd packages/competence && npm run build:guide`
Expected: succeeds and rewrites `bin/static/fragments/guide/frame-help-*.html`. These are committed artifacts — commit them, or `test/user-guide-build.test.js` fails.

- [ ] **Step 12: Bump the version and write the changelog**

In `packages/competence/package.json`, change `"version": "3.19.1"` to `"version": "3.20.0"`, and update the `releaseDate` field to today's date.

In `packages/competence/CHANGELOG.md`, insert above `## Version 3.19.1`:

```markdown
## Version 3.20.0

Configuration shipped in a release can finally reach a running deployment. The configuration store seeds from the
files bundled in the image only on a first run, and from then on the stored value wins on every boot — so the 26 QE
competencies added in 3.17.0 were invisible on every environment that had been started before it, with no in-app way
to fix it. Requires `@ti-engine/web-framework` ≥ 1.24.0 (CA-103).

* feat(competence): add the **Configuration drift** panel to the admin configuration screen — every document whose
  stored value differs from the default shipped with this build, with per-document counts, an expandable list of
  changed paths, and an audited apply. Applying routes through the normal change-set machinery, so it is versioned,
  appears in the change feed and can be restored
* feat(competence): report drift at startup — one `WARNING` per drifted document in the container log, so the
  condition is visible on a deployment where nobody is watching an admin screen. A document that has simply never
  been stored logs at `INFO`, and a failure to compute drift never gates boot
* fix(competence): register each store-backed document's `defaultValue` from the explicitly captured `fileDefaults`
  map rather than the live export. The export is reassigned to the store value by `initialize()`, so the registry
  held the file default only because registration happens to run first — a consumer that ever registered after
  initializing would have compared the store against itself and reported "in sync" forever
* feat(competence): flag a **stale family exclusion** in Cycle Setup. `cycle.excludedFamilies` is derived once when
  the cycle record is created, so a family that gains competencies later stays excluded on existing cycles — which
  is the second reason QE stayed invisible after 3.17.0. The excluded banner now says when the family has
  competencies for the cycle, next to the include control that was always there. The derivation itself is unchanged:
  including a family is a governance decision, not a computation
* docs(competence): document the post-upgrade drift check in `INSTALL.md` and the drift panel in the administrator
  user-guide chapter
* build(release): bump package version from `3.19.1` to `3.20.0`
```

- [ ] **Step 13: Run the full suite and lint**

Run: `cd packages/competence && npm test && npm run test:json`
Expected: PASS

Run: `cd ../.. && npm run lint`
Expected: PASS

- [ ] **Step 14: Verify in the browser**

Run: `docker compose up --build -d` from the repo root. Open a cycle in `PLANNING` on the Cycle Setup screen and select an excluded family that has competencies configured.

Expected: the excluded banner shows the stale-exclusion line alongside the include button. Check the console for CSP errors.

- [ ] **Step 15: Commit**

```bash
git add packages/competence/application/cycle-setup-tools.js packages/competence/test/cycle-setup-stale-exclusion.test.js packages/competence/package.json packages/competence/bin/competence-web-application.js packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/static/fragments/frame-cycle-setup.html packages/competence/bin/static/scripts/competence-main.css packages/competence/bin/localization/competence-labels.json packages/competence/INSTALL.md packages/competence/docs/user-guide/en/08-administrator.md packages/competence/bin/static/fragments/guide packages/competence/CHANGELOG.md
```

```bash
git commit -F - <<'EOF'
feat(competence): flag stale family exclusions in Cycle Setup, release 3.20.0 (CA-103)

cycle.excludedFamilies is derived once when the cycle record is created, from
which families had competencies at that moment, and is never recomputed. So a
family that gains competencies in a later release stays excluded on every
existing cycle — the second reason the QE competencies added in 3.17.0 stayed
invisible even where the configuration itself was current.

The excluded banner now says when the family has competencies configured for
the cycle, next to the include control that was already there. The derivation
is deliberately unchanged: including a family in a cycle is a governance
decision, not something to recompute behind a Supervisor's back.

Also documents the post-upgrade drift check for operators and administrators,
and bumps competence to 3.20.0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Post-implementation

- [ ] Update `CA-103` in YouTrack: `State: Verified`, `Stage: Done`, `Shipped` = the merge date **+1** (the MCP stores −1 day), and log the time spent.
- [ ] Open the pull request against `master`. Merging publishes web-framework `1.24.0` to npm automatically; competence ships as a container image via `cd.yml`.
