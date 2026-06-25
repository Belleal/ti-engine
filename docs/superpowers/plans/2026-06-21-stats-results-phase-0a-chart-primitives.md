# Phase 0A — Chart primitives (gauge, bars, stat) — implementation plan

Steps use markdown checkbox (`- [ ]`) syntax. An agentic worker should drive this with **superpowers:subagent-driven-development** (independent tasks in the current session) or **superpowers:executing-plans** (separate session with review checkpoints).

## Goal

Ship the chart infrastructure and the three SVG chart primitives that the R1 Coverage walking skeleton needs — `gauge`, `bars`, `stat` — as a new framework module `ti-charts.js`, an `x-ti-chart` Alpine CSP directive, a `.ti-chart-*` CSS contract that themes through existing tokens, and the `<script>` wiring in both apps. Every scale/path/format computation is extracted as a pure, unit-tested helper; the SVG/DOM assembly is CSP-safe (`setAttribute`/classes only, the single sanctioned `element.style.setProperty("--var", …)` exception) and verified manually in both `daylight` and `glass` themes. The other five design primitives (heatmap/scatter/box/radar/line) are Phase 1+ and are intentionally NOT built here.

## Architecture

- **`ti-charts.js`** is a browser-global module loaded via `<script>` that exposes `window.TiCharts`, and ALSO exports the same surface via a CommonJS tail (`typeof module !== "undefined"`) so `node --test` can `require` the pure helpers without a DOM. Pure helpers (`gaugeArcPath`, `gaugeValueToAngle`, `barSegments`, `gaugeRowsLayout`, `formatPercent`, `formatNumber`, `normalizeSpec`) carry all geometry/scale/format math and are fully TDD-able. The DOM-touching pieces (`svgEl`, `buildSrTable`, `renderGauge`, `renderBars`, `renderStat`, `renderChart`) accept an injectable `doc` where testable and are otherwise manually verified.
- **`x-ti-chart`** is registered in `ti-framework.js` mirroring the existing `configureDirectiveTextLabel`/`Alpine.directive("text-label", …)` pattern (`ti-framework.js:1181-1206`, registered at `:1324`). It reads a reactive spec property-path via `evaluateLater` and calls `window.TiCharts.renderChart` inside an `effect`, so it re-renders when the spec changes and re-themes for free (colors route through CSS custom properties that flip per theme — no resolved colors are baked into `<defs>`, so no `theme-changed` dispatch is needed in Phase 0).
- **CSS** appends a `.ti-chart` token-routing block to `ti-framework.css` (EOF, after `::-webkit-scrollbar-thumb:hover` at `:2530`). Colors map onto semantic + grade tokens (`--accent/--info/--success/--border-strong/--grid-line/--fg-primary/--fg-secondary` and `--grade-S/R/U/N`) that already exist in BOTH `ti-theme-daylight.css` and `ti-theme-black-glass.css`, so charts re-theme with zero re-render. A NEW visually-hidden `.ti-chart-sr` a11y-mirror class and a NEW `.tabular-nums` utility are introduced here (neither exists today).
- **Serving**: `ti-charts.js` lives ONLY in the framework static dir; `#locateStaticFile` (`web-app-manager.js:381-412`) serves that dir to both apps, so each `index.html` only adds a `<script defer nonce>` tag at `/static/scripts/ti-charts.js` — no copy step.

## Tech Stack

- CommonJS module with a browser-global IIFE wrapper + dual `module.exports`/`window` tail.
- Tests: Node's built-in `node --test` over `packages/web-framework/test/*.test.js`, `require("node:test")` + `require("node:assert/strict")`, GPL header. No jsdom/DOM harness — DOM assembly is manually verified.
- Alpine CSP build (`alpinejs-csp.min.js`): directive expressions are bare reactive property paths / registered-method calls only (no `Array`/`Object`/`Math`/ternary-with-call/`?.`).
- Strict CSP: dynamic SVG visuals via `setAttribute`/CSS classes only; `element.style.*` forbidden except `element.style.setProperty("--var", …)`; all events via `addEventListener`.

## Depends on

**none.** Phase 0A is the foundation layer; the other Phase-0 components (0B aggregation `results-analytics.js`, 0C snapshot store, 0D IA/access shell) depend on 0A, not the reverse. 0D's Insights Coverage screen consumes the exact spec shapes contract-tested here.

## File structure

```
packages/web-framework/bin/static/scripts/ti-charts.js          (new)  — module + pure helpers + renderers
packages/web-framework/test/ti-charts.test.js                   (new)  — node:test pure-helper suite
packages/web-framework/bin/static/scripts/ti-framework.js       (mod)  — x-ti-chart directive register
packages/web-framework/bin/static/scripts/ti-framework.css      (mod)  — append .ti-chart-* contract
packages/web-framework/bin/static/index.html                    (mod)  — <script> tag
packages/competence/bin/static/index.html                       (mod)  — <script> tag
```

---

### Task A1: Scaffold `ti-charts.js` with the dual CJS/global wrapper + first failing test

**Files**
- Create: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Create: `packages/web-framework/test/ti-charts.test.js`

- [ ] Write the failing test `packages/web-framework/test/ti-charts.test.js`:
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

const TiCharts = require( "../bin/static/scripts/ti-charts.js" );

describe( "ti-charts module", () => {
    it( "exports the pure helper surface", () => {
        assert.equal( typeof TiCharts.gaugeArcPath, "function" );
        assert.equal( typeof TiCharts.barSegments, "function" );
        assert.equal( typeof TiCharts.formatPercent, "function" );
        assert.equal( typeof TiCharts.formatNumber, "function" );
    } );
} );
```
- [ ] Run it and confirm FAIL (module does not exist yet):
  `node --test packages/web-framework/test/ti-charts.test.js`
  Expected: `Error: Cannot find module '../bin/static/scripts/ti-charts.js'` → suite fails.
- [ ] Create `packages/web-framework/bin/static/scripts/ti-charts.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

/**
 * ti-charts — hand-rolled, themeable, CSP-safe SVG chart primitives for the ti-engine web apps.
 * Phase 0 ships three primitives: gauge, bars, stat. All scale/path/format math lives in the pure
 * helpers below (unit-tested via node:test); the renderers build SVG via createElementNS +
 * setAttribute only. Dynamic visuals are presentation attributes or CSS classes — never
 * element.style.* (the single sanctioned exception is element.style.setProperty( "--var", … )).
 */
const TiCharts = ( function () {

    const SVG_NS = "http://www.w3.org/2000/svg";

    function gaugeArcPath() { throw new Error( "not implemented" ); }
    function barSegments() { throw new Error( "not implemented" ); }
    function formatPercent() { throw new Error( "not implemented" ); }
    function formatNumber() { throw new Error( "not implemented" ); }

    return {
        SVG_NS,
        gaugeArcPath,
        barSegments,
        formatPercent,
        formatNumber
    };
} )();

if ( typeof module !== "undefined" && module.exports ) {
    module.exports = TiCharts;
}
if ( typeof window !== "undefined" ) {
    window.TiCharts = TiCharts;
}
```
- [ ] Run the test → expected PASS (4 `typeof … === "function"` assertions):
  `node --test packages/web-framework/test/ti-charts.test.js` → `# pass 1`.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): scaffold ti-charts module with dual CJS/global export (CA-F1)"
```

---

### Task A2: Pure helpers `formatPercent` and `formatNumber`

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] Append a new `describe` block to the test file:
```js
describe( "ti-charts — number/percent formatting", () => {
    it( "formatPercent renders a 0..1 ratio as a whole-percent string", () => {
        assert.equal( TiCharts.formatPercent( 0 ), "0%" );
        assert.equal( TiCharts.formatPercent( 1 ), "100%" );
        assert.equal( TiCharts.formatPercent( 0.4267 ), "43%" );
    } );
    it( "formatPercent honours an explicit fraction-digits argument", () => {
        assert.equal( TiCharts.formatPercent( 0.4267, 1 ), "42.7%" );
    } );
    it( "formatPercent clamps out-of-range ratios into 0..1", () => {
        assert.equal( TiCharts.formatPercent( -0.2 ), "0%" );
        assert.equal( TiCharts.formatPercent( 1.5 ), "100%" );
    } );
    it( "formatPercent returns an em dash for null/NaN", () => {
        assert.equal( TiCharts.formatPercent( null ), "—" );
        assert.equal( TiCharts.formatPercent( NaN ), "—" );
    } );
    it( "formatNumber rounds to the requested digits and dashes null", () => {
        assert.equal( TiCharts.formatNumber( 105 ), "105" );
        assert.equal( TiCharts.formatNumber( 104.6 ), "105" );
        assert.equal( TiCharts.formatNumber( 104.56, 1 ), "104.6" );
        assert.equal( TiCharts.formatNumber( null ), "—" );
    } );
} );
```
- [ ] Run → FAIL (stubs throw `not implemented`):
  `node --test packages/web-framework/test/ti-charts.test.js` → formatting suite fails.
- [ ] Replace the two stub bodies with implementations:
```js
    /**
     * Formats a 0..1 ratio as a percent string. Clamps to [0,1]; null/undefined/NaN → em dash.
     * @param {number} ratio
     * @param {number} [digits=0]
     * @returns {string}
     */
    function formatPercent( ratio, digits ) {
        if ( ratio === null || ratio === undefined || Number.isNaN( ratio ) ) {
            return "—";
        }
        const d = ( typeof digits === "number" ) ? digits : 0;
        let r = ratio;
        if ( r < 0 ) { r = 0; }
        if ( r > 1 ) { r = 1; }
        return ( r * 100 ).toFixed( d ) + "%";
    }

    /**
     * Formats a number to fixed digits (default 0). null/undefined/NaN → em dash.
     * @param {number} value
     * @param {number} [digits=0]
     * @returns {string}
     */
    function formatNumber( value, digits ) {
        if ( value === null || value === undefined || Number.isNaN( value ) ) {
            return "—";
        }
        const d = ( typeof digits === "number" ) ? digits : 0;
        return Number( value ).toFixed( d );
    }
```
- [ ] Run → expected PASS (all formatting assertions):
  `node --test packages/web-framework/test/ti-charts.test.js` → formatting suite green.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts formatPercent/formatNumber helpers (CA-F1)"
```

---

### Task A3: Pure helpers `gaugeValueToAngle` + `gaugeArcPath` (270° arc geometry)

The gauge is a 270° sweep (start −225°, end +45°, clockwise; open at the bottom). Value `0..1` maps onto that sweep. The value arc is an SVG `A` (elliptical-arc) command on a fixed-radius circle in a `100×100` viewBox.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] In `ti-charts.js`, add `gaugeValueToAngle,` to the `return { … }` block (alongside the existing `gaugeArcPath,`) so both names resolve.
- [ ] Append the failing test block:
```js
describe( "ti-charts — gauge geometry", () => {
    const R = 42, CX = 50, CY = 50, SWEEP = 270;

    it( "gaugeValueToAngle maps 0 to start and 1 to start+sweep", () => {
        assert.equal( TiCharts.gaugeValueToAngle( 0, -225, SWEEP ), -225 );
        assert.equal( TiCharts.gaugeValueToAngle( 1, -225, SWEEP ), 45 );
        assert.equal( TiCharts.gaugeValueToAngle( 0.5, -225, SWEEP ), -90 );
    } );
    it( "gaugeValueToAngle clamps value into 0..1", () => {
        assert.equal( TiCharts.gaugeValueToAngle( -1, -225, SWEEP ), -225 );
        assert.equal( TiCharts.gaugeValueToAngle( 2, -225, SWEEP ), 45 );
    } );
    it( "gaugeArcPath returns an M…A path with the large-arc flag set for a 270° track", () => {
        const full = TiCharts.gaugeArcPath( 1, { cx: CX, cy: CY, r: R, startAngle: -225, sweep: SWEEP } );
        assert.match( full, /^M-?\d/ );
        assert.match( full, / A42 42 0 1 1 / ); // large-arc-flag 1, sweep-flag 1 (clockwise)
    } );
    it( "gaugeArcPath start point sits at the start angle (bottom-left for -225°)", () => {
        const p = TiCharts.gaugeArcPath( 0.0001, { cx: CX, cy: CY, r: R, startAngle: -225, sweep: SWEEP } );
        // start x = 50 + 42*cos(-225°) = 50 + 42*(-0.7071) ≈ 20.30
        assert.match( p, /^M20\.3/ );
    } );
    it( "gaugeArcPath of 0 progress yields a near-degenerate span (large-arc-flag 0)", () => {
        const p = TiCharts.gaugeArcPath( 0, { cx: CX, cy: CY, r: R, startAngle: -225, sweep: SWEEP } );
        assert.match( p, /A42 42 0 0 1 / );
    } );
} );
```
- [ ] Run → FAIL: `node --test packages/web-framework/test/ti-charts.test.js`.
- [ ] Replace the `gaugeArcPath` stub and add `gaugeValueToAngle` + private helpers:
```js
    /**
     * Clamps a 0..1 value and maps it onto an arc beginning at `startAngle` (degrees, SVG screen
     * convention: 0°=east, +y=down/clockwise) spanning `sweep` degrees clockwise.
     * @param {number} value 0..1
     * @param {number} startAngle degrees
     * @param {number} sweep degrees (positive = clockwise)
     * @returns {number}
     */
    function gaugeValueToAngle( value, startAngle, sweep ) {
        let v = value;
        if ( v < 0 || Number.isNaN( v ) ) { v = 0; }
        if ( v > 1 ) { v = 1; }
        return startAngle + ( v * sweep );
    }

    function _polar( cx, cy, r, angleDeg ) {
        const a = ( angleDeg * Math.PI ) / 180;
        return { x: cx + ( r * Math.cos( a ) ), y: cy + ( r * Math.sin( a ) ) };
    }

    function _round( n ) {
        return Math.round( n * 100 ) / 100;
    }

    /**
     * Builds an SVG path "d" for a gauge value arc on a circle radius r centred at (cx,cy),
     * running clockwise from `startAngle` for value·sweep degrees.
     * @param {number} value 0..1
     * @param {{cx:number,cy:number,r:number,startAngle:number,sweep:number}} opts
     * @returns {string}
     */
    function gaugeArcPath( value, opts ) {
        const cx = opts.cx, cy = opts.cy, r = opts.r;
        const startAngle = opts.startAngle, sweep = opts.sweep;
        const endAngle = gaugeValueToAngle( value, startAngle, sweep );
        const start = _polar( cx, cy, r, startAngle );
        const end = _polar( cx, cy, r, endAngle );
        const spanned = endAngle - startAngle;
        const largeArc = ( spanned > 180 ) ? 1 : 0;
        const sweepFlag = 1; // clockwise
        return "M" + _round( start.x ) + " " + _round( start.y ) +
               " A" + r + " " + r + " 0 " + largeArc + " " + sweepFlag + " " +
               _round( end.x ) + " " + _round( end.y );
    }
```
- [ ] Run → expected PASS. (The regexes pin the verified geometry: `cos(-225°)=-0.7071` → `M20.3…`; the full 270° track → `1 1`.)
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts gauge arc geometry helpers (CA-F1)"
```

---

### Task A4: Pure helper `barSegments` (horizontal + stacked segment widths)

Coverage uses both a plain horizontal proportion (overall completed) and a STACKED row (per-group status segments + Not-started gap). `barSegments` takes a row's segments `[{key,v,tone}]` and a track width, returning each segment's `{key, tone, x, width}` (cumulative offsets), normalized to fill the track in proportion to values. Zero-total rows yield zero-width segments (no divide-by-zero). An explicit `total` fixes the denominator (a roster size) so partial rows do not stretch.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] Append the failing test block:
```js
describe( "ti-charts — bar segment layout", () => {
    it( "lays stacked segments end-to-end, proportional to value, filling the track", () => {
        const segs = TiCharts.barSegments(
            [ { key: "Closed", v: 3, tone: "grade-s" }, { key: "Ready", v: 1, tone: "grade-r" } ],
            { width: 100 }
        );
        assert.equal( segs.length, 2 );
        assert.deepEqual( segs[ 0 ], { key: "Closed", tone: "grade-s", x: 0, width: 75 } );
        assert.deepEqual( segs[ 1 ], { key: "Ready", tone: "grade-r", x: 75, width: 25 } );
    } );
    it( "handles a single segment that fills the whole track", () => {
        const segs = TiCharts.barSegments( [ { key: "Not started", v: 5, tone: "ink" } ], { width: 200 } );
        assert.deepEqual( segs[ 0 ], { key: "Not started", tone: "ink", x: 0, width: 200 } );
    } );
    it( "returns zero-width segments when the row total is zero (no NaN)", () => {
        const segs = TiCharts.barSegments( [ { key: "a", v: 0 }, { key: "b", v: 0 } ], { width: 100 } );
        assert.equal( segs[ 0 ].width, 0 );
        assert.equal( segs[ 1 ].width, 0 );
        assert.equal( segs[ 1 ].x, 0 );
    } );
    it( "uses an explicit total when provided (fixed roster denominator)", () => {
        const segs = TiCharts.barSegments( [ { key: "Closed", v: 3 } ], { width: 100, total: 10 } );
        assert.equal( segs[ 0 ].width, 30 );
    } );
} );
```
- [ ] Run → FAIL.
- [ ] Replace the `barSegments` stub:
```js
    /**
     * Lays out horizontal/stacked bar segments along a track. Segment widths are proportional to
     * each segment's `v`; offsets accumulate left-to-right. With `opts.total` the denominator is
     * fixed (e.g. a roster size) so partial rows do not stretch to fill; otherwise the segments
     * normalize to their own sum.
     * @param {Array<{key:string,v:number,tone?:string}>} segments
     * @param {{width:number,total?:number}} opts
     * @returns {Array<{key:string,tone:string,x:number,width:number}>}
     */
    function barSegments( segments, opts ) {
        const width = opts.width;
        let denom = opts.total;
        if ( denom === undefined || denom === null ) {
            denom = 0;
            for ( let i = 0; i < segments.length; i++ ) {
                denom += ( segments[ i ].v || 0 );
            }
        }
        const out = [];
        let cursor = 0;
        for ( let i = 0; i < segments.length; i++ ) {
            const v = segments[ i ].v || 0;
            const w = ( denom > 0 ) ? _round( ( v / denom ) * width ) : 0;
            out.push( {
                key: segments[ i ].key,
                tone: segments[ i ].tone || "",
                x: _round( cursor ),
                width: w
            } );
            cursor += w;
        }
        return out;
    }
```
- [ ] Run → expected PASS.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts barSegments layout helper (CA-F1)"
```

---

### Task A5: Spec-validation helper `normalizeSpec` (the `TiChartSpec` envelope)

Locks the universal envelope (`type/data/options/a11yLabel/a11yDesc/provisional`) and applies safe defaults so the renderers never branch on missing fields. Unknown/unsupported types collapse to a graceful empty state.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] In `ti-charts.js`, add `normalizeSpec,` to the `return { … }` block.
- [ ] Append the failing test block:
```js
describe( "ti-charts — spec envelope", () => {
    it( "fills defaults and preserves the three Phase-0 types", () => {
        const s = TiCharts.normalizeSpec( { type: "gauge", data: { value: 0.5 }, a11yLabel: "Coverage" } );
        assert.equal( s.type, "gauge" );
        assert.deepEqual( s.options, {} );
        assert.equal( s.a11yLabel, "Coverage" );
        assert.equal( s.a11yDesc, "" );
        assert.equal( s.provisional, false );
        assert.deepEqual( s.data, { value: 0.5 } );
    } );
    it( "coerces provisional to a boolean and defaults a11yLabel to empty", () => {
        const s = TiCharts.normalizeSpec( { type: "bars", data: { rows: [] }, provisional: 1 } );
        assert.equal( s.provisional, true );
        assert.equal( s.a11yLabel, "" );
    } );
    it( "marks an unknown type as unsupported and empties data", () => {
        const s = TiCharts.normalizeSpec( { type: "heatmap", data: { rows: [] } } );
        assert.equal( s.type, "unsupported" );
        assert.deepEqual( s.data, {} );
    } );
    it( "returns an unsupported spec for null/garbage input", () => {
        assert.equal( TiCharts.normalizeSpec( null ).type, "unsupported" );
        assert.equal( TiCharts.normalizeSpec( 42 ).type, "unsupported" );
    } );
} );
```
- [ ] Run → FAIL.
- [ ] Implement (add above the `return { … }` block):
```js
    const SUPPORTED_TYPES = [ "gauge", "bars", "stat" ]; // Phase 0 subset

    /**
     * @typedef {Object} TiChartSpec
     * @property {"gauge"|"bars"|"stat"} type   Phase 0 supports these three only.
     * @property {Object}  data                 per-primitive payload (the aggregation output)
     * @property {Object}  [options]            domains, sizing, labels, formatting
     * @property {string}  a11yLabel            role=img label (also injected as <title>)
     * @property {string}  [a11yDesc]           injected as <desc>
     * @property {boolean} [provisional]        draws the "as of now / % reporting" hatch for ACTIVE cycles
     */

    /**
     * Validates + fills defaults on a chart spec. Unknown/unsupported types collapse to
     * { type:"unsupported", data:{} } so the renderer can show a graceful empty state.
     * @param {*} spec
     * @returns {TiChartSpec}
     */
    function normalizeSpec( spec ) {
        if ( !spec || typeof spec !== "object" ) {
            return { type: "unsupported", data: {}, options: {}, a11yLabel: "", a11yDesc: "", provisional: false };
        }
        const supported = ( SUPPORTED_TYPES.indexOf( spec.type ) >= 0 );
        return {
            type: supported ? spec.type : "unsupported",
            data: ( supported && spec.data && typeof spec.data === "object" ) ? spec.data : {},
            options: ( spec.options && typeof spec.options === "object" ) ? spec.options : {},
            a11yLabel: ( typeof spec.a11yLabel === "string" ) ? spec.a11yLabel : "",
            a11yDesc: ( typeof spec.a11yDesc === "string" ) ? spec.a11yDesc : "",
            provisional: Boolean( spec.provisional )
        };
    }
```
- [ ] Run → expected PASS.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts normalizeSpec envelope + defaults (CA-F1)"
```

---

### Task A6: Pure helper `gaugeRowsLayout` (Coverage gauge `rows[]` → bar list)

The Coverage gauge spec carries `rows?:[{id,name,value,n,total,tone?}]` (per-group coverage). The renderer draws each as a labelled mini-bar beneath the dial. Extract the per-row layout (value→ratio→width) as a pure helper.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] Add `gaugeRowsLayout,` to the `return { … }` block.
- [ ] Append the failing test block:
```js
describe( "ti-charts — gauge rows layout", () => {
    it( "computes ratio + track width per row from n/total", () => {
        const rows = TiCharts.gaugeRowsLayout(
            [ { id: "se", name: "SE", n: 3, total: 4 }, { id: "qa", name: "QA", n: 0, total: 2 } ],
            { width: 100 }
        );
        assert.equal( rows[ 0 ].ratio, 0.75 );
        assert.equal( rows[ 0 ].width, 75 );
        assert.equal( rows[ 0 ].label, "SE" );
        assert.equal( rows[ 1 ].ratio, 0 );
        assert.equal( rows[ 1 ].width, 0 );
    } );
    it( "prefers an explicit value (0..1) over n/total when present", () => {
        const rows = TiCharts.gaugeRowsLayout( [ { id: "x", name: "X", value: 0.4 } ], { width: 50 } );
        assert.equal( rows[ 0 ].ratio, 0.4 );
        assert.equal( rows[ 0 ].width, 20 );
    } );
    it( "guards total=0 (ratio 0, no NaN)", () => {
        const rows = TiCharts.gaugeRowsLayout( [ { id: "z", name: "Z", n: 0, total: 0 } ], { width: 100 } );
        assert.equal( rows[ 0 ].ratio, 0 );
        assert.equal( rows[ 0 ].width, 0 );
    } );
} );
```
- [ ] Run → FAIL.
- [ ] Implement:
```js
    /**
     * Lays out Coverage gauge sub-rows: each row's coverage ratio (explicit `value`, else n/total)
     * and its bar width along the track. Guards total=0.
     * @param {Array<{id:string,name:string,value?:number,n?:number,total?:number,tone?:string}>} rows
     * @param {{width:number}} opts
     * @returns {Array<{id:string,label:string,ratio:number,width:number,tone:string}>}
     */
    function gaugeRowsLayout( rows, opts ) {
        const width = opts.width;
        const out = [];
        for ( let i = 0; i < rows.length; i++ ) {
            const row = rows[ i ];
            let ratio;
            if ( typeof row.value === "number" ) {
                ratio = row.value;
            } else if ( row.total ) {
                ratio = ( row.n || 0 ) / row.total;
            } else {
                ratio = 0;
            }
            if ( ratio < 0 ) { ratio = 0; }
            if ( ratio > 1 ) { ratio = 1; }
            out.push( {
                id: row.id,
                label: row.name || row.id,
                ratio: ratio,
                width: _round( ratio * width ),
                tone: row.tone || ""
            } );
        }
        return out;
    }
```
- [ ] Run → expected PASS.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts gaugeRowsLayout helper (CA-F1)"
```

---

### Task A7: SVG builder `svgEl` + a11y mirror builder `buildSrTable` (CSP attribute discipline)

Small DOM-builder helpers used by all three renderers. `svgEl(tag, attrs, doc)` creates a namespaced SVG element and sets every attr via `setAttribute` (CSP-legal). `buildSrTable(headers, rows, doc)` builds the visually-hidden `<table class="ti-chart-sr">` a11y mirror. Both accept an optional injected `doc` (defaulting to the global `document`) so `svgEl`'s attribute discipline is testable via a tiny fake document that traps any `.style` write.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`
- Test: `packages/web-framework/test/ti-charts.test.js`

- [ ] Add `svgEl,` and `buildSrTable,` to the `return { … }` block.
- [ ] Append the failing test block (12-line fake document; the Proxy trap fails the test if `.style` is ever written):
```js
describe( "ti-charts — svgEl builder (CSP attribute discipline)", () => {
    function fakeDoc() {
        const created = [];
        return {
            created,
            createElementNS( ns, tag ) {
                const node = {
                    ns, tag, attrs: {}, children: [], textContent: "",
                    setAttribute( k, v ) { this.attrs[ k ] = String( v ); },
                    appendChild( c ) { this.children.push( c ); return c; },
                    style: new Proxy( {}, { set() { throw new Error( "element.style.* is forbidden" ); } } )
                };
                created.push( node );
                return node;
            }
        };
    }
    it( "creates an SVG-namespaced node and sets all attrs via setAttribute", () => {
        const doc = fakeDoc();
        const el = TiCharts.svgEl( "path", { d: "M0 0", "stroke-dasharray": "4 3", class: "ti-chart-gauge-arc" }, doc );
        assert.equal( el.ns, TiCharts.SVG_NS );
        assert.equal( el.tag, "path" );
        assert.equal( el.attrs.d, "M0 0" );
        assert.equal( el.attrs[ "stroke-dasharray" ], "4 3" );
        assert.equal( el.attrs.class, "ti-chart-gauge-arc" );
    } );
} );
```
- [ ] Run → FAIL.
- [ ] Implement:
```js
    /**
     * Creates an SVG-namespaced element and applies every attribute via setAttribute (CSP-legal).
     * Never touches element.style. Pass `doc` to inject a document in tests.
     * @param {string} tag
     * @param {Object<string,string|number>} attrs
     * @param {Document} [doc]
     * @returns {Element}
     */
    function svgEl( tag, attrs, doc ) {
        const d = doc || ( typeof document !== "undefined" ? document : null );
        const el = d.createElementNS( SVG_NS, tag );
        if ( attrs ) {
            const keys = Object.keys( attrs );
            for ( let i = 0; i < keys.length; i++ ) {
                el.setAttribute( keys[ i ], String( attrs[ keys[ i ] ] ) );
            }
        }
        return el;
    }

    /**
     * Builds the visually-hidden HTML <table class="ti-chart-sr"> a11y mirror placed beside the <svg>.
     * @param {string[]} headers
     * @param {Array<Array<string|number>>} rows
     * @param {Document} [doc]
     * @returns {HTMLTableElement}
     */
    function buildSrTable( headers, rows, doc ) {
        const d = doc || ( typeof document !== "undefined" ? document : null );
        const table = d.createElement( "table" );
        table.setAttribute( "class", "ti-chart-sr" );
        const thead = d.createElement( "thead" );
        const htr = d.createElement( "tr" );
        for ( let i = 0; i < headers.length; i++ ) {
            const th = d.createElement( "th" );
            th.textContent = String( headers[ i ] );
            htr.appendChild( th );
        }
        thead.appendChild( htr );
        table.appendChild( thead );
        const tbody = d.createElement( "tbody" );
        for ( let r = 0; r < rows.length; r++ ) {
            const tr = d.createElement( "tr" );
            for ( let c = 0; c < rows[ r ].length; c++ ) {
                const td = d.createElement( "td" );
                td.textContent = String( rows[ r ][ c ] );
                tr.appendChild( td );
            }
            tbody.appendChild( tr );
        }
        table.appendChild( tbody );
        return table;
    }
```
- [ ] Run → expected PASS (the Proxy trap proves no `.style` write occurs).
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js packages/web-framework/test/ti-charts.test.js
git commit -m "feat(web-framework): ti-charts svgEl + a11y sr-table builders (CA-F1)"
```

---

### Task A8: The three renderers + `renderChart` dispatcher (DOM assembly; manual-verified)

These build the actual SVG/HTML into the host `<figure>`. No automated DOM test (no jsdom harness, per the testing reality) — the math they consume is already covered by A2–A7. They MUST obey CSP: presentation attributes via `setAttribute`, classes for color, provisional via `setAttribute("stroke-dasharray",…)` or the `.ti-chart-provisional` class, and CSS-var routing via `el.style.setProperty("--var",…)` only. `renderGauge` renders `data.sublabel` (the "% reporting" / fraction caveat that the downstream CA-F4 `buildCoverageGaugeSpec` emits) both visually and in the sr-mirror, so the provisional/reporting context is never dropped.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js`

- [ ] Add `renderChart,` to the `return { … }` block, then add the renderers + dispatcher above it:
```js
    function _clearChildren( node ) {
        while ( node.firstChild ) { node.removeChild( node.firstChild ); }
    }

    /**
     * Renders a Coverage-style gauge: a 270° track, a value arc (dashed cap when provisional),
     * a centre value, a label, an optional sublabel ("% reporting" caveat), and optional sub-rows.
     * All geometry from gaugeArcPath/gaugeRowsLayout.
     * @param {Element} figure host <figure class="ti-chart">
     * @param {TiChartSpec} spec
     */
    function renderGauge( figure, spec ) {
        const data = spec.data;
        const value = ( typeof data.value === "number" ) ? data.value : 0;
        const geom = { cx: 50, cy: 50, r: 42, startAngle: -225, sweep: 270 };

        const svg = svgEl( "svg", { viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid meet", role: "img" } );
        const title = svgEl( "title", {} ); title.textContent = spec.a11yLabel; svg.appendChild( title );
        if ( spec.a11yDesc ) { const desc = svgEl( "desc", {} ); desc.textContent = spec.a11yDesc; svg.appendChild( desc ); }

        const track = svgEl( "path", { d: gaugeArcPath( 1, geom ), class: "ti-chart-gauge-track", fill: "none" } );
        svg.appendChild( track );

        const arc = svgEl( "path", { d: gaugeArcPath( value, geom ), class: "ti-chart-gauge-arc", fill: "none" } );
        if ( spec.provisional ) { arc.setAttribute( "stroke-dasharray", "4 3" ); }
        svg.appendChild( arc );

        const valueText = svgEl( "text", { x: 50, y: 48, class: "ti-chart-gauge-value", "text-anchor": "middle", "dominant-baseline": "central" } );
        valueText.textContent = formatPercent( value );
        svg.appendChild( valueText );

        if ( data.label ) {
            const labelText = svgEl( "text", { x: 50, y: 62, class: "ti-chart-gauge-label", "text-anchor": "middle" } );
            labelText.textContent = data.label;
            svg.appendChild( labelText );
        }
        if ( data.sublabel ) {
            const subText = svgEl( "text", { x: 50, y: 71, class: "ti-chart-gauge-sublabel", "text-anchor": "middle" } );
            subText.textContent = data.sublabel;
            svg.appendChild( subText );
        }

        figure.appendChild( svg );

        // a11y mirror: overall (+ the reporting caveat) + each sub-row
        const headers = [ "Group", "Coverage" ];
        const srRows = [ [ data.label || spec.a11yLabel, formatPercent( value ) ] ];
        if ( data.sublabel ) { srRows.push( [ "Reporting", data.sublabel ] ); }
        if ( Array.isArray( data.rows ) ) {
            const laid = gaugeRowsLayout( data.rows, { width: 100 } );
            for ( let i = 0; i < laid.length; i++ ) { srRows.push( [ laid[ i ].label, formatPercent( laid[ i ].ratio ) ] ); }
        }
        figure.appendChild( buildSrTable( headers, srRows ) );
    }

    /**
     * Renders horizontal/stacked bars. Each row is a track of segments laid out by barSegments;
     * a provisional "Not started" tail is dashed/dimmed via the .ti-chart-provisional class.
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderBars( figure, spec ) {
        const data = spec.data;
        const rows = Array.isArray( data.rows ) ? data.rows : [];
        const trackW = 100, rowH = 14, gap = 8, padTop = 4;
        const height = padTop + ( rows.length * ( rowH + gap ) );

        const svg = svgEl( "svg", { viewBox: "0 0 100 " + height, preserveAspectRatio: "xMidYMid meet", role: "img" } );
        const title = svgEl( "title", {} ); title.textContent = spec.a11yLabel; svg.appendChild( title );
        if ( spec.a11yDesc ) { const desc = svgEl( "desc", {} ); desc.textContent = spec.a11yDesc; svg.appendChild( desc ); }

        const srRows = [];
        for ( let r = 0; r < rows.length; r++ ) {
            const y = padTop + ( r * ( rowH + gap ) );
            const segSource = rows[ r ].segments || rows[ r ].values || [];
            const segInput = [];
            for ( let s = 0; s < segSource.length; s++ ) {
                segInput.push( { key: segSource[ s ].key, v: segSource[ s ].v, tone: segSource[ s ].tone } );
            }
            const segs = barSegments( segInput, { width: trackW, total: rows[ r ].total } );
            for ( let s = 0; s < segs.length; s++ ) {
                let cls = "ti-chart-bar-seg";
                if ( segs[ s ].tone ) { cls = cls + " tone-" + segs[ s ].tone; }
                if ( spec.provisional && segs[ s ].key === "Not started" ) { cls = cls + " ti-chart-provisional"; }
                const rect = svgEl( "rect", { x: segs[ s ].x, y: y, width: segs[ s ].width, height: rowH, rx: 2, class: cls } );
                svg.appendChild( rect );
                srRows.push( [ rows[ r ].label || rows[ r ].id, segs[ s ].key, String( segSource[ s ] ? ( segSource[ s ].v || 0 ) : 0 ) ] );
            }
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Row", "Segment", "Count" ], srRows ) );
    }

    /**
     * Renders a KPI stat tile (HTML+SVG-free). value/label/sub plus an optional pct mini-bar whose
     * fill width rides as a CSS var via setProperty (the sanctioned style exception).
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderStat( figure, spec ) {
        const data = spec.data;
        const doc = ( typeof document !== "undefined" ) ? document : null;
        const wrap = doc.createElement( "div" ); wrap.setAttribute( "class", "ti-chart-stat" );
        const valueEl = doc.createElement( "div" ); valueEl.setAttribute( "class", "ti-chart-stat-value tabular-nums" );
        valueEl.textContent = ( typeof data.value === "number" ) ? formatNumber( data.value ) : String( data.value );
        wrap.appendChild( valueEl );
        if ( data.label ) { const l = doc.createElement( "div" ); l.setAttribute( "class", "ti-chart-stat-label" ); l.textContent = data.label; wrap.appendChild( l ); }
        if ( data.sub ) { const sub = doc.createElement( "div" ); sub.setAttribute( "class", "ti-chart-stat-sub" ); sub.textContent = data.sub; wrap.appendChild( sub ); }
        if ( typeof data.pct === "number" ) {
            const bar = doc.createElement( "div" ); bar.setAttribute( "class", "ti-chart-stat-bar" );
            const fill = doc.createElement( "div" ); fill.setAttribute( "class", "ti-chart-stat-fill" );
            fill.style.setProperty( "--pct", formatPercent( data.pct ) ); // sanctioned --var exception
            bar.appendChild( fill ); wrap.appendChild( bar );
        }
        figure.appendChild( wrap );
        figure.appendChild( buildSrTable( [ "Metric", "Value" ], [ [ data.label || spec.a11yLabel, String( data.value ) ] ] ) );
    }

    /**
     * Top-level dispatcher: clears the host figure, normalizes the spec, routes to a renderer.
     * @param {Element} figure  host <figure class="ti-chart">
     * @param {*} rawSpec
     */
    function renderChart( figure, rawSpec ) {
        if ( !figure ) { return; }
        const spec = normalizeSpec( rawSpec );
        _clearChildren( figure );
        figure.setAttribute( "role", "img" );
        if ( spec.a11yLabel ) { figure.setAttribute( "aria-label", spec.a11yLabel ); }
        if ( spec.type === "gauge" ) { renderGauge( figure, spec ); }
        else if ( spec.type === "bars" ) { renderBars( figure, spec ); }
        else if ( spec.type === "stat" ) { renderStat( figure, spec ); }
        else { figure.setAttribute( "data-ti-chart-empty", "1" ); }
    }
```
- [ ] Re-run the full module suite to confirm no regression (renderers add no node tests; helper suites unaffected):
  `node --test packages/web-framework/test/ti-charts.test.js` → expected PASS (all A1–A7 suites green).
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-charts.js
git commit -m "feat(web-framework): ti-charts gauge/bars/stat renderers + dispatcher (CA-F1)"
```

---

### Task A9: Register the `x-ti-chart` Alpine CSP directive in `ti-framework.js`

Mirror `configureDirectiveTextLabel` (`ti-framework.js:1181-1206`, registered at `:1324`). The directive reads a bare reactive property-path expression (CSP-legal), resolves it against the Alpine scope via `evaluateLater`, and calls `window.TiCharts.renderChart` inside an `effect` so it re-renders when the spec changes. The directive callback uses the verified signature `( element, { value, expression }, { effect, evaluateLater } )`.

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-framework.js`

- [ ] Insert `configureDirectiveTiChart` immediately AFTER `configureDirectiveTextLabel`'s closing `};` at `:1206` (before the `htmx:configRequest` listener at `:1208`):
```js
/**
 * Returns a callback for the Alpine.js "ti-chart" directive. Renders a themeable SVG chart from a
 * reactive spec property path into the host <figure class="ti-chart"> element.
 *
 * Usage (CSP-legal — the expression is a bare reactive property path or a registered method call):
 *   <figure class="ti-chart" x-ti-chart="coverageSpec"
 *           role="img" x-bind:aria-label="coverageSpec.a11yLabel"></figure>
 *
 * The geometry/format math and the SVG assembly live in ti-charts.js (window.TiCharts); this
 * directive only wires the reactive spec to TiCharts.renderChart.
 *
 * @method
 * @returns {Function}
 * @public
 */
const configureDirectiveTiChart = () => {
    return ( element, { expression }, { effect, evaluateLater } ) => {
        const getSpec = evaluateLater( expression );
        effect( () => {
            getSpec( ( spec ) => {
                if ( typeof window !== "undefined" && window.TiCharts && typeof window.TiCharts.renderChart === "function" ) {
                    window.TiCharts.renderChart( element, spec );
                }
            } );
        } );
    };
};
```
- [ ] Register it in the `alpine:init` block at `:1324`, immediately after the `text-label` line (the `:1323` comment notes order matters; `x-ti-chart` depends only on `window.TiCharts`, a separate `defer` script read lazily at render time, so its registration order relative to the other directives/stores is safe):
```js
    Alpine.directive( "text-label", configureDirectiveTextLabel() );
    Alpine.directive( "ti-chart", configureDirectiveTiChart() );
```
- [ ] No automated test (the directive runs only in the Alpine/browser runtime). Confirm the file still parses:
  `node --check packages/web-framework/bin/static/scripts/ti-framework.js`
  Expected: no output, exit code 0.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-framework.js
git commit -m "feat(web-framework): register x-ti-chart Alpine CSP directive (CA-F1)"
```

---

### Task A10: Append the `.ti-chart-*` CSS contract to `ti-framework.css`

Only what gauge/bars/stat need now: the `.ti-chart` token-routing block (grade S/R/U/N + series/ink semantics that already exist in both themes), the `svg` reset, the NEW visually-hidden `.ti-chart-sr` a11y-mirror class, the gauge/bar/stat element classes (including the `.ti-chart-gauge-sublabel` consumed by Task A8), the `tone-*` color classes, the provisional dashed form, and a NEW `.tabular-nums` utility. Append at EOF (after `::-webkit-scrollbar-thumb:hover`, the last block at `:2530`).

**Files**
- Modify: `packages/web-framework/bin/static/scripts/ti-framework.css`

- [ ] Append at end of file:
```css
/* ------------------------------------------------------------------ *
 *  ti-charts — themeable SVG chart primitives (Phase 0: gauge/bars/stat)
 *  Colors route through semantic + grade tokens that flip per theme in
 *  ti-theme-daylight.css / ti-theme-black-glass.css. No per-chart overrides.
 * ------------------------------------------------------------------ */
.ti-chart {
    --c-axis: var(--border-strong);
    --c-grid: var(--grid-line);
    --c-ink: var(--fg-secondary);
    --c-ink-strong: var(--fg-primary);
    --c-series-1: var(--accent);
    --c-series-2: var(--info);
    --c-series-3: var(--success);
    --c-grade-s: var(--grade-S);
    --c-grade-r: var(--grade-R);
    --c-grade-u: var(--grade-U);
    --c-grade-n: var(--grade-N);
    display: block;
    margin: 0;
    position: relative;
}

.ti-chart svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
}

/* Visually-hidden a11y mirror table (screen-reader only). */
.ti-chart-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Provisional ("as of now / % reporting") visual language — class form;
   renderers may instead set stroke-dasharray as a presentation attribute. */
.ti-chart-provisional {
    stroke-dasharray: 4 3;
    opacity: 0.55;
}

/* --- gauge --- */
.ti-chart-gauge-track {
    stroke: var(--c-grid);
    stroke-width: 8;
    stroke-linecap: round;
}
.ti-chart-gauge-arc {
    stroke: var(--c-series-1);
    stroke-width: 8;
    stroke-linecap: round;
}
.ti-chart-gauge-value {
    fill: var(--c-ink-strong);
    font-size: 18px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
.ti-chart-gauge-label {
    fill: var(--c-ink);
    font-size: 7px;
}
.ti-chart-gauge-sublabel {
    fill: var(--c-ink);
    font-size: 5px;
}

/* --- bars --- */
.ti-chart-bar-seg {
    fill: var(--c-series-1);
}
.ti-chart-bar-seg.tone-grade-s { fill: var(--c-grade-s); }
.ti-chart-bar-seg.tone-grade-r { fill: var(--c-grade-r); }
.ti-chart-bar-seg.tone-grade-u { fill: var(--c-grade-u); }
.ti-chart-bar-seg.tone-grade-n { fill: var(--c-grade-n); }
.ti-chart-bar-seg.tone-ink     { fill: var(--c-grid); }

/* --- stat tile --- */
.ti-chart-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.ti-chart-stat-value {
    color: var(--c-ink-strong);
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1.1;
}
.ti-chart-stat-label { color: var(--c-ink-strong); font-size: 0.9rem; }
.ti-chart-stat-sub   { color: var(--c-ink); font-size: 0.8rem; }
.ti-chart-stat-bar {
    height: 6px;
    border-radius: 999px;
    background: var(--c-grid);
    overflow: hidden;
    margin-top: 4px;
}
.ti-chart-stat-fill {
    height: 100%;
    width: var(--pct, 0%);
    background: var(--c-series-1);
    border-radius: inherit;
}

/* tabular-nums utility used by chart text (no such class existed before). */
.tabular-nums { font-variant-numeric: tabular-nums; }
```
- [ ] CSS has no automated test. Confirm the appended block is syntactically self-contained (balanced braces) by eye; it is exercised end-to-end in the Task A13 manual verification. No commit-blocking command.
- [ ] Commit:
```
git add packages/web-framework/bin/static/scripts/ti-framework.css
git commit -m "feat(web-framework): append .ti-chart-* CSS contract for gauge/bars/stat (CA-F1)"
```

> Note: the §2.A `--chart-seq-1…5` ramp tokens and `cell-q1…q5`/`tiHatch` are heatmap-only (Phase 1+) and are intentionally NOT added here, per Phase-0 scope.

---

### Task A11: Load `ti-charts.js` (defer + nonce) in the web-framework `index.html`

**Files**
- Modify: `packages/web-framework/bin/static/index.html`

- [ ] Add the script tag immediately after the `ti-framework.js` line (`:9`), before `alpinejs-csp.min.js` (`:10`). `ti-charts.js` defines `window.TiCharts`; Alpine's directive (registered at `alpine:init`) reads it lazily at render time, so exact ordering vs Alpine is not load-critical, but grouping it next to the framework script keeps related scripts adjacent:
```html
    <script defer src="/static/scripts/ti-framework.js" nonce='{ti-nonce-placeholder}'></script>
    <script defer src="/static/scripts/ti-charts.js" nonce='{ti-nonce-placeholder}'></script>
    <script defer src="/static/scripts/lib/alpinejs-csp.min.js" nonce='{ti-nonce-placeholder}'></script>
```
- [ ] Commit:
```
git add packages/web-framework/bin/static/index.html
git commit -m "build(web-framework): load ti-charts.js (defer+nonce) in index.html (CA-F1)"
```

---

### Task A12: Load `ti-charts.js` (defer + nonce) in the competence `index.html`

`ti-charts.js` is served from the framework static dir (resolved by `#locateStaticFile`, `web-app-manager.js:381-412`) — no copy needed; reference the same `/static/scripts/ti-charts.js` path.

**Files**
- Modify: `packages/competence/bin/static/index.html`

- [ ] Add the script tag after the `ti-framework.js` line (`:14`), before `competence-user-interface.js` (`:15`):
```html
    <script defer src="/static/scripts/ti-framework.js" nonce='{ti-nonce-placeholder}'></script>
    <script defer src="/static/scripts/ti-charts.js" nonce='{ti-nonce-placeholder}'></script>
    <script defer src="/static/scripts/competence-user-interface.js" nonce='{ti-nonce-placeholder}'></script>
```
- [ ] Commit:
```
git add packages/competence/bin/static/index.html
git commit -m "build(competence): load ti-charts.js (defer+nonce) in index.html (CA-F1)"
```

---

### Task A13: MANUAL verification — render gauge + bars + stat in a scratch fragment, both themes

This is a **manual verification step, not an automated test** — there is no DOM/jsdom harness. Use a throwaway scratch chart wired into the existing dashboard fragment so it renders through the real Alpine CSP runtime + real CSP headers, then REVERT the scratch markup before finishing CA-F1.

**Files**
- Temporary (scratch, reverted after): `packages/competence/bin/static/fragments/frame-dashboard.html` + a scratch spec getter in `packages/competence/bin/static/scripts/competence-user-interface.js`

- [ ] Run the full pure-helper suite one last time as the automated gate:
  `node --test packages/web-framework/test/ti-charts.test.js` → expected PASS (every A1–A7 assertion green).
- [ ] Launch the app using the project's run/verify skill (invoke `/run` — it discovers the competence launch entry `packages/competence/bin/competence-web-server.js` and the Redis dependency; do NOT hand-roll a launch command). The framework static-file cache is on unless `TI_WEB_APP_STATIC_CACHE_DISABLED=true` (gated by `#staticFileCacheEnabled`, `web-app-manager.js:383`), so set that env var before launch (or call the cache-clear path) so edits to `ti-charts.js`/CSS are picked up without a restart.
- [ ] Add a temporary scratch spec getter to the dashboard `Alpine.data` factory in `competence-user-interface.js`, returning a hard-coded Coverage-shaped gauge (with a `sublabel` to exercise the reporting caveat) + a stacked bars spec:
```js
        scratchGauge() {
            return { type: "gauge", a11yLabel: "Scratch coverage 75%",
                     data: { value: 0.75, label: "Coverage", sublabel: "3 / 4 · 75% reporting",
                             rows: [ { id: "se", name: "SE", n: 3, total: 4 }, { id: "qa", name: "QA", n: 1, total: 2 } ] } };
        },
        scratchBars() {
            return { type: "bars", a11yLabel: "Scratch status breakdown", provisional: true,
                     data: { rows: [ { id: "se", label: "SE", total: 4, segments: [
                         { key: "Closed", v: 2, tone: "grade-s" }, { key: "Ready", v: 1, tone: "grade-r" },
                         { key: "Not started", v: 1, tone: "ink" } ] } ] } };
        },
```
- [ ] Add scratch markup near the top of the dashboard root element in `frame-dashboard.html` (the `x-ti-chart="scratchGauge()"` form calls a registered method — CSP-legal, like `getUserName()` at `frame-dashboard.html:49`). Do NOT add an inline `style="..."` attribute (raw style strings trip CSP `style-src`; only Alpine's object-style `x-bind:style="{ '--pct': … }"` setProperty form is allowed, cf. `frame-dashboard.html:68`). For sizing during the scratch test, momentarily add `.ti-chart{max-width:320px}` to `ti-framework.css`, or omit width and let the figures fill:
```html
        <figure class="ti-chart" x-ti-chart="scratchGauge()" role="img" x-bind:aria-label="scratchGauge().a11yLabel"></figure>
        <figure class="ti-chart" x-ti-chart="scratchBars()" role="img" x-bind:aria-label="scratchBars().a11yLabel"></figure>
```
- [ ] Open the dashboard in the browser (use the project's preview/browser tooling). In **daylight** theme, visually confirm: the gauge draws a 270° track with a ~75% accent value-arc, "75%" centred, "Coverage" beneath it, and the "3 / 4 · 75% reporting" sublabel below that; the bars row shows three colored segments (green Closed / blue Ready + a muted "Not started" tail) with the provisional tail dashed and dimmed.
- [ ] Toggle to **glass** theme (top-bar toggle → `toggleTheme()` flips `document.documentElement.dataset.theme` to `glass`, `ti-framework.js:1125-1142`). Confirm the same charts re-theme with ZERO re-render (grade greens/blues shift to the glass palette, ink/grid go light-on-dark) and stay legible over the glass panel blur.
- [ ] Inspect the rendered DOM (devtools): confirm each `<figure>` holds an `<svg role="img">` with a `<title>` equal to the a11yLabel and a sibling `<table class="ti-chart-sr">` mirror (the gauge mirror includes a "Reporting → 3 / 4 · 75% reporting" row); confirm NO chart-internal element has an inline `style=""` attribute and NO CSP violations appear in the browser console.
- [ ] REVERT all scratch changes (remove the two getters from `competence-user-interface.js`, the two `<figure>` blocks from `frame-dashboard.html`, and any temporary `.ti-chart{max-width}` rule from `ti-framework.css`). Confirm `git status` shows only the intended CA-F1 files changed.
- [ ] No commit for the scratch (it is reverted). If anything failed, fix in `ti-charts.js`/CSS, re-run the affected pure-helper test, and re-verify.

---

## Done when

- [ ] `node --test packages/web-framework/test/ti-charts.test.js` passes with every suite from A1–A7 green (module surface, formatting, gauge geometry, bar layout, spec envelope, gauge rows, svgEl CSP discipline).
- [ ] `node --check packages/web-framework/bin/static/scripts/ti-framework.js` exits 0 (the `x-ti-chart` directive parses).
- [ ] `ti-charts.js` exposes `window.TiCharts` AND `module.exports` with all helpers + `renderChart`; the `x-ti-chart` directive is registered at `ti-framework.js:1324` directly after `text-label`.
- [ ] `.ti-chart-*` CSS (including `.ti-chart-sr`, `.ti-chart-gauge-sublabel`, the `tone-*` classes, `.ti-chart-provisional`, and `.tabular-nums`) is appended to `ti-framework.css` and routes only through tokens present in BOTH theme files.
- [ ] Both `index.html`s load `/static/scripts/ti-charts.js` with `defer` + `nonce='{ti-nonce-placeholder}'`.
- [ ] Manual A13 verification confirmed: gauge + stacked bars render correctly in BOTH `daylight` and `glass` themes (live, re-theming with zero re-render), the gauge sublabel/reporting caveat surfaces visually and in the sr-mirror, the provisional tail is dashed/dimmed, every chart carries an `<svg role="img">` + `<title>` + `.ti-chart-sr` mirror, and NO inline `style` / NO CSP console violations appear. All scratch changes reverted; `git status` clean of scratch.

---

**Notes for downstream Phase-0 components (NOT Component A work):**
- **Out of Phase-0 scope, intentionally omitted:** the other five primitives (heatmap/scatter/box/radar/line), the `--chart-seq-1…5` ramp + `cell-q1…q5`/`tiHatch` heatmap tokens, the `@ti-chart:select` CustomEvent interactivity tier, and a `theme-changed` dispatch in `toggleTheme()` (per §2.A/§6 that dispatch is needed ONLY if a primitive bakes resolved colors into `<defs>` — gauge/bars/stat route through CSS vars and do not, so it stays unwired in Phase 0).
- **A11y interactivity** (`tabindex="0"` + `role="button"` + Enter/Space via `addEventListener`) is required only once a primitive becomes drillable; Coverage's Phase-0 gauge/bars are static, so that wiring is deferred to the report-drill task (CA-F4 / Phase 1).
- **Contract for the 0D Insights Coverage screen (CA-F4):** it must emit specs of exactly the shapes contract-tested here — `{ type:"gauge", data:{ value, label, sublabel?, rows:[{id,name,n,total}] } }` (with `value` as a 0..1 ratio for the dial and `sublabel` carrying the "N / total · % reporting" caveat that `renderGauge` now surfaces) and `{ type:"bars", data:{ rows:[{ id, label, total, segments:[{ key, v, tone }] }] } }` with `tone ∈ {grade-s, grade-r, grade-u, ink}` and the literal segment key `"Not started"` for the provisional tail.
