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
