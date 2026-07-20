/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Prototype-pollution guard for employee-update field paths (CodeQL js/prototype-pollution-utility, alerts #3/#4).
 *
 * #setFieldByPath / #getFieldByPath walk a dotted path taken straight from the employee-update request body
 * (Object.entries(params.fields)). For a MANAGER the path is constrained to a constant allowlist, but for a
 * SUPERVISOR #assertEditableField is a no-op, so an authenticated supervisor could submit `__proto__.x` or
 * `constructor.prototype.x` and pollute the global Object.prototype for the whole process. assertSafeFieldPath is
 * the shared guard both accessors call before touching the object; these tests pin its behavior.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { assertSafeFieldPath } = require( "../bin/competence-web-application.js" );

describe( "assertSafeFieldPath (employee field-path prototype-pollution guard)", () => {

    it( "accepts legitimate employee field paths", () => {
        assert.doesNotThrow( () => assertSafeFieldPath( "career.specialization" ) );
        assert.doesNotThrow( () => assertSafeFieldPath( "email" ) );
        assert.doesNotThrow( () => assertSafeFieldPath( "personal.birthDate" ) );
        assert.doesNotThrow( () => assertSafeFieldPath( "personal.gender" ) );
        assert.doesNotThrow( () => assertSafeFieldPath( "career.startingDate" ) );
    } );

    it( "rejects a __proto__ path segment", () => {
        assert.throws( () => assertSafeFieldPath( "__proto__.polluted" ) );
        assert.throws( () => assertSafeFieldPath( "__proto__" ) );
    } );

    it( "rejects a constructor.prototype path chain", () => {
        assert.throws( () => assertSafeFieldPath( "constructor.prototype.polluted" ) );
    } );

    it( "rejects a `prototype` segment anywhere in the path", () => {
        assert.throws( () => assertSafeFieldPath( "career.prototype.x" ) );
    } );

    it( "does not leave Object.prototype polluted after rejecting a hostile path", () => {
        try {
            assertSafeFieldPath( "__proto__.polluted" );
        } catch {
            // expected
        }
        assert.equal( ( {} ).polluted, undefined );
        delete Object.prototype.polluted;
    } );

} );
