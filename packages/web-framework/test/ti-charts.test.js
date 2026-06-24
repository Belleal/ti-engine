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
