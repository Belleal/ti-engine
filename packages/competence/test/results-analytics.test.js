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

describe( "ResultsAnalytics — module shape", () => {

    it( "exports a frozen singleton instance", () => {
        assert.ok( resultsAnalytics.instance, "expected an exported instance" );
        assert.equal( Object.isFrozen( resultsAnalytics.instance ), true );
    } );

    it( "returns the same instance on re-require (singleton)", () => {
        const again = require( "#results-analytics" );
        assert.equal( again.instance, resultsAnalytics.instance );
    } );

} );
