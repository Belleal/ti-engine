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
        const s = TiCharts.normalizeSpec( { type: "heatmap", data: { rows: [] } } );
        assert.equal( s.type, "unsupported" );
        assert.deepEqual( s.data, {} );
    } );
    it( "returns an unsupported spec for null/garbage input", () => {
        assert.equal( TiCharts.normalizeSpec( null ).type, "unsupported" );
        assert.equal( TiCharts.normalizeSpec( 42 ).type, "unsupported" );
    } );
} );
