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
