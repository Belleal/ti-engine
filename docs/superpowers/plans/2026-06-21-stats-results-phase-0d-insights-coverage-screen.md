# Phase 0D — Insights shell + Coverage screen — implementation plan

Steps use markdown checkbox (`- [ ]`) syntax. An agentic worker executing this plan should use **superpowers:subagent-driven-development** (independent tasks in this session) or **superpowers:executing-plans** (separate session with review checkpoints).

## Goal

Deliver the Insights IA/access shell and the live-or-snapshot **Coverage** screen — the user-facing half of the Phase 0 walking skeleton. A Supervisor opens **Insights → Cycle analytics** and sees the R1 Coverage gauge + per-group stacked bars + pending grid, rendered from live data for the ACTIVE cycle and from the persisted snapshot for a CLOSED cycle, in both `daylight` and `glass` themes.

## Architecture

- **Fragments**: two server-registered HTML fragments (`insights-overview` stub, `insights-cycle`) loaded via the existing htmx `hx-get="/app/<fragment>"` route.
- **Sidebar IA**: a new gated **Insights** group in `component-sidebar.html` (Manager+Supervisor for the group; Supervisor-only for the Cycle-analytics item) plus `sidebarNavMapping` entries so the active-highlight resolves.
- **Data endpoints**: two Supervisor-gated `processDataRequest` branches — `load-insights-cycle` (screen shell: resolved cycle + selector candidates) and `load-report-coverage` (the R1 payload). Both resolve the target cycle from `?cycleID` with an active-cycle fallback via the **pure** `pickCycleForRequest` helper, and both inject the **org-root unit id** into the analytics filter so the whole-org roster is non-empty.
- **Alpine CSP component** `insightsCycle`: fetches both endpoints, stores the payload, and builds the `gauge`/`bars` chart specs in **pure module-level functions** (`buildCoverageGaugeSpec`/`buildCoverageBarsSpec`) so they are `node --test`-able without a DOM. The template hosts the charts via `x-ti-chart="<spec property path>"` (Component A's directive).

## Tech Stack

- Node.js CommonJS (`require`/`module.exports`), internal `#alias` imports.
- Server: `CompetenceWebApplication extends TiWebAppManager` (`competence-web-application.js`).
- Browser: Alpine.js **CSP build** (dotted property paths + registered methods only — no `Array`/`Object`/`Math`/ternary-with-call/optional-chaining in templates), htmx fragment routing, strict CSP (presentation attrs via `setAttribute`/CSS class; `element.style.setProperty('--var', …)` only).
- Tests: Node built-in `node --test` + `node:assert/strict` over `packages/competence/test/*.test.js`.

## Depends on

- **Component A** — `x-ti-chart` Alpine CSP directive + `ti-charts.js` shipping the `gauge` and `bars` primitives, with the `.ti-chart-*` CSS, loaded in both `index.html`s. D5 only *hosts* these.
- **Component B** — `#results-analytics` exposing `instance.resolve( cycleID, filter, reportKey )` returning the Coverage payload, and the pure `pickCycleForRequest` module export. **D4 is the canonical definition of `pickCycleForRequest`**; if B already added it, D4 collapses to the handler wiring only (see Task D4 note). D4 also depends on B/A's `resolveScopeFilter` honoring `filter.rootUnitID` (the org-root blocker fix — see Task D4a).
- **Component C** — snapshot store + `getResultsSnapshot`; `resolve` branches live-vs-snapshot internally, so D needs no snapshot code.

If Components are built in order A→B→C→D these are all merged before D begins.

## File structure

```
packages/competence/
├── bin/
│   ├── competence-web-application.js                    (modify: 2 addFragment, 2 sidebarNavMapping, 2 handlers, 1 require)
│   └── static/
│       ├── index.html                                   (modify: load insights-cycle-specs.js)
│       ├── fragments/
│       │   ├── frame-insights-overview.html             (create: stub)
│       │   ├── frame-insights-cycle.html                (create)
│       │   └── components/
│       │       └── component-sidebar.html               (modify: Insights group)
│       └── scripts/
│           ├── insights-cycle-specs.js                  (create: pure spec builders, dual-publish)
│           └── competence-user-interface.js             (modify: insightsCycle + insightsOverview components)
└── test/
    ├── insights-cycle-selector.test.js                  (create)
    └── insights-cycle-specs.test.js                     (create)
```

> Component-shared edit: `organization-manager.js` gains a `getOrganizationRootUnitID()` accessor (Task D4a). It is grounded here because D is the first component that needs a non-empty whole-org roster, but if Component B's `resolveScopeFilter` task already added it, D4a collapses to "verify it exists" and D4 just consumes it.

---

### Task D4a: Add `getOrganizationRootUnitID()` accessor to organization-manager (org-root blocker fix)

Whole-org Coverage must NOT pass `""` as the root: `organization-manager.js:393-400` guards `if ( !rootUnitID || … ) return null;`, so an empty/missing root yields a null subtree → empty roster → `overall.N` collapses to the evaluation count and every "Not started" segment is 0. The real org root is the unit whose `parent === null`, id `"1"` (`config.organization-structure.json:2-9`). There is currently **no** accessor for it (verified: `organization-manager.js` exposes only `getOrganizationUnitSubtree`). Add a pure, unit-tested accessor.

**Files**
- Modify: `packages/competence/application/organization-manager.js`
- Create: `packages/competence/test/organization-root.test.js`
- Test: `packages/competence/test/organization-root.test.js`

Steps:

- [ ] **Write the failing test.** Match the existing `node --test` + `assert/strict` style. The accessor returns the id of the node whose `parent` attribute is null. Build the chart through the manager's existing load path; read an existing organization-manager test first to copy its fixture-loading idiom, then:

  `packages/competence/test/organization-root.test.js`
```js
"use strict";

const test = require( "node:test" );
const assert = require( "node:assert/strict" );
const organizationManager = require( "#organization-manager" );
const structure = require( "../bin/config/config.organization-structure.json" );

test( "getOrganizationRootUnitID returns the unit whose parent is null", () => {
    organizationManager.instance.buildOrganizationChart( structure );
    assert.equal( organizationManager.instance.getOrganizationRootUnitID(), "1" );
} );
```
  (If the public chart-build method is named differently, substitute the real name — find it with `grep -n "buildOrganizationChart\|loadOrganization\|#organizationChart =" packages/competence/application/organization-manager.js` and use whatever populates `#organizationChart`.)
- [ ] **Run it — expect FAIL** (`getOrganizationRootUnitID` is not a function):
```bash
node --test packages/competence/test/organization-root.test.js
```
Expected: `Error [ERR_TEST_FAILURE]` — `… getOrganizationRootUnitID is not a function`.
- [ ] **Minimal implementation** — add the accessor next to `getOrganizationUnitSubtree` (`:393`). It returns the source-record id whose `parent` is null. It reads the same config the chart is built from (inject via the constructor-held units map; if the manager keeps a `#units`/source map use it, else iterate the chart nodes' attributes):
```js
    /**
     * Returns the id of the organization root unit — the single unit whose `parent` attribute is null.
     * Used by org-wide reports (e.g. Coverage) that need to root a whole-org roster traversal.
     *
     * @method
     * @returns {string|null}
     * @public
     */
    getOrganizationRootUnitID() {
        const units = this.#organizationUnits || {};
        const ids = Object.keys( units );
        for ( let i = 0; i < ids.length; i++ ) {
            const unit = units[ ids[ i ] ];
            if ( unit && unit.parent === null ) {
                return unit.id;
            }
        }
        return null;
    }
```
  (Substitute `#organizationUnits` with the real private field that holds the keyed source records — confirm with `grep -n "#organization" packages/competence/application/organization-manager.js`. If only the graph is available, walk up from any node via the graph's parent edges to the node with no parent and return its unit id.)
- [ ] **Run it — expect PASS:**
```bash
node --test packages/competence/test/organization-root.test.js
```
Expected: `# pass 1` / `# fail 0`.
- [ ] Commit:
```bash
git add packages/competence/application/organization-manager.js \
        packages/competence/test/organization-root.test.js
git commit -m "feat(competence): add getOrganizationRootUnitID accessor for org-wide roster roots (CA-F4)"
```

---

### Task D1: Register the two Insights fragments

**Files**
- Modify: `packages/competence/bin/competence-web-application.js`
- Create: `packages/competence/bin/static/fragments/frame-insights-overview.html`
- Create: `packages/competence/bin/static/fragments/frame-insights-cycle.html`
- Test: none (fragment registration has no pure unit; a missing `addFragment` 404s the route — caught by D7 manual launch)

Steps:

- [ ] Create the overview stub `packages/competence/bin/static/fragments/frame-insights-overview.html`:
```html
<div class="ti-page" x-data="insightsOverview">
    <div class="ti-page-head">
        <h1 class="ti-page-title" x-text-label="interface.insights.overview.title">Insights</h1>
        <p class="ti-page-sub" x-text-label="interface.insights.overview.sub">Cycle and team analytics.</p>
    </div>
    <div class="ti-empty-state">
        <div class="ti-empty-state-title" x-text-label="interface.insights.overview.coming-soon">Pick a report from the sidebar.</div>
    </div>
</div>
```
- [ ] Create the placeholder `packages/competence/bin/static/fragments/frame-insights-cycle.html` (real markup lands in D5; the file must exist for `addFragment` to resolve):
```html
<div class="ti-page" x-data="insightsCycle"></div>
```
- [ ] In `competence-web-application.js`, add two `addFragment` calls inside the constructor immediately after the `role-families` registration (the last existing `addFragment` block — confirm with `grep -n 'addFragment( "role-families"' packages/competence/bin/competence-web-application.js` and insert right after its closing `} );`):
```js
        this.addFragment( "insights-overview", {
            title: "Insights",
            path: "fragments/frame-insights-overview.html"
        } );
        this.addFragment( "insights-cycle", {
            title: "Cycle Analytics",
            path: "fragments/frame-insights-cycle.html"
        } );
```
- [ ] Commit:
```bash
git add packages/competence/bin/competence-web-application.js \
        packages/competence/bin/static/fragments/frame-insights-overview.html \
        packages/competence/bin/static/fragments/frame-insights-cycle.html
git commit -m "feat(competence): register insights-overview and insights-cycle fragments (CA-F4)"
```

---

### Task D2: Add `sidebarNavMapping` entries for the Insights fragments

The map is the single active-highlight source (`competence-web-application.js:151-166`; verified `role-families` is the last entry at `:165`). Both insights fragments map to the `insights` active key.

**Files**
- Modify: `packages/competence/bin/competence-web-application.js` (`:151-166`)
- Test: none (config-map wiring; verified by D7 active-highlight check)

Steps:

- [ ] In the `sidebarNavMapping` object literal, change the `"role-families": "administration"` line (`:165`) to add the two trailing entries:
```js
                    "role-families": "administration",
                    "insights-overview": "insights",
                    "insights-cycle": "insights"
```
- [ ] Commit:
```bash
git add packages/competence/bin/competence-web-application.js
git commit -m "feat(competence): map insights fragments to the insights sidebar key (CA-F4)"
```

---

### Task D3: Add the Insights sidebar group (gated, `x-show`)

**Files**
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html`
- Test: none (markup; verified by D7 role-visibility check)

Steps:

- [ ] **Read `component-sidebar.html:60-103` first to confirm the anchors.** (Verified layout: the **Manage** group's `<div x-show=…>` opens at `:67` and its matching closing `</div>` is at `:87`; the **Administration** group's opening `<div x-show="$store.tiApplication.hasRole('admin')">` is at `:92`, with its comment at `:89-91`.) Insert the new **Insights** group as a sibling block **after the Manage group's closing `</div>` (the div opened at `:67`, closed at `:87`) and before the Administration group's comment/opening div at `:89`/`:92`** — i.e. into the blank line at `:88`. It mirrors the Manage group's gating idiom verbatim (`x-show`, not `x-if`, with the same htmx-wires-once rationale), gated to Manager(2) OR Supervisor(3); the Cycle-analytics item is nested-gated to Supervisor(3) only. The `dashboard-grid`/`cycles-loop` icon names reuse existing sidebar icons (`cycles-loop` at `:82`):
```html
    <!-- Insights: cross-cycle / cross-team analytics. Visible to managers and supervisors.
         x-show (not x-if) so htmx — which scans hx-* attributes once at page load — wires these buttons up
         even when the current user can't see the section yet. -->
    <div x-show="$store.tiApplication.hasRole(2) || $store.tiApplication.hasRole(3)">
        <div class="ti-sidebar-section-label" x-text-label="interface.navigation.insights">Insights</div>
        <div class="ti-sidebar-nav">
            <button hx-get="/app/insights-overview" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'insights'"
                    x-bind:class="{ active: active === 'insights' }" class="ti-sidebar-item" data-tip="Insights" aria-label="Insights" type="button">
                <span class="ti-sidebar-item-icon">
                    <span class="ti-icon dashboard-grid md" aria-hidden="true"></span>
                </span>
                <span class="ti-sidebar-item-label" x-text-label="interface.navigation.insights-overview">Insights</span>
            </button>

            <button hx-get="/app/insights-cycle" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'insights'"
                    x-show="$store.tiApplication.hasRole(3)"
                    x-bind:class="{ active: active === 'insights' }" class="ti-sidebar-item" data-tip="Cycle analytics" aria-label="Cycle analytics" type="button">
                <span class="ti-sidebar-item-icon">
                    <span class="ti-icon cycles-loop md" aria-hidden="true"></span>
                </span>
                <span class="ti-sidebar-item-label" x-text-label="interface.navigation.insights-cycle">Cycle analytics</span>
            </button>
        </div>
    </div>

```
(Note: `team-analytics` is Phase 2 — deliberately omitted per Phase 0 scope. If the `dashboard-grid` icon name is absent from the icon set, substitute an existing one — confirm available names with `grep -o 'ti-icon [a-z-]*' packages/competence/bin/static/fragments/components/component-sidebar.html`.)
- [ ] Commit:
```bash
git add packages/competence/bin/static/fragments/components/component-sidebar.html
git commit -m "feat(competence): add gated Insights sidebar group with supervisor-only cycle item (CA-F4)"
```

---

### Task D4: `load-insights-cycle` + `load-report-coverage` data endpoints (gated, cycle-selector, org-root filter)

Extract the cycle-selector resolution into a **pure, unit-tested helper** (`pickCycleForRequest`), then wire two Supervisor-gated `processDataRequest` branches that resolve the cycle via that helper and inject the **org-root unit id** into the analytics filter.

**Files**
- Modify: `packages/competence/bin/competence-web-application.js` (dispatch `:201-228`; new private handlers; module require `:9-18`)
- Modify: `packages/competence/application/results-analytics.js` (Component B's module — add the `pickCycleForRequest` export if B has not)
- Create: `packages/competence/test/insights-cycle-selector.test.js`
- Test: `packages/competence/test/insights-cycle-selector.test.js`

> **Note:** `pickCycleForRequest` lives in Component B's `results-analytics.js`. This task is its canonical definition. If Component B already exported it, skip the impl step below — keep only the test (it still must pass) and the handler wiring, and drop `results-analytics.js` from the commit's `git add`.

Steps:

- [ ] **Write the failing test** for the pure cycle-selector. The helper picks the requested `cycleID` when present among the candidates, else falls back to the resolved current cycle:

  `packages/competence/test/insights-cycle-selector.test.js`
```js
"use strict";

const test = require( "node:test" );
const assert = require( "node:assert/strict" );
const { pickCycleForRequest } = require( "#results-analytics" );

const CYCLES = [
    { cycleID: "2026-H1", status: "Closed" },
    { cycleID: "2026-H2", status: "Active" }
];

test( "pickCycleForRequest returns the requested cycle when present", () => {
    const picked = pickCycleForRequest( CYCLES, "2026-H1", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H1" );
} );

test( "pickCycleForRequest falls back to the active/current cycle for a blank request", () => {
    const picked = pickCycleForRequest( CYCLES, "", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H2" );
} );

test( "pickCycleForRequest falls back when the requested cycleID is unknown", () => {
    const picked = pickCycleForRequest( CYCLES, "1999-H9", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H2" );
} );

test( "pickCycleForRequest returns null when there is no requested and no fallback cycle", () => {
    assert.equal( pickCycleForRequest( [], "", null ), null );
} );
```
- [ ] **Run it — expect FAIL** (`pickCycleForRequest` not yet exported):
```bash
node --test packages/competence/test/insights-cycle-selector.test.js
```
Expected: `Error [ERR_TEST_FAILURE]` — `pickCycleForRequest is not a function`.
- [ ] **Minimal implementation** — add the pure helper to `results-analytics.js` and export it at module level (not on `.instance`), placed near the other pure exports:
```js
/**
 * Pure cycle selector: returns the cycle whose cycleID matches `requestedCycleID` from `cycles`,
 * or `fallbackCycle` when the request is blank/unknown. No I/O.
 *
 * @param {Array<Object>} cycles - All known cycles (each carries `cycleID`).
 * @param {string} requestedCycleID - The `?cycleID` query value (may be empty).
 * @param {Object|null} fallbackCycle - The active-or-latest cycle.
 * @returns {Object|null}
 */
function pickCycleForRequest( cycles, requestedCycleID, fallbackCycle ) {
    const wanted = String( requestedCycleID || "" ).trim();
    if ( wanted && Array.isArray( cycles ) ) {
        const match = cycles.find( ( cycle ) => cycle && cycle.cycleID === wanted );
        if ( match ) return match;
    }
    return fallbackCycle || null;
}

module.exports.pickCycleForRequest = pickCycleForRequest;
```
- [ ] **Run it — expect PASS:**
```bash
node --test packages/competence/test/insights-cycle-selector.test.js
```
Expected: `# pass 4` / `# fail 0`.
- [ ] **Add the module require** at the top of `competence-web-application.js`, beside the existing application requires (after `taskResolver` at `:17`):
```js
const resultsAnalytics = require( "#results-analytics" );
```
- [ ] **Wire the two gated branches** in `processDataRequest`, in the `else if` chain immediately before the final `else` (after `load-employee-detail` at `:223-225`):
```js
        } else if ( view === "load-insights-cycle" ) {
            return this.#loadInsightsCycle( session, options );
        } else if ( view === "load-report-coverage" ) {
            return this.#loadReportCoverage( session, options );
```
- [ ] **Add the two private handlers** next to the other `#load*` handlers (e.g. after `#loadInterviewSchedule`). Both are Supervisor-gated; both resolve the cycle via `resultsAnalytics.pickCycleForRequest` using `?cycleID` with the active-cycle fallback; `#loadReportCoverage` injects the org-root unit id so the whole-org roster is non-empty. **Contract note (getCycle rejection):** `dataManager.instance.getCycle` REJECTS with `E_APP_RESOURCE_NOT_FOUND` for an unknown cycleID (verified `data-manager.js:530,536`) — it never resolves null. These handlers therefore never call `getCycle` with an unverified id: they pass only ids drawn from `getAllCycles()` (via `pickCycleForRequest`), and the `if ( !cycle )` guard short-circuits before any analytics call. Component B's `resolve` likewise receives only verified ids from here:
```js
    /**
     * Loads the Insights → Cycle analytics screen shell: the resolved cycle (selected via `?cycleID`,
     * falling back to the active/current cycle) plus the candidate list for the cycle selector.
     * Supervisor-only (the leadership reports are supervisor-scoped).
     *
     * @method
     * @param {TiSession} session
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @private
     */
    #loadInsightsCycle( session, options ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const requestedCycleID = String( options?.query?.cycleID || "" ).trim();

            Promise.all( [
                dataManager.instance.getAllCycles(),
                this.#resolveCurrentCycle()
            ] ).then( ( [ cycles, currentCycle ] ) => {
                const cycle = resultsAnalytics.pickCycleForRequest( cycles || [], requestedCycleID, currentCycle );
                if ( !cycle ) {
                    return resolve( { cycle: null, cycles: [] } );
                }
                resolve( {
                    cycle: { id: cycle.cycleID, name: cycle.name, status: cycle.status },
                    cycles: ( cycles || [] ).map( ( c ) => ( { id: c.cycleID, name: c.name, status: c.status } ) )
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Returns the Coverage (R1) report payload for the requested cycle. Supervisor-only, org-wide.
     * Injects the organization root unit id into the filter so the whole-org roster is non-empty
     * (an empty/missing rootUnitID would yield a null org subtree → empty roster → 0/0 coverage).
     * The analytics service branches live-vs-snapshot internally.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @private
     */
    #loadReportCoverage( session, options ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );

            const requestedCycleID = String( options?.query?.cycleID || "" ).trim();
            const rootUnitID = organizationManager.instance.getOrganizationRootUnitID();

            Promise.all( [
                dataManager.instance.getAllCycles(),
                this.#resolveCurrentCycle()
            ] ).then( ( [ cycles, currentCycle ] ) => {
                const cycle = resultsAnalytics.pickCycleForRequest( cycles || [], requestedCycleID, currentCycle );
                if ( !cycle ) {
                    return resolve( { coverage: null, meta: null } );
                }
                const filter = { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: rootUnitID };
                return resultsAnalytics.instance.resolve( cycle.cycleID, filter, "coverage" ).then( ( report ) => {
                    resolve( report );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
```
- [ ] **Run the full competence test suite** to confirm nothing regressed:
```bash
npm test --workspace packages/competence
```
Expected: existing suites pass; `insights-cycle-selector.test.js` passes (`# pass 4`).
- [ ] Commit:
```bash
git add packages/competence/bin/competence-web-application.js \
        packages/competence/application/results-analytics.js \
        packages/competence/test/insights-cycle-selector.test.js
git commit -m "feat(competence): supervisor-gated insights-cycle and report-coverage endpoints with cycle selector and org-root filter (CA-F4)"
```

---

### Task D5: `frame-insights-cycle.html` markup (gauge + bars + cycle selector + pending grid)

Two `<figure>` chart hosts bound to `x-ti-chart` (Component A) with an `x-bind:aria-label` (mirroring the verified `x-bind:aria-label="getUserName()"` registered-method idiom), the cycle selector (`@change` → registered method), and a `.ti-data-grid` pending list. All expressions are CSP-legal: bare property paths (`coverageGaugeSpec`) or registered method paths (`getGaugeAriaLabel()`); no `?.`, no inline `Array`/`Object`/`Math`/ternary-with-call.

**Files**
- Modify: `packages/competence/bin/static/fragments/frame-insights-cycle.html` (replace the D1 placeholder)
- Test: none (markup; verified in D7)

Steps:

- [ ] Replace the placeholder file contents with the full screen:
```html
<div class="ti-page" x-data="insightsCycle">

    <div class="ti-page-head">
        <div>
            <h1 class="ti-page-title" x-text-label="interface.insights.cycle.title">Cycle analytics</h1>
            <p class="ti-page-sub" x-text="getCycleSubtitle()"></p>
        </div>
        <div class="ti-page-head-actions">
            <label class="ti-field-inline">
                <span x-text-label="interface.insights.cycle.select-label">Cycle</span>
                <select class="ti-select" @change="onCycleChange($event)">
                    <template x-for="c in cycles" x-bind:key="c.id">
                        <option x-bind:value="c.id" x-bind:selected="c.id === selectedCycleID" x-text="c.name"></option>
                    </template>
                </select>
            </label>
        </div>
    </div>

    <!-- Loading -->
    <template x-if="isLoading">
        <div class="ti-empty-state">
            <div class="ti-empty-state-title" x-text-label="interface.insights.cycle.loading">Loading coverage…</div>
        </div>
    </template>

    <!-- No cycle / no data -->
    <template x-if="!isLoading && !hasCoverage()">
        <div class="ti-empty-state">
            <div class="ti-empty-state-title" x-text-label="interface.insights.cycle.empty">No coverage data for this cycle.</div>
        </div>
    </template>

    <!-- Coverage -->
    <template x-if="!isLoading && hasCoverage()">
        <div class="ti-insights-grid">

            <section class="ti-card">
                <h2 class="ti-card-title" x-text-label="interface.insights.cycle.coverage-overall">Overall coverage</h2>
                <figure class="ti-chart" x-ti-chart="coverageGaugeSpec"
                        role="img" x-bind:aria-label="getGaugeAriaLabel()"></figure>
            </section>

            <section class="ti-card">
                <h2 class="ti-card-title" x-text-label="interface.insights.cycle.coverage-by-group">By group</h2>
                <figure class="ti-chart" x-ti-chart="coverageBarsSpec"
                        role="img" x-bind:aria-label="getBarsAriaLabel()"></figure>
            </section>

            <section class="ti-card ti-card-wide">
                <h2 class="ti-card-title" x-text-label="interface.insights.cycle.pending">Pending</h2>
                <div class="ti-data-grid">
                    <template x-for="row in pendingRows()" x-bind:key="row.employeeID">
                        <div class="ti-data-grid-row">
                            <span class="ti-data-grid-cell" x-text="row.name"></span>
                            <span class="ti-data-grid-cell" x-text="row.groupLabel"></span>
                            <span class="ti-status-pill"><span class="dot"></span><span x-text="row.status"></span></span>
                        </div>
                    </template>
                </div>
            </section>

        </div>
    </template>
</div>
```
- [ ] Commit:
```bash
git add packages/competence/bin/static/fragments/frame-insights-cycle.html
git commit -m "feat(competence): insights cycle frame with coverage gauge, bars, and pending grid (CA-F4)"
```

---

### Task D6: The `insightsCycle` Alpine component + pure spec builders

The CSP constraint is the crux: chart specs cannot be assembled in the template, so the component builds them in plain JS via **pure module-level functions** (regular JS — only Alpine *template expressions* are sandboxed). Ship the builders in ONE file that is BOTH Node-testable (`module.exports` guard) AND browser-loadable (classic `<script>` → the two function declarations become window globals). The builders consume the Coverage payload shape from §3 R1 / §4: `coverage.overall.{n,N,pct}` (gauge), `coverage.byGroup[]` (stacked bars), `coverage.pending[]` (grid). `meta.partial`/`meta.pctReporting` drive the provisional flag and the "% reporting" caveat.

**Files**
- Create: `packages/competence/bin/static/scripts/insights-cycle-specs.js` (pure, dual-publish — single source of truth)
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (`configureInsightsCycle` + `insightsOverview` stub; register at `:4256`)
- Modify: `packages/competence/bin/static/index.html` (load `insights-cycle-specs.js`)
- Create: `packages/competence/test/insights-cycle-specs.test.js`
- Test: `packages/competence/test/insights-cycle-specs.test.js`

Steps:

- [ ] **Create the pure spec-builder module** `packages/competence/bin/static/scripts/insights-cycle-specs.js`. The `if ( typeof module … )` guard is a no-op in the browser, leaving the two function declarations as window globals; in Node, `require` returns the two builders. Single source of truth — there is NO `application/` copy:
```js
"use strict";

/**
 * Builds the Coverage gauge TiChartSpec from a coverage report payload.
 *
 * @param {Object} coverage - `report.coverage` (carries `overall.{n,N,pct}`).
 * @param {Object} meta - `report.meta` (carries `mode`, `partial`, `pctReporting`).
 * @returns {Object} TiChartSpec of type "gauge".
 */
function buildCoverageGaugeSpec( coverage, meta ) {
    const overall = ( coverage && coverage.overall ) ? coverage.overall : { n: 0, N: 0, pct: 0 };
    const value = ( overall.N > 0 ) ? ( overall.n / overall.N ) : 0;
    const partial = !!( meta && meta.partial );
    let sublabel = String( overall.n ) + " / " + String( overall.N );
    if ( partial && meta && typeof meta.pctReporting === "number" ) {
        sublabel = sublabel + " · " + String( meta.pctReporting ) + "% reporting";
    }
    return {
        type: "gauge",
        data: { value: value, label: "Coverage", sublabel: sublabel },
        a11yLabel: "Coverage gauge: " + String( overall.n ) + " of " + String( overall.N ) + " complete",
        provisional: partial
    };
}

/**
 * Builds the per-group stacked-bars TiChartSpec from a coverage report payload.
 *
 * @param {Object} coverage - `report.coverage` (carries `byGroup[]`).
 * @param {Object} meta - `report.meta`.
 * @returns {Object} TiChartSpec of type "bars".
 */
function buildCoverageBarsSpec( coverage, meta ) {
    const groups = ( coverage && Array.isArray( coverage.byGroup ) ) ? coverage.byGroup : [];
    const rows = groups.map( function ( group ) {
        const byStatus = group.byStatus || {};
        const segments = [
            { key: "Closed", v: byStatus[ "Closed" ] || 0, tone: "success" },
            { key: "Ready", v: byStatus[ "Ready" ] || 0, tone: "success" },
            { key: "In Review", v: byStatus[ "In Review" ] || 0, tone: "warn" },
            { key: "Open", v: byStatus[ "Open" ] || 0, tone: "info" },
            { key: "Not started", v: group.notStarted || 0, tone: "" }
        ];
        return { id: String( group.groupKey || group.groupLabel || "" ), label: group.groupLabel || "", segments: segments };
    } );
    return {
        type: "bars",
        data: { rows: rows },
        options: { mode: "stacked" },
        a11yLabel: "Coverage by group: " + String( rows.length ) + " groups",
        provisional: !!( meta && meta.partial )
    };
}

if ( typeof module !== "undefined" && module.exports ) {
    module.exports = { buildCoverageGaugeSpec: buildCoverageGaugeSpec, buildCoverageBarsSpec: buildCoverageBarsSpec };
}
```
  (Status keys "Closed"/"Ready"/"In Review"/"Open" are the EvaluationStatus enum **values** with the space, never the keys — per the tools.enum gotcha. "Not started" is the synthetic roster-minus-evaluations label, not the NOT_STARTED enum.)
- [ ] **Write the failing test** `packages/competence/test/insights-cycle-specs.test.js`:
```js
"use strict";

const test = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildCoverageGaugeSpec, buildCoverageBarsSpec } = require( "../bin/static/scripts/insights-cycle-specs.js" );

const COVERAGE = {
    overall: { n: 40, N: 50, pct: 80 },
    byGroup: [
        { groupKey: "U1", groupLabel: "Engineering", N: 30, notStarted: 5,
          byStatus: { "Open": 4, "In Review": 6, "Ready": 5, "Closed": 10 } }
    ]
};

test( "gauge spec maps n/N to a 0..1 value and a fraction sublabel", () => {
    const spec = buildCoverageGaugeSpec( COVERAGE, { mode: "snapshot", partial: false } );
    assert.equal( spec.type, "gauge" );
    assert.equal( spec.data.value, 0.8 );
    assert.equal( spec.data.sublabel, "40 / 50" );
    assert.equal( spec.provisional, false );
} );

test( "gauge spec appends % reporting and flags provisional when partial", () => {
    const spec = buildCoverageGaugeSpec( COVERAGE, { mode: "live", partial: true, pctReporting: 72 } );
    assert.equal( spec.provisional, true );
    assert.match( spec.data.sublabel, /72% reporting/ );
} );

test( "gauge spec is safe on an empty payload", () => {
    const spec = buildCoverageGaugeSpec( {}, {} );
    assert.equal( spec.data.value, 0 );
    assert.equal( spec.data.sublabel, "0 / 0" );
} );

test( "bars spec emits one stacked row per group with five status segments incl. Not started", () => {
    const spec = buildCoverageBarsSpec( COVERAGE, { partial: false } );
    assert.equal( spec.type, "bars" );
    assert.equal( spec.options.mode, "stacked" );
    assert.equal( spec.data.rows.length, 1 );
    const segs = spec.data.rows[ 0 ].segments;
    assert.equal( segs.length, 5 );
    const notStarted = segs.find( ( s ) => s.key === "Not started" );
    assert.equal( notStarted.v, 5 );
    const inReview = segs.find( ( s ) => s.key === "In Review" );
    assert.equal( inReview.v, 6 );
} );
```
- [ ] **Run it — expect PASS** (the module is created above; if you author the test first it FAILs with `Cannot find module '../bin/static/scripts/insights-cycle-specs.js'`):
```bash
node --test packages/competence/test/insights-cycle-specs.test.js
```
Expected: `# pass 4` / `# fail 0`.
- [ ] **Add the Alpine component** `configureInsightsCycle` to `competence-user-interface.js`, placed next to `configureInterviewSchedule` (which ends just before `:1238`; insert after it). It loads both endpoints, stores the payload, and calls the global builders `buildCoverageGaugeSpec`/`buildCoverageBarsSpec` (exposed by the classic script). The init→`isInitialized`→load→`sendRequest`→`structuredClone` idiom mirrors the dashboard/interview-schedule components:
```js
const configureInsightsCycle = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        isLoading: true,
        selectedCycleID: "",
        cycle: null,
        cycles: [],
        coverage: null,
        meta: null,
        coverageGaugeSpec: { type: "gauge", data: { value: 0, label: "", sublabel: "" }, a11yLabel: "", provisional: false },
        coverageBarsSpec: { type: "bars", data: { rows: [] }, options: { mode: "stacked" }, a11yLabel: "", provisional: false },

        init() {
            const onInitialized = () => {
                this.selectedCycleID = tiToolbox.getUrlParam( "cycleID" ) || "";
                this.loadAll();
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

        loadAll() {
            this.isLoading = true;
            const q = this.selectedCycleID ? ( "?cycleID=" + encodeURIComponent( this.selectedCycleID ) ) : "";
            Promise.all( [
                tiApplication.sendRequest( "/app/load-insights-cycle" + q ),
                tiApplication.sendRequest( "/app/load-report-coverage" + q )
            ] ).then( ( [ shellResult, coverageResult ] ) => {
                const shell = ( shellResult?.data && typeof shellResult.data === "object" ) ? shellResult.data : {};
                const payload = ( coverageResult?.data && typeof coverageResult.data === "object" ) ? coverageResult.data : {};
                this.cycle = shell.cycle ? tiToolbox.structuredClone( shell.cycle ) : null;
                this.cycles = Array.isArray( shell.cycles ) ? tiToolbox.structuredClone( shell.cycles ) : [];
                if ( this.cycle && !this.selectedCycleID ) {
                    this.selectedCycleID = this.cycle.id;
                }
                this.coverage = payload.coverage ? tiToolbox.structuredClone( payload.coverage ) : null;
                this.meta = payload.meta ? tiToolbox.structuredClone( payload.meta ) : null;
                this.coverageGaugeSpec = buildCoverageGaugeSpec( this.coverage, this.meta );
                this.coverageBarsSpec = buildCoverageBarsSpec( this.coverage, this.meta );
                this.isLoading = false;
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }
                this.isLoading = false;
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 || error.exception?.httpCode === 403 ) {
                    tiApplication.openScreen( "dashboard" );
                }
            } );
        },

        onCycleChange( event ) {
            this.selectedCycleID = event && event.target ? event.target.value : "";
            this.loadAll();
        },

        hasCoverage() {
            return !!( this.coverage && this.coverage.overall );
        },

        pendingRows() {
            return ( this.coverage && Array.isArray( this.coverage.pending ) ) ? this.coverage.pending : [];
        },

        getCycleSubtitle() {
            if ( !this.cycle ) return "";
            const mode = ( this.meta && this.meta.mode === "live" )
                ? tiApplication.getLabel( "interface.insights.cycle.mode-live", "as of now" )
                : tiApplication.getLabel( "interface.insights.cycle.mode-snapshot", "final" );
            return ( this.cycle.name || "" ) + " · " + mode;
        },

        getGaugeAriaLabel() {
            return this.coverageGaugeSpec.a11yLabel;
        },

        getBarsAriaLabel() {
            return this.coverageBarsSpec.a11yLabel;
        }
    };
};
```
  (Confirm the exact `notify`/`formatException`/`getLabel`/`openScreen` method names against the dashboard component before pasting — `grep -n "formatException\|getLabel\|openScreen" packages/competence/bin/static/scripts/competence-user-interface.js` — and substitute the real names if they differ.)
- [ ] **Register both insights components** in the `alpine:init` block, after `competenceRoleFamilies` (`:4256`):
```js
    Alpine.data( "insightsOverview", () => ( {} ) );
    Alpine.data( "insightsCycle", configureInsightsCycle );
```
- [ ] **Run the test again — expect PASS:**
```bash
node --test packages/competence/test/insights-cycle-specs.test.js
```
Expected: `# pass 4` / `# fail 0`.
- [ ] **Load the pure builder script in `index.html`.** First **Read** `packages/competence/bin/static/index.html` to find the exact `<script … src="…/competence-user-interface.js">` tag and its nonce attribute, then insert the matching tag immediately **before** it so the builders are global by the time the component registers:
```html
    <script defer nonce="{ti-nonce}" src="/static/scripts/insights-cycle-specs.js"></script>
```
  (If competence is also served the framework's `index.html`, mirror the tag there — confirm with `grep -rln "competence-user-interface.js" packages/*/bin/static/index.html`.)
- [ ] **Run the full competence suite:**
```bash
npm test --workspace packages/competence
```
Expected: all green.
- [ ] Commit:
```bash
git add packages/competence/bin/static/scripts/insights-cycle-specs.js \
        packages/competence/bin/static/scripts/competence-user-interface.js \
        packages/competence/bin/static/index.html \
        packages/competence/test/insights-cycle-specs.test.js
git commit -m "feat(competence): insightsCycle Alpine component with pure coverage spec builders (CA-F4)"
```

---

### Task D7: MANUAL verification (live + snapshot, both themes, supervisor + non-zero roster)

> **Manual verification, not an automated test.** There is no DOM/jsdom harness; the `x-ti-chart` assembly and the Insights screen are confirmed by launching the app and looking. Use the project's **run** skill (or the ti-engine skill's documented launch path).

**Files**
- Test: none (manual)

Steps:

- [ ] Launch the app (invoke the `run` skill / ti-engine launch path), logged in / `ti-test-user` cookie switched to a **Supervisor** identity.
- [ ] **Sidebar gating:** confirm the **Insights** group shows with both **Insights** and **Cycle analytics** items (Cycle analytics shows because Supervisor=3). Switch to a plain **Employee** identity → Insights group hidden entirely. Switch to a **Manager** (role 2, non-supervisor) → **Insights** shows but **Cycle analytics** hidden (nested `hasRole(3)`).
- [ ] **Live Coverage (ACTIVE cycle):** as Supervisor, open **Insights → Cycle analytics**. Confirm URL is `/app/insights-cycle`, the sidebar highlights the Insights item, and the screen renders the **gauge**, **per-group stacked bars**, and **pending grid**. Confirm the subtitle shows the live caveat ("as of now") and, if the cycle is partial, the gauge sublabel shows "…% reporting" and the gauge renders as provisional.
- [ ] **Non-zero roster check (org-root blocker regression guard):** confirm the gauge denominator `N` and the bars' total (incl. the "Not started" segment) are **greater than the number of evaluations** — i.e. the whole-org roster resolved through the injected `rootUnitID` (Task D4a). In the network panel, inspect the `load-report-coverage` response and assert `coverage.overall.N > 0` and at least one `byGroup[].notStarted > 0` when the cycle is incomplete. A 0/0 gauge here means the org-root id did not reach the filter — re-check D4a + D4.
- [ ] **Both themes (live):** toggle the theme (`daylight` ⇄ `glass`). Confirm both charts re-color via CSS vars with zero re-render, remain legible, and chart backgrounds stay transparent so the glass blur shows through.
- [ ] **Snapshot Coverage (CLOSED cycle):** use the cycle `<select>` to pick a **CLOSED** cycle (or append `?cycleID=<closedCycleID>`). Confirm the same gauge + bars + pending render, the subtitle shows the final/"snapshot" caveat (no "% reporting"), `meta.mode === "snapshot"`, and the response is near-instant (snapshot-sourced) with counts matching the snapshot's cohort. Toggle both themes again.
- [ ] **Access (negative):** hit `/app/load-report-coverage` and `/app/load-insights-cycle` directly as a non-Supervisor (Manager and Employee) and confirm **403** (the `#requireRole(SUPERVISOR)` gate), proving the UI gate is backed server-side.
- [ ] Record the outcome in `packages/competence/design/statistics-and-results.md` under the Implementation log as a dated CA-F4 entry; do not write a separate report file.

---

## Notes / open coordination points for the executor

- **Coverage payload shape contract** (consumed by D5/D6 builders), fixed by §3 R1 / §4: `report.coverage.overall.{n,N,pct}`, `report.coverage.byGroup[].{groupKey,groupLabel,N,byStatus,notStarted,pct}`, `report.coverage.pending[].{employeeID,name,groupLabel,status}`, `report.meta.{mode,partial,pctReporting}`. If Component B's `getCoverageReport` field names differ at integration, reconcile **the builder** (`buildCoverageGaugeSpec`/`buildCoverageBarsSpec`) to B's keys and update `insights-cycle-specs.test.js` fixtures — the builder is the single seam.
- **`x-ti-chart` directive + `gauge`/`bars` data contracts are Component A.** D5 only *hosts* them. If A's data contract differs from `{value,label,sublabel}` / `{rows:[{label,segments:[{key,v,tone}]}]}`, adjust the two builders accordingly. **Gauge sublabel coupling:** D6 emits `data.sublabel` (the "% reporting"/fraction caveat). Confirm Component A's `renderGauge` actually *renders* `data.sublabel` (visual + sr-table) — if it does not, that is a Component-A fix (render a second `<text>` + sr-row), not a D change; flag it at integration so the provisional/reporting context is not silently dropped.
- **Org-root dependency (D4a ↔ Component B `resolveScopeFilter`).** D4a adds `getOrganizationRootUnitID()` and D4 injects `filter.rootUnitID`. Component B's `resolveScopeFilter`/`resolve` must honor `filter.rootUnitID` for the Supervisor org-wide branch (and Component C's `persistResultsSnapshot` must root its whole-org subtree at the same id) so live and snapshot agree. If B already resolves the org root internally, D4 may pass `rootUnitID` redundantly (harmless) — but the D7 non-zero-roster check still applies as the integration guard.
- **Localization keys** (`interface.navigation.insights*`, `interface.insights.cycle.*`, `interface.insights.overview.*`) must be added to the competence localization bundle; bundle them into the D3/D5/D6 commits if D7 surfaces missing labels. `x-text-label` falls back to the element's existing text, so absence degrades gracefully and is not a blocker.

**Files referenced (all absolute):**
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\bin\competence-web-application.js` (requires `:9-18`; `#resolveCurrentCycle` `:308`; dispatch `:201-228`; query accessor idiom `:204/:219`; `sidebarNavMapping` `:151-166`; `#requireRole` `:2980`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\bin\static\fragments\components\component-sidebar.html` (Manage `:67-87`, Administration `:89/:92`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\bin\static\scripts\competence-user-interface.js` (`configureInterviewSchedule` `:1044`; `Alpine.data` registrations end `:4256`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\application\configuration-loader.js` (roleCode `:33-39`; SUPERVISOR=3)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\application\data-manager.js` (`getCycle:521` REJECTS on not-found `:530/:536`; `getAllCycles:548`; `getActiveCycle:573`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\application\organization-manager.js` (`getOrganizationUnitSubtree:393-400` null-on-empty; new `getOrganizationRootUnitID`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\bin\config\config.organization-structure.json` (org root id `"1"`, `parent:null` `:2-9`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\web-framework\bin\static\scripts\ti-framework.js` (`getUrlParam:194`; `hasRole:1097`; `text-label` directive `:1324`)
- New: `frame-insights-cycle.html`, `frame-insights-overview.html`, `insights-cycle-specs.js`
- New tests: `insights-cycle-selector.test.js`, `insights-cycle-specs.test.js`, `organization-root.test.js`

---

## Done when

- [ ] `getOrganizationRootUnitID()` exists, returns `"1"` for the bundled org structure, and is unit-tested (`organization-root.test.js` green).
- [ ] Both fragments are registered and route without 404; `sidebarNavMapping` maps both to `insights`.
- [ ] The Insights sidebar group renders, gated Manager+Supervisor (group) and Supervisor-only (Cycle analytics item), verified across Employee/Manager/Supervisor identities.
- [ ] `load-insights-cycle` and `load-report-coverage` are Supervisor-gated (403 for Manager/Employee), resolve the cycle via `pickCycleForRequest` (`?cycleID` + active fallback), and `load-report-coverage` injects the org-root `rootUnitID` into the analytics filter.
- [ ] `pickCycleForRequest` and `buildCoverageGaugeSpec`/`buildCoverageBarsSpec` are pure and unit-tested; `insights-cycle-selector.test.js` (4 pass) and `insights-cycle-specs.test.js` (4 pass) are green, and `npm test --workspace packages/competence` is all green.
- [ ] The `insightsCycle` Alpine component loads both endpoints, builds the specs, and the screen renders the Coverage gauge + per-group bars + pending grid.
- [ ] **Manual:** Coverage renders live (ACTIVE) and from snapshot (CLOSED), in both `daylight` and `glass` themes, with a **non-zero whole-org roster** (`overall.N > 0`, `notStarted > 0` on an incomplete cycle) — confirming the org-root fix landed end-to-end.
