# Competence "Statistics & Results" — Unified Design

## Meta

- **Status:** Approved (2026-06-21) — not started
- **Date:** 2026-06-21 (brainstormed, designed, approved)
- **Packages:** `competence` (reports, aggregation service, snapshots, Insights IA) + `web-framework` (the reusable `ti-chart-*` SVG primitive layer)
- **Scope:** The full Statistics & Results capability — eight themeable SVG chart primitives, an on-demand cohort-aggregation service with immutable per-cycle snapshots, and four report pillars (Leadership · Manager · Individual) plus Cross-cycle trends. Delivered across phases 0–4; this document is the design for all of them.
- **Owner:** Boris Kostadinov
- **Provenance:** Brainstormed from the 2025 pilot deck ("Модел на компетенция 2025") and the anonymized result set, then designed and adversarially verified against the codebase by a multi-agent pass (0 blockers; 3 majors folded in). Related: [[project-ui-ux-overhaul]], [[project-tasks-system]].

---

## 1. Overview & Goals

The competence package today has exactly one reporting surface — the dashboard's stat cards and `--pct` CSS progress bars. There are **no charts anywhere** in the monorepo. This feature adds a full **Statistics & Results** capability: a reusable SVG chart layer in the web-framework, an on-demand cohort-aggregation service with immutable per-cycle snapshots, and four report pillars plus cross-cycle trends — all on one foundation.

**Goals**

- **One chart layer, all apps.** Hand-rolled, themeable, CSP-safe `ti-chart-*` SVG primitives in `packages/web-framework`, app-agnostic, theming to both `daylight` and `black-glass` with zero per-chart overrides.
- **One aggregation service, one data contract.** A single `application/results-analytics.js` singleton produces every report's chart-ready payload from one in-memory pass; the same shapes render whether a cycle is **live** (ACTIVE, "as of now / % reporting" caveat) or **historical** (CLOSED, from an immutable snapshot).
- **Four pillars + cross-cycle on the same substrate.** Leadership/cycle analytics (the 6 pilot-deck reports), Manager/team analytics (the same reports re-scoped + a grader-calibration view), Individual results (the enhanced READY view + "My results"), and Cross-cycle trends — all read the same contracts.
- **Privacy by construction.** Existing access rules reused verbatim; individual peer grades **never enter a chart payload** — only the team cumulative does.
- **In-app only.** No PDF/deck export in this scope.

**Naming/terminology corrections locked across all sections:**
- The black-glass theme activates via **`data-theme="glass"`**, not `"black-glass"` (confirm against `ti-theme-black-glass.css`). "black-glass" is a human name; every CSS/JS selector uses `glass`.
- The aggregation service file is **`packages/competence/application/results-analytics.js`** (`#results-analytics` alias) — one name, one alias.
- The shared live/partial caveat flag is **`provisional`** at the primitive level; `meta.mode`/`meta.partial` are the screen-level fields — both defined once in §4.

---

## 2. Architecture — Foundation

Three contract-locked pieces: **(A)** chart primitives, **(B)** aggregation service + snapshot store, **(C)** IA/routing/access shell. The seam between A and B is the **chart data contract**: B emits exactly the shapes A consumes, so a report handler is a pure transform with no glue.

### 2.A Chart primitives (`ti-chart-*`)

**Rendering strategy (governs every primitive).** Three constraints, all verified:
1. The app loads the Alpine **CSP build** (`alpinejs-csp.min.js`, both `index.html`s). CSP templates may contain only dotted property paths and registered methods — no `Array`/`Object`/`Math`/ternary-with-calls/optional-chaining. (`hasRole()` exists precisely because `roles.indexOf` can't be inlined — `ti-framework.js:1090-1103`.)
2. **Helmet CSP `style-src` is `['self','https:']` with NO `'unsafe-inline'` and NO nonce** (`web-handlers.js:567`); the nonce is on `styleSrcElem` only (`:557-560`, governing `<style>`/`<link>` elements, not the `style=` attribute parser). So inline `style=""` attributes are blocked. The only sanctioned computed-style path is the **custom-property setter** `element.style.setProperty('--var', …)` (the `{ "--pct": pct+"%" }` idiom, `competence-user-interface.js:1996-2002`).
3. Inline SVG already renders in fragments (`frame-dashboard.html:43-46`); SVG is allowed — only inline `style`/`<script>` are blocked. Themes flip via `document.documentElement.dataset.theme ∈ {daylight, glass}` (`ti-framework.js:1125-1142`).

**Chosen approach:** a single vanilla-JS module **`packages/web-framework/bin/static/scripts/ti-charts.js`**, surfaced as **one Alpine CSP directive `x-ti-chart`**, registered exactly like the existing `x-text-label` directive (`configureDirectiveTextLabel` at `ti-framework.js:1181-1206`, registered at `:1324`). All scale/`Math.sqrt`/path math lives in plain JS (outside the template sandbox); the directive builds SVG via `createElementNS` + `setAttribute`. Colors come from CSS classes/variables, so theming is pure CSS. Rejected: pure-Alpine SVG (can't do the math in CSP templates) and server-rendered SVG strings (puts generic geometry in the app, can't re-theme on the client `dataset.theme` toggle).

**Hard CSP rule for primitive implementation (applies to ALL dynamic visual properties, not just color).** Every per-element visual is set as an **SVG presentation attribute via `setAttribute`** (geometry: `x`, `cx`, `d`, `points`, `width`; *and* stroke/opacity/transform: `setAttribute('stroke-dasharray','4 3')`, `setAttribute('stroke-dashoffset', n)`, `setAttribute('opacity', …)`, `setAttribute('transform', …)`) **or toggled via a CSS class**. `element.style.*` is **forbidden** — the single exception is the sanctioned `element.style.setProperty('--var', …)` custom-property idiom (`competence-user-interface.js:1996-2002`). In particular the **provisional dashed cap/tail** uses `stroke-dasharray` as a presentation attribute or the `.ti-chart-provisional` class — never `el.style.strokeDasharray` (would trip `style-src`).

**Event wiring (CSP).** `script-src` carries no `'unsafe-inline'` (`web-handlers.js:551`), so **all event wiring — pointer, `keydown` Enter/Space, focus — is attached via `element.addEventListener` inside `ti-charts.js`; never inline `on*=` attributes.** The host binds only through Alpine's CSP-legal `@ti-chart:select="onChartSelect"` (an `x-on` to a registered method path, like the verified `x-bind:aria-label="getUserName()"` at `frame-dashboard.html:48`).

**Directive contract (one directive, all primitives):**
```html
<figure class="ti-chart" x-ti-chart="coverageSpec"
        role="img" x-bind:aria-label="coverageSpec.a11yLabel"></figure>
```
The expression is a bare reactive property path (CSP-legal). Universal spec envelope:
```js
/** @typedef {Object} TiChartSpec
 *  @property {"gauge"|"bars"|"heatmap"|"scatter"|"box"|"radar"|"stat"|"line"} type
 *  @property {Object}  data         // per-primitive payload (the aggregation output)
 *  @property {Object}  [options]    // domains, sizing, labels, formatting
 *  @property {string}  a11yLabel    // role=img label (also injected as <title>)
 *  @property {string}  [a11yDesc]   // injected as <desc>
 *  @property {boolean} [provisional]// draws the "as of now / % reporting" hatch for ACTIVE cycles
 */
```
SVG always uses `viewBox` + `preserveAspectRatio` (fluid, container-sized); tabular numbers via the `font-variant-numeric:tabular-nums` class.

**Shared CSS contract (appended to `ti-framework.css`),** routing semantic + grade tokens (which flip in `ti-theme-daylight.css` / `ti-theme-black-glass.css`):
```css
.ti-chart { --c-axis:var(--border-strong); --c-grid:var(--grid-line);
            --c-ink:var(--fg-secondary); --c-ink-strong:var(--fg-primary);
            --c-series-1:var(--accent); --c-series-2:var(--info); --c-series-3:var(--success);
            --c-grade-s:var(--grade-S); --c-grade-r:var(--grade-R);
            --c-grade-u:var(--grade-U); --c-grade-n:var(--grade-N); }
.ti-chart svg { display:block; width:100%; height:auto; overflow:visible; }
.ti-chart-provisional { stroke-dasharray:4 3; opacity:.5; }   /* class form; or set as presentation attrs */
```
Charts keep transparent backgrounds so the black-glass panel `backdrop-filter` blur shows through.

**Heatmap fills — a SEQUENTIAL ramp needs new per-theme tokens (NOT "free" from grade tokens).** The four categorical grade hues (green/blue/amber/grey) do **not** form a clean monochromatic ramp, so a sequential heatmap requires five dedicated stops. Add `--chart-seq-1 … --chart-seq-5` to **both** themes (light→dark in daylight, dark→light in glass), and map quantile buckets to classes `cell-q1…cell-q5 → var(--chart-seq-1…5)`. The **diverging gap-mode** heatmap is the exception: it reuses the existing `--grade-N … --grade-S` tokens as a categorical/diverging scale (negative gap → N-side, positive → S-side), which *does* inherit from both themes for free. Each mode states which token family it uses; no chart claims "inherits for free" for the sequential case.

**The eight primitives** (geometry/scale math always in `ti-charts.js`):

| # | Primitive | Used by | Data contract (essential keys) |
|---|---|---|---|
| 1 | `ti-chart-gauge` | Coverage (R1); any % KPI; individual hero | `{ value:0..1, label, sublabel, segments?, bands?[{to,tone,label}], rows?[{id,name,value,n,total,tone?}] }` |
| 2 | `ti-chart-bars` | Drivers (R6), status breakdowns, calibration | `{ rows:[{id,label, values:[{key,v}] | segments:[{key,v,tone}]}] }`, `options.mode:"grouped"|"stacked"|"diverging"` |
| 3 | `ti-chart-heatmap` | Competence heatmap (R4) | `{ rows:[{id,label}], cols:[{id,label}], cells:[{r,c,v,n,expected?,delta?,suppressed?}] }`, `options.scale:"sequential"|"diverging"` |
| 4 | `ti-chart-scatter` | Alignment quadrant (R3) | `{ points:[{id,x,y,z?,r?,tone?,label?}], diagonal, quadrants[] }`, `options.bubble:"z"`, `options.anonymize` |
| 5 | `ti-chart-box` | Level correlation (R5) | `{ groups:[{id,label,min,q1,median,q3,max,n,outliers?,expected?,mean?}], reference?[{v,label}] }` |
| 6 | `ti-chart-radar` | Individual + team profile | `{ axes:[{id,label,max}], series:[{key,values:{E1:..},tone,style?}] }` |
| 7 | `ti-chart-stat` | KPI tiles (all pillars) | `{ value, label, sub, delta?:{v,tone,dir}, trend?, pct?, tone? }` — HTML+SVG hybrid; generalizes `.competence-stat-card` |
| 8 | `ti-chart-line` | Cross-cycle trends; sparklines | `{ x:[{id,label}], series:[{key,points:[{x,y,provisional?}],tone}], band?[{x,lo,hi}], markers?[{x,kind,label}] }`, `options.mode:"line"|"spark"` |

**Cross-cutting primitive behavior:**
- **Provisional is one visual language:** gauge → dashed value-arc cap; bars → hatched/dashed tail; scatter → dimmed border; line → dashed trailing segment. All via presentation attributes or `.ti-chart-provisional`. The `% reporting` number rides in `data.sublabel`/tooltips.
- **Interactivity, three CSP-safe tiers:** (1) CSS `:hover` + native `<title>` tooltips; (2) module-attached `addEventListener` dispatching `new CustomEvent("ti-chart:select",{detail,bubbles:true})`; (3) host wiring via `@ti-chart:select="onChartSelect"`. No inline handlers ever.
- **Privacy affordance:** `scatter`/`box` carry `options.anonymize` — strips `label`/`id` from tooltips and disables drill. Individual peer grades never become `points` (enforced upstream in §5).
- **A11y:** every chart is `<svg role="img">` with `<title>`/`<desc>` plus a visually-hidden `<table class="ti-sr-only">` series mirror (HTML siblings beside the `<svg>` inside the `<figure>`); interactive marks are `tabindex="0"` + `role="button"` with Enter/Space handlers, all attached via `addEventListener` in the module (never inline `on*`).
- **Re-theme:** because all colors are CSS-class/var-driven, charts re-theme on a `dataset.theme` change with **zero JS and no re-render**. A `theme-changed` `CustomEvent` listener is a **narrow optional fallback** needed only if a chart bakes resolved colors into `<defs>` patterns/gradients; the designed charts avoid that, so the listener can be dropped. Adding the dispatch to `toggleTheme()` is a **new framework edit** (see §6 / files-touched), not existing behavior.

**Load/registration:** `ti-charts.js` loaded `defer` with a CSP nonce next to `alpinejs-csp.min.js` in both `index.html`s; CSS appended to `ti-framework.css`; directive registered at `ti-framework.js:1324`. No third-party dependency.

### 2.B Aggregation service + snapshot store

**New singleton `packages/competence/application/results-analytics.js`** (`#results-analytics`), mirroring the frozen-singleton pattern of the other three application modules (`module.exports.instance = Object.freeze(new ResultsAnalytics())`, cf. `data-manager.js:1062-1063`). Consumes `#data-manager`, `#competence-framework`, `#organization-manager`, `#configuration-loader` read-only. **Pure compute + snapshot persistence** — zero HTTP, zero session/role knowledge. Kept separate from `competence-framework.js` (per-evaluation, mutating) vs analytics (cross-evaluation cohort math). Dependency direction **analytics → framework**, never the reverse.

**One fetch, one pass.** The only bulk reader is `fetchEvaluations(employeeID?, filterClosed=false)` (`data-manager.js:205`); with `null` it `JSON.GET $` the whole evaluations tree (`:215`) and flattens in JS. There is **no `fetchEvaluationsByCycle`, no DB aggregation, no cross-cycle query.** Every request builds **one normalized, privacy-safe, immutable `CohortRow[]` frame** via `#buildCohortFrame(cycleID, filter)`, filtering `evaluation.cycleID===cycleID` in memory; all six reports read that frame. `computeAllReports(frame)` produces every report from one fetch (used by single screens and the snapshot builder).

**DELETED exclusion.** `fetchEvaluations` already strips the `DELETED` value (`data-manager.js:209`, `:221/:227`). Any **snapshot-recompute branch that reads raw closed evals must replicate that exclusion explicitly**, since it bypasses the helper's default filter for the no-employeeID path only at `:227` (DELETED is always in `statusFilter`).

**CohortRow** (per evaluation, enriched, privacy-reduced):
```js
{ evaluationID, employeeID, status,            // status = enum VALUE ("Open"|"In Review"|"Ready"|"Closed")
  roleFamily, specialization, stageLevel, level, organizationUnitID, interviewDate,
  isScored, finalScore, finalInterpretation,   // "T1".."T5"
  categoryScores:{ E:{score,interpretation}, I:{…}, C:{…} },
  competencies:{ [code]:{ self, manager, team, subcategory, category, relevancy } }, // team = cumulative ONLY
  avgGrade:{ self, manager, team } }
```
Construction rules (each grounded):
- **Status** compared against `configurationLoader.evaluationStatus.OPEN` etc. — the enum **VALUES** ("Open", "In Review" *with the space*), never the keys (`tools.enum` gotcha, `configuration-loader.js:176-184`). The enum has six members: `NOT_STARTED("Not Started")`, `OPEN`, `IN_REVIEW`, `READY`, `CLOSED`, `DELETED`. **Only the four "live" values** `Open|In Review|Ready|Closed` ever appear on a real evaluation (`NOT_STARTED` is defined but **never assigned** in code — only referenced in a comment at `competence-web-application.js:2308`; `DELETED` is excluded from the frame). The `byStatus` breakdown renders exactly those four.
- **Self grade key.** The raw self grade lives under `grades[code].employee`, **not** `.self` (`EvaluationGradeEntry = {employee, manager, team}`, `data-objects.types.js:146-150`; the framework reads `gradeEntry.employee` at `competence-framework.js:467`). The frame maps `grades[code].employee → competencies[code].self`. (One-line guard against an off-by-key bug.)
- **Numeric grades** via the framework's `gradeWeights` (S=1.3,R=1.0,U=0.6,N=0.0, `competence-framework.js:17-22`); empty `""` → `null` (ungraded, excluded from means — never 0).
- **Team** populated **exclusively** from `grades[code].team.cumulative`; `team.individual[]` is **never** copied into the frame — the structural peer-anonymity guarantee.
- **Relevancy** read from the **evaluation's own `snapshot[]`** keyed by `evaluation.stageLevel` (`entry.relevancy?.[stageLevel] || 0`, `competence-framework.js:464`), honoring snapshot isolation — never the live dictionary. This is what makes closed/historical cycles correct.
- **Scores** read from persisted `evaluation.scores`/`finalScore`; **never re-run** `calculateFinalEvaluationScores` for completed evals. Unscored ACTIVE-cycle evals are `isScored:false` (counted in Coverage denominators, excluded from score-based reports).
- **Org unit** via `organizationManager.resolveOrganizationUnitIDForEmployee` (`:289`, O(1)).

**Critical resolved finding — no E/I/C category weights exist.** `finalScore.score` is the **unweighted arithmetic mean** of the per-category scores (`competence-framework.js:497-504`: sum then `÷ scoredCategoriesCount`). The only weights are `evaluationWeights` (self 0.2 / team 0.3 / manager 0.5) blending sources *within* a category (`:481-483`), and per-competency `relevancy`. The historical E45/I30/C25 weighting is **superseded**; the "configured weighting" baseline for R6 is the **relevancy archetype curve**, not category weights.

**Live vs snapshot resolver** — every public method funnels through:
```
#resolve(cycleID, filter, reportKey):
  cycle = getCycle(cycleID)
  if cycle.status === "CLOSED":
     snap = getResultsSnapshot(cycleID)
     if snap covers this filter (whole-org / pre-expanded grouping): return projectFromSnapshot(...)  // mode:"snapshot"
     else: recompute from the (still-present) closed evals, replicating the DELETED filter   // mode:"snapshot"
  frame = #buildCohortFrame(cycleID, filter)
  return compute<reportKey>(frame), mode: cycle.status==="ACTIVE" ? "live" : "snapshot"
```
Both ACTIVE and CLOSED render the **same chart contracts**; only `meta.mode` and the `partial`/`pctReporting` caveat differ. CLOSED is always `partial:false`.

**Snapshot store.** New eighth Redis JSON key alongside the seven in `data-manager.js:15-21`:
```js
const cacheEntryKeyResultsSnapshots = "ti:competence:data:results-snapshots"; // { [cycleID]: ResultsSnapshot }
```
Seed `{}` in `initialize()` (beside `:60-66`); add **two thin accessors to `data-manager.js`** so analytics never touches `cache` directly: `saveResultsSnapshot(snapshot)` (`editJSON` merge, same idiom as `saveEvaluation` `:296`) and `getResultsSnapshot(cycleID)` / `getAllResultsSnapshots()` (sorted by `chronoKey`, §6).

**Snapshot write seam (verified).** `closeCycle` (`competence-framework.js:260-266`) returns `updateCycleStatus`, which sets `actualCloseDate = todayDate` (`data-manager.js:602`); the web handler `#closeCycle` resolves with the updated cycle at `competence-web-application.js:1965`. So `persistResultsSnapshot(cycleID)` runs **inside that `.then`** and **must re-read the cycle via `getCycle(cycleID)`** (or receive the resolved cycle object) so `actualCloseDate` is populated — the input cycle snapshot that entered `closeCycle` predates the date write. Snapshot is a post-close step, not embedded in the framework (keeps dependency direction clean).

### 2.C IA / routing / access shell

Routing contract (verified): GET `/app/:view` content-negotiates in `web-handlers.js:603-646` — `text/html` → fragment registry (`addFragment`/`assembleHtmlView`), `application/json` → `processDataRequest(session,view,{query,params,…})`. POST `/app/:service` → `processServiceRequest`. The active-sidebar highlight is data-driven via `sidebarNavMapping` (`competence-web-application.js:151-166`) read by the framework sidebar (`ti-framework.js:543-570`) — **every new fragment must add a mapping entry or it never highlights.**

**New "Insights" sidebar group** in the Manage area, a sibling block between Manage (`component-sidebar.html:63-87`) and Administration (`:89-103`), gated `x-show="$store.tiApplication.hasRole(2) || $store.tiApplication.hasRole(3)"` (Manager=2, Supervisor=3; `configuration-loader.js:34-36`). Use **`x-show`, not `x-if`** (HTMX wires `hx-get` once at load). Items:
- **Insights overview** (`insights-overview`) — Manager + Supervisor landing.
- **Cycle analytics** (`insights-cycle`) — the 6 leadership reports; nested `x-show="hasRole(3)"` (supervisor-only).
- **Team analytics** (`insights-team`) — Manager (own subtree) + Supervisor.

**Individual results live in Workspace, not Insights** (locked): enhanced `frame-competence-evaluation.html` READY view + a new **"My results"** Workspace button deep-linking the same fragment (`?view=results`), gated to EMPLOYEE. Its data rides a separate `load-my-results` view because `load-evaluation` hard-rejects CLOSED evals (`:824-826`).

**Cross-cycle trends** are a sub-view (cycle-comparison toggle) inside the Insights screens, not a top-level item — matching "design now, build later."

---

## 3. Report Catalog

All six leadership reports are produced by `results-analytics.js`, cycle-scoped, `(cycleID, filter)` signature, returning a chart contract + the shared `meta` envelope (§4). **Manager/team analytics is the same six reports with a subtree cohort filter** (§5) plus one new report (Calibration). **Filters** (`CohortFilter`, §4): `organizationUnitID`, `roleFamily`, `specialization`, `stageLevel`, `level`, `source`, `groupBy`, `allowedEmployeeIDs`.

### R1 — Coverage *(deck slide 16)*
- **Audience:** Supervisor (org-wide); Manager (subtree).
- **Source + fn:** `getCoverageReport(cycleID, filter)`. Denominator N = in-scope roster. The one report needing the full roster builds it by **recursively flattening the org subtree**: `getOrganizationUnitSubtree(rootUnitID)` returns a **nested tree node** `{id,type,name,employees:[], children:[...]}` whose `.employees` are only that unit's **direct** members (`organization-manager.js:393`, `#buildUnitTree` at `:413`, `:459-463`); descendants live under `.children`. So the roster = walk `.children` recursively, concatenating each node's `.employees`. There is no flat all-employees accessor. The **manager's `rootUnitID`** is derived from `resolveOrganizationUnitIDForEmployee(session.user.employeeID)` (`:289`) — it is not a session field; the **supervisor's org-wide** coverage uses the org root unit.
- **Status breakdown.** Real evaluations carry one of the four live values `Open|In Review|Ready|Closed` (front-end compares use the VALUE strings, *including the space* in "In Review"). `DELETED` is excluded. **"Not started"** is a **derived roster-minus-evaluations gap** (in-scope employees with no evaluation row) — it is *not* the `NOT_STARTED` enum member (which never appears on an evaluation).
- **Chart:** `ti-chart-gauge` (overall completed %) + `ti-chart-bars` stacked (per-group status segments + Not-started gap) + a `.ti-data-grid` pending list.
- **Filters:** `groupBy` org-unit **and** role-family (segmented toggle); stage-level narrows roster.
- **Drill:** group bar → filter page to group; status segment → expand pending list filtered to that status. Pending names follow §5 (supervisor org-wide; manager within subtree).
- **Enhancement:** live "% reporting"; group by org unit AND role-family; break down by the four real statuses; list who is pending. *Fully available today.*
```js
coverage:{ overall:{n,N,pct, byStatus, notStarted}, byGroup:[{groupType,groupKey,groupLabel,N,byStatus,notStarted,pct}],
           pending:[{evaluationID|null,employeeID,name|null,groupLabel,status|"Not started"}] }
```

### R2 — Time distribution *(deck slide 17)*
- **Audience:** Supervisor; Manager (per-manager view).
- **Source + fn:** `getTimeDistributionReport(cycleID, filter)`. `interviewDate` is **set on slot booking** and **cleared on cancel** — authoritative behavior at `competence-web-application.js:1390` (`targetEvaluation.interviewDate = targetSlot.date`) and `:1443`. **Note: the typedef doc comment at `data-objects.types.js:197` ("Date when the evaluation interview took place") is stale/misleading and should be corrected** — the field means *scheduled*, not *held*. **There is no "held" flag.** "Held" is a labeled **derived proxy**: `interviewDate ≤ today AND status ∈ {Ready,Closed}`. "Planned" cross-references `fetchAllCalendarSlots(cycleID)` (`data-manager.js:343`) `status==="booked"`. Per-manager buckets by `evaluation.managerID`.
- **Chart:** `ti-chart-bars` grouped (month × {planned, held}); per-manager via selector/small-multiples. **The "held" series is labeled "finalized (proxy for held)" in the legend and a11y text** so its meaning is visible (an interview held while the eval is still In Review reads as not-held; a rescheduled Ready eval reads as held).
- **Filters:** org/role-family/stage-level narrow before bucketing; manager selector.
- **Drill:** month column → evaluations that month; manager → monthly breakdown.
- **Enhancement:** planned vs held (proxy); per manager; an explicit **`unscheduledReady`** actionable bucket (Ready evals with no `interviewDate`). *Recommended follow-up (§7): an explicit `interviewHeldAt` flag for exact "held".*

### R3 — Alignment gap quadrant *(deck slide 18)*
- **Audience:** Supervisor; Manager (drill gated to subtree).
- **Source + fn:** `getAlignmentReport(cycleID, filter)` + `getAlignmentForEmployee(cycleID, employeeID)` for drill. Per *reported* evaluation, relevancy-weighted per-source means kept **separate** (scoring collapses them via `evaluationWeights`; here we keep self/manager/team apart): `x=avgManager, y=avgSelf, z=avgTeam`. Quadrant by midpoint split (default the R≈1.0 grade-weight midpoint — see §7): self-high/manager-low = hidden-talent, self-low/manager-high = blind-spot, etc.
- **Chart:** `ti-chart-scatter` with diagonal + quadrant tints; team as bubble `z` (`options.bubble:"z"`) or secondary view.
- **Filters:** all globals; category toggle (overall vs `byCategory[E|I|C]`); source selector.
- **Drill:** dot → person panel (self/manager/team per subcategory, largest gaps = "blind spots"). Drill keys raw competency `code` **within the cycle** (safe — snapshot is self-describing); gated by `isSuperiorManagerOfEmployee` before returning identity.
- **Enhancement:** TEAM as third source; per-category view; filters; drill to person and per-competency blind spots. *Fully available today.*
```js
alignment:{ points:[{evaluationID,employeeRef,roleFamily,organizationUnitID,
                     x,y,t, quadrant, gap}], quadrantCounts:{…}, diagonal:true }
```

### R4 — Competence heatmap *(deck slide 19)*
- **Audience:** Supervisor; Manager (subtree).
- **Source + fn:** `getCompetenceHeatmapReport(cycleID, filter)` + `getHeatmapSubcategoryDetail(...)`. Per `(subcategory, groupKey)` running `{sum,count}` of the selected `source` grade (relevancy-weighted to match scoring). `expected` = cohort-mean configured relevancy expectation for that subcategory at the rows' stage-levels (from `snapshot[].relevancy`); `gap = avg − expected`.
- **Chart:** `ti-chart-heatmap`. **Two render modes with explicit token families:** the default **value view** is `options.scale:"sequential"` using `--chart-seq-1…5` (the new per-theme ramp tokens, §2.A — *not* the categorical grade hues); the optional **gap view** is `options.scale:"diverging"` reusing `--grade-N…--grade-S` around a zero midpoint with a ▲/▼ glyph.
- **Filters:** `source` (self/manager/team/blended), `groupBy` (role-family/org-unit), stage-level (sharpens the expectation overlay).
- **Drill:** cell → per-competency rows within that subcategory×group (safe within cycle).
- **Enhancement:** drill subcategory→competency; gap vs configured relevancy expectation; source picker; grouping picker. *Fully available today.*

### R5 — Level correlation box-plots *(deck slide 20)*
- **Audience:** Supervisor; Manager (subtree).
- **Source + fn:** `getLevelDistributionReport(cycleID, filter)`. Bucket reported rows by `stageLevel` (12 rungs `N1,J1-J3,R1-R3,S1-S3,X1,T1`); per bucket compute five-number summary of `finalScore.score` (nearest-rank percentiles); `tBand` tallies `finalInterpretation`. Thresholds T1–T5 = 76/89/105/119/150 (`competence-framework.js:30-36`).
- **Per-level EXPECTED overlay (the slide-20 enhancement, delivered in Phase 1 — not deferred).** `expected[stageLevel]` is the **all-R reference score** that `calculateFinalEvaluationScores` would yield at that level, computed deterministically from config (no "simulation"): for each category, `score = ceil((selfShare·0.2 + teamShare·0.3 + mgrShare·0.5) · 100)` where every per-source share collapses to `Σ(gradeWeights.R · relevancy) / Σ relevancy = gradeWeights.R = 1.0` (all sources all-R), i.e. each category's all-R score = `ceil(1.0 · 100) = 100`, and the level's expected final = the unweighted mean of category expecteds. This reuses the exact scoring path (`:467-504`) and the relevancy denominator `maxScoreByCategory` (`:470`), keyed by `snapshot[].relevancy[stageLevel]` (`:464`) for the cohort at that rung. Because relevancy curves rise up the ladder, the per-level expected curve is **level-varying**, so the box-plot shows whether actual distributions track the rising bar — exactly the "show how standards drift / overlay expected" enhancement. The flat **T3=105 reference line is kept as a secondary global marker**, *not* as the expected overlay.
- **Chart:** `ti-chart-box` (one box per level), `groups[].expected` rendered as a per-box marker, `reference:[{v:105,label:"T3"}]` as the secondary line; companion `ti-chart-bars` stacked for T-band mix per level.
- **Filters:** role-family/org narrow each box; the stage-level global filter **highlights/dims** rather than removes boxes (the level axis *is* the report — keep all 12 for the drift narrative).
- **Drill:** box → evaluations at that level; T-band → that subset.
- **Enhancement:** standards drift up the ladder; per-level expected overlay; T-band mix per level. *Deliverable in Phase 1 (expected curve is deterministic config math, not a deferred simulation).*

### R6 — Predictive drivers *(deck slide 21)*
- **Audience:** Supervisor; Manager (subtree).
- **Source + fn:** `getPredictiveDriversReport(cycleID, filter)`. Across scored rows, Pearson correlation of each subcategory's per-row average with `finalScore.score`. **No correlation is precomputed** — the service computes it (needs ≥~5 reported evals, else `r=null, insufficientData:true` — min N = 5, decision 4 in §7).
- **Configured baseline contract — `configuredShare[subcat]` defined explicitly (not "normalize both vectors").** For each of the 9 subcategories, the configured share = that subcategory's **share of total relevancy mass** across the cohort: `configuredShare[subcat] = (Σ over the cohort's snapshot relevancy of competencies in that subcategory, at each row's stageLevel) / (Σ over all 9 subcategories of the same)`. This is read directly from `snapshot[].relevancy[stageLevel]` (`competence-framework.js:464`) — the same quantity scoring accumulates as `maxScoreByCategory` (`:470`), here partitioned by subcategory rather than category. The empirical vector is the per-subcategory Pearson `r` normalized to sum 1 over the 9; `divergence[subcat] = empiricalShare − configuredShare`; `misweightFlag` when rank divergence exceeds the decided rank-divergence threshold (>= 2 positions, §7).
- **Chart:** `ti-chart-bars` horizontal, sorted by `r` desc (matches deck); paired/diverging bar for empirical-vs-configured; flagged subcategories accented.
- **Filters:** all globals (most defensible when stage-level/role-family narrowed; else label configured-share "blended across levels").
- **Drill:** subcategory bar → its scatter (subAvg vs final) + competency list with `relevancyArchetype` pointers.
- **Enhancement:** empirical influence vs configured relevancy archetype weighting to flag mis-weighted cards. *Inputs exist; correlation + share math is new.*

### Manager-only — Grader Calibration *(no deck equivalent)*
- **Audience:** Manager (own reports, by name); Supervisor (over a manager they're superior to).
- **Source + fn:** `getCalibrationReport(cycleID, managerID)`. Over the manager's cohort, signed gaps in **weight space**: `mgr−self` and `mgr−team` per competency, rolled to overall / category / subcategory / (drill) competency. `+` = grader more lenient than the comparison source. Track `n` per cell; exclude `""` pairs; suppress cells with `n < minCohortSize` (default 3, §7) to avoid de-anonymizing a tiny team's team-source.
- **Chart:** `ti-chart-bars` diverging (centered on 0; vs-self/vs-team series; one row per subcategory) + a headline overall-gap KPI + per-competency drill table.
- **Privacy:** manager's own grading over own reports → by name; team comparison uses only `team.cumulative`.
```js
calibration:{ cohortSize, pairsCompared:{self,team},
  overall:{ vsSelf:{meanGap,n}, vsTeam:{meanGap,n} },
  byCategory:{E,I,C:{vsSelf,vsTeam}}, bySubcategory:{E1..C3:{vsSelf,vsTeam}},
  perCompetency:[{code,name,subcategory,vsSelf,vsTeam}] }
```

### Individual results *(enhanced READY view + "My results")*
- **Audience:** the evaluee (EMPLOYEE) for their own; Manager via report drill (`anonymizeEvaluationScores` treats EMPLOYEE and MANAGER identically, `competence-framework.js:648-661`).
- **Source + fn:** live case → **no new endpoint**; the existing `load-evaluation` READY payload already carries self + manager + team-cumulative, all category scores + T-bands, finalScore + T-band, manager comment, anonymous team comments (§5). CLOSED historical results come from the snapshot via `getIndividualResult`/`load-my-results`.
- **Chart:** `ti-chart-gauge` hero (finalScore vs T1–T5 bands), `ti-chart-bars` per-category, `ti-chart-radar` 9-subcategory self/manager/team vs relevancy-expected, `ti-chart-bars` grouped for source comparison; strengths/gaps lists; feedback recap.
- **Critical correctness note #1 (decomposition):** per-source category/subcategory averages **must be recomputed client-side from `grades{}` letters + snapshot relevancy** — `scores[E/I/C].score` is a single pre-blended (0.2/0.3/0.5) number and **cannot be decomposed** back into self/manager/team (`competence-framework.js:480-484`). Expose `evaluationWeights`/`performanceThresholds` in the `config` data view (`:126-149`) for client-side band scaling.
- **Critical correctness note #2 (T-band cascade):** client-side T-band placement **must mirror the server cascade exactly** (`competence-framework.js:487-491` / `:507-511`): iterate thresholds in **ascending T1→T5 order**, assign the **first** band where `score <= performanceThresholds[code]`, else fall through to **T5**. (A naive nearest-band or descending scan mislabels edges — e.g. exactly 105 → T3, not T4.)
- **Enhancement:** results blocks above the (demoted, expandable) competency tables; blind-spot/hidden-strength markers; gap vs relevancy expectation. *Small markup change: widen the team-comments guard at `frame-competence-evaluation.html:417` so the employee sees anonymous team comments at READY (already in payload — privacy-safe).*

### Cross-cycle trends *(later phase; contract locked now)*
Four reports, all reading **only persisted snapshots** (never raw historical evals), x-axis = cycles ordered by `chronoKey`, rightmost point may be the ACTIVE cycle (dashed, provisional). **Their snapshot derivations are Phase-0 lock items (snapshots can't be back-filled):**
1. **Overall score trend** — `ti-chart-line` (mean + p25–p75 band) + stacked-area T-band mix. The **p25/p75 band uses nearest-rank percentiles over `finalScore.score`** (same method as R5), stored in `overall.finalScore.{p25,p75}`.
2. **Gap-closure over time** — 9 `ti-chart-line` sparklines (zero-baseline) of `bySubcategory.gap`; drill to that cycle's heatmap row (within-cycle, codes safe).
3. **Ladder movement** — stacked-area of `ladderOrdinalHistogram` + mean-rung line. **Explicit derivation:** map the 12 stage-levels onto **5 grade ordinals** by stage family — `1=N* (N1)`, `2=J* (J1–J3)`, `3=R* (R1–R3)`, `4=S* (S1–S3)`, `5=X+T merged (X1,T1)` (X and T collapse into one top ordinal). `ladderOrdinalHistogram` = count of reported rows per ordinal `{ "1":n,…,"5":n }`; mean-rung = relevancy-free mean of the ordinal. *UI caveat surfaced: cohort-composition movement, not individual promotion.*
4. **Cohort comparison** — grouped `ti-chart-bars` + delta column, matched on **stable dimension keys** (role-family / org-unit / stage-level), never on people.

---

## 4. Data Model Additions & Storage

**Shared envelopes** (every report payload carries `meta`; every chart spec carries `provisional`):
```js
CohortFilter = { organizationUnitID, roleFamily, specialization, stageLevel, level,
                 source:"self"|"manager"|"team"|"blended", groupBy:"roleFamily"|"orgUnit",
                 allowedEmployeeIDs:[]|null }   // privacy allow-list injected by the web layer

ResultMeta = { cycleID, mode:"live"|"snapshot", cycleStatus:"ACTIVE"|"CLOSED", computedAt,
               total, reporting, pctReporting, partial }   // partial ⇒ provisional charts
```
**EvaluationStatus value set (full, for the new status segments).** The enum defines six VALUES: `["Not Started","Open","In Review","Ready","Closed","Deleted"]` (`configuration-loader.js:176-184`). The `byStatus` breakdown renders exactly the four that appear on real evaluations — `Open`, `In Review`, `Ready`, `Closed`. `Deleted` is **excluded** at the frame (already stripped by `fetchEvaluations`). `Not Started` is **never assigned to an evaluation**; the Coverage "Not started" bucket is a **synthetic roster-minus-evaluations label**, not this enum value. All front-end status compares use the VALUE strings *with their spaces* (`"In Review"`, and the synthetic `"Not started"` for the roster gap), per the `tools.enum` gotcha.

"Reporting" = evaluations whose status is `Ready` or `Closed` (finalScore populated at READY); score-based reports (R3–R6) use the *reported* subset, Coverage/Time use the full in-scope set.

**Snapshot store — new eighth cache key** `ti:competence:data:results-snapshots` (`{ [cycleID]: ResultsSnapshot }`), seeded in `initialize()`, accessed via `saveResultsSnapshot` / `getResultsSnapshot` / `getAllResultsSnapshots`. **The ResultsSnapshot shape is the single most important thing to lock now** — immutable once written, never back-fillable:
```jsonc
{
  "cycleID":"2026-H2", "schemaVersion":1,
  "dictionaryVersion":"3.1.0",        // competence package version (code-drift guard, §6)
  "competencyCodeEra":"v3.0.0",       // gates raw-code cross-cycle joins
  "computedAt":"…", "cycleClosedAt":"…",   // = re-read cycle.actualCloseDate (verified data-manager.js:494/:602)
  "provisional":false,
  "chronoKey":4053,                   // year*2 + (H2?1:0); precomputed sort key
  "meta": ResultMeta,
  "cohort":{ "nEligible":42,"nClosed":40,"nScored":40,"reportingPct":95.2 },

  // pre-rendered, FILTER-FREE, whole-org report payloads (groupBy pre-expanded role-family AND org-unit):
  "reports":{ "coverage":…, "timeDistribution":…, "alignment":…, "heatmap":…,
              "levelDistribution":…, "predictiveDrivers":… },

  // compact, code-era-tagged cross-cycle substrate (stable axes only):
  "overall":{ "finalScore":{mean,median,p25,p75,min,max,stdev}, "tBandMix":{T1..T5} },  // percentiles nearest-rank
  "byCategory":{ "E":{mean,median,p25,p75,n,tBandMix}, "I":…, "C":… },        // stable (3 categories)
  "bySubcategory":{ "E1":{meanGrade,n,expectedMeanGrade,gap}, … "C3":… },     // stable axis (E1..C3) — see §6
  "byStageLevel":{ "N1":{n,finalScoreMean}, … "T1":… },
  "ladderOrdinalHistogram":{ "1":n,"2":n,"3":n,"4":n,"5":n },  // N→1,J→2,R→3,S→4,(X+T)→5 (defined §3 cross-cycle)
  "byRoleFamily":{ "SE":{n,finalScoreMean,byCategory,bySubcategoryGap}, … },
  "byOrgUnit":{ "<unitID>":{n,unitName,finalScoreMean,byCategory}, … }
}
```
**Snapshots are anonymized by construction** — only counts/means/percentiles, never `employeeID`, never an individual peer grade. Any cohort cell with `n < minCohortSize` (default 3) is emitted as `{n, suppressed:true}`. CLOSED cycles render from the snapshot at ~0 compute; a narrower-than-whole-org filter on a closed cycle takes the live-recompute branch (closed evals are never deleted, DELETED re-filtered) so the allow-list still applies.

---

## 5. Access & Privacy

Reuse the existing guards verbatim — invent nothing:

| Concern | Mechanism (verified) |
|---|---|
| Identity / 401 | `#requireSessionUser(session)` (`:2961-2968`) |
| Role gate / 403 | `#requireRole(session, …roles)` (`:2980-2986`) — Insights endpoints require MANAGER/|SUPERVISOR; the six leadership reports require SUPERVISOR |
| Manager subtree | `isSuperiorManagerOfEmployee(userID, employeeID)` (`organization-manager.js:213`) — **the authoritative cohort predicate** |
| Org scope | `getOrganizationUnitSubtree(rootUnitID)` (`:393`) + `resolveOrganizationUnitIDForEmployee` (`:289`) |

**Scope rules:**
- **Supervisor → whole org.** `allowedEmployeeIDs = null`; leadership reports org-wide.
- **Manager → own subtree.** `rootManagerID = session.user.employeeID`; cohort = rows where `isSuperiorManagerOfEmployee(managerID, employeeID)` is true. **Must use this predicate, not `managerID` equality** — equality captures only *direct* reports and under-counts multi-level managers. Managers see their reports **by name** (§7).
- **Individual → self.** `load-my-results` scopes to `session.user.employeeID`; no role gate.

**Privacy enforced at the data contract, not the chart** — three structural guarantees:
1. **Peer grades are never serialized.** `grades[code].team.individual[]` never enters the frame, never aggregates, never returns. The strongest team signal anywhere is the cumulative letter. Mirrors `anonymizeEvaluationGrades` (`competence-framework.js:605-636`).
2. **Identity is name-or-token by authority.** Rows outside the requester's authority are emitted without `employeeID`/`name` (counts only) — replicating the `canSeePersonalData` pattern (`#loadEmployeeList:423`). Drill endpoints re-check `isSuperiorManagerOfEmployee` server-side before returning identity (defense in depth; the UI gate is never trusted).
3. **Small-n suppression.** Any cohort cell with `n < minCohortSize` (default 3) is suppressed at aggregation time, so a 1–2-person unit can't de-anonymize the team source — every downstream report and snapshot inherits it.

Chart-level affordance: `scatter`/`box` `options.anonymize` strips ids/labels and disables drill, letting the always-anonymous team dimension render safely.

**Verified individual READY privacy contract** (`competence-framework.js:605-671`, via `#loadEvaluation:870-871`): for an EMPLOYEE at status `"Ready"`, peer individuals are **collapsed at `competence-framework.js:613` (and the MANAGER path at `:628`)** — `evaluation.grades[code].team` is **reassigned** from the `{cumulative, individual[]}` object to the cumulative letter string (`= grades[code].team?.cumulative || ""`), so `individual[]` is **overwritten and never serialized** (it is collapsed, not field-deleted — patch nearby code accordingly). The payload then contains: self (full), manager grade, team cumulative, all `scores`/`finalScore` + localized T-band names, `feedback.managerComment`, anonymous `feedback.teamComments[]`. Individual peer grades are not even in the payload — the view cannot leak them.

---

## 6. Phased Delivery Plan

Sequencing (locked): Phase 0 foundation → Leadership → Manager → Individual → Cross-cycle. Each phase maps to a YouTrack **CA** capability epic with child cards (design-first, checkpointed Conventional-Commit steps).

**Cross-cycle subcategory-axis stability (verify-and-cite gate).** The cross-cycle substrate (`bySubcategory`, `byRoleFamily[].bySubcategoryGap`) rests on the **9 subcategory codes (E1..C3) and their 3 category rollups being invariant across the v3.0.0 164→108 renumber**. The renumber changed **leaf competency codes**, not the subcategory taxonomy. **CA-F3 must verify and cite this invariance** (the v3.0.0 changelog / config diff) before the snapshot shape is locked: if confirmed, cross-cycle subcategory trends rest on a verified-stable axis; if *not* confirmed, subcategory-level cross-cycle comparison inherits the same drift risk as raw codes and must also be gated behind `competencyCodeEra`. Raw-code cross-cycle drill stays deferred behind `competency-code-map.json` regardless.

### Phase 0 — Foundation *(CA epic: "Statistics & Results — Foundation")*
- **CA-F1 Chart primitives.** New `ti-charts.js`; register `x-ti-chart` at `ti-framework.js:1324`; append `.ti-chart-*` CSS + `--chart-seq-1…5` ramp tokens (both themes) + `cell-q1…q5`/`tiHatch` to `ti-framework.css`; load `defer`+nonce in both `index.html`s; ship all 8 primitives with a11y tables + addEventListener-only wiring + presentation-attribute-only dynamic styling.
- **CA-F2 Aggregation service.** New `results-analytics.js`; `#buildCohortFrame` (with explicit DELETED re-filter on raw-read paths and `grades[code].employee→self` mapping); `computeAllReports`; the live/snapshot `#resolve`; per-request memo keyed `(cycleID, filterHash)`.
- **CA-F3 Snapshot store.** Add `cacheEntryKeyResultsSnapshots` + accessors to `data-manager.js`, seed in `initialize()`; wire `persistResultsSnapshot(cycleID)` into `#closeCycle` (`competence-web-application.js:1965`) **re-reading the cycle for `actualCloseDate`**. **Lock the full `ResultsSnapshot` shape now** — stable-axis aggregates, `ladderOrdinalHistogram` (defined mapping), p25/p75 (nearest-rank), `expectedMeanGrade`/`gap`, `dictionaryVersion`/`competencyCodeEra`, `chronoKey`, `n<k` suppression — and **complete the subcategory-axis-stability verify-and-cite** above.
- **CA-F4 IA/access shell.** New Insights sidebar group + `sidebarNavMapping` entries; register `insights-*` fragments; `processDataRequest` branches gated via `#requireRole`; cycle selector (`?cycleID=` query, `#resolveCurrentCycle` fallback). **Add the `theme-changed` CustomEvent dispatch to `toggleTheme()` (`ti-framework.js:1125`)** only if any primitive uses `<defs>` patterns; class/var-driven charts need no event.
- **Deliverable gate:** Coverage renders live + from a snapshot in both themes.

### Phase 1 — Leadership / cycle analytics *(CA epic: "Statistics & Results — Leadership")*
- **CA-L1..L6** — one card per deck report. Drivers includes the Pearson + `configuredShare` divergence math; **Level includes the per-level all-R expected curve** (deterministic config math, ships here — not deferred).
- **CA-L7** — live caveat banner + snapshot projection for all six.

### Phase 2 — Manager / team analytics *(CA epic: "Statistics & Results — Manager")*
- **CA-M1** — subtree cohort filter (`isSuperiorManagerOfEmployee`) wired into all six via `scope:"subtree"`; `load-insights-team` + `frame-insights-team.html`.
- **CA-M2** — **Grader Calibration** (`getCalibrationReport` + `ti-chart-bars` diverging) — the one genuinely new computation.
- **CA-M3** — team coverage roster (by name) + uniform drill-to-person (reuse `load-evaluation`, re-gated server-side).

### Phase 3 — Individual results *(CA epic: "Statistics & Results — Individual")*
- **CA-I1** — READY results blocks in `frame-competence-evaluation.html`; `buildResults()` view-model + source-pure client aggregation with the **exact ascending T-band cascade**; expose `evaluationWeights`/`performanceThresholds` in the `config` view; widen team-comments guard `:417`.
- **CA-I2** — "My results" Workspace entry + `load-my-results` (CLOSED via snapshot; empty-state when latest eval not yet READY).

### Phase 4 — Cross-cycle trends *(CA epic: "Statistics & Results — Cross-cycle")*
- **CA-X1** — `ti-chart-line` + sparkline polish.
- **CA-X2** — `load-results-trend` view (`metric`/`dimension`/`key`/`window`); reads `getAllResultsSnapshots()`, appends provisional active-cycle compute, access-gates slices, suppresses `n<k`, shapes to chart contracts.
- **CA-X3** — the four trend screens + `competency-code-map.json` (deferred; gates raw-code drill across v3.0.0).
- **CA-X4** — per-employee historical line — a **separate access-gated path** reading raw `fetchEvaluations(employeeID)`, never the anonymous snapshots.

---

## 7. Resolved decisions

All nine questions raised by the design pass were decided with the product owner on 2026-06-21:

1. **Coverage "complete" = `Ready` + `Closed`** (not Closed-only). Drives `completedPct` and the live "% reporting" denominator.
2. **Interview "held" = the labeled proxy** (`interviewDate <= today` AND status in {Ready, Closed}), surfaced as "finalized (proxy for held)". No explicit `interviewHeldAt` action now — revisit only if the proxy proves too loose.
3. **Alignment quadrant high/low split = the `R` (1.0) grade-weight midpoint**, exposed as a configurable setting.
4. **Predictive drivers:** show correlations only with **>= 5** reported evaluations; raise `misweightFlag` when a subcategory's empirical-influence rank diverges from its configured-relevancy rank by **>= 2** positions (threshold tunable in config).
5. **`minCohortSize` = 3** for small-cell suppression (confirmed).
6. **The six leadership reports are Supervisor-only**; Managers get the same six re-scoped under Team analytics (no special case for a manager sitting at the org root).
7. **A Manager may de-anonymize, by name, every evaluee in their full multi-level subtree** — consistent with their existing evaluation access — not just direct reports.
8. **Cross-cycle comparison is subcategory/category-level only** for now; the raw competency-code map across the v3.0.0 164->108 renumber (`competency-code-map.json`) is deferred to CA-X3.
9. **Closed-cycle snapshots stay frozen**, gated by `schemaVersion`; an admin "recompute snapshot" action is a later add only if ever needed.

---

**Net architecture:** eight generic SVG primitives + one aggregation service + one snapshot key carry all four pillars and cross-cycle. Leadership and Manager are the *same six report contracts* differing only by cohort predicate; Individual reuses the existing READY payload; Cross-cycle reads only snapshots. Privacy, theming, and the live/snapshot caveat are solved once at the foundation and inherited everywhere.

**Files touched (repo-relative):**
- New: `packages/web-framework/bin/static/scripts/ti-charts.js`
- New: `packages/competence/application/results-analytics.js`
- New: `packages/competence/bin/static/fragments/frame-insights-overview.html`, `frame-insights-cycle.html`, `frame-insights-team.html`
- Edit: `packages/web-framework/bin/static/scripts/ti-framework.js` (register `x-ti-chart` at `:1324`; **NEW** `theme-changed` dispatch in `toggleTheme` `:1125` — only if `<defs>` patterns are used)
- Edit: `packages/web-framework/bin/static/scripts/ti-framework.css` (`.ti-chart-*`, `--chart-seq-1…5` in both themes)
- Edit (both): `packages/web-framework/bin/static/index.html`, `packages/competence/bin/static/index.html` (load `ti-charts.js`)
- Edit: `packages/competence/application/data-manager.js` (8th cache key + seed `:60-66` + `saveResultsSnapshot`/`getResultsSnapshot`/`getAllResultsSnapshots`)
- Edit: `packages/competence/bin/competence-web-application.js` (`addFragment` `:39-91`; `sidebarNavMapping` `:151-166`; `processDataRequest` `:201-226`; new `#loadReport*`/`#loadInsights*`/`#loadMyResults` handlers; snapshot write re-reading the resolved cycle inside `#closeCycle` `:1965`)
- Edit: `packages/competence/bin/static/fragments/components/component-sidebar.html` (Insights group; "My results" Workspace item)
- Edit: `packages/competence/bin/static/fragments/frame-competence-evaluation.html` (READY results blocks; widen team-comments guard `:417`)
- Edit: `packages/competence/bin/static/scripts/competence-user-interface.js` (insights components in `alpine:init` `:4242-4257`; `buildResults()` + source-pure aggregation with exact ascending T-band cascade)
- Doc fix: `packages/competence/application/data-objects.types.js:197` (correct the stale `interviewDate` "took place" comment to "scheduled")


---

## Implementation log

_Running log — append a dated entry per checkpointed step as phases land. Track each phase as a YouTrack `CA` epic with child cards (`CA-F*`, `CA-L*`, `CA-M*`, `CA-I*`, `CA-X*`) referenced in commit messages._

- 2026-06-21 — Design approved & committed. **Phase 0** broken into four implementation plans under `docs/superpowers/plans/` (`…-phase-0a` chart primitives, `0b` aggregation + Coverage, `0c` snapshot store, `0d` Insights shell + Coverage screen), each TDD/bite-sized and adversarially verified (the empty-org-roster blocker — resolve the root unit via a new `getOrganizationRootUnitID()` — folded in). Implementation not yet started. Phase 0 gate = Coverage renders live + from a snapshot, in both themes.
- 2026-06-21 — CA-F3 subcategory-axis stability gate VERIFIED: the v3.0.0 164→108 renumber changed leaf competency codes only (`packages/competence/CHANGELOG.md:84`), and "config file shapes, JSON schemas, and framework logic are unchanged — content replacement, not an API change" (`packages/competence/CHANGELOG.md:104`). The E1..C3 subcategory axis is a frozen framework constant (`competence-framework.js:38`), independent of leaf-code count. Conclusion: subcategory/category cross-cycle aggregates rest on a verified-stable axis; raw leaf-code drill stays deferred behind `competency-code-map.json` (§7.8). `competencyCodeEra` locked to `"v3.0.0"` in the ResultsSnapshot shape.
