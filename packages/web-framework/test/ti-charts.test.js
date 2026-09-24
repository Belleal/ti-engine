/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const TiCharts = require( "../bin/static/scripts/ti-charts.js" );

describe( "ti-charts module", () => {
    it( "exports the pure helper surface", () => {
        assert.equal( typeof TiCharts.gaugeValueToAngle, "function" );
        assert.equal( typeof TiCharts.gaugeArcPath, "function" );
        assert.equal( typeof TiCharts.barSegments, "function" );
        assert.equal( typeof TiCharts.normalizeSpec, "function" );
        assert.equal( typeof TiCharts.gaugeRowsLayout, "function" );
        assert.equal( typeof TiCharts.svgEl, "function" );
        assert.equal( typeof TiCharts.buildSrTable, "function" );
        assert.equal( typeof TiCharts.renderChart, "function" );
        assert.equal( typeof TiCharts.formatPercent, "function" );
        assert.equal( typeof TiCharts.formatNumber, "function" );
        assert.equal( typeof TiCharts.SVG_NS, "string" );
    } );
    it( "exports the Phase-1 layout helpers", () => {
        assert.equal( typeof TiCharts.scatterLayout, "function" );
        assert.equal( typeof TiCharts.quantileBucket, "function" );
        assert.equal( typeof TiCharts.heatmapLayout, "function" );
        assert.equal( typeof TiCharts.boxLayout, "function" );
        assert.equal( typeof TiCharts.barsGroupedLayout, "function" );
        assert.equal( typeof TiCharts.barsDivergingLayout, "function" );
        assert.equal( typeof TiCharts.radarLayout, "function" );
    } );
} );

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
        const s = TiCharts.normalizeSpec( { type: "sankey", data: { rows: [] } } );
        assert.equal( s.type, "unsupported" );
        assert.deepEqual( s.data, {} );
    } );
    it( "preserves the Phase-1 types (scatter, heatmap, box)", () => {
        assert.equal( TiCharts.normalizeSpec( { type: "scatter", data: { points: [] } } ).type, "scatter" );
        assert.equal( TiCharts.normalizeSpec( { type: "heatmap", data: { rows: [], cols: [], cells: [] } } ).type, "heatmap" );
        assert.equal( TiCharts.normalizeSpec( { type: "box", data: { groups: [] } } ).type, "box" );
    } );
    it( "returns an unsupported spec for null/garbage input", () => {
        assert.equal( TiCharts.normalizeSpec( null ).type, "unsupported" );
        assert.equal( TiCharts.normalizeSpec( 42 ).type, "unsupported" );
    } );
} );

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
    it( "guards value: NaN — yields ratio 0 and width 0", () => {
        const rows = TiCharts.gaugeRowsLayout( [ { id: "nan", name: "NaN row", value: NaN } ], { width: 100 } );
        assert.equal( rows[ 0 ].ratio, 0 );
        assert.equal( rows[ 0 ].width, 0 );
    } );
} );

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

/* ============================ Phase 1A primitives ============================ */

describe( "ti-charts — scatterLayout (R3 alignment)", () => {
    it( "maps (xMin,yMax) to top-left and (xMax,yMin) to bottom-right (y inverted), default domain 0..1.3", () => {
        const l = TiCharts.scatterLayout( [ { id: "a", x: 0, y: 1.3 }, { id: "b", x: 1.3, y: 0 } ], {} );
        assert.deepEqual( { cx: l.points[ 0 ].cx, cy: l.points[ 0 ].cy }, { cx: 10, cy: 10 } );
        assert.deepEqual( { cx: l.points[ 1 ].cx, cy: l.points[ 1 ].cy }, { cx: 90, cy: 90 } );
    } );
    it( "clamps out-of-domain points into the plot box", () => {
        const l = TiCharts.scatterLayout( [ { id: "a", x: 5, y: -2 } ], {} );
        assert.equal( l.points[ 0 ].cx, 90 );  // x clamped to 1.3
        assert.equal( l.points[ 0 ].cy, 90 );  // y clamped to 0
    } );
    it( "scales bubble radius by z when options.bubble === 'z'", () => {
        const l = TiCharts.scatterLayout( [ { id: "a", x: 0.5, y: 0.5, z: 1 } ], { bubble: "z", zMax: 2 } );
        assert.equal( l.points[ 0 ].r, 2.7 );  // 1.4 + (1/2)*(4-1.4)
    } );
    it( "uses rDefault when no bubble option", () => {
        const l = TiCharts.scatterLayout( [ { id: "a", x: 0.5, y: 0.5, z: 1 } ], {} );
        assert.equal( l.points[ 0 ].r, 2.2 );
    } );
    it( "emits a diagonal only when opts.diagonal is set, and midlines from opts.midX/midY", () => {
        const without = TiCharts.scatterLayout( [], {} );
        assert.equal( without.diagonal, null );
        const l = TiCharts.scatterLayout( [], { diagonal: true, midX: 1.0, midY: 1.0 } );
        assert.deepEqual( l.diagonal, { x1: 10, y1: 90, x2: 90, y2: 10 } );
        assert.equal( l.midX.x, 71.54 );  // 10 + (1/1.3)*80
        assert.equal( l.midY.y, 28.46 );  // 10 + 80 - (1/1.3)*80
    } );
    it( "anonymize strips labels; otherwise carries id/label/tone and the original x/y/z", () => {
        const anon = TiCharts.scatterLayout( [ { id: "a", x: 0.5, y: 0.5, label: "Ann", tone: "grade-s" } ], { anonymize: true } );
        assert.equal( anon.points[ 0 ].label, "" );
        const named = TiCharts.scatterLayout( [ { id: "a", x: 0.4, y: 0.6, z: 0.9, label: "Ann", tone: "grade-s" } ], {} );
        assert.equal( named.points[ 0 ].label, "Ann" );
        assert.equal( named.points[ 0 ].tone, "grade-s" );
        assert.deepEqual( { x: named.points[ 0 ].x, y: named.points[ 0 ].y, z: named.points[ 0 ].z }, { x: 0.4, y: 0.6, z: 0.9 } );
    } );
} );

describe( "ti-charts — quantileBucket (R4 sequential)", () => {
    it( "nearest-rank buckets 1..5 across a spread", () => {
        const v = [ 1, 2, 3, 4, 5 ];
        assert.equal( TiCharts.quantileBucket( v, 1 ), 1 );
        assert.equal( TiCharts.quantileBucket( v, 3 ), 3 );
        assert.equal( TiCharts.quantileBucket( v, 5 ), 5 );
    } );
    it( "collapses all-equal and empty inputs to the middle bucket", () => {
        assert.equal( TiCharts.quantileBucket( [ 2, 2, 2 ], 2 ), 3 );
        assert.equal( TiCharts.quantileBucket( [], 7 ), 3 );
    } );
    it( "clamps a below-range value to bucket 1 and honours a custom bucket count", () => {
        assert.equal( TiCharts.quantileBucket( [ 10, 20, 30 ], 5 ), 1 );
        assert.equal( TiCharts.quantileBucket( [ 1, 2, 3, 4 ], 4, 4 ), 4 );
    } );
} );

describe( "ti-charts — heatmapLayout (R4)", () => {
    const rows = [ { id: "E1", label: "E1" }, { id: "E2", label: "E2" } ];
    const cols = [ { id: "SE", label: "SE" }, { id: "BA", label: "BA" }, { id: "PM", label: "PM" } ];

    it( "computes grid geometry: cellW = (width-rowLabelW)/cols, cell positions offset by labels", () => {
        const l = TiCharts.heatmapLayout( rows, cols, [ { r: 0, c: 0, v: 1 }, { r: 1, c: 2, v: 1 } ], {} );
        assert.equal( l.cells[ 0 ].w, 27.33 );             // (100-18)/3
        assert.deepEqual( { x: l.cells[ 0 ].x, y: l.cells[ 0 ].y }, { x: 18, y: 8 } );
        assert.deepEqual( { x: l.cells[ 1 ].x, y: l.cells[ 1 ].y }, { x: 72.66, y: 18 } );
        assert.equal( l.height, 28 );                      // colLabelH 8 + 2*cellH 10
    } );
    it( "sequential: assigns nearest-rank quantile buckets 1..5, monotonic in v, top value at 5", () => {
        const cells = [ { r: 0, c: 0, v: 0.2 }, { r: 0, c: 1, v: 0.6 }, { r: 0, c: 2, v: 1.3 } ];
        const l = TiCharts.heatmapLayout( rows, cols, cells, { scale: "sequential" } );
        assert.ok( l.cells[ 0 ].bucket >= 1 && l.cells[ 0 ].bucket <= 5 );
        assert.ok( l.cells[ 0 ].bucket <= l.cells[ 1 ].bucket && l.cells[ 1 ].bucket <= l.cells[ 2 ].bucket );
        assert.equal( l.cells[ 2 ].bucket, 5 );  // highest value → top bucket
    } );
    it( "diverging: classifies delta sign + magnitude vs cohort max-abs", () => {
        const cells = [ { r: 0, c: 0, delta: -0.4 }, { r: 0, c: 1, delta: 0.2 }, { r: 0, c: 2, delta: 0 } ];
        const l = TiCharts.heatmapLayout( rows, cols, cells, { scale: "diverging" } );
        assert.equal( l.cells[ 0 ].sign, "neg" );
        assert.equal( l.cells[ 0 ].mag, 1 );      // |−0.4| is the cohort max
        assert.equal( l.cells[ 1 ].sign, "pos" );
        assert.equal( l.cells[ 1 ].mag, 0.5 );    // 0.2 / 0.4
        assert.equal( l.cells[ 2 ].sign, "zero" );
    } );
    it( "carries suppressed cells through without a bucket/sign", () => {
        const l = TiCharts.heatmapLayout( rows, cols, [ { r: 0, c: 0, suppressed: true } ], { scale: "sequential" } );
        assert.equal( l.cells[ 0 ].suppressed, true );
        assert.equal( l.cells[ 0 ].bucket, undefined );
    } );
} );

describe( "ti-charts — boxLayout (R5)", () => {
    it( "maps score→y inverted (domain max at top); q3 sits above q1 in pixels", () => {
        const l = TiCharts.boxLayout( [ { id: "S2", label: "S2", min: 60, q1: 80, median: 100, q3: 110, max: 130, n: 4 } ], {} );
        const b = l.boxes[ 0 ];
        assert.ok( b.yMax < b.yMin, "higher score (max) is a smaller pixel than min" );
        assert.ok( b.yQ3 < b.yQ1, "q3 (higher score) is above q1" );
        assert.equal( b.yMed, 25.33 );  // 60 - (100/150)*52
    } );
    it( "spaces boxes evenly and maps expected/mean/reference", () => {
        const l = TiCharts.boxLayout(
            [ { id: "J1", label: "J1", min: 50, q1: 70, median: 90, q3: 100, max: 110, mean: 92, expected: 100, n: 3 },
              { id: "S2", label: "S2", min: 80, q1: 95, median: 105, q3: 115, max: 130, n: 5 } ],
            { reference: [ { v: 105, label: "T3" } ] } );
        assert.equal( l.boxes[ 0 ].cx, 32 );
        assert.equal( l.boxes[ 1 ].cx, 72 );
        assert.ok( typeof l.boxes[ 0 ].yExpected === "number" );
        assert.ok( typeof l.boxes[ 0 ].yMean === "number" );
        assert.equal( l.refs[ 0 ].label, "T3" );
        assert.equal( l.refs[ 0 ].y, 23.6 );  // 60 - (105/150)*52
    } );
    it( "carries a suppressed group without box geometry", () => {
        const l = TiCharts.boxLayout( [ { id: "X1", label: "X1", suppressed: true, n: 1 } ], {} );
        assert.equal( l.boxes[ 0 ].suppressed, true );
        assert.equal( l.boxes[ 0 ].yMed, undefined );
    } );
} );

describe( "ti-charts — bars grouped + diverging layout", () => {
    it( "grouped: sub-bars per row share one global max; widths scale to it", () => {
        const l = TiCharts.barsGroupedLayout(
            [ { id: "jan", label: "Jan", values: [ { key: "planned", v: 3, tone: "grade-r" }, { key: "held", v: 1, tone: "grade-s" } ] } ], {} );
        assert.equal( l.max, 3 );
        assert.equal( l.rows[ 0 ].bars[ 0 ].width, 100 );  // 3/3
        assert.equal( l.rows[ 0 ].bars[ 1 ].width, 33.33 ); // 1/3
        assert.equal( l.rows[ 0 ].bars[ 1 ].subY, 6 );      // i*(barH4+gap2)
    } );
    it( "grouped: zero max yields zero-width bars (no NaN)", () => {
        const l = TiCharts.barsGroupedLayout( [ { id: "x", label: "X", values: [ { key: "a", v: 0 } ] } ], {} );
        assert.equal( l.rows[ 0 ].bars[ 0 ].width, 0 );
    } );
    it( "diverging: positive extends right of centre, negative left, on shared max-abs", () => {
        const l = TiCharts.barsDivergingLayout(
            [ { id: "E1", label: "E1", values: [ { key: "vsSelf", v: 0.3 }, { key: "vsTeam", v: -0.1 } ] } ], {} );
        assert.equal( l.maxAbs, 0.3 );
        assert.equal( l.center, 50 );
        assert.deepEqual( { x: l.rows[ 0 ].bars[ 0 ].x, w: l.rows[ 0 ].bars[ 0 ].width, dir: l.rows[ 0 ].bars[ 0 ].dir }, { x: 50, w: 50, dir: "pos" } );
        assert.deepEqual( { x: l.rows[ 0 ].bars[ 1 ].x, w: l.rows[ 0 ].bars[ 1 ].width, dir: l.rows[ 0 ].bars[ 1 ].dir }, { x: 33.33, w: 16.67, dir: "neg" } );
    } );
} );

/* ---- render smoke tests: exercise the renderers via an injected fake document,
        proving they build SVG with createElementNS + setAttribute only (the style
        Proxy throws on any element.style.* write) and emit an a11y sr-table. ---- */
describe( "ti-charts — Phase-1 renderers (CSP discipline + structure)", () => {
    function makeNode( tag, ns ) {
        return {
            tag: tag, ns: ns || null, attrs: {}, children: [], textContent: "",
            setAttribute( k, v ) { this.attrs[ k ] = String( v ); },
            removeAttribute( k ) { delete this.attrs[ k ]; },
            appendChild( c ) { this.children.push( c ); return c; },
            removeChild( c ) { const i = this.children.indexOf( c ); if ( i >= 0 ) { this.children.splice( i, 1 ); } return c; },
            get firstChild() { return this.children.length ? this.children[ 0 ] : null; },
            style: new Proxy( {}, { set() { throw new Error( "element.style.* is forbidden" ); } } )
        };
    }
    function makeRenderDoc() {
        return { createElement( tag ) { return makeNode( tag, null ); }, createElementNS( ns, tag ) { return makeNode( tag, ns ); } };
    }
    function withDocument( doc, fn ) {
        const had = Object.prototype.hasOwnProperty.call( global, "document" );
        const prev = global.document;
        global.document = doc;
        try { return fn(); } finally { if ( had ) { global.document = prev; } else { delete global.document; } }
    }
    function collect( node, pred, acc ) {
        acc = acc || [];
        const kids = node.children || [];
        for ( let i = 0; i < kids.length; i++ ) {
            if ( pred( kids[ i ] ) ) { acc.push( kids[ i ] ); }
            collect( kids[ i ], pred, acc );
        }
        return acc;
    }
    const svgOf = ( figure ) => figure.children.filter( ( c ) => c.tag === "svg" );
    const srTableOf = ( figure ) => figure.children.filter( ( c ) => c.tag === "table" && c.attrs.class === "ti-chart-sr" );

    it( "scatter: svg + interactive points + diagonal + sr-table; anonymize disables drill", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "scatter", a11yLabel: "Alignment",
            data: { diagonal: true, points: [ { id: "e1", x: 1.0, y: 1.2, tone: "grade-s", label: "Ann" } ] },
            options: { midX: 1.0, midY: 1.0 }
        } ) );
        const svg = svgOf( figure );
        assert.equal( svg.length, 1 );
        const circles = collect( svg[ 0 ], ( n ) => n.tag === "circle" );
        assert.equal( circles.length, 1 );
        assert.ok( circles[ 0 ].attrs.class.indexOf( "ti-chart-scatter-pt" ) >= 0 );
        assert.equal( circles[ 0 ].attrs.tabindex, "0" );    // drillable
        assert.equal( circles[ 0 ].attrs.role, "button" );
        assert.equal( collect( svg[ 0 ], ( n ) => n.attrs && n.attrs.class === "ti-chart-scatter-diag" ).length, 1 );
        assert.equal( srTableOf( figure ).length, 1 );

        const anon = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( anon, {
            type: "scatter", a11yLabel: "Alignment",
            data: { points: [ { id: "e1", x: 1.0, y: 1.2, label: "Ann" } ] }, options: { anonymize: true }
        } ) );
        const anonCircle = collect( svgOf( anon )[ 0 ], ( n ) => n.tag === "circle" )[ 0 ];
        assert.equal( anonCircle.attrs.tabindex, undefined );  // no drill when anonymized
    } );

    it( "heatmap sequential: cell-qN classes; diverging: opacity as a presentation attribute (never style)", () => {
        const rows = [ { id: "E1", label: "E1" } ];
        const cols = [ { id: "SE", label: "SE" }, { id: "BA", label: "BA" } ];
        const seq = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( seq, {
            type: "heatmap", a11yLabel: "Heatmap",
            data: { rows: rows, cols: cols, cells: [ { r: 0, c: 0, v: 0.2 }, { r: 0, c: 1, v: 1.2 } ] }, options: { scale: "sequential" }
        } ) );
        const seqCells = collect( svgOf( seq )[ 0 ], ( n ) => n.tag === "rect" );
        assert.equal( seqCells.length, 2 );
        assert.ok( seqCells.every( ( c ) => /cell-q[1-5]/.test( c.attrs.class ) ) );

        const div = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( div, {
            type: "heatmap", a11yLabel: "Gap",
            data: { rows: rows, cols: cols, cells: [ { r: 0, c: 0, delta: -0.4 }, { r: 0, c: 1, delta: 0.2 } ] }, options: { scale: "diverging" }
        } ) );
        const divCells = collect( svgOf( div )[ 0 ], ( n ) => n.tag === "rect" );
        assert.ok( divCells.some( ( c ) => c.attrs.class.indexOf( "cell-neg" ) >= 0 ) );
        assert.ok( divCells.some( ( c ) => c.attrs.class.indexOf( "cell-pos" ) >= 0 ) );
        assert.ok( divCells.every( ( c ) => typeof c.attrs.opacity === "string" ) );  // opacity is a presentation attr
    } );

    it( "box: box rect + median + whisker + reference line + sr-table", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "box", a11yLabel: "Level distribution",
            data: { groups: [ { id: "S2", label: "S2", min: 60, q1: 80, median: 100, q3: 110, max: 130, mean: 98, expected: 100, n: 5 } ], reference: [ { v: 105, label: "T3" } ] }
        } ) );
        const svg = svgOf( figure )[ 0 ];
        assert.equal( collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-box-box" ).length, 1 );
        assert.equal( collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-box-median" ).length, 1 );
        assert.equal( collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-box-ref" ).length, 1 );
        assert.equal( srTableOf( figure ).length, 1 );
    } );

    it( "bars grouped + diverging modes render distinct structures", () => {
        const grouped = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( grouped, {
            type: "bars", a11yLabel: "Time", options: { mode: "grouped" },
            data: { rows: [ { id: "jan", label: "Jan", values: [ { key: "planned", v: 3, tone: "grade-r" }, { key: "held", v: 1, tone: "grade-s" } ] } ] }
        } ) );
        assert.ok( collect( svgOf( grouped )[ 0 ], ( n ) => n.tag === "rect" ).length >= 2 );

        const diverging = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( diverging, {
            type: "bars", a11yLabel: "Drivers", options: { mode: "diverging" },
            data: { rows: [ { id: "E1", label: "E1", values: [ { key: "vsSelf", v: 0.3 }, { key: "vsTeam", v: -0.1 } ] } ] }
        } ) );
        const svg = svgOf( diverging )[ 0 ];
        assert.equal( collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-bar-axis" ).length, 1 );  // zero axis
        assert.ok( collect( svg, ( n ) => n.tag === "rect" ).length >= 2 );
    } );

    it( "bars grouped: spec.options.legend renders a swatch legend; valueLabels adds one value text per bar", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Source comparison",
            options: {
                mode: "grouped", valueLabels: true,
                legend: [ { label: "Self", tone: "grade-s" }, { label: "Manager", tone: "grade-r" }, { label: "Team", tone: "info" } ]
            },
            data: { rows: [ { id: "E", label: "Expertise", values: [ { key: "self", v: 1.1, tone: "grade-s" }, { key: "manager", v: 0.9, tone: "grade-r" }, { key: "team", v: 1.0, tone: "info" } ] } ] }
        } ) );
        const legend = figure.children.find( ( c ) => c.tag === "div" && c.className === "ti-chart-legend" );
        assert.ok( legend, "a legend div is appended below the grouped chart" );
        const swatches = collect( legend, ( n ) => n.tag === "span" && ( n.className || "" ).indexOf( "ti-chart-legend-swatch" ) >= 0 );
        assert.equal( swatches.length, 3 );
        assert.ok( swatches.some( ( s ) => ( s.className || "" ).indexOf( "tone-info" ) >= 0 ) );   // team swatch carries its tone
        // one row label (.ti-chart-bar-label) + one value caption (.ti-chart-bar-value) per bar (3). The value caption
        // does NOT carry .ti-chart-bar-label, so its font-size presentation attribute is not overridden by that CSS rule.
        const rowLabels = collect( svgOf( figure )[ 0 ], ( n ) => n.tag === "text" && n.attrs && n.attrs.class === "ti-chart-bar-label" );
        assert.equal( rowLabels.length, 1 );
        const valueCaptions = collect( svgOf( figure )[ 0 ], ( n ) => n.tag === "text" && n.attrs && ( n.attrs.class || "" ).indexOf( "ti-chart-bar-value" ) >= 0 );
        assert.equal( valueCaptions.length, 3 );
        assert.ok( valueCaptions.every( ( t ) => ( t.attrs.class || "" ).indexOf( "ti-chart-bar-label" ) < 0 ) );
    } );

    it( "bars grouped: no legend element when spec.options.legend is absent", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Source comparison", options: { mode: "grouped" },
            data: { rows: [ { id: "E", label: "Expertise", values: [ { key: "self", v: 1.1 } ] } ] }
        } ) );
        assert.equal( figure.children.filter( ( c ) => c.tag === "div" && c.className === "ti-chart-legend" ).length, 0 );
    } );

    it( "bars grouped: barThickness sets the bar height and valueFontSize sizes the value caption", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Source comparison",
            options: { mode: "grouped", valueLabels: true, barThickness: 1.5, valueFontSize: 2.2 },
            data: { rows: [ { id: "E", label: "Expertise", values: [ { key: "self", v: 1.1 }, { key: "manager", v: 0.9 } ] } ] }
        } ) );
        const rects = collect( svgOf( figure )[ 0 ], ( n ) => n.tag === "rect" );
        assert.equal( rects.length, 2 );
        assert.ok( rects.every( ( r ) => r.attrs.height === "1.5" ) );                 // bar height honours barThickness
        const valueTexts = collect( svgOf( figure )[ 0 ], ( n ) => n.tag === "text" && n.attrs && ( n.attrs.class || "" ).indexOf( "ti-chart-bar-value" ) >= 0 );
        assert.equal( valueTexts.length, 2 );
        assert.ok( valueTexts.every( ( t ) => t.attrs[ "font-size" ] === "2.2" ) );    // value caption honours valueFontSize
    } );

    it( "bars grouped: without the unit options the bars are 8px and the value caption is left to the stylesheet", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Source comparison", options: { mode: "grouped", valueLabels: true },
            data: { rows: [ { id: "E", label: "Expertise", values: [ { key: "self", v: 1.1 }, { key: "team", v: 0.55 } ] } ] }
        } ) );
        const svg = svgOf( figure )[ 0 ];
        assert.equal( svg.attrs.viewBox, undefined );                                   // the pixel layout
        const rects = collect( svg, ( n ) => n.tag === "rect" );
        assert.ok( rects.every( ( r ) => r.attrs.height === "8" ) );
        assert.deepEqual( rects.map( ( r ) => r.attrs.width ), [ "86%", "43%" ] );       // one shared max, short of the captions' gutter
        const valueTexts = collect( svg, ( n ) => n.tag === "text" && n.attrs && ( n.attrs.class || "" ).indexOf( "ti-chart-bar-value" ) >= 0 );
        // No font-size attribute: .ti-chart-bar-value:not([font-size]) sizes it in pixels. With the attribute, as the
        // unit layout set it, the rule could not reach it and the caption scaled with the card.
        assert.ok( valueTexts.every( ( t ) => t.attrs[ "font-size" ] === undefined ) );
        assert.deepEqual( valueTexts.map( ( t ) => [ t.attrs.x, t.attrs.dx ] ), [ [ "86%", "6" ], [ "43%", "6" ] ] );
    } );

    it( "bars grouped: barThickness alone keeps the unit layout but leaves the caption's size to the stylesheet", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Source comparison", options: { mode: "grouped", valueLabels: true, barThickness: 1.5 },
            data: { rows: [ { id: "E", label: "Expertise", values: [ { key: "self", v: 1.1 } ] } ] }
        } ) );
        const svg = svgOf( figure )[ 0 ];
        assert.match( svg.attrs.viewBox, /^0 0 100 / );
        const valueText = collect( svg, ( n ) => n.tag === "text" && n.attrs && ( n.attrs.class || "" ).indexOf( "ti-chart-bar-value" ) >= 0 )[ 0 ];
        assert.equal( valueText.attrs[ "font-size" ], undefined );
    } );

    it( "bars stacked: pixel layout — no viewBox, percentage segments, 10px bars, height from the row count alone", () => {
        const render = ( rowCount ) => {
            const figure = makeNode( "figure" );
            const rows = [];
            for ( let i = 0; i < rowCount; i++ ) {
                rows.push( { id: "r" + i, label: "Row " + i, valueLabel: "50%", segments: [ { key: "Closed", v: 3, tone: "grade-s" }, { key: "Open", v: 1 } ] } );
            }
            withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, { type: "bars", a11yLabel: "Coverage", data: { rows: rows } } ) );
            return svgOf( figure )[ 0 ];
        };
        const one = render( 1 );
        const four = render( 4 );
        assert.equal( one.attrs.class, "ti-chart-flow" );
        assert.equal( one.attrs.viewBox, undefined );
        const rects = collect( four, ( n ) => n.tag === "rect" );
        assert.deepEqual( rects.slice( 0, 2 ).map( ( r ) => [ r.attrs.x, r.attrs.width, r.attrs.height ] ), [ [ "0%", "75%", "10" ], [ "75%", "25%", "10" ] ] );
        // Each extra row adds one caption band, one bar and one gap — the rhythm never depends on the card's width.
        assert.equal( Number( four.attrs.height ) - Number( one.attrs.height ), 3 * ( 18 + 10 + 12 ) );
        const values = collect( four, ( n ) => n.tag === "text" && n.attrs[ "text-anchor" ] === "end" );
        assert.ok( values.length === 4 && values.every( ( t ) => t.attrs.x === "100%" ) );
    } );

    it( "bars diverging: pixel layout — the zero axis at 50%, bars either side of it in percent", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "bars", a11yLabel: "Drivers", options: { mode: "diverging" },
            data: { rows: [ { id: "E1", label: "E1", values: [ { key: "vsSelf", v: 0.4 }, { key: "vsTeam", v: -0.2 } ] } ] }
        } ) );
        const svg = svgOf( figure )[ 0 ];
        assert.equal( svg.attrs.viewBox, undefined );
        const axis = collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-bar-axis" )[ 0 ];
        assert.equal( axis.attrs.x1, "50%" );
        const rects = collect( svg, ( n ) => n.tag === "rect" );
        assert.deepEqual( rects.map( ( r ) => [ r.attrs.x, r.attrs.width, r.attrs.height ] ), [ [ "50%", "50%", "8" ], [ "25%", "25%", "8" ] ] );
    } );

    it( "heatmap: the viewBox takes options.width, so a wider grid is not cut off at 100 units", () => {
        const figure = makeNode( "figure" );
        const cols = [ "SE", "BA", "QE", "PM" ].map( ( id ) => ( { id: id, label: id } ) );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "heatmap", a11yLabel: "Heatmap", options: { width: 160, rowLabelW: 20 },
            data: { rows: [ { id: "E1", label: "E1" } ], cols: cols, cells: cols.map( ( c, i ) => ( { r: 0, c: i, v: i } ) ) }
        } ) );
        const svg = svgOf( figure )[ 0 ];
        assert.match( svg.attrs.viewBox, /^0 0 160 / );
        const cells = collect( svg, ( n ) => n.tag === "rect" );
        const right = Math.max( ...cells.map( ( c ) => Number( c.attrs.x ) + Number( c.attrs.width ) ) );
        assert.equal( right, 160 );                                                       // was drawn out to 160 inside a 100-wide viewBox
    } );

    it( "a11yHeaders replaces the screen-reader table's headers by position; a missing entry keeps the default", () => {
        const headersOf = ( figure ) => srTableOf( figure )[ 0 ].children[ 0 ].children[ 0 ].children.map( ( th ) => th.textContent );
        const scatter = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( scatter, {
            type: "scatter", a11yLabel: "Съвпадение", a11yHeaders: [ "Служител", "Ръководител", "Самооценка" ],
            data: { points: [ { id: "e1", x: 1, y: 1.1, label: "Ann" } ] }
        } ) );
        assert.deepEqual( headersOf( scatter ), [ "Служител", "Ръководител", "Самооценка", "Team" ] );

        const radar = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( radar, {
            type: "radar", a11yLabel: "Profile", a11yHeaders: [ "Подкатегория", "", "Ръководител" ],
            data: { axes: [ { id: "E1", max: 1.3 } ], series: [ { key: "self", values: { E1: 1 } }, { key: "manager", values: { E1: 1.1 } } ] }
        } ) );
        assert.deepEqual( headersOf( radar ), [ "Подкатегория", "self", "Ръководител" ] );   // "" keeps the series key
    } );

    it( "gauge: data.sublabelName names the sublabel's row in the screen-reader table", () => {
        const rowsOf = ( figure ) => srTableOf( figure )[ 0 ].children[ 1 ].children.map( ( tr ) => tr.children.map( ( td ) => td.textContent ) );
        const named = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( named, {
            type: "gauge", a11yLabel: "Обхват", data: { value: 0.5, label: "Завършени", sublabel: "10 / 20", sublabelName: "Приключени" }
        } ) );
        assert.deepEqual( rowsOf( named )[ 1 ], [ "Приключени", "10 / 20" ] );
        const unnamed = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( unnamed, { type: "gauge", a11yLabel: "Coverage", data: { value: 0.5, sublabel: "10 / 20" } } ) );
        assert.deepEqual( rowsOf( unnamed )[ 1 ], [ "Reporting", "10 / 20" ] );
    } );

    it( "box: a box's accessible name calls the median by its a11yHeaders name", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "box", a11yLabel: "Нива", a11yHeaders: [ "Ниво", "Мин", "Q1", "Медиана" ],
            data: { groups: [ { id: "S2", label: "S2", min: 60, q1: 80, median: 100, q3: 110, max: 130, n: 5 } ] }
        } ) );
        const box = collect( svgOf( figure )[ 0 ], ( n ) => n.attrs && n.attrs.class === "ti-chart-box-box" )[ 0 ];
        assert.equal( box.attrs[ "aria-label" ], "S2: 80–110, Медиана 100" );
    } );

    it( "line: a sparkline's svg is marked, so the stylesheet can keep its dots small", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "line", a11yLabel: "Trend", options: { sparkline: true },
            data: { x: [ { id: "a" }, { id: "b" } ], series: [ { key: "mean", values: [ 1, 2 ] } ] }
        } ) );
        assert.equal( svgOf( figure )[ 0 ].attrs.class, "ti-chart-sparkline" );
    } );

    it( "radar: rings + axis labels + one polygon per series + sr-table; data-ti-chart-type set", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "radar", a11yLabel: "Profile",
            data: {
                axes: [ { id: "E1", label: "E1", max: 1.3 }, { id: "I1", label: "I1", max: 1.3 }, { id: "C1", label: "C1", max: 1.3 } ],
                series: [ { key: "self", tone: "grade-s", values: { E1: 1.3, I1: 1.0, C1: 0.6 } }, { key: "expected", style: "dashed", values: { E1: 1.0, I1: 1.0, C1: 1.0 } } ]
            }
        } ) );
        assert.equal( figure.attrs[ "data-ti-chart-type" ], "radar" );
        const svg = svgOf( figure )[ 0 ];
        const polys = collect( svg, ( n ) => n.tag === "polygon" );
        const rings = polys.filter( ( p ) => p.attrs.class === "ti-chart-radar-ring" );
        const seriesPolys = polys.filter( ( p ) => p.attrs.class && p.attrs.class.indexOf( "ti-chart-radar-poly" ) >= 0 );
        assert.equal( rings.length, 4 );                 // default 4 rings
        assert.equal( seriesPolys.length, 2 );           // self + expected
        assert.equal( collect( svg, ( n ) => n.attrs && n.attrs.class === "ti-chart-radar-axis-label" ).length, 3 );
        // the dashed "expected" series is unfilled with a stroke-dasharray presentation attr (not element.style)
        const expected = seriesPolys.find( ( p ) => p.attrs[ "stroke-dasharray" ] );
        assert.ok( expected && expected.attrs.fill === "none" );
        assert.equal( srTableOf( figure ).length, 1 );
    } );

    it( "radar: spec.options.legend renders a swatch legend including a dashed (expected) entry", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "radar", a11yLabel: "Profile",
            options: { legend: [ { label: "Self", tone: "grade-s" }, { label: "Expected", dashed: true } ] },
            data: {
                axes: [ { id: "E1", label: "E1", max: 1.3 }, { id: "I1", label: "I1", max: 1.3 }, { id: "C1", label: "C1", max: 1.3 } ],
                series: [ { key: "self", tone: "grade-s", values: { E1: 1.3, I1: 1.0, C1: 0.6 } }, { key: "expected", style: "dashed", values: { E1: 1.0, I1: 1.0, C1: 1.0 } } ]
            }
        } ) );
        const legend = figure.children.find( ( c ) => c.tag === "div" && c.className === "ti-chart-legend" );
        assert.ok( legend, "a legend div is appended below the radar" );
        const swatches = collect( legend, ( n ) => n.tag === "span" && ( n.className || "" ).indexOf( "ti-chart-legend-swatch" ) >= 0 );
        assert.equal( swatches.length, 2 );
        assert.ok( swatches.some( ( s ) => ( s.className || "" ).indexOf( "is-dashed" ) >= 0 ) );   // dashed swatch for the expected curve
    } );

    it( "radar: a per-axis tone applies a tone- class to that axis label (for category-coloured axes)", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "radar", a11yLabel: "Profile",
            data: {
                axes: [ { id: "E1", label: "E1", max: 1.3, tone: "cat-e" }, { id: "I1", label: "I1", max: 1.3, tone: "cat-i" }, { id: "C1", label: "C1", max: 1.3, tone: "cat-c" } ],
                series: [ { key: "self", tone: "self", values: { E1: 1.0, I1: 1.0, C1: 1.0 } } ]
            }
        } ) );
        const labels = collect( svgOf( figure )[ 0 ], ( n ) => n.attrs && n.attrs.class && n.attrs.class.indexOf( "ti-chart-radar-axis-label" ) >= 0 );
        assert.equal( labels.length, 3 );
        assert.ok( labels.some( ( l ) => l.attrs.class.indexOf( "tone-cat-e" ) >= 0 ) );
        assert.ok( labels.every( ( l ) => /tone-cat-[eic]/.test( l.attrs.class ) ) );
    } );

    it( "line: band area + per-series polyline(s) + dots + sr-table; data-ti-chart-type set", () => {
        const figure = makeNode( "figure" );
        withDocument( makeRenderDoc(), () => TiCharts.renderChart( figure, {
            type: "line", a11yLabel: "Overall trend",
            data: {
                x: [ { id: "2025-H2", label: "25H2" }, { id: "2026-H1", label: "26H1" }, { id: "2026-H2", label: "26H2" } ],
                series: [
                    { key: "mean", tone: "grade-s", values: [ 100, 108, 112 ], band: [ [ 90, 110 ], [ 98, 116 ], [ 102, 120 ] ] },
                    { key: "expected", style: "dashed", values: [ 105, 105, 105 ] }
                ]
            },
            options: { provisionalLastPoint: true }
        } ) );
        assert.equal( figure.attrs[ "data-ti-chart-type" ], "line" );
        const svg = svgOf( figure )[ 0 ];
        const polylines = collect( svg, ( n ) => n.tag === "polyline" );
        assert.ok( polylines.length >= 2 );                                            // mean + expected (+ provisional split)
        assert.ok( collect( svg, ( n ) => n.attrs && n.attrs.class && n.attrs.class.indexOf( "ti-chart-line-band" ) >= 0 ).length >= 1 );
        assert.ok( polylines.some( ( p ) => p.attrs[ "stroke-dasharray" ] ) );          // dashed series via presentation attr (never element.style)
        assert.equal( srTableOf( figure ).length, 1 );
    } );
} );

describe( "ti-charts — radarLayout (P3)", () => {
    const axes = [ { id: "E1", label: "E1", max: 1.3 }, { id: "I1", label: "I1", max: 1.3 }, { id: "C1", label: "C1", max: 1.3 }, { id: "C2", label: "C2", max: 1.3 } ];

    it( "spaces N axes evenly clockwise from the top (-90°)", () => {
        const l = TiCharts.radarLayout( axes, [], {} );
        assert.equal( l.axes.length, 4 );
        assert.equal( l.axes[ 0 ].angle, -90 );          // first axis at top
        assert.equal( l.axes[ 1 ].angle, 0 );            // -90 + 360/4
        assert.equal( l.axes[ 2 ].angle, 90 );
    } );
    it( "places a value at max on the rim and 0 at the centre; clamps value>max", () => {
        const l = TiCharts.radarLayout( axes, [ { key: "s", values: { E1: 1.3, I1: 0, C1: 2.6 } } ], { cx: 50, cy: 50, rMax: 36 } );
        const dots = l.series[ 0 ].dots;
        const e1 = dots.find( ( d ) => d.axisId === "E1" );   // max → rim: distance 36 from centre (top → y = 50-36 = 14)
        const i1 = dots.find( ( d ) => d.axisId === "I1" );   // 0 → centre
        const c1 = dots.find( ( d ) => d.axisId === "C1" );   // 2.6 clamped to max → rim
        assert.equal( Math.round( Math.hypot( e1.x - 50, e1.y - 50 ) ), 36 );
        assert.deepEqual( { x: i1.x, y: i1.y }, { x: 50, y: 50 } );
        assert.equal( Math.round( Math.hypot( c1.x - 50, c1.y - 50 ) ), 36 );
    } );
    it( "emits a points string with one vertex per axis + the default 4 rings", () => {
        const l = TiCharts.radarLayout( axes, [ { key: "s", values: { E1: 1, I1: 1, C1: 1, C2: 1 } } ], {} );
        assert.equal( l.series[ 0 ].points.split( " " ).length, 4 );
        assert.equal( l.rings.length, 4 );
    } );
} );

describe( "ti-charts — lineLayout (CA-X1)", () => {

    it( "maps the first x to padL and the last to W-padR, value@yMax to the top and @yMin to the bottom", () => {
        const l = TiCharts.lineLayout( [ { key: "score", values: [ 10, 20, 30 ] } ], { xCount: 3, width: 100, height: 60 } );
        assert.equal( l.yMin, 10 );
        assert.equal( l.yMax, 30 );
        const dots = l.series[ 0 ].dots;
        assert.equal( dots[ 0 ].x, l.padL );                 // first point at the left padding
        assert.equal( dots[ 2 ].x, l.W - l.padR );           // last point at the right edge
        assert.equal( dots[ 2 ].y, l.padT );                 // yMax → top
        assert.equal( dots[ 0 ].y, l.padT + l.innerH );      // yMin → bottom
    } );

    it( "pins the y-domain floor to 0 when zeroBaseline is set", () => {
        const l = TiCharts.lineLayout( [ { key: "gap", values: [ 10, 20, 30 ] } ], { xCount: 3, zeroBaseline: true } );
        assert.equal( l.yMin, 0 );
    } );

    it( "lifts yMax to cover a series band's upper edge and emits a band polygon string", () => {
        const l = TiCharts.lineLayout( [ { key: "mean", values: [ 2, 3 ], band: [ [ 1, 9 ], [ 1, 9 ] ] } ], { xCount: 2 } );
        assert.equal( l.yMax, 9 );
        assert.ok( typeof l.series[ 0 ].band === "string" && l.series[ 0 ].band.length > 0 );
    } );

    it( "breaks the polyline into separate segments around a null gap (no phantom point)", () => {
        const l = TiCharts.lineLayout( [ { key: "s", values: [ 1, null, 3 ] } ], { xCount: 3 } );
        assert.equal( l.series[ 0 ].segments.length, 2 );
        assert.equal( l.series[ 0 ].dots.length, 2 );
    } );

} );

/* ===================== ink sized in pixels (the measured scale) ===================== */

describe( "ti-charts — the measured scale (--ti-chart-u)", () => {
    // A fake DOM whose style accepts custom properties through setProperty only — the one CSP-legal way to style an
    // element from script. getBoundingClientRect answers `box.transformed`: what a CSS transform would make of the
    // layout size, which the measurement must not use.
    function makeMeasuredDoc( box ) {
        const node = ( tag, ns ) => {
            const n = {
                tag: tag, ns: ns || null, attrs: {}, children: [], textContent: "", props: {},
                setAttribute( k, v ) { this.attrs[ k ] = String( v ); },
                getAttribute( k ) { return ( k in this.attrs ) ? this.attrs[ k ] : null; },
                removeAttribute( k ) { delete this.attrs[ k ]; },
                appendChild( c ) { this.children.push( c ); return c; },
                removeChild( c ) { const i = this.children.indexOf( c ); if ( i >= 0 ) { this.children.splice( i, 1 ); } return c; },
                get firstChild() { return this.children.length ? this.children[ 0 ] : null; },
                getBoundingClientRect() { return box.transformed || box.current; }
            };
            const style = {
                setProperty( name, value ) {
                    if ( name.indexOf( "--" ) !== 0 ) {
                        throw new Error( "only --custom properties may be set" );
                    }
                    n.props[ name ] = value;
                }
            };
            n.style = new Proxy( style, { set() { throw new Error( "element.style.* is forbidden" ); } } );
            return n;
        };
        return { createElement( tag ) { return node( tag ); }, createElementNS( ns, tag ) { return node( tag, ns ); } };
    }
    function withGlobals( globals, fn ) {
        const saved = Object.keys( globals ).map( ( k ) => [ k, Object.prototype.hasOwnProperty.call( global, k ), global[ k ] ] );
        Object.assign( global, globals );
        try {
            return fn();
        } finally {
            for ( const [ k, had, prev ] of saved ) {
                if ( had ) { global[ k ] = prev; } else { delete global[ k ]; }
            }
        }
    }
    // Stands in for the browser's ResizeObserver: report() delivers what the browser would after a layout, each record
    // carrying the observed element's layout size as its content rect.
    function stubResizeObserver( box ) {
        const observers = [];
        class StubResizeObserver {
            constructor( callback ) { this.callback = callback; this.targets = []; this.observeCalls = 0; observers.push( this ); }
            observe( target ) { this.targets.push( target ); this.observeCalls += 1; }
            unobserve( target ) { this.targets = this.targets.filter( ( t ) => t !== target ); }
            report() { this.callback( this.targets.map( ( t ) => ( { target: t, contentRect: box.current } ) ) ); }
        }
        return { observers: observers, ResizeObserver: StubResizeObserver };
    }
    const svgOf = ( figure ) => figure.children.find( ( c ) => c.tag === "svg" );
    const lineSpec = { type: "line", a11yLabel: "Trend", data: { x: [ { id: "a" }, { id: "b" } ], series: [ { key: "mean", values: [ 1, 2 ] } ] } };

    it( "unitsPerPixel is the reciprocal of the tighter axis scale, and null while the svg has no size", () => {
        assert.equal( TiCharts.unitsPerPixel( { width: 100, height: 60 }, { width: 640, height: 384 } ), 0.1563 );
        // max-height clamped the box: "meet" fits the drawing to the height, so the height sets the scale
        assert.equal( TiCharts.unitsPerPixel( { width: 100, height: 100 }, { width: 700, height: 460 } ), 0.2174 );
        assert.equal( TiCharts.unitsPerPixel( { width: 100, height: 60 }, { width: 0, height: 0 } ), null );   // display: none
        assert.equal( TiCharts.unitsPerPixel( { width: 0, height: 0 }, { width: 640, height: 384 } ), null );
        assert.equal( TiCharts.unitsPerPixel( null, { width: 640, height: 384 } ), null );
    } );

    it( "measures the svg when the observer reports — after a resize, and after a re-render at an unchanged size", () => {
        const box = { current: { width: 640, height: 384 } };
        const stub = stubResizeObserver( box );
        const doc = makeMeasuredDoc( box );
        withGlobals( { document: doc, ResizeObserver: stub.ResizeObserver }, () => {
            const figure = doc.createElement( "figure" );
            TiCharts.renderChart( figure, lineSpec );
            assert.equal( stub.observers.length, 1 );
            const first = svgOf( figure );
            assert.deepEqual( stub.observers[ 0 ].targets, [ first ] );       // the svg itself, whose layout size counts
            assert.equal( first.props[ "--ti-chart-u" ], undefined );         // no synchronous layout read during render
            stub.observers[ 0 ].report();
            assert.equal( first.props[ "--ti-chart-u" ], "0.1563" );          // 100 units over 640px

            box.current = { width: 320, height: 192 };                        // the card narrows
            stub.observers[ 0 ].report();
            assert.equal( first.props[ "--ti-chart-u" ], "0.3125" );

            // A new spec on the same card: the new svg is a new observation, so it is reported although nothing
            // changed size — and the one it replaced is no longer watched.
            TiCharts.renderChart( figure, lineSpec );
            const second = svgOf( figure );
            assert.notEqual( second, first );
            assert.equal( stub.observers.length, 1, "one observer per figure, however often it renders" );
            assert.deepEqual( stub.observers[ 0 ].targets, [ second ] );
            stub.observers[ 0 ].report();
            assert.equal( second.props[ "--ti-chart-u" ], "0.3125" );
        } );
    } );

    it( "sizes by the layout box, not a transformed one — a chart measured mid-animation keeps its text right", () => {
        // A dialog scaling in at 0.5: getBoundingClientRect would say 320px, and u would come out twice too large.
        const box = { current: { width: 640, height: 384 }, transformed: { width: 320, height: 192 } };
        const stub = stubResizeObserver( box );
        const doc = makeMeasuredDoc( box );
        withGlobals( { document: doc, ResizeObserver: stub.ResizeObserver }, () => {
            const figure = doc.createElement( "figure" );
            TiCharts.renderChart( figure, lineSpec );
            stub.observers[ 0 ].report();
            assert.equal( svgOf( figure ).props[ "--ti-chart-u" ], "0.1563" );
        } );
    } );

    it( "leaves a hidden card on the unit fallback until it is laid out", () => {
        const box = { current: { width: 0, height: 0 } };
        const stub = stubResizeObserver( box );
        const doc = makeMeasuredDoc( box );
        withGlobals( { document: doc, ResizeObserver: stub.ResizeObserver }, () => {
            const figure = doc.createElement( "figure" );
            TiCharts.renderChart( figure, lineSpec );
            stub.observers[ 0 ].report();
            assert.equal( svgOf( figure ).props[ "--ti-chart-u" ], undefined );
            box.current = { width: 400, height: 240 };                        // shown
            stub.observers[ 0 ].report();
            assert.equal( svgOf( figure ).props[ "--ti-chart-u" ], "0.25" );
        } );
    } );

    it( "never observes bars — their pixel layout has no viewBox, and the stylesheet fixes their scale at 1", () => {
        const box = { current: { width: 640, height: 200 } };
        const stub = stubResizeObserver( box );
        const doc = makeMeasuredDoc( box );
        withGlobals( { document: doc, ResizeObserver: stub.ResizeObserver }, () => {
            const figure = doc.createElement( "figure" );
            TiCharts.renderChart( figure, lineSpec );
            TiCharts.renderChart( figure, { type: "bars", a11yLabel: "Coverage", data: { rows: [ { id: "a", label: "A", segments: [ { key: "Closed", v: 1 } ] } ] } } );
            assert.deepEqual( stub.observers[ 0 ].targets, [] );              // the line's svg released, the bars' never watched
            stub.observers[ 0 ].report();
            assert.deepEqual( svgOf( figure ).props, {} );

            const stat = doc.createElement( "figure" );                       // no svg at all
            TiCharts.renderChart( stat, { type: "stat", a11yLabel: "Score", data: { value: 1, label: "Score" } } );
            assert.deepEqual( stub.observers[ 1 ].targets, [] );
        } );
    } );
} );

describe( "ti-charts — stylesheet: chart ink goes through --ti-chart-u", () => {
    const css = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" ).replace( /\/\*[\s\S]*?\*\//g, "" );
    const tokens = {};
    for ( const m of css.matchAll( /(--fs-[a-z0-9]+):\s*([\d.]+)px;/g ) ) {
        if ( !( m[ 1 ] in tokens ) ) { tokens[ m[ 1 ] ] = m[ 2 ]; }
    }
    // Every chart rule's declarations, keyed by its exact selector.
    const rules = new Map();
    for ( const m of css.matchAll( /([^{}]+)\{([^{}]*)\}/g ) ) {
        const selector = m[ 1 ].trim();
        if ( selector.indexOf( "ti-chart" ) < 0 ) { continue; }
        const decls = rules.get( selector ) || {};
        for ( const d of m[ 2 ].split( ";" ) ) {
            const i = d.indexOf( ":" );
            if ( i > 0 ) { decls[ d.slice( 0, i ).trim() ] = d.slice( i + 1 ).trim(); }
        }
        rules.set( selector, decls );
    }
    // Replaces var(--ti-chart-u, fallback) with u — or with its fallback, as a browser does before any measurement.
    function substituteScale( value, u ) {
        const marker = "var(--ti-chart-u";
        let out = "";
        let i = 0;
        while ( i < value.length ) {
            if ( value.startsWith( marker, i ) ) {
                let depth = 0;
                let j = i;
                for ( ; j < value.length; j++ ) {
                    if ( value[ j ] === "(" ) { depth += 1; }
                    if ( value[ j ] === ")" ) { depth -= 1; if ( depth === 0 ) { break; } }
                }
                const fallback = value.slice( i + marker.length, j ).replace( /^\s*,/, "" );
                out += "(" + ( ( u === null ) ? fallback : String( u ) ) + ")";
                i = j + 1;
            } else {
                out += value[ i ];
                i += 1;
            }
        }
        return out;
    }
    // Evaluates the products and quotients a calc() here is made of.
    function evaluate( expression ) {
        const t = expression.match( /\d+(?:\.\d+)?|[()*/]/g );
        let pos = 0;
        const factor = () => {
            const token = t[ pos++ ];
            if ( token === "(" ) { const v = product(); pos += 1; return v; }
            return Number( token );
        };
        const product = () => {
            let v = factor();
            while ( t[ pos ] === "*" || t[ pos ] === "/" ) {
                const op = t[ pos++ ];
                const rhs = factor();
                v = ( op === "*" ) ? v * rhs : v / rhs;
            }
            return v;
        };
        return product();
    }
    // The size a declaration resolves to, per space-separated term (a dash array has two), at scale u.
    function resolve( value, u ) {
        const terms = [];
        let depth = 0, start = 0;
        for ( let i = 0; i <= value.length; i++ ) {
            if ( value[ i ] === "(" ) { depth += 1; }
            if ( value[ i ] === ")" ) { depth -= 1; }
            if ( ( i === value.length || value[ i ] === " " ) && depth === 0 ) {
                if ( i > start ) { terms.push( value.slice( start, i ) ); }
                start = i + 1;
            }
        }
        return terms.map( ( term ) => {
            const plain = substituteScale( term, u ).replace( /var\((--fs-[a-z0-9]+)\)/g, ( m, name ) => tokens[ name ] ).replace( /calc\(/g, "(" ).replace( /px/g, "" );
            assert.match( plain, /^[\d\s.*/()]+$/, "unexpected term in " + value );
            return Math.round( evaluate( plain ) * 1000 ) / 1000;
        } ).join( " " );
    }
    // selector, property, the size before the measurement existed (viewBox units), the size at u = 1 (pixels).
    const INK = [
        [ ".ti-chart-axis-label", "font-size", "4", "11" ],
        [ ".ti-chart-heat-label", "font-size", "4", "11" ],
        [ ".ti-chart-box-label", "font-size", "4", "11" ],
        [ ".ti-chart-box-ref-label", "font-size", "4", "11" ],
        [ ".ti-chart-bar-label", "font-size", "4", "12" ],
        [ ".ti-chart-bar-value:not([font-size])", "font-size", "4", "11" ],
        [ ".ti-chart-radar-axis-label", "font-size", "3.6", "11" ],
        [ ".ti-chart-line-xlabel", "font-size", "3.2", "11" ],
        [ ".ti-chart-scatter-diag", "stroke-width", "0.5", "1.5" ],
        [ ".ti-chart-scatter-mid", "stroke-width", "0.4", "1" ],
        [ ".ti-chart-scatter-pt", "stroke-width", "0.3", "1" ],
        [ ".ti-chart-heat-cell", "stroke-width", "0.5", "2" ],
        [ ".ti-chart-box-box", "stroke-width", "0.6", "1.5" ],
        [ ".ti-chart-box-median", "stroke-width", "1", "2" ],
        [ ".ti-chart-box-whisker", "stroke-width", "0.5", "1" ],
        [ ".ti-chart-box-cap", "stroke-width", "0.5", "1" ],
        [ ".ti-chart-box-expected", "stroke-width", "0.8", "2" ],
        [ ".ti-chart-box-ref", "stroke-width", "0.5", "1" ],
        [ ".ti-chart-bar-axis", "stroke-width", "0.4", "1" ],
        [ ".ti-chart-radar-ring", "stroke-width", "0.4", "1" ],
        [ ".ti-chart-radar-spoke", "stroke-width", "0.3", "1" ],
        [ ".ti-chart-radar-poly", "stroke-width", "0.8", "2" ],
        [ ".ti-chart-line-axis", "stroke-width", "0.3", "1" ],
        [ ".ti-chart-line-series", "stroke-width", "1", "2" ],
        [ ".ti-chart-line-dot.provisional", "stroke-width", "0.6", "1.5" ],
        [ ".ti-chart-box-mean", "r", "0.9", "3" ],
        [ ".ti-chart-radar-dot", "r", "0.9", "3" ],
        [ ".ti-chart-line-dot", "r", "1.1", "4" ],
        [ ".ti-chart-sparkline .ti-chart-line-dot", "r", "0.8", "2" ],
        [ ".ti-chart-provisional", "stroke-dasharray", "4 3", "4 3" ],
        [ ".ti-chart-scatter-diag", "stroke-dasharray", "2 2", "4 4" ],
        [ ".ti-chart-box-expected", "stroke-dasharray", "2 2", "4 4" ],
        [ ".ti-chart-box-ref", "stroke-dasharray", "3 2", "6 4" ],
        [ ".ti-chart-radar-poly[stroke-dasharray]", "stroke-dasharray", "3 2", "8 6" ],
        [ ".ti-chart-line-series[stroke-dasharray]", "stroke-dasharray", "3 2", "8 6" ]
    ];
    const SIZED = [ "font-size", "stroke-width", "r", "stroke-dasharray" ];
    // The gauge's text and ring are part of the dial and scale with it; stat tiles and legends are HTML.
    const exempt = ( selector ) => /gauge|stat|legend/.test( selector );

    it( "unmeasured, every chart size falls back to exactly its old viewBox-unit value", () => {
        for ( const [ selector, property, unitSize ] of INK ) {
            const decls = rules.get( selector );
            assert.ok( decls && decls[ property ], selector + " { " + property + " } is missing" );
            assert.equal( resolve( decls[ property ], null ), unitSize, selector + " " + property );
        }
    } );

    it( "measured, every chart size is a fixed number of pixels", () => {
        for ( const [ selector, property, , pixels ] of INK ) {
            assert.equal( resolve( rules.get( selector )[ property ], 1 ), pixels, selector + " " + property );
        }
        assert.equal( rules.get( ".ti-chart svg.ti-chart-flow" )[ "--ti-chart-u" ], "1" );   // bars: one unit is one pixel
    } );

    it( "no chart rule sizes ink in bare viewBox units — each one is in the table above", () => {
        const listed = new Set( INK.map( ( [ selector, property ] ) => selector + " | " + property ) );
        for ( const [ selector, decls ] of rules ) {
            if ( exempt( selector ) ) { continue; }
            for ( const property of SIZED ) {
                if ( decls[ property ] === undefined ) { continue; }
                assert.ok( decls[ property ].indexOf( "var(--ti-chart-u" ) >= 0, selector + " { " + property + ": " + decls[ property ] + " } scales with the card" );
                assert.ok( listed.has( selector + " | " + property ), selector + " { " + property + " } is not covered by the fallback table" );
            }
        }
    } );
} );
