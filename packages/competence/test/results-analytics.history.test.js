/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const resultsAnalytics = require( "#results-analytics" );
const configurationLoader = require( "#configuration-loader" );

const READY = configurationLoader.evaluationStatus.READY;
const CLOSED = configurationLoader.evaluationStatus.CLOSED;
const OPEN = configurationLoader.evaluationStatus.OPEN;

describe( "ResultsAnalytics.buildEmployeeHistory (CA-X4)", () => {

    it( "shapes a chronological finalScore line over the reported cycles only", () => {
        const evaluations = [
            { cycleID: "2026-H2", cycleDate: "2026-11-30", status: READY, finalScore: { score: 112, interpretation: "T4" } },
            { cycleID: "2025-H2", cycleDate: "2025-11-30", status: CLOSED, finalScore: { score: 98, interpretation: "T3" } },
            { cycleID: "2026-H1", cycleDate: "2026-05-30", status: OPEN, finalScore: null }   // not reported — excluded
        ];
        const h = resultsAnalytics.instance.buildEmployeeHistory( evaluations );
        assert.equal( h.noHistory, undefined );
        assert.deepEqual( h.history.x.map( ( c ) => c.id ), [ "2025-H2", "2026-H2" ] );      // sorted ascending by cycleDate
        assert.deepEqual( h.history.series[ 0 ].values, [ 98, 112 ] );
        assert.equal( h.history.series[ 0 ].key, "score" );
    } );

    it( "returns noHistory when fewer than two reported cycles exist", () => {
        const evaluations = [
            { cycleID: "2026-H2", cycleDate: "2026-11-30", status: READY, finalScore: { score: 112, interpretation: "T4" } },
            { cycleID: "2026-H1", cycleDate: "2026-05-30", status: OPEN, finalScore: null }
        ];
        assert.deepEqual( resultsAnalytics.instance.buildEmployeeHistory( evaluations ), { noHistory: true } );
    } );

    it( "returns noHistory for empty / missing input", () => {
        assert.deepEqual( resultsAnalytics.instance.buildEmployeeHistory( [] ), { noHistory: true } );
        assert.deepEqual( resultsAnalytics.instance.buildEmployeeHistory( null ), { noHistory: true } );
    } );

} );
