/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { deriveStaleExclusions } = require( "#cycle-setup-tools" );

describe( "deriveStaleExclusions", () => {

    it( "flags an excluded family that now has competencies for the cycle", () => {
        const sets = { QE: { baseline: { codes: [ "E1-48", "E1-49" ] } }, XD: { baseline: { codes: [] } } };
        assert.deepEqual( deriveStaleExclusions( [ "QE", "XD" ], sets ), [ "QE" ] );
    } );

    it( "ignores an excluded family that is still empty", () => {
        assert.deepEqual( deriveStaleExclusions( [ "XD" ], { XD: { baseline: { codes: [] } } } ), [] );
    } );

    it( "ignores a family that is not excluded", () => {
        assert.deepEqual( deriveStaleExclusions( [], { SE: { baseline: { codes: [ "E1-1" ] } } } ), [] );
    } );

    it( "counts codes in a specialization, not only the baseline", () => {
        const sets = { QE: { baseline: { codes: [] }, AUTOMATION: { codes: [ "E1-55" ] } } };
        assert.deepEqual( deriveStaleExclusions( [ "QE" ], sets ), [ "QE" ] );
    } );

    it( "tolerates a missing or malformed sets entry", () => {
        assert.deepEqual( deriveStaleExclusions( [ "QE" ], {} ), [] );
        assert.deepEqual( deriveStaleExclusions( null, null ), [] );
    } );

} );
