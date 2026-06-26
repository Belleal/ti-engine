# Auto Org-Derived Roles & Supervisor Grant Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the competence app's `EMPLOYEE` / `MANAGER` / `SUPERVISOR` roles from each user's place in the org chart at login (replacing manual role injection), and let *structural* supervisors grant/revoke the Supervisor role to others from the Employee Management screen.

**Architecture:** A pure `role-resolver` singleton owns the rule logic (sub-manager depth + role composition); `OrganizationManager` adapts the live graph into the pure rule; `DataManager` owns a new audited `role-grants` store with a synchronous in-memory mirror; `competence-web-server.js#augmentSession` composes the final roles at login. Grant/revoke land as two new `processServiceRequest` services gated to auto-supervisors, surfaced in the Employee Management detail pane.

**Tech Stack:** Node.js (CommonJS, `#alias` imports), `graphology` org graph, RedisJSON via `@ti-engine/core/cache`, Alpine.js (CSP build) + HTMX front end, `node --test`.

**Spec:** `packages/competence/design/auto-org-derived-roles.md` · **Tracking:** [CA-72](https://belleal.youtrack.cloud/issue/CA-72)

**Conventions (apply to every task):**
- New `.js` files start with the GPL license header used across the repo (copy from any existing file in the same package).
- CommonJS, `#alias` imports, Promise-chain style, frozen singletons, JSDoc on public methods.
- Alpine CSP: **no** inline `style=`, **no** optional chaining (`?.`) inside Alpine expressions, no `Array`/`Object` globals in templates.
- `roleCode` values are **numeric** (`EMPLOYEE===1`, `MANAGER===2`, `SUPERVISOR===3`). Always reference `configurationLoader.roleCode.*`.
- Commit **once per task** (thematic bundling — do not commit per micro-step). Every commit message references `CA-72` and ends with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Run tests from the package dir: `cd packages/competence && npm test` (or a single file: `node --test test/<file>.test.js`).

---

## Task 1: Pure `role-resolver` module

The brain of the feature: sub-manager depth, auto-supervisor eligibility, and role composition. Pure and fully unit-testable with synthetic inputs (mirrors the `task-resolver` pattern).

**Files:**
- Modify: `packages/competence/package.json` (add `#role-resolver` to `imports`)
- Create: `packages/competence/application/role-resolver.js`
- Test: `packages/competence/test/role-resolver.test.js`

- [ ] **Step 1: Register the `#role-resolver` import alias**

In `packages/competence/package.json`, add the alias to the `imports` map (keep it alphabetneighbors — insert after `#results-analytics`):

```json
    "#results-analytics": "./application/results-analytics.js",
    "#role-resolver": "./application/role-resolver.js",
    "#task-resolver": "./application/task-resolver.js"
```

- [ ] **Step 2: Write the failing test**

Create `packages/competence/test/role-resolver.test.js`:

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

const roleResolver = require( "#role-resolver" );
const configurationLoader = require( "#configuration-loader" );

const EMPLOYEE = configurationLoader.roleCode.EMPLOYEE;
const MANAGER = configurationLoader.roleCode.MANAGER;
const SUPERVISOR = configurationLoader.roleCode.SUPERVISOR;

describe( "RoleResolver.subManagerDepth", () => {
    it( "returns 0 for a leaf unit (no children)", () => {
        assert.equal( roleResolver.instance.subManagerDepth( { id: "u", children: [] } ), 0 );
    } );

    it( "returns 1 when children have managers but no deeper managers (the seeded Engineering case)", () => {
        const engineering = { id: "1-1", managerID: "20", children: [
            { id: "1-1-1", managerID: "8", children: [] },
            { id: "1-1-2", managerID: "11", children: [] }
        ] };
        assert.equal( roleResolver.instance.subManagerDepth( engineering ), 1 );
    } );

    it( "returns 2 when a manager-led unit has a manager-led child (qualifying)", () => {
        const tree = { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [
                { id: "c", managerID: "C", children: [] }
            ] }
        ] };
        assert.equal( roleResolver.instance.subManagerDepth( tree ), 2 );
    } );

    it( "treats manager-less intermediate units as transparent", () => {
        const tree = { id: "a", managerID: "A", children: [
            { id: "b", children: [                       // no manager here
                { id: "c", managerID: "C", children: [
                    { id: "d", managerID: "D", children: [] }
                ] }
            ] }
        ] };
        // Below `a`: c (level 1) -> d (level 2); `b` is skipped. Depth = 2.
        assert.equal( roleResolver.instance.subManagerDepth( tree ), 2 );
    } );
} );

describe( "RoleResolver.isAutoSupervisor", () => {
    it( "is true for the top manager regardless of subtree", () => {
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: true, reportsToTopManager: false, managedSubtrees: [] } ), true );
    } );

    it( "is false for a direct report whose subtree is only 1 management level deep", () => {
        const managed = [ { id: "1-1", managerID: "20", children: [
            { id: "1-1-1", managerID: "8", children: [] },
            { id: "1-1-2", managerID: "11", children: [] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: true, managedSubtrees: managed } ), false );
    } );

    it( "is true for a direct report with a >=2-level-deep subtree", () => {
        const managed = [ { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [ { id: "c", managerID: "C", children: [] } ] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: true, managedSubtrees: managed } ), true );
    } );

    it( "is false when deep enough but NOT a direct report of the top manager", () => {
        const managed = [ { id: "a", managerID: "A", children: [
            { id: "b", managerID: "B", children: [ { id: "c", managerID: "C", children: [] } ] }
        ] } ];
        assert.equal( roleResolver.instance.isAutoSupervisor( { isTopManager: false, reportsToTopManager: false, managedSubtrees: managed } ), false );
    } );
} );

describe( "RoleResolver.resolveRoles", () => {
    it( "always includes EMPLOYEE", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( {} ), [ EMPLOYEE ] );
    } );

    it( "adds MANAGER when isUnitManager", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { isUnitManager: true } ), [ EMPLOYEE, MANAGER ] );
    } );

    it( "adds SUPERVISOR via auto status", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { isUnitManager: true, isAutoSupervisor: true } ), [ EMPLOYEE, MANAGER, SUPERVISOR ] );
    } );

    it( "adds SUPERVISOR via a manual grant without management", () => {
        assert.deepEqual( roleResolver.instance.resolveRoles( { hasSupervisorGrant: true } ), [ EMPLOYEE, SUPERVISOR ] );
    } );
} );
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/competence && node --test test/role-resolver.test.js`
Expected: FAIL — `Cannot find module '#role-resolver'` / resolver methods undefined.

- [ ] **Step 4: Implement `role-resolver.js`**

Create `packages/competence/application/role-resolver.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const configurationLoader = require( "#configuration-loader" );

/**
 * @typedef {Object} UnitSubtree
 * @property {string} id
 * @property {string} [managerID]
 * @property {Array<UnitSubtree>} [children]
 */

/**
 * @typedef {Object} SupervisorEligibilityContext
 * @property {boolean} isTopManager - The employee is the organization's top manager (root unit's manager).
 * @property {boolean} reportsToTopManager - The employee's resolved manager is the top manager.
 * @property {Array<UnitSubtree>} managedSubtrees - The org subtrees rooted at the units the employee manages.
 */

/**
 * @typedef {Object} EffectiveRolesContext
 * @property {boolean} [isUnitManager] - The employee manages at least one org unit.
 * @property {boolean} [isAutoSupervisor] - The employee is a structural (auto) supervisor.
 * @property {boolean} [hasSupervisorGrant] - The employee holds a manual supervisor grant.
 */

// A direct report of the top manager becomes an auto-supervisor only when their managed subtree contains at least
// this many further nested management levels (manager-of-managers chain).
const MIN_SUPERVISOR_SUBTREE_DEPTH = 2;

/**
 * Pure resolver for the competence app's org-derived roles. Performs no I/O — the caller injects the live graph
 * facts it needs (mirrors the {@link TaskResolver} pattern), keeping every rule unit-testable with plain objects.
 *
 * @class RoleResolver
 * @singleton
 * @public
 */
class RoleResolver {

    static #instance = null;

    /**
     * @constructor
     * @returns {RoleResolver}
     */
    constructor() {
        if ( !RoleResolver.#instance ) {
            RoleResolver.#instance = this;
        }
        return RoleResolver.#instance;
    }

    /**
     * The length of the longest chain of nested *manager-led* units strictly below `unitSubtree`. Manager-less
     * intermediate units are transparent (recursed through but not counted). Pure.
     *
     * @method
     * @param {UnitSubtree} unitSubtree
     * @returns {number}
     * @public
     */
    subManagerDepth( unitSubtree ) {
        if ( !unitSubtree || !Array.isArray( unitSubtree.children ) || unitSubtree.children.length === 0 ) {
            return 0;
        }
        let max = 0;
        for ( const child of unitSubtree.children ) {
            const below = this.subManagerDepth( child );
            const chain = ( child && child.managerID ) ? ( 1 + below ) : below;
            if ( chain > max ) {
                max = chain;
            }
        }
        return max;
    }

    /**
     * Whether the employee qualifies as a structural (auto) supervisor: the top manager, or a direct report of the
     * top manager whose managed subtree is at least {@link MIN_SUPERVISOR_SUBTREE_DEPTH} management levels deep. Pure.
     *
     * @method
     * @param {SupervisorEligibilityContext} ctx
     * @returns {boolean}
     * @public
     */
    isAutoSupervisor( ctx ) {
        if ( !ctx ) {
            return false;
        }
        if ( ctx.isTopManager === true ) {
            return true;
        }
        if ( ctx.reportsToTopManager !== true ) {
            return false;
        }
        const subtrees = Array.isArray( ctx.managedSubtrees ) ? ctx.managedSubtrees : [];
        const depth = subtrees.reduce( ( best, subtree ) => Math.max( best, this.subManagerDepth( subtree ) ), 0 );
        return depth >= MIN_SUPERVISOR_SUBTREE_DEPTH;
    }

    /**
     * Composes the effective numeric role codes for an employee. EMPLOYEE is always present; MANAGER and SUPERVISOR
     * are added per the flags (SUPERVISOR = auto status OR a manual grant). Pure.
     *
     * @method
     * @param {EffectiveRolesContext} ctx
     * @returns {number[]}
     * @public
     */
    resolveRoles( ctx ) {
        const roles = [ configurationLoader.roleCode.EMPLOYEE ];
        if ( ctx && ctx.isUnitManager === true ) {
            roles.push( configurationLoader.roleCode.MANAGER );
        }
        if ( ctx && ( ctx.isAutoSupervisor === true || ctx.hasSupervisorGrant === true ) ) {
            roles.push( configurationLoader.roleCode.SUPERVISOR );
        }
        return roles;
    }

}

const instance = new RoleResolver();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/competence && node --test test/role-resolver.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add packages/competence/package.json packages/competence/application/role-resolver.js packages/competence/test/role-resolver.test.js
git commit -F - <<'EOF'
feat(competence): pure role-resolver for org-derived roles (CA-72)

Sub-manager-depth, auto-supervisor eligibility, and role composition as a
pure, unit-tested singleton (mirrors task-resolver). No I/O — callers inject
live graph facts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: `OrganizationManager` role-derivation methods

Adapt the live org graph into the pure rule: top-manager identity, unit-manager test, and auto-supervisor.

**Files:**
- Modify: `packages/competence/application/organization-manager.js`
- Test: `packages/competence/test/organization-roles.test.js`

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-roles.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const organizationManager = require( "#organization-manager" );

// Seeded org (config.organization-structure.json + seeders/employees.json):
//   root unit "1" mgr 22  ->  "1-1" Engineering mgr 20  ->  { "1-1-1" mgr 8, "1-1-2" mgr 11 }
//   ICs: 1,3,4,9 in 1-1-1 ; 2,5,7 in 1-1-2.
describe( "OrganizationManager org-derived role helpers", () => {

    before( async () => {
        installInMemoryCache();
        await organizationManager.instance.buildOrganizationChart();
    } );

    it( "getTopManagerID returns the root unit's manager (22)", () => {
        assert.equal( organizationManager.instance.getTopManagerID(), "22" );
    } );

    it( "isUnitManager is true for unit managers and false for ICs", () => {
        assert.equal( organizationManager.instance.isUnitManager( "22" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "20" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "8" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "11" ), true );
        assert.equal( organizationManager.instance.isUnitManager( "1" ), false );
        assert.equal( organizationManager.instance.isUnitManager( "9" ), false );
    } );

    it( "isAutoSupervisor is true only for the top manager in the seeded org", () => {
        assert.equal( organizationManager.instance.isAutoSupervisor( "22" ), true );
        // 20 is a direct report of 22 but only 1 management level deep -> not auto.
        assert.equal( organizationManager.instance.isAutoSupervisor( "20" ), false );
        // 8 is 2 levels down (reports to 20), not a direct report of the top manager.
        assert.equal( organizationManager.instance.isAutoSupervisor( "8" ), false );
        // an IC.
        assert.equal( organizationManager.instance.isAutoSupervisor( "1" ), false );
    } );

    it( "degrades gracefully for unknown / empty ids", () => {
        assert.equal( organizationManager.instance.isUnitManager( "" ), false );
        assert.equal( organizationManager.instance.isAutoSupervisor( "no-such-employee" ), false );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/competence && node --test test/organization-roles.test.js`
Expected: FAIL — `getTopManagerID` / `isUnitManager` / `isAutoSupervisor` are not functions.

- [ ] **Step 3: Add the `role-resolver` require**

In `packages/competence/application/organization-manager.js`, add the import alongside the existing requires (after the `#data-manager` require near the top):

```js
const dataManager = require( "#data-manager" );
const roleResolver = require( "#role-resolver" );
```

- [ ] **Step 4: Implement the three public methods + the private helper**

In `organization-manager.js`, insert these methods in the public interface, immediately **after** `getOrganizationRootUnitID()` (just before the `/* Private interface */` marker):

```js
    /**
     * Returns the employee ID of the organization's top manager — the `managerID` of the root unit. Returns "" when
     * the chart is not built or the root unit carries no manager.
     *
     * @method
     * @returns {string}
     * @public
     */
    getTopManagerID() {
        const rootUnitID = this.getOrganizationRootUnitID();
        if ( !rootUnitID || !this.#organizationChart ) {
            return "";
        }
        const rootNodeID = this.toUnitNodeID( rootUnitID );
        if ( !this.#organizationChart.hasNode( rootNodeID ) ) {
            return "";
        }
        return this.#organizationChart.getNodeAttribute( rootNodeID, "managerID" ) || "";
    }

    /**
     * Whether the employee is the `managerID` of at least one organization unit.
     *
     * @method
     * @param {string} employeeID
     * @returns {boolean}
     * @public
     */
    isUnitManager( employeeID ) {
        if ( !employeeID || !this.#organizationChart ) {
            return false;
        }
        return this.#managedUnitIDs( employeeID ).length > 0;
    }

    /**
     * Whether the employee is a structural (auto) supervisor: the top manager, or a direct report of the top manager
     * whose managed subtree is deep enough (see {@link RoleResolver#isAutoSupervisor}). Combines live graph facts with
     * the pure eligibility rule. The manual-grant term is OR-ed in separately at role-composition time.
     *
     * @method
     * @param {string} employeeID
     * @returns {boolean}
     * @public
     */
    isAutoSupervisor( employeeID ) {
        if ( !employeeID || !this.#organizationChart ) {
            return false;
        }
        const topManagerID = this.getTopManagerID();
        if ( topManagerID && employeeID === topManagerID ) {
            return true;
        }
        const managedSubtrees = this.#managedUnitIDs( employeeID )
            .map( ( unitID ) => this.getOrganizationUnitSubtree( unitID ) )
            .filter( Boolean );
        return roleResolver.instance.isAutoSupervisor( {
            isTopManager: false,
            reportsToTopManager: !!topManagerID && ( this.resolveClosestManagerIDForEmployee( employeeID ) === topManagerID ),
            managedSubtrees: managedSubtrees
        } );
    }
```

Then add the private helper inside the `/* Private interface */` section (e.g. just before `#buildUnitTree`):

```js
    /**
     * Returns the IDs of every organization unit the employee directly manages (`managerID === employeeID`).
     *
     * @method
     * @param {string} employeeID
     * @returns {Array<string>}
     * @private
     */
    #managedUnitIDs( employeeID ) {
        if ( !employeeID || !this.#organizationChart ) {
            return [];
        }
        return this.#organizationChart.nodes().filter( ( nodeID ) => {
            return this.#organizationChart.getNodeAttribute( nodeID, "nodeType" ) === "organizationUnit"
                && this.#organizationChart.getNodeAttribute( nodeID, "managerID" ) === employeeID;
        } ).map( ( nodeID ) => this.#organizationChart.getNodeAttribute( nodeID, "id" ) );
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/competence && node --test test/organization-roles.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full org test group to confirm no regressions**

Run: `cd packages/competence && node --test test/organization-*.test.js`
Expected: PASS (existing root-unit / closest-manager / team-reviewer / manager suites stay green).

- [ ] **Step 7: Commit**

```bash
git add packages/competence/application/organization-manager.js packages/competence/test/organization-roles.test.js
git commit -F - <<'EOF'
feat(competence): org-chart role helpers (top manager, unit manager, auto-supervisor) (CA-72)

getTopManagerID / isUnitManager / isAutoSupervisor on OrganizationManager,
delegating the depth rule to the pure role-resolver. Verified against the
seeded org (only the top manager auto-qualifies there).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: `DataManager` role-grants store + in-memory mirror + audit

Persist manual supervisor grants in a new audited store with a synchronous in-memory mirror for login-time derivation.

**Files:**
- Modify: `packages/competence/application/data-manager.js`
- Test: `packages/competence/test/data-manager.role-grants.test.js`

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/data-manager.role-grants.test.js`:

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

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const dataManager = require( "#data-manager" );

describe( "DataManager supervisor role grants", () => {

    beforeEach( async () => {
        installInMemoryCache();
        await dataManager.instance.loadRoleGrants();   // start from an empty, freshly-mirrored store
    } );

    it( "grants a role and reflects it in the synchronous mirror + store", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        assert.equal( dataManager.instance.hasSupervisorGrant( "9" ), true );
        const grants = await dataManager.instance.fetchRoleGrants();
        assert.equal( grants[ "9" ].grantedBy, "22" );
        assert.equal( typeof grants[ "9" ].grantedAt, "string" );
        assert.deepEqual( dataManager.instance.getSupervisorGrantIDs(), [ "9" ] );
    } );

    it( "revokes a role from the mirror + store", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        await dataManager.instance.revokeSupervisorRole( "9" );
        assert.equal( dataManager.instance.hasSupervisorGrant( "9" ), false );
        const grants = await dataManager.instance.fetchRoleGrants();
        assert.ok( !grants[ "9" ] || !grants[ "9" ].role );
    } );

    it( "loadRoleGrants rebuilds the mirror from the store", async () => {
        await dataManager.instance.grantSupervisorRole( "4", "22" );
        // Simulate a fresh process: clear the mirror by reinstalling the cache stub with the persisted data kept.
        const persisted = await dataManager.instance.fetchRoleGrants();
        const stub = installInMemoryCache();
        await stub.setJSON( "ti:competence:data:role-grants", persisted );
        assert.equal( dataManager.instance.hasSupervisorGrant( "4" ), false, "mirror is empty before load" );
        await dataManager.instance.loadRoleGrants();
        assert.equal( dataManager.instance.hasSupervisorGrant( "4" ), true, "mirror repopulated from store" );
    } );

    it( "writes an audit entry on grant", async () => {
        await dataManager.instance.grantSupervisorRole( "9", "22" );
        const entries = await dataManager.instance.getAuditEntriesForEmployee( "9" );
        const grantEntry = entries.find( ( e ) => e.field === "supervisorRole" );
        assert.ok( grantEntry, "a supervisorRole audit entry exists" );
        assert.equal( grantEntry.changedBy, "22" );
        assert.equal( grantEntry.newValue, "granted" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/competence && node --test test/data-manager.role-grants.test.js`
Expected: FAIL — `loadRoleGrants` / `grantSupervisorRole` / `hasSupervisorGrant` undefined.

- [ ] **Step 3: Declare the cache key + the in-memory mirror field**

In `data-manager.js`, add the key constant next to the other `cacheEntryKey*` declarations (after `cacheEntryKeyResultsSnapshots`, line ~22):

```js
const cacheEntryKeyRoleGrants = "ti:competence:data:role-grants"; // { [employeeID]: { role: 3, grantedBy, grantedAt } }
```

Add a private mirror field to the class body (right under `static #instance = null;`):

```js
    static #instance = null;

    // Synchronous in-memory mirror of the supervisor grant set, kept in sync with the role-grants store so login-time
    // role derivation (augmentSession, which is synchronous) needs no await. Populated by loadRoleGrants().
    #supervisorGrantIDs = new Set();
```

- [ ] **Step 4: Ensure the store exists on init (non-destructive)**

In `initialize()`, add the role-grants key to the NX init list (alongside the other `setJSON(..., {}, "$", 1)` calls):

```js
        promises.push( cache.instance.setJSON( cacheEntryKeyResultsSnapshots, {}, "$", 1 ) );
        promises.push( cache.instance.setJSON( cacheEntryKeyRoleGrants, {}, "$", 1 ) );
```

(`setJSON(..., 1)` is NX — create-if-absent — so existing grants survive a restart.)

- [ ] **Step 5: Implement the grant API**

Add these methods to `data-manager.js` (place them just after the `saveEmployee` method, ~line 194, so employee-adjacent operations stay together):

```js
    /**
     * Loads the supervisor role-grants store into the synchronous in-memory mirror. Call once at startup (after
     * the cache + org chart are ready) and whenever the store may have changed out-of-band. Null/empty entries are
     * ignored. Safe when the cache is non-operational (mirror is left empty).
     *
     * @method
     * @returns {Promise}
     * @public
     */
    loadRoleGrants() {
        return this.fetchRoleGrants().then( ( grants ) => {
            this.#supervisorGrantIDs = new Set( Object.keys( grants ) );
        } );
    }

    /**
     * Returns the raw supervisor role-grants map `{ [employeeID]: { role, grantedBy, grantedAt } }`, excluding any
     * null/tombstoned entries. Reads the store (async); for synchronous login-time checks use hasSupervisorGrant.
     *
     * @method
     * @returns {Promise<Object>}
     * @public
     */
    fetchRoleGrants() {
        return new Promise( ( resolve, reject ) => {
            if ( !cache.instance.isOperational ) {
                return resolve( {} );
            }
            cache.instance.getJSON( cacheEntryKeyRoleGrants, "$" ).then( ( result ) => {
                const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                const grants = {};
                if ( source && typeof source === "object" ) {
                    for ( const [ employeeID, grant ] of Object.entries( source ) ) {
                        if ( grant && grant.role ) {
                            grants[ employeeID ] = grant;
                        }
                    }
                }
                resolve( grants );
            } ).catch( reject );
        } );
    }

    /**
     * Whether the employee currently holds a manual supervisor grant. Synchronous — reads the in-memory mirror.
     *
     * @method
     * @param {string} employeeID
     * @returns {boolean}
     * @public
     */
    hasSupervisorGrant( employeeID ) {
        return !!employeeID && this.#supervisorGrantIDs.has( String( employeeID ) );
    }

    /**
     * The employee IDs that currently hold a manual supervisor grant (from the mirror).
     *
     * @method
     * @returns {Array<string>}
     * @public
     */
    getSupervisorGrantIDs() {
        return Array.from( this.#supervisorGrantIDs );
    }

    /**
     * Grants the supervisor role to an employee: write-through to the store + mirror, and append an employee-scoped
     * audit entry. Idempotent at the storage layer (re-granting just refreshes grantedBy/grantedAt).
     *
     * @method
     * @param {string} employeeID - The grantee.
     * @param {string} grantedBy - The acting (auto) supervisor's employee ID.
     * @returns {Promise<Object>} The persisted grant record.
     * @public
     */
    grantSupervisorRole( employeeID, grantedBy ) {
        return new Promise( ( resolve, reject ) => {
            const targetID = String( employeeID || "" ).trim();
            if ( !targetID || !grantedBy ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, grantedBy } ) );
            }
            const grant = { role: configurationLoader.roleCode.SUPERVISOR, grantedBy: String( grantedBy ), grantedAt: new Date().toISOString() };
            const write = cache.instance.isOperational
                ? cache.instance.editJSON( cacheEntryKeyRoleGrants, { [ targetID ]: grant } )
                : Promise.resolve();
            write.then( () => {
                this.#supervisorGrantIDs.add( targetID );
                return this.appendAuditEntry( {
                    subjectType: "employee",
                    subjectID: targetID,
                    changedBy: String( grantedBy ),
                    field: "supervisorRole",
                    oldValue: null,
                    newValue: "granted"
                } );
            } ).then( () => resolve( _.cloneDeep( grant ) ) ).catch( reject );
        } );
    }

    /**
     * Revokes a manual supervisor grant: removes it from the store (RFC 7396 merge-patch delete via a null value) and
     * the mirror, and appends an employee-scoped audit entry. No-op-safe when no grant exists.
     *
     * @method
     * @param {string} employeeID - The grantee to revoke.
     * @param {string} revokedBy - The acting (auto) supervisor's employee ID.
     * @returns {Promise}
     * @public
     */
    revokeSupervisorRole( employeeID, revokedBy ) {
        return new Promise( ( resolve, reject ) => {
            const targetID = String( employeeID || "" ).trim();
            if ( !targetID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID } ) );
            }
            const write = cache.instance.isOperational
                ? cache.instance.editJSON( cacheEntryKeyRoleGrants, { [ targetID ]: null } )
                : Promise.resolve();
            write.then( () => {
                this.#supervisorGrantIDs.delete( targetID );
                return this.appendAuditEntry( {
                    subjectType: "employee",
                    subjectID: targetID,
                    changedBy: revokedBy ? String( revokedBy ) : targetID,
                    field: "supervisorRole",
                    oldValue: "granted",
                    newValue: null
                } );
            } ).then( () => resolve() ).catch( reject );
        } );
    }
```

> Note: the test's revoke case calls `revokeSupervisorRole( "9" )` (no `revokedBy`); the audit `changedBy` falls back to the target ID, which is acceptable for the unit test. The endpoint in Task 5 always passes the acting supervisor.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/competence && node --test test/data-manager.role-grants.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/application/data-manager.js packages/competence/test/data-manager.role-grants.test.js
git commit -F - <<'EOF'
feat(competence): audited supervisor role-grants store with in-memory mirror (CA-72)

New ti:competence:data:role-grants store + synchronous mirror for login-time
derivation; grant/revoke write-through + employee-scoped audit entries.
Non-destructive NX init.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: Compose roles at login (`augmentSession`) + load mirror at startup

Wire the pure resolver + org adapter + grant mirror into the one place roles are assigned.

**Files:**
- Modify: `packages/competence/bin/competence-web-server.js`

- [ ] **Step 1: Load the grant mirror during startup**

In `competence-web-server.js#onStart`, load the grants mirror after the org chart is built (the mirror needs the cache initialized, which `dataManager.initialize()` guarantees):

```js
    onStart() {
        return super.onStart()
            .then( () => dataManager.instance.initialize() )
            .then( () => organizationManager.instance.buildOrganizationChart() )
            .then( () => dataManager.instance.loadRoleGrants() )
            .then( () => configurationLoader.initialize() )
            .catch( ( error ) => {
                logger.log( `Error while trying to start competence web server within instance '${ ServiceConsumer.instanceID }'!`, logger.logSeverity.ERROR, error );
                throw exceptions.raise( error );
            } );
    }
```

- [ ] **Step 2: Add the `role-resolver` require**

At the top of `competence-web-server.js`, alongside the existing requires:

```js
const configurationLoader = require( "#configuration-loader" );
const roleResolver = require( "#role-resolver" );
```

- [ ] **Step 3: Replace the hardcoded role injection in `augmentSession`**

Replace the body of `augmentSession` with derivation + an optional dev override:

```js
    augmentSession( session, request ) {
        // NOTE: Identity (employeeID) still comes from the temporary test-user cookie until AD-driven identity is
        // wired up. Roles are now DERIVED from the user's place in the org chart; the cookie's optional `roles`
        // array remains a dev-only override (see the login test panel).
        if ( session.user ) {
            const testUser = this.#readTestUserSelection( request );
            session.user.employeeID = ( testUser && testUser.employeeID ) || session.user.employeeID || "20";

            const overrideRoles = ( testUser && Array.isArray( testUser.roles ) && testUser.roles.length > 0 ) ? testUser.roles : null;
            session.user.roles = overrideRoles || this.#resolveUserRoles( session.user.employeeID );
        }

        return session;
    }

    /**
     * Derives the effective role codes for an employee from their org-chart position plus any manual supervisor grant.
     * Synchronous by design (augmentSession runs inside a synchronous session callback): the org chart and the grant
     * mirror are both in-memory by this point.
     *
     * @method
     * @param {string} employeeID
     * @returns {number[]}
     * @private
     */
    #resolveUserRoles( employeeID ) {
        return roleResolver.instance.resolveRoles( {
            isUnitManager: organizationManager.instance.isUnitManager( employeeID ),
            isAutoSupervisor: organizationManager.instance.isAutoSupervisor( employeeID ),
            hasSupervisorGrant: dataManager.instance.hasSupervisorGrant( employeeID )
        } );
    }
```

(Keep the existing `#readTestUserSelection` method unchanged — it already tolerates a missing/empty `roles` array.)

- [ ] **Step 4: Verify the full suite still passes**

Run: `cd packages/competence && npm test`
Expected: PASS (no test imports the web-server directly; this confirms no syntax/wiring regressions across the package).

- [ ] **Step 5: Manual smoke (deferred to Task 6 verification)**

Role derivation is observable only through the running app; it is verified end-to-end in Task 6's verification step (log in as employees 22 / 20 / 8 / 1 and confirm the role-gated UI matches `[E,M,S]` / `[E,M]` / `[E,M]` / `[E]`). No code change here — just a reminder that Task 4 has no isolated test.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/competence-web-server.js
git commit -F - <<'EOF'
feat(competence): derive session roles from org position at login (CA-72)

augmentSession now composes EMPLOYEE/MANAGER/SUPERVISOR via the role-resolver
from org-chart facts + supervisor grants; the test-user cookie's roles become
an optional dev override. Grant mirror is loaded during onStart.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: Grant/revoke endpoints + Employee Management detail payload

Two new services gated to auto-supervisors, and the detail-pane data the UI needs.

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js`

- [ ] **Step 1: Route the two new services**

In `processServiceRequest`, add two branches before the final `else` (after the `update-employee` branch, ~line 336):

```js
        } else if ( service === "update-employee" ) {
            return this.#updateEmployee( session, params );
        } else if ( service === "grant-supervisor" ) {
            return this.#grantSupervisor( session, params );
        } else if ( service === "revoke-supervisor" ) {
            return this.#revokeSupervisor( session, params );
        } else {
            return super.processServiceRequest( session, service, params );
        }
```

- [ ] **Step 2: Implement the two handlers**

Add these private methods near `#updateEmployee` (after it, ~line 3079):

```js
    /**
     * Grants the supervisor role to an employee. Authority: the actor must be a *structural* (auto) supervisor — a
     * merely-granted supervisor cannot manage roles. Rejects granting to someone who is already an auto-supervisor
     * (structural — nothing to grant) or already granted. The grantee gains the role on their next login.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.employeeID - The grantee.
     * @returns {Promise<Object>} The refreshed employee detail.
     * @private
     */
    #grantSupervisor( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            if ( !organizationManager.instance.isAutoSupervisor( userID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.supervisor-grant.not-auto-supervisor" }, exceptions.httpCode.C_403 ) );
            }
            const targetID = String( params?.employeeID || "" ).trim();
            if ( !targetID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID: targetID } ) );
            }
            if ( targetID === userID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.supervisor-grant.self" }, exceptions.httpCode.C_422 ) );
            }
            if ( organizationManager.instance.isAutoSupervisor( targetID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.supervisor-grant.already-auto" }, exceptions.httpCode.C_422 ) );
            }
            if ( dataManager.instance.hasSupervisorGrant( targetID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_ALREADY_EXISTS, { details: "error.supervisor-grant.already-granted" }, exceptions.httpCode.C_409 ) );
            }
            dataManager.instance.fetchEmployee( targetID ).then( () => {
                return dataManager.instance.grantSupervisorRole( targetID, userID );
            } ).then( () => {
                return this.#loadEmployeeDetail( session, targetID );
            } ).then( ( detail ) => resolve( detail ) ).catch( ( error ) => reject( exceptions.raise( error ) ) );
        } );
    }

    /**
     * Revokes a manual supervisor grant. Authority: the actor must be a structural (auto) supervisor. An auto
     * supervisor's role is immutable and cannot be revoked; only an existing manual grant can be removed.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.employeeID - The grantee to revoke.
     * @returns {Promise<Object>} The refreshed employee detail.
     * @private
     */
    #revokeSupervisor( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            if ( !organizationManager.instance.isAutoSupervisor( userID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.supervisor-grant.not-auto-supervisor" }, exceptions.httpCode.C_403 ) );
            }
            const targetID = String( params?.employeeID || "" ).trim();
            if ( !targetID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID: targetID } ) );
            }
            if ( organizationManager.instance.isAutoSupervisor( targetID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.supervisor-grant.cannot-revoke-auto" }, exceptions.httpCode.C_422 ) );
            }
            if ( !dataManager.instance.hasSupervisorGrant( targetID ) ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.supervisor-grant.not-granted" }, exceptions.httpCode.C_404 ) );
            }
            dataManager.instance.revokeSupervisorRole( targetID, userID ).then( () => {
                return this.#loadEmployeeDetail( session, targetID );
            } ).then( ( detail ) => resolve( detail ) ).catch( ( error ) => reject( exceptions.raise( error ) ) );
        } );
    }
```

- [ ] **Step 3: Surface supervisor status + capabilities in the detail payload**

In `#loadEmployeeDetail`, compute the supervisor facts and extend the resolved object. Replace the `const isDirectManager = ...` line and the `resolve( { ... } )` block (lines ~2606–2634) with:

```js
                    const isDirectManager = !isSupervisor && organizationManager.instance.isSuperiorManagerOfEmployee( userID, employeeID );

                    // Supervisor status of the *target* employee + what the *viewer* may do about it.
                    const targetIsAutoSupervisor = organizationManager.instance.isAutoSupervisor( employeeID );
                    const targetHasGrant = dataManager.instance.hasSupervisorGrant( employeeID );
                    const targetIsSupervisor = targetIsAutoSupervisor || targetHasGrant;
                    const supervisorSource = targetIsAutoSupervisor ? "auto" : ( targetHasGrant ? "granted" : null );
                    const viewerCanManageGrants = organizationManager.instance.isAutoSupervisor( userID );
                    const canAssignSupervisor = viewerCanManageGrants && !targetIsSupervisor && employeeID !== userID;
                    const canRevokeSupervisor = viewerCanManageGrants && targetHasGrant && !targetIsAutoSupervisor;

                    resolve( {
                        employee: this.#projectEmployeeDetail( employee, session ),
                        manager: organizationContext,
                        supervisor: {
                            isSupervisor: targetIsSupervisor,
                            source: supervisorSource
                        },
                        inFlightEvaluations: {
                            count: inFlightList.length,
                            entries: inFlightList.map( ( evaluation ) => ( {
                                evaluationID: evaluation.evaluationID,
                                shortID: evaluation.shortID,
                                cycleID: evaluation.cycleID,
                                status: evaluation.status,
                                statusName: configurationLoader.evaluationStatus.name( evaluation.status ),
                                statusTone: this.#evaluationStatusTone( evaluation.status ),
                                stageLevel: ( evaluation.stageLevel || ( employee?.career?.level && employee?.career?.stage ? `${ employee.career.level }${ employee.career.stage }` : "" ) ) || "",
                                interviewDate: evaluation.interviewDate || null
                            } ) )
                        },
                        audit: auditProjected,
                        permissions: {
                            isSupervisor,
                            isDirectManager,
                            isSelf,
                            canEditAllFields: isSupervisor,
                            canEditSpecialization: isSupervisor || isDirectManager,
                            canViewAudit: isSupervisor,
                            canAssignSupervisor,
                            canRevokeSupervisor
                        }
                    } );
```

- [ ] **Step 4: Verify the full suite still passes (no handler regressions)**

Run: `cd packages/competence && npm test`
Expected: PASS. (Handlers are integration-level; end-to-end behaviour is verified in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add packages/competence/bin/competence-web-application.js
git commit -F - <<'EOF'
feat(competence): grant/revoke supervisor endpoints + detail supervisor status (CA-72)

Auto-supervisor-gated grant-supervisor / revoke-supervisor services (immutable
auto role, no self-grant, no double-grant) and supervisor source + viewer
capability flags on the employee detail payload.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 6: Employee Management UI — badge, assign/remove, warning modal

**Files:**
- Modify: `packages/competence/bin/static/fragments/frame-employee-management.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js`
- Modify: `packages/competence/bin/localization/competence-labels.json`
- Modify (if needed): `packages/competence/bin/static/scripts/competence-main.css`

- [ ] **Step 1: Add the localization labels**

In `competence-labels.json`, inside `interface.employee-management`, add a `supervisor` block (place it just before the existing `"role-family-change"` block, ~line 7507) and one audit field label. Use this exact JSON:

```json
      "supervisor": {
        "badge-auto": {
          "en": "Supervisor · structural",
          "bg": "Надзорник · структурен"
        },
        "badge-granted": {
          "en": "Supervisor · assigned",
          "bg": "Надзорник · назначен"
        },
        "assign-btn": {
          "en": "Assign Supervisor",
          "bg": "Назначи надзорник"
        },
        "remove-btn": {
          "en": "Remove Supervisor",
          "bg": "Премахни надзорник"
        },
        "auto-lock-hint": {
          "en": "Structural supervisors are derived from the org chart and cannot be removed.",
          "bg": "Структурните надзорници се определят от организационната схема и не могат да бъдат премахнати."
        },
        "assign-modal": {
          "title": {
            "en": "Assign Supervisor role",
            "bg": "Назначаване на роля Надзорник"
          },
          "desc": {
            "en": "This grants the Supervisor role to {name}. Supervisors can view all employees, run leadership reports, and facilitate evaluations across the organization. The role takes effect on their next sign-in. They will NOT be able to assign or remove the Supervisor role for others.",
            "bg": "Това предоставя ролята Надзорник на {name}. Надзорниците виждат всички служители, изготвят управленски справки и подпомагат оценките в цялата организация. Ролята влиза в сила при следващото влизане. Те НЯМА да могат да назначават или премахват ролята Надзорник на други."
          },
          "confirm-btn": {
            "en": "Assign Supervisor",
            "bg": "Назначи надзорник"
          },
          "cancel-btn": {
            "en": "Cancel",
            "bg": "Отказ"
          }
        },
        "toast-assigned": {
          "en": "Supervisor role assigned.",
          "bg": "Ролята Надзорник е назначена."
        },
        "toast-removed": {
          "en": "Supervisor role removed.",
          "bg": "Ролята Надзорник е премахната."
        }
      },
```

Then add the audit field label inside the existing `interface.employee-management.audit.field` object (find `"audit"` → `"field"` within the employee-management section and add this key):

```json
          "supervisorRole": {
            "en": "Supervisor role",
            "bg": "Роля Надзорник"
          }
```

- [ ] **Step 2: Render the badge + actions in the detail head**

In `frame-employee-management.html`, inside `competence-empmgmt-detail-head-aside` (the `<div>` at ~line 146 that holds the status pill + ID tag), append the supervisor badge and action buttons after the existing `<span class="ti-tag mono" ...>`:

```html
                                <span class="ti-status-pill"
                                      x-show="detail.supervisor.isSupervisor"
                                      x-bind:class="detail.supervisor.source === 'auto' ? 'info' : 'success'">
                                    <span class="dot"></span>
                                    <span x-text="detail.supervisor.source === 'auto' ? getLabel('interface.employee-management.supervisor.badge-auto') : getLabel('interface.employee-management.supervisor.badge-granted')"></span>
                                </span>
                                <button type="button" class="ti-btn sm ghost"
                                        x-show="detail.permissions.canAssignSupervisor"
                                        @click="openSupervisorAssignModal()">
                                    <span class="ti-icon shield sm" aria-hidden="true"></span>
                                    <span x-text-label="interface.employee-management.supervisor.assign-btn"></span>
                                </button>
                                <button type="button" class="ti-btn sm ghost danger"
                                        x-show="detail.permissions.canRevokeSupervisor"
                                        x-bind:disabled="supervisorBusy"
                                        @click="revokeSupervisor()">
                                    <span class="ti-icon close sm" aria-hidden="true"></span>
                                    <span x-text-label="interface.employee-management.supervisor.remove-btn"></span>
                                </button>
```

> If the `shield` icon variant does not exist in the `.ti-icon` set, use `user` (verify against `ti-framework.css`'s icon mask list and pick an existing variant — do not invent one).

- [ ] **Step 3: Add the assign confirmation modal**

In `frame-employee-management.html`, add a new modal template after the existing `role-family-change` modal `</template>` (~line 499):

```html
    <!-- =============================================================
         Supervisor assign confirmation modal
         ============================================================= -->
    <template x-if="modal.kind === 'supervisor-grant'">
        <div class="ti-modal-backdrop" @click.self="closeModal()" @keydown.escape.window="closeModal()">
            <div class="ti-modal warn" role="dialog" aria-modal="true">
                <div class="ti-modal-head">
                    <div class="ti-modal-title" x-text-label="interface.employee-management.supervisor.assign-modal.title"></div>
                    <button type="button" class="ti-modal-close" @click="closeModal()" aria-label="Close">
                        <span class="ti-icon close md" aria-hidden="true"></span>
                    </button>
                </div>
                <div class="ti-modal-body">
                    <p x-text="supervisorAssignDescription()"></p>
                </div>
                <div class="ti-modal-foot">
                    <button type="button" class="ti-btn ghost" @click="closeModal()"
                            x-text-label="interface.employee-management.supervisor.assign-modal.cancel-btn"></button>
                    <button type="button" class="ti-btn primary" @click="confirmSupervisorAssign()"
                            x-bind:disabled="supervisorBusy"
                            x-text-label="interface.employee-management.supervisor.assign-modal.confirm-btn"></button>
                </div>
            </div>
        </div>
    </template>
```

- [ ] **Step 4: Add the component state + methods**

In `competence-user-interface.js`, in `configureEmployeeManagement`:

(a) Add a `supervisorBusy` field to the returned component state (next to `saving`):

```js
            saving: false,
            supervisorBusy: false,
```

(b) Ensure `emptyDetail()` includes a `supervisor` object so the bindings never read undefined. Find the `emptyDetail` factory used by this component and add `supervisor: { isSupervisor: false, source: null }` to its returned object (alongside `employee`, `manager`, `permissions`). If `permissions` is constructed there, also add `canAssignSupervisor: false, canRevokeSupervisor: false`.

(c) Add the methods near `confirmRoleFamilyChange` (~line 3570):

```js
        openSupervisorAssignModal() {
            this.modal = { kind: "supervisor-grant", payload: {}, errorMessage: "", busy: false };
        },

        supervisorAssignDescription() {
            const name = ( this.detail && this.detail.employee ) ? this.detail.employee.name : "";
            return tiApplication.getLabel( "interface.employee-management.supervisor.assign-modal.desc" ).replace( "{name}", name || "" );
        },

        confirmSupervisorAssign() {
            if ( this.supervisorBusy || !this.selectedEmployeeID ) return;
            this.supervisorBusy = true;
            const id = this.selectedEmployeeID;
            tiApplication.sendRequest( "/app/grant-supervisor", "POST", { employeeID: id } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.supervisor.toast-assigned" ) );
                this.supervisorBusy = false;
                this.closeModal();
                this.loadDetail( id );
            } ).catch( ( error ) => {
                this.supervisorBusy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        revokeSupervisor() {
            if ( this.supervisorBusy || !this.selectedEmployeeID ) return;
            this.supervisorBusy = true;
            const id = this.selectedEmployeeID;
            tiApplication.sendRequest( "/app/revoke-supervisor", "POST", { employeeID: id } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.employee-management.supervisor.toast-removed" ) );
                this.supervisorBusy = false;
                this.loadDetail( id );
            } ).catch( ( error ) => {
                this.supervisorBusy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },
```

> CSP reminder: the `detail.supervisor.source === 'auto' ? ... : ...` ternaries in the fragment are allowed (no `?.`, no inline styles). `detail.supervisor` is guaranteed present via step (b).

- [ ] **Step 5: Verify in the running app**

Use the preview workflow (`preview_start`, then drive the UI). Log in via the test panel as the **top manager (22)** — an auto-supervisor — open Employee Management, select an IC (e.g. **9**), and confirm:
1. The **Assign Supervisor** button shows; clicking it opens the warning modal naming the employee.
2. Confirming shows the "assigned" toast; the badge flips to **Supervisor · assigned**; a **Remove Supervisor** button appears.
3. Select the top manager (22) themselves or employee 20 if you grant+promote — confirm an **auto** supervisor shows **Supervisor · structural** with **no** Remove button.
4. Log in as the **granted** user (after assigning) and confirm they can open Insights but the Assign/Remove buttons are **absent** on others (they are not an auto-supervisor).

Capture a screenshot of the assigned badge + remove button for the summary. If anything misbehaves, read the source, fix, and re-verify from this step.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-employee-management.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/localization/competence-labels.json packages/competence/bin/static/scripts/competence-main.css
git commit -F - <<'EOF'
feat(competence): supervisor badge + assign/remove on Employee Management (CA-72)

Detail-pane Supervisor badge (structural vs assigned), auto-supervisor-only
assign (with warning modal) and remove actions, en/bg labels, and a
supervisorRole audit field label.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 7: web-framework test panel → identity + optional role override

**Files:**
- Modify: `packages/web-framework/bin/static/scripts/ti-framework.js`
- Modify: `packages/web-framework/bin/static/fragments/frame-login.html`
- Modify: `packages/web-framework/bin/web-server.js` (JSDoc contract note only)

- [ ] **Step 1: Make the role override opt-in in the panel component**

In `ti-framework.js#configureLoginTestUserPanel`, add an `overrideRoles` toggle and only persist `roles` when it is on. Replace the returned object's `select`/`clear` and add the toggle (keep `profiles`, `readCookie`, `writeCookie`, `clearCookie`, `isSelected` as-is):

```js
    return {
        profiles: [
            { employeeID: "22", roles: [ 1, 2, 3 ] },
            { employeeID: "20", roles: [ 1, 2 ] },
            { employeeID: "1", roles: [ 1 ] },
            { employeeID: "3", roles: [ 1 ] },
            { employeeID: "4", roles: [ 1 ] },
            { employeeID: "8", roles: [ 1, 2 ] },
            { employeeID: "9", roles: [ 1 ] }
        ],
        selected: null,
        overrideRoles: false,

        init() {
            this.selected = readCookie();
            // If a previously-stored selection carries roles, surface the override toggle as on.
            this.overrideRoles = Boolean( this.selected && Array.isArray( this.selected.roles ) && this.selected.roles.length > 0 );
        },

        isSelected( profile ) {
            return Boolean( this.selected && this.selected.employeeID === profile.employeeID );
        },

        select( profile ) {
            // Identity is always injected; roles are derived server-side from org position unless the override is on.
            this.selected = this.overrideRoles
                ? { employeeID: profile.employeeID, roles: profile.roles.slice() }
                : { employeeID: profile.employeeID };
            writeCookie( this.selected );
        },

        toggleOverride() {
            this.overrideRoles = !this.overrideRoles;
            if ( this.selected ) {
                // Re-write the cookie for the current identity under the new override setting.
                const profile = this.profiles.find( ( candidate ) => candidate.employeeID === this.selected.employeeID );
                if ( profile ) {
                    this.select( profile );
                }
            }
        },

        clear() {
            this.selected = null;
            clearCookie();
        }
    };
```

- [ ] **Step 2: Update the login panel markup**

In `frame-login.html`, update the test panel: change the sub-text and add the override toggle. Replace the `ti-login-test-panel-sub` line and add the toggle row right after the pills `<div>` (~line 98):

```html
            <div class="ti-login-test-panel-sub">Pick an identity to inject on login. Roles are derived from the org chart unless you override them.</div>
```

And after the pills container's closing `</div>` (the one at ~line 98, before the panel's closing `</div>`):

```html
            <label class="ti-login-test-panel-override">
                <input type="checkbox" x-model="overrideRoles" x-on:change="toggleOverride()"/>
                <span>Override roles (dev) — inject this profile's role list instead of deriving</span>
            </label>
```

The per-pill role text (`x-text="'roles ' + profile.roles.join(', ')"`) stays as an informational hint of what the override would inject.

- [ ] **Step 3: Update the `augmentSession` contract note**

In `web-framework/bin/web-server.js`, update the JSDoc above the virtual `augmentSession` to note that an app may derive roles and that any test-user role injection is an override. Replace the doc comment block (lines ~375–383) so it reads:

```js
    /**
     * Hook for the application to augment the freshly-authenticated session (e.g. derive domain roles from an
     * identity store or the org chart). Runs synchronously, once per login, before the framework's additive `admin`
     * role is applied. The default is a no-op. Any test-user role injection is an override of whatever the app derives.
     *
     * @method
     * @virtual
     * @param {TiSession} session
     * @param {Object} [request] Optional Express request object that can be used to read body/cookies/query data.
     * @returns {TiSession}
     * @public
     */
```

- [ ] **Step 4: Add minimal styling for the override row (if needed)**

If the `.ti-login-test-panel-override` class has no styling, add a small rule to the login/test-panel CSS (find where `.ti-login-test-panel-sub` is defined — likely `ti-framework.css` or a login CSS — and add a sibling rule). Keep it consistent with the panel:

```css
.ti-login-test-panel-override {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.85;
    cursor: pointer;
}
```

- [ ] **Step 5: Verify in the running app**

With the preview running: on the login screen, pick identity **22** with the override **off** → confirm the app behaves as an auto-supervisor (Insights + Employee-Management grant controls present), proving server-side derivation. Toggle override **on**, pick **1** with roles `[1]` → confirm only employee affordances. This confirms both the derive path and the override path.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/bin/static/scripts/ti-framework.js packages/web-framework/bin/static/fragments/frame-login.html packages/web-framework/bin/web-server.js packages/web-framework/bin/static/styles
git commit -F - <<'EOF'
feat(web-framework): test-user panel injects identity; roles override is opt-in (CA-72)

Login test panel now injects only the identity by default so the app derives
roles; an "override roles (dev)" toggle keeps the manual role escape hatch.
augmentSession contract note clarifies derive-vs-override.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

> Note: `git add packages/web-framework/bin/static/styles` is a best-effort path; adjust to the actual CSS file you edited in Step 4 (or drop it if no CSS change was needed). Never `git add` `.run/*.run.xml`.

---

## Task 8: Versioning, changelogs, design log, YouTrack

**Files:**
- Modify: `packages/competence/package.json`, `packages/competence/CHANGELOG.md`
- Modify: `packages/web-framework/package.json`, `packages/web-framework/CHANGELOG.md`
- Modify: `packages/competence/design/auto-org-derived-roles.md`

- [ ] **Step 1: Bump competence version**

In `packages/competence/package.json`, bump `version` `3.5.0` → `3.6.0`. Prepend a `CHANGELOG.md` entry:

```markdown
## Version 3.6.0
* feat(competence): derive EMPLOYEE/MANAGER/SUPERVISOR roles from org-chart position at login (CA-72)
* feat(competence): auto-supervisors can assign/remove the Supervisor role from Employee Management; structural supervisors are immutable (CA-72)
* feat(competence): audited role-grants store with a synchronous in-memory mirror for login-time derivation (CA-72)
```

- [ ] **Step 2: Bump web-framework version**

In `packages/web-framework/package.json`, read the current `version` and bump the minor (e.g. `1.10.0` → `1.11.0` — confirm the actual current value first). Prepend a `CHANGELOG.md` entry:

```markdown
## Version 1.11.0
* feat(web-framework): login test-user panel injects identity only by default (roles derived by the app); role injection becomes an opt-in dev override (CA-72)
* docs(web-framework): clarify the augmentSession contract (derive vs. override) (CA-72)
```

- [ ] **Step 3: Append the design-doc implementation log + flip status**

In `packages/competence/design/auto-org-derived-roles.md`, change the Meta `Status` to `Implemented (2026-06-26)` and append under `## Implementation log` a short bullet list of what landed (the role-resolver, org helpers, role-grants store, augmentSession wiring, endpoints, UI, web-framework panel), referencing the commits.

- [ ] **Step 4: Run the full competence suite one last time**

Run: `cd packages/competence && npm test`
Expected: PASS (all suites, including the three new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/competence/package.json packages/competence/CHANGELOG.md packages/web-framework/package.json packages/web-framework/CHANGELOG.md packages/competence/design/auto-org-derived-roles.md
git commit -F - <<'EOF'
chore(release): competence 3.6.0 + web-framework 1.11.0 — org-derived roles (CA-72)

Version bumps, changelogs, and the design-doc implementation log for the
org-derived roles + supervisor grant management feature.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Update YouTrack CA-72**

Use the `mcp__youtrack__*` tools:
1. `update_issue` CA-72 → `State: In Progress` / `Stage: Develop` at start of implementation, then `State: Verified` / `Stage: Done` once merged & verified (set `Version: v3.6.0` if that enum value exists; otherwise leave Version and note it in a comment).
2. `log_work` on CA-72 with the actual time spent (Development) and a short description.
3. Optionally `add_issue_comment` summarizing what shipped + the key commits.

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 rules → Tasks 1–2; §4 persistence/mirror → Task 3; §5 modules → Tasks 1–4; §6 endpoints + payload → Task 5; §7 UI → Task 6; §8 web-framework → Task 7; §10 testing → Tasks 1–3; §11 versioning/tracking → Task 8. All sections mapped.
- **Edge cases (§9):** self-grant, already-auto, already-granted, revoke-auto, not-granted → all enforced in Task 5 handlers; unknown/empty IDs → Task 2 tests; degraded chart → `[EMPLOYEE]` via the resolver default.
- **Type consistency:** `resolveRoles` / `isAutoSupervisor` / `subManagerDepth` signatures match across Tasks 1–4; `hasSupervisorGrant`/`getSupervisorGrantIDs`/`grantSupervisorRole`/`revokeSupervisorRole`/`loadRoleGrants`/`fetchRoleGrants` names match across Tasks 3–5; detail payload `supervisor.{isSupervisor,source}` + `permissions.{canAssignSupervisor,canRevokeSupervisor}` match between Task 5 (producer) and Task 6 (consumer); service names `grant-supervisor`/`revoke-supervisor` match between Task 5 routes and Task 6 requests.
- **Known soft spots flagged in-plan:** the `shield` icon may need substitution (Task 6 Step 2); the web-framework CSS path and current version need on-the-spot confirmation (Tasks 7–8); `emptyDetail()` must gain a `supervisor` object (Task 6 Step 4b) — verify the factory's exact location when editing.
