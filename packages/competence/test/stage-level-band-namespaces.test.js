/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Namespace guard: a stage sub-level and a performance band must never share a token (CA-111).
 *
 * They did. `T1`..`T5` were the performance-threshold bands while `T1` was also the Team Lead stage sub-level, and
 * both meanings lived in results-analytics.js a few lines apart. That was survivable only because nothing crossed
 * the two namespaces; adding `T2` as a Head-of-Department sub-level would have made the SAME token mean
 * "Head of Department" and "performance band 2" in one file. The bands were renamed to `P1`..`P5`.
 *
 * This test exists so the collision cannot come back quietly — from a new stage letter, a sixth band, or a rename
 * in either direction.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const configurationLoader = require( "#configuration-loader" );

describe( "Stage sub-levels and performance bands occupy separate namespaces", () => {

    it( "shares no token between the two vocabularies", () => {
        const stageLevels = configurationLoader.getArchetypeStageLevels();
        const bands = Object.keys( configurationLoader.performanceThreshold ).filter( ( k ) => /^[A-Z]\d+$/.test( k ) );
        assert.ok( stageLevels.length > 0, "the stage ladder must produce sub-levels" );
        assert.ok( bands.length > 0, "the threshold enum must expose bands" );

        const shared = stageLevels.filter( ( level ) => bands.includes( level ) );
        assert.deepEqual( shared, [], `these tokens mean two different things: ${ shared.join( ", " ) }` );
    } );

    it( "keeps the two vocabularies on different letters entirely", () => {
        // Stronger than the overlap check: even a non-overlapping T3 band would be confusing next to T1/T2
        // sub-levels, so the letter itself must not be reused.
        const stageLetters = new Set( configurationLoader.getArchetypeStageLevels().map( ( l ) => l.replace( /\d+$/, "" ) ) );
        const bandLetters = new Set( Object.keys( configurationLoader.performanceThreshold )
            .filter( ( k ) => /^[A-Z]\d+$/.test( k ) ).map( ( b ) => b.replace( /\d+$/, "" ) ) );
        const overlap = [ ...bandLetters ].filter( ( letter ) => stageLetters.has( letter ) );
        assert.deepEqual( overlap, [], `letter reused across both vocabularies: ${ overlap.join( ", " ) }` );
    } );

} );
