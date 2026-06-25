# Stats & Results — Phase 1A: Chart primitives top-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the chart primitives the Phase 1 leadership reports need — `scatter` (R3), `heatmap` (R4), `box` (R5) — plus `grouped` and `diverging` modes on the existing `bars` renderer (R2/R6), and the per-theme sequential ramp tokens (`--chart-seq-1…5`), all in the web-framework `ti-charts.js` layer.

**Architecture:** Extend the existing single vanilla-JS module [`packages/web-framework/bin/static/scripts/ti-charts.js`](../../../packages/web-framework/bin/static/scripts/ti-charts.js). All scale/geometry math lives in **pure, unit-tested helper functions**; renderers build SVG via `createElementNS` + `setAttribute` only. Colors come from CSS classes/vars so theming is pure CSS. This mirrors the Phase 0 gauge/bars/stat structure exactly.

**Tech Stack:** CommonJS module with dual CJS/`window` export; `node --test` + `node:assert/strict`; Alpine CSP build (the directive `x-ti-chart` already dispatches to `renderChart`).

## Global Constraints (copied from the design, §2.A)

- **CSP — dynamic visuals:** every per-element visual is an SVG **presentation attribute via `setAttribute`** (`x`, `cx`, `d`, `points`, `width`, `stroke-dasharray`, `stroke-dashoffset`, `opacity`, `transform`) **or a CSS class**. `element.style.*` is **forbidden**; the single sanctioned exception is `element.style.setProperty("--var", …)`.
- **CSP — events:** all event wiring via `element.addEventListener` (guarded for environments without it); never inline `on*=`. Interactive marks dispatch `new CustomEvent("ti-chart:select",{detail,bubbles:true})`; the host binds via `@ti-chart:select`.
- **SVG sizing:** always `viewBox` + `preserveAspectRatio`; tabular numbers via the `.tabular-nums`/`font-variant-numeric` class.
- **A11y:** every chart is `<svg role="img">` with `<title>`/`<desc>` + a visually-hidden `<table class="ti-chart-sr">` mirror (via `buildSrTable`). Interactive marks get `tabindex="0"` + `role="button"` + Enter/Space handlers (attached via `addEventListener`).
- **Theming:** sequential heatmap needs **new** `--chart-seq-1…5` tokens in **both** themes (the four grade hues are categorical, not a ramp). The diverging heatmap reuses `--grade-N…--grade-S`. No per-chart color overrides.
- **CommonJS**, `"use strict"`, GPL header, the existing code style (4-space indent, spaced parens `( x )`).

## Pre-existing facts (verified this session)

- `ti-charts.js` exports pure helpers + `renderChart`; `SUPPORTED_TYPES = ["gauge","bars","stat"]`; `normalizeSpec` collapses any other `type` to `"unsupported"`.
- **Breaking test:** [`ti-charts.test.js:124-128`](../../../packages/web-framework/test/ti-charts.test.js) asserts `normalizeSpec({type:"heatmap"}).type === "unsupported"`. Adding `heatmap` to `SUPPORTED_TYPES` breaks it → retarget to a genuinely-unknown type (`"sankey"`).
- Theme tokens present in **both** `ti-theme-daylight.css` / `ti-theme-black-glass.css`: `--grade-S/R/U/N`, `--grid-line`, `--border-strong`, `--accent`, `--info`, `--success`, `--danger`. **Absent:** `--chart-seq-1…5`, any `cell-q*`.
- The `.ti-chart` CSS block lives at [`ti-framework.css:2533-2647`](../../../packages/web-framework/bin/static/scripts/ti-framework.css) and routes `--c-*` chart vars to semantic/grade tokens.
- Tests use a `fakeDoc()` whose nodes carry a `style` Proxy that **throws** on any `style.*` set — this is the CSP enforcement. New render tests reuse it.

## File structure

```
packages/web-framework/
  bin/static/scripts/
    ti-charts.js                 (modify: + scatter/heatmap/box renderers, bar modes, helpers, dispatch, SUPPORTED_TYPES)
    ti-framework.css             (modify: + .ti-chart-scatter/heatmap/box CSS, --chart-seq mapping, cell classes)
    ti-theme-daylight.css        (modify: + --chart-seq-1..5 light→dark)
    ti-theme-black-glass.css     (modify: + --chart-seq-1..5 dark→light)
  test/
    ti-charts.test.js            (modify: retarget the unsupported-type test; + helper + render tests for the 3 new primitives + 2 bar modes)
```

No new files. No new dependencies.

---

## Task 1 — Theme ramp tokens + CSS contract + register the new types

**Files:** modify `ti-theme-daylight.css`, `ti-theme-black-glass.css`, `ti-framework.css`, `ti-charts.js`, `ti-charts.test.js`.

**Interfaces — Produces:** `SUPPORTED_TYPES` includes `"scatter","heatmap","box"`; `normalizeSpec` passes them through. CSS classes available for later render tasks: `.ti-chart-scatter-*`, `.ti-chart-heat-cell.cell-q1…q5`, `.ti-chart-heat-cell.cell-neg/.cell-pos`, `.ti-chart-box-*`, `.ti-chart-bar-group`/`-diverge`.

- [ ] **Step 1 — Retarget the breaking test.** In `ti-charts.test.js`, change the `"marks an unknown type as unsupported"` case to use `type:"sankey"` (a type we will never support) instead of `"heatmap"`.
- [ ] **Step 2 — Add a failing test** asserting `normalizeSpec({type:"scatter",data:{points:[]}}).type === "scatter"` (and same for `heatmap`/`box`). Run → FAIL (collapses to `unsupported`).
- [ ] **Step 3 — Implement:** extend `SUPPORTED_TYPES = ["gauge","bars","stat","scatter","heatmap","box"]`; update the `TiChartSpec` typedef `type` union and the `SUPPORTED_TYPES` comment. Run → PASS.
- [ ] **Step 4 — Theme tokens.** Append `--chart-seq-1 … --chart-seq-5` to both theme `:root`/theme blocks. Daylight light→dark (cool sequential, distinct from grade greens): `#EAF0F7, #C6D8EC, #92B4DA, #5286C0, #2462A4`. Glass dark→light: `#1B3A5C, #2E5E8F, #4E86BD, #7FB0E0, #B7D5F4`. (Tunable; chosen to read on cream/glass backgrounds and not collide with the grade palette.)
- [ ] **Step 5 — CSS contract.** Append to the `.ti-chart` block in `ti-framework.css`:
  - In `.ti-chart {}` add `--c-seq-1…5: var(--chart-seq-1…5);` and `--c-warn: var(--grade-U);`.
  - Heatmap: `.ti-chart-heat-cell{stroke:var(--c-grid);stroke-width:.5}` ; `.cell-q1{fill:var(--c-seq-1)}….cell-q5{fill:var(--c-seq-5)}` ; `.ti-chart-heat-cell.cell-neg{fill:var(--c-grade-n)} .cell-pos{fill:var(--c-grade-s)}` (opacity rides as a presentation attribute) ; `.ti-chart-heat-cell.suppressed{fill:var(--c-grid)}` ; `.ti-chart-heat-label{fill:var(--c-ink);font-size:4px}`.
  - Scatter: `.ti-chart-scatter-pt{fill:var(--c-series-1)} .ti-chart-scatter-diag{stroke:var(--c-grid);stroke-width:.5;stroke-dasharray:2 2} .ti-chart-scatter-mid{stroke:var(--c-grid);stroke-width:.4} .ti-chart-scatter-pt.tone-grade-s{fill:var(--c-grade-s)}` etc (grade tones) ; provisional dim via `.ti-chart-provisional`.
  - Box: `.ti-chart-box-box{fill:var(--c-series-1);opacity:.25;stroke:var(--c-series-1);stroke-width:.6} .ti-chart-box-median{stroke:var(--c-ink-strong);stroke-width:1} .ti-chart-box-whisker{stroke:var(--c-axis);stroke-width:.5} .ti-chart-box-expected{stroke:var(--c-grade-r);stroke-width:.8;stroke-dasharray:2 2} .ti-chart-box-ref{stroke:var(--c-grade-u);stroke-width:.5;stroke-dasharray:3 2} .ti-chart-box-label{fill:var(--c-ink);font-size:4px}`.
  - Bars (grouped/diverging share `.ti-chart-bar-seg` tones): `.ti-chart-bar-axis{stroke:var(--c-axis);stroke-width:.4}`.
  - Interactive: `.ti-chart [role="button"]{cursor:pointer} .ti-chart [role="button"]:focus-visible{outline:1px solid var(--c-series-1)}`.
- [ ] **Step 6 — Commit.** `feat(web-framework): register scatter/heatmap/box chart types + chart-seq ramp tokens + CSS (CA-66)`

---

## Task 2 — `scatter` primitive (R3 alignment quadrant)

**Data contract:** `{ points:[{id,x,y,z?,r?,tone?,label?}], diagonal?:bool, quadrants?:[] }`, `options:{ domain?:{xMin,xMax,yMin,yMax}, midX?, midY?, bubble?:"z", zMax?, anonymize? }`.

**Interfaces — Produces:** pure `scatterLayout(points, opts)` (exported) + `renderScatter(figure, spec)` wired into `renderChart`.

- [ ] **Step 1 — Write failing tests** for `scatterLayout`:
  - maps a point at domain `(xMin,yMax)` to top-left and `(xMax,yMin)` to bottom-right (y inverted); clamps out-of-domain points to the plot box.
  - default domain `0..1.3` (grade-weight space) when `options.domain` omitted.
  - `options.bubble:"z"` → radius scales `rMin…rMax` by `z/zMax`; absent → `rDefault`.
  - emits `diagonal:{x1,y1,x2,y2}` only when `data.diagonal` truthy; `midX`/`midY` pixel from `options.midX/midY` (default 1.0).
  - carries `tone`/`label`/`id` through; `anonymize` strips `label` to `""`.
- [ ] **Step 2 — Run → FAIL** (`scatterLayout` not a function).
- [ ] **Step 3 — Implement `scatterLayout`** (pure): plot box `pad..(side-pad)`; `px = pad + (clamp(x,xMin,xMax)-xMin)/(xMax-xMin)*plotW`; `py = pad + plotH - (clamp(y,yMin,yMax)-yMin)/(yMax-yMin)*plotH`; bubble radius `rMin + (clamp(z,0,zMax)/zMax)*(rMax-rMin)` else `rDefault` (default 2.2; rMin 1.4, rMax 4); diagonal endpoints mapped from `(xMin,yMin)`→`(xMax,yMax)`; mid lines from `options.midX/midY`. Round to 2dp.
- [ ] **Step 4 — Run → PASS.**
- [ ] **Step 5 — Write a render test** with `fakeDoc`: `renderChart(fig,{type:"scatter",…})` appends an `svg` with a `<title>`, quadrant mid lines, a diagonal `path/line`, one `circle` per point with `class` containing `ti-chart-scatter-pt`, and a `ti-chart-sr` table; interactive points have `tabindex/role` when not anonymized. Assert no `style.*` was set (the Proxy throws otherwise).
- [ ] **Step 6 — Implement `renderScatter`** using `scatterLayout` + `svgEl`; attach select via a shared `_attachSelect(el,detail,doc)` helper (guarded `if typeof el.addEventListener === "function"`). a11y table cols `[Point, Manager(x), Self(y), Team(z)]`.
- [ ] **Step 7 — Run → PASS. Commit.** `feat(web-framework): ti-chart scatter primitive with quadrant + diagonal + bubble (CA-66)`

---

## Task 3 — `heatmap` primitive (R4 competence heatmap)

**Data contract:** `{ rows:[{id,label}], cols:[{id,label}], cells:[{r,c,v,n?,expected?,delta?,suppressed?}] }`, `options:{ scale:"sequential"|"diverging", buckets?:5 }`.

**Interfaces — Produces:** pure `quantileBucket(sortedValues, v, buckets)` + `heatmapLayout(rows, cols, cells, opts)` (exported) + `renderHeatmap`.

- [ ] **Step 1 — Failing tests** for `quantileBucket`: nearest-rank bucket 1..5; all-equal values → bucket clamps (e.g. middle); out-of-set value clamps to 1 or `buckets`.
- [ ] **Step 2 — Failing tests** for `heatmapLayout`:
  - grid geometry: with `rowLabelW`/`colLabelH`, N rows × M cols → cell `w = (width-rowLabelW)/M`, `h` fixed; cell `(r,c)` at expected `x,y`.
  - `scale:"sequential"` → each cell gets `bucket` 1..5 from its `v` across all cell `v`s.
  - `scale:"diverging"` → each cell gets `sign:"pos"|"neg"|"zero"` from `delta` and `mag = min(1,|delta|/maxAbs)`.
  - `suppressed:true` cells carry `suppressed` through (no bucket/sign needed).
- [ ] **Step 3 — Run → FAIL. Step 4 — Implement** both (pure). **Step 5 — Run → PASS.**
- [ ] **Step 6 — Render test** with `fakeDoc`: sequential mode appends one `rect.ti-chart-heat-cell.cell-qN` per cell (suppressed → `.suppressed`), row/col `<text>` labels, sr-table; diverging mode sets `class` `cell-pos/cell-neg` and `opacity` as a **presentation attribute** (assert via `attrs.opacity`, never `style`).
- [ ] **Step 7 — Implement `renderHeatmap`** (uses layout; `opacity` via `setAttribute`; cells `tabindex/role` + select unless `suppressed`). **Run → PASS. Commit.** `feat(web-framework): ti-chart heatmap primitive — sequential + diverging modes (CA-66)`

---

## Task 4 — `box` primitive (R5 level correlation box-plots)

**Data contract:** `{ groups:[{id,label,min,q1,median,q3,max,n?,mean?,expected?,suppressed?}], reference?:[{v,label}] }`, `options:{ domain?:{min:0,max:150} }`.

**Interfaces — Produces:** pure `boxLayout(groups, opts)` (exported) + `renderBox`.

- [ ] **Step 1 — Failing tests** for `boxLayout`:
  - score→y maps `domain.max` to top, `domain.min` to bottom (inverted); a group's `yQ1>yMed>yQ3`? (q1 lower score → larger y). Assert `yMax < yMin_pixel` ordering reflects score ordering.
  - boxes evenly spaced across plot width; box `x`/`w` per group; gaps between.
  - `expected`/`mean` map to `yExpected`/`yMean` when present; `reference[{v}]` → `refs[{y,label}]`.
  - `suppressed:true` group carries through with no box geometry required.
- [ ] **Step 2 — FAIL → Step 3 Implement → Step 4 PASS.**
- [ ] **Step 5 — Render test** (`fakeDoc`): per group a box `rect`, median `line`, whisker `line`s, optional expected/mean markers; global `reference` line(s); labels; sr-table cols `[Level, Min, Q1, Median, Q3, Max, N]`.
- [ ] **Step 6 — Implement `renderBox`. Run → PASS. Commit.** `feat(web-framework): ti-chart box-plot primitive with expected + reference markers (CA-66)`

---

## Task 5 — `bars` grouped + diverging modes (R2 time, R6 drivers)

The existing `renderBars` does horizontal **stacked** segments only. Add `options.mode:"grouped"|"diverging"` (default stays stacked, unchanged).

**Interfaces — Produces:** pure `barsGroupedLayout(rows, opts)` + `barsDivergingLayout(rows, opts)` (exported); `renderBars` dispatches on `options.mode`.

- [ ] **Step 1 — Failing tests** for `barsGroupedLayout`: rows `[{id,label,values:[{key,v,tone}]}]`; a shared `max` across **all** rows' values; each value → `{key,v,tone,width=v/max*trackW, subY, height}` (sub-bars stacked vertically within the row band). Zero `max` → zero widths (no NaN).
- [ ] **Step 2 — Failing tests** for `barsDivergingLayout`: rows with signed `values`; shared `maxAbs`; `center=trackW/2`; positive → `{x:center, width:|v|/maxAbs*half, dir:"pos"}`, negative → `{x:center-width, width, dir:"neg"}`. Zero `maxAbs` → zero widths.
- [ ] **Step 3 — FAIL → Step 4 Implement both → Step 5 PASS.**
- [ ] **Step 6 — Render tests** (`fakeDoc`): `mode:"grouped"` renders sub-bars per row + group labels; `mode:"diverging"` renders a center axis `line` + left/right rects; both keep the sr-table; `mode` absent/`"stacked"` is byte-for-byte the existing behavior (regression assert on an existing stacked case).
- [ ] **Step 7 — Implement** the dispatch in `renderBars` (extract the current body as the `stacked` branch). **Run → PASS. Commit.** `feat(web-framework): ti-chart bars grouped + diverging modes (CA-66)`

---

## Task 6 — Full-suite gate + export surface

- [ ] **Step 1 — Update the export-surface test** (`ti-charts module` describe) to assert the new exported helpers: `scatterLayout, heatmapLayout, quantileBucket, boxLayout, barsGroupedLayout, barsDivergingLayout`.
- [ ] **Step 2 — Add each to the module return object** in `ti-charts.js`.
- [ ] **Step 3 — Run the whole web-framework suite:** `npm --prefix packages/web-framework test` → all green.
- [ ] **Step 4 — Commit.** `test(web-framework): assert ti-chart Phase-1 helper export surface (CA-66)`

## Self-review checklist (run after writing code)

- Spec coverage: scatter→R3, heatmap→R4, box→R5, grouped→R2, diverging→R6. ✓
- No `element.style.*` anywhere except `setProperty("--var",…)` (the `fakeDoc` Proxy enforces this in render tests). ✓
- `SUPPORTED_TYPES`/`normalizeSpec`/typedef/export-object/CSS all reference the **same** type strings and helper names. ✓
- Both themes get `--chart-seq-1…5`. ✓

## Acceptance gate (Phase 1A done)

`npm --prefix packages/web-framework test` green; `renderChart` produces themed SVG for all six types (gauge/bars/stat/scatter/heatmap/box) and both new bar modes, with a11y mirror tables and no CSP-violating style writes. Radar/line remain deferred (Phase 3/4).
