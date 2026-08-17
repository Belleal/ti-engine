/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Prototype-pollution guard for the in-memory cache test double (CodeQL js/prototype-polluting-assignment, alert
 * #2). deepMerge (reached via editJSON) recursively assigned source keys onto the target; a `__proto__` key would
 * walk into Object.prototype and pollute it process-wide. This is test-only code, but the guard is cheap and clears
 * the alert. JSON.parse is used so `__proto__` is a real own-enumerable key (an object literal would set the
 * prototype instead).
 */

const { describe, it, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { InMemoryCache } = require( "./helpers/in-memory-cache.js" );

describe( "InMemoryCache deepMerge prototype-pollution guard", () => {

    afterEach( () => {
        delete Object.prototype.polluted;
    } );

    it( "does not pollute Object.prototype via a __proto__ key in editJSON", async () => {
        const cache = new InMemoryCache();
        await cache.setJSON( "k", {} );
        await cache.editJSON( "k", JSON.parse( '{"__proto__":{"polluted":"pwned"}}' ) );
        assert.equal( ( {} ).polluted, undefined, "Object.prototype must not be polluted" );
    } );

    it( "does not pollute via a nested constructor.prototype chain in editJSON", async () => {
        const cache = new InMemoryCache();
        await cache.setJSON( "k", {} );
        await cache.editJSON( "k", JSON.parse( '{"constructor":{"prototype":{"polluted":"pwned"}}}' ) );
        assert.equal( ( {} ).polluted, undefined, "Object.prototype must not be polluted" );
    } );

    it( "still merges legitimate keys", async () => {
        const cache = new InMemoryCache();
        await cache.setJSON( "k", { a: 1, nested: { x: 1 } } );
        await cache.editJSON( "k", { b: 2, nested: { y: 2 } } );
        const [ value ] = await cache.getJSON( "k", "$" );
        assert.deepEqual( value, { a: 1, b: 2, nested: { x: 1, y: 2 } } );
    } );

    // N1 (CodeQL js/prototype-polluting-assignment, round-2 finding): setJSON's subpath walk/assignment can be
    // poisoned the same way editJSON's deepMerge can. Unlike deepMerge (which silently skips the poisoned key), a
    // test helper being asked to write to such a path is a test bug — it must reject loudly instead of pretending
    // to succeed.
    it( "rejects a __proto__ path segment passed to setJSON and leaves Object.prototype unaffected", async () => {
        const cache = new InMemoryCache();
        await cache.setJSON( "k", { safe: {} } );
        await assert.rejects( () => cache.setJSON( "k", { polluted: "pwned" }, [ "__proto__", "polluted" ], 1 ) );
        assert.equal( ( {} ).polluted, undefined, "Object.prototype must not be polluted" );
    } );

    it( "rejects a constructor/prototype path segment passed to setJSON and leaves Object.prototype unaffected", async () => {
        const cache = new InMemoryCache();
        await cache.setJSON( "k", { safe: {} } );
        await assert.rejects( () => cache.setJSON( "k", "pwned", [ "safe", "constructor", "prototype", "polluted" ], 1 ) );
        assert.equal( ( {} ).polluted, undefined, "Object.prototype must not be polluted" );
    } );

} );
